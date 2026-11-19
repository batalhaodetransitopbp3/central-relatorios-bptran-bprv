'use strict';
/*
 * R253 Google OIDC ID token verifier — isolated Node.js proof of concept.
 * No request routing, no Google credentials, no operational deployment.
 * JWKS MUST come from the pinned Google certificate endpoint using TLS.
 * Avoid Google's tokeninfo debugging endpoint for production verification.
 */
const crypto=require('node:crypto');
const ISSUER='https://accounts.google.com';
const ALT_ISSUER='accounts.google.com';
function failure(code){
  const error=new Error('R253_'+code);error.code=code;throw error;
}
function nonblank(x){return typeof x==='string'&&x.trim().length>0}
function base64url(part,label){
  if(typeof part!=='string'||!/^[A-Za-z0-9_-]+$/.test(part)||part.length>16384)
    failure('INVALID_'+label);
  let buf;
  try{buf=Buffer.from(part,'base64url')}catch(_){failure('INVALID_'+label)}
  if(!buf.length||buf.toString('base64url')!==part)failure('NONCANONICAL_'+label);
  return buf;
}
function jsonPart(part,label){
  const str=base64url(part,label).toString('utf8');
  let value;
  try{value=JSON.parse(str)}catch(_){failure('MALFORMED_'+label)}
  if(!value||typeof value!=='object'||Array.isArray(value))
    failure('INVALID_'+label);
  return value;
}
function equalSecret(a,b){
  if(!nonblank(a)||!nonblank(b))return false;
  const x=Buffer.from(a),y=Buffer.from(b);
  return x.length===y.length&&crypto.timingSafeEqual(x,y);
}
function create(config){
  const cfg=config||{};
  if(!Array.isArray(cfg.clientIds)||!cfg.clientIds.length||
      cfg.clientIds.some(x=>!nonblank(x)))
    failure('AUDIENCE_NOT_CONFIGURED');
  if(typeof cfg.getTrustedGoogleJwks!=='function')
    failure('TRUSTED_GOOGLE_KEYS_NOT_CONFIGURED');
  if(typeof cfg.now!=='function')failure('CLOCK_NOT_CONFIGURED');
  const clients=new Set(cfg.clientIds);
  const allowedDomain=cfg.hostedDomain?String(cfg.hostedDomain).toLowerCase():null;
  const maxAge=Number.isInteger(cfg.maxAgeSeconds)?cfg.maxAgeSeconds:900;
  if(maxAge<60||maxAge>3600)failure('MAX_AGE_INVALID');
  const skew=Number.isInteger(cfg.clockSkewSeconds)?cfg.clockSkewSeconds:60;
  if(skew<0||skew>120)failure('CLOCK_SKEW_INVALID');
  async function verify(idToken,{expectedNonce}={}){
    if(typeof idToken!=='string'||idToken.length>16384)
      failure('ID_TOKEN_REQUIRED');
    const parts=idToken.split('.');
    if(parts.length!==3)failure('JWT_STRUCTURE');
    const [encodedHeader,encodedPayload,encodedSignature]=parts;
    const header=jsonPart(encodedHeader,'HEADER');
    if(header.alg!=='RS256'||!nonblank(header.kid)||
       header.kid.length>128||!/^[A-Za-z0-9_-]+$/.test(header.kid)||
       (header.typ!==undefined&&header.typ!=='JWT')||
       header.crit!==undefined||header.jku!==undefined||header.jwk!==undefined||
       header.x5u!==undefined||header.x5c!==undefined)
      failure('UNTRUSTED_JWT_HEADER');
    const signature=base64url(encodedSignature,'SIGNATURE');
    const claims=jsonPart(encodedPayload,'CLAIMS');
    if(![ISSUER,ALT_ISSUER].includes(claims.iss)||
       typeof claims.aud!=='string'||!clients.has(claims.aud)||
       (claims.azp!==undefined&&claims.azp!==claims.aud))
      failure('ISSUER_OR_AUDIENCE_MISMATCH');
    const nowMs=Date.parse(cfg.now());
    if(!Number.isFinite(nowMs))failure('INVALID_CLOCK');
    const now=Math.floor(nowMs/1000);
    if(!Number.isSafeInteger(claims.iat)||!Number.isSafeInteger(claims.exp)||
       claims.exp<=now||claims.iat>now+skew||now-claims.iat>maxAge||
       claims.exp<=claims.iat||
       (claims.nbf!==undefined&&(!Number.isSafeInteger(claims.nbf)||claims.nbf>now+skew)))
      failure('EXPIRED_OR_STALE_TOKEN');
    if(!nonblank(expectedNonce)||expectedNonce.length<16||
       !equalSecret(claims.nonce,expectedNonce))
      failure('SESSION_NONCE_MISMATCH');
    if(!nonblank(claims.sub)||claims.sub.length>255||
       !nonblank(claims.email)||claims.email.length>320||
       claims.email_verified!==true)
      failure('SUBJECT_OR_EMAIL_UNVERIFIED');
    const email=claims.email.trim().toLowerCase();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      failure('EMAIL_INVALID');
    // Google itself must be authoritative for the email: Gmail or Workspace hd.
    const googleHosted=email.endsWith('@gmail.com');
    const workspaceHosted=nonblank(claims.hd)&&
      email.endsWith('@'+claims.hd.toLowerCase());
    if(!googleHosted&&!workspaceHosted)failure('EMAIL_AUTHORITY_UNPROVEN');
    if(allowedDomain&&
       (claims.hd||'').toLowerCase()!==allowedDomain)
      failure('HOSTED_DOMAIN_MISMATCH');

    // Fetch is provided by a trusted server adapter only, never from JWT headers.
    let jwks;
    try{jwks=await cfg.getTrustedGoogleJwks()}
    catch(_){failure('TRUSTED_KEYS_UNAVAILABLE')}
    if(!jwks||!Array.isArray(jwks.keys)||jwks.keys.length>32)
      failure('TRUSTED_KEYS_UNAVAILABLE');
    const matches=jwks.keys.filter(key=>key&&key.kid===header.kid&&
       key.kty==='RSA'&&(key.use===undefined||key.use==='sig')&&
       (key.alg===undefined||key.alg==='RS256')&&
       nonblank(key.n)&&nonblank(key.e));
    if(matches.length!==1)failure('GOOGLE_KEY_NOT_FOUND');
    let pub;
    try{pub=crypto.createPublicKey({key:matches[0],format:'jwk'})}
    catch(_){failure('INVALID_TRUSTED_KEY')}
    if(pub.asymmetricKeyType!=='rsa'||(pub.asymmetricKeyDetails?.modulusLength||0)<2048)
      failure('WEAK_TRUSTED_KEY');
    const signed=Buffer.from(encodedHeader+'.'+encodedPayload,'ascii');
    if(!crypto.verify('RSA-SHA256',signed,pub,signature))
      failure('JWT_SIGNATURE_INVALID');
    return Object.freeze({
      verification:'SERVER_VERIFIED',issuer:ISSUER,
      audience:claims.aud,subject:claims.sub,email,
      emailVerified:true,issuedAt:new Date(claims.iat*1000).toISOString(),
      expiresAt:new Date(claims.exp*1000).toISOString()
    });
  }
  return Object.freeze({verify,releaseAllowed:false});
}
module.exports=Object.freeze({create,releaseAllowed:false});
