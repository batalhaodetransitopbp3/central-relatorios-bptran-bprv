'use strict';
/* R262 isolated browser-only preview. This script has no doPost, storage or
   production Google integration. The test harness serves fake tokens ONLY on
   an HTTPS 127.0.0.1 listener and binds all requests to the same origin. */
(function(){
 const get=id=>document.getElementById(id);
 const BO='PM2026123456',SERVICE='service-r262-123456',
  RSD='rsd-r262-123456',RCO='rco-r262-123456';
 const client=R261BoBrowserPhotoClient.create({
  fetchImpl:window.fetch.bind(window),mode:'ISOLATED_HOMOLOGATION'
 });
 let position=1,lastResponse=null,requests=[];
 const status=(message,error=false)=>{
  const el=get('r262-status');el.textContent=message;
  el.style.background=error?'#ffe5e5':'#ecf5fa';
 };
 const navigation=()=>{
  const from=get('r262-origin').value;
  if(from==='index')return {from:'index',module:'bo'};
  if(from==='rsd')return {from:'rsd',module:'bo',
    serviceId:SERVICE,rsdReportId:RSD,editId:BO};
  return {from:'rco',module:'bo',editId:BO};
 };
 function setButtons(){
  const active=client.isAuthenticated;
  get('r262-login').disabled=active;
  get('r262-upload').disabled=!active;
  get('r262-refresh').disabled=!active;
  get('r262-logout').disabled=!active;
 }
 function imageAt(n){
  const canvas=document.createElement('canvas');
  canvas.width=540;canvas.height=360;
  const ctx=canvas.getContext('2d');
  if(!ctx)throw Error('SYNTHETIC_CANVAS_UNAVAILABLE');
  ctx.fillStyle='#223f64';ctx.fillRect(0,0,540,360);
  ctx.fillStyle='#f9d27f';ctx.fillRect(65+n%30,40,360,230);
  ctx.fillStyle='#27384d';ctx.fillRect(110,95,240,95);
  ctx.fillStyle='#fff';ctx.font='24px sans-serif';
  ctx.fillText('FOTO FICTICIA '+n,120,150);
  // Simulates a center crop using a second canvas; never reads user files.
  const crop=document.createElement('canvas');
  crop.width=320;crop.height=240;
  crop.getContext('2d').drawImage(canvas,80,60,380,260,0,0,320,240);
  return crop.toDataURL('image/jpeg',.82);
 }
 function paint(result){
  lastResponse=result;
  const photos=result.items||[];
  const pages=new Map();
  for(const p of photos){
   if(!pages.has(p.page))pages.set(p.page,[]);
   pages.get(p.page).push(p);
  }
  const gallery=get('r262-gallery');
  gallery.replaceChildren();
  for(const [page,items] of pages){
   const card=document.createElement('section');
   card.className='annex';card.dataset.page=String(page);
   const heading=document.createElement('h2');
   heading.textContent='Anexo — página '+page;
   card.appendChild(heading);
   const list=document.createElement('ul');
   for(const item of items){
    const li=document.createElement('li');
    li.textContent='Imagem '+item.position+' • '+item.caption;
    list.appendChild(li);
   }
   card.appendChild(list);gallery.appendChild(card);
  }
  get('r262-summary').textContent=photos.length+' imagens • '+pages.size+' páginas';
 }
 let inFlight=false;
 async function safe(action){
  // Avoid double-click/re-entrant upload during browser touch/pointer events.
  // A new synthetic requestId must never be generated twice for one action.
  if(inFlight)return;
  inFlight=true;
  for(const id of ['r262-login','r262-upload','r262-refresh','r262-logout'])
   get(id).disabled=true;
  get('r262-origin').disabled=true;
  try{await action()}
  catch(error){status('Ação rejeitada: '+String(error.code||error.message||'erro'),true)}
  finally{
   inFlight=false;
   get('r262-origin').disabled=false;
   setButtons();
  }
 }
 get('r262-login').addEventListener('click',()=>safe(async()=>{
  const challenge=await client.startLogin();
  const response=await fetch('/r262-fixture/issue-token',{
   method:'POST',credentials:'same-origin',mode:'same-origin',
   headers:{'Content-Type':'application/json',
    'X-R262-Synthetic-Only':'yes'},
   cache:'no-store',referrerPolicy:'origin',
   body:JSON.stringify({nonce:challenge.nonce})
  });
  if(!response.ok)throw Error('TOKEN_FIXTURE_REJECTED');
  const {idToken}=await response.json();
  await client.finishLogin(idToken);
  setButtons();status('Sessão fictícia validada. BO '+BO);
 }));
 get('r262-upload').addEventListener('click',()=>safe(async()=>{
  const photo={requestId:'post-'+crypto.randomUUID(),
   photoId:'photo-'+crypto.randomUUID(),position,
   caption:'Foto sintética '+position,renderedDataUrl:imageAt(position)};
  const result=await client.upload({numeroBO:BO,
   launch:navigation(),photo});
  if(!result.ok)throw Error('UPLOAD_REJECTED');
  requests.push({requestId:photo.requestId,photoId:photo.photoId,
   position:photo.position});
  position++;
  const listed=await client.list({numeroBO:BO,launch:navigation()});
  paint(listed);
  status('Fotografia de teste '+photo.position+' confirmada (origem '+navigation().from+').');
 }));
 get('r262-refresh').addEventListener('click',()=>safe(async()=>{
  const list=await client.list({numeroBO:BO,launch:navigation()});
  paint(list);status('Consulta do BO fictício validada a partir de '+navigation().from+'.');
 }));
 get('r262-logout').addEventListener('click',()=>safe(async()=>{
  await client.logout();setButtons();status('Sessão encerrada.');
 }));
 setButtons();
 window.R262IsolatedPreview=Object.freeze({
  get authenticated(){return client.isAuthenticated},
  get count(){return lastResponse?.items?.length||0},
  get pages(){return [...document.querySelectorAll('.annex')].length},
  get requests(){return requests.map(r=>({...r}))},
  get releaseAllowed(){return false}
 });
})();
