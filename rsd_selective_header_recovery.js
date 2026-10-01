/**
 * Motor de PATCH SELETIVO DE CABEÇALHO RSD (FASE 2A).
 *
 * - Puro / sem I/O de produção.
 * - Não expõe endpoint; GAS deve chamar apenas via função interna.
 * - Manifesto explícito obrigatório; nunca "descobre" valores no APPLY.
 *
 * Compatível com Node (tests) e Apps Script (global).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.RsdSelectiveHeaderRecovery = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var LEASE_MINUTES = 3; // isoAfterMinutes_(3) no backend

  var HEADER_ALLOWLIST = {
    'guarnicao.nome': true,
    'guarnicao.tipo': true,
    'guarnicao.ordem': true,
    'guarnicao.numero': true,
    'guarnicao.vtrPrincipal': true,
    'guarnicao.viatura': true,
    'guarnicao.viaturas': true,
    'guarnicao.efetivo': true,
    'guarnicao.responsavel': true,
    'guarnicao.matricula': true,
    'guarnicao.postoGrad': true,
    'guarnicao.equipe': true
  };

  var FORBIDDEN_ROOTS = {
    servico: true,
    DATA_SERVICO: true,
    unidade: true,
    reportId: true,
    serviceId: true,
    segmento: true,
    status: true,
    centralStatus: true,
    ocorrencias: true,
    operacoes: true,
    cirvc: true,
    arvc: true,
    tcos: true,
    tco: true,
    fisco: true,
    observacoes: true,
    anexos: true,
    assinatura: true,
    assinaturas: true,
    passagens: true,
    auditoria: true,
    revisoes: true,
    veiculos: true,
    veiculosRecuperados: true,
    producao: true,
    bo: true,
    bopm: true
  };

  var FIELD_ALIASES = {
    'VTR_principal': 'guarnicao.vtrPrincipal',
    'VTRs_adicionais': 'guarnicao.viaturas',
    'responsavel': 'guarnicao.responsavel',
    'matricula': 'guarnicao.matricula',
    'postoGrad': 'guarnicao.postoGrad',
    'efetivo': 'guarnicao.efetivo',
    'equipe': 'guarnicao.equipe'
  };

  function filled(v) {
    if (v == null) return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'object') return Object.keys(v).length > 0;
    return String(v).replace(/\u00a0/g, ' ').trim() !== '';
  }

  function deepClone(o) {
    return JSON.parse(JSON.stringify(o));
  }

  function normalizePath(p) {
    var s = String(p || '').trim();
    if (FIELD_ALIASES[s]) return FIELD_ALIASES[s];
    return s;
  }

  function getByPath(obj, path) {
    var parts = String(path).split('.');
    var cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (cur == null || typeof cur !== 'object') return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  function setByPath(obj, path, value) {
    var parts = String(path).split('.');
    var cur = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      var k = parts[i];
      if (cur[k] == null || typeof cur[k] !== 'object' || Array.isArray(cur[k])) cur[k] = {};
      cur = cur[k];
    }
    cur[parts[parts.length - 1]] = value;
  }

  function valuesEqual(a, b) {
    if (Array.isArray(a) || Array.isArray(b)) {
      return JSON.stringify(normalizeViaturas(a)) === JSON.stringify(normalizeViaturas(b));
    }
    if (typeof a === 'number' || typeof b === 'number') {
      return String(a) === String(b);
    }
    return String(a == null ? '' : a).replace(/\u00a0/g, ' ').trim() ===
      String(b == null ? '' : b).replace(/\u00a0/g, ' ').trim();
  }

  function normalizeViaturas(v) {
    if (!Array.isArray(v)) {
      if (!filled(v)) return [];
      return [{ prefixo: String(v) }];
    }
    return v.map(function (x, i) {
      if (typeof x === 'string') return { prefixo: String(x), ordem: i + 1 };
      return {
        prefixo: String((x && (x.prefixo || x.viatura)) || ''),
        placa: x && x.placa ? String(x.placa) : '',
        marcaModelo: x && x.marcaModelo ? String(x.marcaModelo) : '',
        tipo: x && x.tipo ? String(x.tipo) : '',
        ordem: (x && x.ordem) || i + 1,
        origem: (x && x.origem) || 'HEADER_RECOVERY'
      };
    }).filter(function (x) { return filled(x.prefixo); });
  }

  function leaseActive(editLeaseUntil, nowMs) {
    var t = Date.parse(String(editLeaseUntil || ''));
    return isFinite(t) && t > Number(nowMs);
  }

  /**
   * Classifica o marcador de edição com a semântica real do backend:
   * lease = EDIT_LEASE_UNTIL > now (renovado em +3 min a cada sync/claim).
   * EDIT_DEVICE_ID sozinho NÃO implica edição ativa.
   */
  function classifyEditorState(input, nowMs) {
    input = input || {};
    nowMs = nowMs != null ? Number(nowMs) : Date.now();
    var deviceId = String(input.editDeviceId || '');
    var leaseUntil = String(input.editLeaseUntil || '');
    var status = String(input.status || '').toUpperCase();
    var openStatus = ['EM_SERVICO', 'RETIFICACAO_SOLICITADA', 'RASCUNHO', 'EM_ANDAMENTO'].indexOf(status) >= 0;
    var activePeriod = !!input.activePeriodRecoveryCaution;
    var leaseIsActive = leaseActive(leaseUntil, nowMs);

    var editorClass = 'UNKNOWN_LOCAL_DRAFT';
    if (leaseIsActive) editorClass = 'ACTIVE_EDIT_LEASE';
    else if (deviceId && leaseUntil && !leaseIsActive) editorClass = 'STALE_DEVICE_MARKER';
    else if (!deviceId && !leaseUntil) editorClass = 'STALE_DEVICE_MARKER';
    else editorClass = 'UNKNOWN_LOCAL_DRAFT';

    // Backend não vê localStorage: status aberto ⇒ risco de rascunho local residual.
    var operatorReleaseRequired = false;
    var operatorReason = '';
    if (activePeriod) {
      operatorReleaseRequired = true;
      operatorReason = 'ACTIVE_PERIOD: serviço potencialmente em utilização; fluxo operacional obrigatório antes do apply.';
    } else if (openStatus) {
      operatorReleaseRequired = true;
      operatorReason = 'Status aberto (' + status + '): lease de servidor ' +
        (leaseIsActive ? 'ATIVO' : 'expirado/stale') +
        ', mas possível rascunho local não sincronizado no aparelho.';
    } else {
      operatorReleaseRequired = false;
      operatorReason = 'Status não aberto; lease não ativo.';
    }

    var recoveryAllowed = true;
    var blockers = [];
    if (input.recoveryBlockedDateVerification) {
      recoveryAllowed = false;
      blockers.push('RECOVERY_BLOCKED_DATE_VERIFICATION');
    }
    if (activePeriod) {
      recoveryAllowed = false;
      blockers.push('ACTIVE_PERIOD_RECOVERY_CAUTION');
    }
    if (leaseIsActive) {
      recoveryAllowed = false;
      blockers.push('ACTIVE_EDIT_LEASE');
    }
    if (operatorReleaseRequired && editorClass !== 'ACTIVE_EDIT_LEASE') {
      // STALE + operator release: tecnicamente STALE, apply ainda não autorizado sem confirmação.
      blockers.push('OPERATOR_RELEASE_REQUIRED');
      recoveryAllowed = false;
    }

    return {
      editorClass: editorClass,
      leaseActive: leaseIsActive,
      leaseMinutesSemantics: LEASE_MINUTES,
      editDeviceId: deviceId,
      editLeaseUntil: leaseUntil,
      operatorReleaseRequired: operatorReleaseRequired,
      operatorReleaseReason: operatorReason,
      activePeriodRecoveryCaution: activePeriod,
      recoveryAllowed: recoveryAllowed,
      blockers: blockers,
      nowMs: nowMs,
      nowIso: new Date(nowMs).toISOString()
    };
  }

  function assertAllowlistedPaths(fields) {
    var keys = Object.keys(fields || {});
    for (var i = 0; i < keys.length; i++) {
      var raw = keys[i];
      var path = normalizePath(raw);
      var root = path.split('.')[0];
      if (FORBIDDEN_ROOTS[root] || FORBIDDEN_ROOTS[path]) {
        return { ok: false, code: 'FORBIDDEN_PATH', path: raw, normalized: path };
      }
      if (!HEADER_ALLOWLIST[path]) {
        return { ok: false, code: 'PATH_NOT_ALLOWLISTED', path: raw, normalized: path };
      }
    }
    return { ok: true };
  }

  function validateManifest(manifest) {
    manifest = manifest || {};
    if (!manifest.reportId) return { ok: false, code: 'MISSING_REPORT_ID' };
    if (!manifest.serviceId) return { ok: false, code: 'MISSING_SERVICE_ID' };
    if (manifest.recoveryAllowed === false) {
      return { ok: false, code: 'RECOVERY_NOT_ALLOWED', reportId: manifest.reportId, detail: 'manifest.recoveryAllowed=false' };
    }
    if (manifest.recoveryStatus === 'BLOCKED' ||
        manifest.recoveryStatus === 'RECOVERY_BLOCKED_DATE_VERIFICATION' ||
        manifest.recoveryBlockedDateVerification === true) {
      return {
        ok: false,
        code: manifest.recoveryStatus === 'BLOCKED' ? 'BLOCKED' : 'RECOVERY_BLOCKED_DATE_VERIFICATION',
        reportId: manifest.reportId
      };
    }
    if (manifest.expectedDraftRevision == null) return { ok: false, code: 'MISSING_EXPECTED_DRAFT_REVISION' };
    if (!manifest.expectedPayloadHash) return { ok: false, code: 'MISSING_EXPECTED_PAYLOAD_HASH' };
    var pathCheck = assertAllowlistedPaths(manifest.fields);
    if (!pathCheck.ok) return pathCheck;
    var keys = Object.keys(manifest.fields || {});
    if (!keys.length) return { ok: false, code: 'EMPTY_FIELDS' };
    for (var i = 0; i < keys.length; i++) {
      var f = manifest.fields[keys[i]];
      if (!f || f.confidence !== 'CONFIRMADO') {
        return { ok: false, code: 'NON_CONFIRMED_FIELD', path: keys[i], confidence: f && f.confidence };
      }
      if (!filled(f.proposedValue) && f.proposedValue !== 0) {
        return { ok: false, code: 'EMPTY_PROPOSED_VALUE', path: keys[i] };
      }
    }
    return { ok: true };
  }

  function checkPreconditions(rowState, manifest) {
    rowState = rowState || {};
    manifest = manifest || {};
    if (String(rowState.reportId || '') !== String(manifest.reportId || '')) {
      return { ok: false, code: 'RECOVERY_PRECONDITION_FAILED', detail: 'REPORT_ID' };
    }
    if (String(rowState.serviceId || '') !== String(manifest.serviceId || '')) {
      return { ok: false, code: 'RECOVERY_PRECONDITION_FAILED', detail: 'SERVICE_ID' };
    }
    if (Number(rowState.draftRevision) !== Number(manifest.expectedDraftRevision)) {
      return { ok: false, code: 'RECOVERY_PRECONDITION_FAILED', detail: 'DRAFT_REVISION' };
    }
    if (String(rowState.payloadHash || '') !== String(manifest.expectedPayloadHash || '')) {
      return { ok: false, code: 'RECOVERY_PRECONDITION_FAILED', detail: 'PAYLOAD_HASH' };
    }
    if (manifest.expectedVersao != null && String(rowState.versao) !== String(manifest.expectedVersao)) {
      return { ok: false, code: 'RECOVERY_PRECONDITION_FAILED', detail: 'VERSAO' };
    }
    if (manifest.expectedStatus != null && String(rowState.status || '') !== String(manifest.expectedStatus || '')) {
      return { ok: false, code: 'RECOVERY_PRECONDITION_FAILED', detail: 'STATUS' };
    }
    return { ok: true };
  }

  function collectDiffPaths(before, after, prefix, out) {
    prefix = prefix || '';
    out = out || [];
    var aObj = before && typeof before === 'object';
    var bObj = after && typeof after === 'object';
    if (!aObj && !bObj) {
      if (JSON.stringify(before) !== JSON.stringify(after)) out.push(prefix || '(root)');
      return out;
    }
    if (Array.isArray(before) || Array.isArray(after)) {
      if (JSON.stringify(before) !== JSON.stringify(after)) out.push(prefix || '(root)');
      return out;
    }
    var keys = {};
    Object.keys(before || {}).forEach(function (k) { keys[k] = true; });
    Object.keys(after || {}).forEach(function (k) { keys[k] = true; });
    Object.keys(keys).forEach(function (k) {
      var p = prefix ? prefix + '.' + k : k;
      var bv = before ? before[k] : undefined;
      var av = after ? after[k] : undefined;
      if (bv && typeof bv === 'object' && av && typeof av === 'object' && !Array.isArray(bv) && !Array.isArray(av)) {
        collectDiffPaths(bv, av, p, out);
      } else if (JSON.stringify(bv) !== JSON.stringify(av)) {
        out.push(p);
      }
    });
    return out;
  }

  // Side-effects derivados do cabeçalho (mesmo padrão de comandoRsdPatch_).
  var DERIVED_ALLOWED = {
    viaturas: true,
    matriculaResponsavel: true
  };

  function isAllowedDiffPath(path) {
    var p = normalizePath(path);
    if (HEADER_ALLOWLIST[p]) return true;
    if (DERIVED_ALLOWED[p]) return true;
    // nested under allowlisted object roots (e.g. guarnicao.viaturas.0.prefixo)
    if (p.indexOf('guarnicao.') === 0) {
      var second = p.split('.').slice(0, 2).join('.');
      if (HEADER_ALLOWLIST[second]) return true;
      if (p === 'guarnicao') return true;
    }
    if (p.indexOf('viaturas.') === 0) return true;
    return false;
  }

  function syncDerivedVtrFields(payload) {
    var g = payload.guarnicao || (payload.guarnicao = {});
    var vs = normalizeViaturas(g.viaturas);
    if (filled(g.vtrPrincipal) && !vs.length) {
      vs = [{ prefixo: String(g.vtrPrincipal), ordem: 1, origem: 'HEADER_RECOVERY' }];
    }
    if (vs.length) {
      g.viaturas = vs;
      if (!filled(g.vtrPrincipal)) g.vtrPrincipal = vs[0].prefixo;
      g.viatura = vs.map(function (x) { return x.prefixo; }).join(', ');
    } else if (filled(g.vtrPrincipal)) {
      g.viatura = String(g.vtrPrincipal);
    }
    payload.viaturas = g.viaturas || payload.viaturas || [];
    if (filled(g.matricula)) payload.matriculaResponsavel = g.matricula;
  }

  /**
   * Aplica patch em memória.
   * @param {object} rowState { reportId, serviceId, draftRevision, payloadHash, versao, status, payload, dataServico }
   * @param {object} manifest
   * @param {object} opts { mode: 'dryRun'|'apply', nowMs, skipEditorGate }
   */
  function applySelectiveHeaderPatch(rowState, manifest, opts) {
    opts = opts || {};
    var mode = opts.mode || 'dryRun';
    var audits = [];

    var blocked = validateManifest(manifest);
    if (!blocked.ok) {
      return { ok: false, code: blocked.code, detail: blocked, mode: mode, written: false };
    }

    if (!opts.skipEditorGate) {
      var editor = classifyEditorState({
        editDeviceId: rowState.editDeviceId,
        editLeaseUntil: rowState.editLeaseUntil,
        status: rowState.status || manifest.currentStatus,
        activePeriodRecoveryCaution: !!manifest.activePeriodRecoveryCaution,
        recoveryBlockedDateVerification: !!manifest.recoveryBlockedDateVerification
      }, opts.nowMs);
      if (!editor.recoveryAllowed) {
        return {
          ok: false,
          code: 'RECOVERY_NOT_ALLOWED',
          editor: editor,
          mode: mode,
          written: false
        };
      }
    }

    var pre = checkPreconditions(rowState, manifest);
    if (!pre.ok) {
      return { ok: false, code: pre.code, detail: pre.detail, mode: mode, written: false };
    }

    var beforePayload = deepClone(rowState.payload || {});
    // Freeze identity / dates
    var frozenDataServico = rowState.dataServico;
    var frozenServicoData = beforePayload.servico && beforePayload.servico.data;
    var frozenOperational = beforePayload.servico && beforePayload.servico.operationalDate;

    var afterPayload = deepClone(beforePayload);
    if (!afterPayload.guarnicao || typeof afterPayload.guarnicao !== 'object') afterPayload.guarnicao = {};

    var fieldResults = [];
    var changed = 0;
    var conflicts = [];
    var keys = Object.keys(manifest.fields);

    for (var i = 0; i < keys.length; i++) {
      var rawKey = keys[i];
      var path = normalizePath(rawKey);
      var spec = manifest.fields[rawKey];
      var proposed = spec.proposedValue;

      if (path === 'guarnicao.viaturas') {
        proposed = normalizeViaturas(proposed);
      }

      var current = getByPath(afterPayload, path);

      if (!filled(current) && filled(proposed)) {
        setByPath(afterPayload, path, proposed);
        fieldResults.push({ path: path, action: 'PATCH', from: current, to: proposed });
        changed++;
        continue;
      }
      if (valuesEqual(current, proposed)) {
        fieldResults.push({ path: path, action: 'NO_OP', value: current });
        continue;
      }
      if (filled(current) && !valuesEqual(current, proposed)) {
        conflicts.push({ path: path, current: current, proposed: proposed });
        fieldResults.push({ path: path, action: 'FIELD_CONFLICT', current: current, proposed: proposed });
      }
    }

    if (conflicts.length) {
      return {
        ok: false,
        code: 'FIELD_CONFLICT',
        conflicts: conflicts,
        fieldResults: fieldResults,
        mode: mode,
        written: false
      };
    }

    if (changed === 0) {
      return {
        ok: true,
        code: 'NO_OP_ALREADY_RECOVERED',
        fieldResults: fieldResults,
        mode: mode,
        written: false,
        draftRevision: Number(rowState.draftRevision),
        payloadHash: rowState.payloadHash,
        payload: beforePayload
      };
    }

    // Derived VTR string fields (still within allowlist)
    syncDerivedVtrFields(afterPayload);

    var diffPaths = collectDiffPaths(beforePayload, afterPayload);
    var unexpected = diffPaths.filter(function (p) { return !isAllowedDiffPath(p); });
    if (unexpected.length) {
      return {
        ok: false,
        code: 'UNEXPECTED_PAYLOAD_DIFF',
        unexpected: unexpected,
        diffPaths: diffPaths,
        mode: mode,
        written: false
      };
    }

    // Absolute date integrity
    if (String(frozenDataServico) !== String(rowState.dataServico)) {
      return { ok: false, code: 'DATA_SERVICO_MUTATION', mode: mode, written: false };
    }
    var afterServicoData = afterPayload.servico && afterPayload.servico.data;
    var afterOperational = afterPayload.servico && afterPayload.servico.operationalDate;
    if (JSON.stringify(frozenServicoData) !== JSON.stringify(afterServicoData) ||
        JSON.stringify(frozenOperational) !== JSON.stringify(afterOperational)) {
      return { ok: false, code: 'SERVICO_DATA_MUTATION', mode: mode, written: false };
    }

    var newRevision = Number(rowState.draftRevision) + 1;
    var payloadJson = JSON.stringify(afterPayload);
    var newHash = opts.hashFn ? opts.hashFn(payloadJson) : ('fixture-' + newRevision + '-' + payloadJson.length);

    var preRecoverySnapshot = {
      acao: 'PRE_RECOVERY_SNAPSHOT',
      reportId: manifest.reportId,
      serviceId: manifest.serviceId,
      draftRevision: rowState.draftRevision,
      versao: rowState.versao,
      payloadHash: rowState.payloadHash,
      payloadFileId: rowState.payloadFileId || '',
      dataServico: rowState.dataServico,
      timestamp: new Date(opts.nowMs != null ? opts.nowMs : Date.now()).toISOString(),
      fieldsToChange: fieldResults.filter(function (f) { return f.action === 'PATCH'; }),
      payload: beforePayload,
      row: {
        REPORT_ID: rowState.reportId,
        SERVICE_ID: rowState.serviceId,
        DRAFT_REVISION: rowState.draftRevision,
        VERSAO: rowState.versao,
        PAYLOAD_HASH: rowState.payloadHash,
        STATUS: rowState.status,
        DATA_SERVICO: rowState.dataServico,
        EDIT_DEVICE_ID: rowState.editDeviceId,
        EDIT_LEASE_UNTIL: rowState.editLeaseUntil
      },
      manifestRef: {
        reportId: manifest.reportId,
        serviceId: manifest.serviceId,
        expectedDraftRevision: manifest.expectedDraftRevision,
        expectedPayloadHash: manifest.expectedPayloadHash
      }
    };

    if (opts.requireSnapshot !== false && mode === 'apply') {
      if (!opts.snapshotOk && opts.persistSnapshot) {
        var snapRes = opts.persistSnapshot(preRecoverySnapshot);
        if (!snapRes || snapRes.ok === false) {
          return { ok: false, code: 'SNAPSHOT_ABORT', detail: snapRes, mode: mode, written: false };
        }
        audits.push({ acao: 'PRE_RECOVERY_SNAPSHOT', ok: true });
      } else if (!opts.persistSnapshot && !opts.snapshotOk) {
        // In pure unit tests, caller may set snapshotOk:true to simulate successful snapshot.
        if (opts.snapshotOk !== true) {
          return { ok: false, code: 'SNAPSHOT_ABORT', detail: 'missing persistSnapshot', mode: mode, written: false };
        }
        audits.push({ acao: 'PRE_RECOVERY_SNAPSHOT', ok: true, simulated: true });
      } else {
        audits.push({ acao: 'PRE_RECOVERY_SNAPSHOT', ok: true, simulated: !!opts.snapshotOk });
      }
    } else if (mode === 'dryRun') {
      audits.push({ acao: 'PRE_RECOVERY_SNAPSHOT', ok: true, dryRun: true, snapshot: preRecoverySnapshot });
    }

    var appliedAudit = {
      acao: 'HEADER_RECOVERY_APPLIED',
      reportId: manifest.reportId,
      serviceId: manifest.serviceId,
      beforeDraftRevision: rowState.draftRevision,
      afterDraftRevision: newRevision,
      beforeHash: rowState.payloadHash,
      afterHash: newHash,
      fieldResults: fieldResults,
      timestamp: new Date(opts.nowMs != null ? opts.nowMs : Date.now()).toISOString()
    };

    if (mode === 'dryRun') {
      return {
        ok: true,
        code: 'DRY_RUN_OK',
        mode: 'dryRun',
        written: false,
        wouldChange: changed,
        fieldResults: fieldResults,
        diffPaths: diffPaths,
        draftRevision: newRevision,
        payloadHash: newHash,
        payload: afterPayload,
        preRecoverySnapshot: preRecoverySnapshot,
        appliedAudit: appliedAudit,
        dataServicoUnchanged: frozenDataServico,
        servicoDataUnchanged: frozenServicoData
      };
    }

    // apply mode — caller persists; we return the next state
    audits.push(appliedAudit);
    return {
      ok: true,
      code: 'HEADER_RECOVERY_APPLIED',
      mode: 'apply',
      written: true,
      changed: changed,
      fieldResults: fieldResults,
      diffPaths: diffPaths,
      draftRevision: newRevision,
      payloadHash: newHash,
      payload: afterPayload,
      payloadJson: payloadJson,
      preRecoverySnapshot: preRecoverySnapshot,
      audits: audits,
      dataServicoUnchanged: frozenDataServico,
      servicoDataUnchanged: frozenServicoData,
      sheetColumnPatch: buildSheetColumnPatch(afterPayload)
    };
  }

  function buildSheetColumnPatch(payload) {
    var g = (payload && payload.guarnicao) || {};
    var patch = {};
    if (filled(g.nome)) patch.GUARNICAO = g.nome;
    if (filled(g.tipo)) patch.GUARNICAO_TIPO = g.tipo;
    if (filled(g.ordem) || g.ordem === 0) patch.GUARNICAO_ORDEM = g.ordem;
    else if (filled(g.numero) || g.numero === 0) patch.GUARNICAO_ORDEM = g.numero;
    if (filled(g.vtrPrincipal)) patch.VTR_PRINCIPAL = g.vtrPrincipal;
    if (filled(g.responsavel)) patch.RESPONSAVEL_NOME = g.responsavel;
    if (filled(g.matricula)) patch.RESPONSAVEL_MATRICULA = g.matricula;
    if (filled(g.postoGrad)) patch.RESPONSAVEL_POSTO_GRAD = g.postoGrad;
    return patch;
  }

  /**
   * Constrói manifesto de apply a partir do manifesto forense FASE 1.
   * Usa apenas campos CONFIRMADO e paths allowlisted.
   */
  function manifestFromForensic(forensicManifest, extras) {
    extras = extras || {};
    var fm = forensicManifest || {};
    var fields = {};
    var srcFields = fm.fields || {};
    Object.keys(srcFields).forEach(function (k) {
      var f = srcFields[k];
      if (!f || f.confidence !== 'CONFIRMADO') return;
      if (!filled(f.proposedValue) && f.proposedValue !== 0) return;
      var path = normalizePath(k);
      if (!HEADER_ALLOWLIST[path]) return;
      // Skip empty additional viaturas
      if (path === 'guarnicao.viaturas' && (!Array.isArray(f.proposedValue) || !f.proposedValue.length)) return;
      fields[path] = {
        currentValue: f.currentValue,
        proposedValue: f.proposedValue,
        source: f.source,
        sourceRevision: f.sourceRevision,
        sourceTimestamp: f.sourceTimestamp,
        confidence: 'CONFIRMADO'
      };
    });

    // If VTR principal confirmed, also set viatura string path consistently via derived sync
    if (fields['guarnicao.vtrPrincipal'] && !fields['guarnicao.viatura']) {
      fields['guarnicao.viatura'] = {
        currentValue: '',
        proposedValue: String(fields['guarnicao.vtrPrincipal'].proposedValue),
        source: fields['guarnicao.vtrPrincipal'].source,
        sourceRevision: fields['guarnicao.vtrPrincipal'].sourceRevision,
        sourceTimestamp: fields['guarnicao.vtrPrincipal'].sourceTimestamp,
        confidence: 'CONFIRMADO'
      };
    }

    return {
      reportId: fm.reportId,
      serviceId: fm.serviceId,
      expectedDraftRevision: fm.currentDraftRevision,
      expectedPayloadHash: fm.currentPayloadHash,
      expectedVersao: fm.currentVersao,
      expectedStatus: fm.currentStatus,
      currentStatus: fm.currentStatus,
      recoveryStatus: fm.recoveryStatus,
      recoveryBlockedDateVerification: fm.recoveryStatus === 'RECOVERY_BLOCKED_DATE_VERIFICATION',
      activePeriodRecoveryCaution: (fm.flags || []).indexOf('ACTIVE_PERIOD_RECOVERY_CAUTION') >= 0,
      neverFullRollback: (fm.flags || []).indexOf('NEVER_FULL_ROLLBACK') >= 0 || !!fm.neverFullRollback,
      dateIntegrityRepairRequired: !!extras.dateIntegrityRepairRequired,
      fields: fields,
      preserve: fm.preserve || [],
      concurrencyPreconditions: fm.concurrencyPreconditions || {}
    };
  }

  return {
    LEASE_MINUTES: LEASE_MINUTES,
    HEADER_ALLOWLIST: HEADER_ALLOWLIST,
    FORBIDDEN_ROOTS: FORBIDDEN_ROOTS,
    filled: filled,
    normalizePath: normalizePath,
    leaseActive: leaseActive,
    classifyEditorState: classifyEditorState,
    validateManifest: validateManifest,
    checkPreconditions: checkPreconditions,
    applySelectiveHeaderPatch: applySelectiveHeaderPatch,
    manifestFromForensic: manifestFromForensic,
    collectDiffPaths: collectDiffPaths,
    buildSheetColumnPatch: buildSheetColumnPatch,
    deepClone: deepClone,
    normalizeViaturas: normalizeViaturas
  };
});
