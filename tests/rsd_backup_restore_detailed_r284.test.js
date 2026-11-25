'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),api=require('../rsd_local_backup.js'),key='pmpb-transito-operacoes-dia-v1';
const map=new Map(),store={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};
const op=(id,extra={})=>({reportId:id,rsdReportId:'rsd-1',serviceId:'svc-1',segmento:2,operacao:{nome:'FICTICIO',data:'2026-11-25'},local:{descricao:'LOCAL'},...extra});
const payload={reportId:'rsd-1',serviceId:'svc-1',segmento:2,servico:{data:'2026-11-25'},unidade:{batalhao:'BPTran',companhiaNumero:1},guarnicao:{nome:'EXTRA 09'},operacoesAcumuladas:[op('op-1'),op('op-2')]};
const current=op('op-1',{local:{descricao:'NOVO'}});
const other=op('op-other',{rsdReportId:'other'});
store.setItem(key,JSON.stringify([current,other,{legacy:true}]));
assert.deepEqual(api.restoreMissingOperations(store,key,payload,p=>!!p.operacao?.nome),{added:1,preserved:1});
assert.deepEqual(JSON.parse(store.getItem(key)),[current,other,{legacy:true},op('op-2')]);
assert.deepEqual(api.restoreMissingOperations(store,key,payload,p=>!!p.operacao?.nome),{added:0,preserved:2});
const old=store.getItem(key);
assert.throws(()=>api.restoreMissingOperations(store,key,{...payload,operacoesAcumuladas:[op('new'),op('bad',{rsdReportId:'other'})]},()=>true),/preservado/);
assert.equal(store.getItem(key),old);
store.setItem(key,'not json');assert.throws(()=>api.restoreMissingOperations(store,key,payload,()=>true));assert.equal(store.getItem(key),'not json');
store.setItem(key,JSON.stringify([]));assert.equal(api.save(store,payload,()=>false).ok,true);
assert.equal(api.save(store,{...payload,operacoesAcumuladas:[op('different'),op('op-2')]},()=>false).reason,'REDUCAO_NAO_CONFIRMADA');
for(const f of ['relatorio_servico_diario.html','relatorio_servico_diario_ios.html']){
 const html=fs.readFileSync(path.join(root,f),'utf8'),a=html.indexOf('function recuperarCopiaLocalRsd('),b=html.indexOf('function salvarRascunhoGuarnicao(s=false)',a);assert(a>=0&&b>a);
 let applied=false,confirmYes=false;const context={window:{CentralRsdLocalBackup:api,payloadV2:()=>payload,applyPayload:()=>{applied=true}},localStorage:store,OPERATIONS_STORE:key,reportId:'rsd-1',storedOperationIsValid:p=>!!p.operacao?.nome,confirm:()=>confirmYes,alert(){}};
 vm.createContext(context);vm.runInContext(html.slice(a,b),context);store.setItem(key,'[]');
 assert.equal(context.recuperarCopiaLocalRsd(),false);assert.equal(applied,false);assert.equal(store.getItem(key),'[]');
 confirmYes=true;assert.equal(context.recuperarCopiaLocalRsd(),true);assert.equal(applied,true);assert.deepEqual(JSON.parse(store.getItem(key)),payload.operacoesAcumuladas);
}
console.log('PASS R284 RSD backup detailed operation restore, non-overwrite, scope, malformed store, cancellation and reduction guards');
