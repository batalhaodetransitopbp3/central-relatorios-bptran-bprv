'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),gas=fs.readFileSync(path.join(root,'apps_script_v10.gs'),'utf8');
assert.equal(gas,fs.readFileSync(path.join(root,'gas_deploy/Código.js'),'utf8'));
const day='2026-11-25',rco='rco-a',rid='rsd-a',unit={batalhao:'BPTran',companhia:'1 CPTran'};
const scope={BATALHAO:unit.batalhao,COMPANHIA:unit.companhia,DATA:day};
const tables={POD_EXECUCAO:[],OPERACOES:[],RSD:[]};
const c={console};vm.createContext(c);vm.runInContext(gas,c);
Object.assign(c,{
 hash_:x=>crypto.createHash('sha256').update(String(x)).digest('hex'),
 nowIso_:()=>day+'T13:00:00Z',normBattalion_:x=>String(x||''),rcoCompanyKey_:x=>String(x||''),
 dateText_:x=>String(x||'').slice(0,10),strictYmdDate_:x=>String(x||'').slice(0,10),resolveExistingOperationalDate_:x=>String(x||'').slice(0,10),
 sheet_:(_id,n)=>n,objects_:n=>structuredClone(tables[n]||[]),objectsFields_:n=>structuredClone(tables[n]||[]),
 ensureHeaders_(){},findOne_:(n,k,id)=>structuredClone((tables[n]||[]).find(x=>String(x[k])===id)||null),
 upsert_:(n,k,id,row)=>{const i=tables[n].findIndex(x=>String(x[k])===id);if(i<0)tables[n].push(structuredClone(row));else tables[n][i]=structuredClone(row);},
 rcoPerfStart_(){},rcoPerfEnd_(){},uid_:p=>p+'-test',audit_(){},
 rcoLoadIndex_:(n,k)=>({list:structuredClone(tables[n]),sheet:n,keyField:k,byKey:Object.fromEntries(tables[n].map(x=>[x[k],structuredClone(x)])),pending:{}}),
 rcoIndexGet_:(idx,id)=>idx.byKey[id],
 rcoIndexUpsert_:(idx,id,row)=>{idx.byKey[id]=structuredClone(row);idx.pending[id]=structuredClone(row);},
 rcoIndexFlush_:idx=>{Object.entries(idx.pending).forEach(([id,row])=>c.upsert_(idx.sheet,idx.keyField,id,row));idx.pending={};},
 rcoCanonicalDraft_:()=>({reportId:rco,data:day,batalhao:unit.batalhao,companhia:unit.companhia,originRsdIds:[rid],status:'EM_ANDAMENTO'})
});
function pod(id,owner=rco){return {...scope,REGISTRO_ID:id,REPORT_ID:id,RCO_REPORT_ID:owner,GUARNICAO:'EXTRA 09',GUARNICOES_PARTICIPANTES:'EXTRA 09',OPERACAO:'TESTE',TURNO:'Manhã',STATUS_CUMPRIMENTO:'Executado conforme previsto',LOCAL_PREVISTO:'LOCAL',LOCAL_EXECUTADO:'LOCAL',COORDENADAS_EXECUTADAS:'',HORA_INICIO:'',HORA_FIM:'',HOUVE_ALTERACAO:'NÃO',MOTIVO_ALTERACAO:''};}
function op(id,owner=rco,rsd=rid){return {...scope,REGISTRO_ID:id,REPORT_ID:id,RCO_REPORT_ID:owner,RSD_REPORT_ID:rsd,SERVICE_ID:'svc-a',GUARNICAO_RESPONSAVEL:'EXTRA 09',OPERACAO:'TESTE',TURNO:'Manhã',LOCAL:'LOCAL',STATUS_REGISTRO:'CONSOLIDADO',VERSAO_ORIGEM:1};}
const row=(id,fields={})=>({registroId:id,guarnicao:'EXTRA 09',guarnicoesParticipantes:'EXTRA 09',operacao:'TESTE',turno:'Manhã',statusCumprimento:'Executado conforme previsto',localPrevisto:'LOCAL',localExecutado:'LOCAL',houveAlteracao:false,...fields});
function pack(rows=[],removals=[]){return {rco:{reportId:rco,unidade:unit,periodo:{inicio:day},rcoOrigens:[{rsdReportId:rid}],operacoes:[],podRemovals:removals},unidade:unit,operacoesCompletas:[],podRemovals:removals,estatisticaP3:{producao:[],podExecucao:rows}};}
function set(pods,ops){tables.POD_EXECUCAO=structuredClone(pods);tables.OPERACOES=structuredClone(ops);tables.RSD=[{REPORT_ID:rid,SERVICE_ID:'svc-a',BATALHAO:unit.batalhao,COMPANHIA:unit.companhia,DATA_SERVICO:day,STATUS:'DEFERIDO',RCO_REPORT_ID:''}];}
function lookup(n,id){return tables[n].find(x=>x.REGISTRO_ID===id)}
const a=pod('a',''),b=pod('b'),ta=c.operationPodFingerprint_(a),tb=c.operationPodFingerprint_(b);
const pkg=pack([row('a',{knownPodFingerprint:ta})],[{registroId:'b',knownPodFingerprint:tb}]);
set([a,b],[op('a',''),op('b')]);c.rcoAssertPodProjectionFresh_(pkg,rco);
// Run the exact write loop from rcoSupplementalUpsertBody_, not a reimplementation.
const start=gas.indexOf("  rcoPerfStart_(perf,'pod');",gas.indexOf('function rcoSupplementalUpsertBody_(')),end=gas.indexOf("  rcoPerfEnd_(perf,'operacoes');",start);
assert(start>0&&end>start);
const body=gas.slice(start,end);
const cut=body.indexOf("  rcoPerfStart_(perf,'operacoes');");assert(cut>0);
function runPart(src,p=pkg){Object.assign(c,{pkg:p,rco:p.rco,reportId:rco,batt:unit.batalhao,comp:unit.companhia,obj:{DATA_SERVICO:day},originSet:{[rid]:true},perf:null});vm.runInContext('(function(){'+src+'})()',c);}
runPart(body.slice(0,cut)); // failure after POD flush, before operation detach
assert.equal(lookup('POD_EXECUCAO','b').RCO_REPORT_ID,'');
assert.equal(lookup('POD_EXECUCAO','b').RCO_POD_RECEIPT_BEFORE,tb);
assert.equal(lookup('OPERACOES','b').RCO_REPORT_ID,rco);
c.rcoAssertPodProjectionFresh_(pkg,rco);runPart(body);
assert.equal(lookup('OPERACOES','b').RCO_REPORT_ID,'');
assert.equal(lookup('POD_EXECUCAO','b').LOCAL_EXECUTADO,'LOCAL');
c.rcoAssertPodProjectionFresh_(pkg,rco);runPart(body);
assert.equal(tables.POD_EXECUCAO.length,2);assert.equal(tables.OPERACOES.length,2);
assert.equal(lookup('POD_EXECUCAO','a').RCO_REPORT_ID,rco);
assert.throws(()=>c.rcoAssertPodProjectionFresh_(pack([row('a',{knownPodFingerprint:ta,localExecutado:'STALE CHANGE'})],[{registroId:'b',knownPodFingerprint:tb}]),rco),/RCO_POD_CONFLICT/);
lookup('POD_EXECUCAO','b').LOCAL_EXECUTADO='NEW P3 DATA';
assert.throws(()=>c.rcoAssertPodProjectionFresh_(pkg,rco),/RCO_POD_CONFLICT/);
lookup('POD_EXECUCAO','b').LOCAL_EXECUTADO='LOCAL';lookup('OPERACOES','b').RCO_REPORT_ID='rco-other';
assert.throws(()=>c.rcoAssertPodProjectionFresh_(pkg,rco),/RCO_POD_CONFLICT/);
set([pod('u','')],[op('u','')]);const ut=c.operationPodFingerprint_(lookup('POD_EXECUCAO','u'));
const unlinked=pack([],[{registroId:'u',knownPodFingerprint:ut}]);c.rcoAssertPodProjectionFresh_(unlinked,rco);runPart(body,unlinked);c.rcoAssertPodProjectionFresh_(unlinked,rco);
set([pod('u','')],[op('u','','other')]);assert.throws(()=>c.rcoAssertPodProjectionFresh_(unlinked,rco),/RCO_POD_CONFLICT/);
set([pod('u','')],[op('u','')]);tables.RSD[0].RCO_REPORT_ID='rco-other';assert.throws(()=>c.rcoAssertPodProjectionFresh_(unlinked,rco),/RCO_POD_CONFLICT/);
set([pod('u','')],[op('u','')]);lookup('POD_EXECUCAO','u').COMPANHIA='2 CPTran';assert.throws(()=>c.rcoAssertPodProjectionFresh_(unlinked,rco),/RCO_POD_CONFLICT/);
console.log('PASS actual POD write path: partial retry, final retry, explicit removal, live ETag, foreign RCO and scope rejection');
// RSD summary creates matching defaults without rewriting independent P3 edits.
set([],[]);
const rsd={guarnicao:{nome:'EXTRA 09'},servico:{data:day},operacoes:[{id:'summary',nome:'TESTE',turno:'Manhã',statusCumprimento:'Executado conforme previsto',local:'LOCAL'}]};
c.syncRsdOperations_(rsd,rid,unit.batalhao,unit.companhia,1);
assert.equal(lookup('POD_EXECUCAO','summary').GUARNICOES_PARTICIPANTES,'EXTRA 09');
assert.equal(lookup('POD_EXECUCAO','summary').LOCAL_PREVISTO,'LOCAL');
c.rcoAssertPodProjectionFresh_(pack([row('summary')]),rco);
lookup('POD_EXECUCAO','summary').GUARNICOES_PARTICIPANTES='P3 ALTERADO';
c.syncRsdOperations_(rsd,rid,unit.batalhao,unit.companhia,2);
assert.equal(lookup('POD_EXECUCAO','summary').GUARNICOES_PARTICIPANTES,'P3 ALTERADO');
assert.throws(()=>c.rcoAssertPodProjectionFresh_(pack([row('summary')]),rco),/RCO_POD_CONFLICT/);
console.log('PASS actual RSD summary projection and independent P3 protection');
// Opt-in reads: only the stored RSD origin in the same RCO scope.
set([pod('linked'),pod('origin',''),pod('foreign',''),pod('outside','')],[op('linked'),op('origin',''),op('foreign','rco-other'),{...op('outside',''),COMPANHIA:'2 CPTran'}]);
assert.deepEqual(Array.from(c.operationList_({rcoReportId:rco}),x=>x.reportId),['linked']);
assert.deepEqual(Array.from(c.operationList_({rcoReportId:rco,includeRsdOrigins:'1'}),x=>x.reportId),['linked','origin']);
tables.RSD[0].RCO_REPORT_ID='rco-other';assert.deepEqual(Array.from(c.operationList_({rcoReportId:rco,includeRsdOrigins:'1'}),x=>x.reportId),['linked']);
console.log('PASS operation-list default scope unchanged; authorized origin opt-in only');
// Verify the actual frontend reconciliation helper in both variants. Declining a change preserves all local fields and old ETag.
for(const file of ['relatorio_cpu.html','relatorio_cpu_ios.html']){
 const html=fs.readFileSync(path.join(root,file),'utf8');const at=html.indexOf('function rcoRefreshExistingPod('),last=html.indexOf('let linkedRefreshBusy=',at);
 const d=html.indexOf('function rcoLinkedDataFromAccept('),e=html.indexOf('function rcoRememberLinkedRecord(',d);
 assert(at>=0&&last>at&&d>=0&&e>d);
 let current={id:'op',guarnicao:'EXTRA 09',nome:'LOCAL NAME',knownPodFingerprint:'old',knownOperationVersion:'1',local:'LOCAL',localPrevisto:'LOCAL',guarnicoesParticipantes:'EXTRA 09',statusCumprimento:'Executado conforme previsto',turno:'Manhã',totalAits:'2',descricaoApoio:'preserve'},accept=false,remembered=null;
 const entry={dataset:{id:'op'},replaceWith:obj=>{current=obj}};
 const ctx={document:{querySelectorAll:()=>[entry]},window:{__rcoPodRemovals:[],confirm:()=>accept},rcoStableLinkedId:(_k,r)=>r.id,rcoRecordInScope:(r,s)=>r.guarnicao===s.guarnicao&&(!s.rcoReportId||r.rcoReportId===s.rcoReportId)&&r.rsdReportId===rid,recordFromEntry:()=>current,addCpuOperation:x=>x,rcoRememberLinkedRecord:x=>{remembered=x}};
 vm.createContext(ctx);vm.runInContext(html.slice(at,last)+html.slice(d,e),ctx);
 const remote={id:'op',rsdReportId:rid,rcoReportId:rco,guarnicao:'EXTRA 09',raw:{podFingerprint:'new',version:2,operacao:{nome:'CLOUD NAME',turno:'Manhã',guarnicoes:'EXTRA 09'},pod:{localPrevisto:'LOCAL',statusCumprimento:'Executado conforme previsto',guarnicoesParticipantes:'EXTRA 09'},local:{descricao:'LOCAL'},resumoCpu:{totalAits:5}}};
 const sc={guarnicao:'EXTRA 09',rcoReportId:rco,rsdReportIds:[rid]},g={nome:'EXTRA 09'};
 assert.equal(ctx.rcoRefreshExistingPod(remote,sc,g,day),false);assert.equal(current.knownPodFingerprint,'old');assert.equal(current.totalAits,'2');
 accept=true;assert.equal(ctx.rcoRefreshExistingPod(remote,sc,g,day),true);assert.equal(current.knownPodFingerprint,'new');assert.equal(current.nome,'CLOUD NAME');assert.equal(current.totalAits,5);assert.equal(current.descricaoApoio,'preserve');assert.equal(remembered.id,'op');
 assert.equal(ctx.rcoRefreshExistingPod(remote,sc,g,day),false);
 ctx.window.__rcoPodRemovals=[{registroId:'op'}];assert.equal(ctx.rcoRefreshExistingPod({...remote,raw:{...remote.raw,podFingerprint:'newer'}},sc,g,day),false);
 console.log('PASS '+file+' explicit reconciliation and removal suppression');
}
console.log('R285_PASS');
