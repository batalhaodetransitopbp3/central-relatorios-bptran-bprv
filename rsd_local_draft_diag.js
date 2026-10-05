/**
 * Diagnóstico LOCAL read-only + preservação pré-hydration (FASE 2B-0 / revisão).
 *
 * - NÃO envia ao backend.
 * - Captura PRE_HYDRATION_DRAFT por reportId antes de applyPayload/salvarRascunho.
 * - Path B só com igualdade positiva de fingerprint semântico local × servidor.
 * - Identidade: LOCAL_DRAFT_FOREIGN se reportId/serviceId divergirem.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.RsdLocalDraftDiag = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DRAFT_KEY = 'pmpb-transito-servico-diario-v2-draft';
  /** @deprecated chave global legada — só leitura/migração segura */
  var PRE_HYDRATION_KEY_LEGACY = 'pmpb-transito-servico-diario-v2-pre-hydration-draft';
  var PRE_HYDRATION_KEY_PREFIX = 'pmpb-transito-servico-diario-v2-pre-hydration-draft::';
  var DEVICE_ID_KEY = 'pmpb-device-id';

  /** Metadados server-only / voláteis excluídos da projeção de recovery. */
  var SERVER_ONLY_META_KEYS = {
    sheetStructuralFallback: true,
    structuralDegraded: true,
    centralStatus: true,
    _hydration: true,
    _cloudMeta: true,
    syncState: true,
    hydrationState: true
  };

  function filled(v) {
    if (v == null) return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'object') return Object.keys(v).length > 0;
    return String(v).replace(/\u00a0/g, ' ').trim() !== '';
  }

  function safeParse(raw) {
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (_) { return null; }
  }

  function readStorage(storage, key) {
    try { return storage ? storage.getItem(key) : null; } catch (_) { return null; }
  }

  function writeStorage(storage, key, value) {
    try { if (storage) storage.setItem(key, value); return true; } catch (_) { return false; }
  }

  function countArr(p, keys) {
    for (var i = 0; i < keys.length; i++) {
      var a = p && p[keys[i]];
      if (Array.isArray(a)) return a.length;
    }
    return 0;
  }

  function sectionFlags(p) {
    p = p || {};
    var g = p.guarnicao || {};
    return {
      headerNome: filled(g.nome),
      headerVtr: filled(g.vtrPrincipal || g.viatura),
      headerResponsavel: filled(g.responsavel) || filled(g.matricula),
      ocorrencias: countArr(p, ['ocorrencias']),
      operacoes: countArr(p, ['operacoes']),
      cirvc: countArr(p, ['cirvc', 'arvc']),
      tcos: countArr(p, ['tcos', 'tco']),
      veiculos: countArr(p, ['veiculos', 'veiculosRecuperados']),
      fiscoAcionamentos: countArr(p.fisco || {}, ['acionamentos']) || countArr(p, ['fisco']),
      observacoes: filled(p.observacoes),
      assinatura: !!(p.assinatura || p.assinaturas || g.assinatura),
      anexos: countArr(p, ['anexos']),
      producaoKeys: p.producao && typeof p.producao === 'object' ? Object.keys(p.producao).length : 0
    };
  }

  function hasSubstantiveContent(flags) {
    return !!(flags.ocorrencias || flags.operacoes || flags.cirvc || flags.tcos ||
      flags.veiculos || flags.fiscoAcionamentos || flags.observacoes || flags.assinatura ||
      flags.anexos || flags.headerNome || flags.headerVtr || flags.headerResponsavel ||
      flags.producaoKeys);
  }

  function stableStringify(value) {
    if (value == null) return 'null';
    if (typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) {
      return '[' + value.map(stableStringify).join(',') + ']';
    }
    var keys = Object.keys(value).sort();
    var parts = [];
    for (var i = 0; i < keys.length; i++) {
      parts.push(JSON.stringify(keys[i]) + ':' + stableStringify(value[keys[i]]));
    }
    return '{' + parts.join(',') + '}';
  }

  function hashString(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return 'fp-' + (h >>> 0).toString(16) + '-' + s.length;
  }

  /**
   * Projeção semântica do conteúdo que precisa ser preservado no recovery.
   * Exclui apenas metadados server-only / voláteis do rsd-get.
   */
  function recoveryRelevantProjection(payload) {
    payload = payload && typeof payload === 'object' ? payload : {};
    var out = {};
    var keys = Object.keys(payload);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (SERVER_ONLY_META_KEYS[k]) continue;
      // Metadados de revisão/sync não provam conteúdo; excluir da igualdade B.
      if (k === 'draftRevision' || k === 'payloadHash' || k === 'versao' ||
          k === 'savedAt' || k === 'updatedAt' || k === 'ultimoRascunhoEm' ||
          k === 'sincronizadoEm' || k === 'schema' || k === 'origem') continue;
      out[k] = payload[k];
    }
    // Garantir presença explícita dos campos operacionais (mesmo vazios) para estabilidade.
    var ensure = [
      'reportId', 'serviceId', 'guarnicao', 'ocorrencias', 'operacoes', 'operacoesAcumuladas',
      'veiculos', 'veiculosRecuperados', 'cirvc', 'arvc', 'tcos', 'tco', 'fisco',
      'observacoes', 'anexos', 'assinatura', 'assinaturas', 'producao', 'alteracoes',
      'viaturas', 'matriculaResponsavel', 'unidade', 'servico', 'bo', 'bopm', 'passagens'
    ];
    for (var j = 0; j < ensure.length; j++) {
      var ek = ensure[j];
      if (!Object.prototype.hasOwnProperty.call(out, ek) && Object.prototype.hasOwnProperty.call(payload, ek)) {
        out[ek] = payload[ek];
      }
    }
    return out;
  }

  function recoveryFingerprint(payload) {
    try {
      return hashString(stableStringify(recoveryRelevantProjection(payload)));
    } catch (_) {
      return 'fp-unknown';
    }
  }

  /** Alias legado — fingerprint de objeto já projetado. */
  function simpleFingerprint(obj) {
    try {
      return hashString(stableStringify(obj || {}));
    } catch (_) {
      return 'fp-unknown';
    }
  }

  function draftIdentity(p) {
    p = p || {};
    return {
      reportId: String(p.reportId || ''),
      serviceId: String(p.serviceId || (p.servico && p.servico.serviceId) || '')
    };
  }

  function identityMatches(localId, expectedReportId, expectedServiceId) {
    var er = String(expectedReportId || '');
    var es = String(expectedServiceId || '');
    var lr = String(localId.reportId || '');
    var ls = String(localId.serviceId || '');
    if (er && lr && er !== lr) return false;
    if (es && ls && es !== ls) return false;
    if (er && !lr) return false;
    return true;
  }

  function preHydrationKeyFor(reportId) {
    var id = String(reportId || '').trim();
    if (!id) return PRE_HYDRATION_KEY_LEGACY;
    return PRE_HYDRATION_KEY_PREFIX + id;
  }

  function ensureServerFpStore(mem) {
    if (!mem.__rsdServerRecoveryFingerprint) mem.__rsdServerRecoveryFingerprint = {};
    return mem.__rsdServerRecoveryFingerprint;
  }

  function serverFpKey(reportId, serviceId) {
    return String(reportId || '') + '::' + String(serviceId || '');
  }

  /**
   * Guarda fingerprint do payload servidor ANTES de applyPayload.
   */
  function rememberServerRecoveryFingerprint(serverPayload, opts) {
    opts = opts || {};
    var mem = opts.memoryStore || (typeof globalThis !== 'undefined' ? globalThis : {});
    var store = ensureServerFpStore(mem);
    var id = draftIdentity(serverPayload || {});
    var reportId = String(opts.reportId || id.reportId || '');
    var serviceId = String(opts.serviceId || id.serviceId || '');
    if (!reportId) return { ok: false, reason: 'MISSING_REPORT_ID' };
    var fp = recoveryFingerprint(serverPayload || {});
    var entry = {
      reportId: reportId,
      serviceId: serviceId,
      fingerprint: fp,
      capturedAt: new Date().toISOString()
    };
    store[reportId] = entry;
    store[serverFpKey(reportId, serviceId)] = entry;
    if (typeof window !== 'undefined') {
      if (!window.__rsdServerRecoveryFingerprint) window.__rsdServerRecoveryFingerprint = {};
      window.__rsdServerRecoveryFingerprint[reportId] = entry;
      window.__rsdServerRecoveryFingerprint[serverFpKey(reportId, serviceId)] = entry;
    }
    return { ok: true, fingerprint: fp, reportId: reportId, serviceId: serviceId };
  }

  function getServerRecoveryFingerprint(opts) {
    opts = opts || {};
    var mem = opts.memoryStore || (typeof globalThis !== 'undefined' ? globalThis : {});
    var store = ensureServerFpStore(mem);
    var reportId = String(opts.reportId || '');
    var serviceId = String(opts.serviceId || '');
    if (opts.fingerprint) return String(opts.fingerprint);
    if (serviceId && store[serverFpKey(reportId, serviceId)]) {
      return store[serverFpKey(reportId, serviceId)].fingerprint;
    }
    if (reportId && store[reportId]) return store[reportId].fingerprint;
    if (typeof window !== 'undefined' && window.__rsdServerRecoveryFingerprint) {
      var w = window.__rsdServerRecoveryFingerprint;
      if (serviceId && w[serverFpKey(reportId, serviceId)]) return w[serverFpKey(reportId, serviceId)].fingerprint;
      if (reportId && w[reportId]) return w[reportId].fingerprint;
    }
    return opts.knownServer && (opts.knownServer.recoveryFingerprint || opts.knownServer.fingerprint) || null;
  }

  /**
   * Migração segura da chave global legada → chave por reportId.
   * Nunca atribui draft de um RSD a outro; nunca apaga silenciosamente.
   */
  function migrateLegacyPreHydration(ls, expectedReportId) {
    var legacyRaw = readStorage(ls, PRE_HYDRATION_KEY_LEGACY);
    var legacy = safeParse(legacyRaw);
    if (!legacy || !legacy.draft) return null;
    var legId = String(legacy.reportId || draftIdentity(legacy.draft).reportId || '');
    if (!legId) return null;
    var specificKey = preHydrationKeyFor(legId);
    var existingSpecific = safeParse(readStorage(ls, specificKey));
    if (!existingSpecific || !existingSpecific.draft) {
      writeStorage(ls, specificKey, JSON.stringify(legacy));
    }
    // Só devolve se for o RSD esperado.
    if (expectedReportId && legId !== String(expectedReportId)) return null;
    return legacy;
  }

  /**
   * Captura o DRAFT_KEY atual ANTES de applyPayload/salvarRascunho da hidratação.
   * Persiste em chave por reportId. Não sobrescreve cópia existente do mesmo reportId.
   */
  function capturePreHydrationDraft(opts) {
    opts = opts || {};
    var ls = opts.localStorage || (typeof localStorage !== 'undefined' ? localStorage : null);
    var expectedReportId = String(opts.reportId || '');
    var expectedServiceId = String(opts.serviceId || '');
    var mem = opts.memoryStore || (typeof globalThis !== 'undefined' ? globalThis : {});
    if (!mem.__rsdPreHydrationMem) mem.__rsdPreHydrationMem = {};

    // Se caller passar serverPayload, registrar fingerprint servidor no mesmo momento.
    if (opts.serverPayload) {
      rememberServerRecoveryFingerprint(opts.serverPayload, {
        reportId: expectedReportId,
        serviceId: expectedServiceId,
        memoryStore: mem
      });
    }

    var raw = readStorage(ls, DRAFT_KEY);
    var draft = safeParse(raw);
    if (!draft || typeof draft !== 'object') {
      return { captured: false, reason: 'NO_DRAFT_KEY', source: null };
    }
    var id = draftIdentity(draft);
    if (!identityMatches(id, expectedReportId, expectedServiceId)) {
      return {
        captured: false,
        reason: 'LOCAL_DRAFT_FOREIGN',
        source: 'DRAFT_KEY',
        localReportId: id.reportId,
        localServiceId: id.serviceId,
        expectedReportId: expectedReportId,
        expectedServiceId: expectedServiceId
      };
    }

    var reportId = id.reportId || expectedReportId;
    var bundle = {
      schema: 'pmpb-transito-rsd-pre-hydration-v1',
      capturedAt: new Date().toISOString(),
      reportId: reportId,
      serviceId: id.serviceId || expectedServiceId,
      draft: draft,
      recoveryFingerprint: recoveryFingerprint(draft)
    };

    var specificKey = preHydrationKeyFor(reportId);
    var existing = safeParse(readStorage(ls, specificKey));
    if (!existing || !existing.draft) {
      // Tentar migrar legada se for o mesmo reportId
      var migrated = migrateLegacyPreHydration(ls, reportId);
      if (migrated && migrated.draft) existing = migrated;
    }
    if (existing && existing.draft && String(existing.reportId || draftIdentity(existing.draft).reportId) === String(reportId)) {
      mem.__rsdPreHydrationMem[reportId] = existing;
      return {
        captured: true,
        reused: true,
        reason: 'EXISTING_PRE_HYDRATION_KEPT',
        source: 'PRE_HYDRATION_DRAFT',
        key: specificKey,
        bundle: existing
      };
    }

    writeStorage(ls, specificKey, JSON.stringify(bundle));
    mem.__rsdPreHydrationMem[reportId] = bundle;
    return {
      captured: true,
      reused: false,
      reason: 'CAPTURED',
      source: 'PRE_HYDRATION_DRAFT',
      key: specificKey,
      bundle: bundle
    };
  }

  function getPreHydrationDraft(opts) {
    opts = opts || {};
    var ls = opts.localStorage || (typeof localStorage !== 'undefined' ? localStorage : null);
    var expectedReportId = String(opts.reportId || '');
    var mem = opts.memoryStore || (typeof globalThis !== 'undefined' ? globalThis : {});
    var fromMem = mem.__rsdPreHydrationMem && expectedReportId ? mem.__rsdPreHydrationMem[expectedReportId] : null;
    if (fromMem && fromMem.draft) return fromMem;

    if (expectedReportId) {
      var specific = safeParse(readStorage(ls, preHydrationKeyFor(expectedReportId)));
      if (specific && specific.draft && String(specific.reportId || draftIdentity(specific.draft).reportId) === expectedReportId) {
        return specific;
      }
      var migrated = migrateLegacyPreHydration(ls, expectedReportId);
      if (migrated && migrated.draft) return migrated;
      return null;
    }

    // Sem reportId: não inventar identidade a partir da chave legada.
    return null;
  }

  function classifyAgainstServer(localPayload, localFp, serverFp, known) {
    known = known || {};
    var localRev = localPayload && localPayload.draftRevision != null ? Number(localPayload.draftRevision) : null;
    var serverRev = known.draftRevision != null ? Number(known.draftRevision) : null;
    var localTs = localPayload && (localPayload.savedAt || localPayload.updatedAt ||
      (localPayload.servico && localPayload.servico.atualizadoEm) || localPayload.ultimoRascunhoEm) || null;
    var serverTs = known.sincronizadoEm || known.ultimoRascunhoEm || known.serverTimestamp || null;

    var fpComparable = !!(localFp && serverFp && localFp !== 'fp-unknown' && serverFp !== 'fp-unknown');
    if (fpComparable && localFp === serverFp) {
      return {
        classification: 'LOCAL_DRAFT_PRESENT',
        fingerprintsMatch: true,
        comparableToServer: true
      };
    }
    if (fpComparable && localFp !== serverFp) {
      // Evidência temporal inequívoca opcional (não libera Path B).
      var newer = false;
      if (localRev != null && serverRev != null && localRev > serverRev) newer = true;
      else if (localTs && serverTs) {
        var lt = Date.parse(String(localTs));
        var st = Date.parse(String(serverTs));
        // Só aceitar timestamps ISO parseáveis e local claramente posterior.
        if (isFinite(lt) && isFinite(st) && lt > st) newer = true;
      }
      return {
        classification: newer ? 'LOCAL_DRAFT_NEWER_THAN_SERVER' : 'LOCAL_DRAFT_DIFFERENT_FROM_SERVER',
        fingerprintsMatch: false,
        comparableToServer: true
      };
    }
    // Sem fingerprint servidor: não há comparação segura → UNKNOWN
    return {
      classification: 'LOCAL_DRAFT_UNKNOWN',
      fingerprintsMatch: false,
      comparableToServer: false
    };
  }

  function diagnoseLocalDraft(opts) {
    opts = opts || {};
    var ls = opts.localStorage || (typeof localStorage !== 'undefined' ? localStorage : null);
    var known = opts.knownServer || {};
    var expectedReportId = String(opts.reportId || known.reportId || '');
    var expectedServiceId = String(opts.serviceId || known.serviceId || '');

    var pre = getPreHydrationDraft({
      localStorage: ls,
      reportId: expectedReportId,
      memoryStore: opts.memoryStore
    });
    var draftKeyPayload = safeParse(readStorage(ls, DRAFT_KEY));
    var live = opts.livePayload && typeof opts.livePayload === 'object' ? opts.livePayload : null;

    var localSource = null;
    var localPayload = null;

    if (pre && pre.draft) {
      var preId = draftIdentity(pre.draft);
      if (identityMatches(preId, expectedReportId, expectedServiceId)) {
        localSource = 'PRE_HYDRATION_LOCAL_DRAFT';
        localPayload = pre.draft;
      }
    }
    if (!localPayload && draftKeyPayload) {
      var dkId = draftIdentity(draftKeyPayload);
      if (!identityMatches(dkId, expectedReportId, expectedServiceId)) {
        return {
          mode: 'READ_ONLY_LOCAL_DIAG',
          classification: 'LOCAL_DRAFT_FOREIGN',
          reportId: expectedReportId,
          serviceId: expectedServiceId,
          foreignReportId: dkId.reportId,
          foreignServiceId: dkId.serviceId,
          localSource: 'DRAFT_KEY_CURRENT',
          localDraftPresent: true,
          substantiveContent: hasSubstantiveContent(sectionFlags(draftKeyPayload)),
          sections: sectionFlags(draftKeyPayload),
          diagnosedAt: new Date().toISOString(),
          notes: ['Draft local pertence a outro RSD/serviço. Não apagar. Não exportar como se fosse o atual.']
        };
      }
      localSource = 'DRAFT_KEY_CURRENT';
      localPayload = draftKeyPayload;
    }
    if (!localPayload && live) {
      var liveId = draftIdentity(live);
      if (expectedReportId && liveId.reportId && liveId.reportId !== expectedReportId) {
        return {
          mode: 'READ_ONLY_LOCAL_DIAG',
          classification: 'LOCAL_DRAFT_FOREIGN',
          reportId: expectedReportId,
          serviceId: expectedServiceId,
          foreignReportId: liveId.reportId,
          localSource: 'LIVE_FORM',
          localDraftPresent: true,
          diagnosedAt: new Date().toISOString()
        };
      }
      localSource = 'LIVE_FORM';
      localPayload = live;
    }

    var deviceId = opts.deviceId || readStorage(ls, DEVICE_ID_KEY) || '';
    var flags = sectionFlags(localPayload || {});
    var substantive = hasSubstantiveContent(flags);
    var localTs = localPayload && (localPayload.savedAt || localPayload.updatedAt ||
      (localPayload.servico && localPayload.servico.atualizadoEm) || localPayload.ultimoRascunhoEm) || null;
    var localRev = localPayload && localPayload.draftRevision != null ? Number(localPayload.draftRevision) : null;
    var localFp = localPayload ? recoveryFingerprint(localPayload) : null;

    var serverFp = getServerRecoveryFingerprint({
      reportId: expectedReportId,
      serviceId: expectedServiceId,
      memoryStore: opts.memoryStore,
      knownServer: known,
      fingerprint: opts.serverFingerprint || known.recoveryFingerprint || null
    });
    // Também aceitar serverPayload passado no diagnóstico
    if (!serverFp && opts.serverPayload) {
      serverFp = recoveryFingerprint(opts.serverPayload);
    }

    var classification = 'LOCAL_DRAFT_UNKNOWN';
    var fingerprintsMatch = false;
    var comparable = false;
    if (!localPayload || !substantive) {
      classification = 'LOCAL_DRAFT_EMPTY';
    } else {
      var cmp = classifyAgainstServer(localPayload, localFp, serverFp, known);
      classification = cmp.classification;
      fingerprintsMatch = !!cmp.fingerprintsMatch;
      comparable = !!cmp.comparableToServer;
    }

    return {
      mode: 'READ_ONLY_LOCAL_DIAG',
      classification: classification,
      reportId: expectedReportId || draftIdentity(localPayload || {}).reportId,
      serviceId: expectedServiceId || draftIdentity(localPayload || {}).serviceId,
      deviceId: String(deviceId || ''),
      localSource: localSource,
      localDraftPresent: !!localPayload,
      localTimestamp: localTs,
      localDraftRevision: localRev,
      localFingerprint: localFp,
      serverRecoveryFingerprint: serverFp || null,
      fingerprintsMatch: fingerprintsMatch,
      comparableToServer: comparable,
      operationalDate: (localPayload && localPayload.servico && (localPayload.servico.data || localPayload.servico.operationalDate)) || known.operationalDate || '',
      sections: flags,
      substantiveContent: substantive,
      knownServer: {
        draftRevision: known.draftRevision != null ? Number(known.draftRevision) : null,
        payloadHash: known.payloadHash || null,
        sincronizadoEm: known.sincronizadoEm || null,
        ultimoRascunhoEm: known.ultimoRascunhoEm || null,
        fingerprint: serverFp || null,
        recoveryFingerprint: serverFp || null
      },
      diagnosedAt: new Date().toISOString(),
      notes: [
        'Nenhum dado foi enviado ao backend.',
        'DEGRADED_CLOUD_SYNC_BLOCKED=TRUE enquanto hydration=DEGRADED.',
        'Fonte analisada: ' + (localSource || 'NONE'),
        'Path B exige fingerprint semântico local === servidor (revision sozinha NÃO libera).'
      ]
    };
  }

  function evaluateOperatorRelease(diag, opts) {
    opts = opts || {};
    diag = diag || {};
    var exportPreserved = !!opts.localContingencyExportPreserved;

    if (diag.classification === 'LOCAL_DRAFT_FOREIGN') {
      return {
        operatorReleaseConfirmed: false,
        path: null,
        reason: 'LOCAL_DRAFT_FOREIGN: draft pertence a outro REPORT_ID/SERVICE_ID.'
      };
    }
    if (diag.classification === 'LOCAL_DRAFT_EMPTY') {
      return {
        operatorReleaseConfirmed: true,
        path: 'A',
        reason: 'Aparelho examinado: LOCAL_DRAFT_EMPTY.'
      };
    }
    if (diag.classification === 'LOCAL_DRAFT_PRESENT') {
      var sr = diag.knownServer || {};
      var localFp = diag.localFingerprint;
      var serverFp = diag.serverRecoveryFingerprint || sr.recoveryFingerprint || sr.fingerprint;
      var idOk = !!(diag.reportId && (!sr.reportId || String(diag.reportId) === String(sr.reportId)));
      // Path B: SOMENTE igualdade positiva de fingerprint. Revision/timestamp NÃO liberam.
      if (idOk && localFp && serverFp && localFp !== 'fp-unknown' && serverFp !== 'fp-unknown' &&
          localFp === serverFp && diag.fingerprintsMatch !== false) {
        return {
          operatorReleaseConfirmed: true,
          path: 'B',
          reason: 'Fingerprint semântico local === servidor (conteúdo recovery-relevante idêntico).'
        };
      }
      return {
        operatorReleaseConfirmed: false,
        path: null,
        reason: 'LOCAL_DRAFT_PRESENT sem igualdade de fingerprint → não liberar Path B (revision sozinha é insuficiente).'
      };
    }
    if (diag.classification === 'LOCAL_DRAFT_NEWER_THAN_SERVER' ||
        diag.classification === 'LOCAL_DRAFT_DIFFERENT_FROM_SERVER') {
      if (exportPreserved) {
        return {
          operatorReleaseConfirmed: true,
          path: 'C',
          reason: 'Conteúdo local diferente/adicional exportado e preservado para merge posterior.'
        };
      }
      return {
        operatorReleaseConfirmed: false,
        path: null,
        reason: diag.classification + ' sem contingência preservada. Exportar JSON local antes de qualquer release.'
      };
    }
    return {
      operatorReleaseConfirmed: false,
      path: null,
      reason: 'LOCAL_DRAFT_UNKNOWN — examinar aparelho; ausência de evidência ≠ segurança.',
      rejectedLeaseOnly: true
    };
  }

  function buildContingencyExport(localPayload, meta) {
    meta = meta || {};
    return {
      schema: 'pmpb-transito-rsd-local-contingency-v1',
      exportedAt: new Date().toISOString(),
      purpose: 'CONTINGENCIA_LOCAL_NAO_ENVIAR_AUTOMATICAMENTE',
      meta: {
        reportId: meta.reportId || (localPayload && localPayload.reportId) || '',
        serviceId: meta.serviceId || (localPayload && localPayload.serviceId) || '',
        deviceId: meta.deviceId || '',
        classification: meta.classification || '',
        localFingerprint: meta.localFingerprint || (localPayload ? recoveryFingerprint(localPayload) : ''),
        source: meta.source || ''
      },
      relatorio: localPayload || null
    };
  }

  function pathCClassifications() {
    return {
      LOCAL_DRAFT_NEWER_THAN_SERVER: true,
      LOCAL_DRAFT_DIFFERENT_FROM_SERVER: true
    };
  }

  /** Valida bloco operatorRelease do manifesto de recovery. */
  function validateManifestOperatorRelease(operatorRelease, editor) {
    operatorRelease = operatorRelease || {};
    if (!operatorRelease.confirmed) {
      return { ok: false, code: 'OPERATOR_RELEASE_REQUIRED', detail: 'confirmed!=true' };
    }
    if (editor && editor.leaseActive) {
      return { ok: false, code: 'ACTIVE_EDIT_LEASE', detail: 'lease ativo impede release' };
    }
    if (editor && editor.activePeriodRecoveryCaution) {
      return { ok: false, code: 'ACTIVE_PERIOD_RECOVERY_CAUTION', detail: 'período ativo impede release' };
    }
    var path = String(operatorRelease.path || '');
    if (['A', 'B', 'C'].indexOf(path) < 0) {
      return { ok: false, code: 'OPERATOR_RELEASE_INVALID', detail: 'path inválido' };
    }
    if (!operatorRelease.inspectedAt) {
      return { ok: false, code: 'OPERATOR_RELEASE_INVALID', detail: 'inspectedAt ausente' };
    }
    if (!operatorRelease.localClassification) {
      return { ok: false, code: 'OPERATOR_RELEASE_INVALID', detail: 'localClassification ausente' };
    }
    if (path === 'C' && !operatorRelease.contingencyPreserved) {
      return { ok: false, code: 'OPERATOR_RELEASE_INVALID', detail: 'contingencyPreserved' };
    }
    if (String(operatorRelease.localClassification) === 'LOCAL_DRAFT_FOREIGN') {
      return { ok: false, code: 'LOCAL_DRAFT_FOREIGN', detail: 'release impossível para draft estrangeiro' };
    }
    if (path === 'A' && String(operatorRelease.localClassification) !== 'LOCAL_DRAFT_EMPTY') {
      return { ok: false, code: 'OPERATOR_RELEASE_INVALID', detail: 'path A exige LOCAL_DRAFT_EMPTY' };
    }
    if (path === 'B' && String(operatorRelease.localClassification) !== 'LOCAL_DRAFT_PRESENT') {
      return { ok: false, code: 'OPERATOR_RELEASE_INVALID', detail: 'path B exige LOCAL_DRAFT_PRESENT' };
    }
    if (path === 'C' && !pathCClassifications()[String(operatorRelease.localClassification)]) {
      return {
        ok: false,
        code: 'OPERATOR_RELEASE_INVALID',
        detail: 'path C exige LOCAL_DRAFT_NEWER_THAN_SERVER ou LOCAL_DRAFT_DIFFERENT_FROM_SERVER'
      };
    }
    return { ok: true, path: path };
  }

  function cloneData(value) {
    if (value == null) return value;
    return JSON.parse(JSON.stringify(value));
  }

  /** Mesma regra de num() do formulário: inteiro; vazio ou inválido não é produção. */
  function positiveLeaf(value) {
    if (value == null || typeof value === 'object') return 0;
    var n = parseInt(String(value).replace(/[^0-9-]/g, ''), 10);
    if (!isFinite(n) || n <= 0) return 0;
    return n;
  }

  function walkProduction(node, path, visit) {
    if (!node || typeof node !== 'object') return;
    var keys = Object.keys(node);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var value = node[key];
      var next = path.concat(key);
      if (value && typeof value === 'object') walkProduction(value, next, visit);
      else visit(next, value);
    }
  }

  function productionHasPositive(prod) {
    var found = false;
    walkProduction(prod, [], function (_path, value) {
      if (positiveLeaf(value) > 0) found = true;
    });
    return found;
  }

  function getLeaf(root, path) {
    var node = root;
    for (var i = 0; i < path.length; i++) {
      if (!node || typeof node !== 'object') return undefined;
      node = node[path[i]];
    }
    return node;
  }

  function setLeaf(root, path, value) {
    var node = root;
    for (var i = 0; i < path.length - 1; i++) {
      var key = path[i];
      if (!node[key] || typeof node[key] !== 'object') node[key] = {};
      node = node[key];
    }
    node[path[path.length - 1]] = value;
  }

  /**
   * Preenche só folhas zeradas/ausentes. Folha já positiva na Central permanece.
   * Um zero local não apaga produção já gravada.
   */
  function mergeProductionKeepServerPositive(serverProd, localProd) {
    var out = cloneData(serverProd && typeof serverProd === 'object' ? serverProd : {}) || {};
    walkProduction(localProd, [], function (path, value) {
      var localN = positiveLeaf(value);
      if (!(localN > 0)) return;
      if (positiveLeaf(getLeaf(out, path)) > 0) return;
      setLeaf(out, path, localN);
    });
    return out;
  }

  function unionById(serverArr, localArr) {
    var out = Array.isArray(serverArr) ? cloneData(serverArr) : [];
    var seen = {};
    var i;
    for (i = 0; i < out.length; i++) {
      if (out[i] && out[i].id) seen[String(out[i].id)] = true;
    }
    var local = Array.isArray(localArr) ? localArr : [];
    for (i = 0; i < local.length; i++) {
      var item = local[i];
      if (!item || typeof item !== 'object') continue;
      if (item.id && seen[String(item.id)]) continue;
      var copy = cloneData(item);
      if (!item.id) {
        var key = stableStringify(copy);
        var dup = false;
        for (var k = 0; k < out.length; k++) {
          if (stableStringify(out[k]) === key) { dup = true; break; }
        }
        if (dup) continue;
      }
      out.push(copy);
      if (copy && copy.id) seen[String(copy.id)] = true;
    }
    return out;
  }

  /**
   * Reidratação: cabeçalho/identidade vêm da Central.
   * Produção positiva, ocorrência e observação que só existem no aparelho
   * entram no payload exibido — sem substituir valor positivo já gravado.
   */
  function preserveUnsyncedOperationalContent(serverPayload, localDraft) {
    var server = serverPayload && typeof serverPayload === 'object' ? serverPayload : {};
    if (!localDraft || typeof localDraft !== 'object') return cloneData(server);
    var serverId = draftIdentity(server);
    var localId = draftIdentity(localDraft);
    if (!identityMatches(localId, serverId.reportId, serverId.serviceId)) return cloneData(server);
    var out = cloneData(server);
    out.producao = mergeProductionKeepServerPositive(out.producao, localDraft.producao);
    out.ocorrencias = unionById(out.ocorrencias, localDraft.ocorrencias);
    if (!filled(out.observacoes) && filled(localDraft.observacoes)) out.observacoes = String(localDraft.observacoes);
    return out;
  }

  function hasPositiveOperational(payload) {
    if (!payload || typeof payload !== 'object') return false;
    return productionHasPositive(payload.producao) || countArr(payload, ['ocorrencias']) > 0 || filled(payload.observacoes);
  }

  /**
   * Gravação local explícita enquanto a nuvem está bloqueada.
   * Não grava formulário operacionalmente vazio por cima de outro RSD.
   */
  function commitExplicitLocalDraft(prev, next) {
    if (!next || typeof next !== 'object') return { write: false, reason: 'EMPTY_NEXT' };
    if (prev && typeof prev === 'object' && prev.reportId && next.reportId && String(prev.reportId) !== String(next.reportId)) {
      return { write: false, reason: 'FOREIGN' };
    }
    if (!hasPositiveOperational(next)) return { write: false, reason: 'NO_OPERATIONAL_CONTENT' };
    return { write: true, reason: 'EXPLICIT_OPERATIONAL', draft: preserveUnsyncedOperationalContent(next, prev) };
  }

  return {
    DRAFT_KEY: DRAFT_KEY,
    PRE_HYDRATION_KEY: PRE_HYDRATION_KEY_LEGACY,
    PRE_HYDRATION_KEY_LEGACY: PRE_HYDRATION_KEY_LEGACY,
    PRE_HYDRATION_KEY_PREFIX: PRE_HYDRATION_KEY_PREFIX,
    preHydrationKeyFor: preHydrationKeyFor,
    recoveryRelevantProjection: recoveryRelevantProjection,
    recoveryFingerprint: recoveryFingerprint,
    rememberServerRecoveryFingerprint: rememberServerRecoveryFingerprint,
    getServerRecoveryFingerprint: getServerRecoveryFingerprint,
    capturePreHydrationDraft: capturePreHydrationDraft,
    getPreHydrationDraft: getPreHydrationDraft,
    diagnoseLocalDraft: diagnoseLocalDraft,
    evaluateOperatorRelease: evaluateOperatorRelease,
    validateManifestOperatorRelease: validateManifestOperatorRelease,
    buildContingencyExport: buildContingencyExport,
    sectionFlags: sectionFlags,
    hasSubstantiveContent: hasSubstantiveContent,
    simpleFingerprint: simpleFingerprint,
    identityMatches: identityMatches,
    draftIdentity: draftIdentity,
    preserveUnsyncedOperationalContent: preserveUnsyncedOperationalContent,
    commitExplicitLocalDraft: commitExplicitLocalDraft,
    productionHasPositive: productionHasPositive
  };
});
