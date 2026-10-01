'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const R = require('../rco_selective_date_recovery.js');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('OK', name);
}

const PILOT_LIVE = {
  reportId: 'cpu-7372448b-84ba-4b49-89f2-2248144f7b07',
  draft: {
    RCO_REPORT_ID: 'cpu-7372448b-84ba-4b49-89f2-2248144f7b07',
    STATUS: 'EM_ANDAMENTO',
    BATALHAO: 'BPTran',
    COMPANHIA: '1ª CPTran',
    DATA_SERVICO: '"2026-10-01T03:00:00.000Z"',
    REVISAO: 2,
    PAYLOAD_HASH: 'abc',
    PAYLOAD_FILE_ID: 'file-1',
    ULTIMO_SYNC_EM: '2026-10-01T15:00:00.000Z',
    ATUALIZADO_EM: '2026-10-01T15:00:00.000Z',
    EDIT_DEVICE_ID: '',
    EDIT_LEASE_UNTIL: ''
  },
  payload: {
    state: { reportId: 'cpu-7372448b-84ba-4b49-89f2-2248144f7b07' },
    unidade: { batalhao: 'BPTran', companhia: '1ª CPTran' },
    periodo: { inicio: '2026-10-01', termino: '2026-10-02' }
  },
  rco: {
    REPORT_ID: 'cpu-7372448b-84ba-4b49-89f2-2248144f7b07',
    DATA_SERVICO: '2026-10-01',
    BATALHAO: 'BPTran',
    COMPANHIA: '1ª CPTran',
    VERSAO: 1,
    STATUS: 'ATIVO'
  }
};

test('dry-run piloto SAFE_TO_APPLY', function () {
  const out = R.dryRun(PILOT_LIVE, { nowMs: Date.parse('2026-10-01T16:00:00.000Z') });
  assert.strictEqual(out.mutatedProductionRows, false);
  assert.strictEqual(out.safeToApply, true);
  assert.strictEqual(out.manifest.expectedDate, '2026-10-01');
  assert.strictEqual(out.manifest.proposedPatch.to, '2026-10-01');
  assert.strictEqual(out.manifest.proposedPatch.from, '"2026-10-01T03:00:00.000Z"');
  assert.strictEqual(out.manifest.proposedPatch.field, 'DATA_SERVICO');
  assert.deepStrictEqual(out.blockingReasons, []);
});

test('ACTIVE_EDIT_RISK não bloqueia dry-run mas flagga', function () {
  const live = JSON.parse(JSON.stringify(PILOT_LIVE));
  live.draft.EDIT_DEVICE_ID = 'dev-x';
  live.draft.EDIT_LEASE_UNTIL = '2026-10-01T16:30:00.000Z';
  const out = R.dryRun(live, { nowMs: Date.parse('2026-10-01T16:00:00.000Z') });
  assert.strictEqual(out.activeEditRisk, true);
  assert.strictEqual(out.safeToApply, true); // apply automático futuro deve reler; dry-run ok
  assert.ok(out.manifest.riskFlags.indexOf('ACTIVE_EDIT_RISK') >= 0);
});

test('identity mismatch → SAFE_TO_APPLY false', function () {
  const live = JSON.parse(JSON.stringify(PILOT_LIVE));
  live.rco.REPORT_ID = 'cpu-other';
  const out = R.dryRun(live);
  assert.strictEqual(out.safeToApply, false);
  assert.ok(out.blockingReasons.indexOf('IDENTITY_MISMATCH') >= 0);
});

test('date evidence mismatch → SAFE_TO_APPLY false', function () {
  const live = JSON.parse(JSON.stringify(PILOT_LIVE));
  live.payload.periodo.inicio = '2026-09-30';
  const out = R.dryRun(live);
  assert.strictEqual(out.safeToApply, false);
  assert.ok(out.blockingReasons.indexOf('DATE_EVIDENCE_MISMATCH') >= 0);
});

test('functional projection: dateText after patch', function () {
  assert.strictEqual(R.dateTextSim('"2026-10-01T03:00:00.000Z"'), '');
  assert.strictEqual(R.dateTextSim('2026-10-01'), '2026-10-01');
  const sim = R.simulatePostPatchDateText('2026-10-01');
  assert.strictEqual(sim.beforeQuoted, '');
  assert.strictEqual(sim.afterPatch, '2026-10-01');
  assert.strictEqual(sim.filterWouldMatch, true);
});

test('GAS: dry-run interno existe e NÃO está em actions públicas', function () {
  const src = fs.readFileSync(path.join(__dirname, '..', 'apps_script_v10.gs'), 'utf8');
  assert.ok(src.indexOf('function rcoSelectiveDateRecoveryDryRun_') >= 0);
  assert.ok(src.indexOf("CENTRAL_V10_VERSION = '10.8.38'") >= 0);
  assert.ok(src.indexOf('function rcoDraftPrepareRowForWrite_') >= 0);
  // não expor action pública
  assert.ok(src.indexOf("action === 'rco-selective-date-recovery") < 0);
  assert.ok(src.indexOf("action === 'rco-date-recovery") < 0);
  // dry-run não contém setValues/upsert de DATA_SERVICO no apply path (apply não existe ainda)
  const fn = src.slice(src.indexOf('function rcoSelectiveDateRecoveryDryRun_'));
  const body = fn.slice(0, fn.indexOf('\nfunction ', 10) > 0 ? fn.indexOf('\nfunction ', 10) : 4000);
  assert.ok(body.indexOf('setValues') < 0);
  assert.ok(body.indexOf('upsert_') < 0);
  assert.ok(body.indexOf('rcoDraftUpsertRow_') < 0);
});

console.log('\nPASSED', passed);
