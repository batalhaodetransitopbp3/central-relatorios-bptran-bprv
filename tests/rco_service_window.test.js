'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const G = require('../rco_scope_guard.js');

const root = path.join(__dirname, '..');
const desktop = fs.readFileSync(path.join(root, 'relatorio_cpu.html'), 'utf8');
const ios = fs.readFileSync(path.join(root, 'relatorio_cpu_ios.html'), 'utf8');
const gas = fs.readFileSync(path.join(root, 'apps_script_v10.gs'), 'utf8');
const clasp = fs.readFileSync(path.join(root, 'gas_deploy', 'Código.js'), 'utf8');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('OK', name);
}

function extractFunction(src, name) {
  const token = 'function ' + name + '(';
  const start = src.indexOf(token);
  if (start < 0) throw new Error('função ausente: ' + name);
  let i = src.indexOf('{', start);
  let depth = 0;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error('função sem fechamento: ' + name);
}

function makeDom() {
  const els = {};
  function ensure(id) {
    if (!els[id]) {
      els[id] = {
        id: id,
        value: '',
        readOnly: false,
        disabled: false,
        tabIndex: 0,
        dataset: {},
        attrs: {},
        listeners: {},
        setAttribute: function (k, v) { this.attrs[k] = String(v); },
        getAttribute: function (k) { return this.attrs[k]; },
        addEventListener: function (type, fn) {
          (this.listeners[type] || (this.listeners[type] = [])).push(fn);
        }
      };
    }
    return els[id];
  }
  return {
    els: els,
    getElementById: function (id) { return ensure(id); },
    querySelectorAll: function () { return []; }
  };
}

function bootPage(html) {
  const names = [
    'val', 'rcoAddCalendarDaysYmd', 'rcoCanonicalTermino', 'rcoSyncServiceWindow',
    'rcoLockServiceWindowFields', 'onRcoInicioEdit', 'atualizarDiaCpu', 'localISODate',
    'rcoFortalezaParts', 'rcoOperationalInicio', 'setDates', 'collectState', 'applyCpu'
  ];
  const script = names.map(function (n) { return extractFunction(html, n); }).join('\n') + '\nvar __saves=[];\nfunction salvarRascunho(){__saves.push(JSON.parse(JSON.stringify(collectState())));}\n';
  const document = makeDom();
  const sandbox = {
    document: document,
    state: { guarnicoes: {} },
    Intl: Intl,
    CentralCloud: undefined,
    recomputeAllAits: function () {},
    currentUnit: function () { return { batalhao: 'BPTran', companhia: '3ª CPTran', companhiaNumero: 3 }; },
    cpuPeopleData: function () { return []; },
    entries: function () { return []; },
    ensureGuarnicao: function () {},
    clearContainer: function () {},
    addCpuPerson: function () {},
    addEfetivoChange: function () {},
    addCpuOperation: function () {},
    addCpuVehicle: function () {},
    addCpuTco: function () {},
    addCpuArvc: function () {},
    addAnexo: function () {},
    syncUnitHeader: function () {},
    renderGuarnicoes: function () {},
    renderMatrix: function () {},
    renderFisco: function () {},
    syncDefaultFiscoAnexo: function () {},
    syncAll: function () {}
  };
  vm.createContext(sandbox);
  vm.runInContext(script, sandbox);
  return { document: document, sandbox: sandbox };
}

function bootGas() {
  const names = [
    'dateText_', 'strictYmdDate_', 'preserveLegacyIdentityDate_', 'scriptTz_',
    'addCalendarDaysYmd_', 'rcoFormatBrYmd_', 'rcoYmdFromStoredServiceDate_',
    'rcoBindDraftServiceWindow_'
  ];
  const script = 'var RsdStructuralIdentity=undefined;\n' + names.map(function (n) { return extractFunction(gas, n); }).join('\n');
  const sandbox = {
    Utilities: {
      formatDate: function (d, tz, fmt) {
        if (Object.prototype.toString.call(d) !== '[object Date]' || isNaN(d.getTime())) return '';
        if (fmt === 'yyyy-MM-dd') {
          return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
        }
        return '';
      }
    },
    Session: { getScriptTimeZone: function () { return 'America/Fortaleza'; } }
  };
  vm.createContext(sandbox);
  vm.runInContext(script, sandbox);
  return sandbox;
}

function fire(el, type) {
  let prevented = false;
  const ev = { type: type, preventDefault: function () { prevented = true; } };
  (el.listeners[type] || []).forEach(function (fn) { fn(ev); });
  return prevented;
}

const page = bootPage(desktop);
const iosPage = bootPage(ios);
const gasApi = bootGas();
const doc = page.document;
const S = page.sandbox;

test('páginas desktop e iOS usam a mesma janela', function () {
  ['rcoAddCalendarDaysYmd', 'rcoCanonicalTermino', 'rcoSyncServiceWindow', 'rcoLockServiceWindowFields', 'onRcoInicioEdit', 'rcoFortalezaParts', 'rcoOperationalInicio', 'collectState', 'setDates'].forEach(function (name) {
    assert.strictEqual(extractFunction(desktop, name), extractFunction(ios, name), name);
  });
  assert.ok(desktop.indexOf('id="dataTermino" class="rco-window-locked" type="date" readonly aria-readonly="true"') > 0);
  assert.ok(ios.indexOf('id="dataTermino" class="rco-window-locked" type="date" readonly aria-readonly="true"') > 0);
  assert.ok(desktop.indexOf('#dataTermino[readonly]{background:#eef2f5;color:#40536a;cursor:not-allowed;pointer-events:none}') > 0);
  assert.ok(ios.indexOf('addEventListener(\'input\',onRcoInicioEdit)') > 0);
  assert.ok(desktop.indexOf('termino:rcoCanonicalTermino(val(\'dataInicio\'))') > 0);
  assert.ok(desktop.indexOf('termino:val(\'dataTermino\')') < 0);
  assert.ok(desktop.indexOf('dataTermino:p.periodo?.termino') < 0);
  assert.ok(gas.indexOf('function rcoBindDraftServiceWindow_') > 0);
  assert.strictEqual(extractFunction(gas, 'rcoBindDraftServiceWindow_'), extractFunction(clasp, 'rcoBindDraftServiceWindow_'));
  const upsert = extractFunction(gas, 'rcoDraftUpsert_');
  const bindAt = upsert.indexOf('rcoBindDraftServiceWindow_');
  const peersAt = upsert.indexOf('rcoDraftScanOpenPeers_');
  const jsonAt = upsert.indexOf('JSON.stringify(r)');
  assert.ok(bindAt > 0 && bindAt < peersAt && peersAt < jsonAt);
  assert.ok(upsert.indexOf('preserveLegacyIdentityDate_(old.DATA_SERVICO)||strictYmdDate_') < 0);
});

test('A. início 07/10 gera término 08/10', function () {
  doc.getElementById('dataInicio').value = '2026-10-07';
  const w = S.rcoSyncServiceWindow();
  assert.strictEqual(w.inicio, '2026-10-07');
  assert.strictEqual(w.termino, '2026-10-08');
  assert.strictEqual(doc.getElementById('dataTermino').value, '2026-10-08');
  assert.strictEqual(doc.getElementById('diaSemanaCpu').value, 'Quarta-feira');
});

test('B. início 08/10 gera término 09/10', function () {
  doc.getElementById('dataInicio').value = '2026-10-08';
  S.rcoSyncServiceWindow();
  assert.strictEqual(doc.getElementById('dataTermino').value, '2026-10-09');
  assert.strictEqual(doc.getElementById('diaSemanaCpu').value, 'Quinta-feira');
});

test('C. virada de mês 31/10 → 01/11', function () {
  assert.strictEqual(S.rcoCanonicalTermino('2026-10-31'), '2026-11-01');
  assert.strictEqual(gasApi.addCalendarDaysYmd_('2026-10-31', 1), '2026-11-01');
});

test('D. virada de ano 31/12 → 01/01', function () {
  assert.strictEqual(S.rcoCanonicalTermino('2026-12-31'), '2027-01-01');
  assert.strictEqual(gasApi.addCalendarDaysYmd_('2026-12-31', 1), '2027-01-01');
});

test('E. usuário não edita dataTermino', function () {
  doc.getElementById('dataInicio').value = '2026-10-07';
  S.rcoSyncServiceWindow();
  S.rcoLockServiceWindowFields();
  const el = doc.getElementById('dataTermino');
  assert.strictEqual(el.readOnly, true);
  assert.strictEqual(el.getAttribute('aria-readonly'), 'true');
  assert.strictEqual(el.disabled, false);
  assert.strictEqual(fire(el, 'beforeinput'), true);
  assert.strictEqual(fire(el, 'keydown'), true);
  el.value = '2026-10-09';
  fire(el, 'input');
  assert.strictEqual(el.value, '2026-10-08');
  el.value = '2026-10-10';
  fire(el, 'change');
  assert.strictEqual(el.value, '2026-10-08');
});

test('F. mudar dataInicio recalcula o término', function () {
  doc.getElementById('dataInicio').value = '2026-10-07';
  S.onRcoInicioEdit({ type: 'input' });
  assert.strictEqual(doc.getElementById('dataTermino').value, '2026-10-08');
  assert.strictEqual(S.__saves.length, 0);
  doc.getElementById('dataInicio').value = '2026-10-08';
  S.onRcoInicioEdit({ type: 'change' });
  assert.strictEqual(doc.getElementById('dataTermino').value, '2026-10-09');
  assert.strictEqual(S.__saves.length, 1);
  assert.strictEqual(S.__saves[0].periodo.termino, '2026-10-09');
});

test('G. collectState ignora término manipulado no DOM', function () {
  doc.getElementById('dataInicio').value = '2026-10-07';
  doc.getElementById('dataTermino').value = '2026-10-09';
  doc.getElementById('horarioServico').value = '08:00 às 20:00';
  const p = S.collectState();
  assert.strictEqual(p.periodo.inicio, '2026-10-07');
  assert.strictEqual(p.periodo.termino, '2026-10-08');
  assert.strictEqual(p.periodo.horario, '07:00 às 07:00');
});

test('H. applyCpu de legado 07→09 mostra 07→08', function () {
  doc.getElementById('observacoesGerais').value = 'manter';
  S.applyCpu({
    unidade: { batalhao: 'BPTran', companhiaNumero: 3 },
    periodo: { inicio: '2026-10-07', termino: '2026-10-09', horario: '08:00 às 20:00' },
    observacoes: 'texto legado',
    passagem: { substituto: 'SGT SILVA', data: '2026-10-12' },
    assinante: { nome: 'ALMEIDA', posto: '1º SGT' },
    state: { guarnicoes: {}, reportId: 'cpu-legado' },
    cpu: [], alteracoesEfetivo: [], operacoes: [], veiculosRecuperados: [], tcos: [], arvc: [], anexos: []
  });
  assert.strictEqual(doc.getElementById('dataInicio').value, '2026-10-07');
  assert.strictEqual(doc.getElementById('dataTermino').value, '2026-10-08');
  assert.strictEqual(doc.getElementById('horarioServico').value, '07:00 às 07:00');
  assert.strictEqual(doc.getElementById('dataFinal').value, '2026-10-12');
  assert.strictEqual(doc.getElementById('observacoesGerais').value, 'texto legado');
  assert.strictEqual(doc.getElementById('substitutoLegal').value, 'SGT SILVA');
});

test('I. backend novo 07→09 persiste 07→08', function () {
  const r = {
    periodo: { inicio: '2026-10-07', termino: '2026-10-09', horario: 'livre' },
    passagem: { data: '2026-10-09' },
    data: '2026-10-07'
  };
  const bound = gasApi.rcoBindDraftServiceWindow_(r, null);
  assert.strictEqual(bound.reject, false);
  assert.strictEqual(bound.data, '2026-10-07');
  assert.strictEqual(r.periodo.inicio, '2026-10-07');
  assert.strictEqual(r.periodo.termino, '2026-10-08');
  assert.strictEqual(r.periodo.horario, '07:00 às 07:00');
  assert.strictEqual(r.passagem.data, '2026-10-09');
  assert.strictEqual(bound.data, r.periodo.inicio);
});

test('J. DATA_SERVICO 08 com início 07 é rejeitado', function () {
  const r = { periodo: { inicio: '2026-10-07', termino: '2026-10-09', horario: '07:00 às 07:00' } };
  const old = { DATA_SERVICO: '2026-10-08', STATUS: 'EM_ANDAMENTO' };
  const bound = gasApi.rcoBindDraftServiceWindow_(r, old);
  assert.strictEqual(bound.ok, false);
  assert.strictEqual(bound.reject, true);
  assert.strictEqual(bound.message, 'A data de início deste RCO já está vinculada ao período 08/10/2026–09/10/2026. Para alterar a identidade do serviço, utilize correção administrativa.');
  assert.strictEqual(r.periodo.inicio, '2026-10-07');
  assert.strictEqual(r.periodo.termino, '2026-10-09');
  assert.notStrictEqual(bound.data, r.periodo.inicio);
});

test('aba antiga no mesmo dia normaliza 07→09 para 07→08', function () {
  const r = { periodo: { inicio: '2026-10-07', termino: '2026-10-09' } };
  const bound = gasApi.rcoBindDraftServiceWindow_(r, { DATA_SERVICO: '2026-10-07', STATUS: 'EM_ANDAMENTO' });
  assert.strictEqual(bound.reject, false);
  assert.strictEqual(bound.data, '2026-10-07');
  assert.strictEqual(r.periodo.inicio, '2026-10-07');
  assert.strictEqual(r.periodo.termino, '2026-10-08');
  assert.strictEqual(bound.data, r.periodo.inicio);
});

test('intervalo de 0 ou 3 dias também vira +1', function () {
  const zero = { periodo: { inicio: '2026-10-07', termino: '2026-10-07' } };
  const three = { periodo: { inicio: '2026-10-07', termino: '2026-10-10' } };
  gasApi.rcoBindDraftServiceWindow_(zero, null);
  gasApi.rcoBindDraftServiceWindow_(three, null);
  assert.strictEqual(zero.periodo.termino, '2026-10-08');
  assert.strictEqual(three.periodo.termino, '2026-10-08');
});

test('K. 07→08 e 08→09 coexistem na mesma companhia', function () {
  const a = { periodo: { inicio: '2026-10-07', termino: '2026-10-09' } };
  const b = { periodo: { inicio: '2026-10-08', termino: '2026-10-11' } };
  const ba = gasApi.rcoBindDraftServiceWindow_(a, null);
  const bb = gasApi.rcoBindDraftServiceWindow_(b, null);
  assert.strictEqual(ba.data, '2026-10-07');
  assert.strictEqual(bb.data, '2026-10-08');
  assert.notStrictEqual(ba.data, bb.data);
  const rows = [
    { RCO_REPORT_ID: 'cpu-a', DATA_SERVICO: ba.data, BATALHAO: 'BPTran', COMPANHIA: '3ª CPTran', STATUS: 'EM_ANDAMENTO' }
  ];
  const peer = rows.filter(function (x) {
    return ['EM_ANDAMENTO', 'EM_RETIFICACAO'].indexOf(String(x.STATUS || '')) >= 0 &&
      gasApi.dateText_(x.DATA_SERVICO) === bb.data &&
      String(x.BATALHAO || '') === 'BPTran' &&
      String(x.COMPANHIA || '') === '3ª CPTran' &&
      String(x.RCO_REPORT_ID || '') !== 'cpu-b';
  });
  assert.strictEqual(peer.length, 0);
});

test('L. mesma companhia e mesma data não abre outro RCO', function () {
  const rows = [
    { RCO_REPORT_ID: 'cpu-a', DATA_SERVICO: '2026-10-07', BATALHAO: 'BPTran', COMPANHIA: '3ª CPTran', STATUS: 'EM_ANDAMENTO' },
    { RCO_REPORT_ID: 'cpu-b', DATA_SERVICO: '2026-10-07', BATALHAO: 'BPTran', COMPANHIA: '3ª CPTran', STATUS: 'EM_RETIFICACAO' }
  ];
  const incoming = { periodo: { inicio: '2026-10-07', termino: '2026-10-09' } };
  const bound = gasApi.rcoBindDraftServiceWindow_(incoming, null);
  const peers = rows.filter(function (x) {
    return ['EM_ANDAMENTO', 'EM_RETIFICACAO'].indexOf(String(x.STATUS || '')) >= 0 &&
      gasApi.dateText_(x.DATA_SERVICO) === bound.data &&
      String(x.BATALHAO || '') === 'BPTran' &&
      String(x.COMPANHIA || '') === '3ª CPTran' &&
      String(x.RCO_REPORT_ID || '') !== 'cpu-novo';
  });
  assert.strictEqual(peers.length, 2);
  assert.ok(extractFunction(gas, 'rcoDraftUpsert_').indexOf("['EM_ANDAMENTO','EM_RETIFICACAO']") > 0);
});

test('M. horário permanece 07:00 às 07:00', function () {
  doc.getElementById('dataInicio').value = '2026-10-07';
  const w = S.rcoSyncServiceWindow();
  assert.strictEqual(w.horario, '07:00 às 07:00');
  assert.strictEqual(doc.getElementById('horarioServico').value, '07:00 às 07:00');
  const r = { periodo: { inicio: '2026-10-08', termino: '2026-10-09', horario: 'outro' } };
  gasApi.rcoBindDraftServiceWindow_(r, null);
  assert.strictEqual(r.periodo.horario, '07:00 às 07:00');
});

test('N/O. RSD do dia 07 só no RCO 07 e RSD do dia 08 só no RCO 08', function () {
  const rsds = [
    { REPORT_ID: 'rsd-07', BATALHAO: 'BPTran', COMPANHIA: '3ª CPTran', DATA_SERVICO: '2026-10-07', INICIADO_EM: '2026-10-07T12:00:00Z', STATUS: 'EM_SERVICO', GUARNICAO: 'BST 01' },
    { REPORT_ID: 'rsd-08', BATALHAO: 'BPTran', COMPANHIA: '3ª CPTran', DATA_SERVICO: '2026-10-08', INICIADO_EM: '2026-10-08T12:00:00Z', STATUS: 'EM_SERVICO', GUARNICAO: 'BST 02' }
  ];
  const payload07 = { periodo: { inicio: '2026-10-07', termino: '2026-10-09' } };
  const payload08 = { periodo: { inicio: '2026-10-08', termino: '2026-10-10' } };
  const rco07 = gasApi.rcoBindDraftServiceWindow_(payload07, null);
  const rco08 = gasApi.rcoBindDraftServiceWindow_(payload08, null);
  const scope = { batalhao: 'BPTran', companhia: '3ª CPTran' };
  const day07 = G.filterRowsForRco(rsds, scope, rco07.data, G.dateText);
  const day08 = G.filterRowsForRco(rsds, scope, rco08.data, G.dateText);
  const byEnd = G.filterRowsForRco(rsds, scope, payload07.periodo.termino, G.dateText);
  assert.deepStrictEqual(day07.items.map(function (x) { return x.REPORT_ID; }), ['rsd-07']);
  assert.deepStrictEqual(day08.items.map(function (x) { return x.REPORT_ID; }), ['rsd-08']);
  assert.ok(!day07.items.some(function (x) { return x.REPORT_ID === 'rsd-08'; }));
  assert.ok(!day08.items.some(function (x) { return x.REPORT_ID === 'rsd-07'; }));
  assert.deepStrictEqual(byEnd.items.map(function (x) { return x.REPORT_ID; }), ['rsd-08']);
});

test('P. sair e reabrir mantém as datas canônicas', function () {
  doc.getElementById('dataInicio').value = '2026-10-07';
  doc.getElementById('dataTermino').value = '2026-10-09';
  const before = S.__saves.length;
  S.onRcoInicioEdit({ type: 'change' });
  const saved = S.__saves[S.__saves.length - 1];
  assert.ok(S.__saves.length > before);
  assert.strictEqual(saved.periodo.inicio, '2026-10-07');
  assert.strictEqual(saved.periodo.termino, '2026-10-08');
  doc.getElementById('dataInicio').value = '';
  doc.getElementById('dataTermino').value = '2026-10-09';
  S.applyCpu(saved);
  assert.strictEqual(doc.getElementById('dataInicio').value, '2026-10-07');
  assert.strictEqual(doc.getElementById('dataTermino').value, '2026-10-08');
});

test('setDates semeia dataFinal com o término e não cria segunda regra', function () {
  S.CentralCloud = {
    operationalISODate: function () { return '2026-10-07'; },
    addCalendarDaysYmd: function (ymd, delta) {
      const s = String(ymd || '').slice(0, 10);
      const p = s.split('-').map(Number);
      const dt = new Date(Date.UTC(p[0], p[1] - 1, p[2] + Number(delta || 0)));
      return dt.getUTCFullYear() + '-' + String(dt.getUTCMonth() + 1).padStart(2, '0') + '-' + String(dt.getUTCDate()).padStart(2, '0');
    }
  };
  doc.getElementById('dataFinal').value = '1999-01-01';
  S.setDates();
  assert.strictEqual(doc.getElementById('dataInicio').value, '2026-10-07');
  assert.strictEqual(doc.getElementById('dataTermino').value, '2026-10-08');
  assert.strictEqual(doc.getElementById('dataFinal').value, '2026-10-08');
  S.CentralCloud = undefined;
  assert.ok(extractFunction(desktop, 'setDates').indexOf('rcoSyncServiceWindow({seedDataFinal:true})') > 0);
  assert.ok(extractFunction(desktop, 'setDates').indexOf('addCalendarDaysYmd') < 0);
});

test('início inválido de RCO novo não fabrica data', function () {
  const r = { periodo: { inicio: '07/10/2026', termino: '09/10/2026' } };
  const bound = gasApi.rcoBindDraftServiceWindow_(r, null);
  assert.strictEqual(bound.reject, false);
  assert.strictEqual(bound.data, '');
  assert.notStrictEqual(r.periodo.termino, '2026-10-08');
});

test('iOS reproduz a janela canônica', function () {
  const el = iosPage.document.getElementById('dataInicio');
  el.value = '2026-10-31';
  iosPage.sandbox.rcoSyncServiceWindow();
  assert.strictEqual(iosPage.document.getElementById('dataTermino').value, '2026-11-01');
  iosPage.document.getElementById('dataTermino').value = '2026-12-31';
  const p = iosPage.sandbox.collectState();
  assert.strictEqual(p.periodo.termino, '2026-11-01');
});

function cloudOperationalISODate() {
  const src = fs.readFileSync(path.join(root, 'central_cloud.js'), 'utf8');
  const names = ['addCalendarDaysYmd', 'fortalezaParts_', 'getServiceWindow', 'operationalServiceDate', 'operationalISODate'];
  const script = names.map(function (n) { return extractFunction(src, n); }).join('\n');
  const sandbox = { Intl: Intl };
  vm.createContext(sandbox);
  vm.runInContext(script, sandbox);
  return sandbox.operationalISODate;
}

const cloudDate = cloudOperationalISODate();
const at0659 = '2026-10-08T09:59:00.000Z';
const at0700 = '2026-10-08T10:00:00.000Z';

function assertOpening(label, useCloud, when, inicio, termino) {
  test(label, function () {
    const page = bootPage(desktop);
    const iosPage = bootPage(ios);
    if (useCloud) {
      page.sandbox.CentralCloud = { operationalISODate: cloudDate };
      iosPage.sandbox.CentralCloud = { operationalISODate: cloudDate };
    }
    page.sandbox.setDates(new Date(when));
    iosPage.sandbox.setDates(new Date(when));
    assert.strictEqual(page.document.getElementById('dataInicio').value, inicio);
    assert.strictEqual(page.document.getElementById('dataTermino').value, termino);
    assert.strictEqual(page.document.getElementById('horarioServico').value, '07:00 às 07:00');
    assert.strictEqual(iosPage.document.getElementById('dataInicio').value, inicio);
    assert.strictEqual(iosPage.document.getElementById('dataTermino').value, termino);
    const saved = page.sandbox.collectState();
    assert.strictEqual(saved.periodo.inicio, inicio);
    assert.strictEqual(saved.periodo.termino, termino);
    assert.strictEqual(saved.periodo.horario, '07:00 às 07:00');
  });
}

assert.ok(extractFunction(desktop, 'setDates').indexOf('localISODate') < 0);
assert.ok(extractFunction(ios, 'setDates').indexOf('localISODate') < 0);
assertOpening('abertura 06:59 sem central_cloud.js', false, at0659, '2026-10-07', '2026-10-08');
assertOpening('abertura 07:00 sem central_cloud.js', false, at0700, '2026-10-08', '2026-10-09');
assertOpening('abertura 06:59 com central_cloud.js', true, at0659, '2026-10-07', '2026-10-08');
assertOpening('abertura 07:00 com central_cloud.js', true, at0700, '2026-10-08', '2026-10-09');

test('central_cloud.js ausente ou inválido não semeia a data local do aparelho', function () {
  const page = bootPage(desktop);
  page.sandbox.localISODate = function () { throw new Error('data local não pode ser usada'); };
  page.sandbox.CentralCloud = { operationalISODate: function () { throw new Error('script falhou'); } };
  page.sandbox.setDates(new Date(at0659));
  assert.strictEqual(page.document.getElementById('dataInicio').value, '2026-10-07');
  page.sandbox.CentralCloud = { operationalISODate: function () { return '08/10/2026'; } };
  page.sandbox.setDates(new Date(at0700));
  assert.strictEqual(page.document.getElementById('dataInicio').value, '2026-10-08');
  assert.notStrictEqual(page.document.getElementById('dataInicio').value, '08/10/2026');
});

console.log('rco_service_window', passed, 'OK');
