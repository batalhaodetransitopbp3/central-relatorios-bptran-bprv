/**
 * Recuperação seletiva DATA_SERVICO (quoted-ISO) em RCO_RASCUNHOS.
 *
 * FASE 1: DRY-RUN / manifest — ZERO writes.
 * FASE 2: apply controlado (piloto) — um campo, com preconditions/snapshot.
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

var dateWrite = null;
try {
  dateWrite = require('./rco_draft_date_write.js');
} catch (_) {
  dateWrite = null;
}

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
        'criar snapshot imutável PRE_RCO_DATE_RECOVERY',
        'alterar SOMENTE DATA_SERVICO → YYYY-MM-DD',
        'read-back + audit before/after',
        'idempotente se já YYYY-MM-DD esperado'
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
 * @returns {{ok:boolean, alreadyRecovered?:boolean, reasons:string[], checks:object}}
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

  // Idempotente: já recuperado (YMD string ou Date serializado como YMD)
  var semanticYmd = Object.prototype.toString.call(raw) === '[object Date]'
    ? dateTextSim(raw)
    : (isYmd(rawStr) ? rawStr : '');
  if (semanticYmd === expected.expectedDate) {
    var idOk = reportId === expected.reportId && reportId === rcoReportId && reportId === stateReportId;
    var dateOk = payloadInicio === expected.expectedDate && rcoDate === expected.expectedDate;
    var unitOk = normUnit(draft.BATALHAO) === expected.batalhao && normUnit(draft.COMPANHIA) === expected.companhia;
    if (idOk && dateOk && unitOk && !activeLease) {
      return {
        ok: true,
        alreadyRecovered: true,
        reasons: [],
        checks: Object.assign(checks, {
          alreadyYmd: true,
          identityParity: true,
          dateEvidenceParity: true,
          activeEditRisk: false
        })
      };
    }
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
    reasons: reasons,
    checks: checks,
    expectedDate: expected.expectedDate,
    currentDateRaw: rawStr
  };
}

/**
 * Simula apply (teste): snapshot → write um campo → read-back.
 * db.drafts[reportId] = row object; db.writes = log.
 */
function applySimulated(db, expected, opts) {
  opts = opts || {};
  expected = expected || PILOT_APPLY_EXPECTED;
  var reportId = expected.reportId;
  var row = db.drafts[reportId];
  if (!row) return { ok: false, aborted: true, reasons: ['DRAFT_NOT_FOUND'] };
  var live = {
    reportId: reportId,
    draft: row,
    payload: db.payloads[reportId] || {},
    rco: db.rcos[reportId] || {}
  };
  var v = validateApplyPreconditions(live, expected, opts);
  if (v.alreadyRecovered) {
    return {
      ok: true,
      alreadyRecovered: true,
      idempotent: true,
      mutated: false,
      writeFields: [],
      snapshotCreated: false
    };
  }
  if (!v.ok) {
    return { ok: false, aborted: true, reasons: v.reasons.slice(), mutated: false, writeFields: [] };
  }
  var snapshot = {
    kind: 'PRE_RCO_DATE_RECOVERY',
    reportId: reportId,
    before: String(row.DATA_SERVICO),
    expectedDate: expected.expectedDate,
    revision: Number(row.REVISAO || 0),
    payloadHash: String(row.PAYLOAD_HASH || ''),
    draftRow: JSON.parse(JSON.stringify(row)),
    payload: JSON.parse(JSON.stringify(live.payload)),
    rcoRow: JSON.parse(JSON.stringify(live.rco))
  };
  db.snapshots = db.snapshots || [];
  db.snapshots.push(snapshot);
  // write ONLY DATA_SERVICO
  var beforeKeys = Object.keys(row).slice().sort();
  var beforeClone = JSON.parse(JSON.stringify(row));
  row.DATA_SERVICO = expected.expectedDate;
  db.writes = db.writes || [];
  db.writes.push({ field: 'DATA_SERVICO', from: beforeClone.DATA_SERVICO, to: row.DATA_SERVICO });
  var afterKeys = Object.keys(row).slice().sort();
  var otherChanged = beforeKeys.filter(function (k) {
    if (k === 'DATA_SERVICO') return false;
    return JSON.stringify(beforeClone[k]) !== JSON.stringify(row[k]);
  });
  return {
    ok: true,
    alreadyRecovered: false,
    idempotent: false,
    mutated: true,
    writeFields: ['DATA_SERVICO'],
    snapshotCreated: true,
    snapshot: snapshot,
    postApply: {
      DATA_SERVICO: row.DATA_SERVICO,
      STATUS: row.STATUS,
      REVISAO: row.REVISAO,
      PAYLOAD_HASH: row.PAYLOAD_HASH
    },
    otherFieldsChanged: otherChanged,
    keysUnchanged: afterKeys.join('|') === beforeKeys.join('|')
  };
}

module.exports = {
  PILOT_APPLY_EXPECTED: PILOT_APPLY_EXPECTED,
  isQuotedIsoDateToken: isQuotedIsoDateToken,
  extractYmdFromQuotedIso: extractYmdFromQuotedIso,
  isYmd: isYmd,
  leaseActive: leaseActive,
  dateTextSim: dateTextSim,
  simulatePostPatchDateText: simulatePostPatchDateText,
  buildManifest: buildManifest,
  dryRun: dryRun,
  validateApplyPreconditions: validateApplyPreconditions,
  applySimulated: applySimulated
};
