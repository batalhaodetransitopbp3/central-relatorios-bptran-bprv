(function(global){
'use strict';
const CHECKLIST_ID_KEY='pmpb-checklist-cloud-id-v1';
let completionLocked=false;
function el(id){return document.getElementById(id)}
function val(id){return String(el(id)?.value||'').trim()}
function numCompany(){return Number(val('globalCompanhia'))||1}
function unit(){const b=String(val('globalBatalhao')||'BPTran').toUpperCase()==='BPRV'?'BPRv':'BPTran';const n=numCompany();return {batalhao:b,companhiaNumero:n,companhia:n+'ª '+(b==='BPRv'?'CPRv':'CPTran')}}
function checklistId(){
  const managed=global.centralChecklistId?.();
  if(managed)return String(managed);
  let id='';try{id=localStorage.getItem(CHECKLIST_ID_KEY)||''}catch(_){}
  if(!id){id=global.CentralCloud?.uid('chk')||('chk-'+Date.now());try{localStorage.setItem(CHECKLIST_ID_KEY,id)}catch(_){}}
  return id
}
function selectedValue(item){return item.querySelector('input[type="radio"]:checked')?.value||''}
function isIrregular(v){return (global.ChecklistProfiles?.isIrregularSituacao||(x=>['nao','defeito','avaria','baixo','baixa','ausente'].includes(String(x||'').toLowerCase())))(v)}
function currentVehicleTipo(){
  const raw=String(el('tipo_veiculo')?.value||global.CENTRAL_CHECKLIST_VEHICLE_TIPO||'AUTOMOVEL');
  return global.ChecklistProfiles?global.ChecklistProfiles.normalizeVehicleTipo(raw):(/MOTO/i.test(raw)?'MOTOCICLETA':/GUINCHO|AGRALE/i.test(raw)?'GUINCHO':/REBOQUE/i.test(raw)?'REBOQUE':'AUTOMOVEL');
}
function collectItems(){
  const CP=global.ChecklistProfiles;
  return [...document.querySelectorAll('.checklist-section .check-item')].filter(item=>!item.classList.contains('tipo-hidden')).map(item=>{
    const key=item.dataset.item||item.querySelector('input[type="radio"]')?.name||'';
    const sec=item.closest('.checklist-section');
    const label=item.querySelector('.item-name')?.textContent?.trim()||key;
    const situacao=selectedValue(item);
    const obs=item.querySelector('textarea')?.value?.trim()||'';
    const meta=CP?.itemMeta(key);
    const gera=CP
      ? CP.shouldGeraAlteracaoMotomec(key,situacao)
      : (item.dataset.geraMotomec!=='0' && isIrregular(situacao));
    return {
      itemId:key,
      grupo:sec?.dataset.section||sec?.querySelector('h2')?.textContent?.trim()||'',
      item:label,
      situacao,
      descricao:obs,
      prioridade:'NORMAL',
      geraPendenciaMotomec:!!(meta?meta.geraPendenciaMotomec:(item.dataset.geraMotomec!=='0')),
      categoria:meta?.categoria||item.dataset.categoria||'',
      abrirAlteracaoMotomec:!!gera
    };
  }).filter(x=>x.item&&x.situacao);
}
function collectPhotos(){
  return [...document.querySelectorAll('#vehiclePhotoGrid img')].map(img=>{
    const dataUrl=img.currentSrc||img.src||''; if(!dataUrl.startsWith('data:'))return null;
    return {dataUrl,capturadaEm:new Date().toISOString()};
  }).filter(Boolean);
}
function buildPayload(){
  const u=unit(), id=checklistId(), tipo=currentVehicleTipo();
  return {checklist:{
    checklistId:id,batalhao:u.batalhao,companhiaNumero:u.companhiaNumero,companhia:u.companhia,
    dataHora:[val('data_inicio'),val('hora_inicio')].filter(Boolean).join('T')||new Date().toISOString(),
    viatura:{prefixo:val('prefixo'),placa:val('placa'),marcaModelo:val('marca_modelo'),tipo:tipo},
    km:val('km_inicial'),turno:val('turno'),local:val('local'),condutorMatricula:global.CentralCloud?.formatMatricula(val('matricula'))||val('matricula'),
    condutorNome:val('condutor'),condutorPostoGrad:'',itens:collectItems(),fotos:collectPhotos(),observacoes:val('observacoes'),assinaturaDataUrl:val('signatureData')
  }};
}
async function finalizar(){
  if(completionLocked){alert('Este checklist já foi finalizado ou está na fila de envio.');return}
  const issues=typeof global.getBlockingIssues==='function'?global.getBlockingIssues():[];
  if(issues.length){
    if(typeof global.updatePendingCount==='function')global.updatePendingCount();
    if(typeof global.focusPending==='function')global.focusPending(issues[0]);
    alert('Conclua as pendências de preenchimento do checklist antes de enviar à Motomecanização.');
    return;
  }
  if(!global.CentralCloud){alert('Módulo de nuvem indisponível. O checklist continua podendo ser gerado localmente.');return}
  const enabled=await global.CentralCloud.probe();
  if(!enabled){alert('Checklist preservado localmente. O banco da Motomecanização ficará disponível após a publicação do backend v10.');return}
  const token=global.CentralCloud.askToken('central');if(!token)return;
  if(!val('prefixo')){alert('Informe o prefixo da viatura.');el('prefixo')?.focus();return}
  if(!val('matricula')){alert('Informe a matrícula do condutor.');el('matricula')?.focus();return}
  if(!val('condutor')){alert('Informe o nome do condutor.');el('condutor')?.focus();return}
  const missing=[...document.querySelectorAll('.checklist-section .check-item')].filter(item=>!item.classList.contains('tipo-hidden')&&!item.querySelector('input[type="radio"]:checked'));
  if(missing.length){alert('Ainda existem '+missing.length+' item(ns) do checklist sem resposta.');missing[0].scrollIntoView({behavior:'smooth',block:'center'});return}
  if(el('signatureData')&&!el('signatureData').value){alert('A assinatura do condutor é obrigatória antes da finalização no banco.');el('signatureBox')?.scrollIntoView({behavior:'smooth',block:'center'});return}
  const p=buildPayload();
  const finalizedPrefix=val('prefixo');
  const finalizedOperationalDate=global.centralChecklistOperationalDate?.()||'';
  const nAlt=(p.checklist.itens||[]).filter(x=>x.abrirAlteracaoMotomec).length;
  const btn=el('cloudChecklistBtn');if(btn)btn.disabled=true;
  try{
    const r=await global.CentralCloud.postOrQueue('checklist-upsert',p,{token,unit:unit(),popup:false});
    if(r.queued){
      completionLocked=true;
      alert('Dados preservados. O envio definitivo à Motomecanização está pendente e será reenviado automaticamente.');
    }
    else {
      completionLocked=true;
      const msg=r.message||'Checklist registrado.';
      alert(msg+(nAlt?(' '+nAlt+' alteração(ões) técnica(s) aberta(s) para a Motomecanização.'):' Nenhuma alteração técnica aplicável à Motomecanização.'));
      try{localStorage.removeItem(CHECKLIST_ID_KEY)}catch(_){}
      // Rascunho local da VTR só é limpo após finalização oficial bem-sucedida
      try{
        const cleared=await global.centralChecklistClearDraft?.(finalizedPrefix,finalizedOperationalDate,true);
        if(cleared===false)alert('O checklist foi registrado, mas o rascunho local não pôde ser removido automaticamente. Use “Limpar checklist” antes de iniciar outro serviço.');
      }catch(_){
        alert('O checklist foi registrado, mas o rascunho local não pôde ser removido automaticamente. Use “Limpar checklist” antes de iniciar outro serviço.');
      }
      try{global.centralChecklistResetId?.()}catch(_){}
    }
  }catch(err){alert('Não foi possível sincronizar agora: '+err.message)}
  finally{if(btn)btn.disabled=completionLocked}
}
function install(){
  const toolbar=document.querySelector('.toolbar-inner');if(!toolbar||el('cloudChecklistBtn'))return;
  const b=document.createElement('button');b.type='button';b.className='btn primary';b.id='cloudChecklistBtn';b.textContent='Finalizar e enviar à Motomecanização';b.title='Finaliza o checklist. Só abre pendência na Motomecanização para irregularidades técnicas aplicáveis à VTR.';
  b.addEventListener('click',finalizar);
  const share=el('shareBtn');toolbar.insertBefore(b,share||toolbar.firstChild);
  const m=el('matricula');if(m){m.addEventListener('blur',()=>{m.value=global.CentralCloud?.formatMatricula(m.value)||m.value})}
}
global.centralChecklistPayload=buildPayload;
global.centralChecklistVehicleTipo=currentVehicleTipo;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})(window);
