'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const cp=require('node:child_process'),crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {create:openPhotoStore}=require('../R256_BO_PHOTO_LEDGER_CANDIDATE_NO_DEPLOY/r256_private_photo_ledger.cjs');
const {create:openSessionStore}=require('../R255_BO_DURABLE_SESSION_CANDIDATE_NO_DEPLOY/r255_encrypted_sqlite_store.cjs');
const {create:openSession,LOGIN_COOKIE,SESSION_COOKIE}=require('../R255_BO_DURABLE_SESSION_CANDIDATE_NO_DEPLOY/r255_server_session_gate.cjs');
const {create:makeVerifier}=require('../R253_GOOGLE_OIDC_CANDIDATE_NO_DEPLOY/r253_google_oidc_verifier.cjs');
const {create:makeR252}=require('../R252_BO_PERSONAL_IDENTITY_CANDIDATE_NO_DEPLOY/r252_bo_photo_archive_core');
const {create:makeACL}=require('../R252_BO_PERSONAL_IDENTITY_CANDIDATE_NO_DEPLOY/r252_personal_bo_gate');
const T='2026-11-21T17:00:00.000Z';
const AUD='r256-test-only-client.apps.googleusercontent.com';
const ORIGIN='https://r256-synthetic.example';
const EVENT='service-77889900::BO::PM2026888888';
const jpeg=Buffer.from([255,216,255,224,0,16,74,70,73,70,0,0,0,0,255,217]);
const rsa=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
const jwk={...rsa.publicKey.export({format:'jwk'}),kid:'r256-synthetic-key',alg:'RS256',use:'sig'};
const enc=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
function signed(nonce){
 const claims={iss:'https://accounts.google.com',aud:AUD,
  sub:'r256-synthetic-user-sub',email:'r256@example.gmail.com',email_verified:true,
  iat:Date.parse(T)/1000-25,exp:Date.parse(T)/1000+700,nonce};
 // Google-proven email domain for R253: use gmail.com in test fixture.
 claims.email='r256-test-user@gmail.com';
 const input=enc({alg:'RS256',kid:jwk.kid,typ:'JWT'})+'.'+enc(claims);
 return input+'.'+crypto.sign('RSA-SHA256',Buffer.from(input),rsa.privateKey).toString('base64url');
}
function fromCookie(list,name){
 const row=list.find(x=>x.startsWith(name+'='));
 assert(row,'cookie '+name);
 return row.split(';')[0].split('=')[1];
}
function setup(hooks={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'r256-bo-'));
 const filesDir=path.join(dir,'private');
 const photoDb=path.join(dir,'photo.sqlite'),sessionDb=path.join(dir,'session.sqlite');
 const encryptionKey=crypto.randomBytes(32),auditKey=crypto.randomBytes(32),sessionKey=crypto.randomBytes(32);
 let clock=T;
 const state={
  roster:[{email:'r256-test-user@gmail.com',idpSubject:'r256-synthetic-user-sub',
   matricula:'123.456-7',batalhao:'BPRv',companhia:'1 CPRv',
   status:'ATIVO',boPhotoWrite:true}],
  assignments:[{matricula:'123.456-7',eventId:EVENT,batalhao:'BPRv',
   companhia:'1 CPRv',status:'ATIVO',expiresAt:'2026-11-21T18:00:00.000Z'}],
  event:{eventId:EVENT,tipo:'BO',status:'ATIVO',numeroDocumento:'PM2026888888',
   serviceId:'service-77889900',batalhao:'BPRv',companhia:'1 CPRv',locked:false}
 };
 const clone=v=>structuredClone(v);
 const authority={
  now:()=>clock,
  lookupRosterByEmail:async()=>clone(state.roster),
  listAssignmentsByMatricula:async()=>clone(state.assignments),
  readCanonicalEvent:async()=>clone(state.event)
 };
 const verifier=makeVerifier({clientIds:[AUD],getTrustedGoogleJwks:async()=>({keys:[jwk]}),now:()=>clock});
 const openStorage=()=>openPhotoStore({dbPath:photoDb,photoDirectory:filesDir,
  encryptionKey,auditKey,now:()=>clock,hooks});
 function open(){
  const photoStorage=openStorage();
  const c=openSessionStore({dbPath:sessionDb,encryptionKey:sessionKey,now:()=>clock,namespace:'challenge'});
  const s=openSessionStore({dbPath:sessionDb,encryptionKey:sessionKey,now:()=>clock,namespace:'session'});
  const gate=openSession({allowedOrigin:ORIGIN,clientId:AUD,
    oidcVerifier:verifier,authority,storage:photoStorage,
    now:()=>clock,challengeStore:c,sessionStore:s});
  return {gate,photoStorage,close:()=>{photoStorage.close();c.close();s.close()}};
 }
 function request(i=1){
  return {
   requestId:'post-'+crypto.randomUUID(),photoId:'photo-'+crypto.randomUUID(),
   eventId:EVENT,numeroBO:'PM2026888888',serviceId:'service-77889900',
   position:i,caption:'SYNTHETIC TEST ONLY',
   renderedDataUrl:'data:image/jpeg;base64,'+jpeg.toString('base64')
  };
 }
 async function login(instance){
  const one=instance.gate.beginLogin({method:'POST',origin:ORIGIN});
  const two=await instance.gate.finishLogin({method:'POST',origin:ORIGIN,
   cookies:{[LOGIN_COOKIE]:fromCookie(one.setCookies,LOGIN_COOKIE)},
   csrf:one.csrf,idToken:signed(one.nonce)});
  return {session:fromCookie(two.setCookies,SESSION_COOKIE),csrf:two.csrf};
 }
 function call(instance,auth,operation,body){
  return instance.gate.operate({method:'POST',origin:ORIGIN,
   cookies:{[SESSION_COOKIE]:auth.session},csrf:auth.csrf,
   operation,body});
 }
 function cleanup(){fs.rmSync(dir,{recursive:true,force:true})}
 return {state,dir,filesDir,photoDb,sessionDb,encryptionKey,auditKey,
  openStorage,open,login,call,request,cleanup,
  setClock:v=>{clock=v}};
}
test('R256 hard-blocks release by default',()=>{
 assert.equal(require('../R256_BO_PHOTO_LEDGER_CANDIDATE_NO_DEPLOY/r256_private_photo_ledger.cjs').releaseAllowed,false);
});
test('actual signed synthetic login -> persistent photo file + request/photo journal',async()=>{
 const f=setup(),one=f.open();
 try{
  const auth=await f.login(one),body=f.request(1);
  const result=await f.call(one,auth,'upload',body);
  assert.equal(result.ok,true);
  assert.equal(result.duplicate,false);
  const filenames=fs.readdirSync(f.filesDir);
  assert.equal(filenames.length,1);
  assert.match(filenames[0],/^[a-f0-9]{64}\.enc$/);
  const ciphertext=fs.readFileSync(path.join(f.filesDir,filenames[0]));
  assert(!ciphertext.includes(jpeg));
  assert(!ciphertext.includes(Buffer.from('SYNTHETIC TEST ONLY')));
  const listed=await f.call(one,auth,'list',
    {eventId:EVENT,serviceId:'service-77889900'});
  assert.equal(listed.items.length,1);
  assert.equal(listed.items[0].position,1);
  assert(!JSON.stringify(listed).includes('fileId'));
  const q=one.photoStorage.reconcile();
  assert.equal(q.ok,true);
  assert.equal(q.audit.verified,4);
 }finally{one.close();f.cleanup()}
});
test('restart preserves encrypted JPEG and metadata and replay does not duplicate',async()=>{
 const f=setup();let a=f.open(),b=null;
 try{
  const auth=await f.login(a),body=f.request(5);
  await f.call(a,auth,'upload',body);
  a.close();a=null;
  b=f.open();
  assert.equal((await f.call(b,auth,'upload',body)).duplicate,true);
  const photos=await f.call(b,auth,'list',{eventId:EVENT,serviceId:'service-77889900'});
  assert.equal(photos.items.length,1);assert.equal(photos.items[0].page,2);
  assert.equal(fs.readdirSync(f.filesDir).length,1);
  assert.equal(b.photoStorage.reconcile().ok,true);
 }finally{if(a)a.close();if(b)b.close();f.cleanup()}
});
test('photo sequence 1..9 gives three pages while preserving exact order',async()=>{
 const f=setup(),a=f.open();
 try{
  const auth=await f.login(a);
  for(let n=1;n<=9;n++)await f.call(a,auth,'upload',f.request(n));
  const list=await f.call(a,auth,'list',{eventId:EVENT,serviceId:'service-77889900'});
  assert.deepEqual(list.items.map(x=>x.page),[1,1,1,1,2,2,2,2,3]);
  assert.equal(fs.readdirSync(f.filesDir).length,9);
  assert.equal(a.photoStorage.reconcile().ok,true);
 }finally{a.close();f.cleanup()}
});
test('same position new request cannot overwrite existing photo',async()=>{
 const f=setup(),a=f.open();
 try{
  const auth=await f.login(a);await f.call(a,auth,'upload',f.request(1));
  await assert.rejects(f.call(a,auth,'upload',f.request(1)),/R239_BO_PHOTO_POSITION_COLLISION/);
  assert.equal(fs.readdirSync(f.filesDir).length,1);
  assert.equal(a.photoStorage.reconcile().ok,true);
 }finally{a.close();f.cleanup()}
});
test('different principal cannot reuse committed requestId after assignment changes',async()=>{
 const f=setup(),a=f.open();
 try{
  const auth=await f.login(a),body=f.request();
  await f.call(a,auth,'upload',body);
  f.state.roster[0].matricula='999.999-9';
  f.state.assignments[0].matricula='999.999-9';
  await assert.rejects(f.call(a,auth,'upload',body),/R239_REQUEST_OWNER_MISMATCH/);
  assert.equal(fs.readdirSync(f.filesDir).length,1);
 }finally{a.close();f.cleanup()}
});
test('logout and revocation cannot read metadata or write after restart',async()=>{
 const f=setup(),a=f.open();
 try{
  const auth=await f.login(a);await f.call(a,auth,'upload',f.request());
  const b=f.open();
  try{
   b.gate.logout({method:'POST',origin:ORIGIN,
    cookies:{[SESSION_COOKIE]:auth.session},csrf:auth.csrf});
   await assert.rejects(f.call(a,auth,'list',
     {eventId:EVENT,serviceId:'service-77889900'}),/R255_SESSION_REQUIRED/);
  }finally{b.close()}
 }finally{a.close();f.cleanup()}
});
test('crash after file publish before ledger commit is resumed from single encrypted file',async()=>{
 let failOnce=true;
 const f=setup({afterBlobPublished:()=>{
  if(failOnce){failOnce=false;throw Error('SIMULATED_PROCESS_INTERRUPT')}
 }});
 const a=f.open();
 try{
  const auth=await f.login(a),body=f.request();
  await assert.rejects(f.call(a,auth,'upload',body),/SIMULATED_PROCESS_INTERRUPT/);
  assert.equal(fs.readdirSync(f.filesDir).length,1);
  assert.equal(a.photoStorage.verifyAuditChain().verified,0,'rolled-back journal');
  const orphanCheck=a.photoStorage.reconcile();
  assert.equal(orphanCheck.ok,false);
  assert(orphanCheck.problems.some(p=>p.kind==='ORPHAN_PRIVATE_BLOB'));
  const recovered=await f.call(a,auth,'upload',body);
  assert.equal(recovered.ok,true);
  assert.equal(fs.readdirSync(f.filesDir).length,1);
  assert.equal(a.photoStorage.reconcile().ok,true);
 }finally{a.close();f.cleanup()}
});
test('two concurrent SQLite connections cannot reserve the same position',async()=>{
 const f=setup(),a=f.open(),b=f.open();
 try{
  const auth=await f.login(a);
  const result=await Promise.allSettled([
   f.call(a,auth,'upload',f.request(2)),
   f.call(b,auth,'upload',f.request(2))
  ]);
  assert.equal(result.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(result.filter(x=>x.status==='rejected').length,1);
  assert.match(result.find(x=>x.status==='rejected').reason.message,
   /R239_BO_PHOTO_POSITION_COLLISION/);
  assert.equal(fs.readdirSync(f.filesDir).length,1);
  assert.equal(a.photoStorage.reconcile().ok,true);
 }finally{a.close();b.close();f.cleanup()}
});
test('audit chain detects direct unauthorized journal manipulation',async()=>{
 const f=setup(),a=f.open();
 try{
  const auth=await f.login(a);await f.call(a,auth,'upload',f.request());
  assert.equal(a.photoStorage.verifyAuditChain().ok,true);
  const db=new DatabaseSync(f.photoDb);
  db.exec("UPDATE bo_photo_audit SET operation='ALTERED' WHERE sequence=2");
  db.close();
  assert.equal(a.photoStorage.verifyAuditChain().ok,false);
  assert.equal(a.photoStorage.reconcile().ok,false);
 }finally{a.close();f.cleanup()}
});
test('tampering encrypted JPEG content makes replay reject and metadata reconciliation fail closed',async()=>{
 const f=setup(),a=f.open();
 try{
  const auth=await f.login(a),body=f.request();await f.call(a,auth,'upload',body);
  const full=path.join(f.filesDir,fs.readdirSync(f.filesDir)[0]);
  const binary=fs.readFileSync(full);binary[binary.length-1]^=0x01;fs.writeFileSync(full,binary);
  await assert.rejects(f.call(a,auth,'upload',body),/R256_ENCRYPTED_BLOB_AUTHENTICATION_FAILED/);
  assert.throws(()=>a.photoStorage.reconcile(),/R256_ENCRYPTED_BLOB_AUTHENTICATION_FAILED/);
 }finally{a.close();f.cleanup()}
});
test('wrong encryption key cannot decrypt private evidence after restart',async()=>{
 const f=setup(),a=f.open();
 try{
  const auth=await f.login(a),body=f.request();await f.call(a,auth,'upload',body);
  const other=openPhotoStore({dbPath:f.photoDb,photoDirectory:f.filesDir,
   encryptionKey:crypto.randomBytes(32),auditKey:f.auditKey,now:()=>T});
  try{
   const stable='BO_'+EVENT.replace(/[^a-z0-9_-]/gi,'_')+
    '_'+body.photoId+'_'+body.requestId+'.jpg';
   await assert.rejects(other.findFileByStableName(stable),/R256_ENCRYPTED_BLOB_AUTHENTICATION_FAILED/);
  }finally{other.close()}
 }finally{a.close();f.cleanup()}
});
test('untrusted photo path cannot be used to read outside encrypted store',async()=>{
 const f=setup(),a=f.open();
 try{
  for(const attempted of ['../../outside.png','BO_../../foo.jpg','x'.repeat(1000)]){
   await assert.rejects(a.photoStorage.findFileByStableName(attempted),/R256_INVALID_STABLE_NAME/);
  }
  await assert.rejects(a.photoStorage.deletePrivateFile('anything'),/R256_DELETE_REQUIRES_CUSTODY_APPROVAL/);
 }finally{a.close();f.cleanup()}
});
test('metadata modifications require exclusive transaction, and rollbacks preserve history',async()=>{
 const f=setup(),a=f.open();
 try{
  assert.throws(()=>a.photoStorage.putRequest({
   requestId:'post-'+crypto.randomUUID(),eventId:EVENT,status:'PENDING'
  }),/R256_METADATA_WRITE_REQUIRES_LOCK/);
  await assert.rejects(a.photoStorage.withExclusiveLock('r239:'+EVENT,async()=>{
   await a.photoStorage.putRequest({requestId:'post-aaaaaaaaaaaa',eventId:EVENT,
    photoId:'photo-aaaaaa',position:1,status:'PENDING',
    digest:'digest',actorMatricula:'000.000-0',stableName:'some'});
   throw Error('ABORT_TRANSACTION');
  }),/ABORT_TRANSACTION/);
  assert.equal((await a.photoStorage.getRequest('post-aaaaaaaaaaaa')),null);
  assert.equal(a.photoStorage.verifyAuditChain().verified,0);
 }finally{a.close();f.cleanup()}
});
test('metadata and blob survive a separate child Node process reading the same database',async()=>{
 const f=setup(),a=f.open();
 try{
  const auth=await f.login(a),body=f.request();await f.call(a,auth,'upload',body);
  const script=`const {create}=require(process.argv[1]);const s=create({dbPath:process.argv[2],photoDirectory:process.argv[3],encryptionKey:Buffer.from(process.env.SYNTHETIC_PHOTO_KEY,'hex'),auditKey:Buffer.from(process.env.SYNTHETIC_AUDIT_KEY,'hex'),now:()=>process.env.SYNTHETIC_CLOCK});Promise.all([s.getRequest(process.argv[4]),s.listPhotos(process.argv[5])]).then(([r,p])=>{console.log(JSON.stringify({status:r.status,photos:p.length,integrity:s.reconcile().ok}));s.close()}).catch(e=>{console.error(e.message);process.exitCode=1});`;
  const modulePath=require.resolve('../R256_BO_PHOTO_LEDGER_CANDIDATE_NO_DEPLOY/r256_private_photo_ledger.cjs');
  const out=cp.execFileSync(process.execPath,['-e',script,modulePath,
   f.photoDb,f.filesDir,body.requestId,EVENT],{
   encoding:'utf8',env:{...process.env,SYNTHETIC_PHOTO_KEY:f.encryptionKey.toString('hex'),
    SYNTHETIC_AUDIT_KEY:f.auditKey.toString('hex'),SYNTHETIC_CLOCK:T}
  });
  assert.deepEqual(JSON.parse(out),{status:'COMMITTED',photos:1,integrity:true});
 }finally{a.close();f.cleanup()}
});

test('reconciliation reports a missing committed blob and replay refuses success',async()=>{
 const f=setup(),a=f.open();
 try{
  const auth=await f.login(a),body=f.request();await f.call(a,auth,'upload',body);
  fs.unlinkSync(path.join(f.filesDir,fs.readdirSync(f.filesDir)[0]));
  const scan=a.photoStorage.reconcile();
  assert.equal(scan.ok,false);
  assert(scan.problems.some(x=>x.kind==='MISSING_PRIVATE_BLOB'));
  await assert.rejects(f.call(a,auth,'upload',body),
    /R239_COMMIT_PRIVATE_FILE_MISSING_OR_CORRUPT/);
 }finally{a.close();f.cleanup()}
});
test('reconciliation detects abandoned partially written temporary blob',()=>{
 const f=setup(),a=f.open();
 try{
  fs.mkdirSync(f.filesDir,{recursive:true});
  fs.writeFileSync(path.join(f.filesDir,'broken.tmp-deadbeef'),'partial');
  const scan=a.photoStorage.reconcile();
  assert.equal(scan.ok,false);
  assert(scan.problems.some(x=>x.kind==='INTERRUPTED_TEMP_BLOB'));
 }finally{a.close();f.cleanup()}
});
test('reconciliation does not delete forensic remnants without custody approval',async()=>{
 const f=setup(),a=f.open();
 try{
  fs.mkdirSync(f.filesDir,{recursive:true});
  const marker=path.join(f.filesDir,'incomplete.tmp-test');
  fs.writeFileSync(marker,'synthetic-file');
  assert.equal(a.photoStorage.reconcile().ok,false);
  assert.equal(fs.existsSync(marker),true);
  await assert.rejects(a.photoStorage.deletePrivateFile(marker),
   /R256_DELETE_REQUIRES_CUSTODY_APPROVAL/);
  assert.equal(fs.existsSync(marker),true);
 }finally{a.close();f.cleanup()}
});

test('audit-to-ledger reconciliation detects direct request metadata changes',async()=>{
 const f=setup(),a=f.open();
 try{
  const auth=await f.login(a),body=f.request();
  await f.call(a,auth,'upload',body);
  const db=new DatabaseSync(f.photoDb);
  const item=db.prepare('SELECT data_json FROM bo_photo_requests WHERE request_id=?').get(body.requestId);
  const changed=JSON.parse(item.data_json);changed.caption='UNAUTHORIZED CHANGE';
  db.prepare('UPDATE bo_photo_requests SET data_json=? WHERE request_id=?')
   .run(JSON.stringify(changed),body.requestId);
  db.close();
  assert.equal(a.photoStorage.verifyAuditChain().ok,true,
   'audit entries alone are unmodified');
  const report=a.photoStorage.reconcile();
  assert.equal(report.ok,false);
  assert(report.problems.some(p=>p.kind==='REQUEST_CONTENT_DIFFERS_FROM_AUDIT'));
 }finally{a.close();f.cleanup()}
});
test('audit-to-ledger reconciliation detects direct photo metadata changes',async()=>{
 const f=setup(),a=f.open();
 try{
  const auth=await f.login(a),body=f.request();
  await f.call(a,auth,'upload',body);
  const db=new DatabaseSync(f.photoDb);
  const item=db.prepare('SELECT data_json FROM bo_photo_items WHERE event_id=? AND photo_id=?')
   .get(EVENT,body.photoId);
  const changed=JSON.parse(item.data_json);changed.caption='UNAUTHORIZED CHANGE';
  db.prepare('UPDATE bo_photo_items SET data_json=? WHERE event_id=? AND photo_id=?')
   .run(JSON.stringify(changed),EVENT,body.photoId);
  db.close();
  const report=a.photoStorage.reconcile();
  assert.equal(report.ok,false);
  assert(report.problems.some(p=>p.kind==='PHOTO_CONTENT_DIFFERS_FROM_AUDIT'));
 }finally{a.close();f.cleanup()}
});
test('two actual OS processes serialize SQLite writes to the same photo position',async()=>{
 const f=setup(),a=f.open();let child;
 try{
  const modulePath=require.resolve('../R256_BO_PHOTO_LEDGER_CANDIDATE_NO_DEPLOY/r256_private_photo_ledger.cjs');
  const script=`const {create}=require(process.argv[1]);
  const s=create({dbPath:process.argv[2],photoDirectory:process.argv[3],
   encryptionKey:Buffer.from(process.env.R256_TEST_ENC,'hex'),
   auditKey:Buffer.from(process.env.R256_TEST_MAC,'hex'),now:()=>process.env.R256_TEST_CLOCK});
  console.log('READY');
  s.withExclusiveLock('r239:'+process.argv[4],async()=>{
   await s.putPhoto({eventId:process.argv[4],photoId:'child-photo',
    position:3,requestId:'post-child-1234567890',digest:'synthetic',createdBy:'SYNTH'});
  }).then(()=>{console.log('UNEXPECTED_WRITE');s.close()})
   .catch(e=>{console.log('REJECTED:'+String(e.message));s.close()});`;
  const output=[];
  const exit=new Promise((resolve,reject)=>{
   child=cp.spawn(process.execPath,['-e',script,modulePath,f.photoDb,f.filesDir,EVENT],{
    env:{...process.env,R256_TEST_ENC:f.encryptionKey.toString('hex'),
     R256_TEST_MAC:f.auditKey.toString('hex'),R256_TEST_CLOCK:T}
   });
   child.stdout.on('data',data=>output.push(data.toString()));
   child.stderr.on('data',data=>output.push('STDERR:'+data.toString()));
   child.on('error',reject);
   child.on('exit',code=>code===0?resolve():reject(Error('Child process exit '+code)));
  });
  let ready;
  const announced=new Promise(resolve=>{ready=resolve});
  child.stdout.on('data',data=>{if(data.toString().includes('READY'))ready()});
  await a.photoStorage.withExclusiveLock('r239:'+EVENT,async()=>{
   await announced;
   await new Promise(resolve=>setTimeout(resolve,70));
   await a.photoStorage.putPhoto({eventId:EVENT,photoId:'parent-photo',
    position:3,requestId:'post-parent-123456789',digest:'synthetic',createdBy:'SYNTH'});
  });
  await exit;
  assert(output.join('').includes('READY'));
  assert.match(output.join(''),/REJECTED:.*(UNIQUE|constraint)/i);
  assert(!output.join('').includes('UNEXPECTED_WRITE'));
  assert.equal((await a.photoStorage.listPhotos(EVENT)).length,1);
 }finally{if(child&&!child.killed&&child.exitCode===null)child.kill();a.close();f.cleanup()}
});
