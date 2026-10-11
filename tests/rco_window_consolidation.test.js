'use strict';
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const gas = fs.readFileSync(path.join(root, 'apps_script_v10.gs'), 'utf8');
const clasp = fs.readFileSync(path.join(root, 'gas_deploy', 'Código.js'), 'utf8');
const rsdHtml = fs.readFileSync(path.join(root, 'relatorio_servico_diario.html'), 'utf8');

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
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error('função sem fechamento: ' + name);
}

const names = [
  'sheetDateSerialYmd_', 'dateText_', 'strictYmdDate_', 'preserveLegacyIdentityDate_', 'scriptTz_', 'addCalendarDaysYmd_',
  'rcoFormatBrYmd_', 'rcoYmdFromStoredServiceDate_', 'rcoBindDraftServiceWindow_',
  'parseJson_', 'loadJsonPayload_', 'hash_', 'rcoFpStr_',
  'normBattalion_', 'normMat_', 'companyNumber_', 'companyTipoFromLabel_', 'normCompany_',
  'rcoConsolidateStableId_', 'rcoConsolidateDeriveStatFromRco_', 'rcoConsolidateBuildCtx_',
  'rcoConsolidateProjectWrites_', 'rcoConsolidateSubstantiveCanon_', 'rcoConsolidateFingerprint_',
  'rcoConsolidateDraftFingerprint_',
  'rcoDraftPayloadWindowNormalized_', 'rcoDraftWindowOnlyNormalization_', 'rcoDraftResolveConsolidateMarkers_',
  'rcoConsolidateWindowFpCompatible_', 'rcoAlignConsolidatedWindowHeader_'
];

const writes = [];
const sandbox = {
  Utilities: {
    DigestAlgorithm: { MD5: 'MD5' },
    Charset: { UTF_8: 'UTF-8' },
    computeDigest: function (_alg, text) {
      return Array.from(crypto.createHash('md5').update(String(text || ''), 'utf8').digest());
    },
    formatDate: function (d, _tz, fmt) {
      if (fmt !== 'yyyy-MM-dd') return '';
      return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
    }
  },
  Session: { getScriptTimeZone: function () { return 'America/Fortaleza'; } },
  P3_SHEET_ID: 'isolated',
  sheet_: function (_id, name) { return { name: name }; },
  upsert_: function (sheet, key, id, row) {
    writes.push({ sheet: sheet.name, key: key, id: id, termino: row.TERMINO, horario: row.HORARIO_SERVICO, data: row.DATA_SERVICO, versao: row.VERSAO });
  },
  uid_: function (p) { return (p || 'id') + '-test'; },
  nowIso_: function () { return '2026-10-08T10:00:00.000Z'; }
};
vm.createContext(sandbox);
vm.runInContext(names.map(function (n) { return extractFunction(gas, n); }).join('\n'), sandbox);

function producaoLeaves() {
  const i = rsdHtml.indexOf('const PRODUCAO=');
  const j = rsdHtml.indexOf(']];', i);
  const chunk = rsdHtml.slice(i, j + 3);
  const groups = [];
  const re = /\["([^"]+)", "([^"]+)", \[/g;
  let m;
  const marks = [];
  while ((m = re.exec(chunk))) marks.push({ gk: m[1], at: m.index });
  marks.forEach(function (mark, idx) {
    const end = idx + 1 < marks.length ? marks[idx + 1].at : chunk.length;
    const body = chunk.slice(mark.at, end);
    const items = [];
    const ir = /\["([^"]+)", "([^"]+)"\]/g;
    let im;
    while ((im = ir.exec(body))) {
      if (im[1] !== mark.gk) items.push([im[1], im[2]]);
    }
    groups.push([mark.gk, items]);
  });
  const leaves = [];
  groups.forEach(function (g) {
    g[1].forEach(function (item) { leaves.push({ grupo: g[0], indicador: item[0], nome: item[1] }); });
  });
  return leaves;
}

const leaves = producaoLeaves();
assert.strictEqual(leaves.length, 48, 'catálogo de produção do RSD');

const reportId = 'cpu-consolidado';
function buildRco(termino) {
  const metrics = {};
  leaves.forEach(function (leaf, i) { metrics[leaf.grupo + '::' + leaf.indicador] = i + 1; });
  return {
    schema: 'pmpb-transito-cpu-v2',
    reportId: reportId,
    unidade: { batalhao: 'BPTran', companhia: '3ª CPTran', companhiaNumero: 3 },
    periodo: { inicio: '2026-10-07', termino: termino, horario: termino === '2026-10-08' ? '07:00 às 07:00' : '08:00 às 20:00' },
    ocorrencias: [
      { id: 'oc-1', tipo: 'Sinistro', descricao: 'Colisão na BR-230' },
      { id: 'oc-2', tipo: 'Apoio', descricao: 'Remoção vinculada' }
    ],
    state: { reportId: reportId, guarnicoes: { cpu: { id: 'cpu', nome: 'CPU', metrics: metrics, ocorrencias: [{ id: 'oc-1' }] } } },
    rcoOrigens: [{ rsdReportId: 'rsd-07' }]
  };
}

function sheetRow(payload, pkgFp) {
  return {
    RCO_REPORT_ID: reportId,
    DATA_SERVICO: '2026-10-07',
    STATUS: 'EM_ANDAMENTO',
    P3_CONSOLIDADO: 'SIM',
    P3_CONSOLIDADO_EM: '2026-10-07T22:00:00.000Z',
    P3_CONSOLIDATE_INTEGRAL: 'SIM',
    P3_CONSOLIDATE_FP: pkgFp,
    P3_CONSOLIDATE_DRAFT_FP: sandbox.rcoConsolidateDraftFingerprint_(payload, reportId),
    PAYLOAD_JSON: JSON.stringify(payload),
    VERSAO: 3
  };
}

function producaoOf(rco) {
  return sandbox.rcoConsolidateProjectWrites_({ rco: rco }, reportId, { forFingerprint: true }).producao;
}

function replaceRows(rows, next) {
  return rows.filter(function (r) { return r.REPORT_ID !== reportId; }).concat(next);
}

const legacy = buildRco('2026-10-09');
const legacyFp = sandbox.rcoConsolidateFingerprint_({ rco: legacy }, reportId);
const old = sheetRow(legacy, legacyFp);
const saved = JSON.parse(JSON.stringify(legacy));
const bound = sandbox.rcoBindDraftServiceWindow_(saved, old);

test('salvamento de RCO consolidado normaliza o término e preserva indicadores e ocorrências', function () {
  assert.strictEqual(bound.reject, false);
  assert.strictEqual(saved.periodo.inicio, '2026-10-07');
  assert.strictEqual(saved.periodo.termino, '2026-10-08');
  assert.strictEqual(saved.periodo.horario, '07:00 às 07:00');
  const marker = sandbox.rcoDraftResolveConsolidateMarkers_(old, saved, reportId);
  assert.strictEqual(marker.windowOnly, true);
  assert.strictEqual(marker.keep, true);
  assert.strictEqual(marker.clearConsolidated, false);
  assert.strictEqual(marker.outIntegral, 'SIM');
  assert.strictEqual(marker.outPkgFp, legacyFp);
  assert.strictEqual(saved.ocorrencias.length, 2);
  assert.deepStrictEqual(saved.ocorrencias.map(function (o) { return o.id; }), ['oc-1', 'oc-2']);
  assert.strictEqual(Object.keys(saved.state.guarnicoes.cpu.metrics).length, 48);
  assert.deepStrictEqual(saved.state.guarnicoes.cpu.metrics, legacy.state.guarnicoes.cpu.metrics);
  assert.deepStrictEqual(saved.state.guarnicoes.cpu.ocorrencias, [{ id: 'oc-1' }]);
  assert.strictEqual(producaoOf(saved).length, 48);
});

test('reabertura do mesmo RCO mantém a janela, os 48 indicadores e as ocorrências', function () {
  const again = JSON.parse(JSON.stringify(saved));
  const row = sheetRow(saved, legacyFp);
  row.P3_CONSOLIDATE_DRAFT_FP = sandbox.rcoConsolidateDraftFingerprint_(saved, reportId);
  row.PAYLOAD_JSON = JSON.stringify(saved);
  sandbox.rcoBindDraftServiceWindow_(again, row);
  const marker = sandbox.rcoDraftResolveConsolidateMarkers_(row, again, reportId);
  assert.strictEqual(marker.keep, true);
  assert.strictEqual(marker.windowOnly, false);
  assert.strictEqual(again.periodo.termino, '2026-10-08');
  assert.strictEqual(Object.keys(again.state.guarnicoes.cpu.metrics).length, 48);
  assert.deepStrictEqual(again.ocorrencias, saved.ocorrencias);
});

test('consolidar de novo só alinha o cabeçalho e não duplica indicadores', function () {
  const canonical = JSON.parse(JSON.stringify(saved));
  const pkg = { rco: canonical };
  const storedRow = { REPORT_ID: reportId, DATA_SERVICO: '2026-10-07', INICIO: '2026-10-07', TERMINO: '2026-10-09', HORARIO_SERVICO: '08:00 às 20:00', VERSAO: 3 };
  assert.strictEqual(sandbox.rcoConsolidateWindowFpCompatible_(legacyFp, pkg, reportId, storedRow), true);
  const before = producaoOf(legacy);
  let rows = before.map(function (r) { return Object.assign({ REPORT_ID: reportId }, r); });
  assert.strictEqual(rows.length, 48);
  writes.length = 0;
  const aligned = sandbox.rcoAlignConsolidatedWindowHeader_(reportId, canonical, storedRow);
  assert.strictEqual(aligned, true);
  assert.strictEqual(storedRow.TERMINO, '2026-10-08');
  assert.strictEqual(storedRow.HORARIO_SERVICO, '07:00 às 07:00');
  assert.strictEqual(storedRow.DATA_SERVICO, '2026-10-07');
  assert.strictEqual(storedRow.VERSAO, 3);
  assert.deepStrictEqual(writes.map(function (w) { return w.sheet; }), ['RCO']);
  assert.strictEqual(rows.length, 48);
  const changed = JSON.parse(JSON.stringify(canonical));
  changed.state.guarnicoes.cpu.metrics[leaves[0].grupo + '::' + leaves[0].indicador] = 99;
  assert.strictEqual(sandbox.rcoConsolidateWindowFpCompatible_(legacyFp, { rco: changed }, reportId, {
    DATA_SERVICO: '2026-10-07', TERMINO: '2026-10-09', HORARIO_SERVICO: '08:00 às 20:00'
  }), false);
  const asDate = {
    REPORT_ID: reportId,
    DATA_SERVICO: new Date('2026-10-07T00:00:00.000Z'),
    INICIO: new Date('2026-10-07T00:00:00.000Z'),
    TERMINO: new Date('2026-10-09T00:00:00.000Z'),
    HORARIO_SERVICO: '08:00 às 20:00',
    VERSAO: 3
  };
  assert.strictEqual(sandbox.rcoConsolidateWindowFpCompatible_(legacyFp, pkg, reportId, asDate), true);
  writes.length = 0;
  assert.strictEqual(sandbox.rcoAlignConsolidatedWindowHeader_(reportId, canonical, asDate), true);
  assert.strictEqual(asDate.TERMINO, '2026-10-08');
  assert.strictEqual(asDate.INICIO, '2026-10-07');
  assert.strictEqual(asDate.DATA_SERVICO, '2026-10-07');
  assert.strictEqual(asDate.VERSAO, 3);
  assert.ok(!String(writes[0].termino).startsWith('"'));
});

test('nova consolidação após retificação substitui indicadores e não duplica ocorrências', function () {
  const rectified = JSON.parse(JSON.stringify(saved));
  rectified.state.guarnicoes.cpu.metrics[leaves[3].grupo + '::' + leaves[3].indicador] = 7;
  const oldRow = sheetRow(saved, legacyFp);
  oldRow.STATUS = 'EM_RETIFICACAO';
  oldRow.PAYLOAD_JSON = JSON.stringify(saved);
  sandbox.rcoBindDraftServiceWindow_(rectified, oldRow);
  const marker = sandbox.rcoDraftResolveConsolidateMarkers_(oldRow, rectified, reportId);
  assert.strictEqual(marker.keep, false);
  assert.strictEqual(marker.clearConsolidated, true);
  assert.strictEqual(marker.windowOnly, false);
  const body = extractFunction(gas, 'rcoSupplementalUpsertBody_');
  const prodAt = body.indexOf("sheet_(P3_SHEET_ID,'PRODUCAO')");
  const delAt = body.indexOf('rcoDeleteWhereFast_(prodSheet', prodAt);
  const addAt = body.indexOf('rcoAppendRows_(prodSheet', delAt);
  assert.ok(prodAt > 0 && delAt > prodAt && addAt > delAt);
  const consolidate = extractFunction(gas, 'rcoConsolidateFinal_');
  const guardAt = consolidate.indexOf("draftStatus!=='EM_RETIFICACAO'");
  const compatAt = consolidate.indexOf('rcoConsolidateWindowFpCompatible_', guardAt);
  const fullWriteAt = consolidate.indexOf('rcoSupplementalUpsertBody_(', compatAt);
  assert.ok(guardAt > 0 && compatAt > guardAt && fullWriteAt > compatAt);
  let rows = producaoOf(saved).map(function (r) { return Object.assign({}, r, { REPORT_ID: reportId }); });
  rows = rows.concat(rows);
  assert.strictEqual(rows.length, 96);
  const next = producaoOf(rectified).map(function (r) { return Object.assign({}, r, { REPORT_ID: reportId }); });
  rows = replaceRows(rows, next);
  assert.strictEqual(rows.length, 48);
  const key = leaves[3].grupo + '|' + leaves[3].indicador;
  const hit = rows.filter(function (r) { return r.GRUPO_CODIGO + '|' + r.INDICADOR_CODIGO === key; });
  assert.strictEqual(hit.length, 1);
  assert.strictEqual(hit[0].QUANTIDADE, 7);
  assert.deepStrictEqual(rectified.ocorrencias.map(function (o) { return o.id; }), ['oc-1', 'oc-2']);
  const ids = {};
  rectified.ocorrencias.forEach(function (o) { ids[o.id] = (ids[o.id] || 0) + 1; });
  assert.deepStrictEqual(ids, { 'oc-1': 1, 'oc-2': 1 });
});

test('backends permanecem idênticos e a unicidade continua antes da gravação', function () {
  assert.strictEqual(gas, clasp);
  const upsert = extractFunction(gas, 'rcoDraftUpsert_');
  const bindAt = upsert.indexOf('rcoBindDraftServiceWindow_');
  const scanAt = upsert.indexOf('rcoDraftScanOpenPeers_');
  const markerAt = upsert.indexOf('rcoDraftResolveConsolidateMarkers_');
  const jsonAt = upsert.indexOf('JSON.stringify(r)');
  assert.ok(bindAt > 0 && bindAt < scanAt && scanAt < markerAt && markerAt < jsonAt);
  assert.ok(extractFunction(gas, 'rcoAlignConsolidatedWindowHeader_').indexOf('PRODUCAO') < 0);
  assert.ok(extractFunction(gas, 'rcoAlignConsolidatedWindowHeader_').indexOf('OCORRENCIAS') < 0);
});

console.log('rco_window_consolidation', passed, 'OK');
