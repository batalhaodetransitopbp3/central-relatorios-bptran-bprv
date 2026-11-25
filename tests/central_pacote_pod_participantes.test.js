'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');const read=f=>fs.readFileSync(path.join(root,f),'utf8');
for(const f of ['relatorio_servico_diario.html','relatorio_servico_diario_ios.html','relatorio_cpu.html','relatorio_cpu_ios.html']){
 const src=read(f);
 assert.match(src,/<label>Guarnições participantes<\/label><input data-k="guarnicoesParticipantes"/);
 assert.doesNotMatch(src,/<input data-k="guarnicoesParticipantes"[^>]*\breadonly/);
}
const p={reportId:'op-demo',operacao:{nome:'Operação teste',guarnicoes:'BST 01, TOR 01'},resumoCpu:{},pod:{}};
for(const f of ['relatorio_servico_diario.html','relatorio_servico_diario_ios.html']){
 const html=read(f),start=html.indexOf('function operationToSummary('),stop=html.indexOf('\n',start);
 assert.ok(start>=0&&stop>start);
 const cx={uid:()=> 'fixture'};
 vm.runInNewContext(html.slice(start,stop),cx);
 const result=cx.operationToSummary(p);
 assert.equal(result.guarnicoesParticipantes,'BST 01, TOR 01');
}
for(const f of ['relatorio_cpu.html','relatorio_cpu_ios.html']){
 const html=read(f),start=html.indexOf('function importOperationV2('),stop=html.indexOf('\n',start);
 assert.ok(start>=0&&stop>start);
 const added=[];const s={state:{importedReportIds:[]},validateImportedUnit:()=>true,addCpuOperation:x=>added.push(x)};
 vm.runInNewContext(html.slice(start,stop),s);
 assert.equal(s.importOperationV2(p),'ok');
 assert.equal(added[0].guarnicoesParticipantes,'BST 01, TOR 01');
 assert.equal(added[0].guarnicao,'BST 01, TOR 01'); // existing origin mapping unchanged
 assert.equal(s.state.importedReportIds[0],'op-demo');
}
console.log('PASS multiple participating teams in RSD/RCO, backwards-compatible origin and save-through');
