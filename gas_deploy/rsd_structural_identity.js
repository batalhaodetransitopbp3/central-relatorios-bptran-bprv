/**
 * Identidade estrutural imutável de RSD existente.
 * Fonte única: Node tests + Apps Script (gas_deploy/rsd_structural_identity.js).
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

  function stripWrappingQuotes(s) {
    s = String(s == null ? '' : s).replace(/\u00a0/g, ' ').trim();
    if (s.length >= 2 && s.charAt(0) === '"' && s.charAt(s.length - 1) === '"') {
      return s.slice(1, -1).trim();
    }
    if (s.charAt(0) === '"') return s.slice(1).trim();
    return s;
  }

  /**
   * Extrai YYYY-MM-DD quando possível.
   * Não inventa dígitos para datas truncadas (DATE_CORRUPTION histórica).
   */
  function dateText(v) {
    var s = stripWrappingQuotes(v);
    if (!s) return '';
    var m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[1] + '-' + m[2] + '-' + m[3];
    var m2 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (m2) {
      return m2[3] + '-' + ('0' + m2[2]).slice(-2) + '-' + ('0' + m2[1]).slice(-2);
    }
    return '';
  }

  /** Identidade de data da linha: parseável ou token bruto (sem sanitizar truncadas). */
  function identityDate(v) {
    var parsed = dateText(v);
    if (parsed) return parsed;
    return stripWrappingQuotes(v);
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

  function extractPayloadUnit(payload) {
    payload = payload || {};
    var u = payload.unidade || {};
    var battRaw = u.batalhao || u.batalhaoSigla || payload.batalhao || payload.batalhaoSigla || '';
    var batt = filled(battRaw) ? normBattalion(battRaw) : '';
    var comp = '';
    if (filled(u.companhia) || filled(payload.companhia)) {
      comp = normCompany(batt || battRaw, u.companhia || payload.companhia);
      if (!comp) comp = String(u.companhia || payload.companhia || '').replace(/\u00a0/g, ' ').trim();
    } else if (batt && (u.companhiaNumero != null && u.companhiaNumero !== '' || payload.companhiaNumero != null && payload.companhiaNumero !== '')) {
      comp = normCompany(batt, u.companhiaNumero != null ? u.companhiaNumero : payload.companhiaNumero);
    }
    var data = identityDate(
      (payload.servico && (payload.servico.data || payload.servico.operationalDate)) ||
      payload.dataServico || payload.data || ''
    );
    return { batalhao: batt, companhia: comp, dataServico: data };
  }

  function extractRowIdentity(old) {
    old = old || {};
    var batt = normBattalion(old.BATALHAO || old.batalhao || '');
    var compRaw = old.COMPANHIA || old.companhia || '';
    return {
      reportId: String(old.REPORT_ID || old.reportId || ''),
      serviceId: String(old.SERVICE_ID || old.serviceId || ''),
      batalhao: batt,
      companhia: filled(compRaw) ? (normCompany(batt, compRaw) || String(compRaw).replace(/\u00a0/g, ' ').trim()) : '',
      dataServico: identityDate(old.DATA_SERVICO || old.dataServico || '')
    };
  }

  function resolveStructuralIdentity(old, payload, opts) {
    opts = opts || {};
    var incoming = extractPayloadUnit(payload);

    if (!old || !(old.REPORT_ID || old.reportId || old.BATALHAO || old.DATA_SERVICO)) {
      var battNew = incoming.batalhao || (opts.allowCreateFallback ? 'BPTran' : '');
      var compNew = incoming.companhia;
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

  /** Aplica identidade canônica ao payload ANTES de stringify/persist. */
  function applyCanonicalIdentityToPayload(payload, identity, serviceWindow) {
    payload = payload || {};
    identity = identity || {};
    payload.unidade = payload.unidade || {};
    payload.unidade.batalhao = identity.batalhao;
    payload.unidade.companhia = identity.companhia;
    if (identity.batalhao === 'BPRv' || identity.batalhao === 'BPTran') {
      payload.unidade.batalhaoSigla = identity.batalhao;
    }
    payload.servico = payload.servico || {};
    payload.servico.data = identity.dataServico;
    payload.servico.operationalDate = identity.dataServico;
    if (serviceWindow != null) payload.servico.serviceWindow = serviceWindow;
    return payload;
  }

  /**
   * Paridade linha × payload após canonicalização.
   * row pode ser objeto de linha (BATALHAO/…) ou identity {batalhao,…}.
   */
  function assertLinePayloadUnitParity(rowOrIdentity, payload) {
    var row = rowOrIdentity || {};
    var expected = (row.BATALHAO != null || row.COMPANHIA != null || row.DATA_SERVICO != null)
      ? extractRowIdentity(row)
      : {
          batalhao: row.batalhao || '',
          companhia: row.companhia || '',
          dataServico: row.dataServico || ''
        };
    var pay = extractPayloadUnit(payload);
    var divergences = [];
    if (String(expected.batalhao || '') !== String(pay.batalhao || '')) {
      divergences.push({ field: 'BATALHAO', line: expected.batalhao, payload: pay.batalhao });
    }
    if (String(expected.companhia || '') !== String(pay.companhia || '')) {
      divergences.push({ field: 'COMPANHIA', line: expected.companhia, payload: pay.companhia });
    }
    if (String(expected.dataServico || '') !== String(pay.dataServico || '')) {
      divergences.push({ field: 'DATA_SERVICO', line: expected.dataServico, payload: pay.dataServico });
    }
    if (divergences.length) {
      return { ok: false, code: 'LINE_PAYLOAD_DIVERGENCE', divergences: divergences };
    }
    return { ok: true, code: '' };
  }

  /**
   * Pipeline instrumentável: VALIDATE → CANONICALIZE → SERIALIZE → PERSIST.
   * Usado nos testes Node; espelha a ordem obrigatória do GAS rsdDraftObject_.
   */
  function draftPersistPipeline(old, payload, opts) {
    opts = opts || {};
    var counters = opts.counters || {
      saveJsonPayload_called: 0,
      setContent_called: 0,
      createFile_called: 0,
      upsert_called: 0
    };
    var idn = resolveStructuralIdentity(old, payload, opts);
    if (!idn.ok) {
      return { ok: false, code: idn.code, identity: idn, counters: counters, json: '', persistedPayload: null };
    }
    var windowObj = typeof opts.getServiceWindow === 'function'
      ? opts.getServiceWindow(idn.dataServico)
      : { operationalDate: idn.dataServico };
    var canonical = applyCanonicalIdentityToPayload(payload, idn, windowObj);
    var parity = assertLinePayloadUnitParity(idn, canonical);
    if (!parity.ok) {
      return { ok: false, code: parity.code, identity: idn, counters: counters, json: '', persistedPayload: null, parity: parity };
    }
    var json = JSON.stringify(canonical);
    counters.saveJsonPayload_called += 1;
    if (json.length > 45000) {
      if (opts.existingFileId) counters.setContent_called += 1;
      else counters.createFile_called += 1;
    }
    if (opts.doUpsert) {
      counters.upsert_called += 1;
    }
    var line = {
      BATALHAO: idn.batalhao,
      COMPANHIA: idn.companhia,
      DATA_SERVICO: idn.dataServico,
      PAYLOAD_HASH: opts.hashFn ? opts.hashFn(json) : String(json.length)
    };
    var lineParity = assertLinePayloadUnitParity(line, canonical);
    if (!lineParity.ok) {
      return { ok: false, code: 'LINE_PAYLOAD_DIVERGENCE', identity: idn, counters: counters, json: json, persistedPayload: canonical, parity: lineParity };
    }
    return {
      ok: true,
      code: '',
      identity: idn,
      counters: counters,
      json: json,
      persistedPayload: canonical,
      line: line,
      payloadHash: line.PAYLOAD_HASH
    };
  }

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
    identityDate: identityDate,
    normBattalion: normBattalion,
    normCompany: normCompany,
    extractPayloadUnit: extractPayloadUnit,
    extractRowIdentity: extractRowIdentity,
    resolveStructuralIdentity: resolveStructuralIdentity,
    applyCanonicalIdentityToPayload: applyCanonicalIdentityToPayload,
    assertLinePayloadUnitParity: assertLinePayloadUnitParity,
    draftPersistPipeline: draftPersistPipeline,
    isVisibleInRco: isVisibleInRco,
    rcoLifecycleFlags: rcoLifecycleFlags
  };
});
