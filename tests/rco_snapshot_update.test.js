'use strict';
/**
 * Atualização do RCO quando o RSD ganha draftRevision
 * sem mudar version. Não grava na Central.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const pages = ['relatorio_cpu.html', 'relatorio_cpu_ios.html'];
const html = fs.readFileSync(path.join(root, 'relatorio_cpu.html'), 'utf8');

function oneLine(name) {
  const at = html.indexOf(name);
  if (at < 0) throw new Error('ausente: ' + name);
  let line = html.slice(at, html.indexOf('\n', at));
  const cut = line.indexOf(';let state=');
  if (cut > 0) line = line.slice(0, cut + 1);
  return line;
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
    state: { reportId: 'cpu-local', guarnicoes: {}, importedReportIds: [], importedRecordIds: [] },
    origins: [],
    cloudPayloads: {},
    cloudItems: [],
    alert: function () {},
    confirm: function () { return true; },
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
    'window=globalThis;',
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
    oneLine('function rebuildCloudGuarnicao('),
    oneLine('function rcoSnapshotIsNewer('),
    oneLine('function rcoColumnDivergesFromSnapshot('),
    oneLine('function rcoForceDraftIsEmpty('),
    oneLine('function rcoApplyCloudSnapshot('),
    oneLine('window.rcoStaleIncludedGuarnicoes='),
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

function payload(prod, extra) {
  return Object.assign({
    reportId: 'sd-1',
    unidade: { batalhao: 'BPTran', companhia: '1ª CPTran' },
    guarnicao: { nome: 'BST 02' },
    producao: prod,
    ocorrencias: [],
    observacoes: '',
    generatedAt: '2026-10-08T10:00:00.000Z'
  }, extra || {});
}

const box = boot();
const origin = { versao: 1, draftRevision: 1 };
const newerDraft = { version: 1, draftRevision: 2 };
assert.strictEqual(box.rcoSnapshotIsNewer(origin, newerDraft), true);
assert.strictEqual(box.rcoSnapshotIsNewer(origin, { version: 1, draftRevision: 1 }), false);
pages.forEach(function (file) {
  const src = fs.readFileSync(path.join(root, file), 'utf8');
  assert.ok(src.includes("newer?'Atualizar dados':'Adicionado'"), file);
  assert.ok(src.includes('Em andamento — dados parciais'), file);
  assert.ok(src.includes('rcoSnapshotIsNewer(o,x)'), file);
  assert.ok(src.includes('Dados existentes apenas no aparelho da guarnição não poderão ser recuperados por esta finalização.'), file);
});
console.log('A OK versão igual e draft maior pede Atualizar dados');

const zero = payload({ abordagens: { motocicletas: 0 } });
const first = box.rcoApplyCloudSnapshot({ reportId: 'sd-1', version: 1, draftRevision: 1, guarnicao: 'BST 02', status: 'EM_SERVICO' }, zero, '2026-10-07');
assert.strictEqual(first, 'incluido');
const filled = payload({
  abordagens: { motocicletas: 8 },
  notificacoes: { 'art-165': 5 }
}, { generatedAt: '2026-10-08T11:00:00.000Z', draftRevision: 2, versao: 1 });
const second = box.rcoApplyCloudSnapshot({
  reportId: 'sd-1', version: 1, draftRevision: 2, guarnicao: 'BST 02',
  status: 'EM_SERVICO', ultimoRascunhoEm: '2026-10-08T11:00:00.000Z'
}, filled, '2026-10-07');
assert.strictEqual(second, 'atualizado');
assert.strictEqual(box.origins.length, 1);
assert.strictEqual(box.origins[0].draftRevision, 2);
assert.strictEqual(box.origins[0].versao, 1);
assert.strictEqual(box.origins[0].snapshotAt, '2026-10-08T11:00:00.000Z');
assert.strictEqual(box.origins[0].ultimoRascunhoEm, '2026-10-08T11:00:00.000Z');
const live = vm.runInContext('state', box);
const gid = box.guId('BST 02');
assert.strictEqual(Object.keys(live.guarnicoes).length, 1);
assert.strictEqual(live.guarnicoes[gid].metrics['abordagens::motocicletas'], 8);
assert.strictEqual(live.guarnicoes[gid].metrics['notificacoes::art-165'], 5);
console.log('B OK atualizar reescreve a mesma coluna');

const saved = JSON.parse(JSON.stringify(box.collectState()));
box.state = null;
box.cloudPayloads = null;
box.origins = null;
box.applyCpu(JSON.parse(JSON.stringify(saved)));
const reopened = vm.runInContext('state', box);
assert.strictEqual(reopened.guarnicoes[gid].metrics['abordagens::motocicletas'], 8);
assert.strictEqual(box.origins[0].draftRevision, 2);
assert.strictEqual(box.cloudPayloads['sd-1'].producao.abordagens.motocicletas, 8);
console.log('C OK salvar e reabrir conserva a atualização');

const manual = boot();
manual.rcoApplyCloudSnapshot({ reportId: 'sd-2', version: 1, draftRevision: 1, guarnicao: 'BST 02', status: 'EM_SERVICO' }, payload({ abordagens: { motocicletas: 0 } }, { reportId: 'sd-2' }), '2026-10-07');
const mid = vm.runInContext('state', manual);
mid.guarnicoes[manual.guId('BST 02')].metrics['abordagens::motocicletas'] = 7;
const kept = JSON.parse(JSON.stringify(manual.collectState()));
manual.state = null;
manual.origins = null;
manual.cloudPayloads = null;
manual.applyCpu(JSON.parse(JSON.stringify(kept)));
assert.strictEqual(vm.runInContext('state', manual).guarnicoes[manual.guId('BST 02')].metrics['abordagens::motocicletas'], 7);
assert.strictEqual(manual.cloudPayloads['sd-2'].producao.abordagens.motocicletas, 0);
console.log('D OK edição manual 7 sobrevive a salvar e reabrir');

let asks = 0;
manual.confirm = function () { asks += 1; return false; };
const blocked = manual.rcoApplyCloudSnapshot({
  reportId: 'sd-2', version: 1, draftRevision: 2, guarnicao: 'BST 02', status: 'EM_SERVICO'
}, payload({ abordagens: { motocicletas: 8 } }, { reportId: 'sd-2', draftRevision: 2 }), '2026-10-07');
assert.strictEqual(blocked, 'cancelado');
assert.strictEqual(asks, 1);
assert.strictEqual(vm.runInContext('state', manual).guarnicoes[manual.guId('BST 02')].metrics['abordagens::motocicletas'], 7);
assert.strictEqual(manual.origins[0].draftRevision, 1);
manual.confirm = function () { asks += 1; return true; };
const replaced = manual.rcoApplyCloudSnapshot({
  reportId: 'sd-2', version: 1, draftRevision: 2, guarnicao: 'BST 02', status: 'EM_SERVICO'
}, payload({ abordagens: { motocicletas: 8 } }, { reportId: 'sd-2', draftRevision: 2 }), '2026-10-07');
assert.strictEqual(replaced, 'atualizado');
assert.strictEqual(vm.runInContext('state', manual).guarnicoes[manual.guId('BST 02')].metrics['abordagens::motocicletas'], 8);
assert.strictEqual(manual.origins.length, 1);
console.log('E OK divergência manual exige confirmação');

assert.strictEqual(box.rcoSnapshotIsNewer({ versao: 1, draftRevision: 1 }, { version: 2, draftRevision: 1 }), true);
console.log('F OK version maior também pede atualização');

assert.strictEqual(box.rcoForceDraftIsEmpty(payload({})), true);
assert.strictEqual(box.rcoForceDraftIsEmpty(payload({ abordagens: { motocicletas: 8 } })), false);
assert.strictEqual(box.rcoForceDraftIsEmpty(payload({}, { ocorrencias: [{ id: 'oc-1' }] })), false);
assert.ok(html.includes('O RSD será finalizado com o último rascunho disponível na Central. Este rascunho não possui produção operacional nem ocorrências registradas. Dados existentes apenas no aparelho da guarnição não poderão ser recuperados por esta finalização.'));
console.log('G OK finalização forçada avisa rascunho vazio');

const watch = boot();
watch.origins = [{ rsdReportId: 'sd-1', guarnicao: 'BST 02', versao: 1, draftRevision: 1 }];
watch.cloudItems = [{ reportId: 'sd-1', version: 1, draftRevision: 2, guarnicao: 'BST 02' }];
assert.deepStrictEqual(watch.rcoStaleIncludedGuarnicoes(), ['BST 02']);
watch.cloudItems = [{ reportId: 'sd-1', version: 1, draftRevision: 1, guarnicao: 'BST 02' }];
assert.deepStrictEqual(watch.rcoStaleIncludedGuarnicoes(), []);
assert.ok(html.includes('Há guarnições com dados mais recentes disponíveis. Atualize antes de consolidar.'));
console.log('H OK a consolidação compara a lista já buscada');

const legacy = boot();
const legacyId = legacy.guId('BST 02');
legacy.state.guarnicoes[legacyId] = {
  id: legacyId, nome: 'BST 02', metrics: { 'abordagens::motocicletas': 7 }, ocorrencias: [], locked: true
};
legacy.cloudPayloads['sd-legacy'] = payload({ abordagens: { motocicletas: 0 } }, { reportId: 'sd-legacy' });
legacy.origins = [{ rsdReportId: 'sd-legacy', guarnicao: 'BST 02', versao: 1, status: 'DEFERIDO', segmento: 1, recordIds: [] }];
assert.strictEqual(Object.prototype.hasOwnProperty.call(legacy.origins[0], 'draftRevision'), false);
const legacySaved = JSON.parse(JSON.stringify(legacy.collectState()));
legacy.state = null;
legacy.origins = null;
legacy.cloudPayloads = null;
legacy.applyCpu(JSON.parse(JSON.stringify(legacySaved)));
const legacyState = vm.runInContext('state', legacy);
assert.strictEqual(Object.keys(legacyState.guarnicoes).length, 1);
assert.strictEqual(legacyState.guarnicoes[legacyId].metrics['abordagens::motocicletas'], 7);
assert.strictEqual(legacy.origins.length, 1);
assert.strictEqual(legacy.origins[0].rsdReportId, 'sd-legacy');
assert.strictEqual(legacy.rcoSnapshotIsNewer(legacy.origins[0], { version: 1, draftRevision: 1 }), true);
assert.strictEqual(legacy.rcoSnapshotIsNewer(legacy.origins[0], { version: 1, draftRevision: 0 }), false);
console.log('I OK RCO antigo sem draftRevision abre, salva e passa a oferecer atualização');

assert.deepStrictEqual(positive(live.guarnicoes[gid].metrics)['abordagens::motocicletas'], 8);
console.log('PASSED');
