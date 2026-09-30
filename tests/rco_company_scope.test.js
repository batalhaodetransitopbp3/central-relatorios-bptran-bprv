'use strict';
const assert = require('assert');
const G = require('../rco_scope_guard.js');

function ok(name) { console.log('ok ', name); }

function rowsFixture() {
  return [
    { REPORT_ID: 'a', BATALHAO: 'BPTran', COMPANHIA: '1ª CPTran', DATA_SERVICO: '2026-09-30', INICIADO_EM: '2026-09-30T12:00:00Z', STATUS: 'EM_SERVICO', GUARNICAO: 'BST 01' },
    { REPORT_ID: 'b', BATALHAO: 'BPTran', COMPANHIA: '2ª CPTran', DATA_SERVICO: '2026-09-30', INICIADO_EM: '2026-09-30T12:00:00Z', STATUS: 'EM_SERVICO', GUARNICAO: 'BST 02' },
    { REPORT_ID: 'c', BATALHAO: 'BPRv', COMPANHIA: '1ª CPRv', DATA_SERVICO: '2026-09-30', INICIADO_EM: '2026-09-30T12:00:00Z', STATUS: 'EM_SERVICO', GUARNICAO: 'BST 10' },
    { REPORT_ID: 'd', BATALHAO: 'BPRv', COMPANHIA: '4ª CPRv', DATA_SERVICO: '2026-09-30', INICIADO_EM: '2026-09-30T12:00:00Z', STATUS: 'EM_SERVICO', GUARNICAO: 'BST 40' },
    { REPORT_ID: 'e', BATALHAO: 'BPTran', COMPANHIA: '1ª CPTran', DATA_SERVICO: '2026-09-29', INICIADO_EM: '2026-09-29T12:00:00Z', STATUS: 'EM_SERVICO', GUARNICAO: 'BST 01' },
    { REPORT_ID: 'f', BATALHAO: 'BPTran', COMPANHIA: '1ª CPTran', DATA_SERVICO: '2026-10-01', INICIADO_EM: '2026-10-01T12:00:00Z', STATUS: 'EM_SERVICO', GUARNICAO: 'BST 01' },
    { REPORT_ID: 'g', BATALHAO: 'BPTran', COMPANHIA: '', DATA_SERVICO: '2026-09-30', INICIADO_EM: '2026-09-30T12:00:00Z', STATUS: 'EM_SERVICO', GUARNICAO: 'BST X' },
    { REPORT_ID: 'h', BATALHAO: 'BPTran', COMPANHIA: '4ª CPRv', DATA_SERVICO: '2026-09-30', INICIADO_EM: '2026-09-30T12:00:00Z', STATUS: 'EM_SERVICO', GUARNICAO: 'MISMATCH' }
  ];
}

function opHelper(data) { return G.dateText(data); }

(function A_same_unit_visible() {
  const r = G.filterRowsForRco(rowsFixture(), { batalhao: 'BPTran', companhia: '1ª CPTran' }, '2026-09-30', opHelper);
  assert.strictEqual(r.items.length, 1);
  assert.strictEqual(r.items[0].REPORT_ID, 'a');
  ok('A. BPTran/1ª CPTran/30-09 → VISÍVEL');
})();

(function B_other_company_hidden() {
  const r = G.filterRowsForRco(rowsFixture(), { batalhao: 'BPTran', companhia: '1ª CPTran' }, '2026-09-30', opHelper);
  assert.ok(!r.items.some(x => x.REPORT_ID === 'b'));
  ok('B. BPTran/2ª CPTran mesma data → NÃO VISÍVEL');
})();

(function C_bprv_1_hidden() {
  const r = G.filterRowsForRco(rowsFixture(), { batalhao: 'BPTran', companhia: '1ª CPTran' }, '2026-09-30', opHelper);
  assert.ok(!r.items.some(x => x.REPORT_ID === 'c'));
  ok('C. BPRv/1ª CPRv mesma data → NÃO VISÍVEL');
})();

(function D_bprv_4_hidden() {
  const r = G.filterRowsForRco(rowsFixture(), { batalhao: 'BPTran', companhia: '1ª CPTran' }, '2026-09-30', opHelper);
  assert.ok(!r.items.some(x => x.REPORT_ID === 'd'));
  assert.ok(r.rejected.some(x => x.row.REPORT_ID === 'd' && x.reason === 'OTHER_UNIT'));
  ok('D. BPRv/4ª CPRv mesma data → NÃO VISÍVEL (caso observado)');
})();

(function E_prev_period() {
  const r = G.filterRowsForRco(rowsFixture(), { batalhao: 'BPTran', companhia: '1ª CPTran' }, '2026-09-30', opHelper);
  assert.ok(!r.items.some(x => x.REPORT_ID === 'e'));
  ok('E. período anterior → NÃO VISÍVEL');
})();

(function F_next_period() {
  const r = G.filterRowsForRco(rowsFixture(), { batalhao: 'BPTran', companhia: '1ª CPTran' }, '2026-09-30', opHelper);
  assert.ok(!r.items.some(x => x.REPORT_ID === 'f'));
  ok('F. período seguinte → NÃO VISÍVEL');
})();

(function G_ordinal_trap() {
  const a = G.normCompany('BPTran', '1ª CPTran');
  const b = G.normCompany('BPRv', '1ª CPRv');
  assert.notStrictEqual(a, b);
  assert.strictEqual(a, '1ª CPTran');
  assert.strictEqual(b, '1ª CPRv');
  const scope = G.requireUnitScope({ batalhao: 'BPTran', companhiaNumero: 1 });
  assert.strictEqual(scope.companhia, '1ª CPTran');
  assert.ok(!G.sameUnitScope({ BATALHAO: 'BPRv', COMPANHIA: '1ª CPRv' }, scope));
  ok('G. 1ª CPTran ≠ 1ª CPRv');
})();

(function H_missing_company() {
  const r = G.filterRowsForRco(rowsFixture(), { batalhao: 'BPTran', companhia: '1ª CPTran' }, '2026-09-30', opHelper);
  assert.ok(!r.items.some(x => x.REPORT_ID === 'g'));
  assert.ok(r.rejected.some(x => x.row.REPORT_ID === 'g' && x.reason === 'MISSING_UNIT'));
  ok('H. RSD sem Companhia → não aparece');
})();

(function I_4a_cprv_only_own() {
  const r = G.filterRowsForRco(rowsFixture(), { batalhao: 'BPRv', companhia: '4ª CPRv' }, '2026-09-30', opHelper);
  assert.strictEqual(r.items.length, 1);
  assert.strictEqual(r.items[0].REPORT_ID, 'd');
  assert.ok(!r.items.some(x => x.REPORT_ID === 'a'));
  ok('I. RCO 4ª CPRv → só RSDs 4ª CPRv');
})();

(function J_totals_exclude_foreign() {
  const r = G.filterRowsForRco(rowsFixture(), { batalhao: 'BPTran', companhia: '1ª CPTran' }, '2026-09-30', opHelper);
  const included = new Set(r.items.map(x => x.REPORT_ID));
  const fakeOrigins = [
    { rsdReportId: 'a', qty: 10 },
    { rsdReportId: 'd', qty: 99 },
    { rsdReportId: 'b', qty: 50 }
  ];
  const total = fakeOrigins.filter(o => included.has(o.rsdReportId)).reduce((s, o) => s + o.qty, 0);
  assert.strictEqual(total, 10);
  ok('J. totais ignoram guarnições fora do escopo');
})();

(function K_pdf_scope() {
  const r = G.filterRowsForRco(rowsFixture(), { batalhao: 'BPTran', companhia: '1ª CPTran' }, '2026-09-30', opHelper);
  const pdfIds = r.items.map(x => x.REPORT_ID);
  assert.deepStrictEqual(pdfIds, ['a']);
  ok('K. consolidado/PDF sem dados de outra companhia');
})();

(function L_mismatch_batt_comp_rejected() {
  const u = G.sheetUnitCanon({ BATALHAO: 'BPTran', COMPANHIA: '4ª CPRv' });
  assert.strictEqual(u.valid, false);
  assert.strictEqual(u.reason, 'UNIT_TYPE_MISMATCH');
  ok('L. BPTran + rótulo CPRv → inválido (não redistribuir)');
})();

(function M_require_scope() {
  assert.throws(() => G.requireUnitScope({ batalhao: 'BPTran' }), /companhia/i);
  assert.throws(() => G.requireUnitScope({ companhia: '1ª CPTran' }), /batalh/i);
  ok('M. escopo incompleto rejeitado');
})();

(function N_regression_guard_triple_and() {
  // RCO_SCOPE = operationalDate + batalhao + companhia (permanente)
  const scope = G.requireUnitScope({ batalhao: 'BPTran', companhiaNumero: '1' });
  assert.ok(G.matchesRcoScope(rowsFixture()[0], scope, '2026-09-30', opHelper));
  assert.ok(!G.matchesRcoScope(rowsFixture()[3], scope, '2026-09-30', opHelper));
  assert.ok(!G.matchesRcoScope(rowsFixture()[0], scope, '2026-09-29', opHelper));
  ok('N. regressão: AND triplo DATA∧BATALHÃO∧COMPANHIA');
})();

console.log('\nTodos os testes de escopo RCO passaram.');
