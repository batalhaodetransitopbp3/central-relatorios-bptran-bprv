/**
 * Escopo obrigatório do RCO: DATA OPERACIONAL ∧ BATALHÃO ∧ COMPANHIA.
 * 1ª CPTran ≠ 1ª CPRv — ordinal sozinho nunca identifica companhia.
 * Batalhão: allowlist estrita BPTran|BPRv (sem fallback).
 */
(function (global) {
  'use strict';

  function filled(v) {
    return String(v == null ? '' : v).replace(/\u00a0/g, ' ').trim() !== '';
  }

  function dateText(v) {
    if (!v) return '';
    if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
      const y = v.getFullYear();
      const m = String(v.getMonth() + 1).padStart(2, '0');
      const d = String(v.getDate()).padStart(2, '0');
      return y + '-' + m + '-' + d;
    }
    const s = String(v).trim().replace(/^"+|"+$/g, '');
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    return s.slice(0, 10);
  }

  /** Allowlist estrita. Desconhecido → '' (nunca inventa BPTran). */
  function normBattalion(v) {
    const s = String(v || '').replace(/\u00a0/g, ' ').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!s) return '';
    if (s === 'BPRV') return 'BPRv';
    if (s === 'BPTRAN') return 'BPTran';
    return '';
  }

  function companyNumber(v) {
    const m = String(v == null ? '' : v).match(/\d+/);
    return m ? Number(m[0]) : 0;
  }

  function companyTipoFromLabel(v) {
    const s = String(v || '').toUpperCase();
    if (s.indexOf('CPRV') >= 0) return 'CPRv';
    if (s.indexOf('CPTRAN') >= 0) return 'CPTran';
    return '';
  }

  function normCompany(batalhao, companhiaOrNumero) {
    const b = normBattalion(batalhao);
    if (!b) return '';
    const n = companyNumber(companhiaOrNumero);
    if (!n) return '';
    const tipoFromLabel = companyTipoFromLabel(companhiaOrNumero);
    const tipoWanted = b === 'BPRv' ? 'CPRv' : 'CPTran';
    if (tipoFromLabel && tipoFromLabel !== tipoWanted) return '';
    return n + 'ª ' + tipoWanted;
  }

  function resolveUnitScope(p) {
    p = p || {};
    const batt = normBattalion(p.batalhao || p.batalhaoSigla || (p.unidade && (p.unidade.batalhao || p.unidade.batalhaoSigla)) || '');
    const rawComp = p.companhia != null && p.companhia !== ''
      ? p.companhia
      : (p.unidade && p.unidade.companhia);
    const rawNum = p.companhiaNumero != null && p.companhiaNumero !== ''
      ? p.companhiaNumero
      : (p.unidade && p.unidade.companhiaNumero);
    const companhia = filled(rawComp) ? normCompany(batt, rawComp) : (batt ? normCompany(batt, rawNum) : '');
    return {
      batalhao: batt,
      companhia: companhia,
      companhiaNumero: companyNumber(companhia || rawNum || rawComp),
      companhiaCodigo: batt && companhia
        ? (batt.toUpperCase() + '_' + companyNumber(companhia) + '_' + (batt === 'BPRv' ? 'CPRV' : 'CPTRAN'))
        : ''
    };
  }

  function requireUnitScope(p) {
    const s = resolveUnitScope(p);
    if (!s.batalhao) throw new Error('MISSING_UNIT_SCOPE: Consulta de RCO exige batalhão válido (BPTran|BPRv).');
    if (!s.companhia) throw new Error('MISSING_UNIT_SCOPE: Consulta de RCO exige companhia canônica (batalhão + companhia).');
    return s;
  }

  function requireOperationalDate(p) {
    p = p || {};
    const d = dateText(p.data || p.operationalDate || '');
    if (!d) throw new Error('MISSING_OPERATIONAL_DATE: Consulta de RCO exige data operacional.');
    return d;
  }

  /** Espelha rsdListDateSet_: data/operationalDate, datas[], dataInicio/dataFim. */
  function rsdListHasTemporalScope(p) {
    p = p || {};
    if (dateText(p.data || p.operationalDate || '')) return true;
    if (p.datas != null && String(p.datas).trim() !== '') return true;
    if (dateText(p.dataInicio || '') || dateText(p.dataFim || p.dataTermino || '')) return true;
    return false;
  }

  function requireRcoListScope(p) {
    requireUnitScope(p);
    if (!rsdListHasTemporalScope(p)) {
      throw new Error('MISSING_OPERATIONAL_DATE: Listagem RCO exige data/período operacional.');
    }
    return true;
  }

  function sheetUnitCanon(row) {
    row = row || {};
    const battRaw = row.BATALHAO != null ? row.BATALHAO : (row.batalhao || '');
    const compRaw = row.COMPANHIA != null ? row.COMPANHIA : (row.companhia || '');
    if (!filled(battRaw) || !filled(compRaw)) {
      return { batalhao: '', companhia: '', valid: false, reason: 'MISSING_UNIT' };
    }
    const b = normBattalion(battRaw);
    if (!b) return { batalhao: '', companhia: '', valid: false, reason: 'INVALID_BATTALION' };
    const tipoLabel = companyTipoFromLabel(compRaw);
    const tipoWanted = b === 'BPRv' ? 'CPRv' : 'CPTran';
    if (tipoLabel && tipoLabel !== tipoWanted) {
      return { batalhao: b, companhia: '', valid: false, reason: 'UNIT_TYPE_MISMATCH' };
    }
    const c = normCompany(b, compRaw);
    if (!c) return { batalhao: b, companhia: '', valid: false, reason: 'INVALID_COMPANY' };
    return { batalhao: b, companhia: c, valid: true, reason: '' };
  }

  function sameUnitScope(row, scope) {
    const u = sheetUnitCanon(row);
    if (!u.valid || !scope || !scope.batalhao || !scope.companhia) return false;
    return u.batalhao === scope.batalhao && u.companhia === scope.companhia;
  }

  function operationalDateOf(row, helper) {
    row = row || {};
    const data = row.DATA_SERVICO != null ? row.DATA_SERVICO : (row.data || row.operationalDate || '');
    const iniciado = row.INICIADO_EM != null ? row.INICIADO_EM : (row.iniciadoEm || '');
    if (typeof helper === 'function') {
      try {
        const op = helper(data, iniciado);
        if (op) return dateText(op);
      } catch (_) {}
    }
    if (row.operationalDate) return dateText(row.operationalDate);
    return dateText(data);
  }

  function matchesRcoScope(row, scope, opDate, helper) {
    if (!sameUnitScope(row, scope)) return false;
    if (!opDate) return true;
    return operationalDateOf(row, helper) === dateText(opDate);
  }

  function filterRowsForRco(rows, scopeInput, opDate, helper) {
    const scope = requireUnitScope(scopeInput);
    const wantDate = dateText(opDate);
    const out = [];
    const rejected = [];
    (rows || []).forEach(function (row) {
      const u = sheetUnitCanon(row);
      if (!u.valid) {
        rejected.push({ row: row, reason: u.reason || 'INVALID_UNIT' });
        return;
      }
      if (!sameUnitScope(row, scope)) {
        rejected.push({ row: row, reason: 'OTHER_UNIT' });
        return;
      }
      if (wantDate && operationalDateOf(row, helper) !== wantDate) {
        rejected.push({ row: row, reason: 'OTHER_DATE' });
        return;
      }
      out.push(row);
    });
    return { scope: scope, items: out, rejected: rejected };
  }

  /** Espelha política de rsdList_: flags do cliente NUNCA habilitam unscoped. */
  function rsdListAllowUnscoped(clientParams, internalOpt) {
    void clientParams;
    return !!(internalOpt && internalOpt.allowUnscoped === true);
  }

  /**
   * Política de rsd-get (espelho do backend).
   * mode: 'rco' | 'rsd' | 'comando'
   */
  function rsdGetAccessDecision(p, row) {
    p = p || {};
    row = row || {};
    const module = String(p.module || p.forModule || '').toUpperCase();
    if (module === 'RSD') {
      if (p._tokenKind !== 'central' && p._tokenKind !== 'comando') {
        return { ok: false, code: 'MISSING_UNIT_SCOPE', reason: 'RSD module requires central/comando token' };
      }
      return { ok: true, path: 'RSD_OPERATIONAL' };
    }
    if (module === 'COMANDO' || module === 'SISTEMA') {
      if (p._tokenKind !== 'comando') {
        return { ok: false, code: 'MISSING_UNIT_SCOPE', reason: 'admin rsd-get requires comando token' };
      }
      return { ok: true, path: 'COMANDO' };
    }
    let scope, wantDate;
    try { scope = requireUnitScope(p); }
    catch (e) { return { ok: false, code: 'MISSING_UNIT_SCOPE', reason: String(e && e.message || e) }; }
    try { wantDate = requireOperationalDate(p); }
    catch (e) { return { ok: false, code: 'MISSING_OPERATIONAL_DATE', reason: String(e && e.message || e) }; }
    if (!sameUnitScope(row, scope)) {
      return { ok: false, code: 'OUT_OF_RCO_SCOPE', reason: 'unit mismatch', scope: scope };
    }
    const op = operationalDateOf(row, function (d) { return dateText(d); });
    if (op !== wantDate) return { ok: false, code: 'OUT_OF_RCO_SCOPE', reason: 'date mismatch', scope: scope, wantDate: wantDate };
    return { ok: true, path: 'RCO_SCOPED', scope: scope, wantDate: wantDate };
  }

  function rcoDraftAccessDecision(p, row) {
    p = p || {};
    row = row || {};
    let scope, wantDate;
    try { scope = requireUnitScope(p); }
    catch (e) { return { ok: false, code: 'MISSING_UNIT_SCOPE', reason: String(e && e.message || e) }; }
    try { wantDate = requireOperationalDate(p); }
    catch (e) { return { ok: false, code: 'MISSING_OPERATIONAL_DATE', reason: String(e && e.message || e) }; }
    if (!sameUnitScope(row, scope)) {
      return { ok: false, code: 'OUT_OF_RCO_SCOPE', reason: 'unit mismatch', scope: scope };
    }
    const rowDate = dateText(row.DATA_SERVICO != null ? row.DATA_SERVICO : (row.data || ''));
    if (rowDate !== wantDate) {
      return { ok: false, code: 'OUT_OF_RCO_SCOPE', reason: 'date mismatch', scope: scope, wantDate: wantDate };
    }
    return { ok: true, scope: scope, wantDate: wantDate };
  }

  function payloadUnit(p) {
    p = p || {};
    return resolveUnitScope(p.unidade || {
      batalhao: p.batalhao,
      companhia: p.companhia,
      companhiaNumero: p.companhiaNumero
    });
  }

  const api = {
    filled: filled,
    dateText: dateText,
    normBattalion: normBattalion,
    normCompany: normCompany,
    companyNumber: companyNumber,
    resolveUnitScope: resolveUnitScope,
    requireUnitScope: requireUnitScope,
    requireOperationalDate: requireOperationalDate,
    rsdListHasTemporalScope: rsdListHasTemporalScope,
    requireRcoListScope: requireRcoListScope,
    sheetUnitCanon: sheetUnitCanon,
    sameUnitScope: sameUnitScope,
    operationalDateOf: operationalDateOf,
    matchesRcoScope: matchesRcoScope,
    filterRowsForRco: filterRowsForRco,
    rsdListAllowUnscoped: rsdListAllowUnscoped,
    rsdGetAccessDecision: rsdGetAccessDecision,
    rcoDraftAccessDecision: rcoDraftAccessDecision,
    payloadUnit: payloadUnit
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.RcoScopeGuard = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
