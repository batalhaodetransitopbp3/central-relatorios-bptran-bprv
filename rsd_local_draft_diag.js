/**
 * Diagnóstico LOCAL read-only + preservação pré-hydration (FASE 2B-0 / revisão).
 *
 * - NÃO envia ao backend.
 * - Captura PRE_HYDRATION_DRAFT antes de applyPayload/salvarRascunho.
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
  var PRE_HYDRATION_KEY = 'pmpb-transito-servico-diario-v2-pre-hydration-draft';
  var REPORT_ID_KEY = 'pmpb-transito-servico-diario-v2-report-id';
  var SERVICE_ID_KEY = 'pmpb-transito-servico-diario-v2-service-id';
  var DEVICE_ID_KEY = 'pmpb-device-id';

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
      flags.anexos || flags.headerNome || flags.headerVtr || flags.headerResponsavel);
  }

  function simpleFingerprint(obj) {
    try {
      var s = JSON.stringify(obj || {});
      var h = 0;
      for (var i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
      return 'fp-' + (h >>> 0).toString(16) + '-' + s.length;
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
    if (er && !lr) return false; // draft sem reportId não conta para o RSD atual
    return true;
  }

  /**
   * Captura o DRAFT_KEY atual ANTES de applyPayload/salvarRascunho da hidratação.
   * Não sobrescreve PRE_HYDRATION existente do mesmo reportId.
   */
  function capturePreHydrationDraft(opts) {
    opts = opts || {};
    var ls = opts.localStorage || (typeof localStorage !== 'undefined' ? localStorage : null);
    var expectedReportId = String(opts.reportId || '');
    var expectedServiceId = String(opts.serviceId || '');
    var mem = opts.memoryStore || (typeof globalThis !== 'undefined' ? globalThis : {});
    if (!mem.__rsdPreHydrationMem) mem.__rsdPreHydrationMem = {};

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

    var bundle = {
      schema: 'pmpb-transito-rsd-pre-hydration-v1',
      capturedAt: new Date().toISOString(),
      reportId: id.reportId || expectedReportId,
      serviceId: id.serviceId || expectedServiceId,
      draft: draft
    };

    var existingRaw = readStorage(ls, PRE_HYDRATION_KEY);
    var existing = safeParse(existingRaw);
    if (existing && existing.reportId && String(existing.reportId) === String(bundle.reportId) && existing.draft) {
      // Não substituir cópia pré-hydration existente do mesmo serviço.
      mem.__rsdPreHydrationMem[bundle.reportId] = existing;
      return { captured: true, reused: true, reason: 'EXISTING_PRE_HYDRATION_KEPT', source: 'PRE_HYDRATION_DRAFT', bundle: existing };
    }

    writeStorage(ls, PRE_HYDRATION_KEY, JSON.stringify(bundle));
    mem.__rsdPreHydrationMem[bundle.reportId] = bundle;
    return { captured: true, reused: false, reason: 'CAPTURED', source: 'PRE_HYDRATION_DRAFT', bundle: bundle };
  }

  function getPreHydrationDraft(opts) {
    opts = opts || {};
    var ls = opts.localStorage || (typeof localStorage !== 'undefined' ? localStorage : null);
    var expectedReportId = String(opts.reportId || '');
    var mem = opts.memoryStore || (typeof globalThis !== 'undefined' ? globalThis : {});
    var fromMem = mem.__rsdPreHydrationMem && expectedReportId ? mem.__rsdPreHydrationMem[expectedReportId] : null;
    if (fromMem && fromMem.draft) return fromMem;
    var existing = safeParse(readStorage(ls, PRE_HYDRATION_KEY));
    if (existing && existing.draft && (!expectedReportId || String(existing.reportId) === expectedReportId)) return existing;
    return null;
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
    var localFp = localPayload ? simpleFingerprint({
      reportId: draftIdentity(localPayload).reportId,
      serviceId: draftIdentity(localPayload).serviceId,
      guarnicao: localPayload.guarnicao,
      ocorrencias: localPayload.ocorrencias,
      operacoes: localPayload.operacoes,
      observacoes: localPayload.observacoes,
      cirvc: localPayload.cirvc || localPayload.arvc,
      tcos: localPayload.tcos || localPayload.tco
    }) : null;

    var serverRev = known.draftRevision != null ? Number(known.draftRevision) : null;
    var serverTs = known.sincronizadoEm || known.ultimoRascunhoEm || known.serverTimestamp || null;
    var serverFp = known.fingerprint || known.payloadHash || null;
    var comparable = (localRev != null && serverRev != null) ||
      (localTs && serverTs) ||
      (localFp && serverFp);

    var classification = 'LOCAL_DRAFT_UNKNOWN';
    if (!localPayload) {
      classification = 'LOCAL_DRAFT_EMPTY';
    } else if (!substantive) {
      classification = 'LOCAL_DRAFT_EMPTY';
    } else if (!comparable) {
      classification = 'LOCAL_DRAFT_UNKNOWN';
    } else {
      classification = 'LOCAL_DRAFT_PRESENT';
      if (localRev != null && serverRev != null && localRev > serverRev) {
        classification = 'LOCAL_DRAFT_NEWER_THAN_SERVER';
      } else if (localTs && serverTs) {
        var lt = Date.parse(String(localTs));
        var st = Date.parse(String(serverTs));
        if (isFinite(lt) && isFinite(st) && lt > st) classification = 'LOCAL_DRAFT_NEWER_THAN_SERVER';
      }
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
      comparableToServer: !!comparable,
      operationalDate: (localPayload && localPayload.servico && (localPayload.servico.data || localPayload.servico.operationalDate)) || known.operationalDate || '',
      sections: flags,
      substantiveContent: substantive,
      knownServer: {
        draftRevision: serverRev,
        payloadHash: known.payloadHash || null,
        sincronizadoEm: known.sincronizadoEm || null,
        ultimoRascunhoEm: known.ultimoRascunhoEm || null,
        fingerprint: serverFp
      },
      diagnosedAt: new Date().toISOString(),
      notes: [
        'Nenhum dado foi enviado ao backend.',
        'DEGRADED_CLOUD_SYNC_BLOCKED=TRUE enquanto hydration=DEGRADED.',
        'Fonte analisada: ' + (localSource || 'NONE')
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
    if (diag.classification === 'LOCAL_DRAFT_NEWER_THAN_SERVER') {
      if (exportPreserved) {
        return {
          operatorReleaseConfirmed: true,
          path: 'C',
          reason: 'Conteúdo local adicional exportado e preservado para merge posterior.'
        };
      }
      return {
        operatorReleaseConfirmed: false,
        path: null,
        reason: 'LOCAL_DRAFT_NEWER_THAN_SERVER sem contingência preservada.'
      };
    }
    if (diag.classification === 'LOCAL_DRAFT_PRESENT') {
      // Path B exige evidência positiva de que NÃO é posterior ao servidor.
      var sr = diag.knownServer || {};
      var revOk = diag.localDraftRevision != null && sr.draftRevision != null &&
        Number(diag.localDraftRevision) <= Number(sr.draftRevision);
      var tsOk = false;
      if (diag.localTimestamp && (sr.sincronizadoEm || sr.ultimoRascunhoEm)) {
        var lt = Date.parse(String(diag.localTimestamp));
        var st = Date.parse(String(sr.sincronizadoEm || sr.ultimoRascunhoEm));
        tsOk = isFinite(lt) && isFinite(st) && lt <= st;
      }
      var fpOk = !!(diag.localFingerprint && sr.fingerprint && diag.localFingerprint === sr.fingerprint);
      if (revOk || tsOk || fpOk) {
        return {
          operatorReleaseConfirmed: true,
          path: 'B',
          reason: 'Evidência positiva de que draft local não é posterior ao servidor (rev/ts/fp).'
        };
      }
      return {
        operatorReleaseConfirmed: false,
        path: null,
        reason: 'LOCAL_DRAFT_PRESENT sem evidência positiva comparável → tratar como UNKNOWN.'
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
        localFingerprint: meta.localFingerprint || '',
        source: meta.source || ''
      },
      relatorio: localPayload || null
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
      return { ok: false, code: 'OPERATOR_RELEASE_INVALID', detail: 'path C exige contingencyPreserved' };
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
    if (path === 'C' && String(operatorRelease.localClassification) !== 'LOCAL_DRAFT_NEWER_THAN_SERVER') {
      return { ok: false, code: 'OPERATOR_RELEASE_INVALID', detail: 'path C exige LOCAL_DRAFT_NEWER_THAN_SERVER' };
    }
    return { ok: true, path: path };
  }

  return {
    DRAFT_KEY: DRAFT_KEY,
    PRE_HYDRATION_KEY: PRE_HYDRATION_KEY,
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
    draftIdentity: draftIdentity
  };
});
