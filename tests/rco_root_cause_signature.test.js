'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const S = require('../rco_root_cause_signature.js');

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

test('RCO_TABLE_ROW_EXPECTED_BEFORE_CONSOLIDATION = false (código documentado)', function () {
  assert.strictEqual(S.RCO_TABLE_ROW_EXPECTED_BEFORE_CONSOLIDATION, false);
  const src = fs.readFileSync(path.join(__dirname, '..', 'apps_script_v10.gs'), 'utf8');
  assert.ok(src.indexOf('function rcoConsolidateFinal_') >= 0);
  assert.ok(src.indexOf("upsert_(rcoSheet,'REPORT_ID',reportId,obj)") >= 0);
  // Draft path writes RCO_RASCUNHOS, not aba RCO
  assert.ok(src.indexOf('function rcoDraftUpsertRow_') >= 0);
  assert.ok(src.indexOf("upsert_(s,'RCO_REPORT_ID'") >= 0);
});

test('positivo: YMD canônico → Date no TZ real → JSON.stringify = quoted-ISO conhecido', function () {
  var tz = 'America/Sao_Paulo';
  var ymd = '2026-09-30';
  var serialized = S.serializeBugQuotedIsoFromYmd(ymd, tz);
  assert.strictEqual(serialized, '"2026-09-30T03:00:00.000Z"');
  var match = S.rootCauseSignatureMatch('"2026-09-30T03:00:00.000Z"', ymd, tz);
  assert.strictEqual(match.ROOT_CAUSE_SIGNATURE_MATCH, true);
  assert.strictEqual(match.SERIALIZED_FROM_B, match.RAW_CORRUPTED);
  assert.strictEqual(match.SCRIPT_TIMEZONE, 'America/Sao_Paulo');
});

test('timezone explícito obrigatório (sem fallback silencioso)', function () {
  assert.throws(function () { S.serializeBugQuotedIsoFromYmd('2026-09-30'); }, /timezone/);
  assert.throws(function () { S.rootCauseSignatureMatch('"2026-09-30T03:00:00.000Z"', '2026-09-30'); }, /timezone/);
  assert.throws(function () {
    S.classifyCausalRecovery({
      STATUS: 'EM_ANDAMENTO',
      RAW_DATA_SERVICO: '"2026-09-30T03:00:00.000Z"',
      A_QUOTED_YMD: '2026-09-30',
      B_PAYLOAD_YMD: '2026-09-30',
      IDENTITY_PARITY: true,
      UNIT_PARITY: true
    });
  }, /timezone/);
});

test('negativo: YMD diferente', function () {
  var m = S.rootCauseSignatureMatch('"2026-09-30T03:00:00.000Z"', '2026-10-01', 'America/Sao_Paulo');
  assert.strictEqual(m.ROOT_CAUSE_SIGNATURE_MATCH, false);
  assert.strictEqual(m.SERIALIZED_FROM_B, '"2026-10-01T03:00:00.000Z"');
});

test('negativo: offset diferente (UTC meia-noite ≠ Sao_Paulo)', function () {
  var utcMidnight = new Date(Date.UTC(2026, 8, 30, 0, 0, 0, 0));
  var wrong = JSON.stringify(utcMidnight);
  assert.strictEqual(wrong, '"2026-09-30T00:00:00.000Z"');
  var m = S.rootCauseSignatureMatch(wrong, '2026-09-30', 'America/Sao_Paulo');
  assert.strictEqual(m.ROOT_CAUSE_SIGNATURE_MATCH, false);
});

test('negativo: raw truncado', function () {
  var m = S.rootCauseSignatureMatch('"2026-09-30T03:00:00.000"', '2026-09-30', 'America/Sao_Paulo');
  assert.strictEqual(m.ROOT_CAUSE_SIGNATURE_MATCH, false);
});

test('negativo: raw sem aspas', function () {
  var m = S.rootCauseSignatureMatch('2026-09-30T03:00:00.000Z', '2026-09-30', 'America/Sao_Paulo');
  assert.strictEqual(m.ROOT_CAUSE_SIGNATURE_MATCH, false);
  assert.strictEqual(S.isQuotedIsoDateToken('2026-09-30T03:00:00.000Z'), false);
});

test('negativo: dia civil diferente no ISO', function () {
  var m = S.rootCauseSignatureMatch('"2026-09-29T03:00:00.000Z"', '2026-09-30', 'America/Sao_Paulo');
  assert.strictEqual(m.ROOT_CAUSE_SIGNATURE_MATCH, false);
});

test('classifyCausalRecovery: candidato completo', function () {
  var out = S.classifyCausalRecovery({
    STATUS: 'EM_ANDAMENTO',
    RAW_DATA_SERVICO: '"2026-09-30T03:00:00.000Z"',
    A_QUOTED_YMD: '2026-09-30',
    B_PAYLOAD_YMD: '2026-09-30',
    C_RCO: '',
    SCRIPT_TIMEZONE: 'America/Sao_Paulo',
    IDENTITY_PARITY: true,
    UNIT_PARITY: true,
    ACTIVE_LEASE: false,
    CONTRADICTORY_EVIDENCE: false,
    CONTRADICTION_DETAILS: [],
    RCO_ROW_EXPECTED_AT_THIS_STAGE: false
  });
  assert.strictEqual(out.CLASSIFICATION, 'CAUSAL_RECOVERY_CANDIDATE');
  assert.strictEqual(out.PROPOSED_DATE, '2026-09-30');
});

test('classifyCausalRecovery: A≠B → AMBIGUOUS (não escolhe vencedor)', function () {
  var out = S.classifyCausalRecovery({
    STATUS: 'EM_ANDAMENTO',
    RAW_DATA_SERVICO: '"2026-10-01T03:00:00.000Z"',
    A_QUOTED_YMD: '2026-10-01',
    B_PAYLOAD_YMD: '2026-09-30',
    C_RCO: '',
    SCRIPT_TIMEZONE: 'America/Sao_Paulo',
    IDENTITY_PARITY: true,
    UNIT_PARITY: true,
    ACTIVE_LEASE: false,
    CONTRADICTORY_EVIDENCE: false,
    RCO_ROW_EXPECTED_AT_THIS_STAGE: false
  });
  assert.strictEqual(out.CLASSIFICATION, 'AMBIGUOUS');
  assert.strictEqual(out.PROPOSED_DATE, '');
});

test('classifyCausalRecovery: lease ativa → BLOCKED', function () {
  var out = S.classifyCausalRecovery({
    STATUS: 'EM_ANDAMENTO',
    RAW_DATA_SERVICO: '"2026-09-30T03:00:00.000Z"',
    A_QUOTED_YMD: '2026-09-30',
    B_PAYLOAD_YMD: '2026-09-30',
    C_RCO: '',
    SCRIPT_TIMEZONE: 'America/Sao_Paulo',
    IDENTITY_PARITY: true,
    UNIT_PARITY: true,
    ACTIVE_LEASE: true,
    CONTRADICTORY_EVIDENCE: false,
    RCO_ROW_EXPECTED_AT_THIS_STAGE: false
  });
  assert.strictEqual(out.CLASSIFICATION, 'CAUSAL_BLOCKED');
  assert.ok(out.blockReasons.indexOf('ACTIVE_LEASE') >= 0);
});

test('GAS: auditor causal RO + apply causal; actions públicas só via TEMP env', function () {
  const src = fs.readFileSync(path.join(__dirname, '..', 'apps_script_v10.gs'), 'utf8');
  assert.ok(src.indexOf('function auditRcoActiveAbCausalSignatureRo_') >= 0);
  assert.ok(src.indexOf('function rcoSelectiveDateRecoveryCausalApply_') >= 0);
  assert.ok(src.indexOf("evidenceMode === 'CAUSAL_ROOT_SIGNATURE'") >= 0 || src.indexOf('CAUSAL_ROOT_SIGNATURE') >= 0);
  assert.ok(src.indexOf('RCO_DATE_CAUSAL_RECOVERY_APPLIED') >= 0);
  assert.ok(src.indexOf('ROOT_CAUSE_SIGNATURE_MATCH') >= 0);
  assert.ok(src.indexOf('CAUSAL_RECOVERY_CANDIDATE') >= 0);
  assert.ok(src.indexOf('RCO_TABLE_ROW_EXPECTED_BEFORE_CONSOLIDATION') >= 0);
  if (!process.env.ALLOW_TEMP_FASE6_ACTION) {
    assert.ok(src.indexOf("action === 'audit-rco-active-ab-causal-signature-ro'") < 0);
  }
  if (!process.env.ALLOW_TEMP_FASE7A_ACTION) {
    assert.ok(src.indexOf("action === 'audit-rco-selective-date-recovery-causal-apply-pilot'") < 0);
  }
});

console.log('\nPASSED', passed);
