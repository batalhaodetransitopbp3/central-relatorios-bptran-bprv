'use strict';
/** Local-only unit and contract tests for item 2.1 and item 10.
 * No network, spreadsheet, real service, or production data access.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const text = file => fs.readFileSync(path.join(root,file),'utf8');
const backend = text('apps_script_v10.gs');
assert.equal(backend, text('gas_deploy/Código.js'), 'backend source and deploy mirror diverged');
function block(src,first,last) {
 const a=src.indexOf(first);
 const b=src.indexOf(last,a+first.length);
 assert.ok(a>=0&&b>a, 'function anchors unavailable: '+first);
 return src.slice(a,b);
}
const types = new Function(block(backend,'function normGuarnicaoTipo_(v)','function serviceKeyRsd_(')+
  '\nreturn {normGuarnicaoTipo_,guarnicaoTipoFromNome_,normalizeGuarnicaoNome_};')();
assert.equal(types.normGuarnicaoTipo_('extra'), 'EXTRA');
assert.equal(types.guarnicaoTipoFromNome_('extra 02'), 'EXTRA');
assert.equal(types.normalizeGuarnicaoNome_('EXTRA 1','EXTRA'), 'EXTRA 01');
assert.equal(types.normalizeGuarnicaoNome_('EXTRA 10','EXTRA'), 'EXTRA 10');
assert.equal(types.normalizeGuarnicaoNome_('EXTRA 11','EXTRA'), '');
assert.equal(types.normalizeGuarnicaoNome_('EXTRA 01','BST'), '');
for(const old of ['BST','BASE','GTTRAN','TOR','REBOQUE']){
 assert.equal(types.normGuarnicaoTipo_(old),old,'old category must be preserved: '+old);
 assert.equal(types.normalizeGuarnicaoNome_(old+' 02',old),old+' 02');
}
console.log('PASS category EXTRA: type, numbering, existing category compatibility');
for(const f of ['relatorio_servico_diario.html','relatorio_servico_diario_ios.html']){
 const src=text(f);
 assert.match(src, /<option value="EXTRA">EXTRA<\/option>/);
 assert.match(src, /BST\|BASE\|GTTRAN\|TOR\|REBOQUE\|EXTRA/);
}
console.log('PASS RSD desktop/iOS offer EXTRA');
const sourceCode = text('relatorio_cpu.html');
const cpuIos = text('relatorio_cpu_ios.html');
for(const src of [sourceCode,cpuIos]){
 assert.match(src,/data-k="alteracoesServico"/,'RCO must display service changes');
 assert.match(src,/p\.alteracoes\?\.servico/,'RCO must read the RSD service-changes field');
 const imported = src.slice(src.indexOf('function importDailyV2('),src.indexOf('\n',src.indexOf('function importDailyV2(')));
 const status={importedReportIds:[],importedRecordIds:[]};
 const g={nome:'BST 02',id:'bst02',metrics:{},ocorrencias:[],observacoes:'',alteracoesServico:''};
 const sandbox={
  state:status,validateImportedUnit:()=>true,ensureGuarnicao:()=>g,addMetricMap:()=>{},
  productionMapV2:()=>({}),fmtDateISO:()=> '15/10/2026',
  appendText:(prev,next,label)=> next?((prev?prev+'\n':'')+'['+label+'] '+next):(prev||''),
  dedupeAppend:()=>{},addCpuOperation:()=>{},addCpuVehicle:()=>{},addCpuArvc:()=>{},
  renderGuarnicoes:()=>{},renderMatrix:()=>{},renderFisco:()=>{}
 };
 vm.runInNewContext(imported,sandbox);
 const payload={reportId:'rsd-test-02',unidade:{},guarnicao:{nome:'BST 02'},servico:{data:'2026-10-15'},alteracoes:{servico:'Troca de militar no serviço'}};
 assert.equal(vm.runInNewContext('importDailyV2',sandbox)(payload,'test.json'),'ok');
 assert.match(g.alteracoesServico,/Troca de militar no serviço/);
 assert.equal(status.importedReportIds.length,1);
 const isEmptyLine=src.slice(src.indexOf('function rcoForceDraftIsEmpty('),src.indexOf('\n',src.indexOf('function rcoForceDraftIsEmpty(')));
 const emptyCtx={...sandbox,num:Number};
 vm.runInNewContext(isEmptyLine,emptyCtx);
 const isEmpty=emptyCtx.rcoForceDraftIsEmpty;
 assert.equal(isEmpty({producao:{},alteracoes:{servico:'Mudança de serviço'}}),false,'changes-only draft must be treated as nonempty');
 assert.equal(isEmpty({producao:{},alteracoes:{servico:''}}),true,'genuinely empty draft should remain empty');
 const reduction=block(src,'function rcoSnapshotWouldDiscardFields(','function rcoApplyCloudSnapshot(');
 const rt={productionMapV2:()=>({}),num:Number};
 vm.runInNewContext(reduction,rt);
 const discarded=rt.rcoSnapshotWouldDiscardFields;
 assert.equal(discarded({alteracoes:{servico:'alteração anterior'}},{alteracoes:{servico:''}}),true);
 assert.equal(discarded({alteracoes:{servico:'alteração anterior'}},{alteracoes:{servico:'alteração anterior'}}),false);
}
console.log('PASS desktop/iOS RSD changes import, nonempty guard, reduction warning');
for(const file of ['relatorio_cpu.html','relatorio_cpu_ios.html','relatorio_servico_diario.html','relatorio_servico_diario_ios.html']){
 const src=text(file);
 const scripts=src.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/ig);
 let valid=0;
 for(const script of scripts){
  if(script[1].includes('src=') || script[1].includes('application/json'))continue;
  const code=script[2];
  if(!code.trim())continue;
  new vm.Script(code,{filename:file+'-inline-'+valid});
  valid++;
 }
 assert.ok(valid>0,'no inline scripts in '+file);
}
console.log('PASS inline HTML JavaScript parses on RCO/RSD desktop/iOS');
console.log('PASS central_pacote_integridade_2_1_extra');
