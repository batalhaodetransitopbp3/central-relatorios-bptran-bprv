'use strict';
/* R251: Real source snippets for RSD/RCO entry routing + actual BO pages.
   All data synthetic and localhost only. NEVER loads live cloud services.
*/
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),vm=require('node:vm');
const puppeteer=require(process.env.PUPPETEER_MODULE||'puppeteer-core');
const root=path.resolve(__dirname,'..');
const qa=root;
const BO='PM2026123456',OTHER='PM2026987654',PASS='FAKE-R251-DO-NOT-REUSE-STRONG-BO-PASSWORD';
const allowed=['boletim_ocorrencia_bptrans_1cprv.html',
 'boletim_ocorrencia_bptrans_1cprv_ios.html'];
const results=[];
const sourceFlow=fs.readFileSync(path.join(root,'service_flow.js'),'utf8');
const sourceRco=fs.readFileSync(path.join(root,'relatorio_cpu.html'),'utf8');
function check(label,fn){return Promise.resolve().then(fn).then(r=>{
  results.push({name:label,status:'PASS'});console.log('R251_PASS',label);return r;
})}
function extractRcoContext(){
 const start=sourceRco.indexOf('function rcoModuleContext(base, origin){');
 const end=sourceRco.indexOf('function rcoPlanLinkedMerge(',start+10);
 assert(start>=0&&end>start,'RCO scope function not found');
 return sourceRco.slice(start,end);
}
function extractRcoBoRouting(){
 const anchor='const ios=/iphone|ipad|ipod/i.test(navigator.userAgent);';
 const start=sourceRco.indexOf(anchor,sourceRco.indexOf('async function rcoOpenLinkedModule('));
 const end=sourceRco.indexOf('\n  }',start);
 assert(start>=0&&end>start,'RCO nav snippet not found');
 const src=sourceRco.slice(start,end);
 assert(src.includes("location.href=target+'?'+q.toString();"));
 assert(src.includes("if(editId)q.set('editId'"));
 return src;
}
async function main(){
 await check('actual RCO context preserves RSD origin but allows standalone RCO',()=>{
  const src=extractRcoContext();
  const sand={};vm.createContext(sand);vm.runInContext(src,sand);
  const base={returnUrl:'relatorio_cpu.html',rcoReportId:'RCO-R251-FAKE',
   guarnicao:'GUARNICAO DE TESTE',operationalDate:'2026-11-19',
   unidade:{batalhao:'BPTran',companhiaNumero:1},
   comandante:'FICTICIO',comandanteMatricula:'000000'};
  const origin={serviceId:'SVC-R251-FAKE',rsdReportId:'RSD-R251-FAKE',segmento:2};
  const fromRsd=sand.rcoModuleContext(base,origin);
  assert.equal(fromRsd.serviceId,origin.serviceId);
  assert.equal(fromRsd.rsdReportId,origin.rsdReportId);
  assert.equal(fromRsd.rcoReportId,base.rcoReportId);
  assert.equal(fromRsd.segmento,2);
  const standalone=sand.rcoModuleContext(base,null);
  assert.equal(standalone.serviceId,'');
  assert.equal(standalone.rsdReportId,'');
  assert.equal(standalone.rcoReportId,base.rcoReportId);
 });
 await check('actual RCO routing source selects right BO HTML and editId per platform',()=>{
  const src=extractRcoBoRouting();
  for(const ua of ['Mozilla/5.0 (Windows NT 10.0) Chrome/157',
   'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit']){
   const loc={pathname:'/relatorio_cpu.html',href:''};
   const sand={navigator:{userAgent:ua},location:loc,URLSearchParams,
    ctx:{},kind:'bo',editId:'EDT-R251-FAKE',page:'relatorio_cpu.html'};
   vm.createContext(sand);vm.runInContext('(function(){'+src+'})()',sand);
   const u=new URL(loc.href,'https://synthetic.example/');
   assert(u.pathname.endsWith(/iPhone/.test(ua)?allowed[1]:allowed[0]));
   assert.equal(u.searchParams.get('from'),'rco');
   assert.equal(u.searchParams.get('returnTo'),'relatorio_cpu.html');
   assert.equal(u.searchParams.get('module'),'bo');
   assert.equal(u.searchParams.get('editId'),'EDT-R251-FAKE');
  }
 });
 await check('actual RSD source selects right BO HTML and attaches real context URL',async()=>{
  for(const ua of ['Mozilla/5.0 Windows Chrome','Mozilla/5.0 iPhone Safari']){
   const context={serviceId:'SVC-R251-FAKE',rsdReportId:'RSD-R251-FAKE',
    segmento:3,operationalDate:'2026-11-19'};
   const loc={pathname:'/relatorio_servico_diario.html',search:'',href:''};
   const sand={
    window:{},document:{readyState:'loading',addEventListener(){}},
    navigator:{userAgent:ua,onLine:true},location:loc,URLSearchParams,
    localStorage:{getItem:(key)=>key==='pmpb-active-service-v1'?JSON.stringify(context):null},
    sessionStorage:{getItem(){return null},setItem(){}},
    setTimeout(){},alert(msg){throw Error(msg)},confirm(){return true}
   };
   sand.window.centralRsdSyncNow=async()=>true;
   vm.createContext(sand);vm.runInContext(sourceFlow,sand);
   assert.equal(typeof sand.window.centralOpenServiceModule,'function');
   await sand.window.centralOpenServiceModule('bo');
   const u=new URL(loc.href,'https://synthetic.example/');
   assert(u.pathname.endsWith(/iPhone/.test(ua)?allowed[1]:allowed[0]));
   assert.equal(u.searchParams.get('from'),'rsd');
   assert.equal(u.searchParams.get('returnTo'),'relatorio_servico_diario.html');
   assert.equal(u.searchParams.get('rsdReportId'),context.rsdReportId);
   assert.equal(u.searchParams.get('serviceId'),context.serviceId);
   assert.equal(u.searchParams.get('segmento'),'3');
   assert.equal(u.searchParams.get('module'),'bo');
  }
 });
 const server=http.createServer((req,res)=>{
  const u=new URL(req.url,'http://127.0.0.1');
  const pathname=u.pathname.slice(1);
  if(allowed.includes(pathname)){
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
   res.end(fs.readFileSync(path.join(qa,pathname)));return;
  }
  if(pathname==='service_flow.js'){
   res.writeHead(200,{'Content-Type':'application/javascript'});
   res.end(sourceFlow);return;
  }
  if(['central_cloud.js','module_access_gate.js'].includes(pathname)){
   res.writeHead(200,{'Content-Type':'application/javascript'});
   res.end('/* R251 inert offline dependency; no cloud actions */');return;
  }
  res.writeHead(404);res.end();
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 let browser;const blocked=[],errors=[];
 try{
  browser=await puppeteer.launch({headless:true,
   executablePath:[process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome','/usr/bin/google-chrome-stable',
    '/usr/bin/chromium','/usr/bin/chromium-browser'].filter(Boolean).find(fs.existsSync),
   args:['--no-first-run','--disable-sync','--disable-extensions',
    '--disable-background-networking','--no-sandbox','--disable-dev-shm-usage',
    '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost']
  });
  const context=await browser.createBrowserContext();
  async function openBo(file,q,scope){
   const page=await context.newPage();
   await page.setRequestInterception(true);
   page.on('request',req=>{
    const url=req.url();
    if(url.startsWith(base+'/')||url.startsWith('data:')||url.startsWith('blob:'))
     return req.continue();
    blocked.push(url.slice(0,180));return req.abort();
   });
   page.on('pageerror',e=>errors.push(String(e.message||e)));
   page.on('dialog',d=>d.accept());
   await page.goto(base+'/'+file+q,{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>BoPhotoAnnex?.isReady,{timeout:15000});
   if(scope)await page.evaluate(scope=>localStorage.setItem('pmpb-active-service-v1',
     JSON.stringify(scope)),scope);
   await page.$eval('#ciopCopom',(input,number)=>{
    input.value=number;input.dispatchEvent(new Event('input',{bubbles:true}));
   },BO);
   await page.waitForFunction(number=>BoPhotoAnnex.isReady&&
     BoPhotoAnnex.storageScope==='bo-annex::number:'+number,{timeout:15000},BO);
   return page;
  }
  const index=await openBo(allowed[0],'?from=index',null);
  await check('index BO creates encrypted images under canonical number',async()=>{
   await index.click('#boAnnexOpenButton');
   await index.waitForSelector('#boVaultPassword');
   await index.$eval('#boVaultPassword',(el,p)=>el.value=p,PASS);
   await index.$eval('#boVaultConfirm',(el,p)=>el.value=p,PASS);
   await index.click('#boVaultUnlock');
   await index.waitForFunction(()=>BoPhotoAnnex.isUnlocked,{timeout:15000});
   const buffer=await index.evaluate(()=>{
    const c=document.createElement('canvas');c.width=550;c.height=410;
    const ctx=c.getContext('2d');ctx.fillStyle='#24516e';ctx.fillRect(0,0,550,410);
    return c.toDataURL('image/jpeg',.85).split(',')[1];
   });
   const pathName=path.join(os.tmpdir(),'R251_SYNTHETIC_JPEG_TEMP_'+process.pid+'.jpg');
   try{
    fs.writeFileSync(pathName,Buffer.from(buffer,'base64'));
    await (await index.$('#boPhotosInput')).uploadFile(pathName,pathName);
    await index.waitForFunction(()=>BoPhotoAnnex.photoCount===2&&
     !document.getElementById('boAddPhotos').disabled,{timeout:20000});
   }finally{fs.rmSync(pathName,{force:true})}
   assert.equal(await index.evaluate(()=>BoPhotoAnnex.photoCount),2);
  });
  await check('RSD-linked BO recovers index images after password, no cloud',async()=>{
   const scope={serviceId:'SVC-R251-SHIFT-1',rsdReportId:'RSD-R251-FAKE',
    segmento:2,unidade:{batalhao:'BPTran',companhiaNumero:1},data:'2026-11-19'};
   const r=await openBo(allowed[0],
    '?from=rsd&returnTo=relatorio_servico_diario.html&serviceId=SVC-R251-SHIFT-1&rsdReportId=RSD-R251-FAKE&segmento=2&module=bo',scope);
   await r.waitForFunction(()=>document.getElementById('centralSaveBoReturn')!==null,{timeout:12000});
   assert.equal(await r.evaluate(()=>BoPhotoAnnex.isLocked),true);
   assert.equal(await r.evaluate(()=>BoPhotoAnnex.photoCount),0);
   await r.evaluate(async p=>BoPhotoAnnex.unlockWithPassphrase(p),PASS);
   assert.equal(await r.evaluate(()=>BoPhotoAnnex.photoCount),2);
   assert.equal(await r.evaluate(()=>BoPhotoAnnex.storageScope),
    await index.evaluate(()=>BoPhotoAnnex.storageScope));
   await r.close();
  });
  await check('RCO-linked iOS BO recovers same photos with different service ID',async()=>{
   const scope={returnModule:'rco',returnUrl:'relatorio_cpu_ios.html',
    rcoReportId:'RCO-R251-FAKE',rsdReportId:'RSD-R251-DIFFERENT',
    serviceId:'SVC-R251-SHIFT-2',segmento:4,guarnicao:'TEST-CREW',
    unidade:{batalhao:'BPTran',companhiaNumero:1}};
   const p=await openBo(allowed[1],
    '?from=rco&returnTo=relatorio_cpu_ios.html&module=bo&editId=EDIT-R251-FAKE',scope);
   await p.waitForFunction(()=>document.getElementById('centralSaveBoReturn')!==null,{timeout:12000});
   assert.equal(await p.evaluate(()=>BoPhotoAnnex.isLocked),true);
   assert.equal(await p.evaluate(()=>BoPhotoAnnex.photoCount),0);
   await p.evaluate(async pass=>BoPhotoAnnex.unlockWithPassphrase(pass),PASS);
   assert.equal(await p.evaluate(()=>BoPhotoAnnex.photoCount),2);
   await p.$eval('#ciopCopom',(el,number)=>{
    el.value=number;el.dispatchEvent(new Event('input',{bubbles:true}));
   },OTHER);
   await p.waitForFunction(number=>BoPhotoAnnex.isReady&&
    BoPhotoAnnex.storageScope==='bo-annex::number:'+number,{timeout:15000},OTHER);
   assert.equal(await p.evaluate(()=>BoPhotoAnnex.photoCount),0);
   assert.equal(await p.evaluate(()=>BoPhotoAnnex.isUnlocked),false);
   await p.close();
  });
  const unexpected=blocked.filter(url=>!url.includes('gc.kis.v2.scr.kaspersky-labs.com'));
  assert.deepEqual(unexpected,[],'Unexpected outbound URLs: '+unexpected.join('; '));
  assert.deepEqual(errors,[],'BO JavaScript exceptions: '+errors.join('; '));
  const report={date:'2026-11-19',marker:'R251_SOURCE_ROUTING_AND_REAL_BROWSER_OFFLINE',
   result:'PASS',testCount:results.length,realRsdRcoLoggedIn:false,
   realDevices:false,officialBackendCalled:false,imagesSynthetic:true,
   localStorageServiceContextsSynthetic:true,tests:results,
   avRequestsBlocked:blocked.length};
  if(process.env.R251_REPORT_PATH)fs.writeFileSync(process.env.R251_REPORT_PATH,
   JSON.stringify(report,null,2)+'\n');
  console.log('R251_RESULT',JSON.stringify(report));
 }finally{
  await browser?.close().catch(()=>{});
  await new Promise(resolve=>server.close(resolve));
 }
}
main().catch(e=>{console.error('R251_FAILURE',e.stack||e);process.exitCode=1});
