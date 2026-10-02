/**
 * Assinatura determinística da causa raiz DATA_SERVICO (quoted-ISO).
 *
 * Bug conhecido:
 *   Date (meia-noite civil no timezone do script)
 *   → JSON.stringify(Date)  // rowFor_ trata object
 *   → célula literal "YYYY-MM-DDTHH:mm:ss.sssZ" (com aspas)
 *
 * CAUSAL_EVIDENCE — NÃO é terceira fonte histórica independente (D).
 */
'use strict';

var DEFAULT_SCRIPT_TZ = 'America/Fortaleza';

/** Espelho documentado: linha RCO na aba RCO só nasce em rcoConsolidateFinal_/rcoSupplementalUpsertBody_. */
var RCO_TABLE_ROW_EXPECTED_BEFORE_CONSOLIDATION = false;

function isYmd(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '').trim());
}

function isQuotedIsoDateToken(v) {
  if (v == null || v === '') return false;
  if (Object.prototype.toString.call(v) === '[object Date]') return false;
  return /^"\d{4}-\d{2}-\d{2}T/.test(String(v).replace(/\u00a0/g, ' ').trim());
}

function extractYmdFromQuotedIso(v) {
  var m = String(v || '').replace(/\u00a0/g, ' ').trim().match(/^"?(\d{4}-\d{2}-\d{2})T/);
  return m ? m[1] : '';
}

/**
 * Offset local−UTC (ms) no instante `date` para IANA `timeZone`, via Intl (sem offset fixo).
 */
function getTimezoneOffsetMs(date, timeZone) {
  var dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  });
  var partsObj = {};
  dtf.formatToParts(date).forEach(function (p) {
    if (p.type !== 'literal') partsObj[p.type] = p.value;
  });
  var hour = Number(partsObj.hour);
  if (hour === 24) hour = 0;
  var asUTC = Date.UTC(
    Number(partsObj.year),
    Number(partsObj.month) - 1,
    Number(partsObj.day),
    hour,
    Number(partsObj.minute),
    Number(partsObj.second)
  );
  return asUTC - date.getTime();
}

/**
 * Date = meia-noite civil de `ymd` no timezone efetivo (equivalente a
 * Utilities.parseDate(ymd+' 00:00:00', scriptTz, 'yyyy-MM-dd HH:mm:ss')).
 */
function zonedCivilMidnightDate(ymd, timeZone) {
  if (!isYmd(ymd)) return null;
  timeZone = timeZone || DEFAULT_SCRIPT_TZ;
  var p = String(ymd).trim().split('-').map(Number);
  var y = p[0];
  var m = p[1];
  var d = p[2];
  var wall = Date.UTC(y, m - 1, d, 0, 0, 0);
  var guess = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  var offset = getTimezoneOffsetMs(guess, timeZone);
  var instant = wall - offset;
  offset = getTimezoneOffsetMs(new Date(instant), timeZone);
  instant = wall - offset;
  var out = new Date(instant);
  if (isNaN(out.getTime())) return null;
  return out;
}

/**
 * Serialização idêntica ao bug: JSON.stringify(Date).
 * Retorno inclui as aspas literais, ex.: `"2026-09-30T03:00:00.000Z"`.
 */
function serializeBugQuotedIsoFromYmd(ymd, timeZone) {
  var dt = zonedCivilMidnightDate(ymd, timeZone);
  if (!dt) return '';
  return JSON.stringify(dt);
}

function rootCauseSignatureMatch(rawCorrupted, payloadYmd, timeZone) {
  var raw = String(rawCorrupted == null ? '' : rawCorrupted).replace(/\u00a0/g, ' ').trim();
  var b = String(payloadYmd || '').trim();
  var serialized = serializeBugQuotedIsoFromYmd(b, timeZone);
  return {
    B_PAYLOAD_YMD: b,
    SCRIPT_TIMEZONE: timeZone || DEFAULT_SCRIPT_TZ,
    RECONSTRUCTED_DATE_OBJECT_ISO: zonedCivilMidnightDate(b, timeZone)
      ? zonedCivilMidnightDate(b, timeZone).toISOString()
      : '',
    SERIALIZED_FROM_B: serialized,
    RAW_CORRUPTED: raw,
    ROOT_CAUSE_SIGNATURE_MATCH: !!serialized && raw === serialized
  };
}

/**
 * Classificação causal (Node mirror do auditor GAS).
 * item: campos já relidos (não aplica writes).
 */
function classifyCausalRecovery(item) {
  item = item || {};
  var status = String(item.STATUS || '');
  var active = status === 'EM_ANDAMENTO' || status === 'EM_RETIFICACAO';
  var raw = item.RAW_DATA_SERVICO;
  var A = String(item.A_QUOTED_YMD || extractYmdFromQuotedIso(raw) || '').trim();
  var B = String(item.B_PAYLOAD_YMD || '').trim();
  var C = String(item.C_RCO || '').trim();
  var tz = item.SCRIPT_TIMEZONE || DEFAULT_SCRIPT_TZ;
  var sig = rootCauseSignatureMatch(raw, B, tz);
  var identityParity = item.IDENTITY_PARITY === true;
  var unitParity = item.UNIT_PARITY === true;
  var activeLease = item.ACTIVE_LEASE === true;
  var contradictory = !!(item.CONTRADICTORY_EVIDENCE === true ||
    (Array.isArray(item.CONTRADICTION_DETAILS) && item.CONTRADICTION_DETAILS.length));
  var rcoRowExpected = item.RCO_ROW_EXPECTED_AT_THIS_STAGE;
  if (rcoRowExpected == null) rcoRowExpected = RCO_TABLE_ROW_EXPECTED_BEFORE_CONSOLIDATION;

  var blockReasons = [];
  if (!active) blockReasons.push('STATUS_NOT_ACTIVE');
  if (!isQuotedIsoDateToken(raw)) blockReasons.push('NOT_QUOTED_ISO');
  if (!(isYmd(A) && isYmd(B) && A === B)) {
    if (isYmd(A) && isYmd(B) && A !== B) {
      return {
        CLASSIFICATION: 'AMBIGUOUS',
        PROPOSED_DATE: '',
        ROOT_CAUSE_SIGNATURE_MATCH: sig.ROOT_CAUSE_SIGNATURE_MATCH,
        signature: sig,
        blockReasons: ['A_NE_B']
      };
    }
    blockReasons.push('A_NE_B_OR_NOT_CANONICAL');
  }
  if (!isYmd(B)) blockReasons.push('B_NOT_CANONICAL_YMD');
  if (!sig.ROOT_CAUSE_SIGNATURE_MATCH) blockReasons.push('ROOT_CAUSE_SIGNATURE_MISMATCH');
  if (!identityParity) blockReasons.push('IDENTITY_MISMATCH');
  if (!unitParity) blockReasons.push('UNIT_MISMATCH');
  if (activeLease) blockReasons.push('ACTIVE_LEASE');
  if (contradictory) blockReasons.push('CONTRADICTORY_EVIDENCE');
  if (rcoRowExpected === true && !C) blockReasons.push('C_UNEXPECTEDLY_MISSING');
  if (rcoRowExpected === false && C) {
    // C presente muda o caso (não é o grupo A=B/C ausente) — bloquear neste classificador
    blockReasons.push('C_PRESENT_UNEXPECTED_IN_AB_MISSING_GROUP');
  }

  if (blockReasons.length) {
    return {
      CLASSIFICATION: 'CAUSAL_BLOCKED',
      PROPOSED_DATE: '',
      ROOT_CAUSE_SIGNATURE_MATCH: sig.ROOT_CAUSE_SIGNATURE_MATCH,
      signature: sig,
      blockReasons: blockReasons
    };
  }
  return {
    CLASSIFICATION: 'CAUSAL_RECOVERY_CANDIDATE',
    PROPOSED_DATE: B,
    ROOT_CAUSE_SIGNATURE_MATCH: true,
    signature: sig,
    blockReasons: []
  };
}

module.exports = {
  DEFAULT_SCRIPT_TZ: DEFAULT_SCRIPT_TZ,
  RCO_TABLE_ROW_EXPECTED_BEFORE_CONSOLIDATION: RCO_TABLE_ROW_EXPECTED_BEFORE_CONSOLIDATION,
  isYmd: isYmd,
  isQuotedIsoDateToken: isQuotedIsoDateToken,
  extractYmdFromQuotedIso: extractYmdFromQuotedIso,
  getTimezoneOffsetMs: getTimezoneOffsetMs,
  zonedCivilMidnightDate: zonedCivilMidnightDate,
  serializeBugQuotedIsoFromYmd: serializeBugQuotedIsoFromYmd,
  rootCauseSignatureMatch: rootCauseSignatureMatch,
  classifyCausalRecovery: classifyCausalRecovery
};
