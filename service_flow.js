(function(global){
'use strict';
const PATH=(location.pathname.split('/').pop()||'').toLowerCase();
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const ctx=()=>{try{return JSON.parse(localStorage.getItem('pmpb-active-service-v1')||'{}')||{}}catch(_){return {}}};
const qs=new URLSearchParams(location.search);
const fromRsd=qs.get('from')==='rsd';
const returnTo=()=>{const raw=qs.get('returnTo')||'relatorio_servico_diario.html';const name=String(raw).split('/').pop();return /^relatorio_servico_diario(?:_ios)?\.html$/i.test(name)?name:'relatorio_servico_diario.html'};
const nowTime=()=>new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',hour12:false});
const today=()=>{const d=new Date(),z=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+z(d.getMonth()+1)+'-'+z(d.getDate())};
function centralToken(promptIfMissing=false){
 if(!global.CentralCloud)return '';
 let t=CentralCloud.getToken('central');
 if(!t&&promptIfMissing)t=CentralCloud.askToken('central','Informe a chave operacional da Central:');
 return t||'';
}
function contextQuery(extra={}){
 const c=ctx(),p=new URLSearchParams({from:'rsd',returnTo:PATH,...extra});
 if(c.serviceId)p.set('serviceId',c.serviceId);if(c.rsdReportId)p.set('rsdReportId',c.rsdReportId);if(c.segmento)p.set('segmento',String(c.segmento));
 return p.toString();
}
function openModule(kind){
 const map={operation:/iphone|ipad|ipod/i.test(navigator.userAgent)?'relatorio_operacao_ios.html':'relatorio_operacao.html',
   cirvc:/iphone|ipad|ipod/i.test(navigator.userAgent)?'auto_remocao_veiculos_ios.html':'auto_remocao_veiculos.html',
   bo:/iphone|ipad|ipod/i.test(navigator.userAgent)?'boletim_ocorrencia_bptrans_1cprv_ios.html':'boletim_ocorrencia_bptrans_1cprv.html'};
 const target=map[kind];if(!target)return;
 const c=ctx();if(!c.serviceId||!c.rsdReportId){alert('Registre a guarnição no serviço antes de abrir este módulo.');return}
 location.href=target+'?'+contextQuery({module:kind});
}
global.centralOpenServiceModule=openModule;

function style(){
 if($('#centralFlowStyle'))return;
 const s=document.createElement('style');s.id='centralFlowStyle';s.textContent=`
.central-timeline{position:relative;padding-left:22px}.central-timeline:before{content:"";position:absolute;left:8px;top:8px;bottom:8px;width:2px;background:#d4dee7}
.central-event{position:relative;border:1px solid #d5e0e8;background:#fbfcfd;border-radius:10px;padding:9px 10px;margin:0 0 8px}
.central-event:before{content:"";position:absolute;left:-19px;top:15px;width:10px;height:10px;border-radius:50%;background:#315f93;border:2px solid #fff;box-shadow:0 0 0 1px #9fb6c9}
.central-event-time{font-weight:900;color:#17375e;font-size:11px}.central-event-title{font-weight:900;color:#1b3044;margin:2px 0}.central-event-meta{font-size:11px;color:#687789}
.central-event-empty{padding:12px;border:1px dashed #c8d4de;border-radius:10px;color:#687789;text-align:center}
.central-occurrence-modal{position:fixed;inset:0;z-index:25000;background:#10243a99;display:flex;align-items:center;justify-content:center;padding:14px}
.central-occurrence-card{width:min(520px,100%);background:#fff;border-radius:16px;padding:16px;box-shadow:0 20px 60px #0004}
.central-occurrence-card h3{margin:0 0 5px;color:#17375e}.central-occurrence-card p{margin:0 0 14px;color:#607487}
.central-occurrence-actions{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.central-occurrence-actions button{min-height:54px}
.central-entry-status{display:inline-flex;align-items:center;gap:5px;font-size:10px;font-weight:800;color:#17633d;margin-left:8px}
.central-module-return{display:inline-flex!important;align-items:center;justify-content:center;text-decoration:none}
.central-module-context{margin:8px 0;padding:9px 11px;border:1px solid #bcd0df;background:#f2f7fb;border-radius:10px;font-size:12px;color:#29485f}
@media(max-width:620px){.central-occurrence-actions{grid-template-columns:1fr}.central-event{padding:8px}}
@media print{#centralServiceTimeline,.central-entry-status,.central-module-context,.central-module-return{display:none!important}}
`;document.head.appendChild(s);
}
function occurrenceFlow(){
 style();$('#centralOccurrenceModal')?.remove();
 const m=document.createElement('div');m.id='centralOccurrenceModal';m.className='central-occurrence-modal no-print';
 m.innerHTML='<div class="central-occurrence-card"><h3>Adicionar ocorrência</h3><p>Qual tipo de ocorrência deseja registrar?</p><div class="central-occurrence-actions"><button type="button" data-t="BST">BST</button><button type="button" data-t="TCO">TCO</button><button type="button" data-t="BO">BO</button></div><div style="margin-top:9px;text-align:right"><button type="button" class="secondary" data-cancel>Cancelar</button></div></div>';
 document.body.appendChild(m);$('[data-cancel]',m).onclick=()=>m.remove();
 $$('[data-t]',m).forEach(b=>b.onclick=()=>{const type=b.dataset.t;m.remove();if(type==='BO'){
   if(confirm('Você deseja prosseguir com o preenchimento do BO online?\n\nOK: abrir o Boletim de Ocorrência online.\nCancelar: registrar a ocorrência manualmente no RSD.')){openModule('bo');return}
 }addManualOccurrence(type)});
}
global.centralOccurrenceFlow=occurrenceFlow;
function addManualOccurrence(type){
 const c=ctx(),before=$$('#occurrences .occurrence-entry').length;
 if(typeof global.addOccurrence!=='function'){alert('O formulário de ocorrência não está disponível.');return}
 global.addOccurrence({tipo:type,data:c.data||today(),hora:nowTime()});
 const entries=$$('#occurrences .occurrence-entry'),entry=entries[entries.length-1];augmentOccurrence(entry);
 entry?.scrollIntoView({behavior:'smooth',block:'center'});
 if(entries.length>before)global.centralAutosave?.();
}
function entryData(entry){const o={id:entry.dataset.id||''};$$('[data-k]',entry).forEach(el=>{o[el.dataset.k]=el.type==='checkbox'?!!el.checked:el.value});return o}
function boNumberValid(v){return !v||/^PM20\d{8}$/.test(String(v||'').toUpperCase().replace(/\s+/g,''))}
async function saveOccurrence(entry){
 const c=ctx(),d=entryData(entry);if(!c.serviceId){alert('Este RSD ainda não está vinculado a um serviço da Central.');return}
 d.numero=String(d.numero||'').toUpperCase().replace(/\s+/g,'');const numInput=entry.querySelector('[data-k="numero"]');if(numInput)numInput.value=d.numero;
 if(d.tipo==='BO'&&!boNumberValid(d.numero)){alert('O número do BO deve seguir o padrão PM20XXXXXXXX, por exemplo PM2026123456.');numInput?.focus();return}
 const token=centralToken(true);if(!token)return;
 const ev={eventId:c.serviceId+'::OCORRENCIA::'+(d.id||Date.now()),serviceId:c.serviceId,rsdReportId:c.rsdReportId||'',segmento:c.segmento||1,tipo:'OCORRENCIA',subtipo:d.tipo||'',
   data:d.data||c.data||today(),hora:d.hora||nowTime(),titulo:(d.tipo||'Ocorrência')+(d.numero?' — '+d.numero:''),resumo:d.descricao||d.naturezaPrincipal||'',numeroDocumento:d.numero||'',
   referenciaId:d.id||'',unidade:c.unidade||{},guarnicao:c.guarnicao||'',vtr:Array.isArray(c.vtrs)?c.vtrs.join(', '):'',comandanteMatricula:c.comandanteMatricula||'',payload:d};
 try{const r=await CentralCloud.submitForm('service-event-upsert',{event:ev},token,{popup:false});entry.dataset.centralSaved='1';entry.dataset.centralUpdatedAt=r.updatedAt||new Date().toISOString();markEntry(entry,'Salvo na Central');global.centralAutosave?.();renderTimeline(await fetchEvents());}
 catch(e){alert('Não foi possível registrar a ocorrência na Central: '+e.message)}
}
function markEntry(entry,text){
 let s=$('.central-entry-status',entry);if(!s){s=document.createElement('span');s.className='central-entry-status no-print';entry.querySelector('.entry-head')?.appendChild(s)}s.textContent='✓ '+text;
}
function augmentOccurrence(entry){
 if(!entry||entry.dataset.centralAugmented)return;entry.dataset.centralAugmented='1';
 const head=$('.entry-head',entry);if(!head)return;
 const b=document.createElement('button');b.type='button';b.className='small secondary no-print';b.textContent='Salvar ocorrência';b.onclick=()=>saveOccurrence(entry);
 const danger=$('button.danger',head);danger?head.insertBefore(b,danger):head.appendChild(b);
 const num=entry.querySelector('[data-k="numero"]');if(num)num.addEventListener('input',()=>{num.value=String(num.value||'').toUpperCase().replace(/\s+/g,'').slice(0,12)});
}
async function saveVehicle(entry){
 const c=ctx(),d=entryData(entry),token=centralToken(true);if(!token||!c.serviceId)return;
 const plate=d.placaUf||d.placa||'',ev={eventId:c.serviceId+'::VEICULO_RECUPERADO::'+(d.id||Date.now()),serviceId:c.serviceId,rsdReportId:c.rsdReportId||'',segmento:c.segmento||1,tipo:'VEICULO_RECUPERADO',
  subtipo:d.situacao||'',data:c.data||today(),hora:nowTime(),titulo:'Veículo recuperado'+(plate?' — '+plate:''),resumo:[d.marcaModelo,d.situacao,d.local].filter(Boolean).join(' • '),
  referenciaId:d.id||'',unidade:c.unidade||{},guarnicao:c.guarnicao||'',vtr:Array.isArray(c.vtrs)?c.vtrs.join(', '):'',comandanteMatricula:c.comandanteMatricula||'',payload:d};
 try{const r=await CentralCloud.submitForm('service-event-upsert',{event:ev},token,{popup:false});markEntry(entry,'Registrado no serviço');global.centralAutosave?.();renderTimeline(await fetchEvents())}catch(e){alert('Não foi possível registrar o veículo recuperado: '+e.message)}
}
function augmentVehicle(entry){
 if(!entry||entry.dataset.centralAugmented)return;entry.dataset.centralAugmented='1';const head=$('.entry-head',entry);if(!head)return;
 const b=document.createElement('button');b.type='button';b.className='small secondary no-print';b.textContent='Registrar no serviço';b.onclick=()=>saveVehicle(entry);
 const danger=$('button.danger',head);danger?head.insertBefore(b,danger):head.appendChild(b);
}
async function fetchEvents(){
 const c=ctx(),token=centralToken(false);if(!c.serviceId||!token||!global.CentralCloud)return [];
 try{const r=await CentralCloud.jsonp('service-event-list',{serviceId:c.serviceId,token},{timeout:15000});return r.items||[]}catch(_){return []}
}
function lockLinkedEntry(entry,label){
 if(!entry)return;entry.dataset.centralLinked='1';
 entry.querySelectorAll('input,select,textarea').forEach(el=>{el.disabled=true;el.readOnly=true});
 const danger=entry.querySelector('.entry-head button.danger');if(danger)danger.style.display='none';
 markEntry(entry,label||'Vinculado à Central');
}
async function syncOperations(){
 const c=ctx(),token=centralToken(false);if(!c.serviceId||!token||!global.CentralCloud||typeof global.addOperationSummary!=='function')return;
 try{const r=await CentralCloud.jsonp('operation-list',{serviceId:c.serviceId,token},{timeout:15000});(r.items||[]).forEach(p=>{const id=p.reportId||p.registroId;if(!id)return;let entry=document.querySelector('#operations .entry[data-id="'+CSS.escape(id)+'"]');if(!entry){const d=typeof global.operationToSummary==='function'?global.operationToSummary(p):{id,nome:p.operacao?.nome||'',local:p.local?.descricao||'',turno:p.operacao?.turno||'',totalAits:p.resumoCpu?.totalAits||0,prisoes:p.resumoCpu?.prisoes||0,apreensoesVeiculos:p.resumoCpu?.apreensoesVeiculos||0};global.addOperationSummary(d);entry=document.querySelector('#operations .entry[data-id="'+CSS.escape(id)+'"]')}lockLinkedEntry(entry,'ROP salvo na Central')})}catch(_){}
}
async function syncCirvcs(){
 const c=ctx(),token=centralToken(false);if(!c.serviceId||!token||!global.CentralCloud||typeof global.addArvc!=='function')return;
 try{const r=await CentralCloud.jsonp('cirvc-list',{serviceId:c.serviceId,token},{timeout:15000});(r.items||[]).forEach(x=>{if(!x.id)return;let entry=document.querySelector('#arvcs .entry[data-id="'+CSS.escape(x.id)+'"]');if(!entry){global.addArvc(x);entry=document.querySelector('#arvcs .entry[data-id="'+CSS.escape(x.id)+'"]')}lockLinkedEntry(entry,'CIRVC salvo na Central')})}catch(_){}
}
function syncEventOccurrences(events){
 if(typeof global.addOccurrence!=='function')return;(events||[]).filter(e=>e.tipo==='OCORRENCIA'||e.tipo==='BO').forEach(e=>{const id=e.referenciaId||e.eventId;if(!id||document.querySelector('#occurrences .entry[data-id="'+CSS.escape(id)+'"]'))return;const d={...(e.payload||{}),id,tipo:e.subtipo||e.payload?.tipo||'BO',numero:e.numeroDocumento||e.payload?.numero||'',data:e.data||e.payload?.data||'',hora:e.hora||e.payload?.hora||''};global.addOccurrence(d);const entry=document.querySelector('#occurrences .entry[data-id="'+CSS.escape(id)+'"]');if(entry){augmentOccurrence(entry);markEntry(entry,'Salvo na Central')}})
}
function timelineCard(){
 let sec=$('#centralServiceTimeline');if(sec)return sec;
 const normal=$('#normalExtras');if(!normal)return null;sec=document.createElement('section');sec.id='centralServiceTimeline';sec.className='card';sec.innerHTML='<div class="entry-head"><h2 class="sec-title" style="margin:0">Evolução cronológica do serviço</h2><button type="button" class="small secondary no-print" id="centralTimelineRefresh">Atualizar</button></div><div class="hint no-print">Os módulos vinculados ao serviço aparecem automaticamente nesta linha do tempo após o salvamento na Central.</div><div id="centralTimelineList" class="central-timeline"></div>';normal.parentNode.insertBefore(sec,normal);$('#centralTimelineRefresh',sec).onclick=refreshRsd;return sec;
}
function renderTimeline(events=[]){
 const sec=timelineCard(),box=$('#centralTimelineList',sec);if(!box)return;
 const c=ctx(),items=[...events];
 if(c.serviceId&&c.data)items.push({eventId:'inicio-'+c.serviceId,tipo:'INICIO',data:c.data,hora:'',titulo:'Serviço iniciado',resumo:[c.guarnicao,Array.isArray(c.vtrs)&&c.vtrs.length?'VTR '+c.vtrs.join(', '):''].filter(Boolean).join(' • '),criadoEm:''});
 const syncedVehicleRefs=new Set(items.filter(x=>x.tipo==='VEICULO_RECUPERADO').map(x=>String(x.referenciaId||'')));
 $('#vehicles .vehicle-entry').forEach(e=>{const d=entryData(e);if(d.id&&syncedVehicleRefs.has(String(d.id)))return;items.push({eventId:'local-vr-'+(d.id||''),tipo:'VEICULO_RECUPERADO',data:c.data||today(),hora:'',titulo:'Veículo recuperado'+(d.placaUf?' — '+d.placaUf:''),resumo:[d.marcaModelo,d.situacao,d.local].filter(Boolean).join(' • '),localOnly:true})});
 const uniq=new Map();items.forEach(x=>uniq.set(x.eventId||[x.tipo,x.referenciaId,x.titulo].join('|'),x));
 const arr=[...uniq.values()].sort((a,b)=>{const ak=[a.data||'',a.hora||'',a.criadoEm||''].join(' '),bk=[b.data||'',b.hora||'',b.criadoEm||''].join(' ');return ak.localeCompare(bk)});
 if(!arr.length){box.innerHTML='<div class="central-event-empty">Nenhum evento registrado neste serviço.</div>';return}
 box.innerHTML=arr.map(x=>'<div class="central-event"><div class="central-event-time">'+esc(x.hora||'—:—')+'</div><div class="central-event-title">'+esc(x.titulo||x.tipo||'Evento')+'</div><div class="central-event-meta">'+esc(x.resumo||'')+(x.numeroDocumento?' • '+esc(x.numeroDocumento):'')+(x.localOnly?' • ainda não sincronizado':'')+'</div></div>').join('');
}
async function refreshRsd(){
 if(!/relatorio_servico_diario/i.test(PATH))return;
 await Promise.all([syncOperations(),syncCirvcs()]);const events=await fetchEvents();syncEventOccurrences(events);
 $$('#occurrences .occurrence-entry').forEach(augmentOccurrence);$$('#vehicles .vehicle-entry').forEach(augmentVehicle);
 renderTimeline(events);global.centralAutosave?.();
}
global.centralRefreshServiceModules=refreshRsd;

function installRsd(){
 style();timelineCard();
 const occBtn=$('#normalExtras section:nth-of-type(1) .entry-head button');if(occBtn){occBtn.removeAttribute('onclick');occBtn.onclick=occurrenceFlow;occBtn.textContent='+ ocorrência'}
 const opSec=$$('#normalExtras section').find(s=>(s.querySelector('.sec-title')?.textContent||'').includes('Operações'));const opBtn=opSec?.querySelector('.entry-head button');if(opBtn){opBtn.removeAttribute('onclick');opBtn.onclick=()=>openModule('operation');opBtn.textContent='+ operação'}
 const cirSec=$$('#normalExtras section').find(s=>(s.querySelector('.sec-title')?.textContent||'').includes('CIRVC'));const cirBtn=cirSec?.querySelector('.entry-head button');if(cirBtn){cirBtn.removeAttribute('onclick');cirBtn.onclick=()=>openModule('cirvc');cirBtn.textContent='+ CIRVC'}
 $$('.toolbar button').forEach(b=>{const t=(b.textContent||'').trim();if(t==='Carregar operações do dia'||t==='Carregar remoções do dia')b.style.display='none'});
 const obs=new MutationObserver(()=>{$$('#occurrences .occurrence-entry').forEach(augmentOccurrence);$$('#vehicles .vehicle-entry').forEach(augmentVehicle)});obs.observe($('#normalExtras')||document.body,{childList:true,subtree:true});
 setTimeout(refreshRsd,350);addEventListener('pageshow',()=>setTimeout(refreshRsd,120));addEventListener('focus',()=>setTimeout(refreshRsd,120));document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(refreshRsd,120)});
}
function contextBanner(label){
 if(!fromRsd)return;style();const c=ctx(),tb=$('.toolbar');if(!tb)return;
 let box=$('#centralModuleContext');if(!box){box=document.createElement('div');box.id='centralModuleContext';box.className='central-module-context no-print';tb.insertAdjacentElement('afterend',box)}
 box.innerHTML='<strong>'+esc(label)+'</strong><br>Vinculado ao serviço '+esc(c.guarnicao||'')+(Array.isArray(c.vtrs)&&c.vtrs.length?' • VTR '+esc(c.vtrs.join(', ')):'')+'. Ao salvar, os dados resumidos retornarão automaticamente ao RSD.';
 if(!$('.central-module-return',tb)){const a=document.createElement('a');a.href=returnTo();a.className='secondary central-module-return no-print';a.textContent='Voltar ao RSD';tb.prepend(a)}
}
function goBack(){location.href=returnTo()}
function installOperation(){
 if(!fromRsd)return;contextBanner('Relatório de Operação vinculado ao RSD');
 const c=ctx(),u=c.unidade||{};
 const applyLockedContext=()=>{
   const map={batalhao:u.batalhao,companhiaNumero:u.companhiaNumero,data:c.data,responsavel:c.comandante,guarnicoes:c.guarnicao,vtrs:Array.isArray(c.vtrs)?c.vtrs.join(', '):''};
   Object.entries(map).forEach(([id,v])=>{const el=$('#'+id);if(!el||v==null||v==='')return;el.value=String(v);el.dispatchEvent(new Event('change',{bubbles:true}));if(/batalhao|companhiaNumero/.test(id))el.disabled=true;else el.readOnly=true});
   global.syncUnitHeader?.();
 };
 applyLockedContext();setTimeout(applyLockedContext,80);
 const tryWrap=()=>{const fn=global.registrarOperacaoDoDiaCloud;if(typeof fn!=='function'||fn.__centralReturnWrapped)return false;
   const w=async function(){const r=await fn.apply(this,arguments);if(r===true){setTimeout(goBack,220)}return r};w.__centralReturnWrapped=true;global.registrarOperacaoDoDiaCloud=w;
   $('button').forEach(b=>{if((b.getAttribute('onclick')||'').includes('registrarOperacaoDoDiaCloud'))b.textContent='Salvar operação e voltar ao RSD'});return true};
 if(!tryWrap())setTimeout(tryWrap,300);
}
function installCirvc(){
 if(!fromRsd)return;contextBanner('CIRVC vinculado ao RSD');
 const c=ctx(),u=c.unidade||{},serviceVtr=Array.isArray(c.vtrs)?c.vtrs.join(', '):'',guVtr=[c.guarnicao,serviceVtr&&('VTR '+serviceVtr)].filter(Boolean).join(' / ');
 const lockContext=()=>{
   const b=$('#globalBatalhao'),co=$('#globalCompanhia');if(b&&u.batalhao){b.value=u.batalhao;b.disabled=true}if(co&&u.companhiaNumero){co.value=String(u.companhiaNumero);co.disabled=true}
   $('.auto-card').forEach(card=>{
     const data=card.querySelector('[data-name="dataEntrega"]'),gv=card.querySelector('[data-name="guarnicaoVtr"]'),mr=card.querySelector('[data-name="militarResponsavel"]');
     if(data&&!data.value&&c.data)data.value=c.data;if(gv&&guVtr){gv.value=guVtr;gv.readOnly=true}if(mr&&c.comandante){mr.value=c.comandante;mr.readOnly=true}
     card.dataset.rsdReportId=c.rsdReportId||card.dataset.rsdReportId||'';card.dataset.serviceId=c.serviceId||card.dataset.serviceId||'';card.dataset.segmento=String(c.segmento||card.dataset.segmento||1);card.dataset.guarnicao=c.guarnicao||card.dataset.guarnicao||'';
   });
 };
 lockContext();const mo=new MutationObserver(()=>lockContext());const box=$('#autosContainer');if(box)mo.observe(box,{childList:true,subtree:true});
 let done=false,tries=0;
 const tryWrap=()=>{if(done)return true;const b=$('[data-cirvc-cloud-save]');if(!b)return false;done=true;b.textContent='Salvar CIRVC e voltar ao RSD';const old=b.onclick;b.onclick=async()=>{lockContext();const r=await old?.call(b);if(r===true)setTimeout(goBack,220)};return true};
 const retry=()=>{if(tryWrap()||++tries>=20)return;setTimeout(retry,250)};retry();
 window.addEventListener('central-v10-ready',()=>setTimeout(()=>{lockContext();tryWrap()},30),{once:true});
}
async function saveBoLink(){
 const c=ctx(),num=String($('#ciopCopom')?.value||'').toUpperCase().replace(/\s+/g,'');if(!boNumberValid(num)){alert('Informe o número do BO no padrão PM20XXXXXXXX, por exemplo PM2026123456.');$('#ciopCopom')?.focus();return}
 const token=centralToken(true);if(!token)return;
 const dateRaw=$('#dataOcorrencia')?.value||'',parts=dateRaw.split('/'),date=parts.length===3?[parts[2],parts[1],parts[0]].join('-'):c.data||today();
 const ev={eventId:c.serviceId+'::BO::'+num,serviceId:c.serviceId,rsdReportId:c.rsdReportId||'',segmento:c.segmento||1,tipo:'BO',subtipo:'BO',data,hora:$('#horaOcorrencia')?.value||nowTime(),
   titulo:'BO — '+num,resumo:$('#naturezaOcorrencia')?.value||'',numeroDocumento:num,referenciaId:num,unidade:c.unidade||{},guarnicao:c.guarnicao||'',vtr:Array.isArray(c.vtrs)?c.vtrs.join(', '):'',comandanteMatricula:c.comandanteMatricula||'',
   payload:{id:num,tipo:'BO',numero:num,data,hora:$('#horaOcorrencia')?.value||'',descricao:$('#naturezaOcorrencia')?.value||'',naturezaPrincipal:$('#naturezaOcorrencia')?.value||''}};
 try{await CentralCloud.submitForm('service-event-upsert',{event:ev},token,{popup:false});global.saveDraft?.(true);alert('BO vinculado ao serviço. O número e o resumo ficarão disponíveis automaticamente no RSD.');goBack()}catch(e){alert('Não foi possível vincular o BO ao RSD: '+e.message)}
}
function installBo(){
 if(!fromRsd)return;contextBanner('Boletim de Ocorrência vinculado ao RSD');const c=ctx();
 setTimeout(()=>{try{const u=c.unidade||{},b=$('#globalBatalhao'),co=$('#globalCompanhia');if(u.batalhao&&b){b.value=u.batalhao;b.disabled=true}if(u.companhiaNumero&&co){co.value=String(u.companhiaNumero);co.disabled=true}if(c.data&&$('#dataOcorrencia')){const p=c.data.split('-');$('#dataOcorrencia').value=p.length===3?p.reverse().join('/'):c.data}global.syncInstitutionSpecific?.()}catch(_){}},100);
 const tb=$('.toolbar');if(tb&&!$('#centralSaveBoReturn')){const b=document.createElement('button');b.id='centralSaveBoReturn';b.type='button';b.className='success no-print';b.textContent='Vincular BO e voltar ao RSD';b.onclick=saveBoLink;tb.prepend(b)}
}
function installRcoAuto(){
 const hideLegacy=()=>{$('.toolbar button').forEach(b=>{if((b.textContent||'').trim()==='Carregar operações do dia')b.style.display='none'})};
 const run=()=>{hideLegacy();try{if(typeof global.centralRcoRefreshCloud==='function')global.centralRcoRefreshCloud()}catch(_){}};
 hideLegacy();setTimeout(run,350);addEventListener('focus',()=>setTimeout(run,150));document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(run,150)});
}
function init(){
 style();
 if(/relatorio_servico_diario/.test(PATH))installRsd();
 else if(/relatorio_operacao/.test(PATH))installOperation();
 else if(/auto_remocao_veiculos/.test(PATH))installCirvc();
 else if(/boletim_ocorrencia/.test(PATH))installBo();
 else if(/relatorio_cpu/.test(PATH))installRcoAuto();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,80));else setTimeout(init,80);
})(window);