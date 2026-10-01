/**
 * Simulação consolidação P3 10.8.37+ — fingerprint=write projection,
 * ScriptLock draft×consolidate, deleteRows em blocos.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RcoConsolidatePerf = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function hash(s) {
    var h = 0, str = String(s || '');
    for (var i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    return 'h' + (h >>> 0).toString(16);
  }
  function fpStr(v) {
    return String(v == null ? '' : v).replace(/\u00a0/g, ' ').replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '');
  }
  function dateText(v) {
    var s = String(v == null ? '' : v).trim();
    var m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : s.slice(0, 10);
  }
  function stableId(preferred, fallbackKey) {
    var p = String(preferred || '');
    if (p) return p;
    return 'k:' + hash(String(fallbackKey || ''));
  }

  function FakeSheet(name, headers, rows) {
    this.name = name;
    this.headers = headers.slice();
    this.rows = (rows || []).map(function (r) { return Object.assign({}, r); });
    this.reads = 0; this.writes = 0; this.scans = 0; this.deletes = 0;
    this.deleteCalls = 0; this.deleteRowsCount = 0;
  }
  FakeSheet.prototype.scanKey = function (field) {
    this.reads++; this.scans++;
    return this.rows.map(function (r) { return String(r[field] == null ? '' : r[field]); });
  };
  FakeSheet.prototype.fullRead = function () {
    this.reads++; this.scans++;
    return this.rows.map(function (r) { return Object.assign({}, r); });
  };
  FakeSheet.prototype.upsert = function (keyField, key, obj) {
    this.scanKey(keyField);
    key = String(key);
    var idx = -1;
    for (var i = 0; i < this.rows.length; i++) {
      if (String(this.rows[i][keyField] || '') === key) { idx = i; break; }
    }
    var next = {};
    (this.headers || []).forEach(function (h) { next[h] = obj[h] != null ? obj[h] : ''; });
    Object.keys(obj || {}).forEach(function (k) { next[k] = obj[k]; });
    next[keyField] = key;
    if (idx >= 0) this.rows[idx] = next; else this.rows.push(next);
    this.writes++;
  };
  FakeSheet.prototype.append = function (obj) {
    this.rows.push(Object.assign({}, obj)); this.writes++;
  };
  FakeSheet.prototype.appendBatch = function (objs) {
    var self = this;
    (objs || []).forEach(function (o) { self.rows.push(Object.assign({}, o)); });
    if (objs && objs.length) this.writes++;
  };
  FakeSheet.prototype.deleteWhereLegacy = function (field, value) {
    var keys = this.scanKey(field), v = String(value), keep = [];
    for (var i = 0; i < this.rows.length; i++) {
      if (String(keys[i]) === v) { this.deletes++; this.writes++; this.deleteCalls++; this.deleteRowsCount++; }
      else keep.push(this.rows[i]);
    }
    this.rows = keep;
  };
  /** Espelha rcoDeleteWhereFast_: blocos contíguos via deleteRows. */
  FakeSheet.prototype.deleteWhereFast = function (field, value) {
    var keys = this.scanKey(field), v = String(value), rows = [];
    for (var i = 0; i < keys.length; i++) if (keys[i] === v) rows.push(i + 2);
    if (!rows.length) return 0;
    var blocks = [], bStart = rows[0], bEnd = rows[0];
    for (var r = 1; r < rows.length; r++) {
      if (rows[r] === bEnd + 1) bEnd = rows[r];
      else { blocks.push({ start: bStart, count: bEnd - bStart + 1 }); bStart = rows[r]; bEnd = rows[r]; }
    }
    blocks.push({ start: bStart, count: bEnd - bStart + 1 });
    for (var j = blocks.length - 1; j >= 0; j--) {
      var startIdx = blocks[j].start - 2;
      this.rows.splice(startIdx, blocks[j].count);
      this.deletes += blocks[j].count;
      this.deleteRowsCount += blocks[j].count;
      this.deleteCalls++;
      this.writes++;
    }
    return rows.length;
  };
  FakeSheet.prototype.countWhere = function (field, value) {
    var keys = this.scanKey(field), v = String(value), n = 0;
    for (var i = 0; i < keys.length; i++) if (keys[i] === v) n++;
    return n;
  };
  FakeSheet.prototype.loadIndex = function (keyField) {
    var list = this.fullRead(), byKey = {};
    list.forEach(function (r, i) {
      var k = String(r[keyField] || '');
      if (k) { r._row = i + 2; byKey[k] = r; }
    });
    return { list: list, byKey: byKey, keyField: keyField, sheet: this, pendingUpserts: {}, pendingAppendsByKey: {}, pendingAppends: [] };
  };

  function indexUpsert(idx, key, obj) {
    key = String(key || '');
    var next = {};
    Object.keys(obj || {}).forEach(function (k) { if (k !== '_row') next[k] = obj[k]; });
    next[idx.keyField] = key;
    var prev = idx.byKey[key];
    if (prev && prev._row) {
      next._row = prev._row; idx.byKey[key] = next; idx.pendingUpserts[key] = next;
    } else if (prev && idx.pendingAppendsByKey && idx.pendingAppendsByKey[key] != null) {
      next._pendingNew = true; idx.byKey[key] = next; idx.pendingAppendsByKey[key] = next;
    } else {
      next._pendingNew = true; idx.byKey[key] = next;
      if (!idx.pendingAppendsByKey) idx.pendingAppendsByKey = {};
      idx.pendingAppendsByKey[key] = next;
    }
    return next;
  }
  function indexFlush(idx) {
    var sheet = idx.sheet;
    Object.keys(idx.pendingUpserts || {}).forEach(function (k) {
      var obj = idx.pendingUpserts[k]; if (!obj || !obj._row) return;
      var clean = Object.assign({}, obj); delete clean._row; delete clean._pendingNew;
      sheet.rows[obj._row - 2] = clean; sheet.writes++;
    });
    idx.pendingUpserts = {};
    var addKeys = Object.keys(idx.pendingAppendsByKey || {});
    if (addKeys.length) {
      addKeys.forEach(function (k) {
        var o = Object.assign({}, idx.pendingAppendsByKey[k]);
        delete o._pendingNew; delete o._row; sheet.rows.push(o);
      });
      sheet.writes++;
      idx.pendingAppendsByKey = {};
    }
  }

  /** Projeção do pacote (espelha rcoConsolidateProjectWrites_). opts.forFingerprint ordena. */
  function projectWrites(pkg, reportId, opts) {
    opts = opts || {};
    var forFp = opts.forFingerprint !== false; // default ordena (FP); forFingerprint:false = ordem do pacote
    if (opts.forWrite) forFp = false;
    pkg = pkg || {};
    var rco = pkg.rco || pkg || {};
    var stat = pkg.estatisticaP3 || rco.estatisticaP3 || { producao: [], veiculos: [], podExecucao: [] };
    var u = pkg.unidade || rco.unidade || {};
    var batt = fpStr(u.batalhao || pkg.batalhao || '');
    var comp = fpStr(u.companhia || pkg.companhia || '');
    var cons = rco.consolidacaoResponsavel || {};
    var periodo = rco.periodo || {};
    var dataServico = dateText(periodo.inicio || rco.data || pkg.data || '');
    var rid = String(reportId || '');
    var rcoRow = {
      REPORT_ID: rid, DATA_SERVICO: dataServico, BATALHAO: batt, COMPANHIA: comp,
      INICIO: periodo.inicio || '', TERMINO: periodo.termino || periodo.fim || '',
      HORARIO_SERVICO: periodo.horario || rco.horarioServico || '',
      SCHEMA_VERSION: Number(pkg.schemaVersion || rco.schemaVersion || 2), STATUS: 'ATIVO',
      QUANTIDADE_GUARNICOES: (rco.rcoOrigens || []).length || '', OBSERVACOES: fpStr(rco.observacoes), ORIGEM: 'RCO',
      MODO_CONSOLIDACAO: rco.semGuarnicaoCpu ? 'SEM_CPU' : 'CPU',
      CONSOLIDADOR_MATRICULA: String(cons.matricula || ''), CONSOLIDADOR_POSTO_GRAD: fpStr(cons.postoGrad),
      CONSOLIDADOR_NOME: fpStr(cons.nome), CONSOLIDADOR_TURNO: fpStr(cons.turno)
    };
    var producao = (stat.producao || []).map(function (x, i) {
      var key = String(x.registroId || x.REGISTRO_ID || '');
      return {
        REGISTRO_ID: stableId(key, [i, x.guarnicao, x.grupoCodigo, x.indicadorCodigo, x.quantidade].join('|')),
        REPORT_ID: rid, DATA_SERVICO: dateText(x.dataServico || dataServico), BATALHAO: batt, COMPANHIA: comp,
        GUARNICAO: fpStr(x.guarnicao), GRUPO_CODIGO: fpStr(x.grupoCodigo), GRUPO_NOME: fpStr(x.grupoNome),
        INDICADOR_CODIGO: fpStr(x.indicadorCodigo), INDICADOR_NOME: fpStr(x.indicadorNome),
        QUANTIDADE: Number(x.quantidade != null ? x.quantidade : 0),
        ORIGEM_RELATORIO: fpStr(x.origemRelatorio || 'RCO'), ORIGEM_REGISTRO_ID: fpStr(x.origemRegistroId)
      };
    });
    var veiculos = (stat.veiculos || []).map(function (x, i) {
      var key = String(x.registroId || '');
      var conta = x.contaComoRecuperado === true ? 'SIM' : (x.contaComoRecuperado === false ? 'NÃO' : (x.CONTA_COMO_RECUPERADO || ''));
      return {
        REGISTRO_ID: stableId(key, [i, x.placaUf].join('|')), REPORT_ID: rid,
        DATA: dateText(x.data || dataServico), BATALHAO: batt, COMPANHIA: comp,
        GUARNICAO: fpStr(x.guarnicao), PLACA_UF: String(x.placaUf || '').toUpperCase(),
        TIPO: fpStr(x.tipo), MARCA_MODELO: fpStr(x.marcaModelo), MARCA: fpStr(x.marca), MODELO: fpStr(x.modelo), ANO: fpStr(x.ano),
        SITUACAO: fpStr(x.situacao), CLASSIFICACAO_P3: fpStr(x.classificacaoP3),
        TIPO_RECUPERACAO_DETALHADA: fpStr(x.tipoRecuperacaoDetalhada), CONTA_COMO_RECUPERADO: conta,
        PLACA_ORIGINAL_IDENTIFICADA: fpStr(x.placaOriginalIdentificada), PLACA_ORIGINAL_UF: fpStr(x.placaOriginalUf),
        RESTRICAO_ORIGINAL: fpStr(x.restricaoOriginal), LOCAL: fpStr(x.local),
        HOUVE_CONDUZIDOS: fpStr(x.houveConduzidos), QUANTIDADE_CONDUZIDOS: Number(x.quantidadeConduzidos || 0),
        VALOR_FIPE: Number(x.valorFipe || 0), ORIGEM_RELATORIO: fpStr(x.origemRelatorio || 'RCO'),
        ORIGEM_REGISTRO_ID: fpStr(x.origemRegistroId)
      };
    });
    var origens = (rco.rcoOrigens || []).map(function (o, i) {
      return {
        REGISTRO_ID: stableId(o.rsdReportId, 'orig|' + i), RCO_REPORT_ID: rid,
        RSD_REPORT_ID: fpStr(o.rsdReportId), GUARNICAO: fpStr(o.guarnicao),
        VERSAO_RSD: fpStr(o.versao), STATUS_ORIGEM: fpStr(o.status || 'INCLUIDO'),
        CONSOLIDADOR_MATRICULA: rcoRow.CONSOLIDADOR_MATRICULA
      };
    });
    var pod = (stat.podExecucao || pkg.podExecucao || []).map(function (x, i) {
      var key = String(x.registroId || x.origemRegistroId || x.id || '');
      return {
        REGISTRO_ID: stableId(key, 'pod|' + i), REPORT_ID: stableId(key, 'pod|' + i), RCO_REPORT_ID: rid,
        DATA: dateText(x.data || dataServico), BATALHAO: batt, COMPANHIA: comp,
        GUARNICAO: fpStr(x.guarnicao), OPERACAO: fpStr(x.operacao || x.nome), TURNO: fpStr(x.turno),
        STATUS_CUMPRIMENTO: fpStr(x.statusCumprimento), LOCAL_PREVISTO: fpStr(x.localPrevisto),
        LOCAL_EXECUTADO: fpStr(x.localExecutado || x.local), COORDENADAS_EXECUTADAS: fpStr(x.coordenadasExecutadas),
        HORA_INICIO: fpStr(x.horaInicio), HORA_FIM: fpStr(x.horaFim),
        HOUVE_ALTERACAO: (x.houveAlteracao === true || String(x.houveAlteracao || '').toUpperCase() === 'SIM') ? 'SIM' : 'NÃO',
        MOTIVO_ALTERACAO: fpStr(x.motivoAlteracao), ORIGEM_RELATORIO: fpStr(x.origemRelatorio || 'RCO'),
        ORIGEM_REGISTRO_ID: fpStr(x.origemRegistroId || key)
      };
    });
    var operacoes = (pkg.operacoesCompletas || rco.operacoes || []).map(function (o, i) {
      o = o || {};
      var id = String(o.reportId || o.id || '');
      var nome = ((o.operacao || {}).nome) || o.nome || '';
      var turno = ((o.operacao || {}).turno) || o.turno || '';
      var local = ((o.local || {}).descricao) || o.local || '';
      var lat = ((o.local || {}).latitude) || o.latitude || '';
      var lng = ((o.local || {}).longitude) || o.longitude || '';
      return {
        REGISTRO_ID: stableId(id, 'op|' + i), REPORT_ID: stableId(id, 'op|' + i), RCO_REPORT_ID: rid,
        RSD_REPORT_ID: fpStr(o.rsdReportId), DATA: dateText(dataServico), BATALHAO: batt, COMPANHIA: comp,
        GUARNICAO_RESPONSAVEL: fpStr(o.guarnicao), OPERACAO: fpStr(nome), TURNO: fpStr(turno), LOCAL: fpStr(local),
        LATITUDE: fpStr(lat), LONGITUDE: fpStr(lng), STATUS_REGISTRO: 'CONSOLIDADO'
      };
    });
    function sortBy(arr, k) {
      return arr.slice().sort(function (a, b) { return String(a[k] || '').localeCompare(String(b[k] || '')); });
    }
    if (!forFp) {
      return { rco: rcoRow, producao: producao, veiculos: veiculos, origens: origens, pod: pod, operacoes: operacoes };
    }
    return {
      rco: rcoRow,
      producao: sortBy(producao, 'REGISTRO_ID'),
      veiculos: sortBy(veiculos, 'REGISTRO_ID'),
      origens: sortBy(origens, 'RSD_REPORT_ID'),
      pod: sortBy(pod, 'REGISTRO_ID'),
      operacoes: sortBy(operacoes, 'REGISTRO_ID')
    };
  }

  /** Merge POD 10.8.36: incoming || oldPod || ''. */
  function mergePodRow(oldPod, x, reportId, batt, comp, dataServico) {
    oldPod = oldPod || {}; x = x || {};
    var rid = String(x.registroId || x.REGISTRO_ID || x.origemRegistroId || oldPod.REGISTRO_ID || 'pod-x');
    return {
      REGISTRO_ID: rid, REPORT_ID: oldPod.REPORT_ID || rid, RCO_REPORT_ID: reportId,
      DATA: dateText(x.data || x.DATA || dataServico), BATALHAO: batt, COMPANHIA: comp,
      GUARNICAO: x.guarnicao || x.GUARNICAO || oldPod.GUARNICAO || '',
      OPERACAO: x.operacao || x.OPERACAO || oldPod.OPERACAO || '',
      TURNO: x.turno || x.TURNO || oldPod.TURNO || '',
      STATUS_CUMPRIMENTO: x.statusCumprimento || x.STATUS_CUMPRIMENTO || oldPod.STATUS_CUMPRIMENTO || '',
      LOCAL_PREVISTO: x.localPrevisto || x.LOCAL_PREVISTO || oldPod.LOCAL_PREVISTO || '',
      LOCAL_EXECUTADO: x.localExecutado || x.LOCAL_EXECUTADO || oldPod.LOCAL_EXECUTADO || '',
      COORDENADAS_EXECUTADAS: x.coordenadasExecutadas || x.COORDENADAS_EXECUTADAS || oldPod.COORDENADAS_EXECUTADAS || '',
      HORA_INICIO: x.horaInicio || x.HORA_INICIO || oldPod.HORA_INICIO || '',
      HORA_FIM: x.horaFim || x.HORA_FIM || oldPod.HORA_FIM || '',
      HOUVE_ALTERACAO: (x.houveAlteracao === true || String(x.houveAlteracao || x.HOUVE_ALTERACAO || '').toUpperCase() === 'SIM') ? 'SIM' : 'NÃO',
      MOTIVO_ALTERACAO: x.motivoAlteracao || x.MOTIVO_ALTERACAO || oldPod.MOTIVO_ALTERACAO || '',
      ORIGEM_RELATORIO: x.origemRelatorio || x.ORIGEM_RELATORIO || oldPod.ORIGEM_RELATORIO || 'RCO',
      ORIGEM_REGISTRO_ID: x.origemRegistroId || x.ORIGEM_REGISTRO_ID || oldPod.ORIGEM_REGISTRO_ID || rid
    };
  }
  /** Merge OPERACOES 10.8.36: existing || incoming. */
  function mergeOpRow(row, o, reportId, batt, comp, dataServico) {
    row = Object.assign({}, row || {}); o = o || {};
    var id = String(o.reportId || o.id || row.REGISTRO_ID || 'op-x');
    row.REGISTRO_ID = id;
    row.REPORT_ID = row.REPORT_ID || id;
    row.RCO_REPORT_ID = reportId;
    row.RSD_REPORT_ID = row.RSD_REPORT_ID || o.rsdReportId || '';
    row.DATA = row.DATA || dateText(dataServico);
    row.BATALHAO = batt; row.COMPANHIA = comp;
    row.GUARNICAO_RESPONSAVEL = row.GUARNICAO_RESPONSAVEL || o.guarnicao || '';
    row.OPERACAO = row.OPERACAO || ((o.operacao || {}).nome) || o.nome || '';
    row.TURNO = row.TURNO || ((o.operacao || {}).turno) || o.turno || '';
    row.LOCAL = row.LOCAL || ((o.local || {}).descricao) || o.local || '';
    row.LATITUDE = row.LATITUDE || ((o.local || {}).latitude) || '';
    row.LONGITUDE = row.LONGITUDE || ((o.local || {}).longitude) || '';
    row.STATUS_REGISTRO = 'CONSOLIDADO';
    row.VERSAO_ORIGEM = Number(row.VERSAO_ORIGEM || 1);
    return row;
  }

  function fingerprint(pkg, reportId) { return hash(JSON.stringify(projectWrites(pkg, reportId, { forFingerprint: true }))); }
  function draftFingerprint(rco, reportId) { return fingerprint({ rco: rco || {} }, reportId); }

  function integrityOk(db, reportId, pkg) {
    var rco = pkg.rco || {};
    var expectProd = ((pkg.estatisticaP3 && pkg.estatisticaP3.producao) || []).length;
    var expectOrig = (rco.rcoOrigens || []).length;
    var expectModo = rco.semGuarnicaoCpu ? 'SEM_CPU' : 'CPU';
    var rcoRow = db.RCO.rows.filter(function (r) { return String(r.REPORT_ID) === reportId; })[0];
    if (!rcoRow) return false;
    if (rcoRow.MODO_CONSOLIDACAO && rcoRow.MODO_CONSOLIDACAO !== expectModo) return false;
    return db.PRODUCAO.countWhere('REPORT_ID', reportId) === expectProd &&
      db.RCO_ORIGENS.countWhere('RCO_REPORT_ID', reportId) === expectOrig;
  }

  /** Mutex espelhando ScriptLock (draft e consolidate). */
  function withScriptLock(db, fn) {
    db._lock = db._lock || { held: false, waiters: [] };
    if (db._lock.held) {
      var deferred = { deferred: true, result: null };
      db._lock.waiters.push(function () { deferred.result = withScriptLock(db, fn); deferred.deferred = false; });
      return deferred;
    }
    db._lock.held = true;
    try {
      return fn();
    } finally {
      db._lock.held = false;
      while (db._lock.waiters.length) {
        var w = db._lock.waiters.shift();
        w();
      }
    }
  }

  function buildPkg(opts) {
    opts = opts || {};
    var nGu = opts.guarnicoes || 3;
    var nProd = opts.prodRows || 120;
    var origins = [];
    for (var g = 1; g <= nGu; g++) {
      origins.push({ rsdReportId: 'rsd-' + g, serviceId: 'svc-' + g, guarnicao: 'BST ' + g, status: opts.rsdStatus || 'DEFERIDO', versao: 1 });
    }
    var producao = [];
    for (var i = 0; i < nProd; i++) {
      producao.push({
        registroId: 'prod-' + i, guarnicao: 'BST ' + ((i % nGu) + 1),
        grupoCodigo: 'G' + (i % 10), indicadorCodigo: 'I' + i,
        grupoNome: 'Grupo ' + (i % 10), indicadorNome: 'Indicador ' + i,
        quantidade: i % 5, origemRelatorio: 'RCO', origemRegistroId: 'src-' + i
      });
    }
    var veiculos = [];
    for (var v = 0; v < (opts.vehRows || 8); v++) {
      veiculos.push({
        registroId: 'veh-' + v, placaUf: 'ABC' + v + 'PB', guarnicao: 'BST 1',
        tipo: 'AUTO', marcaModelo: 'VW/GOL', marca: 'VW', modelo: 'GOL', ano: '2018',
        situacao: 'RECUPERADO', classificacaoP3: 'RECUPERADO', valorFipe: 10000 + v,
        contaComoRecuperado: true, placaOriginalUf: 'PB', houveConduzidos: 'SIM',
        quantidadeConduzidos: 1, data: '2026-09-30'
      });
    }
    var pod = opts.pod || [{
      registroId: 'pod-1', guarnicao: 'BST 1', operacao: 'POD A', turno: 'A',
      statusCumprimento: 'CUMPRIDO', localPrevisto: 'X', localExecutado: 'X',
      coordenadasExecutadas: '-7.1,-34.8', horaInicio: '08:00', horaFim: '09:00',
      houveAlteracao: false, data: '2026-09-30'
    }];
    var ops = opts.ops || [{
      reportId: 'op-full-1', rsdReportId: 'rsd-1', guarnicao: 'BST 1', nome: 'Op A', turno: 'A',
      local: { descricao: 'Local A', latitude: '-7.12', longitude: '-34.88' }
    }];
    return {
      rco: {
        reportId: opts.reportId || 'rco-bench-1',
        periodo: { inicio: '2026-09-30', termino: '2026-10-01', horario: '07:00-19:00' },
        unidade: { batalhao: 'BPTran', companhia: '1ª CPTran' },
        rcoOrigens: origins, semGuarnicaoCpu: !!opts.semCpu,
        observacoes: opts.observacoes || '', schemaVersion: 2,
        consolidacaoResponsavel: opts.cons || { matricula: '12345', nome: 'CPU Teste', postoGrad: 'SD', turno: 'A' },
        veiculosRecuperados: veiculos.slice(),
        operacoes: ops.map(function (o) {
          return {
            id: o.reportId, reportId: o.reportId, guarnicao: o.guarnicao, nome: o.nome, turno: o.turno,
            local: (o.local && o.local.descricao) || o.local, statusCumprimento: 'CUMPRIDO',
            coordenadasExecutadas: 'x', horaInicio: '08:00', horaFim: '09:00'
          };
        }),
        state: {
          guarnicoes: origins.reduce(function (acc, o, idx) {
            var metrics = {};
            producao.filter(function (p) { return p.guarnicao === o.guarnicao; }).slice(0, 3).forEach(function (p) {
              metrics[p.grupoCodigo + '::' + p.indicadorCodigo] = p.quantidade;
            });
            acc['g' + (idx + 1)] = { nome: o.guarnicao, metrics: metrics };
            return acc;
          }, {})
        }
      },
      estatisticaP3: { producao: producao, veiculos: veiculos, podExecucao: pod },
      operacoesCompletas: ops, podExecucao: pod
    };
  }

  function seedDb(pkg, opts) {
    opts = opts || {};
    var rsdRows = (pkg.rco.rcoOrigens || []).map(function (o, i) {
      return {
        REPORT_ID: o.rsdReportId, SERVICE_ID: o.serviceId,
        STATUS: opts.forceOpen && i === 0 ? 'EM_SERVICO' : (o.status || 'DEFERIDO'),
        BATALHAO: 'BPTran', COMPANHIA: '1ª CPTran', DATA_SERVICO: '2026-09-30', GUARNICAO: o.guarnicao,
        RCO_REPORT_ID: '', VERSAO: 1, REVIEW_STATUS: 'DEFERIDO'
      };
    });
    for (var n = 0; n < (opts.noiseRsd || 500); n++) {
      rsdRows.push({
        REPORT_ID: 'noise-' + n, SERVICE_ID: 'ns-' + n, STATUS: 'DEFERIDO',
        BATALHAO: 'BPRv', COMPANHIA: '1ª CPRv', DATA_SERVICO: '2026-09-29', GUARNICAO: 'BST X', RCO_REPORT_ID: '', VERSAO: 1
      });
    }
    var pris = [];
    for (var p = 0; p < (opts.noisePris || 200); p++) {
      pris.push({ PRISAO_ID: 'pr-' + p, RSD_REPORT_ID: p < 3 ? 'rsd-1' : 'noise-' + p, RCO_REPORT_ID: '' });
    }
    var ops = [];
    for (var o = 0; o < (opts.noiseOps || 300); o++) {
      ops.push({ REGISTRO_ID: 'op-' + o, RCO_REPORT_ID: '', STATUS_REGISTRO: 'OPERACAO_FINALIZADA', REPORT_ID: 'op-' + o });
    }
    var prodSeed = [];
    if (opts.prefillProducao) {
      for (var pi = 0; pi < opts.prefillProducao; pi++) {
        prodSeed.push({ REGISTRO_ID: 'old-prod-' + pi, REPORT_ID: pkg.rco.reportId });
      }
    }
    if (opts.interleaveProducao) {
      for (var ii = 0; ii < opts.interleaveProducao; ii++) {
        prodSeed.push({ REGISTRO_ID: 'other-' + ii, REPORT_ID: 'other-rco' });
        prodSeed.push({ REGISTRO_ID: 'old-prod-' + ii, REPORT_ID: pkg.rco.reportId });
      }
    }
    return {
      _lock: { held: false, waiters: [] },
      RCO: new FakeSheet('RCO', ['REPORT_ID', 'VERSAO', 'DATA_SERVICO', 'BATALHAO', 'COMPANHIA', 'MODO_CONSOLIDACAO', 'OBSERVACOES', 'CONSOLIDADOR_MATRICULA', 'INICIO', 'TERMINO', 'HORARIO_SERVICO'], []),
      RCO_RASCUNHOS: new FakeSheet('RCO_RASCUNHOS', [
        'RCO_REPORT_ID', 'STATUS', 'P3_CONSOLIDADO', 'P3_CONSOLIDADO_EM',
        'P3_CONSOLIDATE_FP', 'P3_CONSOLIDATE_DRAFT_FP', 'P3_CONSOLIDATE_INTEGRAL', 'REVISAO', 'PAYLOAD_JSON'
      ], [{
        RCO_REPORT_ID: pkg.rco.reportId, STATUS: opts.draftStatus || 'EM_ANDAMENTO',
        P3_CONSOLIDADO: 'NAO', P3_CONSOLIDADO_EM: '',
        P3_CONSOLIDATE_FP: '', P3_CONSOLIDATE_DRAFT_FP: '', P3_CONSOLIDATE_INTEGRAL: 'NAO',
        REVISAO: 1, PAYLOAD_JSON: JSON.stringify(pkg.rco)
      }]),
      PRODUCAO: new FakeSheet('PRODUCAO', ['REGISTRO_ID', 'REPORT_ID'], prodSeed),
      VEICULOS: new FakeSheet('VEICULOS', ['REGISTRO_ID', 'REPORT_ID', 'PLACA_UF', 'MARCA', 'MODELO', 'ANO'], []),
      RCO_ORIGENS: new FakeSheet('RCO_ORIGENS', ['REGISTRO_ID', 'RCO_REPORT_ID', 'RSD_REPORT_ID'], []),
      RSD: new FakeSheet('RSD', ['REPORT_ID', 'STATUS', 'RCO_REPORT_ID', 'BATALHAO', 'COMPANHIA', 'DATA_SERVICO'], rsdRows),
      PRISOES: new FakeSheet('PRISOES', ['PRISAO_ID', 'RSD_REPORT_ID', 'RCO_REPORT_ID'], pris),
      CIRVC: new FakeSheet('CIRVC', ['CIRVC_ID', 'RSD_REPORT_ID', 'RCO_REPORT_ID'], []),
      POD: new FakeSheet('POD', [
        'REGISTRO_ID', 'REPORT_ID', 'RCO_REPORT_ID', 'DATA', 'BATALHAO', 'COMPANHIA', 'GUARNICAO', 'OPERACAO', 'TURNO',
        'STATUS_CUMPRIMENTO', 'LOCAL_PREVISTO', 'LOCAL_EXECUTADO', 'COORDENADAS_EXECUTADAS', 'HORA_INICIO', 'HORA_FIM',
        'HOUVE_ALTERACAO', 'MOTIVO_ALTERACAO', 'ORIGEM_RELATORIO', 'ORIGEM_REGISTRO_ID'
      ], opts.existingPod || []),
      OPERACOES: new FakeSheet('OPERACOES', [
        'REGISTRO_ID', 'REPORT_ID', 'RCO_REPORT_ID', 'RSD_REPORT_ID', 'DATA', 'BATALHAO', 'COMPANHIA',
        'GUARNICAO_RESPONSAVEL', 'OPERACAO', 'TURNO', 'LOCAL', 'LATITUDE', 'LONGITUDE', 'STATUS_REGISTRO', 'VERSAO_ORIGEM'
      ], (opts.existingOps || []).concat(ops)),
      AUDITORIA: new FakeSheet('AUDITORIA', ['AUDITORIA_ID', 'ACAO', 'ENTIDADE_ID', 'VERSAO'], [])
    };
  }

  function totals(db) {
    var sheets = ['RCO', 'RCO_RASCUNHOS', 'PRODUCAO', 'VEICULOS', 'RCO_ORIGENS', 'RSD', 'PRISOES', 'CIRVC', 'POD', 'OPERACOES'];
    var reads = 0, writes = 0, scans = 0, deletes = 0, deleteCalls = 0, deleteRows = 0;
    sheets.forEach(function (k) {
      reads += db[k].reads; writes += db[k].writes; scans += db[k].scans; deletes += db[k].deletes;
      deleteCalls += db[k].deleteCalls; deleteRows += db[k].deleteRowsCount;
    });
    return {
      sheetReads: reads, sheetWrites: writes, sheetScans: scans, deletes: deletes,
      deleteCalls: deleteCalls, deleteRows: deleteRows,
      note: 'Node FakeSheet counters ≈ trackedSheet* no GAS; wall-clock Node ≠ Sheets real'
    };
  }

  function draftUpsert(db, rcoPayload, opts) {
    opts = opts || {};
    function body() {
      var reportId = String((rcoPayload && rcoPayload.reportId) || '');
      var sheet = db.RCO_RASCUNHOS;
      var old = sheet.rows.filter(function (r) { return String(r.RCO_REPORT_ID) === reportId; })[0] || null;
      var priorPkgFp = old ? String(old.P3_CONSOLIDATE_FP || '') : '';
      var priorDraftFp = old ? String(old.P3_CONSOLIDATE_DRAFT_FP || '') : '';
      var priorIntegral = old && String(old.P3_CONSOLIDATE_INTEGRAL || '').toUpperCase() === 'SIM';
      var incomingDraftFp = draftFingerprint(rcoPayload, reportId);
      var outPkgFp = '', outDraftFp = '', outIntegral = 'NAO', p3 = 'NAO', p3Em = '', kept = false;
      if (priorIntegral && priorPkgFp && priorDraftFp && incomingDraftFp === priorDraftFp) {
        kept = true; outPkgFp = priorPkgFp; outDraftFp = priorDraftFp; outIntegral = 'SIM';
        p3 = 'SIM'; p3Em = old.P3_CONSOLIDADO_EM || '2026-09-30T12:00:00Z';
      } else if (priorIntegral && priorDraftFp && incomingDraftFp !== priorDraftFp) {
        outPkgFp = ''; outDraftFp = ''; outIntegral = 'NAO';
      } else if (priorPkgFp && !priorIntegral && (!priorDraftFp || incomingDraftFp === priorDraftFp)) {
        outPkgFp = priorPkgFp; outDraftFp = priorDraftFp || incomingDraftFp; outIntegral = 'NAO';
        p3 = old ? String(old.P3_CONSOLIDADO || 'NAO') : 'NAO';
        p3Em = old ? String(old.P3_CONSOLIDADO_EM || '') : '';
      }
      var rev = old ? Number(old.REVISAO || 0) + 1 : 1;
      sheet.upsert('RCO_REPORT_ID', reportId, {
        RCO_REPORT_ID: reportId, STATUS: old ? old.STATUS : 'EM_ANDAMENTO',
        P3_CONSOLIDADO: p3, P3_CONSOLIDADO_EM: p3Em,
        P3_CONSOLIDATE_FP: outPkgFp, P3_CONSOLIDATE_DRAFT_FP: outDraftFp, P3_CONSOLIDATE_INTEGRAL: outIntegral,
        REVISAO: rev, PAYLOAD_JSON: JSON.stringify(rcoPayload || {})
      });
      return { ok: true, consolidateMarkersKept: kept, revision: rev, draftFp: incomingDraftFp };
    }
    if (opts.skipLock) return body();
    return withScriptLock(db, body);
  }

  function runLegacy(db, pkg) {
    var t0 = Date.now(), reportId = pkg.rco.reportId, marks = {};
    function mark(n, fn) { var a = Date.now(); fn(); marks[n] = Date.now() - a; }
    mark('resolveRsd', function () {
      (pkg.rco.rcoOrigens || []).forEach(function () { db.RSD.scanKey('REPORT_ID'); db.RSD.reads++; });
      db.RSD.fullRead();
    });
    mark('producao', function () {
      db.PRODUCAO.deleteWhereLegacy('REPORT_ID', reportId);
      (pkg.estatisticaP3.producao || []).forEach(function (x) {
        db.PRODUCAO.append({ REGISTRO_ID: x.registroId, REPORT_ID: reportId });
      });
    });
    mark('veiculos', function () {
      db.VEICULOS.deleteWhereLegacy('REPORT_ID', reportId);
      (pkg.estatisticaP3.veiculos || []).forEach(function (x) {
        db.VEICULOS.append({ REGISTRO_ID: x.registroId, REPORT_ID: reportId, PLACA_UF: x.placaUf, MARCA: x.marca, MODELO: x.modelo, ANO: x.ano });
      });
    });
    mark('rcoOrigens', function () {
      db.RCO_ORIGENS.deleteWhereLegacy('RCO_REPORT_ID', reportId);
      (pkg.rco.rcoOrigens || []).forEach(function (o) {
        db.RCO_ORIGENS.append({ REGISTRO_ID: 'o-' + o.rsdReportId, RCO_REPORT_ID: reportId, RSD_REPORT_ID: o.rsdReportId });
      });
    });
    mark('relinkRsd', function () {
      var set = {}; (pkg.rco.rcoOrigens || []).forEach(function (o) { set[o.rsdReportId] = true; });
      db.RSD.fullRead().forEach(function (rr) {
        if (set[rr.REPORT_ID] && ['DEFERIDO', 'DEFERIDO_COM_RESSALVAS', 'INCLUIDO_RCO', 'FINALIZADO'].indexOf(rr.STATUS) >= 0) {
          db.RSD.upsert('REPORT_ID', rr.REPORT_ID, Object.assign({}, rr, { STATUS: 'INCLUIDO_RCO', RCO_REPORT_ID: reportId }));
        }
      });
    });
    mark('prisoes', function () {
      db.PRISOES.fullRead().forEach(function (pr) {
        if (String(pr.RSD_REPORT_ID).indexOf('rsd-') === 0) db.PRISOES.upsert('PRISAO_ID', pr.PRISAO_ID, Object.assign({}, pr, { RCO_REPORT_ID: reportId }));
      });
    });
    mark('pod', function () {
      (pkg.estatisticaP3.podExecucao || []).forEach(function (x) {
        var rid = String(x.registroId || '');
        var oldPod = null;
        for (var i = 0; i < db.POD.rows.length; i++) if (String(db.POD.rows[i].REGISTRO_ID) === rid) { oldPod = db.POD.rows[i]; break; }
        var merged = mergePodRow(oldPod || {}, x, reportId, 'BPTran', '1ª CPTran', '2026-09-30');
        db.POD.upsert('REGISTRO_ID', merged.REGISTRO_ID, merged);
      });
    });
    mark('operacoes', function () {
      db.OPERACOES.fullRead();
      (pkg.operacoesCompletas || []).forEach(function (o) {
        var id = String(o.reportId || o.id);
        var row = null;
        for (var i = 0; i < db.OPERACOES.rows.length; i++) if (String(db.OPERACOES.rows[i].REGISTRO_ID) === id) { row = db.OPERACOES.rows[i]; break; }
        var merged = mergeOpRow(row || {}, o, reportId, 'BPTran', '1ª CPTran', '2026-09-30');
        db.OPERACOES.upsert('REGISTRO_ID', merged.REGISTRO_ID, merged);
      });
    });
    var proj = projectWrites(pkg, reportId);
    db.RCO.upsert('REPORT_ID', reportId, Object.assign({}, proj.rco, { VERSAO: 1 }));
    var fp = fingerprint(pkg, reportId), dfp = draftFingerprint(pkg.rco, reportId);
    var draft = db.RCO_RASCUNHOS.rows[0];
    draft.P3_CONSOLIDADO = 'SIM'; draft.P3_CONSOLIDATE_INTEGRAL = 'SIM';
    draft.P3_CONSOLIDATE_FP = fp; draft.P3_CONSOLIDATE_DRAFT_FP = dfp; draft.P3_CONSOLIDADO_EM = '2026-09-30T12:00:00Z';
    db.RCO_RASCUNHOS.upsert('RCO_REPORT_ID', reportId, draft);
    db.AUDITORIA.append({ AUDITORIA_ID: 'a1', ACAO: 'CONSOLIDADO', ENTIDADE_ID: reportId, VERSAO: 1 });
    return { totalMs: Date.now() - t0, marks: marks, ops: totals(db), db: db };
  }

  function runOptimizedBody(db, pkg, opts) {
    opts = opts || {};
    var t0 = Date.now(), reportId = pkg.rco.reportId, marks = {};
    var fp = fingerprint(pkg, reportId), draftFp = draftFingerprint(pkg.rco, reportId);
    function mark(n, fn) { var a = Date.now(); fn(); marks[n] = (marks[n] || 0) + (Date.now() - a); }

    var draft = db.RCO_RASCUNHOS.rows.filter(function (r) { return String(r.RCO_REPORT_ID) === reportId; })[0];
    if (!opts.skipIdempotency && draft && draft.P3_CONSOLIDADO === 'SIM' && draft.P3_CONSOLIDATE_INTEGRAL === 'SIM' &&
        draft.P3_CONSOLIDATE_FP === fp && integrityOk(db, reportId, pkg)) {
      return { totalMs: Date.now() - t0, marks: { idempotent: Date.now() - t0 }, ops: totals(db), db: db, idempotent: true, fingerprint: fp, version: Number((db.RCO.rows[0] && db.RCO.rows[0].VERSAO) || 1) };
    }

    draft.P3_CONSOLIDATE_INTEGRAL = 'NAO'; draft.P3_CONSOLIDATE_FP = fp; draft.P3_CONSOLIDATE_DRAFT_FP = draftFp;
    db.RCO_RASCUNHOS.upsert('RCO_REPORT_ID', reportId, draft);

    // Hook com lock ainda segurado — draft-upsert concorrente deve enfileirar.
    if (typeof opts.midFlightHook === 'function') opts.midFlightHook(db, { fingerprint: fp, draftFingerprint: draftFp });

    mark('resolveRsd', function () { db.RSD.loadIndex('REPORT_ID'); });
    mark('producao', function () {
      db.PRODUCAO.deleteWhereFast('REPORT_ID', reportId);
      db.PRODUCAO.appendBatch((pkg.estatisticaP3.producao || []).map(function (x) {
        return { REGISTRO_ID: x.registroId, REPORT_ID: reportId };
      }));
    });
    mark('veiculos', function () {
      db.VEICULOS.deleteWhereFast('REPORT_ID', reportId);
      db.VEICULOS.appendBatch((pkg.estatisticaP3.veiculos || []).map(function (x) {
        return { REGISTRO_ID: x.registroId, REPORT_ID: reportId, PLACA_UF: x.placaUf, MARCA: x.marca, MODELO: x.modelo, ANO: x.ano };
      }));
    });
    mark('rcoOrigens', function () {
      db.RCO_ORIGENS.deleteWhereFast('RCO_REPORT_ID', reportId);
      db.RCO_ORIGENS.appendBatch((pkg.rco.rcoOrigens || []).map(function (o) {
        return { REGISTRO_ID: 'o-' + o.rsdReportId, RCO_REPORT_ID: reportId, RSD_REPORT_ID: o.rsdReportId };
      }));
    });
    mark('relinkRsd', function () {
      var idx = db.RSD.loadIndex('REPORT_ID'), set = {};
      (pkg.rco.rcoOrigens || []).forEach(function (o) { set[o.rsdReportId] = true; });
      idx.list.forEach(function (rr) {
        if (set[rr.REPORT_ID] && ['DEFERIDO', 'DEFERIDO_COM_RESSALVAS', 'INCLUIDO_RCO', 'FINALIZADO'].indexOf(rr.STATUS) >= 0) {
          for (var i = 0; i < db.RSD.rows.length; i++) {
            if (db.RSD.rows[i].REPORT_ID === rr.REPORT_ID) {
              db.RSD.rows[i] = Object.assign({}, rr, { STATUS: 'INCLUIDO_RCO', RCO_REPORT_ID: reportId });
              db.RSD.writes++; break;
            }
          }
        }
      });
    });
    mark('prisoes', function () {
      db.PRISOES.loadIndex('PRISAO_ID').list.forEach(function (pr) {
        if (String(pr.RSD_REPORT_ID).indexOf('rsd-') === 0) {
          for (var i = 0; i < db.PRISOES.rows.length; i++) {
            if (db.PRISOES.rows[i].PRISAO_ID === pr.PRISAO_ID) {
              db.PRISOES.rows[i] = Object.assign({}, pr, { RCO_REPORT_ID: reportId }); db.PRISOES.writes++; break;
            }
          }
        }
      });
    });
    mark('pod', function () {
      var idx = db.POD.loadIndex('REGISTRO_ID');
      (pkg.estatisticaP3.podExecucao || []).forEach(function (x) {
        var rid = String(x.registroId || '');
        var oldPod = idx.byKey[rid] || {};
        var merged = mergePodRow(oldPod, x, reportId, 'BPTran', '1ª CPTran', '2026-09-30');
        indexUpsert(idx, merged.REGISTRO_ID, merged);
      });
      indexFlush(idx);
    });
    mark('operacoes', function () {
      var idx = db.OPERACOES.loadIndex('REGISTRO_ID');
      (pkg.operacoesCompletas || []).forEach(function (o) {
        var id = String(o.reportId || o.id);
        var existing = idx.byKey[id] || {};
        var merged = mergeOpRow(existing, o, reportId, 'BPTran', '1ª CPTran', '2026-09-30');
        indexUpsert(idx, merged.REGISTRO_ID, merged);
      });
      indexFlush(idx);
    });

    var ver = 1;
    if (db.RCO.rows.length) ver = opts.keepVersion ? Number(db.RCO.rows[0].VERSAO || 1) : Number(db.RCO.rows[0].VERSAO || 1) + 1;
    var proj = projectWrites(pkg, reportId);
    db.RCO.upsert('REPORT_ID', reportId, Object.assign({}, proj.rco, { VERSAO: ver }));

    if (opts.partialStopAfter === 'producao') {
      return { totalMs: Date.now() - t0, marks: marks, ops: totals(db), db: db, partial: true, fingerprint: fp };
    }

    draft = db.RCO_RASCUNHOS.rows.filter(function (r) { return String(r.RCO_REPORT_ID) === reportId; })[0];
    draft.P3_CONSOLIDADO = 'SIM'; draft.P3_CONSOLIDATE_INTEGRAL = 'SIM';
    draft.P3_CONSOLIDATE_FP = fp; draft.P3_CONSOLIDATE_DRAFT_FP = draftFp; draft.P3_CONSOLIDADO_EM = '2026-09-30T12:00:00Z';
    db.RCO_RASCUNHOS.upsert('RCO_REPORT_ID', reportId, draft);
    db.AUDITORIA.append({ AUDITORIA_ID: 'a-' + ver, ACAO: 'CONSOLIDADO', ENTIDADE_ID: reportId, VERSAO: ver });
    return { totalMs: Date.now() - t0, marks: marks, ops: totals(db), db: db, version: ver, fingerprint: fp, draftFingerprint: draftFp };
  }

  function runOptimized(db, pkg, opts) {
    opts = opts || {};
    if (opts.skipLock) return runOptimizedBody(db, pkg, opts);
    return withScriptLock(db, function () { return runOptimizedBody(db, pkg, opts); });
  }

  function snapshotBusiness(db, reportId) {
    function sortBy(arr, k) {
      return arr.slice().sort(function (a, b) { return String(a[k]).localeCompare(String(b[k])); });
    }
    return {
      producao: sortBy(db.PRODUCAO.rows.filter(function (r) { return r.REPORT_ID === reportId; }), 'REGISTRO_ID').map(function (r) { return r.REGISTRO_ID; }),
      veiculos: sortBy(db.VEICULOS.rows.filter(function (r) { return r.REPORT_ID === reportId; }), 'REGISTRO_ID').map(function (r) { return r.REGISTRO_ID + ':' + r.PLACA_UF; }),
      origens: sortBy(db.RCO_ORIGENS.rows.filter(function (r) { return r.RCO_REPORT_ID === reportId; }), 'RSD_REPORT_ID').map(function (r) { return r.RSD_REPORT_ID; }),
      rsdLinks: sortBy(db.RSD.rows.filter(function (r) { return r.RCO_REPORT_ID === reportId; }), 'REPORT_ID').map(function (r) { return r.REPORT_ID + ':' + r.STATUS; }),
      integral: db.RCO_RASCUNHOS.rows[0] && db.RCO_RASCUNHOS.rows[0].P3_CONSOLIDATE_INTEGRAL
    };
  }

  var POD_FIELDS = [
    'REGISTRO_ID', 'REPORT_ID', 'RCO_REPORT_ID', 'DATA', 'BATALHAO', 'COMPANHIA', 'GUARNICAO', 'OPERACAO', 'TURNO',
    'STATUS_CUMPRIMENTO', 'LOCAL_PREVISTO', 'LOCAL_EXECUTADO', 'COORDENADAS_EXECUTADAS', 'HORA_INICIO', 'HORA_FIM',
    'HOUVE_ALTERACAO', 'MOTIVO_ALTERACAO', 'ORIGEM_RELATORIO', 'ORIGEM_REGISTRO_ID'
  ];
  var OP_FIELDS = [
    'REGISTRO_ID', 'REPORT_ID', 'RCO_REPORT_ID', 'RSD_REPORT_ID', 'DATA', 'BATALHAO', 'COMPANHIA',
    'GUARNICAO_RESPONSAVEL', 'OPERACAO', 'TURNO', 'LOCAL', 'LATITUDE', 'LONGITUDE', 'STATUS_REGISTRO', 'VERSAO_ORIGEM'
  ];

  function snapshotPodOps(db, reportId) {
    function pick(row, fields) {
      var o = {};
      fields.forEach(function (f) { o[f] = row[f] != null ? row[f] : ''; });
      return o;
    }
    function byId(rows, key) {
      return rows.slice().sort(function (a, b) { return String(a[key]).localeCompare(String(b[key])); });
    }
    return {
      pod: byId(db.POD.rows.filter(function (r) { return String(r.RCO_REPORT_ID) === reportId; }), 'REGISTRO_ID').map(function (r) { return pick(r, POD_FIELDS); }),
      operacoes: byId(db.OPERACOES.rows.filter(function (r) { return String(r.RCO_REPORT_ID) === reportId; }), 'REGISTRO_ID').map(function (r) { return pick(r, OP_FIELDS); })
    };
  }

  function groupContiguous(rows) {
    if (!rows.length) return [];
    var blocks = [], bStart = rows[0], bEnd = rows[0];
    for (var r = 1; r < rows.length; r++) {
      if (rows[r] === bEnd + 1) bEnd = rows[r];
      else { blocks.push({ start: bStart, count: bEnd - bStart + 1 }); bStart = rows[r]; bEnd = rows[r]; }
    }
    blocks.push({ start: bStart, count: bEnd - bStart + 1 });
    return blocks;
  }

  return {
    hash: hash, FakeSheet: FakeSheet, fingerprint: fingerprint, draftFingerprint: draftFingerprint,
    projectWrites: projectWrites, mergePodRow: mergePodRow, mergeOpRow: mergeOpRow,
    integrityOk: integrityOk, buildPkg: buildPkg, seedDb: seedDb,
    totals: totals, draftUpsert: draftUpsert, withScriptLock: withScriptLock,
    indexUpsert: indexUpsert, indexFlush: indexFlush, groupContiguous: groupContiguous,
    runLegacy: runLegacy, runOptimized: runOptimized, snapshotBusiness: snapshotBusiness,
    snapshotPodOps: snapshotPodOps, POD_FIELDS: POD_FIELDS, OP_FIELDS: OP_FIELDS
  };
});
