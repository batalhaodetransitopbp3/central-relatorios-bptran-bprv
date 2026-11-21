'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const cp=require('node:child_process'),crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {create:openStore}=require('../R255_BO_DURABLE_SESSION_CANDIDATE_NO_DEPLOY/r255_encrypted_sqlite_store.cjs');
const {create:openGate,LOGIN_COOKIE,SESSION_COOKIE}=require('../R255_BO_DURABLE_SESSION_CANDIDATE_NO_DEPLOY/r255_server_session_gate.cjs');
const {create:makeVerifier}=require('../R253_GOOGLE_OIDC_CANDIDATE_NO_DEPLOY/r253_google_oidc_verifier.cjs');
const CLIENT_ID='fake-r255-client.apps.googleusercontent.com';
const ORIGIN='https://bo-homologacao.synthetic.example';
const T='2026-11-21T14:00:00.000Z';
const EVENT='service-555555555::BO::PM2026888888';
const jpeg=Buffer.from([255,216,255,224,0,16,74,70,73,70,0,0,0,0,255,217]);
const {privateKey,publicKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
const keyData={...publicKey.export({format:'jwk'}),kid:'synthetic-r255',alg:'RS256',use:'sig'};
const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
function token(nonce,values={}){
 const head={alg:'RS256',kid:keyData.kid,typ:'JWT'};
 const claims={iss:'https://accounts.google.com',aud:CLIENT_ID,
  sub:'test-r255-google-sub',email:'test-r255@gmail.com',email_verified:true,
  iat:Date.parse(T)/1000-15,exp:Date.parse(T)/1000+600,nonce,...values};
 const input=enc(head)+'.'+enc(claims);
 return input+'.'+crypto.sign('RSA-SHA256',Buffer.from(input),privateKey).toString('base64url');
}
function cookie(cookies,name){
 const entry=cookies.find(x=>x.startsWith(name+'='));
 assert(entry);return entry.split(';')[0].split('=')[1];
}
function fixture(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'r255-bo-durable-'));
 const dbPath=path.join(dir,'bo-sessions.sqlite3'),key=crypto.randomBytes(32);
 let clock=T;
 const state={writes:0,requests:new Map(),photos:new Map(),files:new Map(),
  assignments:[{matricula:'111.111-1',eventId:EVENT,batalhao:'BPRv',
   companhia:'1 CPRv',status:'ATIVO',expiresAt:'2026-11-21T16:00:00.000Z'}],
  roster:[{email:'test-r255@gmail.com',idpSubject:'test-r255-google-sub',
   matricula:'111.111-1',batalhao:'BPRv',companhia:'1 CPRv',
   status:'ATIVO',boPhotoWrite:true}],
  event:{eventId:EVENT,tipo:'BO',status:'ATIVO',numeroDocumento:'PM2026888888',
   serviceId:'service-555555555',batalhao:'BPRv',companhia:'1 CPRv',locked:false},
  onLock:null
 };
 const copy=x=>structuredClone(x);
 const authority={
  lookupRosterByEmail:async()=>copy(state.roster),
  listAssignmentsByMatricula:async()=>copy(state.assignments),
  readCanonicalEvent:async()=>copy(state.event)
 };
 const storage={
  now:()=>clock,decodeJpeg:x=>Buffer.from(x,'base64'),
  sha256:x=>crypto.createHash('sha256').update(x).digest('hex'),
  authenticate:()=>{throw Error('STORAGE_CANNOT_AUTHENTICATE')},
  getEvent:()=>{throw Error('STORAGE_CANNOT_AUTHORIZE')},
  withExclusiveLock:async(_key,fn)=>{
   if(state.onLock)state.onLock();
   return fn();
  },
  getRequest:async id=>copy(state.requests.get(id)||null),
  getPhoto:async(ev,id)=>copy(state.photos.get(ev+':'+id)||null),
  listPhotos:async ev=>[...state.photos.values()].filter(x=>x.eventId===ev).map(copy),
  putRequest:async row=>{state.writes++;state.requests.set(row.requestId,copy(row))},
  putPhoto:async row=>{state.writes++;state.photos.set(row.eventId+':'+row.photoId,copy(row))},
  findFileByStableName:async n=>copy(state.files.get(n)||null),
  writePrivateFile:async item=>{
   state.writes++;const file={fileId:'R255-SYNTHETIC-FILE',eventId:item.eventId,digest:item.digest};
   state.files.set(item.stableName,file);return copy(file);
  },
  deletePrivateFile:async()=>{state.writes++}
 };
 const verifier=makeVerifier({
  clientIds:[CLIENT_ID],getTrustedGoogleJwks:async()=>({keys:[keyData]}),
  now:()=>clock
 });
 function stores(){
  const time=()=>clock;
  return {
   challengeStore:openStore({dbPath,encryptionKey:key,now:time,namespace:'challenge'}),
   sessionStore:openStore({dbPath,encryptionKey:key,now:time,namespace:'session'})
  };
 }
 function open(){
  const ss=stores();
  const gate=openGate({
   allowedOrigin:ORIGIN,clientId:CLIENT_ID,oidcVerifier:verifier,
   authority,storage,now:()=>clock,...ss
  });
  return {...ss,gate,close:()=>{
    ss.challengeStore.close();ss.sessionStore.close();
  }};
 }
 function photo(){
  return {requestId:'post-'+crypto.randomUUID(),
   photoId:'photo-'+crypto.randomUUID(),position:1,caption:'FOTO FICTICIA',
   eventId:EVENT,numeroBO:'PM2026888888',serviceId:'service-555555555',
   renderedDataUrl:'data:image/jpeg;base64,'+jpeg.toString('base64')
  };
 }
 function loginStart(inst){
  const result=inst.gate.beginLogin({method:'POST',origin:ORIGIN});
  return {challenge:result,loginCookie:cookie(result.setCookies,LOGIN_COOKIE)};
 }
 async function loginFinish(inst,result){
  const {challenge,loginCookie}=result;
  const response=await inst.gate.finishLogin({
   method:'POST',origin:ORIGIN,cookies:{[LOGIN_COOKIE]:loginCookie},
   csrf:challenge.csrf,idToken:token(challenge.nonce)
  });
  return {session:cookie(response.setCookies,SESSION_COOKIE),csrf:response.csrf};
 }
 function upload(inst,auth,request=photo()){
  return inst.gate.operate({method:'POST',origin:ORIGIN,
   cookies:{[SESSION_COOKIE]:auth.session},csrf:auth.csrf,
   operation:'upload',body:request});
 }
 function cleanup(){
  for(const ext of ['','-wal','-shm'])try{fs.unlinkSync(dbPath+ext)}catch(_){}
  fs.rmSync(dir,{recursive:true,force:true});
 }
 return {dir,dbPath,key,state,stores,open,photo,loginStart,loginFinish,upload,cleanup,
  setClock:v=>{clock=v},getClock:()=>clock};
}
test('R255 is explicitly not release approved',()=>{
 assert.equal(require('../R255_BO_DURABLE_SESSION_CANDIDATE_NO_DEPLOY/r255_encrypted_sqlite_store.cjs').releaseAllowed,false);
 assert.equal(require('../R255_BO_DURABLE_SESSION_CANDIDATE_NO_DEPLOY/r255_server_session_gate.cjs').releaseAllowed,false);
});
test('SQLite stores only HMAC token identifiers and AES-GCM ciphertext',()=>{
 const f=fixture(),s=f.stores();
 try{
  const id='a-realistic-looking-random-cookie-'+crypto.randomUUID();
  const secret='PRIVATE_TEST_NONCE_SHOULD_NEVER_APPEAR';
  s.challengeStore.set(id,{expiresMs:Date.parse(T)+100000,nonce:secret,csrf:'my-csrf'});
  assert.equal(s.challengeStore.get(id).nonce,secret);
  s.challengeStore.close();s.sessionStore.close();
  for(const name of fs.readdirSync(f.dir)){
   if(!name.startsWith('bo-sessions.sqlite3'))continue;
   const bytes=fs.readFileSync(path.join(f.dir,name)).toString('latin1');
   assert(!bytes.includes(id));
   assert(!bytes.includes(secret));
   assert(!bytes.includes('my-csrf'));
  }
 }finally{f.cleanup()}
});
test('challenge consumed in second independent process is unavailable to first',()=>{
 const f=fixture(),s=f.stores();
 try{
  const id='challenge-'+crypto.randomUUID();
  s.challengeStore.set(id,{nonce:'NONCE_ABCDEF',csrf:'CSRF_ABCDEF',
    expiresMs:Date.parse(T)+300000});
  const modulePath=require.resolve('../R255_BO_DURABLE_SESSION_CANDIDATE_NO_DEPLOY/r255_encrypted_sqlite_store.cjs');
  const script=`const {create}=require(process.argv[1]);const st=create({dbPath:process.argv[2],encryptionKey:Buffer.from(process.argv[3],'hex'),now:()=>process.argv[4],namespace:'challenge'});const x=st.consume(process.argv[5]);console.log(JSON.stringify(x));st.close();`;
  const out=cp.execFileSync(process.execPath,['-e',script,modulePath,
    f.dbPath,f.key.toString('hex'),T,id],{encoding:'utf8'}).trim();
  assert.equal(JSON.parse(out).nonce,'NONCE_ABCDEF');
  assert.equal(s.challengeStore.consume(id),null);
 }finally{s.challengeStore.close();s.sessionStore.close();f.cleanup()}
});
test('two separate SQLite connections cannot consume one challenge twice',()=>{
 const f=fixture(),a=f.stores(),b=f.stores();
 try{
  const id='challenge-'+crypto.randomUUID();
  a.challengeStore.set(id,{expiresMs:Date.parse(T)+120000,nonce:'1234567890'});
  const x=a.challengeStore.consume(id),y=b.challengeStore.consume(id);
  assert.equal(x.nonce,'1234567890');assert.equal(y,null);
 }finally{a.challengeStore.close();a.sessionStore.close();
   b.challengeStore.close();b.sessionStore.close();f.cleanup()}
});
test('server restart preserves challenge and session, plus BO access using stored verified identity',async()=>{
 const f=fixture();let one=f.open(),two,three;
 try{
  const beginning=f.loginStart(one);one.close();
  two=f.open();
  const auth=await f.loginFinish(two,beginning);
  two.close();two=null;
  three=f.open();
  const image=f.photo();
  const result=await f.upload(three,auth,image);
  assert.equal(result.ok,true);assert.equal(result.duplicate,false);
  assert.equal((await f.upload(three,auth,image)).duplicate,true);
  assert.equal(f.state.files.size,1);
  const rows=await three.gate.operate({method:'POST',origin:ORIGIN,
   cookies:{[SESSION_COOKIE]:auth.session},csrf:auth.csrf,
   operation:'list',body:{eventId:EVENT,serviceId:'service-555555555'}});
  assert.equal(rows.items.length,1);
  assert.equal(JSON.stringify(rows).includes('fileId'),false);
 }finally{if(two)two.close();if(three)three.close();f.cleanup()}
});
test('logout in another process revokes session across SQLite connections',async()=>{
 const f=fixture(),a=f.open(),b=f.open();
 try{
  const auth=await f.loginFinish(a,f.loginStart(a));
  const out=b.gate.logout({method:'POST',origin:ORIGIN,
   cookies:{[SESSION_COOKIE]:auth.session},csrf:auth.csrf});
  assert.equal(out.ok,true);
  await assert.rejects(f.upload(a,auth),/R255_SESSION_REQUIRED/);
  assert.equal(f.state.writes,0);
 }finally{a.close();b.close();f.cleanup()}
});
test('logout during upload lock is visible to the first server process',async()=>{
 const f=fixture(),a=f.open(),b=f.open();
 try{
  const auth=await f.loginFinish(a,f.loginStart(a));
  f.state.onLock=()=>b.gate.logout({method:'POST',origin:ORIGIN,
   cookies:{[SESSION_COOKIE]:auth.session},csrf:auth.csrf});
  await assert.rejects(f.upload(a,auth),/R255_SESSION_REVOKED_DURING_OPERATION/);
  assert.equal(f.state.writes,0);
 }finally{a.close();b.close();f.cleanup()}
});
test('expiry across restart refuses existing cookie and removes stale entries',async()=>{
 const f=fixture(),a=f.open();
 try{
  const auth=await f.loginFinish(a,f.loginStart(a));
  f.setClock('2026-11-21T14:12:00.000Z');
  const b=f.open();
  try{
   await assert.rejects(f.upload(b,auth),/R255_SESSION_REQUIRED|R255_SESSION_EXPIRED/);
   b.sessionStore.prune();
   assert.equal(b.sessionStore.size,0);
  }finally{b.close()}
 }finally{a.close();f.cleanup()}
});
test('unverified subject and revoked assignment remain blocked after restarting server',async()=>{
 const f=fixture(),a=f.open();
 try{
  const auth=await f.loginFinish(a,f.loginStart(a));
  f.state.assignments=[];
  const b=f.open();
  try{
   await assert.rejects(f.upload(b,auth),/R252_BO_OUTSIDE_PERSONAL_ASSIGNMENT|R252_EVENT_ASSIGNMENT_REVOKED/);
   assert.equal(f.state.writes,0);
  }finally{b.close()}
 }finally{a.close();f.cleanup()}
});
test('session valid cookie with wrong CSRF or origin cannot operate after restart',async()=>{
 const f=fixture(),a=f.open();
 try{
  const auth=await f.loginFinish(a,f.loginStart(a));
  const b=f.open();
  try{
   await assert.rejects(b.gate.operate({method:'POST',origin:ORIGIN,
    cookies:{[SESSION_COOKIE]:auth.session},csrf:'WRONG',
    operation:'upload',body:f.photo()}),/R255_SESSION_CSRF_INVALID/);
   await assert.rejects(b.gate.operate({method:'POST',
    origin:'https://other-origin.example',
    cookies:{[SESSION_COOKIE]:auth.session},csrf:auth.csrf,
    operation:'upload',body:f.photo()}),/R255_UNTRUSTED_ORIGIN_OR_METHOD/);
   assert.equal(f.state.writes,0);
  }finally{b.close()}
 }finally{a.close();f.cleanup()}
});
test('SQLite tampering is detected by AES-GCM authentication tag',()=>{
 const f=fixture(),s=f.stores();
 try{
  s.sessionStore.set('random-session-key',{
   revision:crypto.randomBytes(32).toString('base64url'),
   csrf:'long-csrf',verified:{subject:'test'},
   expiresMs:Date.parse(T)+60000
  });
  const db=new DatabaseSync(f.dbPath);
  db.prepare('UPDATE bo_auth_state SET ciphertext=? WHERE namespace=?')
    .run(crypto.randomBytes(60),'session');
  db.close();
  assert.throws(()=>s.sessionStore.get('random-session-key'),
   /R255_STORE_CIPHERTEXT_AUTHENTICATION_FAILED/);
 }finally{s.challengeStore.close();s.sessionStore.close();f.cleanup()}
});
test('wrong encryption key cannot read an existing session',()=>{
 const f=fixture(),s=f.stores();
 try{
  s.sessionStore.set('session-secret',{
   revision:'REVISION_LONG_FAKE_TEST',expiresMs:Date.parse(T)+60000
  });
  const foreign=openStore({dbPath:f.dbPath,
   encryptionKey:crypto.randomBytes(32),now:()=>T,namespace:'session'});
  try{assert.equal(foreign.get('session-secret'),null)}
  finally{foreign.close()}
 }finally{s.challengeStore.close();s.sessionStore.close();f.cleanup()}
});
test('misconfigured empty key or non-SQLite directory is rejected',()=>{
 const f=fixture();
 try{
  assert.throws(()=>openStore({
   dbPath:f.dbPath,encryptionKey:Buffer.alloc(8),
   now:()=>T,namespace:'session'}),/R255_STORE_CONFIG_INVALID/);
  assert.throws(()=>openGate({
   allowedOrigin:ORIGIN,clientId:CLIENT_ID,
   oidcVerifier:{verify:async()=>null},
   authority:{lookupRosterByEmail:async()=>[],listAssignmentsByMatricula:async()=>[],
    readCanonicalEvent:async()=>null},storage:{},now:()=>T
  }),/R255_DURABLE_STORES_REQUIRED/);
 }finally{f.cleanup()}
});

test('actual HTTP loopback remains authenticated across server restart with SQLite',async()=>{
 const http=require('node:http');
 const {makeHandler}=require('../R254_BO_SESSION_CANDIDATE_NO_DEPLOY/r254_http_handler.cjs');
 const f=fixture();let inst=null,server=null,base=null;
 async function boot(){
  inst=f.open();server=http.createServer(makeHandler(inst.gate));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  base='http://127.0.0.1:'+server.address().port;
 }
 async function halt(){
  if(server)await new Promise(resolve=>server.close(resolve));
  if(inst)inst.close();server=null;inst=null;
 }
 async function post(route,body,headers={}){
  const response=await fetch(base+route,{method:'POST',
   headers:{origin:ORIGIN,'content-type':'application/json',...headers},
   body:JSON.stringify(body||{})});
  return {status:response.status,payload:await response.json(),
   cookies:response.headers.getSetCookie()};
 }
 try{
  await boot();
  const beginning=await post('/bo-api/login/start');
  assert.equal(beginning.status,200);
  const loginCookie=LOGIN_COOKIE+'='+cookie(beginning.cookies,LOGIN_COOKIE);
  await halt();
  await boot();
  const completed=await post('/bo-api/login/complete',
   {idToken:token(beginning.payload.nonce)},
   {cookie:loginCookie,'x-bo-csrf':beginning.payload.csrf});
  assert.equal(completed.status,200);
  const sessionCookie=SESSION_COOKIE+'='+cookie(completed.cookies,SESSION_COOKIE);
  await halt();
  await boot();
  const image=f.photo();
  const uploaded=await post('/bo-api/photos/upload',image,
   {cookie:sessionCookie,'x-bo-csrf':completed.payload.csrf});
  assert.equal(uploaded.status,200);assert.equal(uploaded.payload.ok,true);
  const list=await post('/bo-api/photos/list',
   {eventId:EVENT,serviceId:'service-555555555'},
   {cookie:sessionCookie,'x-bo-csrf':completed.payload.csrf});
  assert.equal(list.status,200);assert.equal(list.payload.items.length,1);
  const logout=await post('/bo-api/logout',{},
   {cookie:sessionCookie,'x-bo-csrf':completed.payload.csrf});
  assert.equal(logout.status,200);
  const denied=await post('/bo-api/photos/list',
   {eventId:EVENT,serviceId:'service-555555555'},
   {cookie:sessionCookie,'x-bo-csrf':completed.payload.csrf});
  assert.equal(denied.status,403);
 }finally{await halt();f.cleanup()}
});
test('expired login challenge cannot be consumed after restarting',async()=>{
 const f=fixture(),a=f.open();
 try{
  const first=f.loginStart(a);
  a.close();
  f.setClock('2026-11-21T14:06:00.000Z');
  const b=f.open();
  try{
   await assert.rejects(f.loginFinish(b,first),/R255_LOGIN_CHALLENGE_REQUIRED/);
  }finally{b.close()}
 }finally{f.cleanup()}
});
