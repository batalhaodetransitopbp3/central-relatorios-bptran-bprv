'use strict';
/*
 * R254: request-bound Google OIDC session / CSRF / nonce proof of concept.
 * Candidate ONLY: volatile single-process Map, not a distributed store.
 * Do NOT expose or deploy without hardened server-side persistence, rate
 * limits, audited app identity, security review and production approval.
 */
const crypto=require('node:crypto');
const authorityGate=require('../R252_BO_PERSONAL_IDENTITY_CANDIDATE_NO_DEPLOY/r252_personal_bo_gate');
const archiveCore=require('../R252_BO_PERSONAL_IDENTITY_CANDIDATE_NO_DEPLOY/r252_bo_photo_archive_core');
const LOGIN_COOKIE='__Host-bo_login',SESSION_COOKIE='__Host-bo_session';
const SESSION_SECONDS=900,CHALLENGE_SECONDS=300;
function deny(code){const e=new Error('R254_'+code);e.code=code;throw e}
function randomToken(){return crypto.randomBytes(32).toString('base64url')}
function safeEqual(a,b){
 if(typeof a!=='string'||typeof b!=='string'||!a||!b)return false;
 const x=Buffer.from(a),y=Buffer.from(b);
 return x.length===y.length&&crypto.timingSafeEqual(x,y);
}
function cookieSet(name,value,seconds){
 return name+'='+value+'; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age='+seconds;
}
function cookieClear(name){return cookieSet(name,'',0)}
function create({allowedOrigin,clientId,oidcVerifier,authority,storage,now}={}){
 if(typeof allowedOrigin!=='string'||!/^https:\/\/[^/]+$/.test(allowedOrigin)||
    !clientId||!oidcVerifier||typeof oidcVerifier.verify!=='function'||
    !authority||!storage||typeof now!=='function')
   deny('CONFIGURATION_INCOMPLETE');
 for(const name of ['lookupRosterByEmail','listAssignmentsByMatricula','readCanonicalEvent']){
   if(typeof authority[name]!=='function')deny('AUTHORITY_ADAPTER_MISSING');
 }
 const challenges=new Map(),sessions=new Map();
 function nowMs(){
   const ms=Date.parse(now());
   if(!Number.isFinite(ms))deny('SERVER_CLOCK_INVALID');
   return ms;
 }
 function guard(ctx){
   if(!ctx||ctx.method!=='POST'||ctx.origin!==allowedOrigin)
     deny('UNTRUSTED_ORIGIN_OR_METHOD');
 }
 function prune(map,clock){
   for(const [key,value] of map){
     if(value.expiresMs<=clock)map.delete(key);
   }
 }
 function beginLogin(ctx){
   guard(ctx);
   const clock=nowMs();
   prune(challenges,clock);prune(sessions,clock);
   if(challenges.size>=2000||sessions.size>=2000)
     deny('SERVER_SESSION_CAPACITY');
   const id=randomToken(),nonce=randomToken(),csrf=randomToken();
   challenges.set(id,{nonce,csrf,expiresMs:clock+CHALLENGE_SECONDS*1000});
   return {
     ok:true,nonce,csrf,expiresInSeconds:CHALLENGE_SECONDS,
     setCookies:[cookieSet(LOGIN_COOKIE,id,CHALLENGE_SECONDS)]
   };
 }
 async function finishLogin(ctx){
   guard(ctx);
   const clock=nowMs();
   const id=ctx.cookies&&ctx.cookies[LOGIN_COOKIE];
   if(typeof id!=='string'||!challenges.has(id))deny('LOGIN_CHALLENGE_REQUIRED');
   const pending=challenges.get(id);
   // Consume BEFORE awaiting ID token verification, preventing concurrent
   // completions from turning the same challenge into multiple sessions.
   challenges.delete(id);
   if(pending.expiresMs<=clock||!safeEqual(ctx.csrf,pending.csrf))
     deny('LOGIN_CHALLENGE_EXPIRED_OR_CSRF');
   if(typeof ctx.idToken!=='string'||ctx.idToken.length>16384)
     deny('ID_TOKEN_REQUIRED');
   const verified=await oidcVerifier.verify(ctx.idToken,{expectedNonce:pending.nonce});
   if(!verified||verified.verification!=='SERVER_VERIFIED'||
      verified.issuer!=='https://accounts.google.com'||
      verified.audience!==clientId||verified.emailVerified!==true||
      typeof verified.subject!=='string'||!verified.subject||
      typeof verified.email!=='string')
     deny('VERIFIED_GOOGLE_IDENTITY_REQUIRED');
   const expiration=Date.parse(verified.expiresAt);
   if(!Number.isFinite(expiration)||expiration<=nowMs())
     deny('ID_TOKEN_EXPIRED');
   // No session is minted for an unapproved or conflicting military roster.
   const rows=await authority.lookupRosterByEmail(verified.email.toLowerCase());
   if(!Array.isArray(rows)||rows.length!==1||!rows[0]||
      String(rows[0].email||'').toLowerCase()!==verified.email.toLowerCase()||
      rows[0].idpSubject!==verified.subject||
      String(rows[0].status||'').toUpperCase()!=='ATIVO'||
      rows[0].boPhotoWrite!==true)
     deny('PERSONAL_ROSTER_NOT_APPROVED');
   const sid=randomToken(),csrf=randomToken();
   const session=Object.freeze({
     verified:Object.freeze({...verified}),
     csrf,expiresMs:Math.min(expiration,nowMs()+SESSION_SECONDS*1000)
   });
   if(session.expiresMs<=nowMs())deny('SESSION_ALREADY_EXPIRED');
   prune(sessions,nowMs());
   if(sessions.size>=2000)deny('SERVER_SESSION_CAPACITY');
   sessions.set(sid,session);
   return {
     ok:true,csrf,expiresInSeconds:Math.max(1,Math.floor((session.expiresMs-nowMs())/1000)),
     setCookies:[cookieClear(LOGIN_COOKIE),cookieSet(SESSION_COOKIE,sid,SESSION_SECONDS)]
   };
 }
 function sessionFrom(ctx){
   guard(ctx);
   const sid=ctx.cookies&&ctx.cookies[SESSION_COOKIE];
   if(typeof sid!=='string'||!sessions.has(sid))deny('SESSION_REQUIRED');
   const session=sessions.get(sid);
   if(!session||session.expiresMs<=nowMs()){
     sessions.delete(sid);deny('SESSION_EXPIRED');
   }
   if(!safeEqual(ctx.csrf,session.csrf))
     deny('SESSION_CSRF_INVALID');
   return {sid,session};
 }
 async function operate(ctx){
   const {sid,session}=sessionFrom(ctx);
   if(ctx.operation!=='upload'&&ctx.operation!=='list')
     deny('OPERATION_NOT_SUPPORTED');
   if(!ctx.body||typeof ctx.body!=='object'||Array.isArray(ctx.body))
     deny('REQUEST_BODY_REQUIRED');
   const personal=authorityGate.create({
     expectedIssuer:'https://accounts.google.com',
     expectedAudience:clientId,
     now,
     lookupRosterByEmail:authority.lookupRosterByEmail,
     listAssignmentsByMatricula:authority.listAssignmentsByMatricula,
     readCanonicalEvent:authority.readCanonicalEvent,
     getVerifiedIdentity:async()=>{
       // Recheck live server session, even INSIDE archive's exclusive lock.
       if(sessions.get(sid)!==session||session.expiresMs<=nowMs())
         deny('SESSION_REVOKED_DURING_OPERATION');
       return session.verified;
     }
   });
   // The injected storage never gets to choose actor or event permission.
   const service=archiveCore.create({
     ...storage,authenticate:personal.authenticate,getEvent:personal.getEvent
   });
   return ctx.operation==='upload'
     ?service.upload(ctx.body,undefined):service.list(ctx.body,undefined);
 }
 function logout(ctx){
   const {sid}=sessionFrom(ctx);
   sessions.delete(sid);
   return {ok:true,setCookies:[cookieClear(SESSION_COOKIE),cookieClear(LOGIN_COOKIE)]};
 }
 return Object.freeze({beginLogin,finishLogin,operate,logout,releaseAllowed:false});
}
module.exports=Object.freeze({create,LOGIN_COOKIE,SESSION_COOKIE,releaseAllowed:false});
