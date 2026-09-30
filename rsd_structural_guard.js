/**
 * Guarda estrutural de rascunho RSD.
 * Espelha a lógica de apps_script_v10.gs (rsdDetectStructuralRegression_ /
 * rsdAssertDraftRevision_). Manter as duas cópias alinhadas.
 *
 * Autorização futura de retificação de cabeçalho:
 *   old.HEADER_EDIT_AUTH === 'OPEN' && payload.headerRectificationAuth === 'OPEN'
 * Sem essa autorização explícita do backend, valor preenchido não pode
 * virar vazio, e identidade rígida não pode ser trocada.
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

  function primaryVtr(raw) {
    var s = String(raw == null ? '' : raw).split(',')[0].trim().toUpperCase();
    return s.replace(/[^A-Z0-9]/g, '');
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

  /**
   * Compara payload existente (não a linha sozinha) para decidir regressão.
   * Campos já vazios no payload atual NÃO são tratados como nova perda
   * (evita bloquear RSDs já danificados até a recuperação seletiva).
   * A linha estrutural só entra quando o payload correspondente estava preenchido.
   */
  function detectStructuralRegression(existingPayload, incomingPayload, options) {
    options = options || {};
    var allowIdentityChange = !!options.allowIdentityChange;
    var existingFromPayload = extractIncomingIdentity(existingPayload || {});
    var incoming = extractIncomingIdentity(incomingPayload || {});
    var rigid = ['reportId', 'serviceId', 'segmento', 'data', 'batalhao', 'companhia', 'nome', 'tipo'];
    var filledOnly = ['vtr', 'responsavel', 'matricula', 'efetivo'];
    var out = [];
    var i, key, oldVal, newVal;

    function same(a, b) {
      if (key === 'vtr') return primaryVtr(a) === primaryVtr(b);
      if (key === 'data') return ymd(a) === ymd(b);
      if (key === 'segmento') return String(Number(a || 1) || 1) === String(Number(b || 1) || 1);
      return String(a || '').trim().toUpperCase() === String(b || '').trim().toUpperCase();
    }

    for (i = 0; i < rigid.length; i++) {
      key = rigid[i];
      oldVal = existingFromPayload[key];
      newVal = incoming[key];
      if (!filled(oldVal)) continue;
      if (!filled(newVal)) {
        out.push({ field: key, from: oldVal, to: '', reason: 'EMPTY' });
        continue;
      }
      if (!allowIdentityChange && !same(oldVal, newVal)) {
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

  function assertDraftRevision(oldRow, knownRevision) {
    var current = Number((oldRow && oldRow.DRAFT_REVISION) || 0) || 0;
    var known = Number(knownRevision || 0) || 0;
    if (current >= 1 && known < current) {
      return { ok: false, reason: 'STALE_REVISION', current: current, known: known };
    }
    return { ok: true, current: current, known: known };
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
    extractIncomingIdentity: extractIncomingIdentity,
    extractExistingIdentity: extractExistingIdentity,
    hasHeaderRectificationAuth: hasHeaderRectificationAuth,
    detectStructuralRegression: detectStructuralRegression,
    assertDraftRevision: assertDraftRevision,
    operationalFingerprint: operationalFingerprint
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.RsdStructuralGuard = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
