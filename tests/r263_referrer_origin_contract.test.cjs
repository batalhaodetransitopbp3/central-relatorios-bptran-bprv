'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const client=require('../R261_BO_BROWSER_CANONICAL_CANDIDATE_NO_DEPLOY/r261_bo_browser_session_client.js');

function fixture(){
 const calls=[];
 const fetchImpl=async(url,options)=>{
  calls.push({url,options});
  return {
   status:200,redirected:false,
   headers:{get:name=>name.toLowerCase()==='content-type'?
    'application/json; charset=utf-8':null},
   json:async()=>({ok:true,nonce:'n'.repeat(32),
    csrf:'c'.repeat(32),expiresInSeconds:300,items:[]})
  };
 };
 return {calls,app:client.create({mode:'ISOLATED_HOMOLOGATION',fetchImpl})};
}
test('R263 browser POSTs transmit only origin for secure server origin validation',async()=>{
 const f=fixture();
 const step=await f.app.startLogin();
 assert.equal(step.nonce,'n'.repeat(32));
 await f.app.finishLogin('synthetic-R263-not-a-real-google-token');
 await f.app.list({numeroBO:'PM2026123456',launch:{from:'index',module:'bo'}});
 await f.app.logout();
 assert.equal(f.calls.length,4);
 for(const call of f.calls){
  assert(call.url.startsWith('/bo-api/'),call.url);
  assert.equal(call.options.method,'POST');
  assert.equal(call.options.mode,'same-origin');
  assert.equal(call.options.credentials,'same-origin');
  assert.equal(call.options.referrerPolicy,'origin');
  assert.equal(call.options.redirect,'error');
  assert.equal(call.options.cache,'no-store');
  assert(!call.url.includes('://'),'absolute destinations are forbidden');
  assert(!call.url.includes('PM2026123456'),'BO cannot leak into URL');
 }
});
test('R263 synthetic login helper transmits only origin without BO route',()=>{
 const src=fs.readFileSync(path.join(__dirname,'..',
  'R262_BO_BROWSER_REAL_ENGINES_NO_DEPLOY','r262_preview_ui.js'),'utf8');
 assert(src.includes("referrerPolicy:'origin'"));
 assert(src.includes("fetch('/r262-fixture/issue-token'"));
 assert(!src.includes('localStorage'));
});
test('R263 policy change does not enable production or privileged client fields',()=>{
 const f=fixture();
 assert.equal(client.releaseAllowed,false);
 assert.equal(client.connectedToLiveBoPage,false);
 assert.throws(()=>client.create({fetchImpl:async()=>{}}),
  /R261_STAGING_MODE_REQUIRED/);
 assert.throws(()=>client.formPayload({
  numeroBO:'PM2026123456',launch:{from:'index',module:'bo'},
  photo:{requestId:'post-123456789123',photoId:'photo-12345678',
   position:1,caption:'synthetic',renderedDataUrl:'data:image/jpeg;base64,/9j/2Q==',
   actorMatricula:'FORGED'}
 },'upload'),/R261_PHOTO_PRIVILEGED_FIELD/);
});
