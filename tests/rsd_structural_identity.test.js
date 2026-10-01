'use strict';
/**
 * Fixtures sintéticas — identidade estrutural imutável / visibilidade RCO / pipeline draft.
 * Multi-Cia: regras genéricas; cias abaixo são apenas fixtures.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
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
  const rows = [oldRow({ STATUS: 'AGUARDANDO_ANALISE', RCO_REPORT_ID: '' })];
  const filtered = G.filterRowsForRco(rows, { batalhao: 'BPRv', companhia: '1ª CPRv' }, '2026-09-30', I.dateText);
  assert.strictEqual(filtered.items.length, 1);
  assert.strictEqual(I.isVisibleInRco('AGUARDANDO_ANALISE'), true);
});

test('E) AGUARDANDO_ANALISE + RCO_REPORT_ID vazio → aparece', function () {
  const row = oldRow({ STATUS: 'AGUARDANDO_ANALISE', RCO_REPORT_ID: '' });
  const flags = I.rcoLifecycleFlags(row.STATUS);
  assert.strictEqual(flags.VISIBLE_IN_RCO, true);
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
  assert.strictEqual(I.rcoLifecycleFlags('DEFERIDO').ADDABLE_TO_RCO, true);
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
  const b = G.filterRowsForRco(rows, { batalhao: 'BPRv', companhia: '1ª CPRv' }, '2026-09-30', I.dateText);
  assert.strictEqual(b.items.length, 1);
});

test('órfão BPTran+1ª CPRv falha canon e some do RCO', function () {
  const orphan = oldRow({ BATALHAO: 'BPTran', COMPANHIA: '1ª CPRv', STATUS: 'AGUARDANDO_ANALISE' });
  assert.strictEqual(G.filterRowsForRco([orphan], { batalhao: 'BPRv', companhia: '1ª CPRv' }, '2026-09-30', I.dateText).items.length, 0);
  assert.strictEqual(G.filterRowsForRco([orphan], { batalhao: 'BPTran', companhia: '1ª CPTran' }, '2026-09-30', I.dateText).items.length, 0);
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
    DATA_SERVICO: idn.dataServico
  });
  const list = G.filterRowsForRco([after], { batalhao: 'BPRv', companhia: '1ª CPRv' }, '2026-09-30', I.dateText);
  assert.strictEqual(list.items.length, 1);
});

// --- Multi-Cia fixtures (regra genérica: identidade original imutável) ---
[
  ['BPRv', '1ª CPRv', '2026-09-30'],
  ['BPRv', '3ª CPRv', '2026-09-30'],
  ['BPRv', '5ª CPRv', '2026-09-28'],
  ['BPTran', '2ª CPTran', '2026-09-30'],
  ['BPTran', '3ª CPTran', '2026-09-26']
].forEach(function (fx) {
  test('multi-cia preserva ' + fx[0] + '/' + fx[1], function () {
    const old = oldRow({ BATALHAO: fx[0], COMPANHIA: fx[1], DATA_SERVICO: fx[2], REPORT_ID: 'sd-' + fx[0] + '-' + fx[1] });
    const r = I.resolveStructuralIdentity(old, { unidade: {}, servico: {} });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.batalhao, fx[0]);
    assert.strictEqual(r.companhia, fx[1]);
    assert.strictEqual(r.dataServico, fx[2]);
  });
});

test('A) BPRv 1ª → BPTran 4ª ABORT', function () {
  const r = I.resolveStructuralIdentity(
    oldRow({ BATALHAO: 'BPRv', COMPANHIA: '1ª CPRv', DATA_SERVICO: '2026-09-25' }),
    { unidade: { batalhao: 'BPTran', companhia: '4ª CPTran' }, servico: { data: '2026-09-25' } }
  );
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, 'RSD_STRUCTURAL_IDENTITY_MISMATCH');
});

test('B) BPRv 3ª → BPTran 1ª ABORT', function () {
  const r = I.resolveStructuralIdentity(
    oldRow({ BATALHAO: 'BPRv', COMPANHIA: '3ª CPRv', DATA_SERVICO: '2026-09-30' }),
    { unidade: { batalhao: 'BPTran', companhia: '1ª CPTran' }, servico: { data: '2026-09-30' } }
  );
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, 'RSD_STRUCTURAL_IDENTITY_MISMATCH');
});

test('C) BPTran 2ª → BPTran 1ª ABORT', function () {
  const r = I.resolveStructuralIdentity(
    oldRow({ BATALHAO: 'BPTran', COMPANHIA: '2ª CPTran', DATA_SERVICO: '2026-09-30' }),
    { unidade: { batalhao: 'BPTran', companhia: '1ª CPTran' }, servico: { data: '2026-09-30' } }
  );
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, 'RSD_STRUCTURAL_IDENTITY_MISMATCH');
});

test('D) BPRv 5ª → BPTran 1ª ABORT', function () {
  const r = I.resolveStructuralIdentity(
    oldRow({ BATALHAO: 'BPRv', COMPANHIA: '5ª CPRv', DATA_SERVICO: '2026-09-28' }),
    { unidade: { batalhao: 'BPTran', companhia: '1ª CPTran' }, servico: { data: '2026-09-28' } }
  );
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, 'RSD_STRUCTURAL_IDENTITY_MISMATCH');
});

test('ZERO WRITE ON REJECT — BPRv/3ª → BPTran/1ª', function () {
  const old = oldRow({ BATALHAO: 'BPRv', COMPANHIA: '3ª CPRv', DATA_SERVICO: '2026-09-30' });
  const payload = {
    reportId: old.REPORT_ID,
    unidade: { batalhao: 'BPTran', companhia: '1ª CPTran' },
    servico: { data: '2026-09-30' },
    ocorrencias: []
  };
  const out = I.draftPersistPipeline(old, payload, { doUpsert: true });
  assert.strictEqual(out.ok, false);
  assert.strictEqual(out.code, 'RSD_STRUCTURAL_IDENTITY_MISMATCH');
  assert.strictEqual(out.counters.saveJsonPayload_called, 0);
  assert.strictEqual(out.counters.setContent_called, 0);
  assert.strictEqual(out.counters.createFile_called, 0);
  assert.strictEqual(out.counters.upsert_called, 0);
});

test('ZERO WRITE ON REJECT — payload >45 KB', function () {
  const old = oldRow({ BATALHAO: 'BPRv', COMPANHIA: '3ª CPRv', DATA_SERVICO: '2026-09-30' });
  const big = { id: 'x', blob: 'Z'.repeat(46000) };
  const payload = {
    reportId: old.REPORT_ID,
    unidade: { batalhao: 'BPTran', companhia: '1ª CPTran' },
    servico: { data: '2026-09-30' },
    ocorrencias: [big]
  };
  const out = I.draftPersistPipeline(old, payload, { doUpsert: true, existingFileId: 'file-existing' });
  assert.strictEqual(out.ok, false);
  assert.strictEqual(out.code, 'RSD_STRUCTURAL_IDENTITY_MISMATCH');
  assert.strictEqual(out.counters.saveJsonPayload_called, 0);
  assert.strictEqual(out.counters.setContent_called, 0);
  assert.strictEqual(out.counters.createFile_called, 0);
  assert.strictEqual(out.counters.upsert_called, 0);
});

test('PAYLOAD VAZIO/PARCIAL — BPRv/5ª canônico no JSON persistido', function () {
  const old = oldRow({ BATALHAO: 'BPRv', COMPANHIA: '5ª CPRv', DATA_SERVICO: '2026-09-28', REPORT_ID: 'sd-bprv5' });
  const payload = { reportId: old.REPORT_ID, unidade: {}, servico: {}, guarnicao: { nome: 'BST 02' } };
  const out = I.draftPersistPipeline(old, payload, {
    getServiceWindow: function (d) { return { operationalDate: d, cutoffHour: 7 }; },
    doUpsert: true
  });
  assert.strictEqual(out.ok, true);
  assert.strictEqual(out.persistedPayload.unidade.batalhao, 'BPRv');
  assert.strictEqual(out.persistedPayload.unidade.companhia, '5ª CPRv');
  assert.strictEqual(out.persistedPayload.servico.data, '2026-09-28');
  assert.strictEqual(out.persistedPayload.servico.operationalDate, '2026-09-28');
  assert.strictEqual(out.line.BATALHAO, 'BPRv');
  assert.strictEqual(out.line.COMPANHIA, '5ª CPRv');
  assert.strictEqual(out.line.DATA_SERVICO, '2026-09-28');
  assert.ok(out.counters.saveJsonPayload_called === 1);
  assert.ok(out.json.indexOf('"batalhao":"BPRv"') >= 0);
  assert.ok(out.json.indexOf('"companhia":"5ª CPRv"') >= 0);
});

test('PARIDADE LINHA × PAYLOAD após sync aceito', function () {
  const old = oldRow({ BATALHAO: 'BPTran', COMPANHIA: '3ª CPTran', DATA_SERVICO: '2026-09-26' });
  const payload = {
    reportId: old.REPORT_ID,
    unidade: { batalhao: 'BPTran', companhia: '3ª CPTran' },
    servico: { data: '2026-09-26' }
  };
  const out = I.draftPersistPipeline(old, payload, { doUpsert: true });
  assert.strictEqual(out.ok, true);
  const parity = I.assertLinePayloadUnitParity(out.line, out.persistedPayload);
  assert.strictEqual(parity.ok, true);
});

test('fonte única: gas_deploy/rsd_structural_identity.js === raiz', function () {
  const root = fs.readFileSync(path.join(__dirname, '..', 'rsd_structural_identity.js'), 'utf8');
  const gas = fs.readFileSync(path.join(__dirname, '..', 'gas_deploy', 'rsd_structural_identity.js'), 'utf8');
  assert.strictEqual(gas, root);
});

test('GAS rsdDraftObject_ ordem VALIDATE→CANONICALIZE→SERIALIZE→PERSIST', function () {
  const src = fs.readFileSync(path.join(__dirname, '..', 'apps_script_v10.gs'), 'utf8');
  const start = src.indexOf('function rsdDraftObject_');
  assert.ok(start >= 0);
  const end = src.indexOf('\nfunction rsdStart_', start);
  const fn = src.slice(start, end > start ? end : start + 4000);
  const iResolve = fn.indexOf('rsdResolveStructuralIdentity_');
  const iCanon = fn.indexOf('rsdApplyCanonicalIdentityToPayload_');
  const iStringify = fn.indexOf('var json=JSON.stringify(r)');
  const iSave = fn.indexOf('saveJsonPayload_(reportId');
  assert.ok(iResolve >= 0 && iCanon >= 0 && iStringify >= 0 && iSave >= 0);
  assert.ok(iResolve < iCanon, 'resolve before canonicalize');
  assert.ok(iCanon < iStringify, 'canonicalize before stringify');
  assert.ok(iStringify < iSave, 'stringify before saveJsonPayload');
});

test('GAS wrapper usa RsdStructuralIdentity.resolveStructuralIdentity', function () {
  const src = fs.readFileSync(path.join(__dirname, '..', 'apps_script_v10.gs'), 'utf8');
  assert.ok(src.indexOf('RsdStructuralIdentity.resolveStructuralIdentity') >= 0);
  assert.ok(src.indexOf('audit-rsd-structural-identity-global') < 0);
});

test('rsdUpsert_ usa ScriptLock (race draft×finalize)', function () {
  const src = fs.readFileSync(path.join(__dirname, '..', 'apps_script_v10.gs'), 'utf8');
  const start = src.indexOf('function rsdUpsert_');
  const end = src.indexOf('\nfunction rsdListDateSet_', start);
  const fn = src.slice(start, end > start ? end : start + 5000);
  assert.ok(fn.indexOf('LockService.getScriptLock()') >= 0);
  assert.ok(fn.indexOf('rsdResolveStructuralIdentity_') < fn.indexOf('JSON.stringify(r)'));
  assert.ok(fn.indexOf('rsdApplyCanonicalIdentityToPayload_') < fn.indexOf('saveJsonPayload_'));
});

console.log('\nPASSED', passed);
