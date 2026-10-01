'use strict';
/**
 * Fixtures sintéticas — identidade estrutural imutável / visibilidade RCO.
 */
const assert = require('assert');
const I = require('../rsd_structural_identity.js');
const G = require('../rco_scope_guard.js');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('OK', name);
}

function oldRow(overrides) {
  return Object.assign({
    REPORT_ID: 'sd-test-bprv-001',
    SERVICE_ID: 'svc-test-bprv-001',
    DATA_SERVICO: '2026-09-30',
    BATALHAO: 'BPRv',
    COMPANHIA: '1ª CPRv',
    STATUS: 'EM_SERVICO',
    RCO_REPORT_ID: '',
    SEGMENTO: 1
  }, overrides || {});
}

test('A) payload final sem unidade → permanece BPRv / 1ª CPRv', function () {
  const r = I.resolveStructuralIdentity(oldRow(), {
    reportId: 'sd-test-bprv-001',
    unidade: {},
    servico: { data: '2026-09-30' },
    guarnicao: { nome: 'BST 01' }
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.batalhao, 'BPRv');
  assert.strictEqual(r.companhia, '1ª CPRv');
  assert.strictEqual(r.dataServico, '2026-09-30');
});

test('B) payload final = BPTran / 1ª CPTran → nunca muda silenciosamente', function () {
  const r = I.resolveStructuralIdentity(oldRow(), {
    reportId: 'sd-test-bprv-001',
    unidade: { batalhao: 'BPTran', companhia: '1ª CPTran', companhiaNumero: 1 },
    servico: { data: '2026-09-30' }
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, 'RSD_STRUCTURAL_IDENTITY_MISMATCH');
  assert.ok(r.mismatches.some((m) => m.field === 'BATALHAO'));
});

test('C) payload data diferente → mismatch DATA_SERVICO', function () {
  const r = I.resolveStructuralIdentity(oldRow(), {
    reportId: 'sd-test-bprv-001',
    unidade: { batalhao: 'BPRv', companhia: '1ª CPRv' },
    servico: { data: '2026-10-01' }
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, 'RSD_STRUCTURAL_IDENTITY_MISMATCH');
  assert.ok(r.mismatches.some((m) => m.field === 'DATA_SERVICO'));
});

test('D) EM_SERVICO → AGUARDANDO_ANALISE continua no rsd-list do RCO', function () {
  const rows = [
    oldRow({ STATUS: 'AGUARDANDO_ANALISE', RCO_REPORT_ID: '' })
  ];
  const filtered = G.filterRowsForRco(rows, { batalhao: 'BPRv', companhia: '1ª CPRv' }, '2026-09-30', I.dateText);
  assert.strictEqual(filtered.items.length, 1);
  assert.strictEqual(filtered.items[0].REPORT_ID, 'sd-test-bprv-001');
  assert.strictEqual(I.isVisibleInRco('AGUARDANDO_ANALISE'), true);
});

test('E) AGUARDANDO_ANALISE + RCO_REPORT_ID vazio → aparece', function () {
  const row = oldRow({ STATUS: 'AGUARDANDO_ANALISE', RCO_REPORT_ID: '' });
  const flags = I.rcoLifecycleFlags(row.STATUS);
  assert.strictEqual(flags.VISIBLE_IN_RCO, true);
  assert.strictEqual(flags.ANALYSABLE_IN_RCO, true);
  assert.strictEqual(flags.EDITABLE_BY_RSD, false);
  const filtered = G.filterRowsForRco([row], { batalhao: 'BPRv', companhia: '1ª CPRv' }, '2026-09-30', I.dateText);
  assert.strictEqual(filtered.items.length, 1);
});

test('F) FINALIZADO + RCO_REPORT_ID vazio → aparece', function () {
  const row = oldRow({ STATUS: 'FINALIZADO', RCO_REPORT_ID: '' });
  assert.strictEqual(I.isVisibleInRco('FINALIZADO'), true);
  const filtered = G.filterRowsForRco([row], { batalhao: 'BPRv', companhia: '1ª CPRv' }, '2026-09-30', I.dateText);
  assert.strictEqual(filtered.items.length, 1);
});

test('G) DEFERIDO + RCO_REPORT_ID vazio → aparece e pode ser adicionado', function () {
  const row = oldRow({ STATUS: 'DEFERIDO', RCO_REPORT_ID: '' });
  const flags = I.rcoLifecycleFlags('DEFERIDO');
  assert.strictEqual(flags.VISIBLE_IN_RCO, true);
  assert.strictEqual(flags.ADDABLE_TO_RCO, true);
  const filtered = G.filterRowsForRco([row], { batalhao: 'BPRv', companhia: '1ª CPRv' }, '2026-09-30', I.dateText);
  assert.strictEqual(filtered.items.length, 1);
});

test('H) mesma data/status outra Companhia → não aparece', function () {
  const rows = [oldRow({ COMPANHIA: '3ª CPRv', STATUS: 'AGUARDANDO_ANALISE' })];
  const filtered = G.filterRowsForRco(rows, { batalhao: 'BPRv', companhia: '1ª CPRv' }, '2026-09-30', I.dateText);
  assert.strictEqual(filtered.items.length, 0);
});

test('I) mesma Companhia outra data operacional → não aparece', function () {
  const rows = [oldRow({ DATA_SERVICO: '2026-09-29', STATUS: 'AGUARDANDO_ANALISE' })];
  const filtered = G.filterRowsForRco(rows, { batalhao: 'BPRv', companhia: '1ª CPRv' }, '2026-09-30', I.dateText);
  assert.strictEqual(filtered.items.length, 0);
});

test('J) 1ª CPTran ≠ 1ª CPRv continua protegido', function () {
  const rows = [
    oldRow({ BATALHAO: 'BPTran', COMPANHIA: '1ª CPTran', STATUS: 'AGUARDANDO_ANALISE' }),
    oldRow({ REPORT_ID: 'sd-bprv', BATALHAO: 'BPRv', COMPANHIA: '1ª CPRv', STATUS: 'AGUARDANDO_ANALISE' })
  ];
  const a = G.filterRowsForRco(rows, { batalhao: 'BPTran', companhia: '1ª CPTran' }, '2026-09-30', I.dateText);
  assert.strictEqual(a.items.length, 1);
  assert.strictEqual(a.items[0].REPORT_ID, 'sd-test-bprv-001');
  const b = G.filterRowsForRco(rows, { batalhao: 'BPRv', companhia: '1ª CPRv' }, '2026-09-30', I.dateText);
  assert.strictEqual(b.items.length, 1);
  assert.strictEqual(b.items[0].REPORT_ID, 'sd-bprv');
});

test('órfão BPTran+1ª CPRv falha canon e some do RCO (explica incidente)', function () {
  const orphan = oldRow({ BATALHAO: 'BPTran', COMPANHIA: '1ª CPRv', STATUS: 'AGUARDANDO_ANALISE' });
  // Escopo BPRv 1ª — não aparece
  assert.strictEqual(
    G.filterRowsForRco([orphan], { batalhao: 'BPRv', companhia: '1ª CPRv' }, '2026-09-30', I.dateText).items.length,
    0
  );
  // Escopo BPTran 1ª CPTran — também não (tipo mismatch)
  assert.strictEqual(
    G.filterRowsForRco([orphan], { batalhao: 'BPTran', companhia: '1ª CPTran' }, '2026-09-30', I.dateText).items.length,
    0
  );
});

test('payload igual à identidade → ok preservado', function () {
  const r = I.resolveStructuralIdentity(oldRow(), {
    unidade: { batalhao: 'BPRv', companhia: '1ª CPRv', companhiaNumero: 1 },
    servico: { data: '2026-09-30' }
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.preserved, true);
});

test('fluxo finalize simulado: empty unit payload não move linha', function () {
  const old = oldRow();
  const payload = { reportId: old.REPORT_ID, unidade: {}, ocorrencias: [{ id: 'oc-1' }], servico: {} };
  const idn = I.resolveStructuralIdentity(old, payload);
  assert.strictEqual(idn.ok, true);
  const after = Object.assign({}, old, {
    STATUS: 'AGUARDANDO_ANALISE',
    BATALHAO: idn.batalhao,
    COMPANHIA: idn.companhia,
    DATA_SERVICO: idn.dataServico,
    RCO_REPORT_ID: ''
  });
  // Bug antigo: batt=BPTran fallback → órfão. Agora permanece no RCO.
  const list = G.filterRowsForRco([after], { batalhao: 'BPRv', companhia: '1ª CPRv' }, '2026-09-30', I.dateText);
  assert.strictEqual(list.items.length, 1);
  assert.strictEqual(after.STATUS, 'AGUARDANDO_ANALISE');
});

console.log('\nPASSED', passed);
