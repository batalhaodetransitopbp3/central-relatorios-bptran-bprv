(function(global){
'use strict';
const FLAG_OPERATIONAL='central-module-auth-operational-v1',FLAG_P3='central-module-auth-p3-v1';
const MODULES=[
  {re:/^relatorio_operacao(?:_ios)?\.html$/i,module:'OPERACAO',title:'Relatório de Operações'},
  {re:/^auto_remocao_veiculos(?:_ios)?\.html$/i,module:'CIRVC',title:'CIRVC'},
  {re:/^relatorio_traslados_reboque(?:_ios)?\.html$/i,module:'REBOQUE',title:'Relatório de Traslado / Reboque'},
  {re:/^checklist_viatura(?:_ios)?\.html$/i,module:'CHECKLIST',title:'Checklist de Viatura'},
  {re:/^cirvc_transporte\.html$/i,module:'CIRVC_TRANSPORTE',title:'CIRVC — Transporte'},
  {re:/^cadastros_admin\.html$/i,module:'CADASTROS_ADMIN',title:'Cadastro Mestre — Administração',kind:'p3'},
  {re:/^motomecanizacao\.html$/i,module:'MOTOMECANIZACAO',title:'Motomecanização',kind:'p3'}
];
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
function config(){const f=(location.pathname.split('/').pop()||'').toLowerCase(),c=MODULES.find(x=>x.re.test(f))||null;if(c&&!c.kind)c.kind='central';return c}
function flag(c){return c?.kind==='p3'?FLAG_P3:FLAG_OPERATIONAL}
function lock(c){try{sessionStorage.setItem(flag(c),(location.pathname.split('/').pop()||'').toLowerCase())}catch(_){}}
function unlock(c){try{sessionStorage.removeItem(flag(c))}catch(_){}global.CENTRAL_MODULE_ACCESS_READY=false}
function style(){
  if(document.getElementById('centralOperationalGateStyle'))return;
  const s=document.createElement('style');s.id='centralOperationalGateStyle';
  s.textContent=[
    '.central-op-gate{position:fixed;inset:0;z-index:25000;background:#eef3f7;display:grid;place-items:center;padding:14px;font-family:Arial,sans-serif;color:#19354f}',
    '.central-op-card{width:min(560px,100%);background:#fff;border:1px solid #c9d7e2;border-radius:18px;box-shadow:0 18px 55px #18364d2b;padding:18px}',
    '.central-op-card h1{font-size:21px;margin:0 0 6px;color:#17375e}.central-op-card p{margin:0 0 14px;color:#647789;font-size:13px}',
    '.central-op-card label{display:block;font-size:11px;font-weight:800;color:#52697e}.central-op-card input{width:100%;box-sizing:border-box;margin-top:6px;padding:12px;border:1px solid #cbd7e1;border-radius:9px;font-size:16px}',
    '.central-op-status{margin-top:10px;padding:11px;border-radius:9px;background:#f5f8fa;color:#5c7184;font-size:12px;text-align:center}',
    '.central-op-status.error{background:#fff1f1;color:#7b3030;border:1px solid #e2bbbb}.central-op-status.ok{background:#eef8f3;color:#17633d;border:1px solid #bcdcca}',
    '.central-op-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.central-op-actions button{padding:10px 13px;border-radius:9px;border:1px solid #bdcbd6;background:#fff;color:#29485f;font-weight:800;cursor:pointer}',
    '.central-op-actions .enter{background:#17375e;color:#fff;border-color:#17375e}.central-op-actions button:disabled{opacity:.55;cursor:wait}',
    '@media(max-width:600px){.central-op-gate{padding:8px}.central-op-card{border-radius:14px;padding:14px}.central-op-actions button{flex:1}}',
    '@media print{.central-op-gate{display:none!important}}'
  ].join('');
  document.head.appendChild(s)
}
function shell(c){
  style();document.getElementById('centralOperationalGate')?.remove();
  const ov=document.createElement('div');ov.id='centralOperationalGate';ov.className='central-op-gate no-print';ov.dataset.kind=c.kind||'central';
  const keyName=c.kind==='p3'?'Chave P3':'chave operacional',keyLabel=c.kind==='p3'?'CHAVE P3':'CHAVE OPERACIONAL';
  ov.innerHTML='<div class="central-op-card"><h1>'+esc(c.title)+'</h1><p>A '+esc(keyName)+' é validada somente no ingresso. Depois disso, ela não será solicitada novamente dentro deste módulo.</p><div data-key-box hidden><label>'+esc(keyLabel)+'<input data-key type="password" autocomplete="off"></label></div><div class="central-op-status" data-status>Validando o acesso…</div><div class="central-op-actions"><button type="button" class="enter" data-enter hidden>Entrar no módulo</button><button type="button" data-back>Voltar</button></div></div>';
  document.body.appendChild(ov);
  ov.querySelector('[data-back]').onclick=()=>{unlock(c);if(history.length>1)history.back();else location.href='index.html'};
  return ov
}
function cKind(ov){return ov?.dataset?.kind==='p3'?'p3':'central'}
function showInput(ov,msg){
  const box=ov.querySelector('[data-key-box]'),inp=ov.querySelector('[data-key]'),btn=ov.querySelector('[data-enter]'),st=ov.querySelector('[data-status]');
  box.hidden=false;btn.hidden=false;btn.disabled=false;st.className='central-op-status'+(msg?' error':'');st.textContent=msg||(cKind(ov)==='p3'?'Informe a Chave P3 para entrar.':'Informe a chave operacional para entrar.');
  setTimeout(()=>inp.focus(),30)
}
async function validate(c,ov,key){
  const st=ov.querySelector('[data-status]'),btn=ov.querySelector('[data-enter]');if(btn)btn.disabled=true;
  st.className='central-op-status';st.textContent='Validando a credencial de ingresso…';
  try{
    if(c.kind==='p3')await global.CentralCloud.jsonp('p3-config',{token:key},{timeout:15000,progress:false});
    else await global.CentralCloud.jsonp('access-check',{module:'RSD',token:key},{timeout:15000,progress:false});
    global.CentralCloud.setToken(key,c.kind);lock(c);global.CENTRAL_MODULE_ACCESS_READY=true;st.className='central-op-status ok';st.textContent='Acesso validado.';
    global.dispatchEvent(new CustomEvent('central-module-access-ready',{detail:{module:c.module}}));
    setTimeout(()=>ov.remove(),120);return true
  }catch(e){
    if(global.CentralCloud.isAuthError&&global.CentralCloud.isAuthError(e))global.CentralCloud.clearToken(c.kind);
    lock(c);showInput(ov,(e&&e.message)||'Não foi possível validar a chave.');return false
  }
}
async function init(){
  const c=config();if(!c||!global.CentralCloud)return;
  global.CENTRAL_MODULE_ACCESS_READY=false;lock(c);
  const ov=shell(c),saved=global.CentralCloud.getToken(c.kind);
  const enter=async()=>{const inp=ov.querySelector('[data-key]'),key=String(inp.value||'').trim();if(!key){showInput(ov,c.kind==='p3'?'Informe a Chave P3 para continuar.':'Informe a chave operacional para continuar.');return}await validate(c,ov,key)};
  ov.querySelector('[data-enter]').onclick=enter;ov.querySelector('[data-key]').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();enter()}};
  if(saved)await validate(c,ov,saved);else showInput(ov,'')
}
global.addEventListener('central-module-auth-lost',e=>{
  const c=config();if(!c)return;
  const kind=e?.detail?.kind||'central';if((c.kind==='p3'?'p3':'central')!==kind)return;
  global.CENTRAL_MODULE_ACCESS_READY=false;setTimeout(()=>init(),0);
});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})(window);
