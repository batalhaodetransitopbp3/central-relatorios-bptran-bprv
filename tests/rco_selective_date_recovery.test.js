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
    writes: [],
    audits: []
  };
}

function recoveredLive(mutator) {
  const live = JSON.parse(JSON.stringify(PILOT_LIVE));
  live.draft.DATA_SERVICO = '2026-10-01';
  if (mutator) mutator(live);
  return live;
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
  assert.strictEqual(out.mutatedDraftRow, true);
  assert.strictEqual(out.mutatedProductionRows, false);
  assert.deepStrictEqual(out.writeFields, ['DATA_SERVICO']);
  assert.strictEqual(out.snapshotCreated, true);
  assert.ok(db.snapshots.length === 1);
  assert.strictEqual(db.snapshots[0].kind, 'PRE_RCO_DATE_RECOVERY');
  assert.strictEqual(db.snapshots[0].before, '"2026-10-01T03:00:00.000Z"');
  assert.strictEqual(out.postApply.DATA_SERVICO, '2026-10-01');
  assert.strictEqual(out.postApply.REVISAO, 1);
  assert.strictEqual(out.postApply.PAYLOAD_HASH, 'a50dded450683ed9cf597ae8b9bacd71');
  assert.strictEqual(out.postApply.STATUS, 'EM_ANDAMENTO');
  assert.strictEqual(out.otherFieldsChanged, false);
  assert.deepStrictEqual(out.unexpectedChangedFields, []);
  assert.strictEqual(out.auditEvent, 'RCO_DATE_RECOVERY_APPLIED');
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
  assert.strictEqual(second.mutatedDraftRow, false);
  assert.strictEqual(second.mutatedProductionRows, false);
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
  assert.strictEqual(v.idempotent, true);
  assert.strictEqual(v.safety, 'SAFE');
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

test('TEST_IDEMPOTENT_REQUIRES_CURRENT_REVISION', function () {
  const live = recoveredLive(function (l) { l.draft.REVISAO = 3; });
  const v = R.validateApplyPreconditions(live, R.PILOT_APPLY_EXPECTED);
  assert.strictEqual(v.alreadyRecovered, true);
  assert.strictEqual(v.ok, false);
  assert.strictEqual(v.idempotent, false);
  assert.strictEqual(v.staleManifest, true);
  assert.strictEqual(v.code, 'ALREADY_RECOVERED_BUT_STATE_CHANGED');
  assert.strictEqual(v.safety, 'UNSAFE');
  assert.ok(v.reasons.indexOf('REVISION_MISMATCH') >= 0);
  const db = seedDb(live);
  const out = R.applySimulated(db, R.PILOT_APPLY_EXPECTED);
  assert.strictEqual(out.ok, false);
  assert.strictEqual(out.staleManifest, true);
  assert.strictEqual(db.writes.length, 0);
});

test('TEST_IDEMPOTENT_REQUIRES_CURRENT_HASH', function () {
  const live = recoveredLive(function (l) { l.draft.PAYLOAD_HASH = 'changedhash000'; });
  const v = R.validateApplyPreconditions(live, R.PILOT_APPLY_EXPECTED);
  assert.strictEqual(v.alreadyRecovered, true);
  assert.strictEqual(v.ok, false);
  assert.strictEqual(v.code, 'ALREADY_RECOVERED_BUT_STATE_CHANGED');
  assert.strictEqual(v.safety, 'UNSAFE');
  assert.ok(v.reasons.indexOf('HASH_MISMATCH') >= 0);
});

test('TEST_IDEMPOTENT_REQUIRES_CURRENT_STATUS', function () {
  const live = recoveredLive(function (l) { l.draft.STATUS = 'ENCERRADO'; });
  const v = R.validateApplyPreconditions(live, R.PILOT_APPLY_EXPECTED);
  assert.strictEqual(v.alreadyRecovered, true);
  assert.strictEqual(v.ok, false);
  assert.strictEqual(v.code, 'ALREADY_RECOVERED_BUT_STATE_CHANGED');
  assert.strictEqual(v.safety, 'UNSAFE');
  assert.ok(v.reasons.indexOf('STATUS_MISMATCH') >= 0);
});

test('TEST_ONLY_DATA_SERVICO_CHANGED', function () {
  const db = seedDb(PILOT_LIVE);
  const out = R.applySimulated(db, R.PILOT_APPLY_EXPECTED);
  assert.strictEqual(out.ok, true);
  assert.strictEqual(out.otherFieldsChanged, false);
  assert.deepStrictEqual(out.unexpectedChangedFields, []);
  assert.deepStrictEqual(out.writeFields, ['DATA_SERVICO']);
});

test('TEST_UNEXPECTED_FIELD_DIFF_DETECTED', function () {
  const db = seedDb(PILOT_LIVE);
  const out = R.applySimulated(db, R.PILOT_APPLY_EXPECTED, {
    injectSideEffect: function (row) { row.STATUS = 'HACKED'; }
  });
  assert.strictEqual(out.ok, false);
  assert.strictEqual(out.readBackOk, false);
  assert.strictEqual(out.otherFieldsChanged, true);
  assert.ok(out.unexpectedChangedFields.indexOf('STATUS') >= 0);
  assert.strictEqual(out.auditEvent, 'RCO_DATE_RECOVERY_READBACK_FAILED');
  assert.ok(db.audits.some(function (a) { return a.event === 'RCO_DATE_RECOVERY_READBACK_FAILED'; }));
  assert.ok(!db.audits.some(function (a) { return a.event === 'RCO_DATE_RECOVERY_APPLIED'; }));
});

test('TEST_READBACK_FAILURE_NOT_APPLIED', function () {
  const db = seedDb(PILOT_LIVE);
  const out = R.applySimulated(db, R.PILOT_APPLY_EXPECTED, {
    simulateReadbackFail: '"2026-10-01T03:00:00.000Z"'
  });
  assert.strictEqual(out.ok, false);
  assert.strictEqual(out.readBackOk, false);
  assert.strictEqual(out.auditEvent, 'RCO_DATE_RECOVERY_READBACK_FAILED');
  assert.ok(db.audits.some(function (a) { return a.event === 'RCO_DATE_RECOVERY_READBACK_FAILED'; }));
  assert.ok(!db.audits.some(function (a) { return a.event === 'RCO_DATE_RECOVERY_APPLIED'; }));
  assert.strictEqual(out.mutatedDraftRow, true);
  assert.strictEqual(out.mutatedProductionRows, false);
});

test('TEST_MUTATED_PRODUCTION_ROWS_FALSE', function () {
  const db = seedDb(PILOT_LIVE);
  const out = R.applySimulated(db, R.PILOT_APPLY_EXPECTED);
  assert.strictEqual(out.ok, true);
  assert.strictEqual(out.mutatedDraftRow, true);
  assert.strictEqual(out.mutatedProductionRows, false);
});

test('TEST_RCO_SNAPSHOT_FOLDER', function () {
  const db = seedDb(PILOT_LIVE);
  const out = R.applySimulated(db, R.PILOT_APPLY_EXPECTED);
  assert.strictEqual(out.snapshotFolder, 'Central RCO - Recovery Snapshots');
  assert.strictEqual(db.snapshots[0].folderProp, 'RCO_RECOVERY_SNAPSHOT_FOLDER_ID');
  assert.strictEqual(db.snapshots[0].folderName, 'Central RCO - Recovery Snapshots');
  const src = fs.readFileSync(path.join(__dirname, '..', 'apps_script_v10.gs'), 'utf8');
  const applySrc = src.slice(src.indexOf('function rcoSelectiveDateRecoveryApply_'));
  assert.ok(applySrc.indexOf("folderFor_('RCO_RECOVERY_SNAPSHOT_FOLDER_ID','Central RCO - Recovery Snapshots')") >= 0);
  assert.ok(applySrc.indexOf("folderFor_('RSD_RECOVERY_SNAPSHOT_FOLDER_ID'") < 0);
  assert.ok(src.indexOf('RCO_DATE_RECOVERY_READBACK_FAILED') >= 0);
});

test('TEST_BUILD_EXPECTED_FROM_LIVE_ABC', function () {
  const live = JSON.parse(JSON.stringify(PILOT_LIVE));
  live.draft.STATUS = 'EM_ANDAMENTO';
  const built = R.buildExpectedFromLive(live);
  assert.strictEqual(built.ok, true);
  assert.strictEqual(built.abcParity, true);
  assert.strictEqual(built.expected.expectedDate, '2026-10-01');
  assert.strictEqual(built.expected.revisao, 1);
  assert.strictEqual(built.expected.payloadHash, 'a50dded450683ed9cf597ae8b9bacd71');
});

test('TEST_SERIAL_STOPS_ON_FIRST_FAILURE', function () {
  const a = JSON.parse(JSON.stringify(PILOT_LIVE));
  a.reportId = 'cpu-serial-a';
  a.draft.RCO_REPORT_ID = 'cpu-serial-a';
  a.payload.state.reportId = 'cpu-serial-a';
  a.rco.REPORT_ID = 'cpu-serial-a';
  const b = JSON.parse(JSON.stringify(PILOT_LIVE));
  b.reportId = 'cpu-serial-b';
  b.draft.RCO_REPORT_ID = 'cpu-serial-b';
  b.payload.state.reportId = 'cpu-serial-b';
  b.rco.REPORT_ID = 'cpu-serial-b';
  b.draft.DATA_SERVICO = '"2026-09-30T03:00:00.000Z"';
  b.payload.periodo.inicio = '2026-09-29'; // A≠B → abort
  b.rco.DATA_SERVICO = '2026-09-29';
  const db = {
    drafts: { 'cpu-serial-a': a.draft, 'cpu-serial-b': b.draft },
    payloads: { 'cpu-serial-a': a.payload, 'cpu-serial-b': b.payload },
    rcos: { 'cpu-serial-a': a.rco, 'cpu-serial-b': b.rco },
    snapshots: [],
    writes: [],
    audits: []
  };
  // break first so serial stops before second
  db.drafts['cpu-serial-a'].EDIT_LEASE_UNTIL = '2099-01-01T00:00:00.000Z';
  const out = R.applySerialActiveAbc(db, ['cpu-serial-a', 'cpu-serial-b'], {
    nowMs: Date.parse('2026-10-01T18:00:00.000Z')
  });
  assert.strictEqual(out.ok, false);
  assert.strictEqual(out.serialSequenceCompleted, false);
  assert.strictEqual(out.abortedReportId, 'cpu-serial-a');
  assert.ok(String(out.abortReason).indexOf('ACTIVE_EDIT_RISK') >= 0);
  assert.strictEqual(db.writes.length, 0);
  assert.strictEqual(db.drafts['cpu-serial-b'].DATA_SERVICO, '"2026-09-30T03:00:00.000Z"');
});

test('TEST_REQUIRE_FINALIZED_ABORTS_ACTIVE', function () {
  const live = JSON.parse(JSON.stringify(PILOT_LIVE));
  live.draft.STATUS = 'EM_ANDAMENTO';
  const built = R.buildExpectedFromLive(live, { requireActive: false, requireFinalized: true });
  assert.strictEqual(built.ok, false);
  assert.ok(built.reasons.indexOf('STATUS_MISMATCH') >= 0);
});

test('TEST_REQUIRE_FINALIZED_ACCEPTS_FINALIZADO_ABC', function () {
  const live = JSON.parse(JSON.stringify(PILOT_LIVE));
  live.draft.STATUS = 'FINALIZADO';
  const built = R.buildExpectedFromLive(live, { requireActive: false, requireFinalized: true });
  assert.strictEqual(built.ok, true);
  assert.strictEqual(built.expected.status, 'FINALIZADO');
  assert.strictEqual(built.abcParity, true);
});

test('TEST_SERIAL_SUCCESS_ACTIVE_ABC', function () {
  const mk = function (id, ymd) {
    const live = JSON.parse(JSON.stringify(PILOT_LIVE));
    live.reportId = id;
    live.draft.RCO_REPORT_ID = id;
    live.draft.DATA_SERVICO = '"' + ymd + 'T03:00:00.000Z"';
    live.draft.STATUS = 'EM_ANDAMENTO';
    live.payload.state.reportId = id;
    live.payload.periodo.inicio = ymd;
    live.rco.REPORT_ID = id;
    live.rco.DATA_SERVICO = ymd;
    return live;
  };
  const a = mk('cpu-serial-ok-1', '2026-09-30');
  const b = mk('cpu-serial-ok-2', '2026-09-29');
  const db = {
    drafts: { 'cpu-serial-ok-1': a.draft, 'cpu-serial-ok-2': b.draft },
    payloads: { 'cpu-serial-ok-1': a.payload, 'cpu-serial-ok-2': b.payload },
    rcos: { 'cpu-serial-ok-1': a.rco, 'cpu-serial-ok-2': b.rco },
    snapshots: [],
    writes: [],
    audits: []
  };
  const out = R.applySerialActiveAbc(db, ['cpu-serial-ok-1', 'cpu-serial-ok-2']);
  assert.strictEqual(out.ok, true);
  assert.strictEqual(out.serialSequenceCompleted, true);
  assert.deepStrictEqual(out.recoveredReportIds, ['cpu-serial-ok-1', 'cpu-serial-ok-2']);
  assert.strictEqual(db.drafts['cpu-serial-ok-1'].DATA_SERVICO, '2026-09-30');
  assert.strictEqual(db.drafts['cpu-serial-ok-2'].DATA_SERVICO, '2026-09-29');
  assert.strictEqual(db.snapshots.length, 2);
});

test('GAS: apply interno existe e NÃO está em actions públicas', function () {
  const src = fs.readFileSync(path.join(__dirname, '..', 'apps_script_v10.gs'), 'utf8');
  assert.ok(src.indexOf('function rcoSelectiveDateRecoveryApply_') >= 0);
  assert.ok(src.indexOf('function rcoSelectiveDateRecoveryApplyPilot_') >= 0);
  assert.ok(src.indexOf('function rcoSelectiveDateRecoveryApplyActiveAbcSerialFase3_') >= 0);
  assert.ok(src.indexOf('function auditRcoActiveAbMissingForensicRo_') >= 0);
  assert.ok(src.indexOf('function auditRcoActiveAbCausalSignatureRo_') >= 0);
  assert.ok(src.indexOf('function rcoSelectiveDateRecoveryCausalApply_') >= 0);
  assert.ok(src.indexOf('function rcoSelectiveDateRecoveryCausalApplyPilotFase7a_') >= 0);
  assert.ok(src.indexOf('function rcoSelectiveDateRecoveryCausalApplySerialFase7b_') >= 0);
  assert.ok(src.indexOf('function rcoSelectiveDateRecoveryApplyFinalizedAbcSerialFase5_') >= 0);
  assert.ok(src.indexOf('requireFinalized') >= 0);
  assert.ok(src.indexOf("CENTRAL_V10_VERSION = '10.8.38'") >= 0);
  assert.ok(src.indexOf('function rcoDraftPrepareRowForWrite_') >= 0);
  assert.ok(src.indexOf("action === 'rco-selective-date-recovery") < 0);
  assert.ok(src.indexOf("action === 'rco-date-recovery") < 0);
  assert.ok(src.indexOf("action === 'audit-rco-selective-date-recovery-apply-pilot'") < 0);
  // Harness TEMP pode existir durante execução (ALLOW_TEMP_SERIAL_ACTION=1).
  // Commit final deve remover a action pública.
  if (!process.env.ALLOW_TEMP_SERIAL_ACTION) {
    assert.ok(src.indexOf("action === 'audit-rco-selective-date-recovery-apply-active-abc-serial'") < 0);
  }
  if (!process.env.ALLOW_TEMP_FORENSIC_ACTION) {
    assert.ok(src.indexOf("action === 'audit-rco-active-ab-missing-forensic-ro'") < 0);
  }
  if (!process.env.ALLOW_TEMP_FASE5_ACTION) {
    assert.ok(src.indexOf("action === 'audit-rco-selective-date-recovery-apply-finalized-abc-serial'") < 0);
  }
  if (!process.env.ALLOW_TEMP_FASE6_ACTION) {
    assert.ok(src.indexOf("action === 'audit-rco-active-ab-causal-signature-ro'") < 0);
  }
  if (!process.env.ALLOW_TEMP_FASE7A_ACTION) {
    assert.ok(src.indexOf("action === 'audit-rco-selective-date-recovery-causal-apply-pilot'") < 0);
  }
  if (!process.env.ALLOW_TEMP_FASE7B_ACTION) {
    assert.ok(src.indexOf("action === 'audit-rco-selective-date-recovery-causal-apply-serial'") < 0);
  }
  assert.ok(src.indexOf('RCO_DATE_RECOVERY_APPLIED') >= 0);
  assert.ok(src.indexOf('PRE_RCO_DATE_RECOVERY') >= 0);
  assert.ok(src.indexOf('rebuildFromLive') >= 0);
  assert.ok(src.indexOf("getRange(rowNum,col+1).setValue") >= 0);
  assert.ok(src.indexOf('mutatedDraftRow:true') >= 0 || src.indexOf('mutatedDraftRow: true') >= 0 || src.indexOf('mutatedDraftRow:true') >= 0);
  assert.ok(src.indexOf("mutatedProductionRows:false") >= 0 || src.indexOf('mutatedProductionRows: false') >= 0);
  // dry-run ainda sem write
  const dry = src.slice(src.indexOf('function rcoSelectiveDateRecoveryDryRun_'), src.indexOf('function rcoSelectiveDateRecoveryApplyPilot_'));
  assert.ok(dry.indexOf('setValue') < 0);
});

console.log('\nPASSED', passed);
