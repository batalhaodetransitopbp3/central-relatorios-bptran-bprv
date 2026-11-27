'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..'),source=fs.readFileSync(path.join(root,'apps_script_v10.gs'),'utf8');
const start=source.indexOf('function cirvcRegister_(payload) {'),end=source.indexOf('function cirvcList_(',start);
assert.ok(start>=0&&end>start);
let db=[],events=[];
const sandbox={
 P3_SHEET_ID:'mock',sheet_:()=>({}),ensureHeaders_:()=>{},
 findOne_:(_,key,id)=>db.find(x=>String(x[key])===String(id))||null,
 upsert_:(_,key,id,obj)=>{const index=db.findIndex(x=>String(x[key])===String(id));if(index>=0)db[index]=obj;else db.push(obj);},
 normBattalion_:x=>String(x),normCompany_:(b,n)=>String(n)+'ª '+(b==='BPRv'?'CPRv':'CPTran'),
 rcoAssertLinkedRecordNotMoved_:()=>{},rcoRequireLinkedScope_:(rid)=>{if(sandbox.closedRco&&rid==='rco-fixture')throw new Error('RCO encerrado');},
 dateText_:x=>String(x).slice(0,10),nowIso_:()=> '2026-10-16T14:00:00-03:00',
 normMat_:x=>String(x),uid_:()=>{throw new Error('id required in test')},
 serviceEventUpsert_:x=>{const i=events.findIndex(y=>y.eventId===x.eventId);if(i>=0)events[i]=x;else events.push(x)},
};
vm.createContext(sandbox);vm.runInContext(source.slice(start,end),sandbox);
const set=[
 {id:'cirvc-101',numeroTermo:'101',placa:'AAA1A11',data:'2026-10-15',hora:'10:00',marcaModelo:'HONDA/CG',serviceId:'svc-fixture',rsdReportId:'sd-fixture',guarnicao:'BASE 02',unidade:{batalhao:'BPRv',companhia:'1ª CPRv'},local:'Pátio de teste',motivo:'Fiscalização'},
 {cirvcId:'cirvc-102',numeroTermo:'102',placa:'BBB2B22',data:'2026-10-15',hora:'11:00',marcaModelo:'YAMAHA/FACTOR',serviceId:'svc-fixture',rsdReportId:'sd-fixture',guarnicao:'BASE 02',unidade:{batalhao:'BPRv',companhia:'1ª CPRv'},local:'Base teste',motivo:'Sinistro'},
 {CIRVC_ID:'cirvc-103',numeroTermo:'103',placa:'CCC3C33',data:'2026-10-15',hora:'12:00',marcaModelo:'HONDA/BIZ',serviceId:'svc-fixture',rsdReportId:'sd-fixture',guarnicao:'BASE 02',unidade:{batalhao:'BPRv',companhia:'1ª CPRv'},local:'Pátio teste',motivo:'Apoio'}
];
let r=sandbox.cirvcRegister_({unidade:{batalhao:'BPRv',companhia:'1ª CPRv'},cirvcs:set});
assert.equal(r.ok,true);assert.equal(r.quantidade,3);assert.equal(db.length,3);assert.equal(events.length,3);
assert.deepEqual(db.map(x=>x.NUMERO_TERMO),['101','102','103']);assert.deepEqual(db.map(x=>x.PLACA),['AAA1A11','BBB2B22','CCC3C33']);
db[0].RCO_REPORT_ID='rco-fixture';const beforeClosed=JSON.stringify(db[0]);
sandbox.closedRco=true;
assert.throws(()=>sandbox.cirvcRegister_({unidade:{batalhao:'BPRv',companhia:'1ª CPRv'},cirvcs:[{...set[0],numeroTermo:'NOT-ALLOWED'}]}),/RCO encerrado/);
assert.equal(JSON.stringify(db[0]),beforeClosed);
sandbox.closedRco=false;
r=sandbox.cirvcRegister_({unidade:{batalhao:'BPRv',companhia:'1ª CPRv'},cirvcs:set});
assert.equal(r.quantidade,3);assert.equal(db.length,3,'same ids must not duplicate');assert.equal(events.length,3);
r=sandbox.cirvcRegister_({unidade:{batalhao:'BPRv',companhia:'1ª CPRv'},cirvcs:[set[0],{...set[1],numeroTermo:'102A',placa:'BBB2B23'},set[2]]});
assert.equal(db.length,3);assert.equal(db[1].NUMERO_TERMO,'102A');assert.equal(db[1].PLACA,'BBB2B23');
const originalCustody={...db[0]};
assert.throws(()=>sandbox.cirvcRegister_({unidade:{batalhao:'BPTran',companhia:'2ª CPTran'},cirvcs:[{...set[0],unidade:{batalhao:'BPTran',companhia:'2ª CPTran'},rsdReportId:'sd-another',serviceId:'svc-another',guarnicao:'BASE 03',numeroTermo:'BAD'}]}),/CIRVC_ORIGIN_CONFLICT/,'same custody ID cannot move to another company or service');
assert.throws(()=>sandbox.cirvcRegister_({unidade:{batalhao:'BPRv',companhia:'1ª CPRv'},cirvcs:[{...set[0],rsdReportId:'sd-another',serviceId:'svc-fixture',numeroTermo:'BAD2'}]}),/CIRVC_ORIGIN_CONFLICT/,'same custody ID cannot move between RSD reports without explicit administrative process');
assert.equal(JSON.stringify(db[0]),JSON.stringify(originalCustody),'failed ownership update must leave custody unchanged');
const beforePartial=JSON.stringify(db[0]);
assert.throws(()=>sandbox.cirvcRegister_({unidade:{batalhao:'BPRv',companhia:'1ª CPRv'},cirvcs:[
 {...set[0],numeroTermo:'SHOULD-NOT-BE-WRITTEN'},
 {...set[1],serviceId:'svc-another'}
]}),/CIRVC_ORIGIN_CONFLICT/,'whole submitted batch must validate before any individual custody write');
assert.equal(JSON.stringify(db[0]),beforePartial,'batch rejection must not partially overwrite the first CIRVC');
assert.throws(()=>sandbox.cirvcRegister_({unidade:{batalhao:'BPRv',companhia:'1ª CPRv'},cirvcs:[
 {...set[0],numeroTermo:'DUPLICATE-1'},
 {...set[0],numeroTermo:'DUPLICATE-2'}
]}),/CIRVC_DUPLICATE_ID_IN_BATCH/,'ambiguous duplicate custody IDs in the same batch must be rejected');
assert.equal(JSON.stringify(db[0]),beforePartial,'duplicate batch cannot partially update original');


console.log('PASS local GAS sandbox: three independent CIRVCs, stable IDs, repeat save, correction and ownership conflicts rejected');
r=sandbox.cirvcRegister_({unidade:{batalhao:'BPRv',companhia:'1ª CPRv'},cirvcs:[set[0],set[1]]});
console.log('AUDIT: omission of third record leaves status',db[2].STATUS_CUSTODIA,'(backend does not automatically cancel deleted rows)');
