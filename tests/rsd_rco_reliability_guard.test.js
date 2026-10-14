'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const backend = fs.readFileSync(path.join(root, 'apps_script_v10.gs'), 'utf8');
const backendTwin = fs.readFileSync(path.join(root, 'gas_deploy', 'Código.js'), 'utf8');
assert.strictEqual(backendTwin, backend, 'backend duplicado precisa ser identico');
let checks = 0;
function check(name, fn) { fn(); checks++; console.log('OK '+name); }
check('continuidade considera 7 dias anteriores, nunca futuro', () => {
  const start = backend.indexOf('function rsdContinueDateEligible_(');
  const end = backend.indexOf('\nfunction accessRsdOpen_', start);
  assert.ok(start >= 0 && end > start);
  const ctx = {
    strictYmdDate_: x => /^\d{4}-\d{2}-\d{2}$/.test(String(x||'')) ? x : '',
    addCalendarDaysYmd_: (day, shift) => new Date(Date.parse(day+'T00:00:00Z')+shift*86400000).toISOString().slice(0,10)
  };
  vm.createContext(ctx);
  vm.runInContext(backend.slice(start,end),ctx);
  assert.strictEqual(ctx.rsdContinueDateEligible_('2026-10-10','2026-10-11'),true);
  assert.strictEqual(ctx.rsdContinueDateEligible_('2026-10-11','2026-10-11'),true);
  assert.strictEqual(ctx.rsdContinueDateEligible_('2026-10-12','2026-10-11'),false);
  assert.strictEqual(ctx.rsdContinueDateEligible_('2026-10-03','2026-10-11'),false);
  assert.strictEqual(ctx.rsdContinueDateEligible_('"2026-10-10T03:00:00.000Z"','2026-10-11'),false);
  assert.ok(backend.includes('if(!rsdContinueDateEligible_(opDate,windowDate))return;'));
});
for(const page of ['relatorio_cpu.html','relatorio_cpu_ios.html']) {
  const html = fs.readFileSync(path.join(root,page),'utf8');
  check(page+' nao substitui pacote rico por pacote vazio',()=>{
    const start = html.indexOf('  function rcoForceDraftIsEmpty(');
    const end = html.indexOf('  function rcoApplyCloudSnapshot(',start);
    assert.ok(start > 0 && end > start);
    const ctx = {
      state: { guarnicoes: { 'base-02': { metrics: { 'notificacoes::total-aits':10 }, ocorrencias: [] } } },
      cloudPayloads: {},
      guId: name => String(name).toLowerCase().replace(/\s+/g,'-'),
      num: value => Number(value)||0,
      productionMapV2: prod => Object.values(prod || {}).reduce((acc,v)=>Object.assign(acc,v),{})
    };
    vm.createContext(ctx);
    vm.runInContext(html.slice(start,end),ctx);
    const item={reportId:'sd-test'};
    const empty={producao: { notificacoes: {totalAits:0} },observacoes:'',ocorrencias:[]};
    const rich={producao: { notificacoes: {totalAits:10} },observacoes:'Apoio',ocorrencias:[]};
    assert.strictEqual(ctx.rcoImportWouldEraseWork('BASE 02',item,empty),true);
    assert.strictEqual(ctx.rcoImportWouldEraseWork('BASE 02',item,rich),false);
    ctx.state.guarnicoes['base-02'].metrics = {};
    ctx.cloudPayloads['sd-test']=rich;
    assert.strictEqual(ctx.rcoImportWouldEraseWork('BASE 02',item,empty),true);
    ctx.cloudPayloads['sd-test']=empty;
    assert.strictEqual(ctx.rcoImportWouldEraseWork('BASE 02',item,empty),false);
    assert.ok(html.includes('if(rcoImportWouldEraseWork(name,item,p))'), 'protecao deve estar conectada ao fluxo de importacao');
    assert.ok(html.includes('const persisted=await syncRcoDraft(false)'), 'importacao precisa aguardar confirmacao do RCO na nuvem');
    assert.ok(html.includes('if(!persisted)'), 'falha de persistencia nao pode anunciar inclusao concluida');
  });
  check(page+' recusa revisao de versao anterior',()=>{
    const line=html.split(/\r?\n/).find(x=>x.includes('function rcoSnapshotIsNewer('));
    const ctx={};vm.createContext(ctx);vm.runInContext(line,ctx);
    assert.strictEqual(ctx.rcoSnapshotIsNewer({versao:2,draftRevision:1},{version:1,draftRevision:99}),false);
    assert.strictEqual(ctx.rcoSnapshotIsNewer({versao:1,draftRevision:9},{version:2,draftRevision:1}),true);
    assert.strictEqual(ctx.rcoSnapshotIsNewer({versao:2,draftRevision:3},{version:2,draftRevision:4}),true);
  });
}
for(const page of ['relatorio_servico_diario.html','relatorio_servico_diario_ios.html']) {
  const h=fs.readFileSync(path.join(root,page),'utf8');
  check(page+' exibe falha de finalizacao (nao confunde PDF com envio)',()=>{
    assert.ok(h.includes('RSD NÃO FINALIZADO NA CENTRAL'));
    assert.ok(h.includes('Um PDF gerado não comprova envio'));
    assert.ok(h.includes('RSD NÃO FINALIZADO. Não foi possível sincronizar o RSD'));
  });
}
console.log('TOTAL '+checks+' OK (fixtures locais; sem Apps Script real)');
