/**
 * Máquinas de estado do RSD — hidratação e sincronização são eixos independentes.
 *
 * HYDRATION: UNRESOLVED | LOADING | HYDRATED | NEW_SERVICE | ERROR | DEGRADED
 * SYNC:      IDLE | PENDING | SAVING | OK | OFFLINE | FAILED | CONFLICT | LEGACY_CLIENT
 *
 * Persistência LOCAL depende da hidratação (HYDRATED | NEW_SERVICE | DEGRADED).
 * Sync NUVEM depende de hidratação apta + sync não bloqueado.
 */
(function (global) {
  var HYDRATION = {
    UNRESOLVED: 'UNRESOLVED',
    LOADING: 'LOADING',
    HYDRATED: 'HYDRATED',
    NEW_SERVICE: 'NEW_SERVICE',
    ERROR: 'ERROR',
    DEGRADED: 'DEGRADED'
  };

  var SYNC = {
    IDLE: 'IDLE',
    PENDING: 'PENDING',
    SAVING: 'SAVING',
    OK: 'OK',
    OFFLINE: 'OFFLINE',
    FAILED: 'FAILED',
    CONFLICT: 'CONFLICT',
    LEGACY_CLIENT: 'LEGACY_CLIENT'
  };

  // Compat: STATES aponta para hidratação
  var STATES = HYDRATION;

  var HYDRATION_ERROR_MSG = 'Não foi possível carregar completamente o serviço. A sincronização foi bloqueada para proteger os dados. Tente novamente.';
  var LEGACY_CLIENT_MSG = 'Esta página está usando uma versão anterior da Central. Atualize/reabra o serviço para continuar sincronizando com segurança. Os dados existentes na Central não foram alterados.';
  var CONFLICT_MSG = 'Existe uma versão mais recente deste serviço na Central.';
  var DEGRADED_MSG = 'Este serviço apresenta perda estrutural no rascunho da nuvem. A sincronização automática está bloqueada até a recuperação controlada. Você pode continuar preenchendo neste aparelho; os dados locais não serão apagados.';
  var OFFLINE_MSG = 'Sem conexão. As alterações estão salvas neste aparelho e serão sincronizadas quando a Central estiver disponível e a revisão ainda for válida.';

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

  function sheetHasStructuralIdentity(sheetMeta) {
    sheetMeta = sheetMeta || {};
    return filled(sheetMeta.nome || sheetMeta.GUARNICAO) ||
      filled(sheetMeta.vtr || sheetMeta.VTR_PRINCIPAL) ||
      filled(sheetMeta.responsavel || sheetMeta.RESPONSAVEL_NOME) ||
      filled(sheetMeta.matricula || sheetMeta.RESPONSAVEL_MATRICULA);
  }

  /**
   * Payload oco + colunas da aba ainda válidas → DEGRADED (não HYDRATED).
   */
  function isDegradedPayload(payload, sheetMeta) {
    if (payloadHasStructuralIdentity(payload)) return false;
    return sheetHasStructuralIdentity(sheetMeta) || !!(payload && payload.structuralDegraded);
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

  function hydrationAllowsLocal(state) {
    return state === HYDRATION.HYDRATED || state === HYDRATION.NEW_SERVICE || state === HYDRATION.DEGRADED;
  }

  function hydrationAllowsCloud(state) {
    return state === HYDRATION.HYDRATED || state === HYDRATION.NEW_SERVICE;
  }

  function syncBlocksCloud(syncState) {
    return syncState === SYNC.CONFLICT ||
      syncState === SYNC.LEGACY_CLIENT ||
      syncState === SYNC.OFFLINE;
  }

  function canScheduleCloudSync(hydrationState, syncState) {
    if (!hydrationAllowsCloud(hydrationState)) return false;
    if (syncState == null) return true;
    return !syncBlocksCloud(syncState) && syncState !== SYNC.SAVING;
  }

  function canLocalAutosave(hydrationState) {
    return hydrationAllowsLocal(hydrationState);
  }

  var REGISTERED_KEY = 'pmpb-transito-servico-diario-v2-cloud-registered';

  function localPersistAllowed() {
    var h = global.__rsdHydration;
    if (h && typeof h.canLocalAutosave === 'function') return !!h.canLocalAutosave();
    try {
      if (global.localStorage && global.localStorage.getItem(REGISTERED_KEY) === '1') return false;
    } catch (_) {}
    return true;
  }

  function parseSyncErrorCode(msg) {
    var s = String(msg || '');
    if (/LEGACY_CLIENT_RELOAD_REQUIRED/i.test(s)) return 'LEGACY_CLIENT_RELOAD_REQUIRED';
    if (/STALE_REVISION/i.test(s)) return 'STALE_REVISION';
    if (/STRUCTURAL_REGRESSION/i.test(s)) return 'STRUCTURAL_REGRESSION';
    return '';
  }

  function createRsdHydrationGuard(initial) {
    var state = initial && initial.state ? initial.state : HYDRATION.UNRESOLVED;
    var syncState = initial && initial.syncState ? initial.syncState : SYNC.IDLE;
    var knownDraftRevision = Number(initial && initial.knownDraftRevision || 0) || 0;
    var lastError = '';
    var lastSyncError = '';
    var lastHydratedAt = '';
    var sheetFallback = null;
    var pendingLocal = false;
    var cloudSuspended = false;

    function emit() {
      try {
        if (typeof global.dispatchEvent === 'function' && typeof global.CustomEvent === 'function') {
          global.dispatchEvent(new global.CustomEvent('rsd-guard-change', {
            detail: { hydration: state, sync: syncState, knownDraftRevision: knownDraftRevision, pendingLocal: pendingLocal }
          }));
        }
      } catch (_) {}
    }

    return {
      STATES: HYDRATION,
      HYDRATION: HYDRATION,
      SYNC: SYNC,
      getState: function () { return state; },
      getHydrationState: function () { return state; },
      getSyncState: function () { return syncState; },
      getLastError: function () { return lastError; },
      getLastSyncError: function () { return lastSyncError; },
      getKnownDraftRevision: function () { return knownDraftRevision; },
      getLastHydratedAt: function () { return lastHydratedAt; },
      getSheetFallback: function () { return sheetFallback; },
      hasPendingLocal: function () { return !!pendingLocal; },
      isCloudSuspended: function () { return !!cloudSuspended; },
      canSync: function () {
        return canScheduleCloudSync(state, syncState) && !cloudSuspended;
      },
      canLocalAutosave: function () { return canLocalAutosave(state); },
      markUnresolved: function () { state = HYDRATION.UNRESOLVED; lastError = ''; emit(); },
      markLoading: function () { state = HYDRATION.LOADING; lastError = ''; emit(); },
      markHydrated: function (rev) {
        state = HYDRATION.HYDRATED;
        lastError = '';
        lastHydratedAt = new Date().toISOString();
        sheetFallback = null;
        if (rev != null && rev !== '') knownDraftRevision = Number(rev) || 0;
        if (syncState === SYNC.IDLE || syncState === SYNC.FAILED) syncState = SYNC.IDLE;
        emit();
      },
      markDegraded: function (rev, fallback) {
        state = HYDRATION.DEGRADED;
        lastError = DEGRADED_MSG;
        lastHydratedAt = new Date().toISOString();
        sheetFallback = fallback || null;
        cloudSuspended = true;
        if (rev != null && rev !== '') knownDraftRevision = Number(rev) || 0;
        emit();
      },
      markNewService: function () {
        state = HYDRATION.NEW_SERVICE;
        lastError = '';
        knownDraftRevision = 0;
        sheetFallback = null;
        cloudSuspended = false;
        syncState = SYNC.IDLE;
        emit();
      },
      markError: function (msg) {
        state = HYDRATION.ERROR;
        lastError = String(msg || HYDRATION_ERROR_MSG);
        cloudSuspended = true;
        emit();
      },
      markSyncIdle: function () { syncState = SYNC.IDLE; emit(); },
      markSyncPending: function () {
        if (syncState === SYNC.CONFLICT || syncState === SYNC.LEGACY_CLIENT) return;
        syncState = SYNC.PENDING;
        pendingLocal = true;
        emit();
      },
      markSyncSaving: function () {
        if (syncState === SYNC.CONFLICT || syncState === SYNC.LEGACY_CLIENT) return;
        syncState = SYNC.SAVING;
        emit();
      },
      markSyncOk: function (rev) {
        syncState = SYNC.OK;
        pendingLocal = false;
        lastSyncError = '';
        cloudSuspended = false;
        if (rev != null && rev !== '') knownDraftRevision = Number(rev) || 0;
        emit();
      },
      markSyncOffline: function () {
        if (syncState === SYNC.CONFLICT || syncState === SYNC.LEGACY_CLIENT) return;
        syncState = SYNC.OFFLINE;
        pendingLocal = true;
        lastSyncError = OFFLINE_MSG;
        emit();
      },
      markSyncFailed: function (msg) {
        if (syncState === SYNC.CONFLICT || syncState === SYNC.LEGACY_CLIENT) return;
        syncState = SYNC.FAILED;
        lastSyncError = String(msg || 'Falha ao sincronizar.');
        pendingLocal = true;
        emit();
      },
      markSyncConflict: function (msg) {
        syncState = SYNC.CONFLICT;
        cloudSuspended = true;
        lastSyncError = String(msg || CONFLICT_MSG);
        pendingLocal = true;
        emit();
      },
      markSyncLegacyClient: function (msg) {
        syncState = SYNC.LEGACY_CLIENT;
        cloudSuspended = true;
        lastSyncError = String(msg || LEGACY_CLIENT_MSG);
        emit();
      },
      clearCloudSuspension: function () {
        cloudSuspended = false;
        if (syncState === SYNC.CONFLICT || syncState === SYNC.LEGACY_CLIENT) syncState = SYNC.IDLE;
        lastSyncError = '';
        emit();
      },
      setKnownDraftRevision: function (n) { knownDraftRevision = Number(n) || 0; },
      markPendingLocal: function (v) { pendingLocal = !!v; emit(); },
      errorMessage: function () { return lastError || HYDRATION_ERROR_MSG; },
      syncMessage: function () { return lastSyncError || ''; },
      applySyncFailure: function (errMsg) {
        var code = parseSyncErrorCode(errMsg);
        if (code === 'LEGACY_CLIENT_RELOAD_REQUIRED') {
          this.markSyncLegacyClient(LEGACY_CLIENT_MSG);
          return code;
        }
        if (code === 'STALE_REVISION') {
          this.markSyncConflict(CONFLICT_MSG + ' Recarregue os dados da Central. Os dados deste aparelho não foram apagados.');
          return code;
        }
        this.markSyncFailed(errMsg);
        return code || 'FAILED';
      }
    };
  }

  var api = {
    STATES: STATES,
    HYDRATION: HYDRATION,
    SYNC: SYNC,
    HYDRATION_ERROR_MSG: HYDRATION_ERROR_MSG,
    LEGACY_CLIENT_MSG: LEGACY_CLIENT_MSG,
    CONFLICT_MSG: CONFLICT_MSG,
    DEGRADED_MSG: DEGRADED_MSG,
    OFFLINE_MSG: OFFLINE_MSG,
    filled: filled,
    ymd: ymd,
    primaryVtr: primaryVtr,
    extractIdentity: extractIdentity,
    payloadHasStructuralIdentity: payloadHasStructuralIdentity,
    sheetHasStructuralIdentity: sheetHasStructuralIdentity,
    isDegradedPayload: isDegradedPayload,
    identityGaps: identityGaps,
    canScheduleCloudSync: function (h, s) {
      if (arguments.length === 1) return canScheduleCloudSync(h, SYNC.IDLE);
      return canScheduleCloudSync(h, s);
    },
    canLocalAutosave: canLocalAutosave,
    localPersistAllowed: localPersistAllowed,
    parseSyncErrorCode: parseSyncErrorCode,
    create: createRsdHydrationGuard
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.RsdHydrationGuard = api;
  global.rsdLocalPersistAllowed = localPersistAllowed;
})(typeof globalThis !== 'undefined' ? globalThis : this);
