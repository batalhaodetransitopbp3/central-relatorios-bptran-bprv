/**
 * Prevenção DATA_SERVICO — RCO_RASCUNHOS (10.8.38+)
 *
 * findOne_ lê Date via getValues(); rowFor_ faz JSON.stringify(object)
 * → célula vira literal "2026-10-01T03:00:00.000Z" (com aspas).
 *
 * Este módulo normaliza Date → YYYY-MM-DD (DATA_SERVICO) / ISO (demais)
 * ANTES do upsert, sem reparar strings históricas já corrompidas.
 */
'use strict';

function isDateObject(v) {
  return Object.prototype.toString.call(v) === '[object Date]';
}

function pad2(n) {
  return (n < 10 ? '0' : '') + n;
}

/** Format YYYY-MM-DD in America/Fortaleza-equivalent local components (test double). */
function formatYmdLocal(d) {
  if (!isDateObject(d) || isNaN(d.getTime())) return '';
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

function formatIsoLocal(d) {
  if (!isDateObject(d) || isNaN(d.getTime())) return '';
  return formatYmdLocal(d) + 'T' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
}

/**
 * Espelho de rowFor_ (GAS) — reproduz a corrupção.
 */
function rowForLegacy(headers, obj) {
  return headers.map(function (k) {
    var v = Object.prototype.hasOwnProperty.call(obj, k) ? obj[k] : '';
    if (v === undefined || v === null) return '';
    if (typeof v === 'object') return JSON.stringify(v);
    return v;
  });
}

/**
 * @param {object} row
 * @param {{formatYmd?:Function, formatIso?:Function}} [opts]
 */
function prepareRcoDraftRowForWrite(row, opts) {
  if (!row) return row;
  opts = opts || {};
  var ymd = opts.formatYmd || formatYmdLocal;
  var iso = opts.formatIso || formatIsoLocal;
  Object.keys(row).forEach(function (k) {
    if (k === '_row') return;
    var v = row[k];
    if (!isDateObject(v)) return;
    if (isNaN(v.getTime())) {
      row[k] = '';
      return;
    }
    if (k === 'DATA_SERVICO') row[k] = ymd(v);
    else row[k] = iso(v);
  });
  return row;
}

function isQuotedIsoDateToken(v) {
  if (v == null || v === '') return false;
  if (isDateObject(v)) return false;
  var s = String(v).replace(/\u00a0/g, ' ').replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '');
  return /^"\d{4}-\d{2}-\d{2}T/.test(s);
}

/** Extrai YYYY-MM-DD de `"2026-10-01T03:00:00.000Z"` ou ISO sem aspas. */
function extractYmdFromQuotedIso(v) {
  if (v == null || v === '') return '';
  var s = String(v).replace(/\u00a0/g, ' ').replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '');
  var m = s.match(/^"?(\d{4}-\d{2}-\d{2})T/);
  return m ? m[1] : '';
}

function classifyQuotedIsoRecovery(item) {
  item = item || {};
  var draftRaw = item.draftDataServico;
  var payloadInicio = String(item.payloadPeriodoInicio || '').trim();
  var rcoData = String(item.rcoDataServico || '').trim();
  var ymd = /^\d{4}-\d{2}-\d{2}$/;
  var fromDraft = extractYmdFromQuotedIso(draftRaw);
  if (!isQuotedIsoDateToken(draftRaw)) {
    return { class: 'NOT_QUOTED_ISO', reason: 'DATA_SERVICO do draft não é ISO com aspas' };
  }
  if (ymd.test(payloadInicio) && ymd.test(rcoData) && payloadInicio === rcoData) {
    return {
      class: 'SAFE_RECOVERY',
      reason: 'payload.periodo.inicio === aba RCO.DATA_SERVICO (YYYY-MM-DD); draft quoted-ISO alinhado'
    };
  }
  // Evidência forte: aba RCO canônica bate com YMD embutido no token corrompido
  if (ymd.test(rcoData) && fromDraft && fromDraft === rcoData) {
    return {
      class: 'SAFE_RECOVERY',
      reason: 'aba RCO.DATA_SERVICO === YMD embutido no quoted-ISO do draft'
    };
  }
  if (ymd.test(payloadInicio) && fromDraft && payloadInicio === fromDraft && !rcoData) {
    return {
      class: 'SAFE_RECOVERY',
      reason: 'payload.periodo.inicio === YMD embutido no quoted-ISO; sem conflito na aba RCO'
    };
  }
  if (ymd.test(payloadInicio) && ymd.test(rcoData) && payloadInicio !== rcoData) {
    return {
      class: 'AMBIGUOUS',
      reason: 'payload.periodo.inicio ≠ aba RCO.DATA_SERVICO'
    };
  }
  if (ymd.test(payloadInicio) && !rcoData) {
    return {
      class: 'AMBIGUOUS',
      reason: 'payload.periodo.inicio canônico, sem linha RCO para confirmar'
    };
  }
  if (!ymd.test(payloadInicio) && !ymd.test(rcoData)) {
    return { class: 'NO_EVIDENCE', reason: 'sem periodo.inicio canônico nem RCO.DATA_SERVICO' };
  }
  return { class: 'AMBIGUOUS', reason: 'evidência parcial ou inconsistente' };
}

module.exports = {
  isDateObject: isDateObject,
  formatYmdLocal: formatYmdLocal,
  formatIsoLocal: formatIsoLocal,
  rowForLegacy: rowForLegacy,
  prepareRcoDraftRowForWrite: prepareRcoDraftRowForWrite,
  isQuotedIsoDateToken: isQuotedIsoDateToken,
  extractYmdFromQuotedIso: extractYmdFromQuotedIso,
  classifyQuotedIsoRecovery: classifyQuotedIsoRecovery
};
