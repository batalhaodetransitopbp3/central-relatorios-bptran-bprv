'use strict';
/* Portable Chromium smoke test for PR #30. Synthetic images on 127.0.0.1 only.
 * Uses puppeteer-core + pdf-lib installed by CI, or local env module paths.
 * This is NOT Safari, an Android device, or production acceptance.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),
 http=require('node:http');
const requireExternal=(pkg,env)=>{
 try{return require(pkg)}catch(e){
  if(!process.env[env])throw e;
  return require(process.env[env]);
 }
};
const puppeteer=requireExternal('puppeteer-core','PUPPETEER_MODULE');
const {PDFDocument}=requireExternal('pdf-lib','PDF_LIB_MODULE');
const root=path.resolve(__dirname,'..');
const pages=[
 {name:'boletim_ocorrencia_bptrans_1cprv.html',bo:'PM2026123456',width:1280},
 {name:'boletim_ocorrencia_bptrans_1cprv_ios.html',bo:'PM2026123457',width:375}
];
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'bo-photo-ci-'));
const profile=path.join(tmp,'chrome-profile');
function chromePath(){
 const possibilities=[process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome','/usr/bin/google-chrome-stable',
  '/usr/bin/chromium','/usr/bin/chromium-browser'].filter(Boolean);
 return possibilities.find(p=>fs.existsSync(p))||undefined;
}
async function main(){
 const server=http.createServer((req,res)=>{
  const file=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname.slice(1));
  if(pages.some(p=>p.name===file)){
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8',
    'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
   res.end(fs.readFileSync(path.join(root,file)));return;
  }
  if(['central_cloud.js','service_flow.js','module_access_gate.js'].includes(file)){
   res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'});
   res.end('/* Synthetic, no production service or credentials */');return;
  }
  res.writeHead(404);res.end();
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port;
 let browser,external=0;const results=[],errors=[];
 try{
  const executablePath=chromePath();
  assert(executablePath,'Google Chrome/Chromium was not installed on this runner');
  browser=await puppeteer.launch({executablePath,headless:true,userDataDir:profile,
   args:['--no-first-run','--no-sandbox','--disable-dev-shm-usage',
     '--disable-background-networking','--disable-extensions','--disable-sync',
     '--disable-component-update','--no-default-browser-check',
     '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost']
  });
  for(const info of pages){
   const page=await browser.newPage();
   await page.setViewport({width:info.width,height:900,
    isMobile:info.width<500,hasTouch:info.width<500,deviceScaleFactor:1});
   await page.setRequestInterception(true);
   page.on('request',r=>{
    if(r.url().startsWith(origin+'/')||r.url().startsWith('data:')||
      r.url().startsWith('blob:'))return r.continue();
    if(r.url().startsWith('http://gc.kis.v2.scr.kaspersky-labs.com/')){
      external++;return r.abort();
    }
    errors.push('UNEXPECTED_REQUEST '+r.url().slice(0,100));
    external++;return r.abort();
   });
   page.on('pageerror',e=>errors.push(e.message));
   page.on('dialog',async d=>d.accept());
   await page.goto(origin+'/'+info.name+'?from=ci-test',
    {waitUntil:'domcontentloaded',timeout:15000});
   await page.waitForFunction(()=>BoPhotoAnnex&&BoPhotoAnnex.isReady,
    {timeout:12000});
   assert(await page.$('#boAnnexOpenButton'));
   assert.equal(await page.evaluate(()=>BoPhotoAnnex.photoCount),0);
   await page.$eval('#ciopCopom',(el,num)=>{
    el.value=num;el.dispatchEvent(new Event('input',{bubbles:true}));
   },info.bo);
   await page.waitForFunction((num)=>BoPhotoAnnex.isReady&&
    BoPhotoAnnex.storageScope==='bo-annex::number:'+num,
    {timeout:12000},info.bo);
   await page.$eval('#boAnnexOpenButton',el=>el.click());
   await page.waitForSelector('#boVaultPassword',{timeout:10000});
   assert.equal(await page.$eval('#boVaultPassword',el=>el.type),'password');
   await page.$eval('#boVaultPassword',el=>{el.value='FAKE-R246-Strong-Secret-1234!'});
   await page.$eval('#boVaultConfirm',el=>{el.value='FAKE-R246-Strong-Secret-1234!'});
   await page.$eval('#boVaultUnlock',el=>el.click());
   await page.waitForFunction(()=>BoPhotoAnnex.isUnlocked&&
      document.getElementById('boPhotoAnnex').classList.contains('is-open'),
      {timeout:15000});
   const data=await page.evaluate(()=>{
    const c=document.createElement('canvas');c.width=800;c.height=600;
    const g=c.getContext('2d');g.fillStyle='#153a5d';g.fillRect(0,0,800,600);
    g.fillStyle='#e5c97d';g.fillRect(30,45,330,190);
    return c.toDataURL('image/jpeg',.83).split(',')[1];
   });
   const photo=path.join(tmp,info.bo+'.jpg');
   fs.writeFileSync(photo,Buffer.from(data,'base64'));
   const input=await page.$('#boPhotosInput');
   await input.uploadFile(photo,photo,photo,photo,photo);
   await page.waitForFunction(()=>BoPhotoAnnex.photoCount===5&&
     document.querySelectorAll('.bo-photo-image').length===5&&
     !document.getElementById('boAddPhotos').disabled,{timeout:20000});
   assert.equal(await page.evaluate(()=>BoPhotoAnnex.pageCount),2);
   assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll(
    '[data-bo-annex-page]')].map(el=>
     el.querySelectorAll('.bo-photo-image').length)),[4,1]);
   const envelope=await page.evaluate(async()=>{
     const db=await new Promise((resolve,reject)=>{
       const r=indexedDB.open('central-bo-photo-annex-v1');
       r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
     });
     const saved=await new Promise((resolve,reject)=>{
       const r=db.transaction('reports','readonly').objectStore('reports')
         .get(BoPhotoAnnex.storageScope);
       r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
     });
     db.close();return saved;
   });
   assert.equal(envelope.cryptoVersion,1);
   assert.equal(envelope.cipher,'AES-256-GCM');
   assert.equal(envelope.kdf,'PBKDF2-SHA256');
   assert.equal(envelope.revision,5);
   assert(!Object.hasOwn(envelope,'photos'));
   assert(!JSON.stringify(envelope).includes('data:image/jpeg'));
   await page.evaluate(()=>window.centralPrepareNavigation?.());
   await page.reload({waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>BoPhotoAnnex?.isReady,{timeout:12000});
   await page.$eval('#ciopCopom',(el,num)=>{
     el.value=num;el.dispatchEvent(new Event('input',{bubbles:true}));
   },info.bo);
   await page.waitForFunction(()=>BoPhotoAnnex.isReady&&BoPhotoAnnex.isLocked,
     {timeout:12000});
   assert.equal(await page.evaluate(()=>BoPhotoAnnex.photoCount),0);
   const denied=await page.evaluate(async()=>{
     try{await BoPhotoAnnex.unlockWithPassphrase('WRONG-FAKE-12345!!');return false}
     catch(e){return /Senha incorreta|corrompido/.test(String(e.message))}
   });
   assert(denied,'Wrong vault password must be rejected');
   await page.evaluate(async p=>BoPhotoAnnex.unlockWithPassphrase(p),
     'FAKE-R246-Strong-Secret-1234!');
   assert.equal(await page.evaluate(()=>BoPhotoAnnex.photoCount),5);
   await page.$eval('[data-bo-crop]',el=>el.click());
   await page.waitForSelector('#photoFramerModal.open',{timeout:10000});
   await page.$eval('#pfZoomIn',el=>el.click());
   await page.$eval('#pfRotate',el=>el.click());
   await page.$eval('#pfSave',el=>el.click());
   await page.waitForFunction(()=>document.getElementById('boPhotoStatus')
    .textContent.includes('Enquadramento ajustado'),{timeout:12000});
   await page.evaluate(()=>document.getElementById('boPhotoAnnex')
    .style.setProperty('display','none','important'));
   const baseline=(await PDFDocument.load(await page.pdf({
    format:'A4',printBackground:true,preferCSSPageSize:true}))).getPageCount();
   await page.evaluate(()=>document.getElementById('boPhotoAnnex')
    .style.removeProperty('display'));
   const withAnnex=(await PDFDocument.load(await page.pdf({
    format:'A4',printBackground:true,preferCSSPageSize:true}))).getPageCount();
   assert.equal(withAnnex,baseline+2,
    '5 photos must produce exactly 2 extra PDF sheets in '+info.name);
   results.push({file:info.name,photos:5,annexPages:2,
    boPages:baseline,totalPdfPages:withAnnex,crop:true,pass:true});
   await page.close();
  }
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({status:'PASS',chrome:await browser.version(),
    cases:results.length,results,blockedAntivirusScripts:external,
    externalAppRequests:0,realDevice:false,productionAccess:false}));
 }finally{
  if(browser)await browser.close().catch(()=>{});
  await new Promise(r=>server.close(r));
  fs.rmSync(tmp,{recursive:true,force:true});
 }
}
main().catch(err=>{console.error('BO_PHOTO_CI_BROWSER_FAILURE',err.stack||err);
 process.exitCode=1});
