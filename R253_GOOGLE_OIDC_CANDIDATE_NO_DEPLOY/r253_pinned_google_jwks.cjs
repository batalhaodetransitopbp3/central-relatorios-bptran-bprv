'use strict';
/*
 * R253 pinned Google JWKS source for Node 22+. NOT wired to the Apps Script.
 * Fetches exactly the official Google OIDC JWKS URL, never from JWT headers.
 * No stale-key fallback when refresh fails (fail closed).
 */
const JWKS_URL='https://www.googleapis.com/oauth2/v3/certs';
function err(code){const e=new Error('R253_JWKS_'+code);e.code=code;throw e}
function create({fetchFn,now,maxCacheSeconds=21600}={}){
  if(typeof fetchFn!=='function')err('FETCH_NOT_CONFIGURED');
  if(typeof now!=='function')err('CLOCK_NOT_CONFIGURED');
  if(!Number.isInteger(maxCacheSeconds)||maxCacheSeconds<0||maxCacheSeconds>21600)
    err('CACHE_CONFIG_INVALID');
  let saved=null,expiresAt=0,inFlight=null;
  async function load(){
    let response;
    try{
      response=await fetchFn(JWKS_URL,{
        method:'GET',redirect:'error',headers:{accept:'application/json'},
        signal:AbortSignal.timeout(5000)
      });
    }catch(_){err('NETWORK_UNAVAILABLE')}
    if(!response||response.status!==200||!response.headers||
       typeof response.headers.get!=='function'||!response.body)
      err('HTTP_UNTRUSTED');
    const type=(response.headers.get('content-type')||'').toLowerCase();
    if(type&&!type.includes('application/json'))err('CONTENT_TYPE_INVALID');
    const declared=Number(response.headers.get('content-length'));
    if(Number.isFinite(declared)&&declared>131072)err('BODY_TOO_LARGE');
    const chunks=[];let total=0;
    try{
      for await(const chunk of response.body){
        const b=Buffer.from(chunk);total+=b.length;
        if(total>131072)err('BODY_TOO_LARGE');
        chunks.push(b);
      }
    }catch(e){
      if(e&&e.code==='BODY_TOO_LARGE')throw e;
      err('BODY_READ_FAILED');
    }
    let data;
    try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'))}
    catch(_){err('JSON_INVALID')}
    if(!data||!Array.isArray(data.keys)||data.keys.length<1||data.keys.length>32)
      err('KEYSET_INVALID');
    const output=[];
    const kids=new Set();
    for(const raw of data.keys){
      if(!raw||raw.kty!=='RSA'||!raw.kid||
          !/^[A-Za-z0-9_-]{1,128}$/.test(raw.kid)||
          typeof raw.n!=='string'||typeof raw.e!=='string'||
          kids.has(raw.kid))err('KEYSET_INVALID');
      kids.add(raw.kid);
      output.push(Object.freeze({
        kty:'RSA',kid:raw.kid,n:raw.n,e:raw.e,
        alg:raw.alg,use:raw.use
      }));
    }
    const age=/\bmax-age=(\d+)\b/i.exec(response.headers.get('cache-control')||'');
    const seconds=age?Math.min(maxCacheSeconds,Number(age[1])):0;
    const when=Date.parse(now());
    if(!Number.isFinite(when))err('CLOCK_INVALID');
    return {value:Object.freeze({keys:Object.freeze(output)}),
      expiresAt:when+seconds*1000};
  }
  async function getTrustedGoogleJwks(){
    const when=Date.parse(now());
    if(!Number.isFinite(when))err('CLOCK_INVALID');
    if(saved&&expiresAt>when)return saved;
    if(!inFlight)inFlight=load().then(result=>{
      saved=result.value;expiresAt=result.expiresAt;return saved;
    }).finally(()=>{inFlight=null});
    return inFlight;
  }
  return Object.freeze({getTrustedGoogleJwks,releaseAllowed:false});
}
module.exports=Object.freeze({create,JWKS_URL,releaseAllowed:false});
