'use strict';
/*
 * R252: fail-closed personal authority for R239, ISOLATED CANDIDATE ONLY.
 * No doPost route, no Google access, no deploy permission.
 *
 * SECURITY BOUNDARY: getVerifiedIdentity MUST be a server-side VERIFIED IdP
 * assertion (signature, issuer, audience and expiry checked independently).
 * NEVER implement it by reading an email, matrícula, role or access flag
 * supplied in a request body, query string, cookie or localStorage.
 *
 * R239 rechecks getEvent inside its exclusive lock: this resolver rechecks
 * the verified subject, roster and assignment on EVERY getEvent invocation.
 */
(function(root,factory){
  const exported=factory();
  if(typeof module==='object'&&module.exports)module.exports=exported;
  else root.R252PersonalBoGate=exported;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const deny=code=>{const err=new Error('R252_'+code);err.code=code;throw err;};
  const s=v=>typeof v==='string'?v.trim():'';
  const lower=v=>s(v).toLowerCase();
  const emailRx=/^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  function create(deps){
    const d=deps||{};
    for(const name of ['getVerifiedIdentity','lookupRosterByEmail',
      'listAssignmentsByMatricula','readCanonicalEvent','now']){
      if(typeof d[name]!=='function')deny('MISSING_TRUSTED_ADAPTER_'+name);
    }
    if(!s(d.expectedIssuer)||!s(d.expectedAudience))deny('MISSING_IDP_CONFIGURATION');
    const maxAgeMs=Number.isInteger(d.maxAgeMs)?d.maxAgeMs:15*60*1000;
    if(maxAgeMs<60000||maxAgeMs>60*60*1000)deny('INVALID_SESSION_MAX_AGE');
    async function verifiedPrincipal(){
      const now=Date.parse(d.now());
      if(!Number.isFinite(now))deny('INVALID_SERVER_CLOCK');
      const assertion=await d.getVerifiedIdentity();
      if(!assertion||assertion.verification!=='SERVER_VERIFIED'||
          assertion.issuer!==d.expectedIssuer||
          assertion.audience!==d.expectedAudience||
          assertion.emailVerified!==true||
          !s(assertion.subject)||!emailRx.test(lower(assertion.email)))
        deny('VERIFIED_IDENTITY_REQUIRED');
      const issued=Date.parse(assertion.issuedAt),expiry=Date.parse(assertion.expiresAt);
      if(!Number.isFinite(issued)||!Number.isFinite(expiry)||
          issued>now||now-issued>maxAgeMs||expiry<=now||expiry<=issued)
        deny('PERSONAL_SESSION_EXPIRED');
      const email=lower(assertion.email);
      const rows=await d.lookupRosterByEmail(email);
      if(!Array.isArray(rows)||rows.length!==1)deny('ROSTER_NOT_UNIQUE');
      const row=rows[0]||{};
      if(lower(row.email)!==email||s(row.idpSubject)!==s(assertion.subject)||
         s(row.status).toUpperCase()!=='ATIVO'||row.boPhotoWrite!==true||
         !s(row.matricula)||!s(row.batalhao)||!s(row.companhia))
        deny('PERSONAL_ACTOR_NOT_APPROVED');
      const assignments=await d.listAssignmentsByMatricula(s(row.matricula));
      if(!Array.isArray(assignments))deny('ASSIGNMENTS_NOT_AVAILABLE');
      const authorized=assignments.filter(a=>{
        if(!a||s(a.matricula)!==s(row.matricula)||s(a.status)!=='ATIVO'||
           !s(a.eventId)||s(a.batalhao)!==s(row.batalhao)||
           s(a.companhia)!==s(row.companhia))return false;
        const until=Date.parse(a.expiresAt);
        return Number.isFinite(until)&&until>now;
      });
      return {
        authenticated:true,matricula:s(row.matricula),
        batalhao:s(row.batalhao),companhia:s(row.companhia),
        roles:['BO_PHOTO_WRITE'],source:'TRUSTED_SERVER_SESSION',
        sessionValid:true,allowedServiceIds:[],
        allowedEventIds:[...new Set(authorized.map(a=>s(a.eventId)))],
        _verifiedSubject:s(assertion.subject)
      };
    }
    async function authenticate(clientCredential){
      // Public R239 transport must not turn a shared token into a personal login.
      if(clientCredential!==undefined&&clientCredential!==null&&clientCredential!=='')
        deny('CLIENT_CREDENTIAL_NOT_PERSONAL_IDENTITY');
      return verifiedPrincipal();
    }
    async function getEvent(eventId,priorPrincipal){
      if(!s(eventId)||!priorPrincipal||!s(priorPrincipal._verifiedSubject))
        deny('MISSING_PRIOR_PERSONAL_CONTEXT');
      // Recheck trusted authority after waiting for R239's per-event lock.
      const current=await verifiedPrincipal();
      if(current._verifiedSubject!==priorPrincipal._verifiedSubject||
         current.matricula!==priorPrincipal.matricula)
        deny('PERSONAL_SESSION_CHANGED');
      if(!current.allowedEventIds.includes(s(eventId)))
        deny('EVENT_ASSIGNMENT_REVOKED');
      const event=await d.readCanonicalEvent(s(eventId));
      if(!event||s(event.eventId)!==s(eventId)||
         s(event.batalhao)!==current.batalhao||
         s(event.companhia)!==current.companhia)
        deny('CANONICAL_EVENT_NOT_AUTHORIZED');
      return event;
    }
    return Object.freeze({authenticate,getEvent,releaseAllowed:false});
  }
  return Object.freeze({create,releaseAllowed:false});
});
