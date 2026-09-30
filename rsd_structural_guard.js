/**
 * Guarda estrutural de rascunho RSD.
 * Espelha apps_script_v10.gs (rsdDetectStructuralRegression_ /
 * rsdAssertDraftRevision_ / rsdKnownDraftRevisionPresent_).
 *
 * Autorização futura de retificação de cabeçalho:
 *   old.HEADER_EDIT_AUTH === 'OPEN' && payload.headerRectificationAuth === 'OPEN'
 */
(function (global) {
  function filled(v) {
    return String(v == null ? '' : v).replace(/\u00a0/g, ' ').trim() !== '';
  }

  function ymd(v) {
    var s = String(v == null ? '' : v).trim();
    var m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : s.slice(0, 10);
  }

  /** Espelha normVtrPrefix_ / rsdIdentPrimaryVtr_ do Apps Script. */
  function primaryVtr(raw) {
    var s = String(raw == null ? '' : raw).split(',')[0].trim().toUpperCase();
    return s.replace(/[^A-Z0-9-]/g, '').replace(/[^A-Z0-9]/g, '');
  }

  /** Espelha normMat_ do Apps Script. */
  function normMat(v) {
    var d = String(v || '').replace(/\D/g, '').slice(0, 7);
    if (d.length !== 7) return d;
    return d.slice(0, 3) + '.' + d.slice(3, 6) + '-' + d.slice(6);
  }

  /** Espelha normalizeGuarnicaoNome_ do Apps Script (comparação canônica). */
  function normalizeGuarnicaoNome(nome, tipo) {
    var s = String(nome || '').trim().toUpperCase().replace(/\s+/g, ' ');
    var m = s.match(/^(BST|BASE|GTTRAN|TOR|REBOQUE)\s*0*(\d{1,2})$/);
    if (!m) return '';
    var t = m[1];
    var n = Number(m[2]);
    var max = 10;
    var expected = String(tipo || t || '').trim().toUpperCase();
    if (['BST', 'BASE', 'GTTRAN', 'TOR', 'REBOQUE'].indexOf(expected) < 0) expected = t;
    if (n < 1 || n > max || t !== expected) return '';
    var pad = n < 10 ? '0' + n : String(n);
    return t + ' ' + pad;
  }

  function extractIncomingIdentity(r) {
    r = r || {};
    var g = r.guarnicao || {};
    var u = r.unidade || {};
    var s = r.servico || {};
    var vs = r.viaturas || g.viaturas || [];
    var first = '';
    if (Array.isArray(vs) && vs.length) {
      var v0 = vs[0];
      first = typeof v0 === 'string' ? v0 : (v0 && (v0.prefixo || v0.viatura) || '');
    }
    return {
      reportId: String(r.reportId || ''),
      serviceId: String(r.serviceId || s.serviceId || ''),
      segmento: String(r.segmento != null ? r.segmento : (s.segmento != null ? s.segmento : '')),
      data: ymd(s.operationalDate || s.data || r.data || ''),
      batalhao: String(u.batalhao || u.batalhaoSigla || ''),
      companhia: String(u.companhia || ''),
      nome: String(g.nome || ''),
      tipo: String(g.tipo || ''),
      vtr: primaryVtr(g.vtrPrincipal || first || g.viatura || ''),
      responsavel: String(g.responsavel || ''),
      matricula: String(g.matricula || r.matriculaResponsavel || ''),
      efetivo: String(g.efetivo || '')
    };
  }

  function extractExistingIdentity(existingPayload, row) {
    var fromPayload = extractIncomingIdentity(existingPayload || {});
    row = row || {};
    function prefer(payloadVal, rowVal) {
      return filled(payloadVal) ? payloadVal : String(rowVal == null ? '' : rowVal);
    }
    return {
      reportId: prefer(fromPayload.reportId, row.REPORT_ID),
      serviceId: prefer(fromPayload.serviceId, row.SERVICE_ID),
      segmento: prefer(fromPayload.segmento, row.SEGMENTO),
      data: ymd(prefer(fromPayload.data, row.DATA_SERVICO)),
      batalhao: prefer(fromPayload.batalhao, row.BATALHAO),
      companhia: prefer(fromPayload.companhia, row.COMPANHIA),
      nome: prefer(fromPayload.nome, row.GUARNICAO),
      tipo: prefer(fromPayload.tipo, row.GUARNICAO_TIPO),
      vtr: primaryVtr(prefer(fromPayload.vtr, row.VTR_PRINCIPAL)),
      responsavel: prefer(fromPayload.responsavel, row.RESPONSAVEL_NOME),
      matricula: prefer(fromPayload.matricula, row.RESPONSAVEL_MATRICULA),
      efetivo: fromPayload.efetivo
    };
  }

  function hasHeaderRectificationAuth(old, payload) {
    var auth = String((old && old.HEADER_EDIT_AUTH) || '').toUpperCase();
    var token = String((payload && (payload.headerRectificationAuth || (payload.rsd && payload.rsd.headerRectificationAuth))) || '').toUpperCase();
    return auth === 'OPEN' && token === 'OPEN';
  }

  function sameIdent(key, a, b, tipoHint) {
    if (key === 'vtr') return primaryVtr(a) === primaryVtr(b);
    if (key === 'data') return ymd(a) === ymd(b);
    if (key === 'segmento') return String(Number(a || 1) || 1) === String(Number(b || 1) || 1);
    if (key === 'matricula') return normMat(a) === normMat(b);
    if (key === 'nome') {
      var na = normalizeGuarnicaoNome(a, tipoHint);
      var nb = normalizeGuarnicaoNome(b, tipoHint);
      if (na && nb) return na === nb;
      return String(a || '').trim().toUpperCase() === String(b || '').trim().toUpperCase();
    }
    return String(a || '').trim().toUpperCase() === String(b || '').trim().toUpperCase();
  }

  function detectStructuralRegression(existingPayload, incomingPayload, options) {
    options = options || {};
    var allowIdentityChange = !!options.allowIdentityChange;
    var existingFromPayload = extractIncomingIdentity(existingPayload || {});
    var incoming = extractIncomingIdentity(incomingPayload || {});
    var rigid = ['reportId', 'serviceId', 'segmento', 'data', 'batalhao', 'companhia', 'nome', 'tipo'];
    var filledOnly = ['vtr', 'responsavel', 'matricula', 'efetivo'];
    var out = [];
    var i, key, oldVal, newVal;
    var tipoHint = existingFromPayload.tipo || incoming.tipo;

    for (i = 0; i < rigid.length; i++) {
      key = rigid[i];
      oldVal = existingFromPayload[key];
      newVal = incoming[key];
      if (!filled(oldVal)) continue;
      if (!filled(newVal)) {
        out.push({ field: key, from: oldVal, to: '', reason: 'EMPTY' });
        continue;
      }
      if (!allowIdentityChange && !sameIdent(key, oldVal, newVal, tipoHint)) {
        out.push({ field: key, from: oldVal, to: newVal, reason: 'IDENTITY_CHANGE' });
      }
    }
    for (i = 0; i < filledOnly.length; i++) {
      key = filledOnly[i];
      oldVal = existingFromPayload[key];
      newVal = incoming[key];
      if (filled(oldVal) && !filled(newVal)) {
        out.push({ field: key, from: oldVal, to: '', reason: 'EMPTY' });
      }
    }
    return out;
  }

  /**
   * true se o cliente enviou explicitamente algum campo de revisão
   * (mesmo que o valor numérico seja 0). Ausência ≠ 0.
   */
  function knownDraftRevisionPresent(payload, r) {
    function has(obj, k) {
      return !!(obj && Object.prototype.hasOwnProperty.call(obj, k) && obj[k] != null && obj[k] !== '');
    }
    if (has(payload, 'knownDraftRevision') || has(payload, 'draftRevision')) return true;
    if (has(r, 'knownDraftRevision') || has(r, 'draftRevision')) return true;
    return false;
  }

  function knownDraftRevisionValue(payload, r) {
    if (payload && payload.knownDraftRevision != null && payload.knownDraftRevision !== '') return Number(payload.knownDraftRevision) || 0;
    if (payload && payload.draftRevision != null && payload.draftRevision !== '') return Number(payload.draftRevision) || 0;
    if (r && r.knownDraftRevision != null && r.knownDraftRevision !== '') return Number(r.knownDraftRevision) || 0;
    if (r && r.draftRevision != null && r.draftRevision !== '') return Number(r.draftRevision) || 0;
    return 0;
  }

  /**
   * current>=1 e campo ausente → LEGACY_CLIENT_RELOAD_REQUIRED (não gravar).
   * current>=1 e known < current → STALE_REVISION.
   * current===0 → permite (RSD ainda sem revisão de rascunho; documentado).
   */
  function assertDraftRevision(oldRow, knownRevision, options) {
    options = options || {};
    var current = Number((oldRow && oldRow.DRAFT_REVISION) || 0) || 0;
    var present = options.revisionPresent;
    if (present === undefined) present = knownRevision != null && knownRevision !== '';
    var known = Number(knownRevision || 0) || 0;

    if (current >= 1 && !present) {
      return { ok: false, reason: 'LEGACY_CLIENT_RELOAD_REQUIRED', current: current, known: 0 };
    }
    if (current >= 1 && known < current) {
      return { ok: false, reason: 'STALE_REVISION', current: current, known: known };
    }
    return { ok: true, current: current, known: known };
  }

  /**
   * Invariante pós-persistência: se a linha tem identidade estrutural,
   * o payload gravado também deve tê-la.
   */
  function assertLinePayloadCoherence(row, payload) {
    row = row || {};
    payload = payload || {};
    var g = payload.guarnicao || {};
    var sheetNome = String(row.GUARNICAO || '').trim();
    var sheetVtr = primaryVtr(row.VTR_PRINCIPAL || '');
    var payloadNome = String(g.nome || '').trim();
    var payloadVtr = primaryVtr(g.vtrPrincipal || g.viatura || '');
    var sheetHas = filled(sheetNome) || filled(sheetVtr);
    var payloadHas = filled(payloadNome) || filled(payloadVtr) || filled(g.responsavel) || filled(g.matricula);
    if (sheetHas && !payloadHas) {
      return { ok: false, reason: 'LINE_PAYLOAD_DIVERGENCE', sheetNome: sheetNome, sheetVtr: sheetVtr };
    }
    return { ok: true };
  }

  function productionSum(p) {
    function walk(x) {
      if (typeof x === 'number') return x;
      if (Array.isArray(x)) return x.reduce(function (a, b) { return a + walk(b); }, 0);
      if (x && typeof x === 'object') {
        return Object.keys(x).reduce(function (a, k) { return a + walk(x[k]); }, 0);
      }
      return 0;
    }
    return walk((p && p.producao) || {});
  }

  function operationalFingerprint(p) {
    p = p || {};
    return {
      productionSum: productionSum(p),
      occurrences: Array.isArray(p.ocorrencias) ? p.ocorrencias.length : 0,
      operations: Array.isArray(p.operacoes) ? p.operacoes.length : 0,
      cirvc: Array.isArray(p.arvc || p.cirvc) ? (p.arvc || p.cirvc).length : 0,
      observations: String(p.observacoes || '').trim().length
    };
  }

  var api = {
    filled: filled,
    ymd: ymd,
    primaryVtr: primaryVtr,
    normMat: normMat,
    normalizeGuarnicaoNome: normalizeGuarnicaoNome,
    extractIncomingIdentity: extractIncomingIdentity,
    extractExistingIdentity: extractExistingIdentity,
    hasHeaderRectificationAuth: hasHeaderRectificationAuth,
    sameIdent: sameIdent,
    detectStructuralRegression: detectStructuralRegression,
    knownDraftRevisionPresent: knownDraftRevisionPresent,
    knownDraftRevisionValue: knownDraftRevisionValue,
    assertDraftRevision: assertDraftRevision,
    assertLinePayloadCoherence: assertLinePayloadCoherence,
    operationalFingerprint: operationalFingerprint
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.RsdStructuralGuard = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
