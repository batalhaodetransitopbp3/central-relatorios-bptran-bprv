/* Cópia local explícita do RSD — independente da hidratação e da sincronização cloud. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.CentralRsdLocalBackup=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const PREFIX='pmpb-rsd-local-contingencia-v1::';
 const VERSION=1;
 const clean=x=>String(x??'').trim();
 const key=reportId=>PREFIX+encodeURIComponent(clean(reportId));
 const list=(p,k)=>Array.isArray(p?.[k])?p[k].length:0;
 const nonempty=(v)=>v!=null&&String(v).trim().length>0;
 const anyPositive=v=>v&&typeof v==='object'?Object.values(v).some(anyPositive):(typeof v==='number'?v>0:(typeof v==='string'&&v.trim()!==''&&Number(v)>0));
 const hasMeaningfulContent=(p)=>{
  if(!p||typeof p!=='object')return false;
  const g=p.guarnicao||{};
  if([g.nome,g.responsavel,g.matricula,g.viatura,g.tipo,p.observacoes,p.alteracoes?.servico,p.alteracoes?.viatura,p.alteracoes?.planoOperacionalDiario].some(nonempty))return true;
  if(['ocorrencias','operacoes','cirvc','arvc','tcos','veiculosRecuperados','anexos'].some(k=>list(p,k)>0))return true;
  return anyPositive(p.producao||{});
 };
 const footprint=p=>({
  ocorrencias:list(p,'ocorrencias'),operacoes:list(p,'operacoes'),cirvc:Math.max(list(p,'cirvc'),list(p,'arvc')),
  tcos:list(p,'tcos'),veiculos:list(p,'veiculosRecuperados'),
  efetivo:list(p?.guarnicao,'equipe'),viaturas:list(p,'viaturas'),
  anexos:list(p,'anexos'),fisco:list(p?.fisco,'acionamentos'),
  alteracoes:nonempty(p?.alteracoes?.servico)?1:0,
  alteracoesVtr:nonempty(p?.alteracoes?.viatura)?1:0,
  plano:nonempty(p?.alteracoes?.planoOperacionalDiario)?1:0,
  materialCarga:nonempty(p?.alteracoes?.materialCarga)?1:0,
  nomeGuarnicao:nonempty(p?.guarnicao?.nome)?1:0,
  responsavel:nonempty(p?.guarnicao?.responsavel)?1:0,
  matricula:nonempty(p?.guarnicao?.matricula)?1:0,
  vtr:nonempty(p?.guarnicao?.viatura||p?.guarnicao?.vtrPrincipal)?1:0,
  observacoes:nonempty(p?.observacoes)?1:0,
  producao:p?.producao||{}
 });
 const savedEntryKey=x=>{
  if(!x||typeof x!=='object')return '';
  // Never merge unrelated vehicles or occurrences because their counts happen to match.
  for(const name of ['id','cirvcId','CIRVC_ID','reportId','registroId','numeroTermo','numeroTco','numeroDocumento','referenciaId','matricula','prefixo']){
    const k=clean(x[name]);if(k)return name+':'+k.toUpperCase();
  }
  return '';
 };
 const savedArraysChanged=(oldP,newP)=>{
  const pairs=[
   [oldP?.ocorrencias,newP?.ocorrencias],[oldP?.operacoes,newP?.operacoes],
   [oldP?.cirvc,newP?.cirvc],[oldP?.arvc,newP?.arvc],
   [oldP?.tcos,newP?.tcos],[oldP?.veiculosRecuperados,newP?.veiculosRecuperados],
   [oldP?.viaturas,newP?.viaturas],[oldP?.guarnicao?.equipe,newP?.guarnicao?.equipe],
   [oldP?.anexos,newP?.anexos],[oldP?.fisco?.acionamentos,newP?.fisco?.acionamentos]
  ];
  return pairs.some(([before,after])=>{
    if(!Array.isArray(before)||!before.length)return false;
    const current=Array.isArray(after)?after:[];
    if(before.length>current.length)return true;
    const nextKeys=new Set(current.map(savedEntryKey).filter(Boolean));
    return before.some((item,i)=>{
      const k=savedEntryKey(item);
      // ID-less entries cannot be safely matched. Require explicit acknowledgement
      // before overwriting a changed entry, rather than silently treating lengths as identity.
      return k?!nextKeys.has(k):JSON.stringify(item)!==JSON.stringify(current[i]);
    });
  });
 };
 const savedIdentityChanged=(oldP,newP)=>{
  const fields=[
   [oldP?.guarnicao?.nome,newP?.guarnicao?.nome],
   [oldP?.guarnicao?.responsavel,newP?.guarnicao?.responsavel],
   [oldP?.guarnicao?.matricula,newP?.guarnicao?.matricula],
   [oldP?.guarnicao?.viatura,newP?.guarnicao?.viatura],
   [oldP?.servico?.data,newP?.servico?.data],
   [oldP?.unidade?.batalhao,newP?.unidade?.batalhao],
   [oldP?.unidade?.companhia,newP?.unidade?.companhia]
  ];
  return fields.some(([a,b])=>clean(a)&&clean(b)&&clean(a)!==clean(b));
 };
 const losesContent=(oldP,newP)=>{
  const a=footprint(oldP),b=footprint(newP);
  const reduction=(before,after)=>{if(before&&typeof before==='object')return Object.keys(before).some(k=>reduction(before[k],after?.[k]));const n=Number(before)||0,m=Number(after)||0;return n>m;};
  return savedArraysChanged(oldP,newP)||savedIdentityChanged(oldP,newP)||
    Object.keys(a).some(k=>k==='producao'?reduction(a[k],b[k]):a[k]>b[k]);
 };
 function read(storage,reportId){
  const id=clean(reportId);if(!id)return null;
  const raw=storage.getItem(key(id));if(!raw)return null;
  const envelope=JSON.parse(raw);
  if(!envelope||envelope.schemaVersion!==VERSION||clean(envelope.reportId)!==id||
    !envelope.payload||clean(envelope.payload.reportId)!==id)throw new Error('Cópia local inconsistente: não restaurar.');
  if(envelope.serviceId&&envelope.payload.serviceId&&String(envelope.serviceId)!==String(envelope.payload.serviceId))
    throw new Error('Identidade do serviço divergente na cópia local.');
  return envelope;
 }
 function save(storage,payload,approveLoss){
  if(!payload||typeof payload!=='object'||!clean(payload.reportId))
    return {ok:false,reason:'IDENTIDADE_AUSENTE'};
  if(!hasMeaningfulContent(payload))return {ok:false,reason:'CONTEUDO_VAZIO'};
  const id=clean(payload.reportId),previous=read(storage,id);
  if(previous&&previous.payload&&previous.serviceId&&payload.serviceId&&
    String(previous.serviceId)!==String(payload.serviceId))
    return {ok:false,reason:'OUTRO_SERVICO'};
  if(previous&&losesContent(previous.payload,payload)&&(!approveLoss||approveLoss(previous.payload,payload)!==true))
    return {ok:false,reason:'REDUCAO_NAO_CONFIRMADA'};
  const packet={schemaVersion:VERSION,reportId:id,serviceId:clean(payload.serviceId||''),
    savedAt:new Date().toISOString(),payload:JSON.parse(JSON.stringify(payload))};
  const serialized=JSON.stringify(packet);
  storage.setItem(key(id),serialized);
  const confirmed=storage.getItem(key(id));
  if(confirmed!==serialized)return {ok:false,reason:'GRAVACAO_NAO_CONFIRMADA'};
  return {ok:true,savedAt:packet.savedAt,bytes:serialized.length};
 }
 return {VERSION,PREFIX,key,read,save,hasMeaningfulContent,losesContent};
});
