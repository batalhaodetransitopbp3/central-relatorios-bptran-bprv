/**
 * Identidade estrutural imutável de RSD existente.
 * Usado em draft sync / finalização / reenvio — Node tests + Apps Script (global).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.RsdStructuralIdentity = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function filled(v) {
    if (v == null) return false;
    return String(v).replace(/\u00a0/g, ' ').trim() !== '';
  }

  function dateText(v) {
    var s = String(v == null ? '' : v).replace(/\u00a0/g, ' ').trim();
    if (!s) return '';
    var m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[1] + '-' + m[2] + '-' + m[3];
    // dd/mm/yyyy
    var m2 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (m2) {
      return m2[3] + '-' + ('0' + m2[2]).slice(-2) + '-' + ('0' + m2[1]).slice(-2);
    }
    return '';
  }

  function normBattalion(v) {
    var s = String(v || '').replace(/\u00a0/g, ' ').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!s) return '';
    if (s === 'BPRV') return 'BPRv';
    if (s === 'BPTRAN') return 'BPTran';
    return '';
  }

  function companyNumber(v) {
    var m = String(v == null ? '' : v).match(/\d+/);
    return m ? Number(m[0]) : 0;
  }

  function companyTipoFromLabel(v) {
    var s = String(v || '').toUpperCase();
    if (s.indexOf('CPRV') >= 0) return 'CPRv';
    if (s.indexOf('CPTRAN') >= 0) return 'CPTran';
    return '';
  }

  function normCompany(b, v) {
    var batt = normBattalion(b);
    if (!batt) return '';
    var n = companyNumber(v);
    if (!n) return '';
    var tipoLabel = companyTipoFromLabel(v);
    var tipoWanted = batt === 'BPRv' ? 'CPRv' : 'CPTran';
    if (tipoLabel && tipoLabel !== tipoWanted) return '';
    return n + 'ª ' + tipoWanted;
  }

  /**
   * Extrai unidade explícita do payload (vazia se ausente).
   * NÃO aplica fallback BPTran.
   */
  function extractPayloadUnit(payload) {
    payload = payload || {};
    var u = payload.unidade || {};
    var battRaw = u.batalhao || u.batalhaoSigla || payload.batalhao || payload.batalhaoSigla || '';
    var batt = filled(battRaw) ? normBattalion(battRaw) : '';
    var comp = '';
    if (filled(u.companhia) || filled(payload.companhia)) {
      comp = normCompany(batt || battRaw, u.companhia || payload.companhia);
    } else if (batt && (u.companhiaNumero != null && u.companhiaNumero !== '' || payload.companhiaNumero != null && payload.companhiaNumero !== '')) {
      comp = normCompany(batt, u.companhiaNumero != null ? u.companhiaNumero : payload.companhiaNumero);
    }
    var data = dateText(
      (payload.servico && (payload.servico.data || payload.servico.operationalDate)) ||
      payload.dataServico || payload.data || ''
    );
    return { batalhao: batt, companhia: comp, dataServico: data };
  }

  function extractRowIdentity(old) {
    old = old || {};
    return {
      reportId: String(old.REPORT_ID || old.reportId || ''),
      serviceId: String(old.SERVICE_ID || old.serviceId || ''),
      batalhao: normBattalion(old.BATALHAO || old.batalhao || ''),
      companhia: (function () {
        var b = normBattalion(old.BATALHAO || old.batalhao || '');
        var c = old.COMPANHIA || old.companhia || '';
        return filled(c) ? (normCompany(b, c) || String(c)) : '';
      })(),
      dataServico: dateText(old.DATA_SERVICO || old.dataServico || '')
    };
  }

  /**
   * Resolve identidade para RSD existente.
   * - payload vazio → preserva old
   * - payload igual → aceita (usa old canônico)
   * - payload diferente → { ok:false, code:'RSD_STRUCTURAL_IDENTITY_MISMATCH' }
   *
   * Para RSD novo (sem old): calcula a partir do payload; fallback BPTran só se opts.allowCreateFallback.
   */
  function resolveStructuralIdentity(old, payload, opts) {
    opts = opts || {};
    var incoming = extractPayloadUnit(payload);

    if (!old || !(old.REPORT_ID || old.reportId || old.BATALHAO || old.DATA_SERVICO)) {
      var battNew = incoming.batalhao || (opts.allowCreateFallback ? 'BPTran' : '');
      var compNew = incoming.companhia;
      if (!compNew && battNew && opts.allowCreateFallback) {
        // create path may still use companhiaNumero via caller
        compNew = '';
      }
      var dataNew = incoming.dataServico || '';
      return {
        ok: true,
        created: true,
        batalhao: battNew,
        companhia: compNew,
        dataServico: dataNew,
        reportId: String((payload && payload.reportId) || ''),
        serviceId: String((payload && (payload.serviceId || (payload.servico && payload.servico.serviceId))) || ''),
        mismatch: null
      };
    }

    var row = extractRowIdentity(old);
    if (!row.batalhao || !row.companhia || !row.dataServico) {
      return {
        ok: false,
        code: 'RSD_STRUCTURAL_IDENTITY_MISSING',
        detail: 'Linha existente sem identidade estrutural completa.',
        row: row,
        incoming: incoming
      };
    }

    var mismatches = [];
    if (filled(incoming.batalhao) && incoming.batalhao !== row.batalhao) {
      mismatches.push({ field: 'BATALHAO', old: row.batalhao, incoming: incoming.batalhao });
    }
    if (filled(incoming.companhia) && String(incoming.companhia) !== String(row.companhia)) {
      mismatches.push({ field: 'COMPANHIA', old: row.companhia, incoming: incoming.companhia });
    }
    if (filled(incoming.dataServico) && incoming.dataServico !== row.dataServico) {
      mismatches.push({ field: 'DATA_SERVICO', old: row.dataServico, incoming: incoming.dataServico });
    }

    if (mismatches.length) {
      return {
        ok: false,
        code: 'RSD_STRUCTURAL_IDENTITY_MISMATCH',
        detail: 'Payload tenta alterar identidade estrutural imutável.',
        mismatches: mismatches,
        row: row,
        incoming: incoming
      };
    }

    // Preserva sempre a identidade da linha (mesmo se payload vazio ou igual).
    return {
      ok: true,
      created: false,
      preserved: true,
      batalhao: row.batalhao,
      companhia: row.companhia,
      dataServico: row.dataServico,
      reportId: row.reportId,
      serviceId: row.serviceId || String((payload && (payload.serviceId || (payload.servico && payload.servico.serviceId))) || ''),
      mismatch: null,
      incomingEmpty: !filled(incoming.batalhao) && !filled(incoming.companhia) && !filled(incoming.dataServico)
    };
  }

  /** Filtra cards RCO por status de ciclo de vida (visibilidade). */
  function isVisibleInRco(status, showCancelled) {
    var allowed = [
      'EM_SERVICO', 'PASSAGEM_DISPONIVEL', 'ENCERRADO_PASSAGEM', 'AGUARDANDO_ANALISE',
      'DEFERIDO', 'DEFERIDO_COM_RESSALVAS', 'RETIFICACAO_SOLICITADA', 'INDEFERIDO',
      'FINALIZADO', 'INCLUIDO_RCO'
    ];
    if (showCancelled) allowed.push('CANCELADO');
    return allowed.indexOf(String(status || '')) >= 0;
  }

  function rcoLifecycleFlags(status) {
    var st = String(status || '');
    var visible = isVisibleInRco(st, false);
    var analysable = [
      'AGUARDANDO_ANALISE', 'DEFERIDO', 'DEFERIDO_COM_RESSALVAS', 'RETIFICACAO_SOLICITADA',
      'INDEFERIDO', 'FINALIZADO', 'EM_SERVICO'
    ].indexOf(st) >= 0;
    var addable = ['DEFERIDO', 'DEFERIDO_COM_RESSALVAS'].indexOf(st) >= 0;
    var editableByRsd = ['EM_SERVICO', 'RETIFICACAO_SOLICITADA'].indexOf(st) >= 0;
    return {
      VISIBLE_IN_RCO: visible,
      ANALYSABLE_IN_RCO: analysable && visible,
      ADDABLE_TO_RCO: addable,
      EDITABLE_BY_RSD: editableByRsd
    };
  }

  return {
    dateText: dateText,
    normBattalion: normBattalion,
    normCompany: normCompany,
    extractPayloadUnit: extractPayloadUnit,
    extractRowIdentity: extractRowIdentity,
    resolveStructuralIdentity: resolveStructuralIdentity,
    isVisibleInRco: isVisibleInRco,
    rcoLifecycleFlags: rcoLifecycleFlags
  };
});
