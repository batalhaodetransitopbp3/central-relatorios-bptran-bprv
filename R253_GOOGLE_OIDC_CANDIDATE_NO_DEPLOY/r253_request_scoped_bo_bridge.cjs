'use strict';
/*
 * R253 request-scoped bridge: verified Google ID token -> R252 personal
 * event ACL -> hardened R252/R239 photo archive. Isolated Node candidate.
 *
 * No HTTP route, no browser session handling, no Apps Script / Drive wiring.
 * The nonce and adapters MUST be supplied by trusted server state, never
 * accepted from an untrusted BO request body or URL parameter.
 */
const personal=require('../R252_BO_PERSONAL_IDENTITY_CANDIDATE_NO_DEPLOY/r252_personal_bo_gate');
const archive=require('../R252_BO_PERSONAL_IDENTITY_CANDIDATE_NO_DEPLOY/r252_bo_photo_archive_core');
function fail(code){throw new Error('R253_BRIDGE_'+code)}
function createRequestScopedArchive(input){
  const options=input||{};
  const {idToken,trustedNonce,oidcVerifier,clientId,authority,storage}=options;
  if(typeof idToken!=='string'||!idToken.trim()||idToken.length>16384)
    fail('TOKEN_MISSING');
  if(typeof trustedNonce!=='string'||trustedNonce.length<16)
    fail('TRUSTED_NONCE_MISSING');
  if(!oidcVerifier||typeof oidcVerifier.verify!=='function')
    fail('VERIFIER_MISSING');
  if(typeof clientId!=='string'||!clientId.trim()||!authority||!storage)
    fail('SERVER_CONFIG_MISSING');
  const acl=personal.create({
    expectedIssuer:'https://accounts.google.com',
    expectedAudience:clientId,
    now:authority.now,
    lookupRosterByEmail:authority.lookupRosterByEmail,
    listAssignmentsByMatricula:authority.listAssignmentsByMatricula,
    readCanonicalEvent:authority.readCanonicalEvent,
    getVerifiedIdentity:()=>oidcVerifier.verify(idToken,{expectedNonce:trustedNonce})
  });
  // Explicitly override authentication and event lookup: storage cannot
  // inject caller-controlled identity even if it carries those methods.
  const service=archive.create({
    ...storage,
    authenticate:acl.authenticate,
    getEvent:acl.getEvent
  });
  return Object.freeze({
    upload:(body)=>service.upload(body,undefined),
    list:(body)=>service.list(body,undefined),
    releaseAllowed:false
  });
}
module.exports=Object.freeze({createRequestScopedArchive,releaseAllowed:false});
