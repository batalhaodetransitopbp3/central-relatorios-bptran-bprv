'use strict';
/*
 * R258 — Google Apps Script V8 native DriveApp / SpreadsheetApp candidate.
 *
 * DO NOT deploy. Native APIs are invoked only through injected services,
 * and there is NO HTTP handler, login, identity authority, or migration here.
 * The only authoritative ledger is an append-only, HMAC-chained single sheet.
 * Drive holds JPEG originals in a private, separately provisioned folder.
 *
 * This is an alternative provider adapter for R252/R239, not a replacement
 * for institutional personal authentication or approval of R163 release gate.
 */
var R258BoGasPrivateStorage=(function(){
 const HEADER=Object.freeze(['seq','kind','event_id','object_key','payload_b64',
  'payload_sha256','prev_hmac','row_hmac','recorded_at']);
 const MAX_ROWS=12000,MAX_JPEG=2*1024*1024;
 const FILE_PREFIX='R258PRIVATE:';
 const RX_NAME=/^BO_[A-Za-z0-9_-]+_[A-Za-z0-9-]{6,100}_post-[A-Za-z0-9-]{12,110}\.jpg$/;
 const RX_EVENT=/^[a-zA-Z0-9_:.-]{10,200}$/;
 const RX_ID=/^post-[a-zA-Z0-9-]{12,110}$/;
 const RX_PHOTO=/^[a-zA-Z0-9-]{6,100}$/;
 const RX_SHA=/^[a-f0-9]{64}$/;
 function deny(code){const e=new Error('R258_'+code);e.code=code;throw e}
 function guard(ok,code){if(!ok)deny(code)}
 function safeString(x,max){return typeof x==='string'&&x.length>0&&x.length<=max}
 function hex(bytes){
  return Array.from(bytes).map(x=>((x+256)%256).toString(16).padStart(2,'0')).join('');
 }
 function create({config,services,now}={}){
  const s=services||{},c=config||{};
  guard(c.mode==='ISOLATED_HOMOLOGATION'&&
   typeof c.folderId==='string'&&/^[\w-]{12,180}$/.test(c.folderId)&&
   typeof c.spreadsheetId==='string'&&/^[\w-]{12,180}$/.test(c.spreadsheetId)&&
   c.sheetName==='BO_PHOTO_LEDGER_R258'&&
   typeof c.hmacKey==='string'&&c.hmacKey.length>=32&&
   c.folderId!==c.spreadsheetId,'ISOLATED_CONFIG_REQUIRED');
  for(const n of ['DriveApp','SpreadsheetApp','LockService','Utilities']){
   guard(!!s[n],'GAS_SERVICE_MISSING_'+n);
  }
  guard(typeof now==='function','CLOCK_REQUIRED');
  const drive=s.DriveApp,spreadsheet=s.SpreadsheetApp,
    locks=s.LockService,u=s.Utilities;
  guard(drive.Access&&drive.Access.PRIVATE&&u.DigestAlgorithm&&u.DigestAlgorithm.SHA_256,
   'GAS_SECURITY_SERVICES_INCOMPLETE');
  const folder=drive.getFolderById(c.folderId);
  const ledgerFile=drive.getFileById(c.spreadsheetId);
  const book=spreadsheet.openById(c.spreadsheetId);
  guard(folder&&ledgerFile&&book,'PRIVATE_RESOURCES_NOT_FOUND');
  const sheet=book.getSheetByName(c.sheetName);
  guard(sheet,'LEDGER_SHEET_NOT_PROVISIONED');
  function time(){
   const iso=now();
   guard(typeof iso==='string'&&Number.isFinite(Date.parse(iso)),'CLOCK_INVALID');
   return iso;
  }
  function bytes(value){return u.newBlob(value).getBytes()}
  const keyBytes=bytes(c.hmacKey);
  function sha(value){
   // GAS byte arrays are signed (-128..127), while the R239 engine expects
   // unsigned JPEG bytes (0..255). Normalize before entering GAS crypto.
   const b=typeof value==='string'?value:
    Array.from(value).map(x=>((x+256)%256)>127?((x+256)%256)-256:((x+256)%256));
   return hex(u.computeDigest(u.DigestAlgorithm.SHA_256,b));
  }
  function mac(value){
   return hex(u.computeHmacSha256Signature(value,keyBytes));
  }
  function encoded(object){
   return u.base64EncodeWebSafe(bytes(JSON.stringify(object)));
  }
  function decoded(value){
   guard(typeof value==='string'&&/^[A-Za-z0-9_-]+={0,2}$/.test(value),
    'LEDGER_BASE64_INVALID');
   try{return JSON.parse(u.newBlob(u.base64DecodeWebSafe(value)).getDataAsString('UTF-8'))}
   catch(_){deny('LEDGER_JSON_INVALID')}
  }
  function assertPrivate(){
   guard(folder.getSharingAccess()===drive.Access.PRIVATE,
    'PRIVATE_FOLDER_GENERAL_ACCESS_REQUIRED');
   guard(ledgerFile.getSharingAccess()===drive.Access.PRIVATE,
    'PRIVATE_LEDGER_GENERAL_ACCESS_REQUIRED');
  }
  function checkHeader(){
   const h=sheet.getRange(1,1,1,HEADER.length).getValues()[0];
   guard(JSON.stringify(h)===JSON.stringify(HEADER),'LEDGER_HEADER_MISMATCH');
  }
  function scan(){
   assertPrivate();checkHeader();
   const end=sheet.getLastRow();
   guard(Number.isInteger(end)&&end>=1&&end<=MAX_ROWS+1,'LEDGER_ROW_LIMIT_OR_INVALID');
   const items=end===1?[]:sheet.getRange(2,1,end-1,HEADER.length).getValues();
   const requests=new Map(),photos=new Map(),positions=new Map();
   let tip='GENESIS';
   for(let i=0;i<items.length;i++){
    const cells=items[i];
    guard(Array.isArray(cells)&&cells.length===HEADER.length,'LEDGER_ROW_SHAPE_INVALID');
    const [seq,kind,ev,key,payload,digest,prior,tag,stamp]=cells;
    guard(seq===i+1,'LEDGER_SEQUENCE_GAP_OR_DUPLICATE');
    guard(kind==='REQUEST'||kind==='PHOTO','LEDGER_KIND_INVALID');
    guard(RX_EVENT.test(ev)&&safeString(key,220),'LEDGER_KEY_INVALID');
    guard(prior===tip&&RX_SHA.test(tag),'LEDGER_CHAIN_BROKEN');
    const obj=decoded(payload);
    const json=JSON.stringify(obj);
    guard(sha(bytes(json))===digest,'LEDGER_PAYLOAD_DIGEST_MISMATCH');
    const message=JSON.stringify([seq,kind,ev,key,payload,digest,prior,stamp]);
    guard(mac(message)===tag,'LEDGER_HMAC_INVALID');
    guard(typeof stamp==='string'&&Number.isFinite(Date.parse(stamp)),'LEDGER_TIMESTAMP_INVALID');
    if(kind==='REQUEST'){
     guard(obj&&obj.requestId===key&&obj.eventId===ev&&
      RX_ID.test(obj.requestId)&&RX_SHA.test(obj.digest||'')&&
      ['PENDING','FILE_STORED','COMMITTED'].includes(obj.status),
      'LEDGER_REQUEST_RECORD_INVALID');
     const old=requests.get(key);
     if(old){
      const immutable=['requestId','eventId','photoId','position','digest',
       'caption','stableName','actorMatricula','createdAt'];
      guard(immutable.every(k=>old[k]===obj[k]),'LEDGER_REQUEST_CHANGED_IDENTITY');
      const order={PENDING:0,FILE_STORED:1,COMMITTED:2};
      guard(order[obj.status]===order[old.status]+1,'LEDGER_REQUEST_TRANSITION_INVALID');
     }else guard(obj.status==='PENDING','LEDGER_REQUEST_MUST_START_PENDING');
     requests.set(key,obj);
    }else{
     guard(obj&&obj.eventId===ev&&obj.photoId===key&&
      RX_PHOTO.test(obj.photoId||'')&&RX_SHA.test(obj.digest||'')&&Number.isInteger(obj.position)&&
      obj.position>=1&&obj.position<=96,
      'LEDGER_PHOTO_RECORD_INVALID');
     const full=ev+':'+key,slot=ev+':'+obj.position;
     guard(!photos.has(full)&&!positions.has(slot),'LEDGER_PHOTO_DUPLICATE');
     photos.set(full,obj);positions.set(slot,true);
    }
    tip=tag;
   }
   return {requests,photos,positions,tip,count:items.length};
  }
  let held=false;
  async function withExclusiveLock(lockKey,fn){
   guard(typeof lockKey==='string'&&lockKey.startsWith('r239:')&&
    typeof fn==='function','LOCK_ARGUMENT_INVALID');
   guard(!held,'NESTED_LOCK_FORBIDDEN');
   const l=locks.getScriptLock();
   guard(!!l&&typeof l.tryLock==='function'&&
    l.tryLock(30000)===true,'SCRIPT_LOCK_UNAVAILABLE');
   held=true;
   try{
    assertPrivate();
    const answer=await fn();
    spreadsheet.flush();
    return answer;
   }finally{
    held=false;
    l.releaseLock();
   }
  }
  function assertHeld(){guard(held,'WRITE_REQUIRES_SCRIPT_LOCK')}
  function append(kind,ev,key,obj,prior){
   assertHeld();checkHeader();
   const last=sheet.getLastRow();
   guard(last<=MAX_ROWS,'LEDGER_CAPACITY_REACHED');
   const seq=last;
   const payload=encoded(obj);
   const digest=sha(bytes(JSON.stringify(obj)));
   const stamp=time();
   const tag=mac(JSON.stringify([seq,kind,ev,key,payload,digest,prior,stamp]));
   const row=[seq,kind,ev,key,payload,digest,prior,tag,stamp];
   sheet.getRange(last+1,1,1,HEADER.length).setValues([row]);
   spreadsheet.flush();
   const after=scan();
   guard(after.tip===tag&&after.count===seq,'LEDGER_APPEND_VERIFICATION_FAILED');
  }
  function requestShape(r){
   guard(r&&RX_ID.test(r.requestId||'')&&RX_EVENT.test(r.eventId||'')&&
    RX_PHOTO.test(r.photoId||'')&&Number.isInteger(r.position)&&
    r.position>=1&&r.position<=96&&RX_SHA.test(r.digest||'')&&
    RX_NAME.test(r.stableName||'')&&safeString(r.actorMatricula,25)&&
    typeof r.caption==='string'&&r.caption.length<=220&&
    ['PENDING','FILE_STORED','COMMITTED'].includes(r.status),
    'REQUEST_INPUT_INVALID');
  }
  function photoShape(p){
   guard(p&&RX_EVENT.test(p.eventId||'')&&RX_PHOTO.test(p.photoId||'')&&
    RX_ID.test(p.requestId||'')&&Number.isInteger(p.position)&&
    p.position>=1&&p.position<=96&&RX_SHA.test(p.digest||'')&&
    safeString(p.fileId,160)&&safeString(p.createdBy,25),
    'PHOTO_INPUT_INVALID');
  }
  function getRequest(id){
   guard(RX_ID.test(id||''),'REQUEST_ID_INVALID');
   return scan().requests.get(id)||null;
  }
  function getPhoto(eventId,photoId){
   guard(RX_EVENT.test(eventId||'')&&safeString(photoId,100),'PHOTO_LOOKUP_INVALID');
   return scan().photos.get(eventId+':'+photoId)||null;
  }
  function listPhotos(eventId){
   guard(RX_EVENT.test(eventId||''),'EVENT_ID_INVALID');
   return [...scan().photos.values()].filter(p=>p.eventId===eventId)
    .sort((a,b)=>a.position-b.position);
  }
  function putRequest(r){
   assertHeld();requestShape(r);
   const ledger=scan(),old=ledger.requests.get(r.requestId);
   if(old){
    const identity=['requestId','eventId','photoId','position','digest',
     'caption','stableName','actorMatricula','createdAt'];
    guard(identity.every(k=>old[k]===r[k]),'REQUEST_IMMUTABLE_FIELDS_MISMATCH');
    if(old.status===r.status){
     guard(JSON.stringify(old)===JSON.stringify(r),'REQUEST_REPLAY_CONTENT_CHANGED');
     return;
    }
    const next={PENDING:'FILE_STORED',FILE_STORED:'COMMITTED'};
    guard(next[old.status]===r.status,'REQUEST_STATUS_TRANSITION_INVALID');
   }else guard(r.status==='PENDING','REQUEST_MUST_START_PENDING');
   if(r.status==='COMMITTED'){
    const p=ledger.photos.get(r.eventId+':'+r.photoId);
    guard(p&&p.requestId===r.requestId&&p.digest===r.digest&&
     p.position===r.position&&p.createdBy===r.actorMatricula,
     'COMMIT_PHOTO_LEDGER_MISMATCH');
   }
   append('REQUEST',r.eventId,r.requestId,r,ledger.tip);
  }
  function putPhoto(p){
   assertHeld();photoShape(p);
   const ledger=scan();
   const old=ledger.photos.get(p.eventId+':'+p.photoId);
   if(old){
    guard(JSON.stringify(old)===JSON.stringify(p),'PHOTO_IMMUTABLE_MISMATCH');
    return;
   }
   guard(!ledger.positions.has(p.eventId+':'+p.position),
    'PHOTO_POSITION_OCCUPIED');
   const r=ledger.requests.get(p.requestId);
   guard(r&&r.status==='FILE_STORED'&&r.eventId===p.eventId&&
    r.photoId===p.photoId&&r.position===p.position&&r.digest===p.digest&&
    r.actorMatricula===p.createdBy&&r.fileId===p.fileId,
    'PHOTO_HAS_NO_MATCHING_STORED_REQUEST');
   append('PHOTO',p.eventId,p.photoId,p,ledger.tip);
  }
  function findUnique(name){
   guard(RX_NAME.test(name||''),'PRIVATE_FILE_NAME_INVALID');
   assertPrivate();
   const iterator=folder.getFilesByName(name);
   if(!iterator.hasNext())return null;
   const file=iterator.next();
   guard(!iterator.hasNext(),'DUPLICATE_PRIVATE_FILE_NAME');
   return file;
  }
  function verifyFile(file,name){
   assertPrivate();
   guard(file.getName()===name&&file.getMimeType()==='image/jpeg'&&
    file.getSharingAccess()===drive.Access.PRIVATE,'PRIVATE_FILE_POLICY_FAILED');
   const content=file.getBlob().getBytes();
   guard(content&&content.length>10&&content.length<=MAX_JPEG&&
    ((content[0]+256)%256)===255&&((content[1]+256)%256)===216&&
    ((content[content.length-2]+256)%256)===255&&
    ((content[content.length-1]+256)%256)===217,
    'PRIVATE_FILE_JPEG_SIGNATURE_INVALID');
   let desc;
   try{
    const value=file.getDescription();
    guard(typeof value==='string'&&value.startsWith(FILE_PREFIX),
     'PRIVATE_FILE_DESCRIPTION_MISSING');
    desc=JSON.parse(value.slice(FILE_PREFIX.length));
   }catch(e){if(e.code)throw e;deny('PRIVATE_FILE_DESCRIPTION_INVALID')}
   guard(desc&&desc.stableName===name&&RX_EVENT.test(desc.eventId||'')&&
    RX_SHA.test(desc.digest||'')&&
    sha(content)===desc.digest&&
    Number(file.getSize())===content.length,'PRIVATE_FILE_INTEGRITY_FAILED');
   return {fileId:file.getId(),digest:desc.digest,eventId:desc.eventId};
  }
  function findFileByStableName(name){
   const f=findUnique(name);
   return f?verifyFile(f,name):null;
  }
  function writePrivateFile(item){
   assertHeld();assertPrivate();
   guard(item&&RX_NAME.test(item.stableName||'')&&
    RX_EVENT.test(item.eventId||'')&&
    RX_SHA.test(item.digest||'')&&
    item.mime==='image/jpeg'&&
    safeString(item.ownerMatricula,25),'PRIVATE_UPLOAD_INVALID');
   const b=item.bytes;
   guard(b&&b.length>10&&b.length<=MAX_JPEG&&
    ((b[0]+256)%256)===255&&((b[1]+256)%256)===216&&
    ((b[b.length-2]+256)%256)===255&&((b[b.length-1]+256)%256)===217&&
    sha(b)===item.digest,'PRIVATE_UPLOAD_JPEG_INVALID');
   const already=findUnique(item.stableName);
   if(already){
    const found=verifyFile(already,item.stableName);
    guard(found.digest===item.digest&&found.eventId===item.eventId,
     'PRIVATE_UPLOAD_NAME_COLLISION');
    return found;
   }
   const signedBytes=Array.from(b).map(x=>((x+256)%256)>127?((x+256)%256)-256:((x+256)%256));
   const file=folder.createFile(u.newBlob(signedBytes,'image/jpeg',item.stableName));
   // If file creation succeeds but metadata cannot be set, fail closed:
   // never blindly reassign a Drive file whose provenance is unknown.
   file.setDescription(FILE_PREFIX+JSON.stringify({
    stableName:item.stableName,eventId:item.eventId,digest:item.digest,
    ownerMatricula:item.ownerMatricula
   }));
   return verifyFile(file,item.stableName);
  }
  function digest(b){return sha(b)}
  function jpeg(b64){
   return Array.from(u.base64Decode(b64)).map(x=>(x+256)%256);
  }
  function notConfigured(){deny('PERSONAL_IDENTITY_AND_EVENT_AUTHORITY_REQUIRED')}
  function noDeletion(){deny('DELETION_REQUIRES_CUSTODY_APPROVAL')}
  return Object.freeze({
   now:time,decodeJpeg:jpeg,sha256:digest,
   authenticate:notConfigured,getEvent:notConfigured,
   withExclusiveLock,getRequest,getPhoto,listPhotos,putRequest,putPhoto,
   findFileByStableName,writePrivateFile,deletePrivateFile:noDeletion,
   verifyLedger:()=>({ok:true,events:scan().count,tip:scan().tip}),
   releaseAllowed:false
  });
 }
 return Object.freeze({create,HEADER,releaseAllowed:false});
})();
if(typeof module==='object'&&module.exports)module.exports=R258BoGasPrivateStorage;
