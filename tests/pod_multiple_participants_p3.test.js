'use strict';
/* Contract: participating teams are recorded separately from the original responsible team
 * in RCO, P3 statistics, and the POD_EXECUCAO worksheet projection.
 * Entirely in-memory, no Apps Script or Google Sheets access.
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),backend=fs.readFileSync(path.join(root,'apps_script_v10.gs'),'utf8');
const mirror=fs.readFileSync(path.join(root,'gas_deploy','Código.js'),'utf8');
assert.equal(backend,mirror);
const extract=(src,a,b)=>{const i=src.indexOf(a),j=src.indexOf(b,i+a.length);assert.ok(i>=0&&j>i,'Missing '+a);return src.slice(i,j)};
const fixture={id:'pod-123',guarnicao:'BST 02',guarnicoesParticipantes:'BST 02, TOR 01, BASE 03',nome:'Operação de teste',turno:'Manhã, Tarde',statusCumprimento:'Executado conforme previsto'};
for(const file of ['relatorio_cpu.html','relatorio_cpu_ios.html']){
 const html=fs.readFileSync(path.join(root,file),'utf8');
 const fn=extract(html,'function p3PodRows(rco,ops,data,u)','function p3BuildStatistics(');
 const ctx={};vm.createContext(ctx);vm.runInContext(fn,ctx);
 const out=ctx.p3PodRows({state:{reportId:'rco-test'},operacoes:[fixture]},[],'2026-10-15',{batalhao:'BPRv',companhia:'1ª CPRv'});
 assert.equal(out.length,1);
 assert.equal(out[0].guarnicao,'BST 02','original ownership must be unchanged');
 assert.equal(out[0].guarnicoesParticipantes,'BST 02, TOR 01, BASE 03',file+': participants lost in stats');
 assert.equal(out[0].turno,'Manhã, Tarde');
}
const deriv=extract(backend,'function rcoConsolidateDeriveStatFromRco_(rco)','function rcoConsolidateBuildCtx_(');
const ctx={rcoFpStr_:x=>String(x??'')};vm.createContext(ctx);vm.runInContext(deriv,ctx);
const stats=ctx.rcoConsolidateDeriveStatFromRco_({state:{guarnicoes:{}},operacoes:[fixture]});
assert.equal(stats.podExecucao[0].guarnicao,'BST 02');
assert.equal(stats.podExecucao[0].guarnicoesParticipantes,'BST 02, TOR 01, BASE 03');
const merge=extract(backend,'function rcoConsolidateMergePodRow_(oldPod,x,reportId,batt,comp,dataServico)','function rcoConsolidateMergeOpRow_(');
const m={dateText_:x=>x,uid_:()=> 'uid-synthetic',nowIso_:()=> '2026-10-16T17:00:00Z'};
vm.createContext(m);vm.runInContext(merge,m);
let row=m.rcoConsolidateMergePodRow_({},stats.podExecucao[0],'rco-test','BPRv','1ª CPRv','2026-10-15');
assert.equal(row.GUARNICAO,'BST 02');
assert.equal(row.GUARNICOES_PARTICIPANTES,'BST 02, TOR 01, BASE 03');
row=m.rcoConsolidateMergePodRow_(row,{...stats.podExecucao[0],guarnicoesParticipantes:''},'rco-test','BPRv','1ª CPRv','2026-10-15');
assert.equal(row.GUARNICOES_PARTICIPANTES,'BST 02, TOR 01, BASE 03','blank incoming should not destroy legacy participants');
const projection=extract(backend,'function rcoConsolidateProjectWrites_(pkg,reportId,opts)','function rcoConsolidateSubstantiveCanon_(');
assert.match(projection,/GUARNICOES_PARTICIPANTES/,'fingerprint path projection must also include participants');
const projectionCode=extract(backend,'function rcoConsolidateBuildCtx_(pkg,reportId)','function rcoConsolidateSubstantiveCanon_(');
const projectedCtx={
 rcoFpStr_:x=>String(x??''),normBattalion_:x=>x,normCompany_:(b,n)=>String(n)+'ª CPRv',
 dateText_:x=>String(x||'').slice(0,10),normMat_:x=>String(x||''),
 hash_:x=>'hash-'+String(x).length,nowIso_:()=> '2026-10-16T17:00:00Z',uid_:x=>x+'-test',
 rcoConsolidateDeriveStatFromRco_:ctx.rcoConsolidateDeriveStatFromRco_
};
vm.createContext(projectedCtx);vm.runInNewContext(projectionCode,projectedCtx);
const pack={schemaVersion:2,unidade:{batalhao:'BPRv',companhia:'1ª CPRv'},rco:{
 periodo:{inicio:'2026-10-15',termino:'2026-10-16'},state:{reportId:'rco-test',guarnicoes:{}},operacoes:[fixture]
},estatisticaP3:{producao:[],veiculos:[],podExecucao:[stats.podExecucao[0]]}};
const projected=projectedCtx.rcoConsolidateProjectWrites_(pack,'rco-test',{forFingerprint:true});
assert.equal(projected.pod.length,1);
assert.equal(projected.pod[0].GUARNICAO,'BST 02');
assert.equal(projected.pod[0].GUARNICOES_PARTICIPANTES,'BST 02, TOR 01, BASE 03');
const different=structuredClone(pack);
different.estatisticaP3.podExecucao[0].guarnicoesParticipantes='BST 02';
const projection2=projectedCtx.rcoConsolidateProjectWrites_(different,'rco-test',{forFingerprint:true});
assert.notDeepEqual(projected.pod,projection2.pod,'projection / fingerprint must change when participants change');
assert.match(backend,/var podSheet=sheet_\(P3_SHEET_ID,'POD_EXECUCAO'\);ensureHeaders_\(podSheet,\['GUARNICOES_PARTICIPANTES'\]\)/);
console.log('PASS participating teams in RCO, P3 stats and live GAS write projection; fingerprint sensitivity, legacy merge.');
