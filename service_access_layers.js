(function(global){
'use strict';
const NEXT='central-layer-next-v1';
const MODE='central-layer-mode-v1';
const q=(s,r=document)=>r.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const fmtDate=v=>{if(!v)return '—';const p=String(v).slice(0,10).split('-');return p.length===3?p.reverse().join('/'):v};
const pageType=()=>/relatorio_servico_diario/i.test(location.pathname)?'rsd':(/relatorio_cpu/i.test(location.pathname)?'rco':'');
const unit=()=>{const b=q('#batalhao')?.value||'BPTran',n=Number(q('#companhiaNumero')?.value||1)||1,t=b==='BPRv'?'CPRv':'CPTran';return {batalhao:b,companhiaNumero:n,companhia:n+'ª '+t}};
function css(){
 if(q('#centralAccessLayerStyle'))return;
 const s=document.createElement('style');s.id='centralAccessLayerStyle';s.textContent=`
.central-access-layer{position:fixed;inset:0;z-index:20000;background:#eef3f7;overflow:auto;padding:18px;font-family:Arial,sans-serif;color:#19354f}
.central-access-card{width:min(780px,100%);margin:26px auto;background:#fff;border:1px solid #ccd8e2;border-radius:18px;box-shadow:0 18px 55px #18364d26;padding:18px}
.central-access-head{text-align:center;margin-bottom:18px}.central-access-head h1{font-size:22px;margin:0 0 6px;color:#17375e}.central-access-head p{margin:0;color:#657789;font-size:13px}
.central-access-actions{display:grid;gap:10px}.central-access-action{display:block;width:100%;text-align:left;padding:16px;border:1px solid #c9d6e0;border-radius:13px;background:#f9fbfd;color:#17375e;cursor:pointer;box-shadow:none}
.central-access-action:hover{background:#f0f6fb;border-color:#9fb9cf}.central-access-action strong{display:block;font-size:15px;margin-bottom:4px}.central-access-action span{display:block;color:#657789;font-size:12px;font-weight:400}
.central-access-unit{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0}.central-access-unit label{font-size:11px;font-weight:700;color:#52697e}.central-access-unit select{width:100%;margin-top:4px;padding:10px;border:1px solid #cbd7e1;border-radius:9px;background:#fff}
.central-access-list{display:grid;gap:8px;margin-top:12px}.central-access-item{border:1px solid #cbd7e1;border-radius:11px;padding:11px;background:#fff}.central-access-item strong{color:#17375e}.central-access-meta{font-size:11px;color:#647789;margin:4px 0 8px;line-height:1.45}.central-access-item button{padding:8px 11px;border:0;border-radius:8px;background:#17375e;color:#fff;font-weight:700;cursor:pointer}
.central-access-toolbar{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.central-access-toolbar button{padding:9px 12px;border-radius:8px;border:1px solid #bdcbd6;background:#fff;color:#29485f;font-weight:700;cursor:pointer}
.central-access-loading,.central-access-empty{padding:16px;text-align:center;color:#66798a;background:#f7f9fb;border-radius:10px}
.central-access-error{padding:12px;color:#7a2d2d;background:#fff1f1;border:1px solid #e3b8b8;border-radius:10px}
body.central-service-setup main.page>section{display:none!important}body.central-service-setup .toolbar{display:none!important}
body.central-service-setup .service-state-bar{display:none!important}body.central-service-setup header.doc-head{display:block!important}
body.central-service-setup.rco-setup #rcoResponsavelCard{display:block!important}
body.central-service-setup.rco-setup header.doc-head{display:block!important}
.rsd-gu-choice{width:100%;min-height:38px}
@media(max-width:620px){.central-access-layer{padding:8px}.central-access-card{margin:8px auto;padding:14px;border-radius:14px}.central-access-unit{grid-template-columns:1fr}.central-access-head h1{font-size:19px}}
@media print{.central-access-layer{display:none!important}}
`;document.head.appendChild(s);
}
function companies(b,selected){
 const t=b==='BPRv'?'CPRv':'CPTran';return Array.from({length:5},(_,i)=>`<option value="${i+1}" ${Number(selected)===i+1?'selected':''}>${i+1}ª ${t}</option>`).join('');
}
function unitFields(){
 const u=unit();return `<div class="central-access-unit"><label>Batalhão<select data-layer-batt><option value="BPTran" ${u.batalhao==='BPTran'?'selected':''}>BPTran</option><option value="BPRv" ${u.batalhao==='BPRv'?'selected':''}>BPRv</option></select></label><label>Companhia<select data-layer-comp>${companies(u.batalhao,u.companhiaNumero)}</select></label></div>`;
}
function syncLayerUnit(root){
 const b=q('[data-layer-batt]',root),c=q('[data-layer-comp]',root);if(!b||!c)return;
 const apply=()=>{const pb=q('#batalhao'),pc=q('#companhiaNumero');if(pb){pb.value=b.value;pb.dispatchEvent(new Event('change',{bubbles:true}))}if(pc){pc.value=c.value;pc.dispatchEvent(new Event('change',{bubbles:true}))}};
 b.onchange=()=>{c.innerHTML=companies(b.value,1);apply()};c.onchange=apply;apply();
}
function shell(title,subtitle,body){
 css();q('#centralAccessLayer')?.remove();
 const el=document.createElement('div');el.id='centralAccessLayer';el.className='central-access-layer no-print';el.innerHTML=`<div class="central-access-card"><div class="central-access-head"><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div>${body}</div>`;document.body.appendChild(el);return el;
}
function clearLayer(){q('#centralAccessLayer')?.remove()}
function newService(type){
 try{sessionStorage.setItem(NEXT,type+'-setup')}catch(_){}
 if(typeof global.centralStartService==='function')global.centralStartService();
}
function startScreen(type){
 const label=type==='rsd'?'Relatório de Serviço Diário':'Relatório do Coordenador';
 const el=shell(label,'Escolha como deseja acessar o serviço.',`
 <div class="central-access-actions">
  <button class="central-access-action" data-new><strong>Iniciar um novo serviço</strong><span>Limpa somente os dados locais deste aparelho e inicia um novo registro na Central.</span></button>
  <button class="central-access-action" data-continue><strong>Continuar serviço em andamento</strong><span>Carrega um serviço já registrado e salvo na nuvem.</span></button>
  <button class="central-access-action" data-receive><strong>Receber serviço em andamento</strong><span>Mostra somente serviços que foram disponibilizados para passagem.</span></button>
 </div>
 <div class="central-access-toolbar"><button data-home>Voltar à Central</button></div>`);
 q('[data-new]',el).onclick=()=>newService(type);
 q('[data-continue]',el).onclick=()=>type==='rsd'?rsdContinueScreen():rcoContinue();
 q('[data-receive]',el).onclick=()=>type==='rsd'?rsdReceive():rcoReceive();
 q('[data-home]',el).onclick=()=>location.href='index.html';
}
function enterSetup(type){
 clearLayer();document.body.classList.add('central-service-setup',type==='rco'?'rco-setup':'rsd-setup');
 try{sessionStorage.removeItem(NEXT);sessionStorage.setItem(MODE,type+'-setup')}catch(_){}
 if(type==='rsd'){
   installRsdGuarnicaoChoice();
   const h=q('header.doc-head');h?.scrollIntoView({block:'start'});
   const st=q('#rsdRegisterStatus');if(st)st.textContent='Preencha a identificação do serviço. A guarnição deve ser escolhida na lista; depois registre o serviço na Central.';
 }else{
   q('#rcoResponsavelCard')?.scrollIntoView({block:'start'});
 }
}
function exitSetup(){
 document.body.classList.remove('central-service-setup','rsd-setup','rco-setup');
 try{sessionStorage.removeItem(MODE)}catch(_){}
}
function guOptions(){
 const out=['<option value="">Selecione a guarnição</option>'];
 [['BST',10],['BASE',4],['GTTRAN',3],['REBOQUE',3],['TOR',3]].forEach(([t,n])=>{for(let i=1;i<=n;i++)out.push(`<option value="${t} ${String(i).padStart(2,'0')}">${t} ${String(i).padStart(2,'0')}</option>`)});
 return out.join('');
}
function installRsdGuarnicaoChoice(){
 const original=q('#guarnicao'),tipo=q('#guarnicaoTipo');if(!original||q('#guarnicaoEscolha'))return;
 const s=document.createElement('select');s.id='guarnicaoEscolha';s.className='rsd-gu-choice no-print';s.innerHTML=guOptions();
 const normalize=v=>{const m=String(v||'').trim().toUpperCase().match(/^(BST|BASE|GTTRAN|REBOQUE|TOR)\s*0*(\d{1,2})$/);return m?m[1]+' '+String(Number(m[2])).padStart(2,'0'):''};
 const current=normalize(original.value);if(current)s.value=current;
 original.style.display='none';tipo.style.display='none';original.parentElement?.appendChild(s);
 const label=original.closest('.field')?.querySelector('label');if(label)label.textContent='Guarnição';
 s.onchange=()=>{original.value=s.value;tipo.value=(s.value.match(/^[A-Z]+/)||[''])[0];original.dispatchEvent(new Event('input',{bubbles:true}));tipo.dispatchEvent(new Event('change',{bubbles:true}));};
 const obs=new MutationObserver(()=>{const v=normalize(original.value);if(v&&s.value!==v)s.value=v;s.disabled=!!tipo.disabled});obs.observe(original,{attributes:true,attributeFilter:['value']});obs.observe(tipo,{attributes:true,attributeFilter:['disabled']});
 setInterval(()=>{const v=normalize(original.value);if(v&&s.value!==v)s.value=v;s.disabled=!!tipo.disabled},1200);
}
async function ensureCentralToken(message){
 if(!global.CentralCloud)return '';
 let t=CentralCloud.getToken('central');if(!t)t=CentralCloud.askToken('central',message||'Informe a chave operacional da Central:');return t||'';
}
async function rsdContinueScreen(){
 const el=shell('Continuar serviço em andamento','Selecione a unidade para ver somente os serviços disponíveis para continuidade.',unitFields()+`<div class="central-access-toolbar"><button data-load>Carregar serviços</button><button data-back>Voltar</button></div><div class="central-access-list" data-list></div>`);
 syncLayerUnit(el);q('[data-back]',el).onclick=()=>startScreen('rsd');q('[data-load]',el).onclick=()=>loadRsdActive(el);await loadRsdActive(el);
}
async function loadRsdActive(el){
 const box=q('[data-list]',el);box.innerHTML='<div class="central-access-loading">Consultando a Central…</div>';
 const token=await ensureCentralToken();if(!token){box.innerHTML='<div class="central-access-empty">Consulta cancelada.</div>';return}
 const u=unit();
 try{
   const r=await CentralCloud.jsonp('rsd-list',{...CentralCloud.unitParams(u),token},{timeout:15000});
   const items=(r.items||[]).filter(x=>['EM_SERVICO','RETIFICACAO_SOLICITADA'].includes(String(x.status||x.STATUS||'').toUpperCase()));
   if(!items.length){box.innerHTML='<div class="central-access-empty">Nenhum serviço em andamento nesta unidade.</div>';return}
   box.innerHTML=items.map((x,i)=>`<div class="central-access-item"><strong>${esc(x.guarnicao||'Guarnição')} — VTR ${esc(x.vtrPrincipal||x.viatura||'—')}</strong><div class="central-access-meta">${esc(x.companhia||u.companhia)} • ${fmtDate(x.data)}<br>Comandante: ${esc(x.responsavel||'—')} ${esc(x.matricula||'')} • ${esc(String(x.status||'').replaceAll('_',' '))}</div><button data-pick="${i}">Continuar este serviço</button></div>`).join('');
   q('[data-list]',el).querySelectorAll('[data-pick]').forEach(b=>b.onclick=async()=>{const x=items[Number(b.dataset.pick)];b.disabled=true;if(typeof global.centralRsdClaimCloudItem!=='function'){b.disabled=false;alert('Atualize a página e tente novamente.');return}const ok=await global.centralRsdClaimCloudItem(x,false);if(ok){clearLayer();exitSetup()}else b.disabled=false});
 }catch(e){box.innerHTML='<div class="central-access-error">'+esc(e.message||e)+'</div>'}
}
async function rsdReceive(){
 clearLayer();
 if(typeof global.centralRsdReceiveCloud==='function'){await global.centralRsdReceiveCloud();return}
 alert('O módulo de recebimento ainda não foi carregado. Atualize a página e tente novamente.');startScreen('rsd');
}
async function rcoContinue(){
 clearLayer();
 if(typeof global.centralContinueService==='function'){const ok=await global.centralContinueService();if(ok)exitSetup();else startScreen('rco');return}
 startScreen('rco');
}
async function rcoReceive(){
 clearLayer();
 if(typeof global.centralRcoReceivePassage==='function'){const ok=await global.centralRcoReceivePassage();if(ok)exitSetup();else startScreen('rco');return}
 startScreen('rco');
}
function init(){
 const type=pageType();if(!type||global.CENTRAL_READONLY_VIEWER)return;css();
 if(type==='rsd')installRsdGuarnicaoChoice();
 global.addEventListener('central-rsd-registered',()=>exitSetup());
 global.addEventListener('central-rco-responsavel-registrado',()=>exitSetup());
 let next='',mode='';try{next=sessionStorage.getItem(NEXT)||'';mode=sessionStorage.getItem(MODE)||''}catch(_){}
 if(next===type+'-setup'||mode===type+'-setup'){enterSetup(type);return}
 startScreen(type);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,180));else setTimeout(init,180);
})(window);
