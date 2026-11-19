'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const http=require('node:http');
const {create:makeVerifier}=require('../R253_GOOGLE_OIDC_CANDIDATE_NO_DEPLOY/r253_google_oidc_verifier.cjs');
const {create:makeSession,LOGIN_COOKIE,SESSION_COOKIE}=require('../R254_BO_SESSION_CANDIDATE_NO_DEPLOY/r254_server_session_gate.cjs');
const {makeHandler}=require('../R254_BO_SESSION_CANDIDATE_NO_DEPLOY/r254_http_handler.cjs');
const now0='2026-11-19T21:00:00.000Z',clientId='fictitious-google-client.apps.googleusercontent.com';
const origin='https://bo.unit-test.example',eventId='srv-123456789::BO::PM2026123456';
const {privateKey,publicKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
const attacker=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
const jwk={...publicKey.export({format:'jwk'}),kid:'fictitious-key-r254',alg:'RS256',use:'sig'};
const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
const jpeg=Buffer.from([255,216,255,224,0,16,74,70,73,70,0,0,0,0,255,217]);
function sign(nonce,overrides={},key=privateKey){
 const payload={iss:'https://accounts.google.com',aud:clientId,
  sub:'fake-sub-001',email:'fake-police@gmail.com',email_verified:true,
  iat:Date.parse(now0)/1000-20,exp:Date.parse(now0)/1000+700,nonce,...overrides};
 const input=enc({alg:'RS256',kid:jwk.kid,typ:'JWT'})+'.'+enc(payload);
 return input+'.'+crypto.sign('RSA-SHA256',Buffer.from(input),key).toString('base64url');
}
function cookieFrom(setCookies,name){
 const cookie=setCookies.find(x=>x.startsWith(name+'='));
 assert(cookie,'expected '+name+' cookie');
 return cookie.split(';')[0];
}
function fixture(){
 const state={
  clock:now0,roster:[{email:'fake-police@gmail.com',idpSubject:'fake-sub-001',
    matricula:'000.000-0',batalhao:'BPTran',companhia:'1 CPRv',
    status:'ATIVO',boPhotoWrite:true}],
  assignments:[{matricula:'000.000-0',eventId,batalhao:'BPTran',
    companhia:'1 CPRv',status:'ATIVO',expiresAt:'2026-11-19T22:00:00.000Z'}],
  event:{eventId,tipo:'BO',status:'ATIVO',numeroDocumento:'PM2026123456',
    serviceId:'srv-123456789',batalhao:'BPTran',companhia:'1 CPRv',locked:false},
  requests:new Map(),photos:new Map(),files:new Map(),writes:0,revokeInsideLock:false
 };
 const copy=v=>structuredClone(v);
 const authority={
  lookupRosterByEmail:async()=>copy(state.roster),
  listAssignmentsByMatricula:async()=>copy(state.assignments),
  readCanonicalEvent:async()=>copy(state.event)
 };
 const storage={
  now:()=>state.clock,decodeJpeg:x=>Buffer.from(x,'base64'),
  sha256:x=>crypto.createHash('sha256').update(x).digest('hex'),
  authenticate:async()=>{throw Error('STORAGE_MUST_NOT_AUTHENTICATE')},
  getEvent:async()=>{throw Error('STORAGE_MUST_NOT_AUTHORIZE')},
  withExclusiveLock:async(_k,fn)=>{
    if(state.revokeInsideLock){state.revokeInsideLock=false;state.assignments[0].status='REVOGADO'}
    if(typeof state.onLock==='function')state.onLock();
    return fn();
  },
  getRequest:async key=>copy(state.requests.get(key)||null),
  getPhoto:async(id,pid)=>copy(state.photos.get(id+':'+pid)||null),
  listPhotos:async id=>[...state.photos.values()].filter(p=>p.eventId===id).map(copy),
  putRequest:async p=>{state.writes++;state.requests.set(p.requestId,copy(p))},
  putPhoto:async p=>{state.writes++;state.photos.set(p.eventId+':'+p.photoId,copy(p))},
  findFileByStableName:async n=>copy(state.files.get(n)||null),
  writePrivateFile:async p=>{
    state.writes++;const result={fileId:'PRIVATE-FAKE-FILE',digest:p.digest,eventId:p.eventId};
    state.files.set(p.stableName,result);return copy(result);
  },
  deletePrivateFile:async()=>{state.writes++}
 };
 const oidcVerifier=makeVerifier({
  clientIds:[clientId],getTrustedGoogleJwks:async()=>({keys:[jwk]}),
  now:()=>state.clock
 });
 const gate=makeSession({
   allowedOrigin:origin,clientId,oidcVerifier,authority,storage,now:()=>state.clock
 });
 const request=()=>({
   requestId:'post-'+crypto.randomUUID(),photoId:'photo-'+crypto.randomUUID(),
   eventId,numeroBO:'PM2026123456',serviceId:'srv-123456789',
   position:1,caption:'FOTO FICTICIA',
   renderedDataUrl:'data:image/jpeg;base64,'+jpeg.toString('base64')
 });
 function start(){
  const first=gate.beginLogin({method:'POST',origin});
  assert.match(cookieFrom(first.setCookies,LOGIN_COOKIE),/^__Host-bo_login=/);
  assert(first.setCookies[0].includes('HttpOnly')&&first.setCookies[0].includes('Secure'));
  assert(first.setCookies[0].includes('SameSite=Strict'));
  return first;
 }
 async function login({idToken,originOverride,csrfOverride}={}){
  const first=start();
  const second=await gate.finishLogin({method:'POST',origin:originOverride||origin,
   cookies:{[LOGIN_COOKIE]:cookieFrom(first.setCookies,LOGIN_COOKIE).split('=')[1]},
   csrf:csrfOverride===undefined?first.csrf:csrfOverride,
   idToken:idToken||sign(first.nonce)});
  return {first,second,session:cookieFrom(second.setCookies,SESSION_COOKIE).split('=')[1]};
 }
 function call(session,csrf,operation,body){
  return gate.operate({method:'POST',origin,cookies:{[SESSION_COOKIE]:session},
    csrf,operation,body});
 }
 return {state,gate,start,login,call,request};
}
test('R254 code explicitly blocks production release',()=>{
 assert.equal(require('../R254_BO_SESSION_CANDIDATE_NO_DEPLOY/r254_server_session_gate.cjs').releaseAllowed,false);
 assert.equal(require('../R254_BO_SESSION_CANDIDATE_NO_DEPLOY/r254_http_handler.cjs').releaseAllowed,false);
});
test('server challenge -> signed token -> independent csrf session -> secure BO archive and logout',async()=>{
 const f=fixture();const {second,session}=await f.login();
 assert.notEqual(second.csrf,undefined);
 assert(!JSON.stringify(second).includes('fake-police@gmail.com'));
 assert(!JSON.stringify(second).includes('eyJ'));
 const body=f.request();const first=await f.call(session,second.csrf,'upload',body);
 assert.equal(first.ok,true);assert.equal(first.duplicate,false);
 assert.equal((await f.call(session,second.csrf,'upload',body)).duplicate,true);
 assert.equal(f.state.files.size,1);
 const listed=await f.call(session,second.csrf,'list',{eventId,serviceId:'srv-123456789'});
 assert.equal(listed.items.length,1);
 assert(!JSON.stringify(listed).includes('fileId'));
 const result=f.gate.logout({method:'POST',origin,
   cookies:{[SESSION_COOKIE]:session},csrf:second.csrf});
 assert.equal(result.ok,true);
 await assert.rejects(f.call(session,second.csrf,'upload',f.request()),/R254_SESSION_REQUIRED/);
});
test('server refuses login start unless same-origin POST',()=>{
 const f=fixture();
 assert.throws(()=>f.gate.beginLogin({method:'GET',origin}),/R254_UNTRUSTED_ORIGIN_OR_METHOD/);
 assert.throws(()=>f.gate.beginLogin({method:'POST',origin:'https://evil.test'}),/R254_UNTRUSTED_ORIGIN_OR_METHOD/);
 assert.throws(()=>f.gate.beginLogin({method:'POST'}),/R254_UNTRUSTED_ORIGIN_OR_METHOD/);
});
test('login only accepts one-time challenge and correct server-issued csrf',async()=>{
 const f=fixture();const start=f.start();const id=start.setCookies[0].split(';')[0].split('=')[1];
 await assert.rejects(f.gate.finishLogin({method:'POST',origin,
   cookies:{[LOGIN_COOKIE]:id},csrf:'WRONG_CSRF',idToken:sign(start.nonce)}),
   /R254_LOGIN_CHALLENGE_EXPIRED_OR_CSRF/);
 await assert.rejects(f.gate.finishLogin({method:'POST',origin,
   cookies:{[LOGIN_COOKIE]:id},csrf:start.csrf,idToken:sign(start.nonce)}),
   /R254_LOGIN_CHALLENGE_REQUIRED/);
});
test('signed token for another nonce cannot produce a personal session',async()=>{
 const f=fixture(),start=f.start();
 await assert.rejects(f.gate.finishLogin({method:'POST',origin,
  cookies:{[LOGIN_COOKIE]:start.setCookies[0].split(';')[0].split('=')[1]},
  csrf:start.csrf,idToken:sign('ATTACKER_NONCE')}),
  /R253_SESSION_NONCE_MISMATCH/);
 assert.equal(f.state.writes,0);
});
test('valid header and issuer but wrong RSA signer fails and does not mint session',async()=>{
 const f=fixture(),start=f.start();
 await assert.rejects(f.gate.finishLogin({method:'POST',origin,
  cookies:{[LOGIN_COOKIE]:start.setCookies[0].split(';')[0].split('=')[1]},
  csrf:start.csrf,idToken:sign(start.nonce,{},attacker.privateKey)}),
  /R253_JWT_SIGNATURE_INVALID/);
});
test('signed token from another subject cannot inherit a local roster row',async()=>{
 const f=fixture(),start=f.start();
 await assert.rejects(f.gate.finishLogin({method:'POST',origin,
  cookies:{[LOGIN_COOKIE]:start.setCookies[0].split(';')[0].split('=')[1]},
  csrf:start.csrf,idToken:sign(start.nonce,{sub:'UNRELATED'})}),
  /R254_PERSONAL_ROSTER_NOT_APPROVED/);
});
test('no shared operational tokens or forged body identity can override actor',async()=>{
 const f=fixture(),{second,session}=await f.login();
 const body={...f.request(),token:'CENTRAL_TOKEN_SHARED',email:'evil@fake.test',
   actor:{matricula:'999.999-9',allowedEventIds:[eventId],roles:['ADMIN']}};
 const result=await f.call(session,second.csrf,'upload',body);
 assert.equal(result.ok,true);
 assert.equal([...f.state.requests.values()][0].actorMatricula,'000.000-0');
});
test('wrong or missing csrf and invalid cookies block access',async()=>{
 const f=fixture(),{second,session}=await f.login();
 for(const c of ['', 'WRONG_CSRF']){
  await assert.rejects(f.call(session,c,'upload',f.request()),/R254_SESSION_CSRF_INVALID/);
 }
 await assert.rejects(f.call('FAKE_SESSION',second.csrf,'upload',f.request()),/R254_SESSION_REQUIRED/);
 assert.equal(f.state.writes,0);
});
test('expired session is not renewed by upload',async()=>{
 const f=fixture(),{second,session}=await f.login();
 f.state.clock='2026-11-19T21:20:00.000Z';
 await assert.rejects(f.call(session,second.csrf,'upload',f.request()),/R254_SESSION_EXPIRED/);
 assert.equal(f.state.writes,0);
});
test('personal assignment revoked after login blocks upload even before writes',async()=>{
 const f=fixture(),{second,session}=await f.login();
 f.state.assignments=[];
 await assert.rejects(f.call(session,second.csrf,'upload',f.request()),/R252_BO_OUTSIDE_PERSONAL_ASSIGNMENT|R252_EVENT_ASSIGNMENT_REVOKED/);
 assert.equal(f.state.writes,0);
});
test('personal assignment revoked while waiting for lock also blocks write',async()=>{
 const f=fixture(),{second,session}=await f.login();
 f.state.revokeInsideLock=true;
 await assert.rejects(f.call(session,second.csrf,'upload',f.request()),/R252_EVENT_ASSIGNMENT_REVOKED/);
 assert.equal(f.state.writes,0);
});
test('deactivated roster after login is checked again on operation',async()=>{
 const f=fixture(),{second,session}=await f.login();
 f.state.roster[0].status='DESLIGADO';
 await assert.rejects(f.call(session,second.csrf,'upload',f.request()),/R252_PERSONAL_ACTOR_NOT_APPROVED/);
 assert.equal(f.state.writes,0);
});
test('request for another BO even with valid cookie does not create file',async()=>{
 const f=fixture(),{second,session}=await f.login();
 await assert.rejects(f.call(session,second.csrf,'upload',
  {...f.request(),eventId:'srv-123456789::BO::PM2026123457'}),
  /R252_EVENT_ASSIGNMENT_REVOKED/);
 assert.equal(f.state.writes,0);
});
test('operation must be whitelisted, and no client can invoke arbitrary storage routes',async()=>{
 const f=fixture(),{second,session}=await f.login();
 await assert.rejects(f.call(session,second.csrf,'deleteAll',{eventId}),
  /R254_OPERATION_NOT_SUPPORTED/);
 assert.equal(f.state.writes,0);
});
async function httpFixture(){
 const f=fixture();
 const server=http.createServer(makeHandler(f.gate));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const port=server.address().port;
 async function post(path,body={},headers={}){
  const response=await fetch('http://127.0.0.1:'+port+path,{
   method:'POST',
   headers:{'content-type':'application/json',origin,...headers},
   body:JSON.stringify(body)
  });
  return {status:response.status,data:await response.json(),
    cookies:response.headers.getSetCookie()};
 }
 return {f,server,post};
}
test('real loopback HTTP: cookie login, JSON upload, metadata list, logout',async()=>{
 const {f,server,post}=await httpFixture();
 try{
  const first=await post('/bo-api/login/start');
  assert.equal(first.status,200);
  const challengeCookie=cookieFrom(first.cookies,LOGIN_COOKIE);
  const second=await post('/bo-api/login/complete',
   {idToken:sign(first.data.nonce)},{
     cookie:challengeCookie,'x-bo-csrf':first.data.csrf
   });
  assert.equal(second.status,200);
  const sessionCookie=cookieFrom(second.cookies,SESSION_COOKIE);
  assert(!JSON.stringify(second.data).includes('fake-sub-001'));
  const bad=await post('/bo-api/photos/upload',f.request(),{
   cookie:sessionCookie,'x-bo-csrf':'CSRF_WRONG'
  });
  assert.equal(bad.status,403);
  const ok=await post('/bo-api/photos/upload',f.request(),{
   cookie:sessionCookie,'x-bo-csrf':second.data.csrf
  });
  assert.equal(ok.status,200);assert.equal(ok.data.ok,true);
  const list=await post('/bo-api/photos/list',{eventId,serviceId:'srv-123456789'},{
   cookie:sessionCookie,'x-bo-csrf':second.data.csrf
  });
  assert.equal(list.status,200);
  assert.equal(list.data.items.length,1);
  assert(!JSON.stringify(list).includes('fileId'));
  const logout=await post('/bo-api/logout',{},{
   cookie:sessionCookie,'x-bo-csrf':second.data.csrf
  });
  assert.equal(logout.status,200);
  const after=await post('/bo-api/photos/list',{eventId,serviceId:'srv-123456789'},{
   cookie:sessionCookie,'x-bo-csrf':second.data.csrf
  });
  assert.equal(after.status,403);
 }finally{await new Promise(r=>server.close(r))}
});
test('HTTP adapter rejects cross-origin, GET, query-string route and duplicate cookies',async()=>{
 const {server,post}=await httpFixture();
 try{
  assert.equal((await post('/bo-api/login/start',{}, {origin:'https://evil.test'})).status,403);
  assert.equal((await post('/bo-api/login/start?debug=true')).status,403);
  assert.equal((await post('/bo-api/login/start',{}, {cookie:'x=a; x=b'})).status,400);
  const r=await fetch('http://127.0.0.1:'+server.address().port+'/bo-api/login/start',{method:'GET'});
  assert.equal(r.status,403);
 }finally{await new Promise(r=>server.close(r))}
});

test('logout during the lock revokes the session before photo writes',async()=>{
 const f=fixture(),{second,session}=await f.login();
 f.state.onLock=()=>f.gate.logout({method:'POST',origin,
  cookies:{[SESSION_COOKIE]:session},csrf:second.csrf});
 await assert.rejects(f.call(session,second.csrf,'upload',f.request()),
  /R254_SESSION_REVOKED_DURING_OPERATION/);
 assert.equal(f.state.writes,0);
});
test('concurrent completion of one login challenge mints only one session',async()=>{
 const f=fixture(),start=f.start();
 const ctx={method:'POST',origin,
  cookies:{[LOGIN_COOKIE]:cookieFrom(start.setCookies,LOGIN_COOKIE).split('=')[1]},
  csrf:start.csrf,idToken:sign(start.nonce)};
 const results=await Promise.allSettled([
  f.gate.finishLogin(ctx),f.gate.finishLogin(ctx)
 ]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(results.filter(x=>x.status==='rejected').length,1);
 assert.match(results.find(x=>x.status==='rejected').reason.message,
  /R254_LOGIN_CHALLENGE_REQUIRED/);
});
test('no misconfigured HTTP origin can initialize the production-like session',()=>{
 assert.throws(()=>makeSession({
  allowedOrigin:'http://bo.example.test',clientId,oidcVerifier:{verify:async()=>null},
  now:()=>now0,authority:{},storage:{}
 }),/R254_CONFIGURATION_INCOMPLETE/);
});
test('HTTP JSON body cap returns rejection without creating a session',async()=>{
 const {server,post}=await httpFixture();
 try{
  const response=await post('/bo-api/login/start',
   {large:'x'.repeat(3000100)});
  assert.equal(response.status,413);
  assert.equal(response.data.ok,false);
 }finally{await new Promise(r=>server.close(r))}
});
