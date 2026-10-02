'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const R = require('../rco_selective_date_recovery.js');

var passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('ok', name);
  } catch (e) {
    console.error('FAIL', name);
    console.error(e && e.stack || e);
    process.exitCode = 1;
  }
}

var TZ = 'America/Sao_Paulo';
var ID = R.CAUSAL_PILOT_REPORT_ID;

function baseLive(overrides) {
  overrides = overrides || {};
  var draft = Object.assign({
    RCO_REPORT_ID: ID,
    STATUS: 'EM_ANDAMENTO',
    BATALHAO: 'BPRv',
    COMPANHIA: '1ª CPRv',
    DATA_SERVICO: '"2026-09-28T03:00:00.000Z"',
    REVISAO: 1,
    PAYLOAD_HASH: 'hash-causal-pilot',
    PAYLOAD_FILE_ID: 'file1',
    EDIT_LEASE_UNTIL: '',
    EDIT_DEVICE_ID: ''
  }, overrides.draft || {});
  var payload = Object.assign({
    state: { reportId: ID },
    periodo: { inicio: '2026-09-28' },
    unidade: { batalhao: 'BPRv', companhia: '1ª CPRv' }
  }, overrides.payload || {});
  return {
    reportId: ID,
    draft: draft,
    payload: payload,
    rco: overrides.rco === undefined ? null : overrides.rco
  };
}

function baseDb(live) {
  return {
    drafts: { [ID]: live.draft },
    payloads: { [ID]: live.payload },
    rcos: {},
    snapshots: [],
    writes: [],
    audits: []
  };
}

test('CAUSAL_A_EQ_B_REQUIRED', function () {
  var live = baseLive({
    draft: { DATA_SERVICO: '"2026-10-01T03:00:00.000Z"' },
    payload: { state: { reportId: ID }, periodo: { inicio: '2026-09-28' }, unidade: { batalhao: 'BPRv', companhia: '1ª CPRv' } }
  });
  var v = R.validateCausalApplyPreconditions(live, { evidenceMode: R.EVIDENCE_MODE_CAUSAL, scriptTimezone: TZ });
  assert.strictEqual(v.ok, false);
  assert.ok(v.reasons.indexOf('A_NE_B') >= 0 || v.reasons.indexOf('A_NE_B_OR_NOT_CANONICAL') >= 0);
});

test('CAUSAL_C_MUST_BE_MISSING', function () {
  var live = baseLive({ rco: { REPORT_ID: ID, DATA_SERVICO: '2026-09-28' } });
  var v = R.validateCausalApplyPreconditions(live, { evidenceMode: R.EVIDENCE_MODE_CAUSAL, scriptTimezone: TZ });
  assert.strictEqual(v.ok, false);
  assert.ok(v.reasons.indexOf('C_MUST_BE_MISSING') >= 0);
});

test('CAUSAL_SIGNATURE_EXACT_MATCH_REQUIRED', function () {
  var live = baseLive({
    draft: { DATA_SERVICO: '"2026-09-28T00:00:00.000Z"' }
  });
  var v = R.validateCausalApplyPreconditions(live, { evidenceMode: R.EVIDENCE_MODE_CAUSAL, scriptTimezone: TZ });
  assert.strictEqual(v.ok, false);
  assert.ok(v.reasons.indexOf('ROOT_CAUSE_SIGNATURE_MISMATCH') >= 0);
});

test('CAUSAL_IDENTITY_REQUIRED', function () {
  var live = baseLive({
    payload: { state: { reportId: 'other-id' }, periodo: { inicio: '2026-09-28' }, unidade: { batalhao: 'BPRv', companhia: '1ª CPRv' } }
  });
  var v = R.validateCausalApplyPreconditions(live, { evidenceMode: R.EVIDENCE_MODE_CAUSAL, scriptTimezone: TZ });
  assert.strictEqual(v.ok, false);
  assert.ok(v.reasons.indexOf('IDENTITY_MISMATCH') >= 0);
});

test('CAUSAL_UNIT_REQUIRED', function () {
  var live = baseLive({
    payload: { state: { reportId: ID }, periodo: { inicio: '2026-09-28' }, unidade: { batalhao: 'BPTran', companhia: '1ª CPRv' } }
  });
  var v = R.validateCausalApplyPreconditions(live, { evidenceMode: R.EVIDENCE_MODE_CAUSAL, scriptTimezone: TZ });
  assert.strictEqual(v.ok, false);
  assert.ok(v.reasons.indexOf('UNIT_MISMATCH') >= 0);
});

test('CAUSAL_NO_ACTIVE_LEASE', function () {
  var live = baseLive({
    draft: { EDIT_LEASE_UNTIL: new Date(Date.now() + 3600000).toISOString() }
  });
  var v = R.validateCausalApplyPreconditions(live, { evidenceMode: R.EVIDENCE_MODE_CAUSAL, scriptTimezone: TZ });
  assert.strictEqual(v.ok, false);
  assert.ok(v.reasons.indexOf('ACTIVE_LEASE') >= 0);
});

test('CAUSAL_NO_CONTRADICTION', function () {
  var live = baseLive();
  var v = R.validateCausalApplyPreconditions(live, {
    evidenceMode: R.EVIDENCE_MODE_CAUSAL,
    scriptTimezone: TZ,
    contradictionDetails: ['RSD_DATE_NE_B:x:2026-09-27']
  });
  assert.strictEqual(v.ok, false);
  assert.ok(v.reasons.indexOf('CONTRADICTORY_EVIDENCE') >= 0);
});

test('CAUSAL_SCRIPT_TIMEZONE_EXPLICIT', function () {
  var live = baseLive();
  var v = R.validateCausalApplyPreconditions(live, { evidenceMode: R.EVIDENCE_MODE_CAUSAL });
  assert.strictEqual(v.ok, false);
  assert.ok(v.reasons.indexOf('SCRIPT_TIMEZONE_MISSING') >= 0);
  var noMode = R.validateCausalApplyPreconditions(live, { scriptTimezone: TZ });
  assert.strictEqual(noMode.ok, false);
  assert.ok(noMode.reasons.indexOf('EVIDENCE_MODE_NOT_CAUSAL_ROOT_SIGNATURE') >= 0);
});

test('CAUSAL_ONLY_DATA_SERVICO_WRITE', function () {
  var live = baseLive();
  var db = baseDb(live);
  var out = R.applyCausalSimulated(db, { evidenceMode: R.EVIDENCE_MODE_CAUSAL, scriptTimezone: TZ, reportId: ID });
  assert.strictEqual(out.ok, true);
  assert.deepStrictEqual(out.writeFields, ['DATA_SERVICO']);
  assert.strictEqual(db.writes.length, 1);
  assert.strictEqual(db.writes[0].field, 'DATA_SERVICO');
  assert.strictEqual(db.writes[0].to, '2026-09-28');
  assert.strictEqual(db.drafts[ID].REVISAO, 1);
  assert.strictEqual(db.drafts[ID].PAYLOAD_HASH, 'hash-causal-pilot');
});

test('CAUSAL_READBACK_REQUIRED', function () {
  var live = baseLive();
  var db = baseDb(live);
  var out = R.applyCausalSimulated(db, {
    evidenceMode: R.EVIDENCE_MODE_CAUSAL,
    scriptTimezone: TZ,
    reportId: ID,
    injectSideEffect: function (row) { row.STATUS = 'TAMPERED'; }
  });
  assert.strictEqual(out.ok, false);
  assert.strictEqual(out.code, 'READBACK_FAILED');
  assert.ok(out.unexpectedChangedFields.indexOf('STATUS') >= 0);
});

test('CAUSAL_IDEMPOTENT_SECOND_RUN', function () {
  var live = baseLive();
  var db = baseDb(live);
  var a = R.applyCausalSimulated(db, { evidenceMode: R.EVIDENCE_MODE_CAUSAL, scriptTimezone: TZ, reportId: ID });
  assert.strictEqual(a.ok, true);
  assert.strictEqual(a.mutatedDraftRow, true);
  var snaps = db.snapshots.length;
  var audits = db.audits.length;
  var b = R.applyCausalSimulated(db, { evidenceMode: R.EVIDENCE_MODE_CAUSAL, scriptTimezone: TZ, reportId: ID });
  assert.strictEqual(b.ok, true);
  assert.strictEqual(b.alreadyRecovered, true);
  assert.strictEqual(b.idempotent, true);
  assert.strictEqual(b.mutatedDraftRow, false);
  assert.strictEqual(db.snapshots.length, snaps);
  assert.strictEqual(db.audits.length, audits);
});

test('CAUSAL_AMBIGUOUS_BLOCKED', function () {
  var live = baseLive({
    draft: { DATA_SERVICO: '"2026-10-01T03:00:00.000Z"' },
    payload: { state: { reportId: ID }, periodo: { inicio: '2026-09-30' }, unidade: { batalhao: 'BPRv', companhia: '1ª CPRv' } }
  });
  var out = R.applyCausalSimulated(baseDb(live), { evidenceMode: R.EVIDENCE_MODE_CAUSAL, scriptTimezone: TZ, reportId: ID });
  assert.strictEqual(out.ok, false);
  assert.strictEqual(out.mutatedDraftRow, false);
  assert.strictEqual(out.snapshotCreated, false);
});

test('GAS: caminho causal dedicado; requireAbc padrão intacto; action pública só TEMP', function () {
  const src = fs.readFileSync(path.join(__dirname, '..', 'apps_script_v10.gs'), 'utf8');
  assert.ok(src.indexOf('function rcoSelectiveDateRecoveryCausalApply_') >= 0);
  assert.ok(src.indexOf('function rcoSelectiveDateRecoveryCausalApplyPilotFase7a_') >= 0);
  assert.ok(src.indexOf('CAUSAL_ROOT_SIGNATURE') >= 0);
  assert.ok(src.indexOf('RCO_DATE_CAUSAL_RECOVERY_APPLIED') >= 0);
  assert.ok(src.indexOf("cpu-5e000c43-ef9c-4c90-82ea-7bfeaea08f63") >= 0);
  // requireAbc path still present for ABC recovery
  assert.ok(src.indexOf('requireAbc') >= 0);
  assert.ok(src.indexOf('function rcoSelectiveDateRecoveryApply_') >= 0);
  if (!process.env.ALLOW_TEMP_FASE7A_ACTION) {
    assert.ok(src.indexOf("action === 'audit-rco-selective-date-recovery-causal-apply-pilot'") < 0);
  }
});

console.log('\nPASSED', passed);
