'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {create:makeVerifier}=require('../R253_GOOGLE_OIDC_CANDIDATE_NO_DEPLOY/r253_google_oidc_verifier.cjs');
const {create:makeProvider,JWKS_URL}=require('../R253_GOOGLE_OIDC_CANDIDATE_NO_DEPLOY/r253_pinned_google_jwks.cjs');
const {createRequestScopedArchive}=require('../R253_GOOGLE_OIDC_CANDIDATE_NO_DEPLOY/r253_request_scoped_bo_bridge.cjs');
const {privateKey,publicKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
const evil=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
const KEY={...publicKey.export({format:'jwk'}),kid:'synthetic-google-test-key',use:'sig',alg:'RS256'};
const AUD='test-only-client-id.apps.googleusercontent.com';
const NOW='2026-11-19T20:07:00.000Z',NOW_S=Date.parse(NOW)/1000;
const NONCE='SERVER_GENERATED_AUTH_NONCE_FROM_COOKIE_SESSION_NOT_BROWSER_BODY';
const EVENT_ID='service-123456789::BO::PM2026123456';
const jpeg=Buffer.from([255,216,255,224,0,16,74,70,73,70,0,0,0,0,255,217]);
const b64=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
const identityClaims={
 iss:'https://accounts.google.com',aud:AUD,sub:'google-sub-123456',
 email:'authorized-user@gmail.com',email_verified:true,
 iat:NOW_S-60,exp:NOW_S+1800,nonce:NONCE
};
function sign(overrides={},headerMods={},key=privateKey){
 const head={alg:'RS256',typ:'JWT',kid:KEY.kid,...headerMods};
 const payload={...identityClaims,...overrides};
 const signed=b64(head)+'.'+b64(payload);
 return signed+'.'+crypto.sign('RSA-SHA256',Buffer.from(signed),key).toString('base64url');
}
function verifier(opts={}){
 const cfg={clientIds:[AUD],now:()=>NOW,
  getTrustedGoogleJwks:async()=>({keys:[KEY]}),...opts};
 return makeVerifier(cfg);
}
async function rejects(changes,code,head,key){
 await assert.rejects(verifier().verify(sign(changes,head,key),{expectedNonce:NONCE}),
  new RegExp('R253_'+code));
}
test('R253 is never production-release allowed',()=>{
 assert.equal(require('../R253_GOOGLE_OIDC_CANDIDATE_NO_DEPLOY/r253_google_oidc_verifier.cjs').releaseAllowed,false);
 assert.equal(require('../R253_GOOGLE_OIDC_CANDIDATE_NO_DEPLOY/r253_request_scoped_bo_bridge.cjs').releaseAllowed,false);
 assert.equal(require('../R253_GOOGLE_OIDC_CANDIDATE_NO_DEPLOY/r253_pinned_google_jwks.cjs').releaseAllowed,false);
});
test('RS256 signature from trusted JWKS, issuer/audience/nonce/expiry verified',async()=>{
 const subject=await verifier().verify(sign(),{expectedNonce:NONCE});
 assert.equal(subject.verification,'SERVER_VERIFIED');
 assert.equal(subject.subject,'google-sub-123456');
 assert.equal(subject.audience,AUD);
 assert.equal(subject.issuer,'https://accounts.google.com');
 assert.equal(subject.email,'authorized-user@gmail.com');
 assert(!JSON.stringify(subject).includes('eyJ'));
});
test('alternate official Google issuer is accepted after signature',async()=>{
 const x=await verifier().verify(sign({iss:'accounts.google.com'}),{expectedNonce:NONCE});
 assert.equal(x.issuer,'https://accounts.google.com');
});
test('tampered payload invalidates RSA signature',async()=>{
 const raw=sign(),parts=raw.split('.');
 const tampered=b64({...identityClaims,sub:'ATTACKER'});
 await assert.rejects(verifier().verify(parts[0]+'.'+tampered+'.'+parts[2],
  {expectedNonce:NONCE}),/R253_JWT_SIGNATURE_INVALID/);
});
test('wrong RSA signing private key is rejected',async()=>{
 await rejects({},'JWT_SIGNATURE_INVALID',{},evil.privateKey);
});
test('alg none/HS256, embedded public keys and remote key URLs are rejected',async()=>{
 for(const altered of [{alg:'none'},{alg:'HS256'},{jwk:KEY},
   {jku:'https://evil.example/keys'},{x5u:'https://evil.example/x509'},
   {crit:['kid']},{typ:'JWE'}]){
  await rejects({},'UNTRUSTED_JWT_HEADER',altered);
 }
});
test('mismatched issuer and aud are rejected before signing key lookup',async()=>{
 await rejects({iss:'https://attacker.example'},'ISSUER_OR_AUDIENCE_MISMATCH');
 await rejects({aud:'malicious-client.apps.googleusercontent.com'},'ISSUER_OR_AUDIENCE_MISMATCH');
 await rejects({azp:'another-client.apps.googleusercontent.com'},'ISSUER_OR_AUDIENCE_MISMATCH');
});
test('expired, future, stale and not-before tokens are rejected',async()=>{
 await rejects({exp:NOW_S-1},'EXPIRED_OR_STALE_TOKEN');
 await rejects({iat:NOW_S+1000},'EXPIRED_OR_STALE_TOKEN');
 await rejects({iat:NOW_S-2000},'EXPIRED_OR_STALE_TOKEN');
 await rejects({nbf:NOW_S+200},'EXPIRED_OR_STALE_TOKEN');
});
test('session-bound nonce cannot be accepted from a request body',async()=>{
 await assert.rejects(verifier().verify(sign(),{expectedNonce:'WRONG_SAFETY_NONCE_12345'}),
  /R253_SESSION_NONCE_MISMATCH/);
 await assert.rejects(verifier().verify(sign(),{}),/R253_SESSION_NONCE_MISMATCH/);
 await assert.rejects(verifier().verify(sign({nonce:'ATTACKER_SUPPLIED_NONCE'}),
  {expectedNonce:NONCE}),/R253_SESSION_NONCE_MISMATCH/);
});
test('unverified email, missing sub and non-authoritative external email are refused',async()=>{
 await rejects({email_verified:false},'SUBJECT_OR_EMAIL_UNVERIFIED');
 await rejects({sub:''},'SUBJECT_OR_EMAIL_UNVERIFIED');
 await rejects({email:'external@outside.example'},'EMAIL_AUTHORITY_UNPROVEN');
});
test('workspace hd permits matching domain and enforces configured domain',async()=>{
 const v=verifier({hostedDomain:'pmpb.example'});
 const claim={email:'militar@pmpb.example',hd:'pmpb.example'};
 const result=await v.verify(sign(claim),{expectedNonce:NONCE});
 assert.equal(result.subject,'google-sub-123456');
 await assert.rejects(v.verify(sign({...claim,hd:'other.example'}),
  {expectedNonce:NONCE}),/R253_EMAIL_AUTHORITY_UNPROVEN|R253_HOSTED_DOMAIN_MISMATCH/);
 await assert.rejects(v.verify(sign(),{expectedNonce:NONCE}),/R253_HOSTED_DOMAIN_MISMATCH/);
});
test('unknown, duplicate, weak or unavailable JWKS keys fail closed',async()=>{
 await assert.rejects(verifier({getTrustedGoogleJwks:async()=>({keys:[]})}).verify(sign(),
  {expectedNonce:NONCE}),/R253_GOOGLE_KEY_NOT_FOUND/);
 await assert.rejects(verifier({getTrustedGoogleJwks:async()=>{throw Error('offline')}}).verify(sign(),
  {expectedNonce:NONCE}),/R253_TRUSTED_KEYS_UNAVAILABLE/);
 await assert.rejects(verifier({getTrustedGoogleJwks:async()=>({keys:[KEY,KEY]})}).verify(sign(),
  {expectedNonce:NONCE}),/R253_GOOGLE_KEY_NOT_FOUND/);
});
test('JWT malformed/oversized/noncanonical pieces are rejected',async()=>{
 await assert.rejects(verifier().verify('not.a.jwt.four',{expectedNonce:NONCE}),/R253_JWT_STRUCTURE/);
 await assert.rejects(verifier().verify('a.b.c',{expectedNonce:NONCE}),/R253_/);
 await assert.rejects(verifier().verify('x'.repeat(20000),{expectedNonce:NONCE}),/R253_ID_TOKEN_REQUIRED/);
});
function fakeResponse(status,payload,headerMap={}){
 const bytes=Buffer.from(typeof payload==='string'?payload:JSON.stringify(payload));
 return {status,headers:{get:k=>headerMap[k.toLowerCase()]||null},
  body:(async function*(){yield bytes})()};
}
test('JWKS adapter only calls hardcoded HTTPS URL and caches by Cache-Control',async()=>{
 let count=0;
 const provider=makeProvider({now:()=>NOW,fetchFn:async(url,opts)=>{
  count++;assert.equal(url,JWKS_URL);assert.equal(opts.redirect,'error');
  assert.equal(opts.method,'GET');
  return fakeResponse(200,{keys:[KEY]},{'cache-control':'public,max-age=3600',
   'content-type':'application/json'});
 }});
 const a=await provider.getTrustedGoogleJwks();
 const b=await provider.getTrustedGoogleJwks();
 assert.equal(count,1);assert.equal(a,b);
});
test('JWKS network and HTTP errors fail closed, no client-selected endpoint',async()=>{
 for(const fn of [
  async()=>{throw Error('network')},
  async()=>fakeResponse(302,{keys:[KEY]}),
  async()=>fakeResponse(500,{keys:[KEY]}),
  async()=>fakeResponse(200,{keys:[KEY,KEY]},{'content-type':'application/json'}),
  async()=>fakeResponse(200,'not-json',{'content-type':'application/json'})
 ]){
  const provider=makeProvider({now:()=>NOW,fetchFn:fn});
  await assert.rejects(provider.getTrustedGoogleJwks(),/R253_JWKS_/);
 }
});
test('JWKS stale cached keys cannot be reused after failed refresh',async()=>{
 let clock=NOW,attempt=0;
 const provider=makeProvider({now:()=>clock,fetchFn:async()=>{
  attempt++;if(attempt>1)throw Error('network');
  return fakeResponse(200,{keys:[KEY]},{'cache-control':'max-age=1'});
 }});
 await provider.getTrustedGoogleJwks();
 clock=new Date(Date.parse(NOW)+2000).toISOString();
 await assert.rejects(provider.getTrustedGoogleJwks(),/R253_JWKS_NETWORK_UNAVAILABLE/);
});
function makeApp(){
 const state={
  identity:sign(),nonce:NONCE,now:NOW,
  roster:[{email:'authorized-user@gmail.com',idpSubject:'google-sub-123456',
   matricula:'000.000-0',batalhao:'BPTran',companhia:'1 CPRv',status:'ATIVO',boPhotoWrite:true}],
  assignment:[{matricula:'000.000-0',eventId:EVENT_ID,
   batalhao:'BPTran',companhia:'1 CPRv',status:'ATIVO',expiresAt:'2026-11-19T21:00:00.000Z'}],
  event:{eventId:EVENT_ID,tipo:'BO',status:'ATIVO',numeroDocumento:'PM2026123456',
   serviceId:'service-123456789',rsdReportId:'rsd-123456789',
   batalhao:'BPTran',companhia:'1 CPRv',locked:false},
  requests:new Map(),photos:new Map(),files:new Map(),writes:0,revokeInsideLock:false
 };
 const clone=x=>structuredClone(x);
 const authority={
  now:()=>state.now,
  lookupRosterByEmail:async()=>clone(state.roster),
  listAssignmentsByMatricula:async()=>clone(state.assignment),
  readCanonicalEvent:async()=>clone(state.event)
 };
 const storage={
  now:()=>state.now,
  decodeJpeg:b=>Buffer.from(b,'base64'),
  sha256:b=>crypto.createHash('sha256').update(b).digest('hex'),
  authenticate:async()=>{throw Error('UNTRUSTED_STORAGE_AUTH_NOT_ALLOWED')},
  getEvent:async()=>{throw Error('UNTRUSTED_STORAGE_EVENT_NOT_ALLOWED')},
  withExclusiveLock:async(_key,fn)=>{
   if(state.revokeInsideLock){state.assignment[0].status='REVOGADO';state.revokeInsideLock=false}
   return fn();
  },
  getRequest:async id=>clone(state.requests.get(id)||null),
  getPhoto:async(ev,id)=>clone(state.photos.get(ev+':'+id)||null),
  listPhotos:async ev=>[...state.photos.values()].filter(p=>p.eventId===ev).map(clone),
  putRequest:async row=>{state.writes++;state.requests.set(row.requestId,clone(row))},
  putPhoto:async row=>{state.writes++;state.photos.set(row.eventId+':'+row.photoId,clone(row))},
  findFileByStableName:async n=>clone(state.files.get(n)||null),
  writePrivateFile:async x=>{
   state.writes++;const f={fileId:'SYNTHETIC-PRIVATE-FILE',digest:x.digest,eventId:x.eventId};
   state.files.set(x.stableName,f);return clone(f);
  },
  deletePrivateFile:async()=>{state.writes++}
 };
 const bridge=()=>createRequestScopedArchive({
  idToken:state.identity,trustedNonce:state.nonce,
  oidcVerifier:verifier({now:()=>state.now}),
  clientId:AUD,authority,storage
 });
 const request=()=>({
  requestId:'post-'+crypto.randomUUID(),photoId:'photo-'+crypto.randomUUID(),
  eventId:EVENT_ID,numeroBO:'PM2026123456',serviceId:'service-123456789',
  position:1,caption:'SINTETICA',
  renderedDataUrl:'data:image/jpeg;base64,'+jpeg.toString('base64')
 });
 return {state,bridge,request};
}
test('signed Google-format token -> R252 ACL -> private R239-compatible fake write/list',async()=>{
 const a=makeApp();const r=a.bridge(),body=a.request();
 assert.equal((await r.upload(body)).ok,true);
 assert.equal((await r.upload(body)).duplicate,true);
 assert.equal(a.state.files.size,1);
 const res=await r.list({eventId:EVENT_ID,serviceId:'service-123456789'});
 assert.equal(res.items.length,1);assert(!JSON.stringify(res).includes('fileId'));
});
test('forged body actor does not override verified subject or assignment',async()=>{
 const a=makeApp(),body={...a.request(),matricula:'999.999-9',role:'ADMIN',
  actor:{source:'TRUSTED_SERVER_SESSION',allowedEventIds:[EVENT_ID]}};
 await a.bridge().upload(body);
 assert.equal([...a.state.requests.values()][0].actorMatricula,'000.000-0');
});
test('invalid signature fails before any private file write',async()=>{
 const a=makeApp();
 a.state.identity=sign({}, {},evil.privateKey);
 await assert.rejects(a.bridge().upload(a.request()),/R253_JWT_SIGNATURE_INVALID/);
 assert.equal(a.state.writes,0);
});
test('changed trusted server nonce fails even for correctly signed ID token',async()=>{
 const a=makeApp();a.state.nonce='SERVER_CHANGED_NONCE_NO_OLD_SESSION_MATCH';
 await assert.rejects(a.bridge().upload(a.request()),/R253_SESSION_NONCE_MISMATCH/);
 assert.equal(a.state.writes,0);
});
test('revoked event assignment inside lock blocks upload even with valid signature',async()=>{
 const a=makeApp();a.state.revokeInsideLock=true;
 await assert.rejects(a.bridge().upload(a.request()),/R252_EVENT_ASSIGNMENT_REVOKED/);
 assert.equal(a.state.writes,0);
});
test('new signed token for different Google sub cannot inherit old roster',async()=>{
 const a=makeApp();a.state.identity=sign({sub:'SECOND-GOOGLE-ACCOUNT'});
 await assert.rejects(a.bridge().upload(a.request()),/R252_PERSONAL_ACTOR_NOT_APPROVED/);
 assert.equal(a.state.writes,0);
});
test('closed canonical BO cannot be modified through a valid Google-format token',async()=>{
 const a=makeApp();a.state.event.status='FINALIZADO';
 await assert.rejects(a.bridge().upload(a.request()),/R239_BO_NOT_OPEN_FOR_ATTACHMENT/);
 assert.equal(a.state.writes,0);
});
test('stale signed token refused after clock advance',async()=>{
 const a=makeApp();a.state.now=new Date(Date.parse(NOW)+2500000).toISOString();
 await assert.rejects(a.bridge().upload(a.request()),/R253_EXPIRED_OR_STALE_TOKEN/);
 assert.equal(a.state.writes,0);
});
