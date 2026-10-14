'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const root=path.join(__dirname,'..');
const src=fs.readFileSync(path.join(root,'apps_script_v10.gs'),'utf8');
const twin=fs.readFileSync(path.join(root,'gas_deploy','Código.js'),'utf8');
assert.strictEqual(src,twin,'Fontes backend divergiram');
function extract(name){
 const start=src.indexOf('function '+name+'(');
 assert.ok(start>=0,name);
 const next=src.indexOf('\nfunction ',start+12);
 return src.slice(start,next>=0?next:src.length);
}
const modules=['rcoCompanyKey_','rcoLinkedScopeDecision_','rcoRequireLinkedScope_','rcoAssertLinkedRecordNotMoved_'];
const draft={reportId:'cpu-ISO',data:'2026-10-10',batalhao:'BPRv',companhia:'1ª CPRv',status:'FINALIZADO'};
const ctx={
 normBattalion_:v=>String(v||'').trim(),
 strictYmdDate_:v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||''))?v:'',
 rcoCanonicalDraft_:()=>draft
};
vm.createContext(ctx);
for(const name of modules)vm.runInContext(extract(name),ctx);
const incoming={batalhao:'BPRv',companhia:'1ª CPRv',data:'2026-10-10'};
assert.throws(()=>ctx.rcoRequireLinkedScope_('cpu-ISO',incoming),/encerrado|retifica/i);
draft.status='EM_RETIFICACAO';
assert.strictEqual(ctx.rcoRequireLinkedScope_('cpu-ISO',incoming).ok,true);
draft.status='EM_ANDAMENTO';
assert.strictEqual(ctx.rcoRequireLinkedScope_('cpu-ISO',incoming).ok,true);
assert.throws(()=>ctx.rcoRequireLinkedScope_('cpu-ISO',{...incoming,data:'2026-10-11'}),/data operacional/);
assert.throws(()=>ctx.rcoRequireLinkedScope_('cpu-ISO',{...incoming,companhia:'2ª CPRv'}),/unidade/);
assert.throws(()=>ctx.rcoAssertLinkedRecordNotMoved_({RCO_REPORT_ID:'cpu-A'},'cpu-B'),/outro RCO/);
ctx.rcoAssertLinkedRecordNotMoved_({RCO_REPORT_ID:'cpu-A'},'cpu-A');
ctx.rcoAssertLinkedRecordNotMoved_({RCO_REPORT_ID:''},'cpu-A');
ctx.rcoAssertLinkedRecordNotMoved_(null,'cpu-A');
for(const [name,anchor] of [
 ['operationUpsert_', "upsert_(opSheet"],
 ['cirvcRegister_', "upsert_(s,'CIRVC_ID'"],
 ['serviceEventUpsert_', "upsert_(s,'EVENT_ID'"]]
){
 const fn=extract(name);
 const check=fn.indexOf('rcoAssertLinkedRecordNotMoved_');
 const write=fn.indexOf(anchor);
 assert.ok(check>=0&&write>check,'Guard before write: '+name);
}
const body=extract('rcoSupplementalUpsertBody_');
assert.ok(body.includes('if(linkedHere&&cirvcRsd&&!originSet[cirvcRsd])'),'consolidação ainda apaga CIRVC direto do RCO');
assert.ok(body.includes('if(!opRsd||originSet[opRsd])return;'),'consolidação ainda apaga operação direta do RCO');
assert.ok(!body.includes("if(String(cv.RCO_REPORT_ID||'')===reportId){next.RCO_REPORT_ID='';changed=true;}"),'limpeza total de CIRVC voltou');
const rowCtx={
 dateText_:()=>'2099-07-15',
 scriptTz_:()=>'America/Sao_Paulo',
 Utilities:{formatDate:(v)=>[v.getUTCHours(),v.getUTCMinutes(),v.getUTCSeconds()].map(n=>String(n).padStart(2,'0')).join(':')}
};
vm.createContext(rowCtx);
vm.runInContext(['sheetColumnTemporalKind_','sheetTimeEpoch_','sheetTimeText_','isClockText_','rowFor_'].map(extract).join('\n'),rowCtx);
const civilDay=new Date('2099-07-15T00:00:00.000Z');
const clock=new Date(Date.UTC(1899,11,30,10,15,0));
const clockSeconds=new Date(Date.UTC(1899,11,30,10,15,7));
const stamp=new Date('2026-10-13T23:44:32.000Z');
assert.strictEqual(rowCtx.rowFor_(['DATA'],{DATA:civilDay})[0],'2099-07-15');
assert.strictEqual(rowCtx.rowFor_(['DATA_SERVICO'],{DATA_SERVICO:civilDay})[0],'2099-07-15');
assert.strictEqual(rowCtx.rowFor_(['INICIO'],{INICIO:civilDay})[0],'2099-07-15');
assert.strictEqual(rowCtx.rowFor_(['TERMINO'],{TERMINO:civilDay})[0],'2099-07-15');
assert.strictEqual(rowCtx.rowFor_(['HORA_CADASTRO'],{HORA_CADASTRO:clock})[0],'10:15');
assert.strictEqual(rowCtx.rowFor_(['HORA_EVENTO'],{HORA_EVENTO:clock})[0],'10:15');
assert.strictEqual(rowCtx.rowFor_(['HORA_INICIO'],{HORA_INICIO:clock})[0],'10:15');
assert.strictEqual(rowCtx.rowFor_(['HORA_FIM'],{HORA_FIM:clockSeconds})[0],'10:15:07');
assert.notStrictEqual(rowCtx.rowFor_(['HORA_CADASTRO'],{HORA_CADASTRO:clock})[0],'1899-12-30');
assert.strictEqual(rowCtx.rowFor_(['HORA_CADASTRO'],{HORA_CADASTRO:'10:15'})[0],'10:15');
assert.strictEqual(rowCtx.rowFor_(['ATUALIZADO_EM'],{ATUALIZADO_EM:stamp})[0],stamp);
assert.strictEqual(rowCtx.rowFor_(['DATA_HORA'],{DATA_HORA:stamp})[0],stamp);
assert.strictEqual(rowCtx.rowFor_(['EDIT_LEASE_UNTIL'],{EDIT_LEASE_UNTIL:stamp})[0],stamp);
assert.strictEqual(rowCtx.rowFor_(['OBSERVACAO'],{OBSERVACAO:stamp})[0],stamp);
assert.strictEqual(rowCtx.rowFor_(['OBS'],{OBS:clock})[0],'10:15');
assert.strictEqual(rowCtx.rowFor_(['PAYLOAD'],{PAYLOAD:{a:1}})[0],'{"a":1}');
console.log('PASS RCO FINALIZADO não admite novos vínculos; retificação permite; transferência entre RCOs é recusada antes de escrita.');
