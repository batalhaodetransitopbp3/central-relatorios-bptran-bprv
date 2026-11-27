'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('node:assert/strict');
const src=fs.readFileSync(process.argv[2]?path.resolve(process.argv[2]):path.resolve(__dirname,'../apps_script_v10.gs'),'utf8');
const a=src.indexOf('function rcoDraftClaim_('),b=src.indexOf('var RCO_RETIFICACOES_HEADERS_',a);assert(a>0&&b>a);
function simulate(withPass,receive,erasedLive=false){
const events=[],row={STATUS:'EM_ANDAMENTO',DATA_SERVICO:'2026-10-17',REVISAO:12,BATALHAO:'BPRv',COMPANHIA:'1ª CPRv'};
const payload={reportId:'rco-proof',deviceId:'device-receiver',data:'2026-10-17',batalhao:'BPRv',companhia:'1ª CPRv',receivePassage:receive};
const content={state:{reportId:'rco-proof',guarnicoes:erasedLive?{}:{cpu:{metrics:{total:11}}}},auditoria:withPass?{passagens:[{id:'pass1',status:'AGUARDANDO_RECEBIMENTO',slot:1,reportId:'rco-proof'}],snapshots:{cpu1AtPassage:{state:{reportId:'rco-proof',guarnicoes:{cpu:{metrics:{total:11}}}}}}}:{passagens:[],snapshots:{}}};
const ctx={LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},P3_SHEET_ID:'TEST',sheet_:()=>({name:'RCO_RASCUNHOS'}),findOne_:()=>row,
 requireUnitScope_:x=>x,sameUnitScope_:()=>true,requireOperationalDate_:()=> '2026-10-17',dateText_:x=>x,loadJsonPayload_:()=>{events.push('READ');return content},
 assertLease_:()=>events.push('LEASE'),isoAfterMinutes_:()=> 'lease',nowIso_:()=> 'now',rcoDraftUpsertRow_:()=>events.push('WRITE'),audit_:()=>events.push('AUDIT'),
 rcoDraftGet_:()=>content,rcoClosureFlagsFrom_:()=>({}),rcoApplyClosureFlagsToPayload_:x=>x,normMat_:x=>x};
vm.createContext(ctx);vm.runInContext(src.slice(a,b),ctx);
let result,error;try{result=ctx.rcoDraftClaim_(payload)}catch(e){error=e}
return {result,error,events,row}}
const missing=simulate(false,true);assert.match(String(missing.error?.message||''),/RCO_PASSAGE_NOT_PERSISTED/);assert(!missing.events.includes('LEASE'));assert(!missing.events.includes('WRITE'));
const valid=simulate(true,true);assert(!valid.error);assert(valid.events.includes('LEASE')&&valid.events.includes('WRITE'));assert(valid.result.rco.auditoria.snapshots.cpu1AtPassage);
const erasure=simulate(true,true,true);assert.match(String(erasure.error?.message||''),/RCO_PASSAGE_NOT_PERSISTED/,'RCO with saved passage but erased production must not be received');assert(!erasure.events.includes('LEASE')&&!erasure.events.includes('WRITE'));
const continueOnly=simulate(false,false);assert(!continueOnly.error,'normal continuation does not require passage');
console.log('PASS GAS claim validates RCO passage atomically under lock BEFORE any lease/write');
