/**
 * Identidade estrutural imutável de RSD existente.
 * Fonte única: Node tests + Apps Script (gas_deploy/rsd_structural_identity.js).
 *
 * 10.8.36: PREVENTIVA — não repara histórico, não sanitiza DATE_CORRUPTION.
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

  /** Trim só de espaços/NBSP nas bordas — NÃO remove aspas nem reinterpreta. */
  function trimPreservingContent(v) {
    if (v == null) return '';
    return String(v).replace(/\u00a0/g, ' ').replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '');
  }

  /**
   * DATA VÁLIDA = exatamente YYYY-MM-DD (sem aspas, sem truncar/completar).
   * Qualquer outro token não-vazio = LEGACY_DATE_CORRUPTION (raw preservado).
   */
  function resolveIdentityDate(v) {
    if (v == null || v === '') {
      return { value: '', valid: false, raw: '', legacyDateCorruption: false };
    }
    // Date object (Sheets): calendário válido — formata YYYY-MM-DD sem “sanitizar string”.
    if (Object.prototype.toString.call(v) === '[object Date]') {
      if (isNaN(v.getTime())) {
        return { value: '', valid: false, raw: '', legacyDateCorruption: false };
      }
      var y = v.getFullYear();
      var m = ('0' + (v.getMonth() + 1)).slice(-2);
      var d = ('0' + v.getDate()).slice(-2);
      var iso = y + '-' + m + '-' + d;
      return { value: iso, valid: true, raw: iso, legacyDateCorruption: false };
    }
    var raw = trimPreservingContent(v);
    if (!raw) {
      return { value: '', valid: false, raw: '', legacyDateCorruption: false };
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return { value: raw, valid: true, raw: raw, legacyDateCorruption: false };
    }
    // Token histórico corrompido: preservar BYTE/STRING equivalente (inclui aspas).
    return { value: raw, valid: false, raw: raw, legacyDateCorruption: true };
  }

  /** Compat: YYYY-MM-DD válido ou '' (nunca strip de aspas / nunca Date() em string). */
  function dateText(v) {
    var info = resolveIdentityDate(v);
    return info.valid ? info.value : '';
  }

  /** Valor de identidade (string): válido ou raw corrompido — sem sanitizar. */
  function identityDate(v) {
    return resolveIdentityDate(v).value;
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
    var dateInfo = resolveIdentityDate(
      (payload.servico && (payload.servico.data || payload.servico.operationalDate)) ||
      payload.dataServico || payload.data || ''
    );
    return {
      batalhao: batt,
      companhia: comp,
      dataServico: dateInfo.value,
      dataServicoValid: dateInfo.valid,
      legacyDateCorruption: dateInfo.legacyDateCorruption,
      dataServicoRaw: dateInfo.raw
    };
  }

  function extractRowIdentity(old) {
    old = old || {};
    var batt = normBattalion(old.BATALHAO || old.batalhao || '');
    var compRaw = old.COMPANHIA || old.companhia || '';
    var dateInfo = resolveIdentityDate(old.DATA_SERVICO != null ? old.DATA_SERVICO : old.dataServico);
    return {
      reportId: String(old.REPORT_ID || old.reportId || ''),
      serviceId: String(old.SERVICE_ID || old.serviceId || ''),
      batalhao: batt,
      companhia: filled(compRaw) ? (normCompany(batt, compRaw) || String(compRaw).replace(/\u00a0/g, ' ').trim()) : '',
      dataServico: dateInfo.value,
      dataServicoValid: dateInfo.valid,
      legacyDateCorruption: dateInfo.legacyDateCorruption,
      dataServicoRaw: dateInfo.raw
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
        dataServicoValid: !!incoming.dataServicoValid,
        legacyDateCorruption: false,
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
    // Conservador: qualquer token de data explícito diferente do da linha → MISMATCH.
    // Inclui payload com data válida vs linha LEGACY_DATE_CORRUPTION (não “consertar”).
    if (filled(incoming.dataServico) && String(incoming.dataServico) !== String(row.dataServico)) {
      mismatches.push({
        field: 'DATA_SERVICO',
        old: row.dataServico,
        incoming: incoming.dataServico,
        legacyDateCorruption: !!row.legacyDateCorruption
      });
    }

    if (mismatches.length) {
      return {
        ok: false,
        code: 'RSD_STRUCTURAL_IDENTITY_MISMATCH',
        detail: 'Payload tenta alterar identidade estrutural imutável.',
        mismatches: mismatches,
        row: row,
        incoming: incoming,
        legacyDateCorruption: !!row.legacyDateCorruption
      };
    }

    return {
      ok: true,
      created: false,
      preserved: true,
      batalhao: row.batalhao,
      companhia: row.companhia,
      dataServico: row.dataServico,
      dataServicoValid: !!row.dataServicoValid,
      legacyDateCorruption: !!row.legacyDateCorruption,
      dataServicoRaw: row.dataServicoRaw,
      reportId: row.reportId,
      serviceId: row.serviceId || String((payload && (payload.serviceId || (payload.servico && payload.servico.serviceId))) || ''),
      mismatch: null,
      incomingEmpty: !filled(incoming.batalhao) && !filled(incoming.companhia) && !filled(incoming.dataServico)
    };
  }

  /**
   * Aplica identidade canônica ao payload ANTES de stringify/persist.
   * 3º arg: serviceWindow (legado) OU opts { getServiceWindow, existingServiceWindow, getServiceWindowCalled }.
   */
  function applyCanonicalIdentityToPayload(payload, identity, serviceWindowOrOpts) {
    payload = payload || {};
    identity = identity || {};
    var opts = {};
    var legacyWindow = null;
    if (serviceWindowOrOpts && typeof serviceWindowOrOpts === 'object' &&
        (typeof serviceWindowOrOpts.getServiceWindow === 'function' ||
          serviceWindowOrOpts.existingServiceWindow !== undefined ||
          serviceWindowOrOpts.getServiceWindowCalled !== undefined ||
          serviceWindowOrOpts.operationalDate !== undefined ||
          Object.prototype.hasOwnProperty.call(serviceWindowOrOpts, 'cutoffHour'))) {
      // Distinguir opts de um serviceWindow plain {operationalDate,...}
      if (typeof serviceWindowOrOpts.getServiceWindow === 'function' ||
          serviceWindowOrOpts.existingServiceWindow !== undefined ||
          serviceWindowOrOpts.getServiceWindowCalled !== undefined) {
        opts = serviceWindowOrOpts;
      } else {
        legacyWindow = serviceWindowOrOpts;
      }
    } else if (serviceWindowOrOpts != null) {
      legacyWindow = serviceWindowOrOpts;
    }

    payload.unidade = payload.unidade || {};
    payload.unidade.batalhao = identity.batalhao;
    payload.unidade.companhia = identity.companhia;
    if (identity.batalhao === 'BPRv' || identity.batalhao === 'BPTran') {
      payload.unidade.batalhaoSigla = identity.batalhao;
    }
    payload.servico = payload.servico || {};
    var existingWindow = payload.servico.serviceWindow;
    if (opts.existingServiceWindow != null) existingWindow = opts.existingServiceWindow;

    // DATA: sempre o token da linha (válido ou raw corrompido). Nunca Date.now().
    payload.servico.data = identity.dataServico;
    payload.servico.operationalDate = identity.dataServico;

    if (identity.dataServicoValid) {
      if (typeof opts.getServiceWindow === 'function') {
        if (opts.getServiceWindowCalled) opts.getServiceWindowCalled.n = (opts.getServiceWindowCalled.n || 0) + 1;
        payload.servico.serviceWindow = opts.getServiceWindow(identity.dataServico);
      } else if (legacyWindow != null) {
        payload.servico.serviceWindow = legacyWindow;
      }
    } else {
      // LEGACY_DATE_CORRUPTION: NÃO calcular serviceWindow; preservar existente se houver.
      if (existingWindow != null && existingWindow !== '') {
        payload.servico.serviceWindow = existingWindow;
      } else if (payload.servico.serviceWindow) {
        // keep
      } else {
        delete payload.servico.serviceWindow;
      }
      if (identity.legacyDateCorruption) {
        payload._diag = payload._diag || {};
        payload._diag.legacyDateCorruption = true;
      }
    }
    return payload;
  }

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
   * Simula o trecho crítico rsdStart_(old existente) → rsdDraftObject_:
   * NÃO deve chamar getServiceWindow com DATA_SERVICO legada.
   */
  function simulateRsdStartExistingThenDraft(old, incomingPayload, opts) {
    opts = opts || {};
    var counters = {
      getServiceWindow_called: 0,
      saveJsonPayload_called: 0,
      setContent_called: 0,
      createFile_called: 0,
      upsert_called: 0
    };
    var r = incomingPayload || {};
    r.servico = r.servico || {};
    // Espelha rsdStart_ corrigido: ramo old — não preenche data/serviceWindow.
    // (criação nova não é este helper)
    var out = draftPersistPipeline(old, r, {
      counters: counters,
      getServiceWindow: function (d) {
        counters.getServiceWindow_called += 1;
        if (typeof opts.getServiceWindow === 'function') return opts.getServiceWindow(d);
        return { operationalDate: d, from: 'getServiceWindow' };
      },
      doUpsert: !!opts.doUpsert,
      existingFileId: opts.existingFileId
    });
    out.counters = counters;
    return out;
  }

  function draftPersistPipeline(old, payload, opts) {
    opts = opts || {};
    var counters = opts.counters || {
      saveJsonPayload_called: 0,
      setContent_called: 0,
      createFile_called: 0,
      upsert_called: 0,
      getServiceWindow_called: 0
    };
    var gwCalled = { n: 0 };
    var idn = resolveStructuralIdentity(old, payload, opts);
    if (!idn.ok) {
      return { ok: false, code: idn.code, identity: idn, counters: counters, json: '', persistedPayload: null };
    }
    var existingWindow = payload && payload.servico && payload.servico.serviceWindow;
    var canonical = applyCanonicalIdentityToPayload(payload, idn, {
      getServiceWindow: typeof opts.getServiceWindow === 'function'
        ? function (d) {
            counters.getServiceWindow_called += 1;
            gwCalled.n += 1;
            return opts.getServiceWindow(d);
          }
        : null,
      existingServiceWindow: existingWindow,
      getServiceWindowCalled: gwCalled
    });
    // Paridade PRÉ-persistência (fail-closed).
    var expectedLine = {
      BATALHAO: idn.batalhao,
      COMPANHIA: idn.companhia,
      DATA_SERVICO: idn.dataServico
    };
    var parity = assertLinePayloadUnitParity(expectedLine, canonical);
    if (!parity.ok) {
      return { ok: false, code: parity.code, identity: idn, counters: counters, json: '', persistedPayload: null, parity: parity };
    }
    if (opts.forceParityFail) {
      return {
        ok: false,
        code: 'LINE_PAYLOAD_DIVERGENCE',
        identity: idn,
        counters: counters,
        json: '',
        persistedPayload: null
      };
    }
    var json = JSON.stringify(canonical);
    counters.saveJsonPayload_called += 1;
    if (json.length > 45000) {
      if (opts.existingFileId) counters.setContent_called += 1;
      else counters.createFile_called += 1;
    }
    if (opts.doUpsert) counters.upsert_called += 1;
    var line = {
      BATALHAO: idn.batalhao,
      COMPANHIA: idn.companhia,
      DATA_SERVICO: idn.dataServico,
      PAYLOAD_HASH: opts.hashFn ? opts.hashFn(json) : String(json.length)
    };
    return {
      ok: true,
      code: '',
      identity: idn,
      counters: counters,
      json: json,
      persistedPayload: canonical,
      line: line,
      payloadHash: line.PAYLOAD_HASH,
      getServiceWindow_called: counters.getServiceWindow_called
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

  /** Espelho de strictYmdDate_ do GAS — apenas YYYY-MM-DD / prefixo ISO. */
  function strictYmdDate(v) {
    if (v == null || v === '') return '';
    if (Object.prototype.toString.call(v) === '[object Date]') {
      if (isNaN(v.getTime())) return '';
      var y = v.getFullYear();
      var m = ('0' + (v.getMonth() + 1)).slice(-2);
      var d = ('0' + v.getDate()).slice(-2);
      return y + '-' + m + '-' + d;
    }
    var s = trimPreservingContent(v);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    var mIso = s.match(/^(\d{4}-\d{2}-\d{2})[T\s]/);
    return mIso ? mIso[1] : '';
  }

  /**
   * Comportamento seguro pós-fix do dateText_ GAS (sem s.slice(0,10)).
   * Usado nos testes para provar que `"2026-09-30` não vira `"2026-09-3`.
   */
  function safeDateTextNoSlice(v) {
    if (v == null || v === '') return '';
    if (Object.prototype.toString.call(v) === '[object Date]') return strictYmdDate(v);
    var s = trimPreservingContent(v);
    if (!s) return '';
    var m = s.match(/^(\d{4}-\d{2}-\d{2})(?:[T\s].*)?$/);
    if (m) return m[1];
    return '';
  }

  /** Antigo fallback inseguro — só para testes de regressão do padrão histórico. */
  function unsafeDateTextSliceFallback(v) {
    var s = String(v == null ? '' : v).trim();
    if (!s) return '';
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    return s.slice(0, 10);
  }

  function dateTokenFilled(v) {
    return trimPreservingContent(v) !== '';
  }

  /** Espelho preserveLegacyIdentityDate_ — token bruto sem slice. */
  function preserveLegacyIdentityDate(v) {
    if (v == null || v === '') return '';
    if (Object.prototype.toString.call(v) === '[object Date]') return strictYmdDate(v);
    return trimPreservingContent(v);
  }

  /**
   * Janela 07h America/Recife (espelho aproximado do GAS getServiceWindow_).
   * EXISTING: instant vazio → '' (nunca new Date()).
   */
  function operationalDateFromInstant(instant, allowNow) {
    var now = instant;
    if (now == null || now === '') {
      if (!allowNow) return '';
      now = new Date();
    }
    if (typeof now === 'string') {
      var s = trimPreservingContent(now);
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
      now = new Date(s);
    } else if (typeof now === 'number') {
      now = new Date(now);
    }
    if (Object.prototype.toString.call(now) !== '[object Date]' || isNaN(now.getTime())) {
      return allowNow ? operationalDateFromInstant(new Date(), false) : '';
    }
    var parts = {};
    try {
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Recife',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', hourCycle: 'h23'
      }).formatToParts(now).forEach(function (p) { parts[p.type] = p.value; });
    } catch (e) {
      var y = now.getFullYear();
      var m = ('0' + (now.getMonth() + 1)).slice(-2);
      var d = ('0' + now.getDate()).slice(-2);
      var hh = now.getHours();
      var ymd = y + '-' + m + '-' + d;
      return hh < 7 ? addCalendarDaysYmd(ymd, -1) : ymd;
    }
    var ymd = parts.year + '-' + parts.month + '-' + parts.day;
    var hh = Number(parts.hour) || 0;
    return hh < 7 ? addCalendarDaysYmd(ymd, -1) : ymd;
  }

  function addCalendarDaysYmd(ymd, delta) {
    var p = String(ymd || '').split('-');
    if (p.length !== 3) return '';
    var dt = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])));
    dt.setUTCDate(dt.getUTCDate() + Number(delta || 0));
    var y = dt.getUTCFullYear();
    var m = ('0' + (dt.getUTCMonth() + 1)).slice(-2);
    var d = ('0' + dt.getUTCDate()).slice(-2);
    return y + '-' + m + '-' + d;
  }

  /** NEW_RECORD_DATE_RESOLUTION */
  function resolveNewOperationalDate(explicitDate, instant) {
    if (dateTokenFilled(explicitDate)) {
      return strictYmdDate(explicitDate) || '';
    }
    return operationalDateFromInstant(instant == null || instant === '' ? new Date() : instant, true);
  }

  /** EXISTING_ROW_DATE_RESOLUTION — nunca new Date() em DATE_CORRUPTION. */
  function resolveExistingOperationalDate(dataServico, iniciadoEm) {
    if (dateTokenFilled(dataServico)) {
      return strictYmdDate(dataServico) || '';
    }
    if (iniciadoEm != null && iniciadoEm !== '') {
      return operationalDateFromInstant(iniciadoEm, false);
    }
    return '';
  }

  /** serviceKey fail-closed (sem inventar data). */
  function serviceKeyRsd(batt, comp, data, guarnicaoNome) {
    var gu = String(guarnicaoNome || '').replace(/\u00a0/g, ' ').trim();
    if (!gu) return '';
    var d = strictYmdDate(data);
    if (!d) return '';
    return [String(batt || ''), String(comp || ''), d, gu].join('|');
  }

  function rsdGroupKeyFromRow(x) {
    x = x || {};
    var k = serviceKeyRsd(x.BATALHAO, x.COMPANHIA, x.DATA_SERVICO, x.GUARNICAO);
    if (k) return k;
    var sid = String(x.SERVICE_ID || x.REPORT_ID || '');
    return sid ? ('SERVICE|' + sid) : '';
  }

  /** Espelho rsdIdentYmd_ pós-fix (sem slice). */
  function rsdIdentYmd(v) {
    var d = strictYmdDate(v);
    if (d) return d;
    return preserveLegacyIdentityDate(v);
  }

  return {
    dateText: dateText,
    identityDate: identityDate,
    resolveIdentityDate: resolveIdentityDate,
    strictYmdDate: strictYmdDate,
    safeDateTextNoSlice: safeDateTextNoSlice,
    unsafeDateTextSliceFallback: unsafeDateTextSliceFallback,
    preserveLegacyIdentityDate: preserveLegacyIdentityDate,
    resolveNewOperationalDate: resolveNewOperationalDate,
    resolveExistingOperationalDate: resolveExistingOperationalDate,
    operationalDateFromInstant: operationalDateFromInstant,
    serviceKeyRsd: serviceKeyRsd,
    rsdGroupKeyFromRow: rsdGroupKeyFromRow,
    rsdIdentYmd: rsdIdentYmd,
    normBattalion: normBattalion,
    normCompany: normCompany,
    extractPayloadUnit: extractPayloadUnit,
    extractRowIdentity: extractRowIdentity,
    resolveStructuralIdentity: resolveStructuralIdentity,
    applyCanonicalIdentityToPayload: applyCanonicalIdentityToPayload,
    assertLinePayloadUnitParity: assertLinePayloadUnitParity,
    draftPersistPipeline: draftPersistPipeline,
    simulateRsdStartExistingThenDraft: simulateRsdStartExistingThenDraft,
    isVisibleInRco: isVisibleInRco,
    rcoLifecycleFlags: rcoLifecycleFlags
  };
});
