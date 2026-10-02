/**
 * Recuperação seletiva DATA_SERVICO (quoted-ISO) em RCO_RASCUNHOS.
 *
 * FASE 1: DRY-RUN / manifest — ZERO writes.
 * FASE 2: apply controlado — um campo, com preconditions/snapshot.
 * Hardening: idempotência exige preconditions live; row-diff; read-back crítico;
 * pasta de snapshot RCO própria; semântica mutatedDraftRow.
 * NÃO altera prevenção 10.8.38 (rcoDraftPrepareRowForWrite_).
 * NÃO altera dateText_.
 */
'use strict';

/** Preconditions exatas do piloto autorizado (FASE 2). */
var PILOT_APPLY_EXPECTED = {
  reportId: 'cpu-7372448b-84ba-4b49-89f2-2248144f7b07',
  status: 'EM_ANDAMENTO',
  batalhao: 'BPTran',
  companhia: '1ª CPTran',
  dataServicoRaw: '"2026-10-01T03:00:00.000Z"',
  revisao: 1,
  payloadHash: 'a50dded450683ed9cf597ae8b9bacd71',
  payloadPeriodoInicio: '2026-10-01',
  expectedDate: '2026-10-01',
  rcoDataServico: '2026-10-01'
};

var RCO_SNAPSHOT_FOLDER_PROP = 'RCO_RECOVERY_SNAPSHOT_FOLDER_ID';
var RCO_SNAPSHOT_FOLDER_NAME = 'Central RCO - Recovery Snapshots';

var dateWrite = null;
try {
  dateWrite = require('./rco_draft_date_write.js');
} catch (_) {
  dateWrite = null;
}

var rootSig = null;
try {
  rootSig = require('./rco_root_cause_signature.js');
} catch (_) {
  rootSig = null;
}

/** FASE 7A — piloto causal autorizado (único). */
var CAUSAL_PILOT_REPORT_ID = 'cpu-5e000c43-ef9c-4c90-82ea-7bfeaea08f63';
/** FASE 7B — 13 restantes (sem piloto, sem AMBIGUOUS, sem FINALIZADO conflitante). */
var FASE7B_CAUSAL_IDS = [
  'cpu-171f2630-f393-4d6b-856e-d054b031f1d4',
  'cpu-2d0ae2c7-9162-4d38-af00-aab90e776223',
  'cpu-2cd5ab14-4b76-4a91-baa9-adf916560dc5',
  'cpu-2e3759d2-46b5-44c6-914d-89fac6d26afe',
  'cpu-2c8cb41d-e027-4379-9fcb-abaa9a4c955e',
  'cpu-f7528aab-77d2-44dc-aa34-48fe68c5c9c7',
  'cpu-2e646703-2cbf-482f-bc38-6cca3ddbb491',
  'cpu-5870e14d-e628-49ac-ac74-64c73cb5ff91',
  'cpu-fa312e36-1625-4a0d-9397-5407b9aee9c2',
  'cpu-6de321c9-d226-4aef-bcea-db67ea966c22',
  'cpu-07da6de8-a0aa-4091-8bd4-8d6707678772',
  'cpu-899d8a89-7fdc-4749-b5fc-149281e61114',
  'cpu-ac5be573-2eaf-4e11-88fb-38b1eaba359b'
];
var EVIDENCE_MODE_CAUSAL = 'CAUSAL_ROOT_SIGNATURE';
var PRODUCTION_SCRIPT_TZ = (rootSig && rootSig.PRODUCTION_SCRIPT_TZ) || 'America/Sao_Paulo';

function isQuotedIsoDateToken(v) {
  if (dateWrite && typeof dateWrite.isQuotedIsoDateToken === 'function') {
    return dateWrite.isQuotedIsoDateToken(v);
  }
  if (v == null || v === '') return false;
  if (Object.prototype.toString.call(v) === '[object Date]') return false;
  return /^"\d{4}-\d{2}-\d{2}T/.test(String(v).replace(/\u00a0/g, ' ').trim());
}

function extractYmdFromQuotedIso(v) {
  if (dateWrite && typeof dateWrite.extractYmdFromQuotedIso === 'function') {
    return dateWrite.extractYmdFromQuotedIso(v);
  }
  var m = String(v || '').replace(/\u00a0/g, ' ').trim().match(/^"?(\d{4}-\d{2}-\d{2})T/);
  return m ? m[1] : '';
}

function isYmd(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '').trim());
}

function normUnit(v) {
  return String(v || '').replace(/\u00a0/g, ' ').trim();
}

function leaseActive(editLeaseUntil, nowMs) {
  var s = String(editLeaseUntil || '').trim();
  if (!s) return false;
  var t = Date.parse(s);
  if (isNaN(t)) return false;
  return t > (nowMs == null ? Date.now() : nowMs);
}

function canonicalizeRowValue(v) {
  if (v == null) return null;
  if (Object.prototype.toString.call(v) === '[object Date]') {
    if (isNaN(v.getTime())) return null;
    return dateTextSim(v);
  }
  if (typeof v === 'number' && isFinite(v)) return v;
  if (typeof v === 'boolean') return v;
  return String(v);
}

function projectDraftRow(row) {
  var out = {};
  var keys = Object.keys(row || {}).sort();
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (k === '_row') continue;
    out[k] = canonicalizeRowValue(row[k]);
  }
  return out;
}

function diffDraftRowsExcludingDate(beforeProj, afterProj) {
  var changed = [];
  var keys = {};
  Object.keys(beforeProj || {}).forEach(function (k) { keys[k] = true; });
  Object.keys(afterProj || {}).forEach(function (k) { keys[k] = true; });
  Object.keys(keys).forEach(function (k) {
    if (k === 'DATA_SERVICO') return;
    if (JSON.stringify(beforeProj[k]) !== JSON.stringify(afterProj[k])) changed.push(k);
  });
  return changed.sort();
}

/**
 * dateText_ semantic for YMD / quoted-ISO / ISO (Node mirror; no Utilities).
 */
function dateTextSim(v) {
  if (v == null || v === '') return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    if (isNaN(v.getTime())) return '';
    var y = v.getFullYear();
    var m = v.getMonth() + 1;
    var d = v.getDate();
    return y + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d;
  }
  var s = String(v).replace(/\u00a0/g, ' ').trim();
  // quoted-ISO: dateText_ real NÃO reconhece (retorna '') — documentar
  if (/^"\d{4}-\d{2}-\d{2}T/.test(s)) return '';
  var m2 = s.match(/^(\d{4}-\d{2}-\d{2})(?:[T\s].*)?$/);
  if (m2) return m2[1];
  return '';
}

/**
 * Após o patch proposto, dateText_ deve voltar a reconhecer a data.
 */
function simulatePostPatchDateText(expectedYmd) {
  return {
    beforeQuoted: dateTextSim('"2026-10-01T03:00:00.000Z"'),
    afterPatch: dateTextSim(expectedYmd),
    filterWouldMatch: dateTextSim(expectedYmd) === expectedYmd
  };
}

/**
 * @param {object} live — snapshot já relido de produção
 */
function buildManifest(live, opts) {
  opts = opts || {};
  var nowMs = opts.nowMs != null ? opts.nowMs : Date.now();
  var draft = live.draft || {};
  var payload = live.payload || {};
  var rco = live.rco || {};
  var periodo = payload.periodo || {};
  var state = payload.state || {};
  var unidade = payload.unidade || {};

  var currentDateRaw = draft.DATA_SERVICO;
  var quotedIsoYmd = extractYmdFromQuotedIso(currentDateRaw);
  var payloadInicio = String(periodo.inicio || payload.data || '').trim();
  var payloadTermino = String(periodo.termino || '').trim();
  var rcoFinalDate = '';
  if (Object.prototype.toString.call(rco.DATA_SERVICO) === '[object Date]') {
    rcoFinalDate = dateTextSim(rco.DATA_SERVICO);
  } else {
    rcoFinalDate = isYmd(rco.DATA_SERVICO) ? String(rco.DATA_SERVICO).trim() : dateTextSim(rco.DATA_SERVICO);
  }

  var reportId = String(draft.RCO_REPORT_ID || live.reportId || '').trim();
  var rcoReportId = String(rco.REPORT_ID || '').trim();
  var stateReportId = String(state.reportId || payload.reportId || '').trim();

  var battDraft = normUnit(draft.BATALHAO);
  var compDraft = normUnit(draft.COMPANHIA);
  var battPayload = normUnit(unidade.batalhao);
  var compPayload = normUnit(unidade.companhia);
  var battRco = normUnit(rco.BATALHAO);
  var compRco = normUnit(rco.COMPANHIA);

  var identityParity =
    !!reportId &&
    reportId === rcoReportId &&
    reportId === stateReportId;

  var unitParity =
    !!battDraft && !!compDraft &&
    (!battPayload || battPayload === battDraft) &&
    (!compPayload || compPayload === compDraft) &&
    (!battRco || battRco === battDraft) &&
    (!compRco || compRco === compDraft);

  var dateEvidenceParity =
    isQuotedIsoDateToken(currentDateRaw) &&
    isYmd(quotedIsoYmd) &&
    isYmd(payloadInicio) &&
    isYmd(rcoFinalDate) &&
    quotedIsoYmd === payloadInicio &&
    payloadInicio === rcoFinalDate;

  var expectedDate = dateEvidenceParity ? quotedIsoYmd : '';

  var activeEditRisk = leaseActive(draft.EDIT_LEASE_UNTIL, nowMs);
  var riskFlags = [];
  if (!isQuotedIsoDateToken(currentDateRaw)) riskFlags.push('NOT_QUOTED_ISO');
  if (!identityParity) riskFlags.push('IDENTITY_MISMATCH');
  if (!unitParity) riskFlags.push('UNIT_MISMATCH');
  if (!dateEvidenceParity) riskFlags.push('DATE_EVIDENCE_MISMATCH');
  if (activeEditRisk) riskFlags.push('ACTIVE_EDIT_RISK');
  if (!rcoReportId) riskFlags.push('RCO_ROW_MISSING');
  if (!payloadInicio) riskFlags.push('PAYLOAD_INICIO_MISSING');

  // ACTIVE_EDIT_RISK não bloqueia dry-run; bloqueia apply automático
  var blocking = riskFlags.filter(function (f) {
    return f !== 'ACTIVE_EDIT_RISK';
  });
  var safeToApply = blocking.length === 0 && !!expectedDate;

  var proposedPatch = null;
  if (expectedDate) {
    proposedPatch = {
      sheet: 'RCO_RASCUNHOS',
      keyField: 'RCO_REPORT_ID',
      keyValue: reportId,
      field: 'DATA_SERVICO',
      from: String(currentDateRaw),
      to: expectedDate,
      onlyField: 'DATA_SERVICO'
    };
  }

  var functional = simulatePostPatchDateText(expectedDate || '2026-10-01');

  return {
    mode: 'DRY_RUN',
    mutatedProductionRows: false,
    mutatedDraftRow: false,
    reportId: reportId,
    currentStatus: String(draft.STATUS || ''),
    currentBattalion: battDraft,
    currentCompany: compDraft,
    currentDateRaw: String(currentDateRaw == null ? '' : currentDateRaw),
    quotedIsoYmd: quotedIsoYmd,
    payloadPeriodoInicio: payloadInicio,
    payloadPeriodoTermino: payloadTermino,
    payloadStateReportId: stateReportId,
    payloadUnidadeBattalion: battPayload,
    payloadUnidadeCompany: compPayload,
    rcoFinalDate: rcoFinalDate,
    rcoTableReportId: rcoReportId,
    rcoTableBattalion: battRco,
    rcoTableCompany: compRco,
    rcoTableVersion: Number(rco.VERSAO || 0),
    rcoTableStatus: String(rco.STATUS || ''),
    revision: Number(draft.REVISAO || 0),
    payloadHash: String(draft.PAYLOAD_HASH || ''),
    payloadFileId: String(draft.PAYLOAD_FILE_ID || ''),
    ultimoSyncEm: String(draft.ULTIMO_SYNC_EM || ''),
    atualizadoEm: String(draft.ATUALIZADO_EM || ''),
    editDeviceId: String(draft.EDIT_DEVICE_ID || ''),
    editLeaseUntil: String(draft.EDIT_LEASE_UNTIL || ''),
    activeEditRisk: activeEditRisk,
    expectedDate: expectedDate,
    evidence: {
      A_quotedIsoYmd: quotedIsoYmd,
      B_payloadPeriodoInicio: payloadInicio,
      C_rcoDataServico: rcoFinalDate,
      A_eq_B_eq_C: dateEvidenceParity
    },
    preconditions: {
      identityParity: identityParity,
      unitParity: unitParity,
      dateEvidenceParity: dateEvidenceParity,
      isQuotedIso: isQuotedIsoDateToken(currentDateRaw),
      activeEditRisk: activeEditRisk
    },
    proposedPatch: proposedPatch,
    riskFlags: riskFlags,
    blockingReasons: blocking,
    safeToApply: safeToApply,
    functionalProjection: functional,
    futureApplyStrategy: {
      executed: false,
      steps: [
        'LockService.getScriptLock().waitLock(20000)',
        'reler findOne_ RCO_RASCUNHOS',
        'validar preconditions exatas (raw date, hash, revision, ids, units)',
        'criar snapshot imutável PRE_RCO_DATE_RECOVERY em Central RCO - Recovery Snapshots',
        'alterar SOMENTE DATA_SERVICO → YYYY-MM-DD',
        'read-back crítico + audit before/after',
        'idempotente só se YYYY-MM-DD + preconditions live compatíveis'
      ]
    }
  };
}

/**
 * Dry-run puro: recebe live snapshot, não escreve.
 */
function dryRun(live, opts) {
  var manifest = buildManifest(live, opts);
  return {
    ok: true,
    mode: 'DRY_RUN',
    mutatedProductionRows: false,
    mutatedDraftRow: false,
    publicActionExposed: false,
    manifest: manifest,
    safeToApply: !!manifest.safeToApply,
    blockingReasons: manifest.blockingReasons.slice(),
    activeEditRisk: !!manifest.activeEditRisk
  };
}

/**
 * Valida preconditions exatas do APPLY (FASE 2).
 * ACTIVE_EDIT_RISK é BLOQUEANTE no apply.
 * Idempotência (já YYYY-MM-DD) também exige STATUS/REVISAO/HASH/identidade live.
 * @returns {{ok:boolean, alreadyRecovered?:boolean, idempotent?:boolean, staleManifest?:boolean, code?:string, safety?:string, reasons:string[], checks:object}}
 */
function validateApplyPreconditions(live, expected, opts) {
  opts = opts || {};
  expected = expected || PILOT_APPLY_EXPECTED;
  var nowMs = opts.nowMs != null ? opts.nowMs : Date.now();
  var draft = live.draft || {};
  var payload = live.payload || {};
  var rco = live.rco || {};
  var periodo = payload.periodo || {};
  var state = payload.state || {};
  var reasons = [];
  var checks = {};

  var reportId = String(draft.RCO_REPORT_ID || live.reportId || '').trim();
  var raw = draft.DATA_SERVICO;
  var rawStr = String(raw == null ? '' : raw);
  var rcoDate = Object.prototype.toString.call(rco.DATA_SERVICO) === '[object Date]'
    ? dateTextSim(rco.DATA_SERVICO)
    : (isYmd(rco.DATA_SERVICO) ? String(rco.DATA_SERVICO).trim() : dateTextSim(rco.DATA_SERVICO));
  var payloadInicio = String(periodo.inicio || payload.data || '').trim();
  var stateReportId = String(state.reportId || payload.reportId || '').trim();
  var rcoReportId = String(rco.REPORT_ID || '').trim();
  var activeLease = leaseActive(draft.EDIT_LEASE_UNTIL, nowMs);

  checks.reportId = reportId === expected.reportId;
  if (!checks.reportId) reasons.push('REPORT_ID_MISMATCH');

  checks.status = String(draft.STATUS || '') === expected.status;
  if (!checks.status) reasons.push('STATUS_MISMATCH');

  checks.batalhao = normUnit(draft.BATALHAO) === expected.batalhao;
  if (!checks.batalhao) reasons.push('BATALHAO_MISMATCH');

  checks.companhia = normUnit(draft.COMPANHIA) === expected.companhia;
  if (!checks.companhia) reasons.push('COMPANHIA_MISMATCH');

  // Já recuperado (YMD string ou Date) — só idempotente se preconditions live baterem.
  var semanticYmd = Object.prototype.toString.call(raw) === '[object Date]'
    ? dateTextSim(raw)
    : (isYmd(rawStr) ? rawStr : '');
  if (semanticYmd === expected.expectedDate) {
    var stale = [];
    if (reportId !== expected.reportId) stale.push('REPORT_ID_MISMATCH');
    if (String(draft.STATUS || '') !== expected.status) stale.push('STATUS_MISMATCH');
    if (normUnit(draft.BATALHAO) !== expected.batalhao) stale.push('BATALHAO_MISMATCH');
    if (normUnit(draft.COMPANHIA) !== expected.companhia) stale.push('COMPANHIA_MISMATCH');
    if (Number(draft.REVISAO || 0) !== Number(expected.revisao)) stale.push('REVISION_MISMATCH');
    if (String(draft.PAYLOAD_HASH || '') !== String(expected.payloadHash)) stale.push('HASH_MISMATCH');
    if (!(reportId === rcoReportId && reportId === stateReportId && !!reportId)) stale.push('IDENTITY_MISMATCH');
    if (!(payloadInicio === expected.expectedDate && rcoDate === expected.expectedDate)) {
      stale.push('DATE_EVIDENCE_MISMATCH');
    }
    if (activeLease) stale.push('ACTIVE_EDIT_RISK');

    checks.alreadyYmd = true;
    checks.revisao = Number(draft.REVISAO || 0) === Number(expected.revisao);
    checks.payloadHash = String(draft.PAYLOAD_HASH || '') === String(expected.payloadHash);
    checks.identityParity = !!reportId && reportId === rcoReportId && reportId === stateReportId;
    checks.dateEvidenceParity = payloadInicio === expected.expectedDate && rcoDate === expected.expectedDate;
    checks.activeEditRisk = activeLease;

    if (stale.length === 0) {
      return {
        ok: true,
        alreadyRecovered: true,
        idempotent: true,
        staleManifest: false,
        code: 'ALREADY_RECOVERED',
        safety: 'SAFE',
        reasons: [],
        checks: checks
      };
    }
    return {
      ok: false,
      alreadyRecovered: true,
      idempotent: false,
      staleManifest: true,
      code: 'ALREADY_RECOVERED_BUT_STATE_CHANGED',
      safety: 'UNSAFE',
      reasons: stale,
      checks: checks,
      expectedDate: expected.expectedDate,
      currentDateRaw: rawStr
    };
  }

  checks.dataServicoRaw = rawStr === expected.dataServicoRaw;
  if (!checks.dataServicoRaw) reasons.push('RAW_DATE_MISMATCH');

  checks.revisao = Number(draft.REVISAO || 0) === Number(expected.revisao);
  if (!checks.revisao) reasons.push('REVISION_MISMATCH');

  checks.payloadHash = String(draft.PAYLOAD_HASH || '') === String(expected.payloadHash);
  if (!checks.payloadHash) reasons.push('HASH_MISMATCH');

  checks.payloadStateReportId = stateReportId === expected.reportId;
  if (!checks.payloadStateReportId) reasons.push('PAYLOAD_STATE_REPORT_ID_MISMATCH');

  checks.payloadPeriodoInicio = payloadInicio === expected.payloadPeriodoInicio;
  if (!checks.payloadPeriodoInicio) reasons.push('PAYLOAD_INICIO_MISMATCH');

  checks.rcoReportId = rcoReportId === expected.reportId;
  if (!checks.rcoReportId) reasons.push('RCO_REPORT_ID_MISMATCH');

  checks.rcoDataServico = rcoDate === expected.rcoDataServico;
  if (!checks.rcoDataServico) reasons.push('RCO_DATE_MISMATCH');

  checks.identityParity = !!reportId && reportId === rcoReportId && reportId === stateReportId;
  if (!checks.identityParity) reasons.push('IDENTITY_MISMATCH');

  var quotedYmd = extractYmdFromQuotedIso(rawStr);
  checks.dateEvidenceParity =
    isQuotedIsoDateToken(rawStr) &&
    quotedYmd === expected.expectedDate &&
    payloadInicio === expected.expectedDate &&
    rcoDate === expected.expectedDate;
  if (!checks.dateEvidenceParity) reasons.push('DATE_EVIDENCE_MISMATCH');

  checks.activeEditRisk = activeLease;
  if (activeLease) reasons.push('ACTIVE_EDIT_RISK');

  return {
    ok: reasons.length === 0,
    alreadyRecovered: false,
    idempotent: false,
    staleManifest: false,
    code: reasons.length === 0 ? 'READY_TO_APPLY' : 'PRECONDITION_FAILED',
    safety: reasons.length === 0 ? 'SAFE' : 'UNSAFE',
    reasons: reasons,
    checks: checks,
    expectedDate: expected.expectedDate,
    currentDateRaw: rawStr
  };
}

/**
 * Simula apply (teste): snapshot → write um campo → read-back + row-diff.
 * db.drafts[reportId] = row object; db.writes / db.snapshots / db.audits = logs.
 */
function applySimulated(db, expected, opts) {
  opts = opts || {};
  expected = expected || PILOT_APPLY_EXPECTED;
  var reportId = expected.reportId;
  var row = db.drafts[reportId];
  if (!row) {
    return {
      ok: false,
      aborted: true,
      reasons: ['DRAFT_NOT_FOUND'],
      mutatedDraftRow: false,
      mutatedProductionRows: false
    };
  }
  var live = {
    reportId: reportId,
    draft: row,
    payload: db.payloads[reportId] || {},
    rco: db.rcos[reportId] || {}
  };
  var v = validateApplyPreconditions(live, expected, opts);
  if (v.alreadyRecovered && v.ok && v.idempotent) {
    return {
      ok: true,
      alreadyRecovered: true,
      idempotent: true,
      staleManifest: false,
      code: 'ALREADY_RECOVERED',
      safety: 'SAFE',
      mutated: false,
      mutatedDraftRow: false,
      mutatedProductionRows: false,
      writeFields: [],
      snapshotCreated: false,
      otherFieldsChanged: false,
      unexpectedChangedFields: []
    };
  }
  if (v.alreadyRecovered && !v.ok) {
    return {
      ok: false,
      aborted: true,
      alreadyRecovered: true,
      idempotent: false,
      staleManifest: true,
      code: v.code || 'ALREADY_RECOVERED_BUT_STATE_CHANGED',
      safety: 'UNSAFE',
      reasons: v.reasons.slice(),
      mutated: false,
      mutatedDraftRow: false,
      mutatedProductionRows: false,
      writeFields: [],
      snapshotCreated: false
    };
  }
  if (!v.ok) {
    return {
      ok: false,
      aborted: true,
      reasons: v.reasons.slice(),
      mutated: false,
      mutatedDraftRow: false,
      mutatedProductionRows: false,
      writeFields: []
    };
  }

  var beforeProj = projectDraftRow(row);
  var snapshot = {
    kind: 'PRE_RCO_DATE_RECOVERY',
    reportId: reportId,
    before: String(row.DATA_SERVICO),
    expectedDate: expected.expectedDate,
    revision: Number(row.REVISAO || 0),
    payloadHash: String(row.PAYLOAD_HASH || ''),
    draftRow: JSON.parse(JSON.stringify(row)),
    payload: JSON.parse(JSON.stringify(live.payload)),
    rcoRow: JSON.parse(JSON.stringify(live.rco)),
    folderProp: RCO_SNAPSHOT_FOLDER_PROP,
    folderName: RCO_SNAPSHOT_FOLDER_NAME
  };
  db.snapshots = db.snapshots || [];
  db.snapshots.push(snapshot);
  db.audits = db.audits || [];

  var beforeClone = JSON.parse(JSON.stringify(row));
  row.DATA_SERVICO = expected.expectedDate;
  if (typeof opts.injectSideEffect === 'function') {
    opts.injectSideEffect(row);
  }
  db.writes = db.writes || [];
  db.writes.push({ field: 'DATA_SERVICO', from: beforeClone.DATA_SERVICO, to: expected.expectedDate });

  if (opts.simulateReadbackFail) {
    row.DATA_SERVICO = opts.simulateReadbackFail === true
      ? beforeClone.DATA_SERVICO
      : opts.simulateReadbackFail;
  }

  var afterProj = projectDraftRow(row);
  var unexpectedChangedFields = diffDraftRowsExcludingDate(beforeProj, afterProj);
  var otherFieldsChanged = unexpectedChangedFields.length > 0;

  var afterYmd = Object.prototype.toString.call(row.DATA_SERVICO) === '[object Date]'
    ? dateTextSim(row.DATA_SERVICO)
    : (isYmd(row.DATA_SERVICO) ? String(row.DATA_SERVICO).trim() : dateTextSim(row.DATA_SERVICO));

  var readBackOk =
    afterYmd === expected.expectedDate &&
    String(row.STATUS || '') === expected.status &&
    Number(row.REVISAO || 0) === Number(expected.revisao) &&
    String(row.PAYLOAD_HASH || '') === String(expected.payloadHash) &&
    normUnit(row.BATALHAO) === expected.batalhao &&
    normUnit(row.COMPANHIA) === expected.companhia &&
    !otherFieldsChanged;

  if (!readBackOk) {
    db.audits.push({
      event: 'RCO_DATE_RECOVERY_READBACK_FAILED',
      reportId: reportId,
      snapshotRef: snapshot,
      observed: {
        DATA_SERVICO: afterYmd,
        STATUS: row.STATUS,
        REVISAO: row.REVISAO,
        PAYLOAD_HASH: row.PAYLOAD_HASH,
        unexpectedChangedFields: unexpectedChangedFields
      }
    });
    return {
      ok: false,
      aborted: true,
      alreadyRecovered: false,
      idempotent: false,
      mutated: true,
      mutatedDraftRow: true,
      mutatedProductionRows: false,
      writeFields: ['DATA_SERVICO'],
      snapshotCreated: true,
      snapshot: snapshot,
      snapshotFolder: RCO_SNAPSHOT_FOLDER_NAME,
      readBackOk: false,
      auditEvent: 'RCO_DATE_RECOVERY_READBACK_FAILED',
      otherFieldsChanged: otherFieldsChanged,
      unexpectedChangedFields: unexpectedChangedFields,
      postApply: {
        DATA_SERVICO: afterYmd,
        STATUS: row.STATUS,
        REVISAO: row.REVISAO,
        PAYLOAD_HASH: row.PAYLOAD_HASH
      }
    };
  }

  db.audits.push({
    event: 'RCO_DATE_RECOVERY_APPLIED',
    reportId: reportId,
    before: String(expected.dataServicoRaw),
    after: String(expected.expectedDate)
  });

  return {
    ok: true,
    alreadyRecovered: false,
    idempotent: false,
    mutated: true,
    mutatedDraftRow: true,
    mutatedProductionRows: false,
    writeFields: ['DATA_SERVICO'],
    snapshotCreated: true,
    snapshot: snapshot,
    snapshotFolder: RCO_SNAPSHOT_FOLDER_NAME,
    readBackOk: true,
    auditEvent: 'RCO_DATE_RECOVERY_APPLIED',
    postApply: {
      DATA_SERVICO: row.DATA_SERVICO,
      STATUS: row.STATUS,
      REVISAO: row.REVISAO,
      PAYLOAD_HASH: row.PAYLOAD_HASH
    },
    otherFieldsChanged: false,
    unexpectedChangedFields: [],
    keysUnchanged: true
  };
}

/**
 * Rebuild expected from live snapshot (FASE 3). requireActive + requireAbc.
 */
function buildExpectedFromLive(live, opts) {
  opts = opts || {};
  var draft = live.draft || {};
  var payload = live.payload || {};
  var rco = live.rco || {};
  var periodo = payload.periodo || {};
  var state = payload.state || {};
  var reportId = String(draft.RCO_REPORT_ID || live.reportId || '').trim();
  var raw = draft.DATA_SERVICO;
  var rawStr = Object.prototype.toString.call(raw) === '[object Date]'
    ? dateTextSim(raw)
    : String(raw == null ? '' : raw);
  var semanticYmd = Object.prototype.toString.call(raw) === '[object Date]'
    ? dateTextSim(raw)
    : (isYmd(rawStr) ? rawStr : '');
  var payloadInicio = String(periodo.inicio || payload.data || '').trim();
  var stateReportId = String(state.reportId || payload.reportId || '').trim();
  var rcoReportId = String(rco.REPORT_ID || '').trim();
  var rcoDate = Object.prototype.toString.call(rco.DATA_SERVICO) === '[object Date]'
    ? dateTextSim(rco.DATA_SERVICO)
    : (isYmd(rco.DATA_SERVICO) ? String(rco.DATA_SERVICO).trim() : dateTextSim(rco.DATA_SERVICO));
  var quotedYmd = extractYmdFromQuotedIso(rawStr);
  var abcParity =
    isQuotedIsoDateToken(rawStr) &&
    isYmd(quotedYmd) &&
    isYmd(payloadInicio) &&
    isYmd(rcoDate) &&
    quotedYmd === payloadInicio &&
    payloadInicio === rcoDate;
  var statusLive = String(draft.STATUS || '');
  var activeOpen = ['EM_ANDAMENTO', 'EM_RETIFICACAO'].indexOf(statusLive) >= 0;
  var activeLease = leaseActive(draft.EDIT_LEASE_UNTIL, opts.nowMs);
  var reasons = [];
  if (String(draft.RCO_REPORT_ID || '') !== reportId) reasons.push('REPORT_ID_MISMATCH');
  if (!(reportId && reportId === rcoReportId && reportId === stateReportId)) reasons.push('IDENTITY_MISMATCH');
  if (activeLease) reasons.push('ACTIVE_EDIT_RISK');
  if (opts.requireActive !== false && !activeOpen) reasons.push('STATUS_NOT_ACTIVE');
  if (opts.requireFinalized && statusLive !== 'FINALIZADO') reasons.push('STATUS_MISMATCH');
  if (semanticYmd) {
    if (!(isYmd(payloadInicio) && isYmd(rcoDate) && payloadInicio === rcoDate && payloadInicio === semanticYmd)) {
      reasons.push('DATE_EVIDENCE_MISMATCH');
    }
  } else if (!abcParity) {
    reasons.push('DATE_EVIDENCE_MISMATCH');
    if (!isQuotedIsoDateToken(rawStr)) reasons.push('NOT_QUOTED_ISO');
  }
  if (reasons.length) {
    return { ok: false, reasons: reasons, abcParity: !!abcParity, alreadyYmd: !!semanticYmd };
  }
  var expectedDate = semanticYmd || quotedYmd;
  return {
    ok: true,
    abcParity: !!abcParity || (!!semanticYmd && payloadInicio === semanticYmd && rcoDate === semanticYmd),
    alreadyYmd: !!semanticYmd,
    expected: {
      reportId: reportId,
      status: statusLive,
      batalhao: normUnit(draft.BATALHAO),
      companhia: normUnit(draft.COMPANHIA),
      dataServicoRaw: String(raw == null ? '' : raw),
      revisao: Number(draft.REVISAO || 0),
      payloadHash: String(draft.PAYLOAD_HASH || ''),
      payloadPeriodoInicio: payloadInicio,
      expectedDate: expectedDate,
      rcoDataServico: rcoDate
    }
  };
}

/**
 * Serial apply of authorized active ABC ids — stop on first failure.
 */
function applySerialActiveAbc(db, reportIds, opts) {
  opts = opts || {};
  var results = [];
  var recovered = [];
  for (var i = 0; i < reportIds.length; i++) {
    var id = reportIds[i];
    var live = {
      reportId: id,
      draft: db.drafts[id],
      payload: db.payloads[id] || {},
      rco: db.rcos[id] || {}
    };
    if (!live.draft) {
      var miss = { ok: false, aborted: true, reasons: ['DRAFT_NOT_FOUND'], reportId: id };
      results.push(miss);
      return {
        ok: false,
        serialSequenceCompleted: false,
        abortedReportId: id,
        abortReason: 'DRAFT_NOT_FOUND',
        recoveredReportIds: recovered.slice(),
        results: results
      };
    }
    var built = buildExpectedFromLive(live, opts);
    if (!built.ok) {
      var abort = {
        ok: false,
        aborted: true,
        reasons: built.reasons.slice(),
        code: 'PRECONDITION_FAILED',
        reportId: id,
        abcParity: built.abcParity
      };
      results.push(abort);
      return {
        ok: false,
        serialSequenceCompleted: false,
        abortedReportId: id,
        abortReason: built.reasons.join(','),
        recoveredReportIds: recovered.slice(),
        results: results
      };
    }
    var out = applySimulated(db, built.expected, opts);
    out.reportId = id;
    out.abcParity = built.abcParity;
    results.push(out);
    if (out.ok && (out.mutatedDraftRow || out.alreadyRecovered)) recovered.push(id);
    if (!out.ok) {
      return {
        ok: false,
        serialSequenceCompleted: false,
        abortedReportId: id,
        abortReason: String(out.code || (out.reasons || []).join(',') || 'UNKNOWN'),
        recoveredReportIds: recovered.slice(),
        results: results
      };
    }
  }
  return {
    ok: true,
    serialSequenceCompleted: true,
    abortedReportId: '',
    abortReason: '',
    recoveredReportIds: recovered.slice(),
    results: results
  };
}

/**
 * Gate causal (Node mirror). Exige evidenceMode=CAUSAL_ROOT_SIGNATURE e timezone explícito.
 * NÃO usa requireAbc=false — caminho separado.
 */
function validateCausalApplyPreconditions(live, opts) {
  opts = opts || {};
  var reasons = [];
  if (String(opts.evidenceMode || '') !== EVIDENCE_MODE_CAUSAL) {
    return {
      ok: false,
      code: 'EVIDENCE_MODE_REQUIRED',
      safety: 'UNSAFE',
      reasons: ['EVIDENCE_MODE_NOT_CAUSAL_ROOT_SIGNATURE'],
      evidenceMode: String(opts.evidenceMode || '')
    };
  }
  var tz = String(opts.scriptTimezone || '').trim();
  if (!tz) {
    return {
      ok: false,
      code: 'SCRIPT_TIMEZONE_REQUIRED',
      safety: 'UNSAFE',
      reasons: ['SCRIPT_TIMEZONE_MISSING'],
      evidenceMode: EVIDENCE_MODE_CAUSAL
    };
  }
  if (!rootSig) {
    return { ok: false, code: 'SIGNATURE_MODULE_MISSING', safety: 'UNSAFE', reasons: ['ROOT_SIG_UNAVAILABLE'] };
  }

  var nowMs = opts.nowMs != null ? opts.nowMs : Date.now();
  var draft = live.draft || {};
  var payload = live.payload || {};
  var rco = live.rco || null;
  var periodo = payload.periodo || {};
  var state = payload.state || {};
  var unidade = payload.unidade || {};
  var reportId = String(draft.RCO_REPORT_ID || live.reportId || '').trim();
  var raw = draft.DATA_SERVICO;
  var rawStr = String(raw == null ? '' : raw).replace(/\u00a0/g, ' ').trim();
  var status = String(draft.STATUS || '');
  var activeOpen = status === 'EM_ANDAMENTO' || status === 'EM_RETIFICACAO';
  var A = extractYmdFromQuotedIso(rawStr);
  var B = String(periodo.inicio || payload.data || '').trim();
  var C = '';
  if (rco && (rco.REPORT_ID || rco.DATA_SERVICO)) {
    C = Object.prototype.toString.call(rco.DATA_SERVICO) === '[object Date]'
      ? dateTextSim(rco.DATA_SERVICO)
      : (isYmd(rco.DATA_SERVICO) ? String(rco.DATA_SERVICO).trim() : dateTextSim(rco.DATA_SERVICO));
  }
  var rcoPresent = !!(rco && String(rco.REPORT_ID || '').trim());
  var stateReportId = String(state.reportId || payload.reportId || '').trim();
  var draftBatt = normUnit(draft.BATALHAO);
  var draftComp = normUnit(draft.COMPANHIA);
  var battPayload = normUnit(unidade.batalhao);
  var compPayload = normUnit(unidade.companhia);
  var identityParity = !!reportId && reportId === stateReportId;
  var unitParity = !!draftBatt && !!draftComp &&
    (!battPayload || battPayload === draftBatt) &&
    (!compPayload || compPayload === draftComp);
  var activeLease = leaseActive(draft.EDIT_LEASE_UNTIL, nowMs);
  var contradictions = Array.isArray(opts.contradictionDetails) ? opts.contradictionDetails.slice() : [];
  if (opts.contradictoryEvidence === true && !contradictions.length) contradictions.push('FLAGGED');
  var rcoRowCount = opts.rcoRowCount != null ? Number(opts.rcoRowCount) : (rcoPresent ? 1 : 0);
  if (rcoRowCount > 1) contradictions.push('DUPLICATE_RCO_ROWS:' + rcoRowCount);

  var semanticYmd = Object.prototype.toString.call(raw) === '[object Date]'
    ? dateTextSim(raw)
    : (isYmd(rawStr) ? rawStr : '');

  // Idempotente: já canônico, C ausente, identidade/unidade ok
  if (semanticYmd && isYmd(semanticYmd)) {
    var stale = [];
    if (!activeOpen) stale.push('STATUS_NOT_ACTIVE');
    if (!(isYmd(B) && B === semanticYmd)) stale.push('B_NE_RECOVERED');
    if (rcoPresent || C) stale.push('C_PRESENT_UNEXPECTED');
    if (!identityParity) stale.push('IDENTITY_MISMATCH');
    if (!unitParity) stale.push('UNIT_MISMATCH');
    if (activeLease) stale.push('ACTIVE_LEASE');
    if (contradictions.length) stale.push('CONTRADICTORY_EVIDENCE');
    if (!stale.length) {
      return {
        ok: true,
        alreadyRecovered: true,
        idempotent: true,
        code: 'ALREADY_RECOVERED',
        safety: 'SAFE',
        reasons: [],
        evidenceMode: EVIDENCE_MODE_CAUSAL,
        scriptTimezone: tz,
        proposedDate: semanticYmd,
        A: A || semanticYmd,
        B: B,
        C: '',
        ROOT_CAUSE_SIGNATURE_MATCH: true,
        identityParity: true,
        unitParity: true,
        activeLease: false,
        contradictoryEvidence: false
      };
    }
    return {
      ok: false,
      alreadyRecovered: true,
      idempotent: false,
      code: 'ALREADY_RECOVERED_BUT_STATE_CHANGED',
      safety: 'UNSAFE',
      reasons: stale,
      evidenceMode: EVIDENCE_MODE_CAUSAL,
      scriptTimezone: tz
    };
  }

  if (!activeOpen) reasons.push('STATUS_NOT_ACTIVE');
  if (!isQuotedIsoDateToken(rawStr)) reasons.push('NOT_QUOTED_ISO');
  if (!(isYmd(A) && isYmd(B) && A === B)) {
    if (isYmd(A) && isYmd(B) && A !== B) reasons.push('A_NE_B');
    else reasons.push('A_NE_B_OR_NOT_CANONICAL');
  }
  if (!isYmd(B)) reasons.push('B_NOT_CANONICAL_YMD');
  if (rcoPresent || C) reasons.push('C_MUST_BE_MISSING');
  if (rcoRowCount > 1) reasons.push('DUPLICATE_RCO_ROWS');

  var sig = rootSig.rootCauseSignatureMatch(rawStr, B, tz);
  if (!sig.ROOT_CAUSE_SIGNATURE_MATCH) reasons.push('ROOT_CAUSE_SIGNATURE_MISMATCH');
  if (!identityParity) reasons.push('IDENTITY_MISMATCH');
  if (!unitParity) reasons.push('UNIT_MISMATCH');
  if (activeLease) reasons.push('ACTIVE_LEASE');
  if (contradictions.length) reasons.push('CONTRADICTORY_EVIDENCE');

  return {
    ok: reasons.length === 0,
    alreadyRecovered: false,
    idempotent: false,
    code: reasons.length === 0 ? 'READY_TO_APPLY_CAUSAL' : 'CAUSAL_GATE_FAILED',
    safety: reasons.length === 0 ? 'SAFE' : 'UNSAFE',
    reasons: reasons,
    evidenceMode: EVIDENCE_MODE_CAUSAL,
    scriptTimezone: tz,
    proposedDate: reasons.length === 0 ? B : '',
    A: A,
    B: B,
    C: C || '',
    SERIALIZED_FROM_B: sig.SERIALIZED_FROM_B,
    RAW_DATA_SERVICO: rawStr,
    ROOT_CAUSE_SIGNATURE_MATCH: !!sig.ROOT_CAUSE_SIGNATURE_MATCH,
    RECONSTRUCTED_DATE_OBJECT_ISO: sig.RECONSTRUCTED_DATE_OBJECT_ISO,
    identityParity: identityParity,
    unitParity: unitParity,
    activeLease: activeLease,
    contradictoryEvidence: contradictions.length > 0,
    contradictionDetails: contradictions,
    rcoRowExpectedAtThisStage: false
  };
}

/**
 * Simula apply causal (teste): snapshot → write um campo → read-back.
 */
function applyCausalSimulated(db, opts) {
  opts = opts || {};
  var reportId = String(opts.reportId || CAUSAL_PILOT_REPORT_ID).trim();
  var row = db.drafts[reportId];
  if (!row) {
    return {
      ok: false,
      aborted: true,
      reasons: ['DRAFT_NOT_FOUND'],
      mutatedDraftRow: false,
      mutatedProductionRows: false,
      evidenceMode: EVIDENCE_MODE_CAUSAL
    };
  }
  var live = {
    reportId: reportId,
    draft: row,
    payload: db.payloads[reportId] || {},
    rco: db.rcos && db.rcos[reportId] ? db.rcos[reportId] : null
  };
  var v = validateCausalApplyPreconditions(live, {
    evidenceMode: opts.evidenceMode,
    scriptTimezone: opts.scriptTimezone || PRODUCTION_SCRIPT_TZ,
    nowMs: opts.nowMs,
    contradictionDetails: opts.contradictionDetails,
    contradictoryEvidence: opts.contradictoryEvidence,
    rcoRowCount: opts.rcoRowCount
  });
  if (v.alreadyRecovered && v.ok && v.idempotent) {
    return {
      ok: true,
      alreadyRecovered: true,
      idempotent: true,
      code: 'ALREADY_RECOVERED',
      safety: 'SAFE',
      mutatedDraftRow: false,
      mutatedProductionRows: false,
      writeFields: [],
      snapshotCreated: false,
      auditEvent: '',
      evidenceMode: EVIDENCE_MODE_CAUSAL,
      readBackOk: true,
      unexpectedChangedFields: [],
      otherFieldsChanged: false
    };
  }
  if (!v.ok) {
    return {
      ok: false,
      aborted: true,
      reasons: v.reasons.slice(),
      code: v.code,
      safety: 'UNSAFE',
      mutatedDraftRow: false,
      mutatedProductionRows: false,
      writeFields: [],
      snapshotCreated: false,
      evidenceMode: EVIDENCE_MODE_CAUSAL,
      causalGateAllPass: false
    };
  }

  var beforeProj = projectDraftRow(row);
  var snapshot = {
    kind: 'PRE_RCO_DATE_RECOVERY',
    evidenceMode: EVIDENCE_MODE_CAUSAL,
    reportId: reportId,
    scriptTimezone: v.scriptTimezone,
    serializedFromB: v.SERIALIZED_FROM_B,
    rawDataServico: v.RAW_DATA_SERVICO,
    A: v.A,
    B: v.B,
    C: 'MISSING_PRE_CONSOLIDATION',
    draftRow: JSON.parse(JSON.stringify(row)),
    payload: JSON.parse(JSON.stringify(live.payload))
  };
  db.snapshots = db.snapshots || [];
  db.snapshots.push(snapshot);

  var beforeRaw = String(row.DATA_SERVICO);
  row.DATA_SERVICO = v.proposedDate;
  if (typeof opts.injectSideEffect === 'function') opts.injectSideEffect(row);
  db.writes = db.writes || [];
  db.writes.push({ field: 'DATA_SERVICO', from: beforeRaw, to: v.proposedDate });

  if (opts.simulateReadbackFail) {
    row.DATA_SERVICO = opts.simulateReadbackFail === true ? beforeRaw : opts.simulateReadbackFail;
  }

  var afterProj = projectDraftRow(row);
  var unexpectedChangedFields = diffDraftRowsExcludingDate(beforeProj, afterProj);
  var otherFieldsChanged = unexpectedChangedFields.length > 0;
  var afterYmd = isYmd(row.DATA_SERVICO) ? String(row.DATA_SERVICO) : dateTextSim(row.DATA_SERVICO);
  var readBackOk = afterYmd === v.proposedDate && !otherFieldsChanged;

  db.audits = db.audits || [];
  if (!readBackOk) {
    db.audits.push({ action: 'RCO_DATE_CAUSAL_RECOVERY_READBACK_FAILED', reportId: reportId });
    return {
      ok: false,
      aborted: true,
      code: 'READBACK_FAILED',
      safety: 'UNSAFE',
      mutatedDraftRow: true,
      mutatedProductionRows: false,
      writeFields: ['DATA_SERVICO'],
      snapshotCreated: true,
      readBackOk: false,
      unexpectedChangedFields: unexpectedChangedFields,
      otherFieldsChanged: otherFieldsChanged,
      evidenceMode: EVIDENCE_MODE_CAUSAL,
      auditEvent: 'RCO_DATE_CAUSAL_RECOVERY_READBACK_FAILED'
    };
  }

  db.audits.push({
    action: 'RCO_DATE_CAUSAL_RECOVERY_APPLIED',
    reportId: reportId,
    evidenceMode: EVIDENCE_MODE_CAUSAL,
    before: beforeRaw,
    after: v.proposedDate,
    A: v.A,
    B: v.B,
    C: 'MISSING_PRE_CONSOLIDATION',
    scriptTimezone: v.scriptTimezone,
    serializedFromB: v.SERIALIZED_FROM_B,
    rootCauseSignatureMatch: true
  });

  return {
    ok: true,
    alreadyRecovered: false,
    idempotent: false,
    code: 'CAUSAL_APPLIED',
    safety: 'SAFE',
    mutatedDraftRow: true,
    mutatedProductionRows: false,
    writeFields: ['DATA_SERVICO'],
    snapshotCreated: true,
    readBackOk: true,
    unexpectedChangedFields: [],
    otherFieldsChanged: false,
    evidenceMode: EVIDENCE_MODE_CAUSAL,
    auditEvent: 'RCO_DATE_CAUSAL_RECOVERY_APPLIED',
    postApply: { DATA_SERVICO: afterYmd, STATUS: String(row.STATUS || ''), REVISAO: Number(row.REVISAO || 0), PAYLOAD_HASH: String(row.PAYLOAD_HASH || '') },
    proposedDate: v.proposedDate,
    causalGateAllPass: true,
    ROOT_CAUSE_SIGNATURE_MATCH: true,
    scriptTimezone: v.scriptTimezone,
    A: v.A,
    B: v.B,
    C: ''
  };
}

/**
 * Serial causal (Node): um por vez, stop-on-first-error.
 */
function applySerialCausal(db, ids, opts) {
  opts = opts || {};
  ids = ids || FASE7B_CAUSAL_IDS;
  var results = [];
  var recovered = [];
  for (var i = 0; i < ids.length; i++) {
    var id = ids[i];
    var out = applyCausalSimulated(db, {
      reportId: id,
      evidenceMode: opts.evidenceMode || EVIDENCE_MODE_CAUSAL,
      scriptTimezone: opts.scriptTimezone || PRODUCTION_SCRIPT_TZ,
      nowMs: opts.nowMs,
      contradictionDetails: opts.contradictionDetailsById && opts.contradictionDetailsById[id],
      contradictoryEvidence: opts.contradictoryById && opts.contradictoryById[id],
      rcoRowCount: opts.rcoRowCountById && opts.rcoRowCountById[id]
    });
    out.reportId = id;
    results.push(out);
    if (out.ok && (out.mutatedDraftRow || (out.alreadyRecovered && out.idempotent))) {
      recovered.push(id);
    }
    if (!out.ok) {
      return {
        ok: false,
        serialSequenceCompleted: false,
        abortedReportId: id,
        abortReason: String(out.code || (out.reasons || []).join(',') || 'UNKNOWN'),
        recoveredReportIds: recovered.slice(),
        results: results
      };
    }
  }
  return {
    ok: true,
    serialSequenceCompleted: true,
    abortedReportId: '',
    abortReason: '',
    recoveredReportIds: recovered.slice(),
    results: results
  };
}

module.exports = {
  PILOT_APPLY_EXPECTED: PILOT_APPLY_EXPECTED,
  CAUSAL_PILOT_REPORT_ID: CAUSAL_PILOT_REPORT_ID,
  FASE7B_CAUSAL_IDS: FASE7B_CAUSAL_IDS,
  EVIDENCE_MODE_CAUSAL: EVIDENCE_MODE_CAUSAL,
  PRODUCTION_SCRIPT_TZ: PRODUCTION_SCRIPT_TZ,
  RCO_SNAPSHOT_FOLDER_PROP: RCO_SNAPSHOT_FOLDER_PROP,
  RCO_SNAPSHOT_FOLDER_NAME: RCO_SNAPSHOT_FOLDER_NAME,
  FASE3_ACTIVE_ABC_IDS: [
    'cpu-aa7032a3-6927-4c86-8668-4a9cfc96ed73',
    'cpu-5adae17b-0962-43a5-8663-713e29ae12ae',
    'cpu-51cac595-eb20-4937-8fea-ca0e0bf53ddf',
    'cpu-b5a23368-278a-4d7c-8464-8f7cb198a6dd'
  ],
  FASE5_FINALIZED_ABC_IDS: [
    'cpu-22d239b0-587f-4600-b904-95711903e6de',
    'cpu-470f389e-7e9a-4cbc-a3aa-6d8581ca4de9',
    'cpu-eef891bf-09bc-42e2-8c8f-dc97f2a5f13a',
    'cpu-8d421d4c-7d53-43c0-8fc8-722ffae58d66',
    'cpu-2a0dbb2d-18b1-4016-9483-83c9c9b53e76'
  ],
  isQuotedIsoDateToken: isQuotedIsoDateToken,
  extractYmdFromQuotedIso: extractYmdFromQuotedIso,
  isYmd: isYmd,
  leaseActive: leaseActive,
  dateTextSim: dateTextSim,
  projectDraftRow: projectDraftRow,
  diffDraftRowsExcludingDate: diffDraftRowsExcludingDate,
  simulatePostPatchDateText: simulatePostPatchDateText,
  buildManifest: buildManifest,
  dryRun: dryRun,
  validateApplyPreconditions: validateApplyPreconditions,
  applySimulated: applySimulated,
  buildExpectedFromLive: buildExpectedFromLive,
  applySerialActiveAbc: applySerialActiveAbc,
  validateCausalApplyPreconditions: validateCausalApplyPreconditions,
  applyCausalSimulated: applyCausalSimulated,
  applySerialCausal: applySerialCausal
};
