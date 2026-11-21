'use strict';
/*
 * R256: local, persistent R252 photo adapter, not a production custodian.
 * - SQLite WAL for requests/photo metadata and audit chain.
 * - BEGIN IMMEDIATE per operation: serializes R252 writes across processes.
 * - AES-256-GCM encrypted private JPEGs, atomic no-clobber hard-link finalizing.
 * - Deterministic blob name so a crash before DB commit is recoverable.
 * No Drive, no Sheets, no public JPEG read endpoint, no user identity adapter.
 */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const MAGIC=Buffer.from('BOPHOTO1');
const MAX_BLOB_BYTES=3*1024*1024;
// Prevent synchronous SQLite busy-wait from blocking another writer on the
// same Node event loop; SQLite BEGIN IMMEDIATE handles other OS processes.
const localWriteQueues=new Map();
function deny(code){const e=new Error('R256_'+code);e.code=code;throw e}
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
function safeName(x){
 if(typeof x!=='string'||x.length>400||
    !/^BO_[a-zA-Z0-9_-]+_[a-z0-9-]{6,100}_post-[a-z0-9-]{12,110}\.jpg$/i.test(x))
   deny('INVALID_STABLE_NAME');
 return x;
}
function nowMs(f){
 const ms=Date.parse(f());
 if(!Number.isSafeInteger(ms))deny('INVALID_CLOCK');
 return ms;
}
function create({dbPath,photoDirectory,encryptionKey,auditKey,now,hooks={}}={}){
 if(typeof dbPath!=='string'||!dbPath||typeof photoDirectory!=='string'||!photoDirectory||
   !Buffer.isBuffer(encryptionKey)||encryptionKey.length!==32||
   !Buffer.isBuffer(auditKey)||auditKey.length!==32||
   typeof now!=='function')deny('CONFIG_INVALID');
 if(crypto.timingSafeEqual(encryptionKey,auditKey))deny('KEY_SEPARATION_REQUIRED');
 if(!fs.existsSync(photoDirectory))fs.mkdirSync(photoDirectory,{recursive:true,mode:0o700});
 const dataKey=Buffer.from(encryptionKey),macKey=Buffer.from(auditKey);
 const db=new DatabaseSync(dbPath,{timeout:5000});
 db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;');
 db.exec(`CREATE TABLE IF NOT EXISTS bo_photo_requests(
   request_id TEXT PRIMARY KEY,
   event_id TEXT NOT NULL, data_json TEXT NOT NULL,
   status TEXT NOT NULL CHECK(status IN ('PENDING','FILE_STORED','COMMITTED'))
 );
 CREATE TABLE IF NOT EXISTS bo_photo_items(
   event_id TEXT NOT NULL, photo_id TEXT NOT NULL, position INTEGER NOT NULL,
   data_json TEXT NOT NULL,
   PRIMARY KEY(event_id,photo_id),UNIQUE(event_id,position)
 );
 CREATE TABLE IF NOT EXISTS bo_photo_audit(
   sequence INTEGER PRIMARY KEY AUTOINCREMENT,
   operation TEXT NOT NULL, reference TEXT NOT NULL, timestamp TEXT NOT NULL,
   item_digest TEXT NOT NULL, previous_tag TEXT NOT NULL, tag TEXT NOT NULL
 );`);
 const selectRequest=db.prepare('SELECT data_json FROM bo_photo_requests WHERE request_id=?');
 const selectPhoto=db.prepare('SELECT data_json FROM bo_photo_items WHERE event_id=? AND photo_id=?');
 const listPhotosQuery=db.prepare('SELECT data_json FROM bo_photo_items WHERE event_id=? ORDER BY position');
 const writeRequest=db.prepare(`INSERT INTO bo_photo_requests
  (request_id,event_id,data_json,status) VALUES(?,?,?,?)
  ON CONFLICT(request_id) DO UPDATE SET
  data_json=excluded.data_json,status=excluded.status`);
 const writePhoto=db.prepare(`INSERT INTO bo_photo_items
  (event_id,photo_id,position,data_json) VALUES(?,?,?,?)
  ON CONFLICT(event_id,photo_id) DO UPDATE SET
  data_json=excluded.data_json`);
 const lastAudit=db.prepare('SELECT tag FROM bo_photo_audit ORDER BY sequence DESC LIMIT 1');
 const allAudit=db.prepare('SELECT * FROM bo_photo_audit ORDER BY sequence');
 const lastAuditFor=db.prepare('SELECT item_digest FROM bo_photo_audit WHERE reference=? AND operation=? ORDER BY sequence DESC LIMIT 1');
 const addAudit=db.prepare(`INSERT INTO bo_photo_audit
  (operation,reference,timestamp,item_digest,previous_tag,tag) VALUES(?,?,?,?,?,?)`);
 const parsed=row=>row?JSON.parse(row.data_json):null;
 let locked=false;
 function audit(operation,reference,value){
  const ts=now();
  const itemDigest=sha(JSON.stringify(value));
  const prev=(lastAudit.get()||{}).tag||'GENESIS';
  const message=[prev,operation,reference,ts,itemDigest].join('\n');
  const tag=crypto.createHmac('sha256',macKey).update(message).digest('hex');
  addAudit.run(operation,reference,ts,itemDigest,prev,tag);
 }
 function blobPath(stableName){
  return path.join(photoDirectory,sha(safeName(stableName))+'.enc');
 }
 function encodePrivate(item){
  const bytes=Buffer.from(item.bytes||[]);
  if(bytes.length<11||bytes.length>2*1024*1024||
     bytes[0]!==255||bytes[1]!==216||bytes.at(-2)!==255||bytes.at(-1)!==217)
   deny('INVALID_JPEG_BYTES');
  if(sha(bytes)!==item.digest)deny('JPEG_HASH_MISMATCH');
  const packed={stableName:item.stableName,eventId:item.eventId,
    digest:item.digest,bytes:bytes.toString('base64'),
    ownerMatricula:item.ownerMatricula};
  const iv=crypto.randomBytes(12);
  const enc=crypto.createCipheriv('aes-256-gcm',dataKey,iv);
  enc.setAAD(MAGIC);
  const ciphertext=Buffer.concat([enc.update(Buffer.from(JSON.stringify(packed),'utf8')),enc.final()]);
  return Buffer.concat([MAGIC,iv,enc.getAuthTag(),ciphertext]);
 }
 function inspectEncryptedBlob(location){
  const raw=fs.readFileSync(location);
  if(raw.length<MAGIC.length+12+16+4||raw.length>MAX_BLOB_BYTES||
     !raw.subarray(0,MAGIC.length).equals(MAGIC))deny('INVALID_ENCRYPTED_BLOB');
  const iv=raw.subarray(8,20),tag=raw.subarray(20,36);
  const dec=crypto.createDecipheriv('aes-256-gcm',dataKey,iv);
  dec.setAAD(MAGIC);dec.setAuthTag(tag);
  let item;
  try{
   item=JSON.parse(Buffer.concat([dec.update(raw.subarray(36)),dec.final()]).toString('utf8'));
  }catch(_){deny('ENCRYPTED_BLOB_AUTHENTICATION_FAILED')}
  if(!item||typeof item.stableName!=='string'||
     !/^[a-f0-9]{64}$/.test(item.digest||'')||
     typeof item.eventId!=='string'||typeof item.bytes!=='string')
   deny('INVALID_BLOB_METADATA');
  const jpeg=Buffer.from(item.bytes,'base64');
  if(sha(jpeg)!==item.digest)deny('ENCRYPTED_BLOB_DIGEST_MISMATCH');
  if(path.basename(location)!==sha(safeName(item.stableName))+'.enc')
   deny('PRIVATE_BLOB_FILENAME_MISMATCH');
  return item;
 }
 function decodePrivate(stableName){
  const location=blobPath(stableName);
  if(!fs.existsSync(location))return null;
  const item=inspectEncryptedBlob(location);
  if(item.stableName!==stableName)deny('PRIVATE_BLOB_NAME_MISMATCH');
  return {fileId:'local-'+sha(stableName).slice(0,52),
    digest:item.digest,eventId:item.eventId,stableName};
 }
 async function withExclusiveLock(key,fn){
  if(typeof key!=='string'||!key.startsWith('r239:')||typeof fn!=='function')
   deny('LOCK_INVALID');
  const queueKey=path.resolve(dbPath);
  const prior=localWriteQueues.get(queueKey)||Promise.resolve();
  let release;
  const held=new Promise(resolve=>{release=resolve});
  localWriteQueues.set(queueKey,held);
  await prior;
  try{
   if(locked)deny('NESTED_LOCK_UNSUPPORTED');
   // BEGIN IMMEDIATE serializes writers across OS processes.
   db.exec('BEGIN IMMEDIATE');locked=true;
   try{
    const out=await fn();
    db.exec('COMMIT');return out;
   }catch(err){
    if(db.isTransaction)db.exec('ROLLBACK');
    throw err;
   }finally{locked=false}
  }finally{
   if(localWriteQueues.get(queueKey)===held)localWriteQueues.delete(queueKey);
   release();
  }
 }
 function requireLocked(){
  if(!locked||!db.isTransaction)deny('METADATA_WRITE_REQUIRES_LOCK');
 }
 function putRequest(row){
  requireLocked();
  if(!row||!row.requestId||!row.eventId||
    !['PENDING','FILE_STORED','COMMITTED'].includes(row.status))
    deny('REQUEST_ROW_INVALID');
  const original=parsed(selectRequest.get(row.requestId));
  const order={PENDING:0,FILE_STORED:1,COMMITTED:2};
  if(original){
   const columns=['requestId','eventId','photoId','position','digest','caption','stableName','actorMatricula'];
   if(columns.some(k=>original[k]!==row[k])||
      order[row.status]<order[original.status])
     deny('REQUEST_LEDGER_INVARIANT_FAILED');
  }
  const record=JSON.parse(JSON.stringify(row));
  writeRequest.run(row.requestId,row.eventId,JSON.stringify(record),row.status);
  audit('REQUEST_'+row.status,row.requestId,record);
 }
 function putPhoto(row){
  requireLocked();
  if(!row||!row.eventId||!row.photoId||!Number.isInteger(row.position))
   deny('PHOTO_ROW_INVALID');
  const old=parsed(selectPhoto.get(row.eventId,row.photoId));
  if(old&&JSON.stringify(old)!==JSON.stringify(row))
   deny('PHOTO_LEDGER_IMMUTABLE');
  const record=JSON.parse(JSON.stringify(row));
  writePhoto.run(row.eventId,row.photoId,row.position,JSON.stringify(record));
  audit('PHOTO_UPSERT',row.eventId+':'+row.photoId,record);
 }
 function writePrivateFile(item){
  requireLocked();
  if(!item||typeof item.eventId!=='string')deny('PRIVATE_FILE_INPUT_INVALID');
  const full=blobPath(item.stableName);
  const existing=decodePrivate(item.stableName);
  if(existing){
   if(existing.digest!==item.digest||existing.eventId!==item.eventId)
    deny('PRIVATE_FILE_COLLISION');
   return existing;
  }
  const sealed=encodePrivate(item);
  const tmp=full+'.tmp-'+crypto.randomBytes(12).toString('hex');
  let fd;
  try{
   fd=fs.openSync(tmp,'wx',0o600);
   fs.writeFileSync(fd,sealed);fs.fsyncSync(fd);fs.closeSync(fd);fd=null;
   // Crash-safe: publish fully written file without replacing existing one.
   try{fs.linkSync(tmp,full)}
   catch(err){if(err.code!=='EEXIST')throw err}
   if(typeof hooks.afterBlobPublished==='function')hooks.afterBlobPublished();
  }finally{
   if(fd!==undefined&&fd!==null)fs.closeSync(fd);
   try{fs.unlinkSync(tmp)}catch(_){}
  }
  const saved=decodePrivate(item.stableName);
  if(!saved||saved.digest!==item.digest||saved.eventId!==item.eventId)
   deny('PRIVATE_FILE_VERIFY_FAILED');
  return saved;
 }
 function verifyAuditChain(){
  let previous='GENESIS',count=0;
  for(const record of allAudit.all()){
   if(record.previous_tag!==previous)return {ok:false,verified:count};
   const message=[previous,record.operation,record.reference,
    record.timestamp,record.item_digest].join('\n');
   const wanted=crypto.createHmac('sha256',macKey).update(message).digest('hex');
   if(wanted!==record.tag)return {ok:false,verified:count};
   previous=record.tag;count++;
  }
  return {ok:true,verified:count,tip:previous};
 }
 function reconcile(){
  const problems=[];
  const knownBlobNames=new Set();
  for(const r of db.prepare('SELECT data_json FROM bo_photo_requests').all()){
   const request=JSON.parse(r.data_json);
   if(request.stableName)knownBlobNames.add(request.stableName);
   if(request.status!=='COMMITTED')problems.push({kind:'INCOMPLETE_REQUEST',requestId:request.requestId});
   if(request.status==='COMMITTED'){
    const original=decodePrivate(request.stableName);
    if(!original)problems.push({kind:'MISSING_PRIVATE_BLOB',requestId:request.requestId});
    else if(original.digest!==request.digest||original.eventId!==request.eventId)
     problems.push({kind:'REQUEST_BLOB_MISMATCH',requestId:request.requestId});
    const photo=parsed(selectPhoto.get(request.eventId,request.photoId));
    if(!photo)problems.push({kind:'COMMITTED_REQUEST_WITHOUT_PHOTO',requestId:request.requestId});
   }
   const last=lastAuditFor.get(request.requestId,'REQUEST_'+request.status);
   if(!last||last.item_digest!==sha(JSON.stringify(request)))
    problems.push({kind:'REQUEST_CONTENT_DIFFERS_FROM_AUDIT',requestId:request.requestId});
  }
  for(const p of db.prepare('SELECT data_json FROM bo_photo_items').all()){
   const photo=JSON.parse(p.data_json);
   const request=parsed(selectRequest.get(photo.requestId));
   if(!request||request.status!=='COMMITTED')
    problems.push({kind:'PHOTO_WITHOUT_COMMIT',photoId:photo.photoId});
   else if(request.eventId!==photo.eventId||request.photoId!==photo.photoId||
      request.position!==photo.position||request.digest!==photo.digest||
      request.actorMatricula!==photo.createdBy)
    problems.push({kind:'PHOTO_REQUEST_MISMATCH',photoId:photo.photoId});
   const last=lastAuditFor.get(photo.eventId+':'+photo.photoId,'PHOTO_UPSERT');
   if(!last||last.item_digest!==sha(JSON.stringify(photo)))
    problems.push({kind:'PHOTO_CONTENT_DIFFERS_FROM_AUDIT',photoId:photo.photoId});
  }
  // Crash after publishing an encrypted file but before SQLite commit can
  // leave an orphan. Flag for retry/review; never silently erase evidence.
  for(const filename of fs.readdirSync(photoDirectory)){
   const full=path.join(photoDirectory,filename);
   if(filename.endsWith('.enc')){
    const item=inspectEncryptedBlob(full);
    if(!knownBlobNames.has(item.stableName))
     problems.push({kind:'ORPHAN_PRIVATE_BLOB',blob:filename});
   }else if(filename.includes('.tmp-')){
    problems.push({kind:'INTERRUPTED_TEMP_BLOB',blob:filename});
   }
  }
  const auditResult=verifyAuditChain();
  if(!auditResult.ok)problems.push({kind:'AUDIT_CHAIN_INVALID'});
  return {ok:!problems.length,problems,audit:auditResult};
 }
 return Object.freeze({
  now,decodeJpeg:b=>Buffer.from(b,'base64'),sha256:sha,
  // Auth must be supplied by trusted R252/R255 wrappers, never this adapter.
  authenticate:async()=>deny('AUTHENTICATION_NOT_CONFIGURED'),
  getEvent:async()=>deny('CANONICAL_EVENT_NOT_CONFIGURED'),
  withExclusiveLock,
  getRequest:async id=>parsed(selectRequest.get(id)),
  getPhoto:async(ev,id)=>parsed(selectPhoto.get(ev,id)),
  listPhotos:async ev=>listPhotosQuery.all(ev).map(parsed),
  putRequest,putPhoto,
  findFileByStableName:async name=>decodePrivate(name),
  writePrivateFile:async item=>writePrivateFile(item),
  deletePrivateFile:async()=>deny('DELETE_REQUIRES_CUSTODY_APPROVAL'),
  verifyAuditChain,reconcile,close:()=>db.close(),releaseAllowed:false
 });
}
module.exports=Object.freeze({create,releaseAllowed:false});
