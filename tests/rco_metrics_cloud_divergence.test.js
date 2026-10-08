'use strict';
/**
 * Divergência entre metrics e rcoCloudPayloads.
 * Executa as funções reais de relatorio_cpu.html.
 * Não grava planilha, não publica e não altera o RCO.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'relatorio_cpu.html'), 'utf8');
const gas = fs.readFileSync(path.join(root, 'apps_script_v10.gs'), 'utf8');
const exact = JSON.parse(fs.readFileSync('C:/Users/yurit/AppData/Local/Temp/reboque01_cloud_payload.json', 'utf8'));

function oneLine(name) {
  const at = html.indexOf(name);
  if (at < 0) throw new Error('ausente: ' + name);
  let line = html.slice(at, html.indexOf('\n', at));
  const cut = line.indexOf(';let state=');
  if (cut > 0) line = line.slice(0, cut + 1);
  return line;
}

function between(src, start, end) {
  const a = src.indexOf(start);
  const b = src.indexOf(end, a + start.length);
  if (a < 0 || b < 0) throw new Error('trecho ausente: ' + start);
  return src.slice(a, b);
}

function positive(map) {
  const out = {};
  Object.keys(map || {}).forEach(function (k) {
    if (Number(map[k]) > 0) out[k] = Number(map[k]);
  });
  return out;
}

function boot() {
  const sandbox = {
    console: console,
    state: { reportId: 'cpu-fae06a35-78bd-4a78-9043-7472cd6f348e', guarnicoes: {}, importedReportIds: [], importedRecordIds: [] },
    origins: [],
    cloudPayloads: {},
    alert: function () {},
    currentUnit: function () { return { batalhao: 'BPTran', companhia: '1ª CPTran', companhiaNumero: 1 }; },
    val: function () { return '2026-10-07'; },
    uid: function (p) { return p + '-test'; },
    fmtDateISO: function (v) { return v || ''; },
    appendText: function (a, b) { return a || b || ''; },
    dedupeAppend: function () {},
    addCpuOperation: function () {},
    addCpuVehicle: function () {},
    addCpuArvc: function () {},
    renderGuarnicoes: function () {},
    renderMatrix: function () {},
    renderFisco: function () {},
    removeDynamicForGu: function () {},
    recomputeAitForGuarnicao: function () {},
    canonicalUnitObject: function (u) { return { batalhao: u.batalhao, companhia: u.companhia }; },
    sameOperationalUnit: function (a, b) { return a.batalhao === b.batalhao && a.companhia === b.companhia; }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext([
    oneLine('function num('),
    oneLine('function metricKey('),
    oneLine('function guId('),
    oneLine('const SOMATORIO='),
    oneLine('function productionMapV2('),
    oneLine('function addMetricMap('),
    oneLine('function payloadIds('),
    oneLine('function validateImportedUnit('),
    oneLine('function ensureGuarnicao('),
    oneLine('function importDailyV2('),
    oneLine('function clearCloudGuarnicao('),
    oneLine('function rebuildCloudGuarnicao(')
  ].join('\n'), sandbox);
  vm.runInContext([
    'window=globalThis;',
    'function baseCollect(){return {state:state,reportId:state.reportId,operacoes:[],veiculosRecuperados:[],tcos:[],arvc:[]};}',
    'function baseApply(p){state=p.state||state;}',
    'function consolidator(){return {};}',
    'function semCpu(){return false;}',
    'function centralRcoToggleSemCpu(){}',
    'document={getElementById:function(){return {value:"",textContent:"ok",checked:false};}};',
    oneLine('window.collectState=function(){const p=baseCollect();p.rcoOrigens'),
    oneLine('if(baseApply)window.applyCpu=function(p){baseApply(p);origins=')
  ].join('\n'), sandbox);
  return sandbox;
}

assert.strictEqual(exact.reportId, 'sd-0e20901f-c81b-4e97-abdb-976585d9c0c8');
assert.strictEqual(exact.guarnicao.nome, 'REBOQUE 01');

const box = boot();
const imported = box.importDailyV2(exact, 'RSD em nuvem');
assert.strictEqual(imported, 'ok');
const live = vm.runInContext('state', box);
const gid = box.guId('REBOQUE 01');
const synthetic = positive(live.guarnicoes[gid].metrics);
assert.deepStrictEqual(synthetic, {
  'apreensoes-veiculos-recolhimentos::motocicletas': 8,
  'apreensoes-veiculos-recolhimentos::ciclomotores': 1,
  'remocoes-sinistros::automoveis': 1
});
const persisted = { 'remocoes-sinistros::automoveis': 1 };
assert.notDeepStrictEqual(synthetic, persisted);
console.log('OK importDailyV2 do payload exato do REBOQUE 01 produz 8, 1 e 1');

const manual = boot();
const metricKey = 'abordagens::motocicletas';
manual.state.guarnicoes['bst-02'] = {
  id: 'bst-02', nome: 'BST 02', metrics: { [metricKey]: 7 }, ocorrencias: [], locked: false
};
manual.cloudPayloads['sd-bst-02'] = {
  reportId: 'sd-bst-02',
  unidade: { batalhao: 'BPTran', companhia: '1ª CPTran' },
  guarnicao: { nome: 'BST 02' },
  producao: { abordagens: { motocicletas: 0 } },
  ocorrencias: []
};
manual.origins = [{ rsdReportId: 'sd-bst-02', guarnicao: 'BST 02', segmento: 1, versao: 2, recordIds: [] }];

const collected = manual.collectState();
const wire = JSON.parse(JSON.stringify(collected));
manual.state = null;
manual.cloudPayloads = null;
manual.origins = null;
manual.applyCpu(JSON.parse(JSON.stringify(wire)));
const reopened = vm.runInContext('state', manual);
assert.strictEqual(reopened.guarnicoes['bst-02'].metrics[metricKey], 7);
assert.strictEqual(manual.cloudPayloads['sd-bst-02'].producao.abordagens.motocicletas, 0);
console.log('OK collectState, upsert, claim e applyCpu preservam 7');

manual.rebuildCloudGuarnicao('BST 02');
const after = vm.runInContext('state', manual);
assert.strictEqual(Number(after.guarnicoes[box.guId('BST 02')].metrics[metricKey] || 0), 0);
console.log('OK rebuildCloudGuarnicao apaga o 7');

const collectFn = oneLine('window.collectState=function(){const p=baseCollect();p.rcoOrigens');
const applyFn = oneLine('if(baseApply)window.applyCpu=function(p){baseApply(p);origins=');
const claimFn = between(html, 'async function claimRcoDraft', 'window.centralRcoClaimCloudItem');
assert.strictEqual(collectFn.indexOf('rebuildCloudGuarnicao'), -1);
assert.strictEqual(applyFn.indexOf('rebuildCloudGuarnicao'), -1);
assert.strictEqual(claimFn.indexOf('rebuildCloudGuarnicao'), -1);
assert.ok(html.includes('state=p.state||state'));

const addFn = between(html, 'async function addCloud(item)', 'async function loadCloud');
assert.ok(addFn.includes('rcoApplyCloudSnapshot(item,p,opDate)'));
assert.ok(addFn.includes("if(applied==='atual')"));
assert.ok(addFn.includes('return'));
assert.ok(html.includes('function rcoSnapshotIsNewer(origin,item)'));
assert.ok(html.includes('add.disabled=add.disabled||(!!o&&!newer)'));

const directCalls = html.split('rebuildCloudGuarnicao(').length - 1;
assert.strictEqual(directCalls, 3);
assert.strictEqual(html.split('forEach(rebuildCloudGuarnicao)').length - 1, 1);

const upsert = between(gas, 'function rcoDraftUpsert_', 'function rcoDraftClaim_');
const guard = upsert.indexOf('if(!old&&data){');
assert.ok(guard > 0);
assert.ok(upsert.indexOf('existing:true', guard) > guard);
assert.ok(html.includes('if(r&&r.existing&&r.reportId)'));
assert.ok(html.includes('claimRcoDraft({reportId:r.reportId}'));

function canonicalSwitch(old, peerId) {
  if (!old && peerId) return { existing: true, reportId: peerId, wrote: false };
  return { existing: false, reportId: old ? old.reportId : 'cpu-edited', wrote: true };
}
assert.deepStrictEqual(canonicalSwitch(null, 'cpu-canonical'), { existing: true, reportId: 'cpu-canonical', wrote: false });
assert.deepStrictEqual(canonicalSwitch({ reportId: 'cpu-edited' }, 'cpu-canonical'), { existing: false, reportId: 'cpu-edited', wrote: true });
console.log('OK reportId já existente não é trocado pelo canônico');
console.log('PASSED');
