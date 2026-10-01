/**
 * Recuperação seletiva DATA_SERVICO (quoted-ISO) em RCO_RASCUNHOS.
 *
 * FASE 1: DRY-RUN / manifest / simulação — ZERO writes.
 * NÃO altera prevenção 10.8.38 (rcoDraftPrepareRowForWrite_).
 * NÃO altera dateText_.
 */
'use strict';

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

module.exports = {
  isQuotedIsoDateToken: isQuotedIsoDateToken,
  extractYmdFromQuotedIso: extractYmdFromQuotedIso,
  isYmd: isYmd,
  leaseActive: leaseActive,
  dateTextSim: dateTextSim,
  simulatePostPatchDateText: simulatePostPatchDateText,
  buildManifest: buildManifest,
  dryRun: dryRun
};
