/**
 * Diagnóstico LOCAL read-only de rascunho RSD (FASE 2B-0).
 *
 * - NÃO envia nada ao backend.
 * - NÃO altera localStorage/IndexedDB.
 * - NÃO sincroniza.
 *
 * Usado para decidir OPERATOR_RELEASE_CONFIRMED sem depender só de lease.
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
  var REPORT_ID_KEY = 'pmpb-transito-servico-diario-v2-report-id';
  var SERVICE_ID_KEY = 'pmpb-transito-servico-diario-v2-service-id';
  var DEVICE_ID_KEY = 'pmpb-device-id';
  var GENERIC_PREFIX = 'central-autosave::';

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
    // Fingerprint estrutural (não criptográfico) — só para comparação local.
    try {
      var s = JSON.stringify(obj || {});
      var h = 0;
      for (var i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
      return 'fp-' + (h >>> 0).toString(16) + '-' + s.length;
    } catch (_) {
      return 'fp-unknown';
    }
  }

  function readStorage(storage, key) {
    try {
      if (!storage) return null;
      return storage.getItem(key);
    } catch (_) {
      return null;
    }
  }

  /**
   * @param {object} opts
   *  - localStorage / sessionStorage (opcional; default global)
   *  - knownServer: { reportId, serviceId, draftRevision, payloadHash, sincronizadoEm, ultimoRascunhoEm }
   *  - livePayload: payload atual em memória no formulário (opcional)
   *  - deviceId: override
   *  - pagePath: para central-autosave key
   */
  function diagnoseLocalDraft(opts) {
    opts = opts || {};
    var ls = opts.localStorage || (typeof localStorage !== 'undefined' ? localStorage : null);
    var known = opts.knownServer || {};
    var draftRaw = readStorage(ls, DRAFT_KEY);
    var draft = safeParse(draftRaw);
    var live = opts.livePayload && typeof opts.livePayload === 'object' ? opts.livePayload : null;

    var localSource = null;
    var localPayload = null;
    if (draft && typeof draft === 'object') {
      localSource = 'DRAFT_KEY';
      localPayload = draft;
    } else if (live) {
      localSource = 'LIVE_FORM';
      localPayload = live;
    }

    var reportId = (localPayload && localPayload.reportId) ||
      readStorage(ls, REPORT_ID_KEY) ||
      known.reportId || '';
    var serviceId = (localPayload && (localPayload.serviceId || (localPayload.servico && localPayload.servico.serviceId))) ||
      readStorage(ls, SERVICE_ID_KEY) ||
      known.serviceId || '';
    var deviceId = opts.deviceId || readStorage(ls, DEVICE_ID_KEY) || '';

    var flags = sectionFlags(localPayload || {});
    var substantive = hasSubstantiveContent(flags);
    var localTs = (localPayload && (localPayload.savedAt || localPayload.updatedAt ||
      (localPayload.servico && localPayload.servico.atualizadoEm) ||
      localPayload.ultimoRascunhoEm)) || null;
    var localRev = localPayload && (localPayload.draftRevision != null)
      ? Number(localPayload.draftRevision)
      : null;
    var localFp = localPayload ? simpleFingerprint({
      reportId: reportId,
      serviceId: serviceId,
      guarnicao: localPayload.guarnicao,
      ocorrencias: localPayload.ocorrencias,
      operacoes: localPayload.operacoes,
      observacoes: localPayload.observacoes,
      cirvc: localPayload.cirvc || localPayload.arvc,
      tcos: localPayload.tcos || localPayload.tco
    }) : null;

    var classification = 'LOCAL_DRAFT_UNKNOWN';
    if (!localPayload) {
      classification = 'LOCAL_DRAFT_EMPTY';
    } else if (!substantive && !filled((localPayload.guarnicao || {}).nome)) {
      // draft exists but empty/degraded shell
      classification = 'LOCAL_DRAFT_EMPTY';
    } else {
      classification = 'LOCAL_DRAFT_PRESENT';
      var serverTs = known.sincronizadoEm || known.ultimoRascunhoEm || known.serverTimestamp || null;
      var serverRev = known.draftRevision != null ? Number(known.draftRevision) : null;
      if (localRev != null && serverRev != null && localRev > serverRev) {
        classification = 'LOCAL_DRAFT_NEWER_THAN_SERVER';
      } else if (localTs && serverTs) {
        var lt = Date.parse(String(localTs));
        var st = Date.parse(String(serverTs));
        if (isFinite(lt) && isFinite(st) && lt > st && substantive) {
          classification = 'LOCAL_DRAFT_NEWER_THAN_SERVER';
        }
      }
    }

    var opDate = (localPayload && localPayload.servico && (localPayload.servico.data || localPayload.servico.operationalDate)) ||
      known.operationalDate || '';

    return {
      mode: 'READ_ONLY_LOCAL_DIAG',
      classification: classification,
      reportId: String(reportId || ''),
      serviceId: String(serviceId || ''),
      deviceId: String(deviceId || ''),
      localSource: localSource,
      localDraftPresent: !!localPayload,
      localTimestamp: localTs,
      localDraftRevision: localRev,
      localFingerprint: localFp,
      operationalDate: opDate,
      sections: flags,
      substantiveContent: substantive,
      knownServer: {
        draftRevision: known.draftRevision != null ? Number(known.draftRevision) : null,
        payloadHash: known.payloadHash || null,
        sincronizadoEm: known.sincronizadoEm || null,
        ultimoRascunhoEm: known.ultimoRascunhoEm || null
      },
      diagnosedAt: new Date().toISOString(),
      notes: [
        'Nenhum dado foi enviado ao backend.',
        'Nenhum localStorage/IndexedDB foi alterado por este diagnóstico.',
        'DEGRADED_CLOUD_SYNC_BLOCKED: cloud sync permanece bloqueado enquanto hydration=DEGRADED.'
      ]
    };
  }

  /**
   * OPERATOR_RELEASE_CONFIRMED só com evidência de aparelho (A/B/C).
   * Lease expirado / device id antigo NÃO bastam.
   */
  function evaluateOperatorRelease(diag, opts) {
    opts = opts || {};
    diag = diag || {};
    var exportPreserved = !!opts.localContingencyExportPreserved;
    var confirmed = false;
    var path = null;
    var reason = '';

    if (diag.classification === 'LOCAL_DRAFT_EMPTY') {
      confirmed = true;
      path = 'A';
      reason = 'Aparelho examinado: LOCAL_DRAFT_EMPTY.';
    } else if (diag.classification === 'LOCAL_DRAFT_PRESENT' && !diag.substantiveContent) {
      confirmed = true;
      path = 'A';
      reason = 'Draft local presente mas sem conteúdo substantivo (tratado como vazio).';
    } else if (diag.classification === 'LOCAL_DRAFT_PRESENT') {
      confirmed = true;
      path = 'B';
      reason = 'Draft local presente sem indício de ser mais recente que o servidor.';
    } else if (diag.classification === 'LOCAL_DRAFT_NEWER_THAN_SERVER' && exportPreserved) {
      confirmed = true;
      path = 'C';
      reason = 'Conteúdo local adicional exportado e preservado para merge posterior.';
    } else if (diag.classification === 'LOCAL_DRAFT_NEWER_THAN_SERVER') {
      confirmed = false;
      path = null;
      reason = 'Há draft local potencialmente mais novo; exportar contingência antes do release.';
    } else {
      confirmed = false;
      reason = 'LOCAL_DRAFT_UNKNOWN — examinar aparelho.';
    }

    return {
      operatorReleaseConfirmed: confirmed,
      path: path,
      reason: reason,
      rejectedLeaseOnly: true,
      note: 'EDIT_LEASE_UNTIL expirado ou EDIT_DEVICE_ID antigo NÃO confirmam release.'
    };
  }

  /** Monta pacote de contingência LOCAL (caller faz download; sem upload). */
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
        localFingerprint: meta.localFingerprint || ''
      },
      relatorio: localPayload || null
    };
  }

  return {
    DRAFT_KEY: DRAFT_KEY,
    diagnoseLocalDraft: diagnoseLocalDraft,
    evaluateOperatorRelease: evaluateOperatorRelease,
    buildContingencyExport: buildContingencyExport,
    sectionFlags: sectionFlags,
    hasSubstantiveContent: hasSubstantiveContent,
    simpleFingerprint: simpleFingerprint
  };
});
