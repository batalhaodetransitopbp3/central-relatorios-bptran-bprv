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
    REVISAO: 1,
    PAYLOAD_HASH: 'a50dded450683ed9cf597ae8b9bacd71',
    PAYLOAD_FILE_ID: '',
    ULTIMO_SYNC_EM: '2026-10-01T13:52:23.882Z',
    ATUALIZADO_EM: '2026-10-01T15:35:57.673Z',
    EDIT_DEVICE_ID: '',
    EDIT_LEASE_UNTIL: '',
    P3_CONSOLIDADO: 'SIM',
    P3_CONSOLIDATE_INTEGRAL: 'SIM'
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

function seedDb(live) {
  const id = live.reportId;
  return {
    drafts: { [id]: JSON.parse(JSON.stringify(live.draft)) },
    payloads: { [id]: JSON.parse(JSON.stringify(live.payload)) },
    rcos: { [id]: JSON.parse(JSON.stringify(live.rco)) },
    snapshots: [],
    writes: []
  };
}

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
  assert.strictEqual(out.safeToApply, true);
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

test('APPLY exact preconditions PASS', function () {
  const v = R.validateApplyPreconditions(PILOT_LIVE, R.PILOT_APPLY_EXPECTED, {
    nowMs: Date.parse('2026-10-01T18:00:00.000Z')
  });
  assert.strictEqual(v.ok, true);
  assert.strictEqual(v.alreadyRecovered, false);
  assert.deepStrictEqual(v.reasons, []);
});

test('APPLY revision mismatch abort', function () {
  const live = JSON.parse(JSON.stringify(PILOT_LIVE));
  live.draft.REVISAO = 2;
  const v = R.validateApplyPreconditions(live, R.PILOT_APPLY_EXPECTED);
  assert.strictEqual(v.ok, false);
  assert.ok(v.reasons.indexOf('REVISION_MISMATCH') >= 0);
});

test('APPLY hash mismatch abort', function () {
  const live = JSON.parse(JSON.stringify(PILOT_LIVE));
  live.draft.PAYLOAD_HASH = 'deadbeef';
  const v = R.validateApplyPreconditions(live, R.PILOT_APPLY_EXPECTED);
  assert.strictEqual(v.ok, false);
  assert.ok(v.reasons.indexOf('HASH_MISMATCH') >= 0);
});

test('APPLY raw date mismatch abort', function () {
  const live = JSON.parse(JSON.stringify(PILOT_LIVE));
  live.draft.DATA_SERVICO = '"2026-09-30T03:00:00.000Z"';
  const v = R.validateApplyPreconditions(live, R.PILOT_APPLY_EXPECTED);
  assert.strictEqual(v.ok, false);
  assert.ok(v.reasons.indexOf('RAW_DATE_MISMATCH') >= 0 || v.reasons.indexOf('DATE_EVIDENCE_MISMATCH') >= 0);
});

test('APPLY active lease abort (BLOCKING)', function () {
  const live = JSON.parse(JSON.stringify(PILOT_LIVE));
  live.draft.EDIT_LEASE_UNTIL = '2026-10-01T19:00:00.000Z';
  const v = R.validateApplyPreconditions(live, R.PILOT_APPLY_EXPECTED, {
    nowMs: Date.parse('2026-10-01T18:00:00.000Z')
  });
  assert.strictEqual(v.ok, false);
  assert.ok(v.reasons.indexOf('ACTIVE_EDIT_RISK') >= 0);
});

test('APPLY identity mismatch abort', function () {
  const live = JSON.parse(JSON.stringify(PILOT_LIVE));
  live.payload.state.reportId = 'cpu-other';
  const v = R.validateApplyPreconditions(live, R.PILOT_APPLY_EXPECTED);
  assert.strictEqual(v.ok, false);
  assert.ok(v.reasons.indexOf('IDENTITY_MISMATCH') >= 0 || v.reasons.indexOf('PAYLOAD_STATE_REPORT_ID_MISMATCH') >= 0);
});

test('APPLY date evidence mismatch abort', function () {
  const live = JSON.parse(JSON.stringify(PILOT_LIVE));
  live.rco.DATA_SERVICO = '2026-09-30';
  const v = R.validateApplyPreconditions(live, R.PILOT_APPLY_EXPECTED);
  assert.strictEqual(v.ok, false);
  assert.ok(v.reasons.indexOf('RCO_DATE_MISMATCH') >= 0 || v.reasons.indexOf('DATE_EVIDENCE_MISMATCH') >= 0);
});

test('APPLY one-field-only + snapshot-before-write + read-back', function () {
  const db = seedDb(PILOT_LIVE);
  const out = R.applySimulated(db, R.PILOT_APPLY_EXPECTED, {
    nowMs: Date.parse('2026-10-01T18:00:00.000Z')
  });
  assert.strictEqual(out.ok, true);
  assert.strictEqual(out.mutated, true);
  assert.deepStrictEqual(out.writeFields, ['DATA_SERVICO']);
  assert.strictEqual(out.snapshotCreated, true);
  assert.ok(db.snapshots.length === 1);
  assert.strictEqual(db.snapshots[0].kind, 'PRE_RCO_DATE_RECOVERY');
  assert.strictEqual(db.snapshots[0].before, '"2026-10-01T03:00:00.000Z"');
  assert.strictEqual(out.postApply.DATA_SERVICO, '2026-10-01');
  assert.strictEqual(out.postApply.REVISAO, 1);
  assert.strictEqual(out.postApply.PAYLOAD_HASH, 'a50dded450683ed9cf597ae8b9bacd71');
  assert.strictEqual(out.postApply.STATUS, 'EM_ANDAMENTO');
  assert.deepStrictEqual(out.otherFieldsChanged, []);
  assert.strictEqual(db.drafts[R.PILOT_APPLY_EXPECTED.reportId].DATA_SERVICO, '2026-10-01');
});

test('APPLY idempotent second execution', function () {
  const db = seedDb(PILOT_LIVE);
  const first = R.applySimulated(db, R.PILOT_APPLY_EXPECTED, {
    nowMs: Date.parse('2026-10-01T18:00:00.000Z')
  });
  assert.strictEqual(first.mutated, true);
  const second = R.applySimulated(db, R.PILOT_APPLY_EXPECTED, {
    nowMs: Date.parse('2026-10-01T18:00:00.000Z')
  });
  assert.strictEqual(second.ok, true);
  assert.strictEqual(second.alreadyRecovered, true);
  assert.strictEqual(second.idempotent, true);
  assert.strictEqual(second.mutated, false);
  assert.strictEqual(db.writes.length, 1);
  assert.strictEqual(db.snapshots.length, 1);
});

test('APPLY idempotent quando DATA_SERVICO já é Date canônica', function () {
  const live = JSON.parse(JSON.stringify(PILOT_LIVE));
  live.draft.DATA_SERVICO = new Date(2026, 9, 1, 0, 0, 0, 0);
  const v = R.validateApplyPreconditions(live, R.PILOT_APPLY_EXPECTED, {
    nowMs: Date.parse('2026-10-01T18:00:00.000Z')
  });
  assert.strictEqual(v.ok, true);
  assert.strictEqual(v.alreadyRecovered, true);
});

test('APPLY aborts with zero writes on precondition fail', function () {
  const db = seedDb(PILOT_LIVE);
  db.drafts[R.PILOT_APPLY_EXPECTED.reportId].REVISAO = 9;
  const out = R.applySimulated(db, R.PILOT_APPLY_EXPECTED);
  assert.strictEqual(out.ok, false);
  assert.strictEqual(out.aborted, true);
  assert.strictEqual(out.mutated, false);
  assert.strictEqual(db.writes.length, 0);
  assert.strictEqual(db.snapshots.length, 0);
  assert.strictEqual(db.drafts[R.PILOT_APPLY_EXPECTED.reportId].DATA_SERVICO, '"2026-10-01T03:00:00.000Z"');
});

test('GAS: apply interno existe e NÃO está em actions públicas', function () {
  const src = fs.readFileSync(path.join(__dirname, '..', 'apps_script_v10.gs'), 'utf8');
  assert.ok(src.indexOf('function rcoSelectiveDateRecoveryApply_') >= 0);
  assert.ok(src.indexOf('function rcoSelectiveDateRecoveryApplyPilot_') >= 0);
  assert.ok(src.indexOf("CENTRAL_V10_VERSION = '10.8.38'") >= 0);
  assert.ok(src.indexOf('function rcoDraftPrepareRowForWrite_') >= 0);
  assert.ok(src.indexOf("action === 'rco-selective-date-recovery") < 0);
  assert.ok(src.indexOf("action === 'rco-date-recovery") < 0);
  assert.ok(src.indexOf("action === 'audit-rco-selective-date-recovery-apply-pilot'") < 0);
  assert.ok(src.indexOf('RCO_DATE_RECOVERY_APPLIED') >= 0);
  assert.ok(src.indexOf('PRE_RCO_DATE_RECOVERY') >= 0);
  assert.ok(src.indexOf("getRange(rowNum,col+1).setValue") >= 0);
  // dry-run ainda sem write
  const dry = src.slice(src.indexOf('function rcoSelectiveDateRecoveryDryRun_'), src.indexOf('function rcoSelectiveDateRecoveryApplyPilot_'));
  assert.ok(dry.indexOf('setValue') < 0);
});

console.log('\nPASSED', passed);
