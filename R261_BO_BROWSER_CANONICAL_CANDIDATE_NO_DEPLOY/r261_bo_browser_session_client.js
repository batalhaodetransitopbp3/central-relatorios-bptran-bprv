'use strict';
/*
 * R261 browser candidate for stand-alone, separately approved staging UI.
 * It is NOT injected into R240 live BO pages and does NOT read IndexedDB,
 * cache image bytes, query localStorage, or auto-upload photos.
 * Login token must come from an independently integrated Google OAuth UI.
 */
(function(root,factory){
 const value=factory();
 if(typeof module==='object'&&module.exports)module.exports=value;
 else root.R261BoBrowserPhotoClient=value;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const BO=/^PM20\d{8}$/;
 const JPG=/^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/;
 const ID=/^post-[A-Za-z0-9-]{12,110}$/;
 const PHOTO=/^[A-Za-z0-9-]{6,100}$/;
 const LINK=/^[a-z0-9_.:-]{3,160}$/i;
 const PHOTO_FIELDS=['requestId','photoId','position','caption','renderedDataUrl'];
 const MAX_JSON=2800000;
 function fail(code){
  const e=new Error('R261_'+code);e.code=code;throw e;
 }
 function ok(cond,code){if(!cond)fail(code)}
 function formPayload({numeroBO,launch,photo}={},operation){
  ok(BO.test(numeroBO||''),'BO_CANONICAL_NUMBER_REQUIRED');
  ok(launch&&typeof launch==='object'&&!Array.isArray(launch),
   'BO_LAUNCH_REQUIRED');
  const from=launch.from||'index';
  ok(['index','rsd','rco'].includes(from),'BO_ENTRYPOINT_UNKNOWN');
  const accepted=['from','module','serviceId','rsdReportId',
    'rcoReportId','editId'];
  ok(Object.keys(launch).every(k=>accepted.includes(k)),
   'UNTRUSTED_LAUNCH_PROPERTY');
  const clean={from,module:'bo'};
  for(const k of ['serviceId','rsdReportId','rcoReportId']){
   if(launch[k]!==undefined&&launch[k]!==null&&launch[k]!==''){
    ok(typeof launch[k]==='string'&&LINK.test(launch[k]),
     'UNSAFE_LAUNCH_ID');
    clean[k]=launch[k];
   }
  }
  if(launch.editId!==undefined&&launch.editId!==null&&launch.editId!==''){
   ok(typeof launch.editId==='string'&&
      launch.editId.length<=200&&!/[<>]/.test(launch.editId),
    'UNSAFE_EDIT_ID');
   clean.editId=launch.editId;
  }
  const input={numeroBO,launch:clean};
  if(operation==='upload'){
   ok(photo&&typeof photo==='object'&&!Array.isArray(photo),
    'PHOTO_OBJECT_REQUIRED');
   ok(Object.keys(photo).every(k=>PHOTO_FIELDS.includes(k)),
    'PHOTO_PRIVILEGED_FIELD');
   ok(ID.test(photo.requestId||'')&&PHOTO.test(photo.photoId||'')&&
     Number.isInteger(photo.position)&&photo.position>=1&&
     photo.position<=96,'PHOTO_IDENTIFIERS_INVALID');
   ok(typeof photo.caption==='string'&&photo.caption.length<=220&&
      !/[<>]/.test(photo.caption),'PHOTO_CAPTION_INVALID');
   const match=JPG.exec(photo.renderedDataUrl||'');
   ok(!!match&&match[1].length<=2796208,'PHOTO_JPEG_FORMAT_INVALID');
   input.photo=Object.fromEntries(PHOTO_FIELDS.map(k=>[k,photo[k]]));
  }else{
   ok(operation==='list'&&photo===undefined,'LIST_PAYLOAD_INVALID');
  }
  ok(JSON.stringify(input).length<MAX_JSON,'POST_BODY_EXCEEDS_LIMIT');
  return input;
 }
 function create({fetchImpl,mode}={}){
  ok(mode==='ISOLATED_HOMOLOGATION','STAGING_MODE_REQUIRED');
  ok(typeof fetchImpl==='function','FETCH_INJECTION_REQUIRED');
  let csrf='',challengeCsrf='';
  async function post(endpoint,body,token){
   ok(['login/start','login/complete','photos/upload',
    'photos/list','logout'].includes(endpoint),'UNKNOWN_ENDPOINT');
   const payload=JSON.stringify(body);
   ok(payload.length<MAX_JSON,'POST_BODY_EXCEEDS_LIMIT');
   const headers={'Content-Type':'application/json'};
   if(token)headers['X-BO-CSRF']=token;
   // No absolute URL and no caller-controlled path: credentials stay
   // same-origin, Secure+HttpOnly cookies are managed by the browser.
   const response=await fetchImpl('/bo-api/'+endpoint,{
    method:'POST',credentials:'same-origin',mode:'same-origin',
    cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',
    headers,body:payload
   });
   ok(response&&response.redirected!==true,'UNEXPECTED_REDIRECT');
   const type=String(response.headers?.get?.('content-type')||'').toLowerCase();
   ok(type.startsWith('application/json'),'NON_JSON_SERVER_RESPONSE');
   ok(Number.isInteger(response.status)&&response.status>=200&&
    response.status<300,'SERVER_REQUEST_REJECTED');
   const result=await response.json();
   ok(result&&typeof result==='object'&&!Array.isArray(result)&&
    result.ok===true,'SERVER_RESULT_NOT_OK');
   // Deliberately do not retain any raw Google idToken.
   return result;
  }
  async function startLogin(){
   ok(!csrf&&!challengeCsrf,'LOGIN_ALREADY_IN_PROGRESS');
   const result=await post('login/start',{});
   ok(typeof result.csrf==='string'&&result.csrf.length>=16&&
    typeof result.nonce==='string'&&result.nonce.length>=16,
    'LOGIN_CHALLENGE_INVALID');
   challengeCsrf=result.csrf;
   return {nonce:result.nonce,expiresInSeconds:result.expiresInSeconds};
  }
  async function finishLogin(idToken){
   ok(challengeCsrf,'LOGIN_START_REQUIRED');
   ok(typeof idToken==='string'&&idToken.length>0&&idToken.length<=16384,
    'GOOGLE_ID_TOKEN_REQUIRED');
   const startToken=challengeCsrf;
   challengeCsrf='';
   const result=await post('login/complete',{idToken},startToken);
   ok(typeof result.csrf==='string'&&result.csrf.length>=16,
    'SESSION_CSRF_NOT_ISSUED');
   csrf=result.csrf;
   return {ok:true,expiresInSeconds:result.expiresInSeconds};
  }
  async function upload(p){
   ok(csrf,'PERSONAL_SESSION_REQUIRED');
   return post('photos/upload',formPayload(p,'upload'),csrf);
  }
  async function list(p){
   ok(csrf,'PERSONAL_SESSION_REQUIRED');
   const result=await post('photos/list',formPayload(p,'list'),csrf);
   ok(Array.isArray(result.items),'INVALID_PHOTO_LIST');
   return result;
  }
  async function logout(){
   const old=csrf;
   csrf='';challengeCsrf='';
   if(old)return post('logout',{},old);
   return {ok:true};
  }
  return Object.freeze({startLogin,finishLogin,upload,list,logout,
   get isAuthenticated(){return !!csrf},
   releaseAllowed:false,connectedToLiveBoPage:false});
 }
 return Object.freeze({create,formPayload,releaseAllowed:false,
  connectedToLiveBoPage:false});
});
