'use strict';
// R270: WebKit approximation of mobile Safari; synthetic images, no cloud.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),files=['boletim_ocorrencia_bptrans_1cprv.html','boletim_ocorrencia_bptrans_1cprv_ios.html'];
const BO='PM2026123456',OTHER='PM2026987654';
(async()=>{
 const server=http.createServer((req,res)=>{const p=new URL(req.url,'http://127.0.0.1').pathname.slice(1);if(files.includes(p)){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(fs.readFileSync(path.join(root,p)));}else if(['central_cloud.js','service_flow.js','module_access_gate.js'].includes(p)){res.writeHead(200,{'Content-Type':'application/javascript'});res.end('/* offline fixture */');}else{res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;let b;const errors=[];
 try{b=await webkit.launch({headless:true});const ctx=await b.newContext({viewport:{width:375,height:812},isMobile:true,hasTouch:true});
 await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith(origin+'/')||u.startsWith('data:')||u.startsWith('blob:'))return r.continue();errors.push('Unexpected outbound');return r.abort()});
 for(const file of files)for(const entry of ['index','rsd','rco']){
 const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
 await p.addInitScript(()=>{window.__photoWrites=0;const o=indexedDB.open.bind(indexedDB);indexedDB.open=(n,...a)=>{if(/bo.photo|bo-photo|annex/i.test(n))window.__photoWrites++;return o(n,...a)};const s=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(/bo.photo|bo-photo|annex/i.test(k)||String(v).includes('data:image/jpeg'))window.__photoWrites++;return s.call(this,k,v)};});
 await p.goto(origin+'/'+file+'?from='+entry,{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>window.BoPhotoAnnex?.isReady);
 const set=n=>p.locator('#ciopCopom').evaluate((e,n)=>{e.value=n;e.dispatchEvent(new Event('input',{bubbles:true}));},n);
 await set(BO);assert.equal(await p.evaluate(()=>BoPhotoAnnex.photoCount),0);
 await p.locator('#boAnnexOpenButton').evaluate(e=>e.click());await p.waitForFunction(()=>document.getElementById('boPhotoAnnex').classList.contains('is-open'));assert.equal(await p.locator('#boVaultPassword').count(),0);
 const data=await p.evaluate(()=>{const c=document.createElement('canvas');c.width=720;c.height=520;const g=c.getContext('2d');g.fillStyle='#23516e';g.fillRect(0,0,720,520);g.fillStyle='#dbc176';g.fillRect(70,50,290,230);return c.toDataURL('image/jpeg').split(',')[1]});
 const payload={name:'synthetic.jpg',mimeType:'image/jpeg',buffer:Buffer.from(data,'base64')};
 const ready=n=>p.waitForFunction(n=>BoPhotoAnnex.photoCount===n&&!document.getElementById('boAddPhotos').disabled&&[...document.querySelectorAll('.bo-photo-image')].every(x=>x.complete&&x.naturalWidth),n,{timeout:25000});
 for(const [add,total,pages] of [[1,1,1],[3,4,1],[1,5,2],[4,9,3]]){await p.locator('#boPhotosInput').setInputFiles(Array(add).fill(payload));await ready(total);assert.equal(await p.evaluate(()=>BoPhotoAnnex.pageCount),pages);}
 assert.deepEqual(await p.evaluate(()=>[...document.querySelectorAll('[data-bo-annex-page]')].map(e=>e.querySelectorAll('img').length)),[4,4,1]);
 await p.locator('[data-bo-crop]').first().evaluate(e=>e.click());await p.locator('#photoFramerModal.open').waitFor();await p.locator('#pfCancel').evaluate(e=>e.click());await p.waitForFunction(()=>!document.querySelector('#photoFramerModal.open'));
 await p.locator('[data-bo-crop]').first().evaluate(e=>e.click());await p.locator('#photoFramerModal.open').waitFor();await p.locator('#pfRotate').evaluate(e=>e.click());await p.locator('#pfSave').evaluate(e=>e.click());await ready(9);
 await p.emulateMedia({media:'print'});assert.equal(await p.locator('[data-bo-annex-page]').count(),3);await p.emulateMedia({media:'screen'});
 assert.equal(await p.evaluate(()=>window.__photoWrites),0);await set(OTHER);await ready(0);await set(BO);await ready(0);await p.reload({waitUntil:'domcontentloaded'});await p.waitForFunction(()=>window.BoPhotoAnnex?.isReady);assert.equal(await p.evaluate(()=>BoPhotoAnnex.photoCount),0);
 console.log('PASS WebKit',file,entry);await p.close();
 }assert.deepEqual(errors,[]);console.log('RESULT WebKit 6/6, no real device');
 }finally{await b?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
