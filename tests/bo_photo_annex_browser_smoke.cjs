'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const puppeteer=require(process.env.PUPPETEER_MODULE||'puppeteer-core');
const {PDFDocument}=require(process.env.PDF_LIB_MODULE||'pdf-lib');
const root=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'bo-print-only-'));
const variants=['boletim_ocorrencia_bptrans_1cprv.html','boletim_ocorrencia_bptrans_1cprv_ios.html'];
const BO='PM2026123456',OTHER='PM2026987654';
(async()=>{
 const server=http.createServer((req,res)=>{const p=new URL(req.url,'http://127.0.0.1').pathname.slice(1);if(variants.includes(p)){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(fs.readFileSync(path.join(root,p)));}else if(['central_cloud.js','service_flow.js','module_access_gate.js'].includes(p)){res.writeHead(200,{'Content-Type':'application/javascript'});res.end('/* offline fixture */');}else{res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 let b;const errors=[];let count=0;
 try{
 b=await puppeteer.launch({headless:true,executablePath:[process.env.CHROME_PATH,'C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].filter(Boolean).find(fs.existsSync),args:['--no-sandbox','--disable-background-networking','--disable-sync','--disable-extensions','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost']});
 for(const [i,file] of variants.entries())for(const entry of ['index','rsd','rco']){
 const p=await b.newPage();await p.setViewport({width:i?375:1280,height:900,isMobile:!!i,hasTouch:!!i});
 await p.setRequestInterception(true);p.on('request',r=>{if(r.url().startsWith(origin+'/')||r.url().startsWith('data:')||r.url().startsWith('blob:'))return r.continue();if(!r.url().includes('gc.kis.v2.scr.kaspersky-labs.com'))errors.push('Unexpected outbound');return r.abort();});
 p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
 await p.evaluateOnNewDocument(()=>{window.__photoWrites=0;const open=indexedDB.open.bind(indexedDB);indexedDB.open=function(n,...a){if(/bo.photo|bo-photo|annex/i.test(n))window.__photoWrites++;return open(n,...a)};const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(/bo.photo|bo-photo|annex/i.test(k)||String(v).includes('data:image/jpeg'))window.__photoWrites++;return set.call(this,k,v)};});
 const goto=()=>p.goto(origin+'/'+file+'?from='+entry,{waitUntil:'domcontentloaded'});
 const setBo=n=>p.$eval('#ciopCopom',(e,n)=>{e.value=n;e.dispatchEvent(new Event('input',{bubbles:true}));},n);
 const open=async()=>{await p.$eval('#boAnnexOpenButton',e=>e.click());await p.waitForFunction(()=>document.getElementById('boPhotoAnnex').classList.contains('is-open'));};
 const ready=async n=>p.waitForFunction(n=>BoPhotoAnnex.photoCount===n&&!document.getElementById('boAddPhotos').disabled&&[...document.querySelectorAll('.bo-photo-image')].every(x=>x.complete&&x.naturalWidth),{timeout:25000},n);
 await goto();await p.waitForFunction(()=>window.BoPhotoAnnex?.isReady);await setBo(BO);
 assert.equal(await p.evaluate(()=>BoPhotoAnnex.photoCount),0);
 assert.equal(await p.$eval('#boPhotoAnnex',e=>e.classList.contains('is-empty')),true);
 const baseline=await PDFDocument.load(await p.pdf({format:'A4',printBackground:true}));
 await open();assert.equal(await p.$('#boVaultPassword'),null);
 const data=await p.evaluate(()=>{const c=document.createElement('canvas');c.width=800;c.height=600;const g=c.getContext('2d');g.fillStyle='#123456';g.fillRect(0,0,800,600);g.fillStyle='#f1a23b';g.fillRect(0,0,200,250);return c.toDataURL('image/jpeg').split(',')[1];});
 const photo=path.join(tmp,'synthetic.jpg');fs.writeFileSync(photo,Buffer.from(data,'base64'));
 const add=async n=>{await (await p.$('#boPhotosInput')).uploadFile(...Array(n).fill(photo));};
 await add(1);await ready(1);await add(3);await ready(4);assert.equal(await p.evaluate(()=>BoPhotoAnnex.pageCount),1);
 await add(1);await ready(5);assert.equal(await p.evaluate(()=>BoPhotoAnnex.pageCount),2);
 await add(4);await ready(9);assert.deepEqual(await p.evaluate(()=>[...document.querySelectorAll('[data-bo-annex-page]')].map(e=>e.querySelectorAll('img').length)),[4,4,1]);
 await p.$eval('[data-bo-caption]',e=>{e.value='SYNTHETIC CAPTION';e.dispatchEvent(new Event('input',{bubbles:true}));});assert.equal(await p.$eval('.bo-photo-caption-print',e=>e.textContent),'SYNTHETIC CAPTION');
 await p.$eval('[data-bo-crop]',e=>e.click());await p.waitForSelector('#photoFramerModal.open');await p.$eval('#pfCancel',e=>e.click());await p.waitForFunction(()=>!document.querySelector('#photoFramerModal.open'));
 await p.$eval('[data-bo-crop]',e=>e.click());await p.waitForSelector('#photoFramerModal.open');await p.$eval('#pfRotate',e=>e.click());await p.select('#pfAspect','1:1');await p.$eval('#pfSave',e=>e.click());await ready(9);
 assert.ok(Math.abs(await p.$eval('.bo-photo-image',e=>e.naturalWidth/e.naturalHeight)-1)<.01);
 await p.$eval('[data-bo-crop]',e=>e.click());await p.waitForSelector('#photoFramerModal.open');assert.equal(await p.$eval('#pfAspect',e=>e.value),'1:1');await p.select('#pfAspect','3:4');await p.$eval('#pfSave',e=>e.click());await ready(9);
 assert.ok(Math.abs(await p.$eval('.bo-photo-image',e=>e.naturalWidth/e.naturalHeight)-.75)<.01);
 await p.$eval('[data-bo-crop]',e=>e.click());await p.waitForSelector('#photoFramerModal.open');assert.equal(await p.$eval('#pfAspect',e=>e.value),'3:4');await p.select('#pfAspect','16:9');await p.$eval('#pfCancel',e=>e.click());await p.waitForFunction(()=>!document.querySelector('#photoFramerModal.open'));assert.ok(Math.abs(await p.$eval('.bo-photo-image',e=>e.naturalWidth/e.naturalHeight)-.75)<.01);
 const pdf=await PDFDocument.load(await p.pdf({format:'A4',printBackground:true}));assert.equal(pdf.getPageCount()-baseline.getPageCount(),3,'PDF must add three pages');
 await p.$eval('[data-bo-remove]',e=>e.click());await ready(8);
 assert.equal(await p.evaluate(()=>window.__photoWrites),0);
 await setBo(OTHER);await ready(0);await setBo(BO);await ready(0);await open();await add(1);await ready(1);
 await p.reload({waitUntil:'domcontentloaded'});await p.waitForFunction(()=>window.BoPhotoAnnex?.isReady);await setBo(BO);await ready(0);assert.equal(await p.evaluate(()=>window.__photoWrites),0);
 await p.close();console.log('PASS',file,entry,'0/1/4/5/9, crop, caption, removal, PDF +3 pages, scope/reload, no photo writes');count++;
 }
 assert.deepEqual(errors,[]);console.log('RESULT',JSON.stringify({passed:count,total:6,production:false}));
 }finally{await b?.close();await new Promise(r=>server.close(r));fs.rmSync(tmp,{recursive:true,force:true});}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
