'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const D = require('../rco_draft_date_write.js');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('OK', name);
}

function dateFortaleza2026_10_01() {
  // Sheets getValues() often yields local midnight for date-only cells.
  return new Date(2026, 9, 1, 0, 0, 0, 0);
}

function simulateFindOneRow(dataServicoDate) {
  return {
    _row: 12,
    RCO_REPORT_ID: 'cpu-7372448b-84ba-4b49-89f2-2248144f7b07',
    DATA_SERVICO: dataServicoDate,
    BATALHAO: 'BPTran',
    COMPANHIA: '1ª CPTran',
    STATUS: 'EM_ANDAMENTO',
    PDF_GERADO: 'NAO',
    P3_CONSOLIDADO: 'NAO',
    ENCERRADO: 'NAO',
    ATUALIZADO_EM: '2026-10-01T12:00:00.000Z',
    REVISAO: 3
  };
}

function closureFlagsWrite(row, flags) {
  // Espelho mínimo de rcoWriteClosureFlags_ + prepare + rowFor_
  row.PDF_GERADO = flags.pdfGerado ? 'SIM' : 'NAO';
  row.P3_CONSOLIDADO = flags.p3Consolidado ? 'SIM' : 'NAO';
  row.ENCERRADO = flags.encerrado ? 'SIM' : 'NAO';
  row.ATUALIZADO_EM = '2026-10-01T15:00:00.000Z';
  D.prepareRcoDraftRowForWrite(row);
  const headers = ['RCO_REPORT_ID', 'DATA_SERVICO', 'STATUS', 'PDF_GERADO', 'P3_CONSOLIDADO', 'ENCERRADO', 'ATUALIZADO_EM'];
  const cells = D.rowForLegacy(headers, row);
  const readBack = {};
  headers.forEach(function (h, i) { readBack[h] = cells[i]; });
  return readBack;
}

function dateTextSim(v) {
  if (!v && v !== 0) return '';
  if (D.isDateObject(v)) return D.formatYmdLocal(v);
  var s = String(v).replace(/\u00a0/g, ' ').trim();
  var m = s.match(/^(\d{4}-\d{2}-\d{2})(?:[T\s].*)?$/);
  if (m) return m[1];
  return '';
}

test('TEST_RCO_DATE_OBJECT_NOT_JSON_STRINGIFIED', function () {
  const d = dateFortaleza2026_10_01();
  const corrupted = D.rowForLegacy(['DATA_SERVICO'], { DATA_SERVICO: d })[0];
  assert.strictEqual(corrupted, JSON.stringify(d));
  assert.ok(String(corrupted).charAt(0) === '"', 'legado produz aspas literais');

  const row = { DATA_SERVICO: d };
  D.prepareRcoDraftRowForWrite(row);
  const written = D.rowForLegacy(['DATA_SERVICO'], row)[0];
  assert.strictEqual(written, '2026-10-01');
  assert.notStrictEqual(written, JSON.stringify(d));
  assert.ok(!String(written).startsWith('"'));
});

test('TEST_RCO_CLOSURE_PRESERVES_DATE', function () {
  const row = simulateFindOneRow(dateFortaleza2026_10_01());
  const readBack = closureFlagsWrite(row, { pdfGerado: false, p3Consolidado: true, encerrado: false });
  assert.strictEqual(readBack.DATA_SERVICO, '2026-10-01');
  assert.notStrictEqual(readBack.DATA_SERVICO, '"2026-10-01T03:00:00.000Z"');
  assert.ok(!String(readBack.DATA_SERVICO).startsWith('"'));
  assert.strictEqual(readBack.P3_CONSOLIDADO, 'SIM');
});

test('TEST_RCO_DRAFT_SYNC_PRESERVES_DATE', function () {
  // rco-draft-upsert monta obj com DATA_SERVICO já string; prepare é no-op para string canônica.
  const obj = {
    RCO_REPORT_ID: 'cpu-test',
    DATA_SERVICO: '2026-10-01',
    STATUS: 'EM_ANDAMENTO',
    ATUALIZADO_EM: '2026-10-01T12:00:00.000Z'
  };
  D.prepareRcoDraftRowForWrite(obj);
  assert.strictEqual(obj.DATA_SERVICO, '2026-10-01');
  // Se alguém passar Date no sync (ex.: preserve falhou), ainda normaliza.
  const obj2 = { DATA_SERVICO: dateFortaleza2026_10_01(), STATUS: 'EM_ANDAMENTO' };
  D.prepareRcoDraftRowForWrite(obj2);
  assert.strictEqual(obj2.DATA_SERVICO, '2026-10-01');
  // Não repara quoted ISO histórico nesta etapa.
  const legacy = { DATA_SERVICO: '"2026-10-01T03:00:00.000Z"' };
  D.prepareRcoDraftRowForWrite(legacy);
  assert.strictEqual(legacy.DATA_SERVICO, '"2026-10-01T03:00:00.000Z"');
});

test('TEST_RCO_DATE_FILTER_AFTER_CLOSURE', function () {
  const row = simulateFindOneRow(dateFortaleza2026_10_01());
  const readBack = closureFlagsWrite(row, { pdfGerado: true, p3Consolidado: true, encerrado: false });
  assert.strictEqual(dateTextSim(readBack.DATA_SERVICO), '2026-10-01');
  assert.ok(dateTextSim(readBack.DATA_SERVICO) === '2026-10-01', 'filtro por data operacional continua batendo');
  // Corrupção legado NÃO passa no dateText_ estilo canônico
  assert.strictEqual(dateTextSim('"2026-10-01T03:00:00.000Z"'), '');
});

test('mark PDF / consolidate closure / encerrar / claim / retificação usam prepare', function () {
  function path(name, mutate) {
    const row = simulateFindOneRow(dateFortaleza2026_10_01());
    mutate(row);
    D.prepareRcoDraftRowForWrite(row);
    const cell = D.rowForLegacy(['DATA_SERVICO'], row)[0];
    assert.strictEqual(cell, '2026-10-01', name);
  }
  path('mark-pdf', function (r) { r.PDF_GERADO = 'SIM'; });
  path('consolidate-closure', function (r) { r.P3_CONSOLIDADO = 'SIM'; r.P3_CONSOLIDATE_INTEGRAL = 'SIM'; });
  path('encerrar', function (r) { r.STATUS = 'FINALIZADO'; r.ENCERRADO = 'SIM'; });
  path('claim', function (r) { r.EDIT_DEVICE_ID = 'dev-1'; r.EDIT_LEASE_UNTIL = '2026-10-01T12:03:00.000Z'; });
  path('retificacao', function (r) { r.STATUS = 'EM_RETIFICACAO'; r.PDF_GERADO = 'NAO'; r.P3_CONSOLIDADO = 'NAO'; });
});

test('GAS: helpers + chokepoint + versão 10.8.38', function () {
  const src = fs.readFileSync(path.join(__dirname, '..', 'apps_script_v10.gs'), 'utf8');
  const gas = fs.readFileSync(path.join(__dirname, '..', 'gas_deploy', 'Código.js'), 'utf8');
  assert.ok(src.indexOf("CENTRAL_V10_VERSION = '10.8.38'") >= 0);
  assert.strictEqual(src, gas, 'apps_script_v10.gs === gas_deploy/Código.js');
  assert.ok(src.indexOf('function rcoDraftPrepareRowForWrite_') >= 0);
  assert.ok(src.indexOf('function rcoDraftUpsertRow_') >= 0);
  assert.ok(src.indexOf('function rcoDraftWriteRowObject_') >= 0);
  // Paths críticos usam o chokepoint
  assert.ok(src.indexOf('rcoDraftUpsertRow_(s,String(reportId),row)') >= 0); // close + closure
  assert.ok(src.indexOf('rcoDraftUpsertRow_(draftSheet,reportId,draft') >= 0);
  // Nenhuma escrita direta restante em RCO_RASCUNHOS (exceto dentro do helper)
  const withoutHelper = src.replace(/function rcoDraftUpsertRow_[\s\S]*?^}/m, '');
  const direct = withoutHelper.match(/upsert_\([^)]*'RCO_REPORT_ID'/g) || [];
  assert.strictEqual(direct.length, 0, 'upsert_ direto RCO_REPORT_ID fora do helper: ' + direct.length);
});

test('classificação SAFE_RECOVERY do smoke RCO', function () {
  const c = D.classifyQuotedIsoRecovery({
    draftDataServico: '"2026-10-01T03:00:00.000Z"',
    payloadPeriodoInicio: '2026-10-01',
    rcoDataServico: '2026-10-01'
  });
  assert.strictEqual(c.class, 'SAFE_RECOVERY');
  // Mesmo sem payload (load falhou): RCO canônico + YMD embutido
  const c2 = D.classifyQuotedIsoRecovery({
    draftDataServico: '"2026-10-01T03:00:00.000Z"',
    payloadPeriodoInicio: '',
    rcoDataServico: '2026-10-01'
  });
  assert.strictEqual(c2.class, 'SAFE_RECOVERY');
});

console.log('\nPASSED', passed);
