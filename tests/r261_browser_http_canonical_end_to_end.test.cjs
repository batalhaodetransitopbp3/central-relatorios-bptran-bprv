'use strict';
/* R261 end-to-end browser-client contract -> actual loopback HTTP -> R255
 * durable sessions -> verified fake Google JWT -> R252 -> R260 canonical BO
 * -> R239 private synthetic storage. No Google network or operational data.
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),
 http=require('node:http'),crypto=require('node:crypto');
const browser=require('../R261_BO_BROWSER_CANONICAL_CANDIDATE_NO_DEPLOY/r261_bo_browser_session_client.js');
const {create:gateCreate,LOGIN_COOKIE,SESSION_COOKIE}=
 require('../R255_BO_DURABLE_SESSION_CANDIDATE_NO_DEPLOY/r255_server_session_gate.cjs');
const {create:storeCreate}=
 require('../R255_BO_DURABLE_SESSION_CANDIDATE_NO_DEPLOY/r255_encrypted_sqlite_store.cjs');
const {create:verifyCreate}=
 require('../R253_GOOGLE_OIDC_CANDIDATE_NO_DEPLOY/r253_google_oidc_verifier.cjs');
const {makeHandler}=
 require('../R254_BO_SESSION_CANDIDATE_NO_DEPLOY/r254_http_handler.cjs');
const ORIGIN='https://r261-review.example';
const CLIENT='synthetic-r261-client.apps.googleusercontent.com';
const T='2026-11-21T18:00:00.000Z';
const BO='PM2026123456',EVENT='service-r261-123456::BO::'+BO,
 SERVICE='service-r261-123456',RSD='rsd-r261-123456',
 RCO='rco-r261-123456';
const JPG=Buffer.from([255,216,255,224,0,16,74,70,73,70,0,0,0,0,255,217]);
const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
const clone=x=>x===undefined?undefined:structuredClone(x);
function fixture({standaloneRco=false}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'r261-loopback-'));
 const dbPath=path.join(dir,'s.db'),key=crypto.randomBytes(32);
 const now=()=>T;
 const state={writes:0,calls:[],files:new Map(),photos:new Map(),
  requests:new Map(),revokeInsideLock:false,lookupCalls:0};
 const event={eventId:standaloneRco?'rco-r261-123456::BO::'+BO:EVENT,
  tipo:'BO',numeroDocumento:BO,status:'ATIVO',
  serviceId:standaloneRco?'':SERVICE,
  rsdReportId:standaloneRco?'':RSD,rcoReportId:RCO,
  batalhao:'BPRv',companhia:'1 CPRv',locked:false};
 const row={email:'r261-test@gmail.com',idpSubject:'synthetic-r261-sub',
  matricula:'R261-FAKE-01',status:'ATIVO',boPhotoWrite:true,
  batalhao:'BPRv',companhia:'1 CPRv'};
 const assignment={matricula:row.matricula,eventId:event.eventId,
  batalhao:row.batalhao,companhia:row.companhia,status:'ATIVO',
  expiresAt:'2026-11-21T20:00:00.000Z'};
 const pair=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
 const publicJwk={...pair.publicKey.export({format:'jwk'}),
  kid:'r261-synthetic-2026',alg:'RS256',use:'sig'};
 function token(nonce){
  const payload={iss:'https://accounts.google.com',aud:CLIENT,
   email:row.email,email_verified:true,sub:row.idpSubject,
   iat:Date.parse(T)/1000-30,exp:Date.parse(T)/1000+700,nonce};
  const signed=enc({alg:'RS256',typ:'JWT',kid:publicJwk.kid})+'.'+enc(payload);
  return signed+'.'+crypto.sign('RSA-SHA256',
   Buffer.from(signed),pair.privateKey).toString('base64url');
 }
 const storage={
  now,decodeJpeg:b=>Buffer.from(b,'base64'),
  sha256:b=>crypto.createHash('sha256').update(b).digest('hex'),
  authenticate:()=>{throw Error('STORAGE_CANNOT_AUTHENTICATE')},
  getEvent:()=>{throw Error('STORAGE_CANNOT_AUTHORIZE')},
  withExclusiveLock:async(_,fn)=>{
   if(state.revokeInsideLock){state.revokeInsideLock=false;assignment.status='INATIVO'}
   return fn();
  },
  getRequest:async id=>clone(state.requests.get(id)||null),
  getPhoto:async(e,id)=>clone(state.photos.get(e+':'+id)||null),
  listPhotos:async e=>[...state.photos.values()]
   .filter(x=>x.eventId===e).map(clone),
  putRequest:async r=>{state.requests.set(r.requestId,clone(r))},
  putPhoto:async r=>{state.photos.set(r.eventId+':'+r.photoId,clone(r))},
  findFileByStableName:async name=>clone(state.files.get(name)||null),
  writePrivateFile:async item=>{
   const result={fileId:'R261-FAKE-FILE-'+(++state.writes),
    eventId:item.eventId,digest:item.digest};
   state.files.set(item.stableName,clone(result));return result;
  },
  deletePrivateFile:async()=>{throw Error('DELETION_FORBIDDEN')}
 };
 const authority={
  lookupRosterByEmail:async()=>[clone(row)],
  listAssignmentsByMatricula:async()=>[clone(assignment)],
  readCanonicalEvent:async id=>id===event.eventId?clone(event):null
 };
 const challengeStore=storeCreate({dbPath,encryptionKey:key,now,
  namespace:'challenge'});
 const sessionStore=storeCreate({dbPath,encryptionKey:key,now,
  namespace:'session'});
 const verifier=verifyCreate({clientIds:[CLIENT],
  getTrustedGoogleJwks:async()=>({keys:[publicJwk]}),now});
 const lookup=async num=>{
  state.lookupCalls++;
  if(state.ambiguous)return [{eventId:event.eventId},
   {eventId:'other-r261-999999::BO::'+BO}];
  return num===BO?[{eventId:event.eventId}]:[];
 };
 const gateParams={allowedOrigin:ORIGIN,clientId:CLIENT,
  oidcVerifier:verifier,authority,storage,now,challengeStore,sessionStore};
 const gate=gateCreate({...gateParams,canonicalEventLookup:lookup,
  canonicalMode:'ISOLATED_HOMOLOGATION'});
 const server=http.createServer(makeHandler(gate));
 const cookies=new Map();
 let base='';
 async function start(){
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  base='http://127.0.0.1:'+server.address().port;
 }
 async function fakeFetch(route,options){
  state.calls.push({route,options:clone(options)});
  const headers={...options.headers,origin:ORIGIN};
  if(cookies.size)headers.cookie=[...cookies].map(([k,v])=>k+'='+v).join('; ');
  const result=await fetch(base+route,{...options,headers});
  if(route.endsWith('/login/complete')){
   const reply=await result.clone().json();
   if(reply.ok)state.latestCsrf=reply.csrf;
  }
  for(const row of result.headers.getSetCookie()){
   const [prefix]=row.split(';'),i=prefix.indexOf('=');
   if(i<0)continue;
   const name=prefix.slice(0,i),value=prefix.slice(i+1);
   if(value)cookies.set(name,value);
   else cookies.delete(name);
  }
  return result;
 }
 const app=browser.create({fetchImpl:fakeFetch,
  mode:'ISOLATED_HOMOLOGATION'});
 const launch={
  index:{from:'index',module:'bo'},
  rsd:{from:'rsd',module:'bo',serviceId:SERVICE,
   rsdReportId:RSD,editId:BO},
  rco:{from:'rco',module:'bo',editId:BO}
 };
 const photo=(n=1,extra={})=>({
  requestId:'post-'+crypto.randomUUID(),
  photoId:'photo-'+crypto.randomUUID(),
  position:n,caption:'R261 FOTO FICTICIA '+n,
  renderedDataUrl:'data:image/jpeg;base64,'+JPG.toString('base64'),
  ...extra
 });
 async function login(){
  const beginning=await app.startLogin();
  const jwt=token(beginning.nonce);
  const result=await app.finishLogin(jwt);
  assert.equal(result.ok,true);
  return {jwt,result};
 }
 async function cleanup(){
  await new Promise(resolve=>server.close(resolve));
  challengeStore.close();sessionStore.close();
  fs.rmSync(dir,{recursive:true,force:true,maxRetries:20,retryDelay:20});
 }
 return {state,event,row,assignment,gate,gateParams,lookup,storage,cookies,
  start,login,cleanup,app,launch,photo,fakeFetch,
  direct:async(route,body,csrf)=>{
   const headers={'Content-Type':'application/json'};
   if(csrf)headers['X-BO-CSRF']=csrf;
   return fakeFetch(route,{method:'POST',
    credentials:'same-origin',mode:'same-origin',cache:'no-store',
    redirect:'error',referrerPolicy:'no-referrer',
    headers,body:JSON.stringify(body)});
  }
 };
}
test('browser R261 disabled outside explicit staging and never adds itself to BO pages',()=>{
 assert.equal(browser.releaseAllowed,false);
 assert.equal(browser.connectedToLiveBoPage,false);
 assert.throws(()=>browser.create({fetchImpl:fetch}),
  /R261_STAGING_MODE_REQUIRED/);
 assert.throws(()=>browser.create({fetchImpl:fetch,mode:'PRODUCTION'}),
  /R261_STAGING_MODE_REQUIRED/);
});
test('R255 rejects production modes or incomplete canonical staging injection',async()=>{
 const x=fixture();await x.start();
 try{
  assert.throws(()=>gateCreate({...x.gateParams,
   canonicalMode:'PRODUCTION',canonicalEventLookup:x.lookup}),
   /R255_CANONICAL_REVIEW_MODE_REQUIRED/);
  assert.throws(()=>gateCreate({...x.gateParams,
   canonicalMode:'ISOLATED_HOMOLOGATION'}),
   /R255_CANONICAL_REVIEW_MODE_REQUIRED/);
  assert.throws(()=>gateCreate({...x.gateParams,
   canonicalEventLookup:x.lookup}),
   /R255_CANONICAL_REVIEW_MODE_REQUIRED/);
 }finally{await x.cleanup()}
});
test('browser must have a server-authorized personal session before upload',()=>{
 const x=browser.create({fetchImpl:async()=>{throw Error('NO_NETWORK')},
  mode:'ISOLATED_HOMOLOGATION'});
 assert.rejects(x.upload({numeroBO:BO,launch:{from:'index'}}),
  /R261_PERSONAL_SESSION_REQUIRED/);
});
test('real loopback HTTP uses R255 signed JWT session and canonical Index upload',async()=>{
 const x=fixture();await x.start();
 try{
  assert.equal(x.app.isAuthenticated,false);
  const {jwt}=await x.login();
  assert.equal(x.app.isAuthenticated,true);
  const entry=x.photo();
  const result=await x.app.upload({numeroBO:BO,
   launch:x.launch.index,photo:entry});
  assert.equal(result.ok,true);
  assert.equal(result.page,1);
  assert.equal(x.state.writes,1);
  const items=await x.app.list({numeroBO:BO,launch:x.launch.index});
  assert.equal(items.items.length,1);
  const sent=x.state.calls.map(c=>c.options);
  assert(sent.every(c=>c.credentials==='same-origin'&&
   c.mode==='same-origin'&&c.redirect==='error'));
  assert(!sent.some(c=>c.headers.cookie||c.headers.Authorization));
  assert(!JSON.stringify(items).includes('R261-FAKE-FILE'));
  assert(!JSON.stringify(x.app).includes(jwt));
 }finally{await x.cleanup()}
});
test('Index/RSD/RCO share exactly the same canonical BO photos and replay',async()=>{
 const x=fixture();await x.start();
 try{
  await x.login();
  const body=x.photo(1);
  await x.app.upload({numeroBO:BO,launch:x.launch.rsd,photo:body});
  const list=await x.app.list({numeroBO:BO,launch:x.launch.rco});
  assert.equal(list.items.length,1);
  assert.equal((await x.app.upload({numeroBO:BO,
   launch:x.launch.index,photo:body})).duplicate,true);
  assert.equal(x.state.writes,1);
 }finally{await x.cleanup()}
});
test('RCO standalone BO linked only to RCO is accepted with verified event',async()=>{
 const x=fixture({standaloneRco:true});await x.start();
 try{
  await x.login();
  await x.app.upload({numeroBO:BO,launch:x.launch.rco,
   photo:x.photo()});
  const list=await x.app.list({numeroBO:BO,launch:x.launch.index});
  assert.equal(list.items.length,1);
 }finally{await x.cleanup()}
});
test('9 photographs from the 3 entrypoints retain 4-per-page order',async()=>{
 const x=fixture();await x.start();
 try{
  await x.login();
  const options=[x.launch.index,x.launch.rsd,x.launch.rco];
  for(let i=1;i<=9;i++){
   await x.app.upload({numeroBO:BO,
    launch:options[(i-1)%3],photo:x.photo(i)});
  }
  const list=await x.app.list({numeroBO:BO,launch:x.launch.rco});
  assert.deepEqual(list.items.map(p=>p.page),[1,1,1,1,2,2,2,2,3]);
  assert.equal(x.state.writes,9);
 }finally{await x.cleanup()}
});
test('client rejects forged role/eventId/matricula before network request',async()=>{
 const x=fixture();await x.start();
 try{
  await x.login();
  const before=x.state.calls.length;
  for(const key of ['actorMatricula','eventId','token','batalhao']){
   await assert.rejects(x.app.upload({numeroBO:BO,
    launch:x.launch.index,photo:x.photo(1,{[key]:'FORGED'})}),
    /R261_PHOTO_PRIVILEGED_FIELD/);
  }
  assert.equal(x.state.calls.length,before);
  assert.equal(x.state.writes,0);
 }finally{await x.cleanup()}
});
test('server also rejects forged actor, direct eventId or service on authenticated post',async()=>{
 const x=fixture();await x.start();
 try{
  await x.login();
  const csrf=x.state.latestCsrf;
  assert(typeof csrf==='string'&&csrf.length>=16);
  // Use the ACTIVE csrf, not the consumed one-time login challenge;
  // the 403 must prove canonical field rejection, not a CSRF shortcut.
  const body={numeroBO:BO,launch:x.launch.index,
   photo:x.photo(),eventId:EVENT};
  const response=await x.direct('/bo-api/photos/upload',body,csrf);
  assert.equal(response.status,403);
  assert.equal(x.state.writes,0);
 }finally{await x.cleanup()}
});
test('missing canonical BO and duplicate canonical numbers refuse uploads',async()=>{
 const x=fixture();await x.start();
 try{
  await x.login();
  await assert.rejects(x.app.upload({numeroBO:'PM2026987654',
   launch:x.launch.index,photo:x.photo()}),
   /R261_SERVER_REQUEST_REJECTED/);
  x.state.ambiguous=true;
  await assert.rejects(x.app.upload({numeroBO:BO,
   launch:x.launch.index,photo:x.photo()}),
   /R261_SERVER_REQUEST_REJECTED/);
  assert.equal(x.state.writes,0);
 }finally{await x.cleanup()}
});
test('forged RSD service and mismatched RCO report are refused by server',async()=>{
 const x=fixture();await x.start();
 try{
  await x.login();
  await assert.rejects(x.app.upload({numeroBO:BO,
   launch:{...x.launch.rsd,serviceId:'forged-555555'},
   photo:x.photo()}),/R261_SERVER_REQUEST_REJECTED/);
  await assert.rejects(x.app.upload({numeroBO:BO,
   launch:{...x.launch.rco,rcoReportId:'forged-555555'},
   photo:x.photo()}),/R261_SERVER_REQUEST_REJECTED/);
  assert.equal(x.state.writes,0);
 }finally{await x.cleanup()}
});
test('assignment revocation after login is checked inside the archive lock',async()=>{
 const x=fixture();await x.start();
 try{
  await x.login();x.state.revokeInsideLock=true;
  await assert.rejects(x.app.upload({numeroBO:BO,
   launch:x.launch.index,photo:x.photo()}),
   /R261_SERVER_REQUEST_REJECTED/);
  assert.equal(x.state.writes,0);
 }finally{await x.cleanup()}
});
test('cancelled or locked canonical BO refuses all attachments after login',async()=>{
 const x=fixture();await x.start();
 try{
  await x.login();x.event.locked=true;
  await assert.rejects(x.app.upload({numeroBO:BO,
   launch:x.launch.index,photo:x.photo()}),
   /R261_SERVER_REQUEST_REJECTED/);
  x.event.locked=false;x.event.status='CANCELADO';
  await assert.rejects(x.app.upload({numeroBO:BO,
   launch:x.launch.index,photo:x.photo()}),
   /R261_SERVER_REQUEST_REJECTED/);
  assert.equal(x.state.writes,0);
 }finally{await x.cleanup()}
});
test('logout invalidates R255 cookie and clears browser-held csrf token',async()=>{
 const x=fixture();await x.start();
 try{
  await x.login();
  assert.equal(x.app.isAuthenticated,true);
  await x.app.logout();
  assert.equal(x.app.isAuthenticated,false);
  await assert.rejects(x.app.list({numeroBO:BO,launch:x.launch.index}),
   /R261_PERSONAL_SESSION_REQUIRED/);
  assert.equal(x.state.writes,0);
 }finally{await x.cleanup()}
});
test('unapproved email loses access to all routes after login',async()=>{
 const x=fixture();await x.start();
 try{
  await x.login();
  x.row.boPhotoWrite=false;
  await assert.rejects(x.app.upload({numeroBO:BO,
   launch:x.launch.index,photo:x.photo()}),
   /R261_SERVER_REQUEST_REJECTED/);
  assert.equal(x.state.writes,0);
 }finally{await x.cleanup()}
});
test('R261 client strips identity-bearing keys and refuses incorrect content type',async()=>{
 const x=browser.create({mode:'ISOLATED_HOMOLOGATION',
  fetchImpl:async()=>({status:200,headers:{get:()=> 'text/html'},
   redirected:false,json:async()=>({ok:true})})});
 await assert.rejects(x.startLogin(),/R261_NON_JSON_SERVER_RESPONSE/);
 assert.throws(()=>browser.formPayload({numeroBO:BO,
  launch:{from:'index',token:'SHARED'}},'list'),
  /R261_UNTRUSTED_LAUNCH_PROPERTY/);
});
test('no live BO HTML is connected to the new browser client or Google upload',()=>{
 const root=path.resolve(__dirname,'..');
 for(const name of ['boletim_ocorrencia_bptrans_1cprv.html',
  'boletim_ocorrencia_bptrans_1cprv_ios.html']){
  const doc=fs.readFileSync(path.join(root,name),'utf8');
  assert(!doc.includes('r261_bo_browser_session_client'));
  assert(doc.includes('central-bo-photo-annex-v1'));
 }
});
