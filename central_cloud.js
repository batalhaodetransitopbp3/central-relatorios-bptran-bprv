(function(global){
'use strict';
const ENDPOINT=global.CENTRAL_CLOUD_ENDPOINT||'https://script.google.com/macros/s/AKfycbyxmDMgk-h2lTuf_6BvUngMLu-yMDvfenHNshQ3aa0V3lDPzh5kosUfiqm90IugmepPpw/exec';
let v10Enabled=global.CENTRAL_V10_ENABLED===true;
const TOKEN_KEY='pmpb-central-token-v1',P3_TOKEN_KEY='pmpb-p3-token-v1',SISTEMA_TOKEN_KEY='pmpb-comando-token-v1',QUEUE_KEY='pmpb-central-sync-queue-v1',DEVICE_KEY='pmpb-device-id-v1';
function uid(p='id'){try{return p+'-'+crypto.randomUUID()}catch(_){return p+'-'+Date.now()+'-'+Math.random().toString(36).slice(2)}}
function formatMatricula(v){const d=String(v||'').replace(/\D/g,'').slice(0,7);return d.length<=3?d:d.length<=6?d.slice(0,3)+'.'+d.slice(3):d.slice(0,3)+'.'+d.slice(3,6)+'-'+d.slice(6)}
function getDeviceId(){try{let d=localStorage.getItem(DEVICE_KEY)||'';if(!d){d=uid('dev');localStorage.setItem(DEVICE_KEY,d)}return d}catch(_){return uid('dev')}}
function tokenStorageKey(kind){if(kind==='p3')return P3_TOKEN_KEY;if(kind==='comando')return SISTEMA_TOKEN_KEY;return TOKEN_KEY}
function getToken(kind='central'){try{return localStorage.getItem(tokenStorageKey(kind))||''}catch(_){return ''}}
function setToken(v,kind='central'){try{const k=tokenStorageKey(kind);if(v)localStorage.setItem(k,v);else localStorage.removeItem(k)}catch(_){}}
function moduleAuthLocked(kind='central'){try{const current=(location.pathname.split('/').pop()||'').toLowerCase(),operational=(sessionStorage.getItem('central-module-auth-operational-v1')||'').toLowerCase(),p3module=(sessionStorage.getItem('central-module-auth-p3-v1')||'').toLowerCase(),comandomodule=(sessionStorage.getItem('central-module-auth-comando-v1')||'').toLowerCase();if(kind==='central')return sessionStorage.getItem('central-module-auth-rsd-v1')==='1'||(operational&&operational===current);if(kind==='p3')return !!(p3module&&p3module===current);if(kind==='comando')return !!(comandomodule&&comandomodule===current);return false}catch(_){return false}}
function askToken(kind='central',message,force=false){let t=force?'':getToken(kind);if(t)return t;if(moduleAuthLocked(kind)){setTimeout(()=>{try{global.dispatchEvent(new CustomEvent('central-module-auth-lost',{detail:{kind,message:'A credencial de ingresso não está disponível.'}}))}catch(_){}},0);return ''}const msg=message||(kind==='p3'?'Informe a Chave P3:':kind==='comando'?'Informe a senha da Gestão de Sistema:':'Informe a chave operacional da Central:');t=prompt(msg)||'';t=t.trim();if(t)setToken(t,kind);return t}
const P3_ACTIONS=new Set(['p3-query','p3-analysis','p3-analysis-compare','p3-config','motomecanizacao-list','checklist-list','motomecanizacao-update','cadastro-upsert','p3-config-set','rco-upsert','rco-retification-open']);
const P3_ACTIONS=new Set(['p3-query','p3-analysis','p3-analysis-compare','p3-config','motomecanizacao-list','checklist-list','motomecanizacao-update','cadastro-upsert','p3-config-set','rco-upsert','rco-retification-open']);
const COMANDO_ACTIONS=new Set(['comando-rsd-patch','sistema-rsd-patch','sistema-feedback-list']);
function tokenKindForAction(action){const a=String(action||'');if(a.startsWith('master-'))return 'master';if(a==='sistema-feedback-enviar')return 'central';if(COMANDO_ACTIONS.has(a)||a.startsWith('comando-')||a.startsWith('sistema-'))return 'comando';return P3_ACTIONS.has(a)?'p3':'central'}
function isAuthError(err){return err?.code==='AUTH_INVALID'||/(chave|credencial|senha)[^\n]{0,80}inválid/i.test(String(err?.message||err||''))}
function authError(action,message,token,kindOverride){const e=new Error(message||'Chave inválida.');if(/(chave|credencial|senha)[^\n]{0,80}inválid/i.test(e.message)){const kind=kindOverride||tokenKindForAction(action);e.code='AUTH_INVALID';e.tokenKind=kind;if(kind==='central'||kind==='p3'||kind==='comando'){const saved=getToken(kind);if(!token||!saved||String(saved)===String(token))setToken('',kind);setTimeout(()=>{try{global.dispatchEvent(new CustomEvent('central-module-auth-lost',{detail:{kind,message:e.message}}))}catch(_){}},0)}}return e}
function clearToken(kind='central'){setToken('',kind)}
function unitParams(u={}){let b=String(u.batalhao||u.batalhaoSigla||'BPTran');b=b.toUpperCase()==='BPRV'?'BPRv':'BPTran';let n=Number(u.companhiaNumero)||Number(String(u.companhia||'').match(/\d+/)?.[0])||1;n=Math.min(5,Math.max(1,n));return {batalhao:b,companhiaNumero:String(n),companhia:n+'ª '+(b==='BPRv'?'CPRv':'CPTran')}}
function qs(obj){return Object.entries(obj||{}).filter(([,v])=>v!==undefined&&v!==null&&v!=='').map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(String(v))).join('&')}
function jsonpRaw(action,params={},opts={}){return new Promise((resolve,reject)=>{
  const showProgress=action!=='version'&&opts.progress!==false;if(showProgress)beginProgress(progressMessageForAction(action,'start'));
  const callback='__central_cb_'+Date.now()+'_'+Math.random().toString(36).slice(2),script=document.createElement('script');
  let done=false,timer;
  function cleanup(){clearTimeout(timer);try{delete global[callback]}catch(_){global[callback]=undefined}script.remove()}
  function finish(err,data){if(done)return;done=true;if(showProgress)updateProgress(progressMessageForAction(action,err?'error':'finish'),err?96:92);cleanup();if(showProgress)endProgress(err?'Falha na operação.':'Concluído.');err?reject(err):resolve(data)}
  global[callback]=function(data){
    if(showProgress)updateProgress(progressMessageForAction(action,'response'),86);
    if(data&&data.ok===false)finish(authError(action,data.message||'Consulta rejeitada.',params.token));
    else finish(null,data||{ok:false,message:'Resposta vazia da Central.'});
  };
  script.async=true;
  script.onerror=()=>finish(new Error('Falha de comunicação com a Central.'));
  script.src=ENDPOINT+'?'+qs({...params,action,callback,_:Date.now()});
  (document.head||document.documentElement).appendChild(script);
  if(showProgress)updateProgress(progressMessageForAction(action,'wait'),34);
  timer=setTimeout(()=>finish(new Error('Tempo esgotado ao consultar a Central.')),opts.timeout||20000);
})}
async function jsonp(action,params={},opts={}){
  const token=String(params?.token||'');
  if(!token||action==='version')return jsonpRaw(action,params,opts);
  const payload={...params};delete payload.token;delete payload.callback;delete payload._;
  try{
    return await submitForm(action,payload,token,{popup:false,progress:opts.progress,timeout:opts.timeout||20000,tokenKind:opts.tokenKind||tokenKindForAction(action)});
  }catch(err){
    if(/não reconhecida|POST não reconhecida/i.test(String(err?.message||err)))return jsonpRaw(action,params,opts);
    throw err;
  }
}
function submitForm(action,payload,token,opts={}){return new Promise((resolve,reject)=>{const requestId=uid('post'),name='central_post_'+Date.now()+'_'+Math.random().toString(36).slice(2),showProgress=opts.progress!==false;let win=null,iframe=null,target=name;if(opts.popup!==false){win=window.open('about:blank',name,'width=620,height=540');if(!win){reject(new Error('O navegador bloqueou a janela de confirmação. Permita pop-ups e tente novamente.'));return}}else{iframe=document.createElement('iframe');iframe.name=name;iframe.style.display='none';document.body.appendChild(iframe)}if(showProgress)beginProgress(progressMessageForAction(action,'start'));const form=document.createElement('form');form.method='POST';form.action=ENDPOINT;form.target=target;form.style.display='none';for(const [k,v] of Object.entries({action,token,requestId,payload:JSON.stringify(payload||{})})){const i=document.createElement('input');i.type='hidden';i.name=k;i.value=v;form.appendChild(i)}let timer;const onMsg=e=>{const d=e.data;if(!d||d.source!=='central-p3-v10'||d.action!==action||String(d.requestId||'')!==requestId)return;if(showProgress)updateProgress(progressMessageForAction(action,'response'),88);cleanup(d.ok);d.ok?resolve(d):reject(authError(action,d.message||'Operação rejeitada.',token,opts.tokenKind))};function cleanup(ok){clearTimeout(timer);global.removeEventListener('message',onMsg);form.remove();if(iframe)setTimeout(()=>iframe.remove(),400);if(showProgress)endProgress(ok===false?'Falha na operação.':'Concluído.')}global.addEventListener('message',onMsg);document.body.appendChild(form);form.submit();if(showProgress)updateProgress(progressMessageForAction(action,'wait'),38);timer=setTimeout(()=>{cleanup(false);reject(new Error('Tempo esgotado ao comunicar com a Central.'))},opts.timeout||20000)})}
function readQueue(){try{const x=JSON.parse(localStorage.getItem(QUEUE_KEY)||'[]');return Array.isArray(x)?x:[]}catch(_){return []}}
function writeQueue(q){try{localStorage.setItem(QUEUE_KEY,JSON.stringify(q.slice(-100)))}catch(_){}}
function enqueue(action,payload,unit,token){const q=readQueue();q.push({id:uid('sync'),action,payload,unit,token:token||'',tokenKind:tokenKindForAction(action),createdAt:new Date().toISOString(),tries:0});writeQueue(q);return q.length}
async function postOrQueue(action,payload,{token,unit,popup=false}={}){const kind=tokenKindForAction(action),t=token||getToken(kind);if(!navigator.onLine){enqueue(action,payload,unit,t);return {ok:true,queued:true,message:'Sem conexão: dados preservados para sincronização.'}}try{return await submitForm(action,payload,t,{popup})}catch(err){if(isAuthError(err))throw err;enqueue(action,payload,unit,t);return {ok:true,queued:true,message:'Envio pendente: '+err.message}}}
async function retryQueue(){if(!navigator.onLine)return {sent:0,pending:readQueue().length,authRequired:0};const q=readQueue(),left=[];let sent=0,authRequired=0;for(const item of q){const kind=item.tokenKind||tokenKindForAction(item.action),t=item.token||getToken(kind);try{await submitForm(item.action,item.payload,t,{popup:false,timeout:8000});sent++}catch(err){item.tries=(item.tries||0)+1;if(isAuthError(err)){item.token='';item.tokenKind=kind;authRequired++}left.push(item)}}writeQueue(left);return {sent,pending:left.length,authRequired}}
function queueCount(){return readQueue().length}
async function compressImage(file,{maxSide=1600,quality=.78,type='image/jpeg'}={}){if(!file)return null;const img=await new Promise((res,rej)=>{const u=URL.createObjectURL(file),im=new Image();im.onload=()=>{URL.revokeObjectURL(u);res(im)};im.onerror=e=>{URL.revokeObjectURL(u);rej(e)};im.src=u});let w=img.naturalWidth,h=img.naturalHeight,s=Math.min(1,maxSide/Math.max(w,h));w=Math.max(1,Math.round(w*s));h=Math.max(1,Math.round(h*s));const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;canvas.getContext('2d').drawImage(img,0,0,w,h);const dataUrl=canvas.toDataURL(type,quality);return {dataUrl,mimeType:type,largura:w,altura:h,tamanhoBytes:Math.round((dataUrl.length-dataUrl.indexOf(',')-1)*.75)}}
async function searchCadastro(tipo,q,u,token,opts={}){
  const isMilitar=String(tipo||'').toLowerCase().indexOf('militar')===0,up=isMilitar?{}:unitParams(u);
  const kind=opts.tokenKind||(token&&getToken('comando')&&String(token)===String(getToken('comando'))?'comando':'central');
  let t=token||getToken(kind)||(kind==='comando'?getToken('comando'):'')||askToken(kind==='comando'?'comando':'central',kind==='comando'?'Informe a senha da Gestão de Sistema para consultar o Cadastro Mestre:':'Informe a chave operacional da Central para consultar o Cadastro Mestre:');
  if(!t)throw new Error('Consulta cancelada: credencial não informada.');
  try{return await jsonp('cadastros',{...up,tipo,q,token:t},{timeout:opts.timeout||20000,tokenKind:kind,progress:opts.progress})}
  catch(err){
    if(!isAuthError(err)||opts.noRetry)throw err;
    t=askToken(kind,kind==='comando'?'Senha inválida. Digite novamente a senha da Gestão de Sistema:':'A chave informada é inválida. Digite novamente a chave operacional da Central:',true);
    if(!t)throw new Error('Consulta cancelada: credencial não informada.');
    return await jsonp('cadastros',{...up,tipo,q,token:t},{timeout:opts.timeout||20000,tokenKind:kind,progress:opts.progress});
  }
}
let progressDepth=0,progressEl=null,progressBarEl=null,progressTextEl=null,progressTimer=null,progressValue=0;
function progressMessageForAction(action,phase='start'){
  const a=String(action||'').toLowerCase(),finish=phase==='finish'||phase==='response',wait=phase==='wait';
  if(a==='cadastros'||a.includes('militar-validar'))return finish?'Cadastro localizado.':wait?'Consultando o Cadastro Mestre…':'Consultando o Cadastro Mestre…';
  if(a==='guarnicao-next')return 'Definindo a identificação da guarnição…';
  if(a==='rsd-start')return finish?'Guarnição registrada.':wait?'Registrando a guarnição na Central…':'Registrando a guarnição no serviço…';
  if(a==='rsd-draft-sync')return finish?'Rascunho sincronizado.':'Sincronizando o RSD na nuvem…';
  if(a==='rsd-upsert')return finish?'RSD enviado.':'Finalizando e enviando o RSD…';
  if(a==='rsd-force-finalize')return finish?'Finalização excepcional registrada.':'Finalizando o RSD por determinação do Coordenador…';
  if(a.startsWith('rsd-'))return finish?'RSD atualizado.':'Processando o RSD na Central…';
  if(a.startsWith('passagem-'))return finish?'Passagem de serviço atualizada.':'Processando a passagem de serviço…';
  if(a.startsWith('operation-')||a.startsWith('service-event-'))return finish?'Operação sincronizada.':'Salvando dados da operação…';
  if(a.startsWith('cirvc-'))return finish?'CIRVC atualizado.':'Processando o CIRVC…';
  if(a.startsWith('reboque-'))return finish?'Relatório de traslado atualizado.':'Processando o relatório de traslado…';
  if(a.startsWith('checklist-'))return finish?'Checklist atualizado.':'Processando o checklist da viatura…';
  if(a.startsWith('motomecanizacao-'))return finish?'Motomecanização atualizada.':'Consultando/atualizando a motomecanização…';
  if(a.startsWith('rco-'))return finish?'RCO atualizado.':'Processando dados do RCO…';
  if(a.startsWith('p3-'))return finish?'Consulta da Gestão P3 concluída.':'Consultando a Gestão P3…';
  if(a.startsWith('master-'))return finish?'Controle Geral atualizado.':'Processando no Controle Geral…';
  if(a.includes('cadastro-upsert'))return finish?'Cadastro atualizado.':'Salvando cadastro…';
  return finish?'Operação concluída.':wait?'Aguardando resposta da Central…':'Processando na Central…';
}
function dedicatedProgressVisible(){
  const h=document.getElementById('backendProgressHost');if(h&&!h.hidden)return true;
  return !!document.querySelector('.progress-box.show:not(#centralProgressStatus)');
}
function ensureProgressStatus(){
  if(progressEl&&document.body?.contains(progressEl))return progressEl;if(!document.body)return null;
  progressEl=document.createElement('div');progressEl.id='centralProgressStatus';progressEl.className='no-print';progressEl.setAttribute('role','status');progressEl.setAttribute('aria-live','polite');progressEl.setAttribute('aria-busy','false');
  const track=document.createElement('div'),bar=document.createElement('div'),txt=document.createElement('div');progressBarEl=bar;progressTextEl=txt;
  Object.assign(progressEl.style,{position:'fixed',left:'50%',top:'10px',transform:'translateX(-50%)',zIndex:9997,pointerEvents:'none',width:'min(560px,90vw)',padding:'9px 12px 10px',borderRadius:'12px',background:'rgba(255,255,255,.96)',border:'1px solid rgba(36,66,95,.20)',boxShadow:'0 5px 18px rgba(0,0,0,.14)',font:'700 11px Arial',color:'#24425f',opacity:'0',transition:'opacity .18s ease'});
  Object.assign(track.style,{height:'6px',background:'#dfe7ee',borderRadius:'999px',overflow:'hidden'});
  Object.assign(bar.style,{height:'100%',width:'0%',background:'linear-gradient(90deg,#315f93,#17375e)',borderRadius:'999px',transition:'width .25s ease'});
  Object.assign(txt.style,{marginTop:'6px',textAlign:'center',lineHeight:'1.25'});
  track.appendChild(bar);progressEl.appendChild(track);progressEl.appendChild(txt);document.body.appendChild(progressEl);return progressEl
}
function setProgressValue(v){progressValue=Math.max(progressValue,Math.min(100,Number(v)||0));if(progressBarEl)progressBarEl.style.width=progressValue+'%'}
function beginProgress(message='Processando…'){
  progressDepth++;const el=ensureProgressStatus();if(!el)return progressDepth;
  if(progressDepth===1){clearInterval(progressTimer);progressValue=8;setProgressValue(8);progressTimer=setInterval(()=>setProgressValue(progressValue<55?progressValue+6:progressValue<78?progressValue+3:progressValue<91?progressValue+1:progressValue),420)}
  if(progressTextEl)progressTextEl.textContent=message;el.setAttribute('aria-busy','true');
  if(!dedicatedProgressVisible())el.style.opacity='1';return progressDepth
}
function updateProgress(message='Processando…',value){
  const el=ensureProgressStatus();if(el&&progressDepth>0){if(message&&progressTextEl)progressTextEl.textContent=message;if(value!=null)setProgressValue(value);if(!dedicatedProgressVisible())el.style.opacity='1'}
}
function endProgress(finalMessage='Concluído.'){
  progressDepth=Math.max(0,progressDepth-1);const el=ensureProgressStatus();
  if(el&&progressDepth===0){clearInterval(progressTimer);setProgressValue(100);if(progressTextEl)progressTextEl.textContent=finalMessage;el.setAttribute('aria-busy','false');if(!dedicatedProgressVisible())el.style.opacity='1';setTimeout(()=>{if(progressDepth===0){el.style.opacity='0';progressValue=0;if(progressBarEl)progressBarEl.style.width='0%'}},650)}
}
function installPassiveProgress(){
  if(global.__centralPassiveProgressInstalled)return;global.__centralPassiveProgressInstalled=true;
  document.addEventListener('click',e=>{
    const a=e.target?.closest?.('a[href]');if(!a)return;
    const href=String(a.getAttribute('href')||'');if(!href||href.startsWith('#')||/^javascript:/i.test(href)||a.target==='_blank'||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;
    try{const u=new URL(a.href,location.href);if(u.origin===location.origin){beginProgress('Abrindo a próxima etapa…');updateProgress('Carregando a página solicitada…',42)}}catch(_){}
  },true);
  global.addEventListener('beforeprint',()=>{beginProgress('Preparando impressão / PDF…');updateProgress('Organizando o documento para impressão…',72)});
  global.addEventListener('afterprint',()=>endProgress('Documento preparado.'));
}
function installStatusBadge(){if(document.getElementById('centralSyncBadge'))return;const b=document.createElement('div');b.id='centralSyncBadge';b.className='no-print';b.setAttribute('role','status');b.setAttribute('aria-live','polite');Object.assign(b.style,{position:'fixed',right:'10px',bottom:'10px',zIndex:500,border:'0',borderRadius:'14px',padding:'5px 8px',background:'rgba(255,255,255,.46)',color:'#24425f',font:'700 10px Arial',boxShadow:'none',opacity:'.48',pointerEvents:'none',userSelect:'none'});function refresh(){const n=queueCount();b.textContent=n?'☁ '+n+' envio(s) pendente(s)':'☁ Sincronizado';b.style.color=n?'#8a5a00':'#176b3a'}document.body.appendChild(b);refresh();global.addEventListener('online',()=>setTimeout(async()=>{beginProgress('Sincronizando envios pendentes…');try{await retryQueue();refresh()}finally{endProgress('Sincronização concluída.')}},800));installPassiveProgress()}

async function probe(){if(v10Enabled)return true;try{const r=await jsonp('version',{}, {timeout:10000});v10Enabled=!!(r&&r.ok&&String(r.version||'').startsWith('10'));if(v10Enabled)global.dispatchEvent(new CustomEvent('central-v10-ready',{detail:r}));return v10Enabled}catch(_){return false}}
global.CentralCloud={ENDPOINT,get V10_ENABLED(){return v10Enabled},isEnabled:()=>v10Enabled,probe,uid,formatMatricula,getDeviceId,getToken,setToken,clearToken,askToken,isAuthError,tokenKindForAction,unitParams,jsonp,submitForm,postOrQueue,retryQueue,queueCount,compressImage,searchCadastro,installStatusBadge,beginProgress,updateProgress,endProgress,progressMessageForAction,installPassiveProgress};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{installStatusBadge();setTimeout(probe,150)});else{installStatusBadge();setTimeout(probe,150)}
})(window);
