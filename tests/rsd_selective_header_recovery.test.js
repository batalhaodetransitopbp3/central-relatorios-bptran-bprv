'use strict';
/**
 * Fixtures 100% sintéticas — sem PII / IDs / hashes de produção.
 */
const assert = require('assert');
const crypto = require('crypto');
const recovery = require('../rsd_selective_header_recovery.js');
const hydration = require('../rsd_hydration_guard.js');
const localDiag = require('../rsd_local_draft_diag.js');

function md5(text) {
  return crypto.createHash('md5').update(String(text || ''), 'utf8').digest('hex');
}

function synthManifest(overrides) {
  const base = {
    reportId: 'sd-test-001',
    serviceId: 'svc-test-001',
    expectedDraftRevision: 4,
    expectedPayloadHash: 'hash-test-001',
    expectedVersao: 1,
    expectedStatus: 'EM_SERVICO',
    currentStatus: 'EM_SERVICO',
    recoveryStatus: 'LOCAL_DRAFT_RISK',
    recoveryBlockedDateVerification: false,
    activePeriodRecoveryCaution: false,
    neverFullRollback: false,
    fields: {
      'guarnicao.nome': {
        currentValue: '',
        proposedValue: 'BST TEST 01',
        source: 'FIXTURE',
        sourceRevision: '1',
        sourceTimestamp: '2026-01-01T00:00:00.000Z',
        confidence: 'CONFIRMADO'
      },
      'guarnicao.tipo': {
        currentValue: '',
        proposedValue: 'BST',
        source: 'FIXTURE',
        confidence: 'CONFIRMADO'
      },
      'guarnicao.ordem': {
        currentValue: '',
        proposedValue: 1,
        source: 'FIXTURE',
        confidence: 'CONFIRMADO'
      },
      'guarnicao.vtrPrincipal': {
        currentValue: '',
        proposedValue: '9999',
        source: 'FIXTURE',
        confidence: 'CONFIRMADO'
      },
      'guarnicao.efetivo': {
        currentValue: '',
        proposedValue: '02',
        source: 'FIXTURE',
        confidence: 'CONFIRMADO'
      },
      'guarnicao.responsavel': {
        currentValue: '',
        proposedValue: '3º SGT TESTE',
        source: 'FIXTURE',
        confidence: 'CONFIRMADO'
      },
      'guarnicao.matricula': {
        currentValue: '',
        proposedValue: '000.000-0',
        source: 'FIXTURE',
        confidence: 'CONFIRMADO'
      },
      'guarnicao.postoGrad': {
        currentValue: '',
        proposedValue: '3º SGT',
        source: 'FIXTURE',
        confidence: 'CONFIRMADO'
      }
    }
  };
  return Object.assign(base, overrides || {}, {
    fields: Object.assign({}, base.fields, (overrides && overrides.fields) || {})
  });
}

function basePayload(extras) {
  extras = extras || {};
  return {
    schema: 'pmpb-transito-servico-diario-v2',
    reportId: 'sd-test-001',
    serviceId: 'svc-test-001',
    draftRevision: 4,
    guarnicao: {
      nome: '', tipo: '', ordem: '', vtrPrincipal: '', viatura: '', viaturas: [],
      efetivo: '', responsavel: '', matricula: '', postoGrad: '', equipe: []
    },
    servico: {
      data: extras.servicoData != null ? extras.servicoData : '2026-01-10',
      operationalDate: extras.operationalDate
    },
    unidade: { batalhao: 'BPTran', companhia: '1ª CPTran' },
    ocorrencias: extras.ocorrencias || [],
    operacoes: extras.operacoes || [],
    producao: {},
    fisco: extras.fisco || { acionamentos: [] },
    observacoes: extras.observacoes || '',
    structuralDegraded: true
  };
}

function rowState(payload, overrides) {
  return Object.assign({
    reportId: 'sd-test-001',
    serviceId: 'svc-test-001',
    draftRevision: 4,
    payloadHash: 'hash-test-001',
    versao: 1,
    status: 'EM_SERVICO',
    dataServico: '2026-01-10',
    editDeviceId: 'dev-test-001',
    editLeaseUntil: '2026-01-01T00:00:00.000Z',
    payload: payload,
    payloadFileId: ''
  }, overrides || {});
}

function applyOpts(extra) {
  return Object.assign({
    mode: 'apply',
    skipEditorGate: true,
    snapshotOk: true,
    hashFn: md5,
    nowMs: Date.parse('2026-01-15T12:00:00.000Z')
  }, extra || {});
}

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('OK', name);
}

test('lease ACTIVE_EDIT_LEASE when EDIT_LEASE_UNTIL > now', function () {
  const c = recovery.classifyEditorState({
    editDeviceId: 'dev-test-001',
    editLeaseUntil: '2099-01-01T00:00:00.000Z',
    status: 'EM_SERVICO'
  }, Date.parse('2026-01-15T12:00:00.000Z'));
  assert.strictEqual(c.editorClass, 'ACTIVE_EDIT_LEASE');
  assert.strictEqual(c.recoveryAllowed, false);
});

test('STALE_DEVICE_MARKER + OPERATOR_RELEASE_REQUIRED when open status', function () {
  const c = recovery.classifyEditorState({
    editDeviceId: 'dev-test-001',
    editLeaseUntil: '2026-01-01T00:00:00.000Z',
    status: 'EM_SERVICO'
  }, Date.parse('2026-01-15T12:00:00.000Z'));
  assert.strictEqual(c.editorClass, 'STALE_DEVICE_MARKER');
  assert.strictEqual(c.operatorReleaseRequired, true);
  assert.strictEqual(c.recoveryAllowed, false);
});

test('ACTIVE_PERIOD keeps RECOVERY_ALLOWED=false', function () {
  const c = recovery.classifyEditorState({
    editDeviceId: 'dev-test-001',
    editLeaseUntil: '2026-01-01T00:00:00.000Z',
    status: 'EM_SERVICO',
    activePeriodRecoveryCaution: true
  }, Date.parse('2026-01-15T12:00:00.000Z'));
  assert.ok(c.blockers.indexOf('ACTIVE_PERIOD_RECOVERY_CAUTION') >= 0);
  assert.strictEqual(c.recoveryAllowed, false);
});

test('simple selective header recovery restores CONFIRMADO fields', function () {
  const manifest = synthManifest();
  const row = rowState(basePayload());
  const r = recovery.applySelectiveHeaderPatch(row, manifest, applyOpts());
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.code, 'HEADER_RECOVERY_APPLIED');
  assert.strictEqual(r.payload.guarnicao.nome, 'BST TEST 01');
  assert.strictEqual(r.payload.guarnicao.responsavel, '3º SGT TESTE');
  assert.strictEqual(r.payload.guarnicao.matricula, '000.000-0');
  assert.strictEqual(r.draftRevision, 5);
});

test('hydration after recovery → HYDRATED (not DEGRADED)', function () {
  const manifest = synthManifest();
  const r = recovery.applySelectiveHeaderPatch(rowState(basePayload()), manifest, applyOpts());
  const sheetFb = {
    nome: 'BST TEST 01', vtr: '9999', responsavel: '3º SGT TESTE', matricula: '000.000-0',
    data: '2026-01-10', batalhao: 'BPTran', companhia: '1ª CPTran'
  };
  assert.strictEqual(hydration.isDegradedPayload(r.payload, sheetFb), false);
  const g = hydration.create();
  g.markLoading();
  g.markHydrated(r.draftRevision);
  assert.strictEqual(g.getHydrationState(), 'HYDRATED');
});

test('DEGRADED_CLOUD_SYNC_BLOCKED: canScheduleCloudSync(DEGRADED)=false', function () {
  assert.strictEqual(hydration.canScheduleCloudSync('DEGRADED', 'IDLE'), false);
  assert.strictEqual(hydration.canScheduleCloudSync('HYDRATED', 'IDLE'), true);
  const g = hydration.create();
  g.markDegraded(4, { nome: 'X' });
  assert.strictEqual(g.getHydrationState(), 'DEGRADED');
  assert.strictEqual(g.canSync(), false);
});

test('DATA_SERVICO corrompida permanece byte-a-byte', function () {
  const corrupt = '"2026-01-1';
  const manifest = synthManifest();
  const payload = basePayload({ servicoData: '2026-01-10' });
  const row = rowState(payload, { dataServico: corrupt });
  const r = recovery.applySelectiveHeaderPatch(row, manifest, applyOpts());
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.dataServicoUnchanged, corrupt);
  assert.strictEqual(row.dataServico, corrupt);
  assert.strictEqual(r.payload.servico.data, '2026-01-10');
});

test('date conflict left untouched (no reconciliation)', function () {
  const manifest = synthManifest();
  const payload = basePayload({ servicoData: '2026-01-11', operationalDate: '2026-01-11' });
  const row = rowState(payload, { dataServico: '2026-01-09' });
  const r = recovery.applySelectiveHeaderPatch(row, manifest, applyOpts());
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.payload.servico.data, '2026-01-11');
  assert.strictEqual(r.payload.servico.operationalDate, '2026-01-11');
  assert.strictEqual(row.dataServico, '2026-01-09');
});

test('NEVER_FULL_ROLLBACK: ocorrência posterior preservada', function () {
  const occ = [{ id: 'oc-test-001', tipo: 'BST', nested: { a: 1 } }];
  const manifest = synthManifest({ neverFullRollback: true });
  const payload = basePayload({ ocorrencias: recovery.deepClone(occ) });
  const before = JSON.stringify(payload.ocorrencias);
  const r = recovery.applySelectiveHeaderPatch(rowState(payload), manifest, applyOpts());
  assert.strictEqual(r.ok, true);
  assert.strictEqual(JSON.stringify(r.payload.ocorrencias), before);
});

test('manifest recoveryStatus=BLOCKED recusa apply (genérico, sem ID real)', function () {
  const manifest = synthManifest({ recoveryStatus: 'BLOCKED' });
  const r = recovery.applySelectiveHeaderPatch(rowState(basePayload()), manifest, applyOpts());
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, 'BLOCKED');
});

test('manifest recoveryAllowed=false recusa apply', function () {
  const manifest = synthManifest({ recoveryAllowed: false });
  const r = recovery.applySelectiveHeaderPatch(rowState(basePayload()), manifest, applyOpts());
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, 'RECOVERY_NOT_ALLOWED');
});

test('RECOVERY_BLOCKED_DATE_VERIFICATION recusa apply', function () {
  const manifest = synthManifest({
    recoveryStatus: 'RECOVERY_BLOCKED_DATE_VERIFICATION',
    recoveryBlockedDateVerification: true
  });
  const r = recovery.applySelectiveHeaderPatch(rowState(basePayload()), manifest, applyOpts());
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, 'RECOVERY_BLOCKED_DATE_VERIFICATION');
});

test('revision mudou → RECOVERY_PRECONDITION_FAILED', function () {
  const row = rowState(basePayload(), { draftRevision: 99 });
  const r = recovery.applySelectiveHeaderPatch(row, synthManifest(), applyOpts());
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.detail, 'DRAFT_REVISION');
});

test('hash mudou → RECOVERY_PRECONDITION_FAILED', function () {
  const row = rowState(basePayload(), { payloadHash: 'hash-test-OTHER' });
  const r = recovery.applySelectiveHeaderPatch(row, synthManifest(), applyOpts());
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.detail, 'PAYLOAD_HASH');
});

test('serviceId mudou → RECOVERY_PRECONDITION_FAILED', function () {
  const row = rowState(basePayload(), { serviceId: 'svc-test-OTHER' });
  const r = recovery.applySelectiveHeaderPatch(row, synthManifest(), applyOpts());
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.detail, 'SERVICE_ID');
});

test('campo atual diferente/não vazio → FIELD_CONFLICT', function () {
  const payload = basePayload();
  payload.guarnicao.nome = 'OUTRA GUARNICAO TESTE';
  const r = recovery.applySelectiveHeaderPatch(rowState(payload), synthManifest(), applyOpts());
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, 'FIELD_CONFLICT');
});

test('segundo apply → NO_OP_ALREADY_RECOVERED', function () {
  const manifest = synthManifest();
  const r1 = recovery.applySelectiveHeaderPatch(rowState(basePayload()), manifest, applyOpts());
  assert.strictEqual(r1.ok, true);
  const manifest2 = recovery.deepClone(manifest);
  manifest2.expectedDraftRevision = r1.draftRevision;
  manifest2.expectedPayloadHash = r1.payloadHash;
  const row2 = rowState(r1.payload, {
    draftRevision: r1.draftRevision,
    payloadHash: r1.payloadHash
  });
  const r2 = recovery.applySelectiveHeaderPatch(row2, manifest2, applyOpts());
  assert.strictEqual(r2.code, 'NO_OP_ALREADY_RECOVERED');
  assert.strictEqual(r2.written, false);
});

test('path não permitido → abort', function () {
  const manifest = synthManifest();
  manifest.fields.ocorrencias = { proposedValue: [], confidence: 'CONFIRMADO' };
  const r = recovery.applySelectiveHeaderPatch(rowState(basePayload()), manifest, applyOpts());
  assert.strictEqual(r.ok, false);
  assert.ok(r.code === 'FORBIDDEN_PATH' || r.code === 'PATH_NOT_ALLOWLISTED');
});

test('dryRun inclui PRE_RECOVERY_SNAPSHOT sem escrita', function () {
  const r = recovery.applySelectiveHeaderPatch(rowState(basePayload()), synthManifest(), applyOpts({ mode: 'dryRun' }));
  assert.strictEqual(r.code, 'DRY_RUN_OK');
  assert.strictEqual(r.written, false);
  assert.strictEqual(r.preRecoverySnapshot.acao, 'PRE_RECOVERY_SNAPSHOT');
});

test('editor gate blocks open STALE without operatorRelease', function () {
  const r = recovery.applySelectiveHeaderPatch(rowState(basePayload()), synthManifest(), {
    mode: 'apply',
    skipEditorGate: false,
    snapshotOk: true,
    hashFn: md5,
    nowMs: Date.parse('2026-01-15T12:00:00.000Z')
  });
  assert.strictEqual(r.code, 'OPERATOR_RELEASE_REQUIRED');
});

test('local diag: EMPTY → OPERATOR_RELEASE path A', function () {
  const mem = {
    getItem: function () { return null; },
    setItem: function () { throw new Error('diag must not write'); },
    removeItem: function () { throw new Error('diag must not write'); }
  };
  const d = localDiag.diagnoseLocalDraft({ localStorage: mem, knownServer: { draftRevision: 4 } });
  assert.strictEqual(d.classification, 'LOCAL_DRAFT_EMPTY');
  const rel = localDiag.evaluateOperatorRelease(d);
  assert.strictEqual(rel.operatorReleaseConfirmed, true);
  assert.strictEqual(rel.path, 'A');
});

test('local diag: NEWER without export → release false; with export → path C', function () {
  const draft = {
    reportId: 'sd-test-001',
    serviceId: 'svc-test-001',
    draftRevision: 9,
    savedAt: '2026-01-15T18:00:00.000Z',
    guarnicao: { nome: 'BST TEST 01' },
    ocorrencias: [{ id: 'oc-test-001' }],
    servico: { data: '2026-01-10' }
  };
  const mem = {
    store: { 'pmpb-transito-servico-diario-v2-draft': JSON.stringify(draft) },
    getItem: function (k) { return this.store[k] || null; },
    setItem: function () { throw new Error('diag must not write'); },
    removeItem: function () { throw new Error('diag must not write'); }
  };
  const d = localDiag.diagnoseLocalDraft({
    localStorage: mem,
    reportId: 'sd-test-001',
    serviceId: 'svc-test-001',
    knownServer: { draftRevision: 4, sincronizadoEm: '2026-01-15T10:00:00.000Z' }
  });
  assert.strictEqual(d.classification, 'LOCAL_DRAFT_NEWER_THAN_SERVER');
  assert.strictEqual(localDiag.evaluateOperatorRelease(d).operatorReleaseConfirmed, false);
  assert.strictEqual(localDiag.evaluateOperatorRelease(d, { localContingencyExportPreserved: true }).path, 'C');
});

function makeLs(store) {
  return {
    store: store || {},
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(this.store, k) ? this.store[k] : null; },
    setItem: function (k, v) { this.store[k] = String(v); },
    removeItem: function (k) { delete this.store[k]; }
  };
}

function releaseBlock(path, classification, extras) {
  return Object.assign({
    confirmed: true,
    path: path,
    inspectedAt: '2026-01-15T12:00:00.000Z',
    deviceId: 'dev-test-001',
    localClassification: classification,
    localFingerprint: 'fp-test',
    contingencyPreserved: path === 'C'
  }, extras || {});
}

// --- Revisão remota af2f450: testes A–O ---

test('A) draft local com ocorrência preservado após capture + overwrite DEGRADED', function () {
  const localDraft = {
    reportId: 'sd-test-001',
    serviceId: 'svc-test-001',
    draftRevision: 4,
    ocorrencias: [{ id: 'oc-local-X', tipo: 'LOCAL_X' }],
    observacoes: 'obs-local-Y',
    guarnicao: { nome: 'BST LOCAL' }
  };
  const ls = makeLs({ 'pmpb-transito-servico-diario-v2-draft': JSON.stringify(localDraft) });
  const memStore = {};
  const cap = localDiag.capturePreHydrationDraft({
    localStorage: ls,
    reportId: 'sd-test-001',
    serviceId: 'svc-test-001',
    memoryStore: memStore
  });
  assert.strictEqual(cap.captured, true);
  // Simula hidratação DEGRADED sobrescrevendo DRAFT_KEY
  const degraded = basePayload();
  degraded.ocorrencias = [];
  degraded.observacoes = '';
  ls.setItem('pmpb-transito-servico-diario-v2-draft', JSON.stringify(degraded));
  const pre = localDiag.getPreHydrationDraft({
    localStorage: ls,
    reportId: 'sd-test-001',
    memoryStore: memStore
  });
  assert.ok(pre && pre.draft);
  assert.strictEqual(pre.draft.ocorrencias[0].id, 'oc-local-X');
  assert.strictEqual(pre.draft.observacoes, 'obs-local-Y');
  const d = localDiag.diagnoseLocalDraft({
    localStorage: ls,
    reportId: 'sd-test-001',
    serviceId: 'svc-test-001',
    memoryStore: memStore,
    knownServer: { draftRevision: 4, sincronizadoEm: '2026-01-15T10:00:00.000Z' },
    livePayload: degraded
  });
  assert.strictEqual(d.localSource, 'PRE_HYDRATION_LOCAL_DRAFT');
  assert.ok(d.sections.ocorrencias >= 1);
});

test('B) draft de outro REPORT_ID → LOCAL_DRAFT_FOREIGN + release FALSE', function () {
  const ls = makeLs({
    'pmpb-transito-servico-diario-v2-draft': JSON.stringify({
      reportId: 'sd-OTHER',
      serviceId: 'svc-test-001',
      ocorrencias: [{ id: 'oc-1' }],
      guarnicao: { nome: 'X' }
    })
  });
  const d = localDiag.diagnoseLocalDraft({
    localStorage: ls,
    reportId: 'sd-test-001',
    serviceId: 'svc-test-001',
    knownServer: { draftRevision: 4 }
  });
  assert.strictEqual(d.classification, 'LOCAL_DRAFT_FOREIGN');
  assert.strictEqual(localDiag.evaluateOperatorRelease(d).operatorReleaseConfirmed, false);
});

test('C) draft de outro SERVICE_ID → release FALSE', function () {
  const ls = makeLs({
    'pmpb-transito-servico-diario-v2-draft': JSON.stringify({
      reportId: 'sd-test-001',
      serviceId: 'svc-OTHER',
      ocorrencias: [{ id: 'oc-1' }],
      guarnicao: { nome: 'X' }
    })
  });
  const d = localDiag.diagnoseLocalDraft({
    localStorage: ls,
    reportId: 'sd-test-001',
    serviceId: 'svc-test-001',
    knownServer: { draftRevision: 4 }
  });
  assert.strictEqual(d.classification, 'LOCAL_DRAFT_FOREIGN');
  assert.strictEqual(localDiag.evaluateOperatorRelease(d).operatorReleaseConfirmed, false);
});

test('D) LOCAL_DRAFT_PRESENT sem timestamps/revision/fingerprint → UNKNOWN + release FALSE', function () {
  const ls = makeLs({
    'pmpb-transito-servico-diario-v2-draft': JSON.stringify({
      reportId: 'sd-test-001',
      serviceId: 'svc-test-001',
      ocorrencias: [{ id: 'oc-1' }],
      guarnicao: { nome: 'BST LOCAL' }
      // sem draftRevision / savedAt
    })
  });
  const d = localDiag.diagnoseLocalDraft({
    localStorage: ls,
    reportId: 'sd-test-001',
    serviceId: 'svc-test-001',
    knownServer: { reportId: 'sd-test-001' } // sem rev/ts/fp do servidor
  });
  assert.strictEqual(d.classification, 'LOCAL_DRAFT_UNKNOWN');
  assert.strictEqual(d.comparableToServer, false);
  assert.strictEqual(localDiag.evaluateOperatorRelease(d).operatorReleaseConfirmed, false);
});

test('E) operatorRelease + lease stale + período antigo → apply passa editor gate', function () {
  const manifest = synthManifest({
    operatorRelease: releaseBlock('A', 'LOCAL_DRAFT_EMPTY')
  });
  const r = recovery.applySelectiveHeaderPatch(rowState(basePayload()), manifest, {
    mode: 'apply',
    skipEditorGate: false,
    snapshotOk: true,
    hashFn: md5,
    nowMs: Date.parse('2026-01-15T12:00:00.000Z')
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.code, 'HEADER_RECOVERY_APPLIED');
});

test('F) operatorRelease + lease ativo → apply bloqueado', function () {
  const manifest = synthManifest({
    operatorRelease: releaseBlock('A', 'LOCAL_DRAFT_EMPTY')
  });
  const row = rowState(basePayload(), { editLeaseUntil: '2099-01-01T00:00:00.000Z' });
  const r = recovery.applySelectiveHeaderPatch(row, manifest, {
    mode: 'apply',
    skipEditorGate: false,
    snapshotOk: true,
    hashFn: md5,
    nowMs: Date.parse('2026-01-15T12:00:00.000Z')
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, 'ACTIVE_EDIT_LEASE');
});

test('G) operatorRelease + ACTIVE_PERIOD → apply bloqueado', function () {
  const manifest = synthManifest({
    activePeriodRecoveryCaution: true,
    operatorRelease: releaseBlock('A', 'LOCAL_DRAFT_EMPTY')
  });
  const r = recovery.applySelectiveHeaderPatch(rowState(basePayload()), manifest, {
    mode: 'apply',
    skipEditorGate: false,
    snapshotOk: true,
    hashFn: md5,
    nowMs: Date.parse('2026-01-15T12:00:00.000Z')
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, 'ACTIVE_PERIOD_RECOVERY_CAUTION');
});

test('H) PRE_RECOVERY_SNAPSHOT >45KB → backup integral recuperável e hash confere', function () {
  const bigObs = 'X'.repeat(50000);
  const payload = basePayload({ observacoes: bigObs });
  const stored = {};
  const r = recovery.applySelectiveHeaderPatch(rowState(payload), synthManifest({
    operatorRelease: releaseBlock('A', 'LOCAL_DRAFT_EMPTY')
  }), {
    mode: 'apply',
    skipEditorGate: false,
    hashFn: md5,
    nowMs: Date.parse('2026-01-15T12:00:00.000Z'),
    persistSnapshot: function (snap) {
      const json = JSON.stringify(snap);
      assert.ok(json.length > 45000);
      const fullHash = md5(json);
      stored.json = json;
      stored.hash = fullHash;
      // simula create+readback
      const rb = stored.json;
      const rbHash = md5(rb);
      if (rbHash !== fullHash) return { ok: false, code: 'SNAPSHOT_ABORT' };
      return { ok: true, snapshotId: 'snap-test', fileId: 'file-new', fullHash: fullHash, size: rb.length };
    }
  });
  assert.strictEqual(r.ok, true);
  assert.ok(stored.json.length > 45000);
  assert.strictEqual(md5(stored.json), stored.hash);
  assert.ok(JSON.parse(stored.json).payload.observacoes.length === 50000);
});

test('I) falha ao criar snapshot → zero escrita', function () {
  const r = recovery.applySelectiveHeaderPatch(rowState(basePayload()), synthManifest({
    operatorRelease: releaseBlock('A', 'LOCAL_DRAFT_EMPTY')
  }), {
    mode: 'apply',
    skipEditorGate: false,
    hashFn: md5,
    nowMs: Date.parse('2026-01-15T12:00:00.000Z'),
    persistSnapshot: function () { return { ok: false, code: 'SNAPSHOT_ABORT', detail: 'create-failed' }; }
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, 'SNAPSHOT_ABORT');
  assert.strictEqual(r.written, false);
});

test('J) falha ao reler snapshot → zero escrita', function () {
  const r = recovery.applySelectiveHeaderPatch(rowState(basePayload()), synthManifest({
    operatorRelease: releaseBlock('A', 'LOCAL_DRAFT_EMPTY')
  }), {
    mode: 'apply',
    skipEditorGate: false,
    hashFn: md5,
    nowMs: Date.parse('2026-01-15T12:00:00.000Z'),
    persistSnapshot: function () { return { ok: false, code: 'SNAPSHOT_ABORT', detail: 'readback-failed' }; }
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, 'SNAPSHOT_ABORT');
  assert.strictEqual(r.written, false);
});

test('K) payload.viaturas atual com VTR adicional → recovery vtrPrincipal NÃO apaga', function () {
  const payload = basePayload();
  payload.viaturas = [
    { prefixo: '1111', ordem: 1 },
    { prefixo: '2222', ordem: 2, placa: 'ABC1D23' }
  ];
  payload.guarnicao.viaturas = payload.viaturas;
  const r = recovery.applySelectiveHeaderPatch(rowState(payload), synthManifest({
    operatorRelease: releaseBlock('A', 'LOCAL_DRAFT_EMPTY')
  }), applyOpts({ skipEditorGate: false }));
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.payload.viaturas.length, 2);
  assert.strictEqual(r.payload.viaturas[1].prefixo, '2222');
  assert.strictEqual(r.payload.guarnicao.vtrPrincipal, '9999');
});

test('L) matriculaResponsavel atual diferente → conflito, não sobrescrita', function () {
  const payload = basePayload();
  payload.matriculaResponsavel = '111.111-1';
  const r = recovery.applySelectiveHeaderPatch(rowState(payload), synthManifest({
    operatorRelease: releaseBlock('A', 'LOCAL_DRAFT_EMPTY')
  }), applyOpts({ skipEditorGate: false }));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, 'DERIVED_FIELD_CONFLICT');
  assert.strictEqual(payload.matriculaResponsavel, '111.111-1');
});

test('M) read-back com uma diferença em guarnicao.* → READBACK_MISMATCH', function () {
  const expected = { guarnicao: { nome: 'BST TEST 01', vtrPrincipal: '9999' }, ocorrencias: [] };
  const actual = { guarnicao: { nome: 'BST TEST 01', vtrPrincipal: '0000' }, ocorrencias: [] };
  const rb = recovery.assertStrictPayloadEqual(expected, actual);
  assert.strictEqual(rb.ok, false);
  assert.ok(rb.diffs.some(function (d) { return d.indexOf('guarnicao') === 0; }));
});

test('N) read-back com diferença em ocorrência → READBACK_MISMATCH', function () {
  const expected = { guarnicao: { nome: 'A' }, ocorrencias: [{ id: 'oc-1' }] };
  const actual = { guarnicao: { nome: 'A' }, ocorrencias: [{ id: 'oc-2' }] };
  const rb = recovery.assertStrictPayloadEqual(expected, actual);
  assert.strictEqual(rb.ok, false);
  assert.ok(rb.diffs.some(function (d) { return d.indexOf('ocorrencias') === 0; }));
});

test('O) segundo apply idempotente → NO_OP_ALREADY_RECOVERED', function () {
  const manifest = synthManifest({
    operatorRelease: releaseBlock('A', 'LOCAL_DRAFT_EMPTY')
  });
  const r1 = recovery.applySelectiveHeaderPatch(rowState(basePayload()), manifest, applyOpts({ skipEditorGate: false }));
  assert.strictEqual(r1.ok, true);
  const manifest2 = recovery.deepClone(manifest);
  manifest2.expectedDraftRevision = r1.draftRevision;
  manifest2.expectedPayloadHash = r1.payloadHash;
  const r2 = recovery.applySelectiveHeaderPatch(rowState(r1.payload, {
    draftRevision: r1.draftRevision,
    payloadHash: r1.payloadHash
  }), manifest2, applyOpts({ skipEditorGate: false }));
  assert.strictEqual(r2.code, 'NO_OP_ALREADY_RECOVERED');
  assert.strictEqual(r2.written, false);
});

test('Path B exige evidência positiva (rev local <= servidor)', function () {
  const draft = {
    reportId: 'sd-test-001',
    serviceId: 'svc-test-001',
    draftRevision: 3,
    savedAt: '2026-01-14T10:00:00.000Z',
    guarnicao: { nome: 'BST TEST 01' },
    ocorrencias: [{ id: 'oc-1' }]
  };
  const ls = makeLs({ 'pmpb-transito-servico-diario-v2-draft': JSON.stringify(draft) });
  const d = localDiag.diagnoseLocalDraft({
    localStorage: ls,
    reportId: 'sd-test-001',
    serviceId: 'svc-test-001',
    knownServer: { draftRevision: 4, sincronizadoEm: '2026-01-15T10:00:00.000Z' }
  });
  assert.strictEqual(d.classification, 'LOCAL_DRAFT_PRESENT');
  const rel = localDiag.evaluateOperatorRelease(d);
  assert.strictEqual(rel.operatorReleaseConfirmed, true);
  assert.strictEqual(rel.path, 'B');
});

console.log('\nPASSED', passed);
