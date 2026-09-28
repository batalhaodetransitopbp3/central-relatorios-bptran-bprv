(function(global){
'use strict';
const NEXT='central-layer-next-v1';
const MODE='central-layer-mode-v1';
const RETURN_KEY='central-rsd-return-v1';
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
.central-access-unit{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0}.central-access-unit label{font-size:11px;font-weight:700;color:#52697e}.central-access-unit select,.central-access-unit input{width:100%;margin-top:4px;padding:10px;border:1px solid #cbd7e1;border-radius:9px;background:#fff;box-sizing:border-box}
.central-access-list{display:grid;gap:8px;margin-top:12px}.central-access-item{border:1px solid #cbd7e1;border-radius:11px;padding:11px;background:#fff}.central-access-item strong{color:#17375e}.central-access-meta{font-size:11px;color:#647789;margin:4px 0 8px;line-height:1.45}.central-access-item button{padding:8px 11px;border:0;border-radius:8px;background:#17375e;color:#fff;font-weight:700;cursor:pointer}
.central-access-toolbar{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.central-access-toolbar button{padding:9px 12px;border-radius:8px;border:1px solid #bdcbd6;background:#fff;color:#29485f;font-weight:700;cursor:pointer}
.central-access-loading,.central-access-empty{padding:16px;text-align:center;color:#66798a;background:#f7f9fb;border-radius:10px}
.central-access-error{padding:12px;color:#7a2d2d;background:#fff1f1;border:1px solid #e3b8b8;border-radius:10px}
.central-setup-nav{position:sticky;top:0;z-index:19000;background:#17375e;padding:8px 12px;box-shadow:0 3px 10px #0002}.central-setup-nav button{border:1px solid #ffffff55;background:#fff;color:#17375e;border-radius:8px;padding:8px 12px;font-weight:700;cursor:pointer}
body.central-service-setup.rsd-setup main.page>*:not(header.doc-head){display:none!important}
body.central-service-setup .toolbar{display:none!important}
body.central-service-setup .service-state-bar{display:none!important}
body.central-service-setup header.doc-head{display:block!important}
body.central-service-setup.rsd-setup header.doc-head{margin-bottom:18px!important}
.central-enter-report{margin-left:auto}
.central-registered-note{font-weight:700;color:#17633d}
body.central-service-setup.rco-setup main.page>*{display:none!important}
body.central-service-setup.rco-setup header.doc-head,
body.central-service-setup.rco-setup #rcoConsolidacaoMode,
body.central-service-setup.rco-setup #rcoResponsavelCard,
body.central-service-setup.rco-setup #centralRcoSetupStatus{display:block!important}
body.central-service-setup.rco-setup #centralRcoSetupStatus[hidden]{display:none!important}
.central-rco-setup-status{margin-top:12px}
.central-rco-status-row{display:grid;grid-template-columns:1.2fr .8fr .9fr;gap:8px;align-items:center;padding:9px 0;border-top:1px solid #dce5ec;font-size:12px}
.central-rco-status-row:first-child{border-top:0}
.central-rco-status-row strong{color:#17375e}.central-rco-status-row span:last-child{text-align:right;font-weight:700}
@media(max-width:620px){.central-rco-status-row{grid-template-columns:1fr}.central-rco-status-row span:last-child{text-align:left}}
.rsd-team-ident.central-split-gu{display:grid!important;grid-template-columns:1.35fr .65fr;gap:8px;align-items:end}
.rsd-gu-part label{font-size:9.5px;margin-bottom:3px}.rsd-gu-number{width:100%;min-height:38px}
.rsd-external-commander{grid-column:1/-1;display:grid;grid-template-columns:1fr 1.4fr;gap:8px;margin-top:8px;padding:9px;border:1px dashed #c6d3de;border-radius:9px;background:#f8fafc}
.rsd-external-commander[hidden]{display:none!important}
.rsd-external-commander .hint{grid-column:1/-1;margin:0 0 2px}
#responsavel[readonly]{background:#f4f7f9;color:#31465a}
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
async function newService(type){
 if(!confirm('Iniciar um novo serviço?\n\nEsta ação limpa somente os dados locais deste aparelho. Registros já salvos na Central não serão apagados.'))return;
 const key=await requestIngressKey(type);if(!key)return;
 try{sessionStorage.setItem(NEXT,type+'-setup')}catch(_){}
 if(typeof global.centralStartService==='function')global.centralStartService(true);
}
function startScreen(type){
 const label=type==='rsd'?'Relatório de Serviço Diário':'Relatório do Coordenador';
 const el=shell(label,'Escolha como deseja acessar o serviço. A chave será solicitada apenas no momento de entrar no módulo.',`
 <div class="central-access-actions">
  <button class="central-access-action" data-new><strong>Iniciar um novo serviço</strong><span>Cria um novo serviço. A credencial será solicitada uma única vez para entrar.</span></button>
  <button class="central-access-action" data-continue><strong>Continuar serviço em andamento</strong><span>Escolha a companhia e veja todos os serviços ainda abertos, com a data do serviço.</span></button>
  <button class="central-access-action" data-receive><strong>Receber serviço em andamento</strong><span>Mostra exclusivamente os serviços que foram disponibilizados para passagem.</span></button>
 </div>
 <div class="central-access-toolbar"><button data-home>Voltar à Central</button></div>`);
 q('[data-new]',el).onclick=()=>newService(type);
 q('[data-continue]',el).onclick=()=>openServicePicker(type,'continue');
 q('[data-receive]',el).onclick=()=>openServicePicker(type,'receive');
 q('[data-home]',el).onclick=()=>location.href='index.html';
}
function enterSetup(type,context=''){
 clearLayer();q('#centralSetupNav')?.remove();document.body.classList.add('central-service-setup',type==='rco'?'rco-setup':'rsd-setup');
 const nav=document.createElement('div');nav.id='centralSetupNav';nav.className='central-setup-nav no-print';nav.innerHTML='<button type="button">← Voltar às opções de acesso</button>';document.body.prepend(nav);nav.querySelector('button').onclick=()=>{exitSetup();startScreen(type)};
 try{sessionStorage.removeItem(NEXT);sessionStorage.setItem(MODE,type+'-setup')}catch(_){}
 if(type==='rsd'){
   installRsdGuarnicaoChoice();
   installRsdCommanderFlow();
   q('#rsdChangeKeyBtn')?.setAttribute('hidden','hidden');
   const reg=q('#rsdRegisterServiceBtn');if(reg)reg.textContent='Registrar guarnição e entrar no relatório';
   const h=q('header.doc-head');h?.scrollIntoView({block:'start'});
   const st=q('#rsdRegisterStatus');if(st)st.textContent='Credencial de ingresso validada. Escolha tipo e número da guarnição, informe a VTR e confirme a matrícula do comandante.';
 }else{
   installRcoSetupStatus();
   installRcoEnterButton();
   q('#centralRcoSetupStatus')?.removeAttribute('hidden');
   const pw=q('#rcoResponsavelSenha');if(pw){pw.value='';const pf=pw.closest('.field');if(pf)pf.hidden=true}
   if(context==='receive')lockRcoServiceIdentity();
   q('#rcoResponsavelCard')?.scrollIntoView({block:'start'});
 }
}
function exitSetup(){
 q('#centralSetupNav')?.remove();q('#centralRcoSetupStatus')?.setAttribute('hidden','hidden');document.body.classList.remove('central-service-setup','rsd-setup','rco-setup');
 try{sessionStorage.removeItem(MODE)}catch(_){}
}
function numberOptions(){
 return '<option value="">Nº</option>'+Array.from({length:10},(_,i)=>'<option value="'+String(i+1).padStart(2,'0')+'">'+String(i+1).padStart(2,'0')+'</option>').join('');
}
function syncRsdGuarnicaoParts(){
 const original=q('#guarnicao'),tipo=q('#guarnicaoTipo'),numero=q('#guarnicaoNumero');if(!original||!tipo||!numero)return;
 original.value=tipo.value&&numero.value?(tipo.value+' '+numero.value):'';
 original.dispatchEvent(new Event('input',{bubbles:true}));
}
function installRsdGuarnicaoChoice(){
 const original=q('#guarnicao'),tipo=q('#guarnicaoTipo');if(!original||!tipo||q('#guarnicaoNumero'))return;
 const holder=original.closest('.rsd-team-ident')||original.parentElement,field=original.closest('.field'),label=field?.querySelector(':scope > label');
 const m=String(original.value||'').trim().toUpperCase().match(/^(BST|BASE|GTTRAN|REBOQUE|TOR)\s*0*(\d{1,2})$/),currentType=m?.[1]||tipo.value||'',currentNum=m?String(Number(m[2])).padStart(2,'0'):'';
 const numero=document.createElement('select');numero.id='guarnicaoNumero';numero.className='rsd-gu-number no-print';numero.innerHTML=numberOptions();numero.value=currentNum;
 const typeWrap=document.createElement('div');typeWrap.className='rsd-gu-part';typeWrap.innerHTML='<label>Tipo</label>';
 const numWrap=document.createElement('div');numWrap.className='rsd-gu-part';numWrap.innerHTML='<label>Número</label>';
 holder.classList.add('central-split-gu');holder.innerHTML='';tipo.style.display='block';tipo.value=currentType;typeWrap.appendChild(tipo);numWrap.appendChild(numero);holder.append(typeWrap,numWrap,original);
 original.style.display='none';if(label)label.textContent='Guarnição';if(field)field.style.display='block';
 tipo.onchange=()=>{syncRsdGuarnicaoParts();tipo.dispatchEvent(new Event('input',{bubbles:true}))};numero.onchange=syncRsdGuarnicaoParts;
 const syncFromName=()=>{const mm=String(original.value||'').trim().toUpperCase().match(/^(BST|BASE|GTTRAN|REBOQUE|TOR)\s*0*(\d{1,2})$/);if(!mm)return;const tt=mm[1],nn=String(Number(mm[2])).padStart(2,'0');if(tipo.value!==tt)tipo.value=tt;if(numero.value!==nn)numero.value=nn};
 global.centralSyncRsdGuarnicaoControls=syncFromName;
 if(currentType&&currentNum)syncRsdGuarnicaoParts();else syncFromName();
 setInterval(syncFromName,900);
}
function installRsdCommanderFlow(){
 const row=q('.rsd-person-row'),name=q('#responsavel'),mat=q('#matriculaResponsavel'),search=q('#buscarMilitarBtn');if(!row||!name||!mat)return;
 const nameField=name.closest('.field'),matField=mat.closest('.field');if(matField&&nameField&&row.firstElementChild!==matField)row.insertBefore(matField,nameField);
 if(matField)matField.className='field span4';if(nameField)nameField.className='field span8';
 name.readOnly=true;name.placeholder='Preenchido automaticamente após confirmar a matrícula';
 if(search)search.textContent='Confirmar matrícula';
 let ext=q('#rsdExternalCommander');
 if(!ext){ext=document.createElement('div');ext.id='rsdExternalCommander';ext.className='rsd-external-commander no-print';ext.hidden=true;ext.innerHTML='<div class="hint">Matrícula não localizada. Informe os dados abaixo para o pré-cadastro.</div><div class="field"><label>Posto/graduação</label><input id="rsdExternalPosto" placeholder="Ex.: CB"></div><div class="field"><label>Unidade de origem</label><input id="rsdExternalUnidade" placeholder="Ex.: 5º BPM / PMPB"></div>';row.appendChild(ext)}
 mat.addEventListener('input',()=>{if(!name.dataset.externalMode){name.value='';name.readOnly=true;name.placeholder='Preenchido automaticamente após confirmar a matrícula'}ext.hidden=true;delete name.dataset.externalMode});
 global.centralRsdEnableExternalCommander=function(){name.readOnly=false;name.value='';name.dataset.externalMode='1';name.placeholder='Digite o nome/QRA do comandante';ext.hidden=false;name.focus();if(search)search.textContent='Cadastrar comandante'};
 global.centralRsdExternalCommanderState=function(){return {nome:String(name.value||'').trim(),postoGrad:String(q('#rsdExternalPosto')?.value||'').trim(),unidadeOrigem:String(q('#rsdExternalUnidade')?.value||'').trim(),external:name.dataset.externalMode==='1'}};
 global.centralRsdCommanderFound=function(){name.readOnly=true;delete name.dataset.externalMode;ext.hidden=true;if(search)search.textContent='Confirmar matrícula'};
}
function lockRsdHeader(){
 ['batalhao','companhiaNumero'].forEach(id=>{const el=q('#'+id);if(el)el.disabled=true});
 ['data','diaSemana','guarnicaoTipo','guarnicaoNumero'].forEach(id=>{const el=q('#'+id);if(el)el.disabled=true});
 ['viatura','efetivo','responsavel','matriculaResponsavel'].forEach(id=>{const el=q('#'+id);if(el)el.readOnly=true});
 q('#buscarMilitarBtn')?.setAttribute('disabled','disabled');
 q('#rsdChangeKeyBtn')?.setAttribute('hidden','hidden');
 q('#rsdRegisterServiceBtn')?.setAttribute('hidden','hidden');
 document.querySelectorAll('.rsd-add-vtr').forEach(el=>{el.disabled=true});
 q('#rsdVtrExtras')?.querySelectorAll('input,button').forEach(el=>{el.disabled=true});
}
function lockRcoServiceIdentity(){
 ['batalhao','companhiaNumero','dataInicio','dataTermino'].forEach(id=>{const el=q('#'+id);if(el)el.disabled=true});
 ['diaSemanaCpu','horarioServico'].forEach(id=>{const el=q('#'+id);if(el)el.readOnly=true});
 const mode=q('#rcoSemCpu');if(mode)mode.disabled=true;
}
function lockRcoHeader(){
 lockRcoServiceIdentity();
 ['rcoResponsavelPerfil'].forEach(id=>{const el=q('#'+id);if(el)el.disabled=true});
 ['rcoResponsavelMatricula','rcoExternoPosto','rcoExternoNome','rcoExternoUnidade'].forEach(id=>{const el=q('#'+id);if(el)el.readOnly=true});const turno=q('#rcoResponsavelTurno');if(turno)turno.disabled=true;
 const pw=q('#rcoResponsavelSenha');if(pw){pw.value='';pw.disabled=true;const field=pw.closest('.field');if(field)field.hidden=true}
 q('#rcoResponsavelRegistrarBtn')?.setAttribute('hidden','hidden');
}
function installRcoSetupStatus(){
 const card=q('#rcoResponsavelCard');if(!card)return null;
 let box=q('#centralRcoSetupStatus');
 if(!box){
   box=document.createElement('section');box.id='centralRcoSetupStatus';box.className='card no-print central-rco-setup-status';
   box.innerHTML='<div class="entry-head"><h2 class="sec-title" style="margin:0">Guarnições / VTRs da unidade</h2><button type="button" class="small secondary" id="centralRcoSetupRefresh">Atualizar status</button></div><div class="hint">Após identificar o responsável, a Central exibirá os RSDs da unidade. Serviços ainda em andamento também aparecem e poderão ser adicionados ao RCO.</div><div id="centralRcoSetupList" class="central-access-list"><div class="central-access-empty">Identifique e registre o responsável pelo RCO para consultar as guarnições.</div></div>';
   card.insertAdjacentElement('afterend',box);
   q('#centralRcoSetupRefresh',box).onclick=loadRcoSetupStatus;
 }
 return box;
}
function installRcoEnterButton(){
 const actions=q('#rcoResponsavelCard .actions');if(!actions)return null;
 let btn=q('#centralEnterRcoBtn');
 if(!btn){btn=document.createElement('button');btn.type='button';btn.id='centralEnterRcoBtn';btn.className='ok small central-enter-report';btn.textContent='Entrar no RCO';btn.hidden=true;actions.appendChild(btn)}
 btn.onclick=()=>{btn.hidden=true;lockRcoHeader();exitSetup();setTimeout(()=>global.centralRcoRefreshCloud?.(),120);window.scrollTo({top:0,behavior:'smooth'})};
 return btn;
}
async function loadRcoSetupStatus(){
 const box=q('#centralRcoSetupList');if(!box)return;
 let token='';try{token=sessionStorage.getItem('pmpb-rco-role-token-v1')||''}catch(_){}
 const data=q('#dataInicio')?.value||'';
 if(!token){box.innerHTML='<div class="central-access-empty">Identifique e registre o responsável pelo RCO para consultar as guarnições.</div>';return}
 if(!data){box.innerHTML='<div class="central-access-error">Informe a data de início do serviço.</div>';return}
 box.innerHTML='<div class="central-access-loading">Atualizando status das guarnições…</div>';
 try{
   const r=await CentralCloud.jsonp('rsd-list',{...CentralCloud.unitParams(unit()),data,token},{timeout:15000});
   const items=(r.items||[]).filter(x=>String(x.status||'').toUpperCase()!=='CANCELADO');
   if(!items.length){box.innerHTML='<div class="central-access-empty">Nenhum RSD registrado para esta unidade e data.</div>';return}
   box.innerHTML=items.map(x=>{
     const vs=(x.viaturas||[]).map(v=>v?.prefixo||v).filter(Boolean),vtr=vs.join(', ')||x.vtrPrincipal||x.viatura||'—',status=String(x.status||'').replaceAll('_',' ');
     return '<div class="central-rco-status-row"><strong>'+esc(x.guarnicao||'Guarnição')+' — VTR '+esc(vtr)+'</strong><span>'+esc(x.responsavel||x.matricula||'Responsável não informado')+'</span><span>'+esc(status)+'</span></div>';
   }).join('');
 }catch(e){box.innerHTML='<div class="central-access-error">'+esc(e.message||e)+'</div>'}
}
function markRcoRegisteredSetup(){
 lockRcoHeader();
 const btn=installRcoEnterButton(),status=q('#rcoResponsavelProgresso');
 if(btn){btn.hidden=false;btn.disabled=false}
 if(status){status.textContent='Responsável registrado. Confira abaixo o status das guarnições e clique em “Entrar no RCO”.'}
 loadRcoSetupStatus();
}
const ACCESS_AUTH_RSD='central-module-auth-rsd-v1',ACCESS_AUTH_RCO='central-module-auth-rco-v1';
function saveIngressKey(type,key){
 if(type==='rsd'){CentralCloud.setToken(key,'central');try{sessionStorage.setItem(ACCESS_AUTH_RSD,'1')}catch(_){}}
 else{try{sessionStorage.setItem('pmpb-rco-role-token-v1',key);sessionStorage.setItem(ACCESS_AUTH_RCO,'1')}catch(_){}}
}
function clearIngressKey(type){
 if(type==='rsd'){CentralCloud.clearToken('central');try{sessionStorage.removeItem(ACCESS_AUTH_RSD)}catch(_){}}
 else{try{sessionStorage.removeItem('pmpb-rco-role-token-v1');sessionStorage.removeItem(ACCESS_AUTH_RCO)}catch(_){}}
}
function requestIngressKey(type){
 return new Promise(resolve=>{
   if(!global.CentralCloud){alert('O módulo de conexão da Central não foi carregado. Atualize a página.');resolve('');return}
   const old=q('#centralAccessKeyOverlay');if(old)old.remove();
   const ov=document.createElement('div');ov.id='centralAccessKeyOverlay';ov.className='central-access-layer no-print';
   const title=type==='rco'?'Chave do Coordenador':'Chave operacional',hint=type==='rco'?'Informe a chave de Coordenação para entrar no RCO. Ela não será solicitada novamente durante este acesso.':'Informe a chave operacional para entrar no RSD. Ela não será solicitada novamente durante este acesso.';
   ov.innerHTML='<div class="central-access-card" style="max-width:560px"><div class="central-access-head"><h1>'+esc(title)+'</h1><p>'+esc(hint)+'</p></div><label style="font-size:11px;font-weight:800;color:#52697e">CHAVE DE ACESSO<input data-key type="password" autocomplete="off" style="width:100%;box-sizing:border-box;margin-top:6px;padding:12px;border:1px solid #cbd7e1;border-radius:9px;font-size:16px"></label><div data-key-status class="central-access-empty" style="margin-top:10px">A chave será validada somente para o ingresso neste módulo.</div><div class="central-access-toolbar"><button data-key-enter style="background:#17375e;color:#fff">Entrar</button><button data-key-cancel>Cancelar</button></div></div>';
   document.body.appendChild(ov);
   const inp=q('[data-key]',ov),st=q('[data-key-status]',ov),done=v=>{ov.remove();resolve(v||'')};
   const validate=async()=>{
     const key=String(inp.value||'').trim();if(!key){st.className='central-access-error';st.textContent='Informe a chave para continuar.';return}
     q('[data-key-enter]',ov).disabled=true;st.className='central-access-loading';st.textContent='Validando a credencial de ingresso…';
     try{await CentralCloud.jsonp('access-check',{module:type.toUpperCase(),token:key},{timeout:15000});saveIngressKey(type,key);done(key)}
     catch(e){clearIngressKey(type);st.className='central-access-error';st.textContent=e.message||'Credencial inválida.';q('[data-key-enter]',ov).disabled=false;inp.select()}
   };
   q('[data-key-enter]',ov).onclick=validate;q('[data-key-cancel]',ov).onclick=()=>done('');inp.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();validate()}};setTimeout(()=>inp.focus(),30)
 })
}
function pickerUnitFields(){
 const u=unit();return '<div class="central-access-unit"><label>Batalhão<select data-picker-batt><option value="BPTran" '+(u.batalhao==='BPTran'?'selected':'')+'>BPTran</option><option value="BPRv" '+(u.batalhao==='BPRv'?'selected':'')+'>BPRv</option></select></label><label>Companhia<select data-picker-comp>'+companies(u.batalhao,u.companhiaNumero)+'</select></label></div>'
}
function pickerParams(el){
 const b=q('[data-picker-batt]',el)?.value||'BPTran',n=Number(q('[data-picker-comp]',el)?.value||1)||1;
 return {batalhao:b,companhiaNumero:String(n),companhia:n+'ª '+(b==='BPRv'?'CPRv':'CPTran')}
}
function openServicePicker(type,mode){
 const receive=mode==='receive',label=type==='rsd'?'RSD':'RCO',title=receive?'Receber serviço em andamento':'Continuar serviço em andamento';
 const subtitle=receive?'Escolha a companhia. Serão exibidos somente os serviços formalmente disponibilizados para passagem.':'Escolha a companhia. Serão exibidos todos os serviços ainda abertos, com a data para identificação segura.';
 const el=shell(title,subtitle,pickerUnitFields()+'<div class="central-access-toolbar"><button data-refresh>Atualizar serviços</button><button data-back>Voltar</button></div><div class="central-access-list" data-list><div class="central-access-empty">Selecione a companhia para consultar os serviços.</div></div>');
 const batt=q('[data-picker-batt]',el),comp=q('[data-picker-comp]',el);
 batt.onchange=()=>{comp.innerHTML=companies(batt.value,1);setTimeout(()=>loadOpenServices(el,type,mode),0)};
 comp.onchange=()=>loadOpenServices(el,type,mode);
 q('[data-refresh]',el).onclick=()=>loadOpenServices(el,type,mode);q('[data-back]',el).onclick=()=>startScreen(type);
 setTimeout(()=>loadOpenServices(el,type,mode),40)
}
async function loadOpenServices(el,type,mode){
 const box=q('[data-list]',el);if(!box)return;const p=pickerParams(el);
 box.innerHTML='<div class="central-access-loading">Consultando os serviços da '+esc(p.companhia)+'…</div>';
 try{
   const r=await CentralCloud.jsonp('access-open-services',{module:type.toUpperCase(),mode,batalhao:p.batalhao,companhia:p.companhia},{timeout:20000}),rawItems=r.items||[],items=rawItems.filter(x=>mode==='receive'?!!x.passagemPendente:!x.passagemPendente);
   if(!items.length){box.innerHTML='<div class="central-access-empty">'+(mode==='receive'?'Nenhum serviço desta companhia foi disponibilizado para passagem.':'Nenhum serviço em aberto foi localizado nesta companhia.')+'</div>';return}
   box.innerHTML=items.map((x,i)=>{
     const date=fmtDate(x.data),status=String(x.status||'').replaceAll('_',' '),pass=!!x.passagemPendente;
     const title=type==='rsd'?((x.guarnicao||'Guarnição')+' — VTR '+(x.vtrPrincipal||'—')):('RCO — '+(x.companhia||p.companhia));
     const meta=type==='rsd'?[x.companhia,'Data: '+date,status,x.responsavel&&('Responsável atual: '+x.responsavel)].filter(Boolean):[x.companhia,'Data: '+date,status,x.responsavel&&('Responsável atual: '+x.responsavel),x.retificacaoMotivo&&('Retificação: '+x.retificacaoMotivo)].filter(Boolean);
     const action=mode==='receive'?'Receber este serviço':'Entrar neste serviço';
     return '<div class="central-access-item"><strong>'+esc(title)+'</strong><div class="central-access-meta">'+esc(meta.join(' • '))+'</div><button data-open="'+i+'">'+esc(action)+'</button></div>'
   }).join('');
   box.querySelectorAll('[data-open]').forEach(b=>b.onclick=async()=>{const item=items[Number(b.dataset.open)];b.disabled=true;try{await enterSelectedService(type,mode,item,el)}finally{if(document.body.contains(b))b.disabled=false}})
 }catch(e){box.innerHTML='<div class="central-access-error">'+esc(e.message||e)+'</div>'}
}
async function enterSelectedService(type,mode,item,el){
 const key=await requestIngressKey(type);if(!key)return false;
 if(type==='rsd'){
   if(mode==='receive'){
     if(typeof global.centralRsdReceiveSelectedPassage!=='function'){alert('Atualize a página para carregar o fluxo de recebimento.');return false}
     const ok=await global.centralRsdReceiveSelectedPassage(item,key);if(ok){lockRsdHeader();clearLayer();exitSetup()}return !!ok
   }
   if(typeof global.centralRsdClaimCloudItem!=='function'){alert('Atualize a página e tente novamente.');return false}
   const ok=await global.centralRsdClaimCloudItem(item,false,'',key);if(ok){lockRsdHeader();clearLayer();exitSetup()}return !!ok
 }
 if(typeof global.centralRcoClaimCloudItem!=='function'){alert('Atualize a página para carregar o fluxo do RCO.');return false}
 const ok=await global.centralRcoClaimCloudItem(item,false,mode==='receive',key);
 if(ok){
   if(mode==='receive'){clearLayer();enterSetup('rco','receive')}
   else{lockRcoHeader();clearLayer();exitSetup()}
 }
 return !!ok
}
async function rsdContinueScreen(){openServicePicker('rsd','continue')}
async function rsdReceive(){openServicePicker('rsd','receive')}
async function rcoContinue(){openServicePicker('rco','continue')}
async function rcoReceive(){openServicePicker('rco','receive')}
global.centralOpenServicePicker=openServicePicker;
function resumeRequested(){
 const p=new URLSearchParams(location.search);
 if(p.get('resumeRsd')==='1')return true;
 try{return !!sessionStorage.getItem(RETURN_KEY)}catch(_){return false}
}
function resumeContext(){
 const p=new URLSearchParams(location.search);let saved={};
 try{saved=JSON.parse(sessionStorage.getItem(RETURN_KEY)||'{}')||{}}catch(_){}
 let active={};try{active=JSON.parse(localStorage.getItem('pmpb-active-service-v1')||'{}')||{}}catch(_){}
 return {reportId:p.get('rsdReportId')||saved.rsdReportId||active.rsdReportId||'',serviceId:p.get('serviceId')||saved.serviceId||active.serviceId||'',segmento:Number(p.get('segmento')||saved.segmento||active.segmento||1)||1};
}
function clearResumeIntent(){
 try{sessionStorage.removeItem(RETURN_KEY)}catch(_){}
 try{history.replaceState({},'',location.pathname)}catch(_){}
}
async function resumeRsd(){
 const rc=resumeContext();
 shell('Retornando ao serviço','Reabrindo o RSD que estava em preenchimento.',`<div class="central-access-loading">Consultando primeiro o serviço salvo na Central…</div>`);
 try{
   let local=null;
   try{local=JSON.parse(localStorage.getItem('pmpb-transito-servico-diario-v2-draft')||'null')}catch(_){}
   const localMat=global.CentralCloud?CentralCloud.formatMatricula(local?.guarnicao?.matricula||local?.matriculaResponsavel||''):(local?.guarnicao?.matricula||'');
   if(rc.reportId&&typeof global.centralRsdClaimCloudItem==='function'){
     const ok=await global.centralRsdClaimCloudItem({reportId:rc.reportId,serviceId:rc.serviceId,segmento:rc.segmento,matricula:localMat},false,localMat);
     if(ok){lockRsdHeader();clearLayer();exitSetup();clearResumeIntent();setTimeout(()=>global.centralRefreshServiceModules?.(),180);return true}
   }
   if(typeof global.centralContinueService==='function'){
     const ok=await global.centralContinueService();
     if(ok){lockRsdHeader();clearLayer();exitSetup();clearResumeIntent();setTimeout(()=>global.centralRefreshServiceModules?.(),180);return true}
   }
   if(local&&(!rc.reportId||String(local.reportId||'')===String(rc.reportId))&&typeof global.applyPayload==='function'){
     if(confirm('A Central não conseguiu reabrir o serviço. Deseja carregar o rascunho local deste aparelho apenas como contingência?')){
       global.applyPayload(local);clearLayer();exitSetup();clearResumeIntent();return true
     }
   }
 }catch(e){}
 clearLayer();clearResumeIntent();
 alert('Não foi possível reabrir automaticamente o RSD anterior. O sistema manterá o fluxo de acesso para que o serviço possa ser localizado sem apagar dados.');
 startScreen('rsd');return false;
}
function init(){
 const type=pageType();if(!type||global.CENTRAL_READONLY_VIEWER)return;css();
 if(type==='rsd'){installRsdGuarnicaoChoice();installRsdCommanderFlow()}
 if(type==='rsd'&&resumeRequested()){resumeRsd();return}
 global.addEventListener('central-rsd-registered',ev=>{lockRsdHeader();exitSetup();const st=q('#rsdRegisterStatus');if(st){st.classList.remove('central-registered-note');st.textContent='Serviço em andamento. Os dados de identificação da guarnição estão bloqueados.'}window.scrollTo({top:0,behavior:'smooth'})});
 global.addEventListener('central-rco-responsavel-registrado',()=>{if(document.body.classList.contains('rco-setup')){markRcoRegisteredSetup();return}lockRcoHeader();const d=q('#dataInicio');if(d&&d.value&&typeof global.centralRcoRefreshCloud==='function')setTimeout(function(){global.centralRcoRefreshCloud();},120)});
 let next='',mode='';try{next=sessionStorage.getItem(NEXT)||'';mode=sessionStorage.getItem(MODE)||''}catch(_){}
 if(next===type+'-setup'||mode===type+'-setup'){enterSetup(type);return}
 startScreen(type);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,180));else setTimeout(init,180);
})(window);
