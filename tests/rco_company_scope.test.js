'use strict';
const assert = require('assert');
const G = require('../rco_scope_guard.js');

function ok(name) { console.log('ok ', name); }
function opHelper(data) { return G.dateText(data); }

function rowsFixture() {
  return [
    { REPORT_ID: 'a', BATALHAO: 'BPTran', COMPANHIA: '1ª CPTran', DATA_SERVICO: '2026-09-30', INICIADO_EM: '2026-09-30T12:00:00Z', STATUS: 'EM_SERVICO', GUARNICAO: 'BST 01' },
    { REPORT_ID: 'b', BATALHAO: 'BPTran', COMPANHIA: '2ª CPTran', DATA_SERVICO: '2026-09-30', INICIADO_EM: '2026-09-30T12:00:00Z', STATUS: 'EM_SERVICO', GUARNICAO: 'BST 02' },
    { REPORT_ID: 'c', BATALHAO: 'BPRv', COMPANHIA: '1ª CPRv', DATA_SERVICO: '2026-09-30', INICIADO_EM: '2026-09-30T12:00:00Z', STATUS: 'EM_SERVICO', GUARNICAO: 'BST 10' },
    { REPORT_ID: 'd', BATALHAO: 'BPRv', COMPANHIA: '4ª CPRv', DATA_SERVICO: '2026-09-30', INICIADO_EM: '2026-09-30T12:00:00Z', STATUS: 'EM_SERVICO', GUARNICAO: 'BST 40' },
    { REPORT_ID: 'e', BATALHAO: 'BPTran', COMPANHIA: '1ª CPTran', DATA_SERVICO: '2026-09-29', INICIADO_EM: '2026-09-29T12:00:00Z', STATUS: 'EM_SERVICO', GUARNICAO: 'BST 01' },
    { REPORT_ID: 'f', BATALHAO: 'BPTran', COMPANHIA: '1ª CPTran', DATA_SERVICO: '2026-10-01', INICIADO_EM: '2026-10-01T12:00:00Z', STATUS: 'EM_SERVICO', GUARNICAO: 'BST 01' },
    { REPORT_ID: 'g', BATALHAO: 'BPTran', COMPANHIA: '', DATA_SERVICO: '2026-09-30', INICIADO_EM: '2026-09-30T12:00:00Z', STATUS: 'EM_SERVICO', GUARNICAO: 'BST X' },
    { REPORT_ID: 'h', BATALHAO: 'BPTran', COMPANHIA: '4ª CPRv', DATA_SERVICO: '2026-09-30', INICIADO_EM: '2026-09-30T12:00:00Z', STATUS: 'EM_SERVICO', GUARNICAO: 'MISMATCH' },
    { REPORT_ID: 'xyz', BATALHAO: 'XYZ', COMPANHIA: '1ª CPTran', DATA_SERVICO: '2026-09-30', INICIADO_EM: '2026-09-30T12:00:00Z', STATUS: 'EM_SERVICO', GUARNICAO: 'BAD' }
  ];
}

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
  ok('D. BPRv/4ª CPRv mesma data → NÃO VISÍVEL');
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
  assert.notStrictEqual(G.normCompany('BPTran', '1ª CPTran'), G.normCompany('BPRv', '1ª CPRv'));
  ok('G. 1ª CPTran ≠ 1ª CPRv');
})();

(function H_missing_company() {
  const r = G.filterRowsForRco(rowsFixture(), { batalhao: 'BPTran', companhia: '1ª CPTran' }, '2026-09-30', opHelper);
  assert.ok(!r.items.some(x => x.REPORT_ID === 'g'));
  ok('H. RSD sem Companhia → não aparece');
})();

(function I_4a_cprv_only_own() {
  const r = G.filterRowsForRco(rowsFixture(), { batalhao: 'BPRv', companhia: '4ª CPRv' }, '2026-09-30', opHelper);
  assert.strictEqual(r.items.length, 1);
  assert.strictEqual(r.items[0].REPORT_ID, 'd');
  ok('I. RCO 4ª CPRv → só RSDs 4ª CPRv');
})();

(function J_totals_exclude_foreign() {
  const r = G.filterRowsForRco(rowsFixture(), { batalhao: 'BPTran', companhia: '1ª CPTran' }, '2026-09-30', opHelper);
  const included = new Set(r.items.map(x => x.REPORT_ID));
  const total = [{ rsdReportId: 'a', qty: 10 }, { rsdReportId: 'd', qty: 99 }].filter(o => included.has(o.rsdReportId)).reduce((s, o) => s + o.qty, 0);
  assert.strictEqual(total, 10);
  ok('J. totais ignoram guarnições fora do escopo');
})();

(function K_pdf_scope() {
  const r = G.filterRowsForRco(rowsFixture(), { batalhao: 'BPTran', companhia: '1ª CPTran' }, '2026-09-30', opHelper);
  assert.deepStrictEqual(r.items.map(x => x.REPORT_ID), ['a']);
  ok('K. consolidado/PDF sem dados de outra companhia');
})();

(function L_mismatch_batt_comp_rejected() {
  assert.strictEqual(G.sheetUnitCanon({ BATALHAO: 'BPTran', COMPANHIA: '4ª CPRv' }).valid, false);
  ok('L. BPTran + rótulo CPRv → inválido');
})();

(function M_require_scope() {
  assert.throws(() => G.requireUnitScope({ batalhao: 'BPTran' }), /MISSING_UNIT_SCOPE|companhia/i);
  assert.throws(() => G.requireUnitScope({ companhia: '1ª CPTran' }), /MISSING_UNIT_SCOPE|batalh/i);
  ok('M. escopo incompleto rejeitado');
})();

(function N_regression_guard_triple_and() {
  const scope = G.requireUnitScope({ batalhao: 'BPTran', companhiaNumero: '1' });
  assert.ok(G.matchesRcoScope(rowsFixture()[0], scope, '2026-09-30', opHelper));
  assert.ok(!G.matchesRcoScope(rowsFixture()[3], scope, '2026-09-30', opHelper));
  ok('N. regressão: AND triplo DATA∧BATALHÃO∧COMPANHIA');
})();

// --- Novos testes obrigatórios (revisão fail-closed) ---

(function A2_norm_bptran() {
  assert.strictEqual(G.normBattalion('BPTran'), 'BPTran');
  assert.strictEqual(G.normBattalion('bptran'), 'BPTran');
  assert.strictEqual(G.normBattalion('BPTRAN'), 'BPTran');
  ok('A2. normBattalion(BPTran) → BPTran');
})();

(function B2_norm_bprv() {
  assert.strictEqual(G.normBattalion('BPRv'), 'BPRv');
  assert.strictEqual(G.normBattalion('bprv'), 'BPRv');
  assert.strictEqual(G.normBattalion('BPRV'), 'BPRv');
  ok('B2. normBattalion(BPRv) → BPRv');
})();

(function C2_norm_invalid() {
  assert.strictEqual(G.normBattalion('XYZ'), '');
  assert.strictEqual(G.normBattalion('OUTRO'), '');
  assert.strictEqual(G.normBattalion('BATALHAO_ERRADO'), '');
  assert.strictEqual(G.normBattalion(''), '');
  ok('C2. normBattalion(XYZ) → inválido / \'\'');
})();

(function D2_xyz_not_in_1a() {
  const u = G.sheetUnitCanon({ BATALHAO: 'XYZ', COMPANHIA: '1ª CPTran' });
  assert.strictEqual(u.valid, false);
  assert.strictEqual(u.reason, 'INVALID_BATTALION');
  const scope = G.requireUnitScope({ batalhao: 'BPTran', companhia: '1ª CPTran' });
  assert.ok(!G.sameUnitScope({ BATALHAO: 'XYZ', COMPANHIA: '1ª CPTran' }, scope));
  const r = G.filterRowsForRco(rowsFixture(), scope, '2026-09-30', opHelper);
  assert.ok(!r.items.some(x => x.REPORT_ID === 'xyz'));
  ok('D2. BATALHAO=XYZ + 1ª CPTran → NÃO pertence à 1ª CPTran');
})();

(function E2_client_cannot_unscope() {
  assert.strictEqual(G.rsdListAllowUnscoped({ _rsdActiveUnscoped: true }, null), false);
  assert.strictEqual(G.rsdListAllowUnscoped({ allowUnscoped: true, unscoped: 1 }, {}), false);
  assert.strictEqual(G.rsdListAllowUnscoped({ _rsdActiveUnscoped: true }, { allowUnscoped: true }), true);
  ok('E2. rsd-list + _rsdActiveUnscoped=true → NÃO desliga escopo (só internalOpt)');
})();

(function F2_list_without_scope_errors() {
  assert.throws(() => G.requireUnitScope({}), /MISSING_UNIT_SCOPE/);
  assert.throws(() => G.requireUnitScope({ batalhao: '', companhia: '' }), /MISSING_UNIT_SCOPE/);
  ok('F2. rsd-list sem batalhão/companhia → erro de escopo');
})();

(function G2_rsd_get_foreign_rejected() {
  const row = { BATALHAO: 'BPRv', COMPANHIA: '4ª CPRv', DATA_SERVICO: '2026-09-30' };
  const d = G.rsdGetAccessDecision({ batalhao: 'BPTran', companhia: '1ª CPTran', data: '2026-09-30' }, row);
  assert.strictEqual(d.ok, false);
  assert.strictEqual(d.code, 'OUT_OF_RCO_SCOPE');
  ok('G2. rsd-get 4ª CPRv no contexto 1ª CPTran → rejeitado');
})();

(function H2_rsd_get_rco_no_scope() {
  const row = { BATALHAO: 'BPTran', COMPANHIA: '1ª CPTran', DATA_SERVICO: '2026-09-30' };
  const d = G.rsdGetAccessDecision({ reportId: 'a' }, row);
  assert.strictEqual(d.ok, false);
  assert.strictEqual(d.code, 'MISSING_UNIT_SCOPE');
  ok('H2. rsd-get RCO sem escopo → rejeitado');
})();

(function I2_draft_get_other_company() {
  const row = { BATALHAO: 'BPRv', COMPANHIA: '4ª CPRv', DATA_SERVICO: '2026-09-30' };
  const d = G.rcoDraftAccessDecision({ batalhao: 'BPTran', companhia: '1ª CPTran', data: '2026-09-30' }, row);
  assert.strictEqual(d.ok, false);
  assert.strictEqual(d.code, 'OUT_OF_RCO_SCOPE');
  ok('I2. rco-draft-get de outra companhia → rejeitado');
})();

(function J2_draft_get_no_scope() {
  const row = { BATALHAO: 'BPTran', COMPANHIA: '1ª CPTran', DATA_SERVICO: '2026-09-30' };
  const d = G.rcoDraftAccessDecision({ reportId: 'rco-1' }, row);
  assert.strictEqual(d.ok, false);
  assert.strictEqual(d.code, 'MISSING_UNIT_SCOPE');
  ok('J2. rco-draft-get sem escopo → rejeitado');
})();

(function K2_claim_other_company() {
  const row = { BATALHAO: 'BPRv', COMPANHIA: '4ª CPRv', DATA_SERVICO: '2026-09-30' };
  const d = G.rcoDraftAccessDecision({ batalhao: 'BPTran', companhia: '1ª CPTran', data: '2026-09-30' }, row);
  assert.strictEqual(d.ok, false);
  assert.strictEqual(d.code, 'OUT_OF_RCO_SCOPE');
  ok('K2. rcoDraftClaim de outra companhia → rejeitado');
})();

(function L2_claim_no_scope() {
  const d = G.rcoDraftAccessDecision({}, { BATALHAO: 'BPTran', COMPANHIA: '1ª CPTran', DATA_SERVICO: '2026-09-30' });
  assert.strictEqual(d.ok, false);
  assert.strictEqual(d.code, 'MISSING_UNIT_SCOPE');
  ok('L2. rcoDraftClaim sem escopo → rejeitado');
})();

(function M2_rsd_active_internal_unscoped() {
  // Espelha rsdActive_: só internalOpt.allowUnscoped=true libera varredura; depois filtra por matrícula no GAS.
  assert.strictEqual(G.rsdListAllowUnscoped({ matricula: '123.456-7' }, { allowUnscoped: true }), true);
  assert.strictEqual(G.rsdListAllowUnscoped({ matricula: '123.456-7', _rsdActiveUnscoped: true }, null), false);
  ok('M2. rsdActive_ interno continua podendo usar allowUnscoped via internalOpt');
})();

(function N2_ordinal_still() {
  assert.notStrictEqual(G.normCompany('BPTran', 1), G.normCompany('BPRv', 1));
  ok('N2. 1ª CPTran ≠ 1ª CPRv permanece');
})();

(function O2_4a_never_in_1a_paths() {
  const row4 = { REPORT_ID: 'd', BATALHAO: 'BPRv', COMPANHIA: '4ª CPRv', DATA_SERVICO: '2026-09-30' };
  const scope1 = { batalhao: 'BPTran', companhia: '1ª CPTran', data: '2026-09-30' };
  const list = G.filterRowsForRco([row4], scope1, '2026-09-30', opHelper);
  assert.strictEqual(list.items.length, 0);
  const get = G.rsdGetAccessDecision(scope1, row4);
  assert.strictEqual(get.ok, false);
  const draft = G.rcoDraftAccessDecision(scope1, row4);
  assert.strictEqual(draft.ok, false);
  const claim = G.rcoDraftAccessDecision(scope1, row4);
  assert.strictEqual(claim.ok, false);
  ok('O2. 4ª CPRv nunca entra em list/get/claim/consolidação da 1ª CPTran');
})();

(function P2_rsd_operational_path_ok() {
  const d = G.rsdGetAccessDecision({ module: 'RSD', _tokenKind: 'central', reportId: 'a' }, rowsFixture()[0]);
  assert.strictEqual(d.ok, true);
  assert.strictEqual(d.path, 'RSD_OPERATIONAL');
  ok('P2. caminho operacional RSD (module=RSD + central) permanece');
})();

// --- Data operacional fail-closed (10.8.34) ---

(function A3_rsd_get_no_date() {
  const row = { BATALHAO: 'BPTran', COMPANHIA: '1ª CPTran', DATA_SERVICO: '2026-09-30' };
  const d = G.rsdGetAccessDecision({ batalhao: 'BPTran', companhia: '1ª CPTran' }, row);
  assert.strictEqual(d.ok, false);
  assert.strictEqual(d.code, 'MISSING_OPERATIONAL_DATE');
  ok('A3. rsd-get unidade ok sem data → MISSING_OPERATIONAL_DATE');
})();

(function B3_rsd_get_wrong_date() {
  const row = { BATALHAO: 'BPTran', COMPANHIA: '1ª CPTran', DATA_SERVICO: '2026-09-29' };
  const d = G.rsdGetAccessDecision({ batalhao: 'BPTran', companhia: '1ª CPTran', data: '2026-09-30' }, row);
  assert.strictEqual(d.ok, false);
  assert.strictEqual(d.code, 'OUT_OF_RCO_SCOPE');
  ok('B3. rsd-get 30-09 pedindo RSD de 29-09 → OUT_OF_RCO_SCOPE');
})();

(function C3_rsd_list_no_period() {
  assert.throws(() => G.requireRcoListScope({ batalhao: 'BPTran', companhia: '1ª CPTran' }), /MISSING_OPERATIONAL_DATE/);
  ok('C3. rsd-list unidade sem período → rejeitado');
})();

(function D3_rsd_list_only_that_date() {
  G.requireRcoListScope({ batalhao: 'BPTran', companhia: '1ª CPTran', data: '2026-09-30' });
  const r = G.filterRowsForRco(rowsFixture(), { batalhao: 'BPTran', companhia: '1ª CPTran' }, '2026-09-30', opHelper);
  assert.ok(r.items.every(x => G.dateText(x.DATA_SERVICO) === '2026-09-30'));
  assert.strictEqual(r.items.length, 1);
  ok('D3. rsd-list BPTran/1ª/30-09 → somente 30-09');
})();

(function E3_draft_get_no_date() {
  const row = { BATALHAO: 'BPTran', COMPANHIA: '1ª CPTran', DATA_SERVICO: '2026-09-30' };
  const d = G.rcoDraftAccessDecision({ batalhao: 'BPTran', companhia: '1ª CPTran' }, row);
  assert.strictEqual(d.ok, false);
  assert.strictEqual(d.code, 'MISSING_OPERATIONAL_DATE');
  ok('E3. rco-draft-get unidade ok sem data → rejeitado');
})();

(function F3_draft_get_wrong_date() {
  const row = { BATALHAO: 'BPTran', COMPANHIA: '1ª CPTran', DATA_SERVICO: '2026-09-30' };
  const d = G.rcoDraftAccessDecision({ batalhao: 'BPTran', companhia: '1ª CPTran', data: '2026-09-29' }, row);
  assert.strictEqual(d.ok, false);
  assert.strictEqual(d.code, 'OUT_OF_RCO_SCOPE');
  ok('F3. rco-draft-get data diferente → rejeitado');
})();

(function G3_claim_correct_date() {
  const row = { BATALHAO: 'BPTran', COMPANHIA: '1ª CPTran', DATA_SERVICO: '2026-09-30' };
  const d = G.rcoDraftAccessDecision({ batalhao: 'BPTran', companhia: '1ª CPTran', data: '2026-09-30' }, row);
  assert.strictEqual(d.ok, true);
  ok('G3. rco-draft-claim unidade+data corretas → permitido');
})();

(function H3_claim_wrong_date() {
  const row = { BATALHAO: 'BPTran', COMPANHIA: '1ª CPTran', DATA_SERVICO: '2026-09-30' };
  const d = G.rcoDraftAccessDecision({ batalhao: 'BPTran', companhia: '1ª CPTran', data: '2026-09-28' }, row);
  assert.strictEqual(d.ok, false);
  assert.strictEqual(d.code, 'OUT_OF_RCO_SCOPE');
  ok('H3. rco-draft-claim data incorreta → rejeitado');
})();

(function I3_continue_rco_shape() {
  // Continuar RCO: claim com item.data da listagem access-open.
  const item = { reportId: 'rco-1', batalhao: 'BPTran', companhia: '1ª CPTran', data: '2026-09-30' };
  const row = { BATALHAO: item.batalhao, COMPANHIA: item.companhia, DATA_SERVICO: item.data };
  assert.strictEqual(G.rcoDraftAccessDecision(item, row).ok, true);
  ok('I3. continuar RCO legítimo (shape claim) → ok');
})();

(function J3_receive_rco_shape() {
  const item = { reportId: 'rco-2', batalhao: 'BPRv', companhia: '4ª CPRv', data: '2026-09-30', passagemPendente: true };
  const row = { BATALHAO: item.batalhao, COMPANHIA: item.companhia, DATA_SERVICO: item.data };
  assert.strictEqual(G.rcoDraftAccessDecision(item, row).ok, true);
  ok('J3. receber RCO legítimo (shape claim) → ok');
})();

(function K3_view_include_rsd_shape() {
  const row = { BATALHAO: 'BPTran', COMPANHIA: '1ª CPTran', DATA_SERVICO: '2026-09-30' };
  const d = G.rsdGetAccessDecision({ batalhao: 'BPTran', companhia: '1ª CPTran', data: '2026-09-30', reportId: 'a' }, row);
  assert.strictEqual(d.ok, true);
  assert.strictEqual(d.path, 'RCO_SCOPED');
  ok('K3. visualizar/incluir RSD no RCO (get scoped+data) → ok');
})();

console.log('\nTodos os testes de escopo RCO (incl. data fail-closed) passaram.');
