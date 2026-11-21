'use strict';
/*
 * R248: Playwright WebKit browser QA with offline synthetic photographs.
 * This approximates Safari rendering; it is NOT a physical iPhone test.
 * No real BOs, no external network, no production credentials.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
const filenames=[
 'boletim_ocorrencia_bptrans_1cprv.html',
 'boletim_ocorrencia_bptrans_1cprv_ios.html'
];
const BO='PM2026123456',OTHER='PM2026987654';
const TEST_PASS='FAKE-LOCAL-BO-ONLY-R248-SECURE-2026!';
let unsupportedExternal=0;
const results=[];
async function check(label,fn){
 await fn();results.push(label);
 console.log('R248_PASS',label);
}
async function run(){
 const server=http.createServer((req,res)=>{
  const p=new URL(req.url,'http://127.0.0.1').pathname.slice(1);
  if(filenames.includes(p)){
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8',
    'Cache-Control':'no-store'});
   res.end(fs.readFileSync(path.join(root,p)));return;
  }
  if(['central_cloud.js','service_flow.js','module_access_gate.js'].includes(p)){
   res.writeHead(200,{'Content-Type':'text/javascript'});
   res.end('/* no-op: offline synthetic QA */');return;
  }
  res.writeHead(404);res.end();
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 let browser;
 const errors=[];
 try{
  browser=await webkit.launch({headless:true});
  const context=await browser.newContext({
   viewport:{width:375,height:812},deviceScaleFactor:2,
   isMobile:true,hasTouch:true,locale:'pt-BR',
   ignoreHTTPSErrors:false,acceptDownloads:false
  });
  await context.route('**/*',route=>{
   const u=route.request().url();
   if(u.startsWith(origin+'/')||u.startsWith('data:')||u.startsWith('blob:'))
    return route.continue();
   unsupportedExternal++;
   return route.abort();
  });
  async function open(file,entry){
   const pg=await context.newPage();
   pg.on('pageerror',e=>errors.push(String(e.message||e)));
   pg.on('dialog',async d=>d.accept());
   await pg.goto(origin+'/'+file+'?from='+entry+'&serviceId=SYNTHETIC-R248',
    {waitUntil:'domcontentloaded',timeout:25000});
   await pg.waitForFunction(()=>window.BoPhotoAnnex?.isReady,{timeout:20000});
   await pg.locator('#ciopCopom').fill(BO);
   await pg.waitForFunction(n=>BoPhotoAnnex.storageScope==='bo-annex::number:'+n
      &&BoPhotoAnnex.isReady,BO,{timeout:20000});
   return pg;
  }
  async function row(pg){
   return pg.evaluate(async()=>{
    const d=await new Promise((ok,bad)=>{
     const r=indexedDB.open('central-bo-photo-annex-v1');
     r.onsuccess=()=>ok(r.result);r.onerror=()=>bad(r.error);
    });
    const v=await new Promise((ok,bad)=>{
     const r=d.transaction('reports','readonly').objectStore('reports')
       .get(BoPhotoAnnex.storageScope);
     r.onsuccess=()=>ok(r.result||null);r.onerror=()=>bad(r.error);
    });d.close();return v;
   });
  }
  const normal=await open(filenames[0],'rsd');
  await check('WebKit shows masked password creation on mobile',async()=>{
   await normal.locator('#boAnnexOpenButton').click();
   await normal.locator('#boVaultPassword').waitFor();
   assert.equal(await normal.locator('#boVaultPassword').getAttribute('type'),'password');
   await normal.locator('#boVaultPassword').fill(TEST_PASS);
   await normal.locator('#boVaultConfirm').fill(TEST_PASS);
   await normal.locator('#boVaultUnlock').click();
   await normal.waitForFunction(()=>BoPhotoAnnex.isUnlocked,{timeout:20000});
  });
  const data=await normal.evaluate(()=>{
   const c=document.createElement('canvas');c.width=720;c.height=520;
   const g=c.getContext('2d');
   g.fillStyle='#1d3c5e';g.fillRect(0,0,720,520);
   g.fillStyle='#dbc176';g.fillRect(70,50,290,230);
   return c.toDataURL('image/jpeg',.79).split(',')[1];
  });
  assert(data&&data.length>100,'Synthetic JPEG must exist');
  const fakePhoto={name:'r248-test-only.jpg',mimeType:'image/jpeg',
   buffer:Buffer.from(data,'base64')};
  await check('WebKit saves 5 synthetic photos into 2 groups of 4 and 1',async()=>{
   await normal.locator('#boPhotosInput').setInputFiles(Array(5).fill(fakePhoto));
   await normal.waitForFunction(()=>BoPhotoAnnex.photoCount===5&&
     !document.getElementById('boAddPhotos').disabled,{timeout:30000});
   assert.equal(await normal.evaluate(()=>BoPhotoAnnex.pageCount),2);
   const photoCounts=await normal.locator('[data-bo-annex-page]').evaluateAll(els=>
     els.map(x=>x.querySelectorAll('img.bo-photo-image').length));
   assert.deepEqual(photoCounts,[4,1]);
  });
  await check('WebKit IndexedDB contains ciphertext, no readable photos',async()=>{
   const saved=await row(normal);
   assert(saved);
   assert.equal(saved.cryptoVersion,1);
   assert.equal(saved.cipher,'AES-256-GCM');
   assert.equal(saved.kdf,'PBKDF2-SHA256');
   assert.equal(saved.revision,5);
   assert(typeof saved.ciphertext==='string'&&saved.ciphertext.length>100);
   assert(!Object.hasOwn(saved,'photos'));
   assert(!JSON.stringify(saved).includes('data:image/jpeg;base64'));
  });
  await check('WebKit framing modal supports zoom, rotate and save',async()=>{
   await normal.locator('[data-bo-crop]').first().click();
   await normal.locator('#photoFramerModal.open').waitFor({timeout:15000});
   await normal.locator('#pfZoomIn').click();
   await normal.locator('#pfRotate').click();
   await normal.locator('#pfSave').click();
   await normal.waitForFunction(()=>document.getElementById('boPhotoStatus')
      .textContent.includes('Enquadramento ajustado'),{timeout:30000});
  });
  await check('WebKit small touch screen has no sideways annex overflow',async()=>{
   const layout=await normal.evaluate(()=>{
    const r=document.getElementById('boPhotoAnnex').getBoundingClientRect();
    const btns=[...document.querySelectorAll('.bo-photo-slot-actions button')];
    return {viewport:innerWidth,left:r.left,right:r.right,
     minButtonHeight:Math.min(...btns.map(b=>b.getBoundingClientRect().height))};
   });
   assert(layout.left>=-4&&layout.right<=layout.viewport+4,
    'WebKit mobile annex overflows viewport: '+JSON.stringify(layout));
   assert(layout.minButtonHeight>=43,
    'WebKit mobile buttons too small: '+JSON.stringify(layout));
  });
  await check('WebKit reload hides photos and rejects incorrect password',async()=>{
   await normal.reload({waitUntil:'domcontentloaded'});
   await normal.waitForFunction(()=>BoPhotoAnnex?.isReady,{timeout:20000});
   await normal.locator('#ciopCopom').fill(BO);
   await normal.waitForFunction(()=>BoPhotoAnnex.isLocked,{timeout:20000});
   assert.equal(await normal.evaluate(()=>BoPhotoAnnex.photoCount),0);
   const bad=await normal.evaluate(async()=>{
    try{await BoPhotoAnnex.unlockWithPassphrase('WRONG-TEST-PASSWORD-456');return 'ACCEPTED'}
    catch(e){return e.code||String(e.message)}
   });
   assert.equal(bad,'VAULT_DECRYPT_FAILED');
  });
  await check('WebKit correct password recovers all photos',async()=>{
   await normal.evaluate(p=>BoPhotoAnnex.unlockWithPassphrase(p),TEST_PASS);
   await normal.waitForFunction(()=>BoPhotoAnnex.photoCount===5,{timeout:25000});
  });
  const ios=await open(filenames[1],'rco');
  await check('WebKit iOS variant recovers RSD photos for same canonical BO',async()=>{
   assert.equal(await ios.evaluate(()=>BoPhotoAnnex.isLocked),true);
   assert.equal(await ios.evaluate(()=>BoPhotoAnnex.photoCount),0);
   await ios.evaluate(p=>BoPhotoAnnex.unlockWithPassphrase(p),TEST_PASS);
   await ios.waitForFunction(()=>BoPhotoAnnex.photoCount===5,{timeout:25000});
   assert.deepEqual(await ios.locator('[data-bo-annex-page]').evaluateAll(els=>
     els.map(x=>x.querySelectorAll('.bo-photo-image').length)),[4,1]);
  });
  await check('WebKit different BO never inherits unlocked annex',async()=>{
   await ios.locator('#ciopCopom').fill(OTHER);
   await ios.waitForFunction(n=>BoPhotoAnnex.storageScope.endsWith(n)&&
     BoPhotoAnnex.isReady,OTHER,{timeout:20000});
   assert.equal(await ios.evaluate(()=>BoPhotoAnnex.isUnlocked),false);
   assert.equal(await ios.evaluate(()=>BoPhotoAnnex.photoCount),0);
  });
  await check('WebKit print guard blocks locked encrypted annex',async()=>{
   await ios.locator('#ciopCopom').fill(BO);
   await ios.waitForFunction(()=>BoPhotoAnnex.isLocked,{timeout:20000});
   const canPrint=await ios.evaluate(()=>window.prepareAndPrint());
   assert.equal(canPrint,false);
  });
  assert.deepEqual(errors,[],'JS exceptions: '+errors.join(', '));
  console.log(JSON.stringify({
   status:'PASS',checks:results.length,engine:'Playwright WebKit',
   actualIphone:false,physicalAndroid:false,syntheticOnly:true,
   productionTouched:false,thirdPartyRequestsBlocked:unsupportedExternal,
   tests:results
  }));
 }finally{
  await browser?.close().catch(()=>{});
  await new Promise(resolve=>server.close(resolve));
 }
}
run().catch(e=>{console.error('R248_WEBKIT_FAILURE',e.stack||e);
 process.exitCode=1});
