'use strict';
// R17: test actual GAS claim function with a synthetic in-memory RCO.
// A broken/foreign/missing payload must be refused BEFORE leasing/upserting.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const code=fs.readFileSync(path.resolve(__dirname,'../apps_script_v10.gs'),'utf8');
const start=code.indexOf('function rcoDraftClaim_('),end=code.indexOf('var RCO_RETIFICACOES_HEADERS_',start);
assert(start>0&&end>start,'claim range unavailable');
function scenario(mode){
 const row={RCO_REPORT_ID:'rco-test',STATUS:'EM_ANDAMENTO',DATA_SERVICO:'2026-10-17',REVISAO:9,BATALHAO:'BPRv',COMPANHIA:'1ª CPRv',EDIT_DEVICE_ID:'',EDIT_LEASE_UNTIL:''};
 const events=[];
 const data=mode==='null'?null:mode==='empty'?{}:mode==='foreign'?{state:{reportId:'rco-another'},cpu:[{nome:'Outro'}]}:{state:{reportId:'rco-test',guarnicoes:{cpu:{metrics:{ait:6}}}},cpu:[{nome:'CPU PREVIOUS'}],auditoria:{passagens:[],snapshots:{}}};
 const ctx={P3_SHEET_ID:'FAKE',LockService:{getScriptLock:()=>({waitLock:()=>events.push('LOCK'),releaseLock:()=>events.push('UNLOCK')})},
 sheet_:()=>({}),findOne_:()=>row,requireUnitScope_:x=>x,sameUnitScope_:()=>true,requireOperationalDate_:()=> '2026-10-17',dateText_:x=>x,
 loadJsonPayload_:()=>{events.push('PAYLOAD_READ');if(mode==='readError')throw Error('Drive payload temporariamente inacessível');return data;},assertLease_:()=>events.push('LEASE'),
 isoAfterMinutes_:()=> 'lease-3m',nowIso_:()=> 'now',rcoDraftUpsertRow_:()=>events.push('ROW_WRITE'),audit_:()=>events.push('AUDIT'),
 rcoDraftGet_:()=>{events.push('POST_WRITE_READ');if(!data||!Object.keys(data).length)throw Error('Rascunho indisponível');return data},
 rcoClosureFlagsFrom_:()=>({}),rcoApplyClosureFlagsToPayload_:x=>x,normMat_:x=>x};
 vm.createContext(ctx);vm.runInContext(code.slice(start,end),ctx);
 let error,answer;
 try{answer=ctx.rcoDraftClaim_({reportId:'rco-test',deviceId:'receiver-device',data:'2026-10-17',unidade:{batalhao:'BPRv',companhia:'1ª CPRv'},receivePassage:false})}catch(e){error=e}
 return {row,events,error,answer};
}
for(const mode of ['null','empty','foreign','readError']){
 const r=scenario(mode);
 assert.match(String(r.error?.message||''),/RCO_PAYLOAD_INVALID|Rascunho|RCO em andamento|temporariamente inacessível/i,'cannot resume a broken/foreign draft: '+mode);
 assert(!r.events.includes('LEASE'),'broken draft must never acquire a lease: '+mode);
 assert(!r.events.includes('ROW_WRITE'),'broken draft must never change the saved row: '+mode);
 assert(!r.events.includes('AUDIT'),'failed read cannot be recorded as successful continuation: '+mode);
 assert(r.events.indexOf('PAYLOAD_READ')>=0,'must read the true stored payload: '+mode);
}
const ok=scenario('valid');
assert(!ok.error,'valid RCO must remain continuable: '+String(ok.error));
assert(ok.events.includes('ROW_WRITE')&&ok.events.includes('LEASE'));
assert.equal(ok.answer.rco.cpu[0].nome,'CPU PREVIOUS');
assert.equal(ok.events.filter(x=>x==='PAYLOAD_READ').length,1,'one atomic payload load under lock');
assert(!ok.events.includes('POST_WRITE_READ'),'avoid second Drive read after granting editing lease');
console.log('PASS R17: invalid RCO payload preflight BEFORE lease/write; valid continuation retains predecessor data');
