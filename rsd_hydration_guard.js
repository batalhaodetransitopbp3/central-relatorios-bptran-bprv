/**
 * Máquina de estados de hidratação do RSD.
 * Impede autosave/cloud sync enquanto um serviço existente não foi
 * carregado e aplicado ao formulário.
 *
 * Estados: UNRESOLVED | LOADING | HYDRATED | NEW_SERVICE | ERROR
 */
(function (global) {
  var STATES = {
    UNRESOLVED: 'UNRESOLVED',
    LOADING: 'LOADING',
    HYDRATED: 'HYDRATED',
    NEW_SERVICE: 'NEW_SERVICE',
    ERROR: 'ERROR'
  };

  var HYDRATION_ERROR_MSG = 'Não foi possível carregar completamente o serviço. A sincronização foi bloqueada para proteger os dados. Tente novamente.';

  function filled(v) {
    return String(v == null ? '' : v).replace(/\u00a0/g, ' ').trim() !== '';
  }

  function ymd(v) {
    var s = String(v == null ? '' : v).trim();
    var m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : s;
  }

  function primaryVtr(raw) {
    var s = String(raw == null ? '' : raw).split(',')[0].trim().toUpperCase();
    return s.replace(/[^A-Z0-9]/g, '');
  }

  function extractIdentity(p) {
    p = p || {};
    var g = p.guarnicao || {};
    var u = p.unidade || {};
    var s = p.servico || {};
    var vs = Array.isArray(p.viaturas) ? p.viaturas : (Array.isArray(g.viaturas) ? g.viaturas : []);
    var firstVtr = vs.length ? (typeof vs[0] === 'string' ? vs[0] : (vs[0].prefixo || vs[0].viatura || '')) : '';
    return {
      reportId: String(p.reportId || ''),
      serviceId: String(p.serviceId || s.serviceId || ''),
      segmento: String(p.segmento || s.segmento || ''),
      data: ymd(s.operationalDate || s.data || p.data || ''),
      batalhao: String(u.batalhao || u.batalhaoSigla || ''),
      companhia: String(u.companhia || ''),
      nome: String(g.nome || ''),
      tipo: String(g.tipo || ''),
      vtr: primaryVtr(g.vtrPrincipal || firstVtr || g.viatura || ''),
      responsavel: String(g.responsavel || ''),
      matricula: String(g.matricula || p.matriculaResponsavel || ''),
      efetivo: String(g.efetivo || '')
    };
  }

  function payloadHasStructuralIdentity(p) {
    var id = extractIdentity(p);
    return filled(id.nome) || filled(id.vtr) || filled(id.responsavel) || filled(id.matricula);
  }

  function identityGaps(payload, formIdentity) {
    var src = extractIdentity(payload);
    var form = formIdentity || {};
    var keys = ['nome', 'tipo', 'vtr', 'responsavel', 'matricula', 'data', 'batalhao', 'companhia', 'efetivo'];
    var gaps = [];
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var expected = k === 'vtr' ? primaryVtr(src[k]) : (k === 'data' ? ymd(src[k]) : String(src[k] || '').trim());
      var got = k === 'vtr' ? primaryVtr(form[k]) : (k === 'data' ? ymd(form[k]) : String(form[k] || '').trim());
      if (filled(expected) && !filled(got)) gaps.push(k);
    }
    return gaps;
  }

  function canScheduleCloudSync(state) {
    return state === STATES.HYDRATED || state === STATES.NEW_SERVICE;
  }

  function createRsdHydrationGuard(initial) {
    var state = initial && initial.state ? initial.state : STATES.UNRESOLVED;
    var knownDraftRevision = Number(initial && initial.knownDraftRevision || 0) || 0;
    var lastError = '';
    var lastHydratedAt = '';

    return {
      STATES: STATES,
      getState: function () { return state; },
      getLastError: function () { return lastError; },
      getKnownDraftRevision: function () { return knownDraftRevision; },
      getLastHydratedAt: function () { return lastHydratedAt; },
      canSync: function () { return canScheduleCloudSync(state); },
      markUnresolved: function () { state = STATES.UNRESOLVED; lastError = ''; },
      markLoading: function () { state = STATES.LOADING; lastError = ''; },
      markHydrated: function (rev) {
        state = STATES.HYDRATED;
        lastError = '';
        lastHydratedAt = new Date().toISOString();
        if (rev != null && rev !== '') knownDraftRevision = Number(rev) || 0;
      },
      markNewService: function () {
        state = STATES.NEW_SERVICE;
        lastError = '';
        knownDraftRevision = 0;
      },
      markError: function (msg) {
        state = STATES.ERROR;
        lastError = String(msg || HYDRATION_ERROR_MSG);
      },
      setKnownDraftRevision: function (n) { knownDraftRevision = Number(n) || 0; },
      errorMessage: function () { return lastError || HYDRATION_ERROR_MSG; }
    };
  }

  var api = {
    STATES: STATES,
    HYDRATION_ERROR_MSG: HYDRATION_ERROR_MSG,
    filled: filled,
    ymd: ymd,
    primaryVtr: primaryVtr,
    extractIdentity: extractIdentity,
    payloadHasStructuralIdentity: payloadHasStructuralIdentity,
    identityGaps: identityGaps,
    canScheduleCloudSync: canScheduleCloudSync,
    create: createRsdHydrationGuard
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.RsdHydrationGuard = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
