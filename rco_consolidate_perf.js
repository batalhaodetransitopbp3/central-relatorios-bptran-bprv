/**
 * Simulação de custo I/O da consolidação P3 — Node (benchmark / equivalência).
 * Espelha a estratégia 10.8.37+: índice em memória + append/delete em lote +
 * fingerprint substantivo + draft-upsert que preserva/invalida markers.
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

  function FakeSheet(name, headers, rows) {
    this.name = name;
    this.headers = headers.slice();
    this.rows = (rows || []).map(function (r) { return Object.assign({}, r); });
    this.reads = 0;
    this.writes = 0;
    this.scans = 0;
    this.deletes = 0;
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
    // Espelha rowFor_: campos ausentes viram '' (risco de apagar markers se omitidos).
    var next = {};
    (this.headers || []).forEach(function (h) { next[h] = obj[h] != null ? obj[h] : ''; });
    Object.keys(obj || {}).forEach(function (k) { next[k] = obj[k]; });
    next[keyField] = key;
    if (idx >= 0) this.rows[idx] = next; else this.rows.push(next);
    this.writes++;
  };
  FakeSheet.prototype.append = function (obj) {
    this.rows.push(Object.assign({}, obj));
    this.writes++;
  };
  FakeSheet.prototype.appendBatch = function (objs) {
    var self = this;
    (objs || []).forEach(function (o) { self.rows.push(Object.assign({}, o)); });
    if (objs && objs.length) this.writes++;
  };
  FakeSheet.prototype.deleteWhere = function (field, value) {
    var keys = this.scanKey(field);
    var v = String(value);
    var keep = [];
    for (var i = 0; i < this.rows.length; i++) {
      if (String(keys[i]) === v) { this.deletes++; this.writes++; }
      else keep.push(this.rows[i]);
    }
    this.rows = keep;
  };
  FakeSheet.prototype.deleteWhereFast = function (field, value) {
    return this.deleteWhere(field, value);
  };
  FakeSheet.prototype.countWhere = function (field, value) {
    var keys = this.scanKey(field), v = String(value), n = 0;
    for (var i = 0; i < keys.length; i++) if (keys[i] === v) n++;
    return n;
  };
  FakeSheet.prototype.loadIndex = function (keyField) {
    var list = this.fullRead();
    var byKey = {};
    list.forEach(function (r, i) {
      var k = String(r[keyField] || '');
      if (k) {
        r._row = i + 2;
        byKey[k] = r;
      }
    });
    return {
      list: list, byKey: byKey, keyField: keyField, sheet: this,
      pendingUpserts: {}, pendingAppendsByKey: {}, pendingAppends: []
    };
  };

  function indexUpsert(idx, key, obj) {
    key = String(key || '');
    var next = {};
    Object.keys(obj || {}).forEach(function (k) { if (k !== '_row') next[k] = obj[k]; });
    next[idx.keyField] = key;
    var prev = idx.byKey[key];
    if (prev && prev._row) {
      next._row = prev._row;
      idx.byKey[key] = next;
      idx.pendingUpserts[key] = next;
    } else if (prev && idx.pendingAppendsByKey && idx.pendingAppendsByKey[key] != null) {
      next._pendingNew = true;
      idx.byKey[key] = next;
      idx.pendingAppendsByKey[key] = next;
    } else {
      next._pendingNew = true;
      idx.byKey[key] = next;
      if (!idx.pendingAppendsByKey) idx.pendingAppendsByKey = {};
      idx.pendingAppendsByKey[key] = next;
    }
    return next;
  }

  function indexFlush(idx) {
    var sheet = idx.sheet;
    Object.keys(idx.pendingUpserts || {}).forEach(function (k) {
      var obj = idx.pendingUpserts[k];
      if (!obj || !obj._row) return;
      var rowIdx = obj._row - 2;
      var clean = Object.assign({}, obj);
      delete clean._row; delete clean._pendingNew;
      sheet.rows[rowIdx] = clean;
      sheet.writes++;
    });
    idx.pendingUpserts = {};
    var addKeys = Object.keys(idx.pendingAppendsByKey || {});
    if (addKeys.length) {
      addKeys.forEach(function (k) {
        var o = Object.assign({}, idx.pendingAppendsByKey[k]);
        delete o._pendingNew; delete o._row;
        sheet.rows.push(o);
      });
      sheet.writes++;
      idx.pendingAppendsByKey = {};
    }
    idx.pendingAppends = [];
  }

  function deriveStat(rco) {
    rco = rco || {};
    var producao = [], gs = (rco.state && rco.state.guarnicoes) || {};
    Object.keys(gs).forEach(function (gid) {
      var g = gs[gid] || {}, metrics = g.metrics || {};
      Object.keys(metrics).forEach(function (mk) {
        var parts = String(mk).split('::');
        producao.push({
          guarnicao: fpStr(g.nome || gid), grupoCodigo: fpStr(parts[0] || ''), indicadorCodigo: fpStr(parts[1] || ''),
          grupoNome: '', indicadorNome: '', quantidade: Number(metrics[mk] || 0)
        });
      });
    });
    var veiculos = (rco.veiculosRecuperados || []).map(function (v) {
      v = v || {};
      return {
        placaUf: String(v.placaUf || '').toUpperCase(), tipo: fpStr(v.tipo), marcaModelo: fpStr(v.marcaModelo),
        situacao: fpStr(v.situacao), classificacaoP3: fpStr(v.classificacaoP3),
        tipoRecuperacaoDetalhada: fpStr(v.tipoRecuperacaoDetalhada),
        contaComoRecuperado: v.contaComoRecuperado === true || v.contaComoRecuperado === 'SIM' || v.contaComoRecuperado === 1 ? 'SIM' : 'NAO',
        valorFipe: Number(v.valorFipe || 0), guarnicao: fpStr(v.guarnicao),
        placaOriginalIdentificada: fpStr(v.placaOriginalIdentificada), restricaoOriginal: fpStr(v.restricaoOriginal),
        local: fpStr(v.local), quantidadeConduzidos: Number(v.quantidadeConduzidos || 0)
      };
    });
    var pod = (rco.operacoes || []).map(function (o) {
      o = o || {};
      return {
        id: fpStr(o.id || o.reportId), guarnicao: fpStr(o.guarnicao), operacao: fpStr(o.nome || o.operacao),
        turno: fpStr(o.turno), statusCumprimento: fpStr(o.statusCumprimento),
        localPrevisto: fpStr(o.localPrevisto), localExecutado: fpStr(o.local || o.localExecutado),
        motivoAlteracao: fpStr(o.motivoAlteracao)
      };
    });
    return { producao: producao, veiculos: veiculos, podExecucao: pod };
  }

  /** Canon substantivo — espelha rcoConsolidateSubstantiveCanon_. */
  function substantiveCanon(pkg, reportId) {
    var rco = pkg.rco || pkg || {}, u = pkg.unidade || rco.unidade || {}, cons = rco.consolidacaoResponsavel || {};
    var stat = pkg.estatisticaP3 || rco.estatisticaP3 || null;
    if (!stat || !Array.isArray(stat.producao)) stat = deriveStat(rco);
    var modo = rco.semGuarnicaoCpu ? 'SEM_CPU' : 'CPU';
    var origins = (rco.rcoOrigens || []).map(function (o) {
      return [fpStr(o.rsdReportId), fpStr(o.serviceId), fpStr(o.guarnicao), fpStr(o.status), String(o.versao || '')].join('|');
    }).filter(function (x) { return x.split('|')[0]; }).sort();
    var prod = (stat.producao || []).map(function (x) {
      return [fpStr(x.guarnicao || x.GUARNICAO), fpStr(x.grupoCodigo || x.GRUPO_CODIGO), fpStr(x.indicadorCodigo || x.INDICADOR_CODIGO),
        fpStr(x.grupoNome || x.GRUPO_NOME), fpStr(x.indicadorNome || x.INDICADOR_NOME),
        String(Number(x.quantidade != null ? x.quantidade : (x.QUANTIDADE || 0)))].join('|');
    }).sort();
    var veh = (stat.veiculos || []).map(function (x) {
      return [String(x.placaUf || x.PLACA_UF || '').toUpperCase(), fpStr(x.tipo || x.TIPO), fpStr(x.marcaModelo || x.MARCA_MODELO),
        fpStr(x.situacao || x.SITUACAO), fpStr(x.classificacaoP3 || x.CLASSIFICACAO_P3),
        fpStr(x.tipoRecuperacaoDetalhada || x.TIPO_RECUPERACAO_DETALHADA),
        (x.contaComoRecuperado === true || x.contaComoRecuperado === 'SIM' || x.CONTA_COMO_RECUPERADO === 'SIM') ? 'SIM' : 'NAO',
        String(Number(x.valorFipe != null ? x.valorFipe : (x.VALOR_FIPE || 0))), fpStr(x.guarnicao || x.GUARNICAO),
        fpStr(x.placaOriginalIdentificada || x.PLACA_ORIGINAL_IDENTIFICADA), fpStr(x.restricaoOriginal || x.RESTRICAO_ORIGINAL),
        fpStr(x.local || x.LOCAL), String(Number(x.quantidadeConduzidos != null ? x.quantidadeConduzidos : (x.QUANTIDADE_CONDUZIDOS || 0)))].join('|');
    }).sort();
    var pod = (stat.podExecucao || pkg.podExecucao || []).map(function (x) {
      return [fpStr(x.registroId || x.REGISTRO_ID || x.id || x.origemRegistroId), fpStr(x.guarnicao || x.GUARNICAO),
        fpStr(x.operacao || x.OPERACAO || x.nome), fpStr(x.turno || x.TURNO),
        fpStr(x.statusCumprimento || x.STATUS_CUMPRIMENTO), fpStr(x.localPrevisto || x.LOCAL_PREVISTO),
        fpStr(x.localExecutado || x.LOCAL_EXECUTADO || x.local), fpStr(x.motivoAlteracao || x.MOTIVO_ALTERACAO)].join('|');
    }).sort();
    var opsSrc = pkg.operacoesCompletas || rco.operacoes || [];
    var ops = opsSrc.map(function (o) {
      o = o || {};
      var nome = ((o.operacao || {}).nome) || o.nome || '';
      var turno = ((o.operacao || {}).turno) || o.turno || '';
      var local = ((o.local || {}).descricao) || o.local || '';
      return [fpStr(o.reportId || o.id), fpStr(o.rsdReportId), fpStr(o.guarnicao || ((o.operacao || {}).guarnicoes)), fpStr(nome), fpStr(turno), fpStr(local)].join('|');
    }).sort();
    return {
      reportId: String(reportId || ''),
      data: fpStr((rco.periodo || {}).inicio || rco.data || pkg.data || ''),
      batt: fpStr(u.batalhao || pkg.batalhao || ''),
      comp: fpStr(u.companhia || pkg.companhia || ''),
      modo: modo,
      cons: [String(cons.matricula || ''), fpStr(cons.nome), fpStr(cons.postoGrad), fpStr(cons.turno)].join('|'),
      obs: fpStr(rco.observacoes),
      origins: origins, producao: prod, veiculos: veh, pod: pod, ops: ops
    };
  }

  function fingerprint(pkg, reportId) {
    return hash(JSON.stringify(substantiveCanon(pkg, reportId)));
  }
  function draftFingerprint(rco, reportId) {
    return fingerprint({ rco: rco || {} }, reportId);
  }

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
        quantidade: i % 5
      });
    }
    var veiculos = [];
    for (var v = 0; v < (opts.vehRows || 8); v++) {
      veiculos.push({
        registroId: 'veh-' + v, placaUf: 'ABC' + v + 'PB', guarnicao: 'BST 1',
        tipo: 'AUTO', marcaModelo: 'VW/GOL', situacao: 'RECUPERADO',
        classificacaoP3: 'RECUPERADO', valorFipe: 10000 + v, contaComoRecuperado: true
      });
    }
    var pod = opts.pod || [
      { registroId: 'pod-1', guarnicao: 'BST 1', operacao: 'POD A', turno: 'A', statusCumprimento: 'CUMPRIDO', localPrevisto: 'X', localExecutado: 'X' }
    ];
    var ops = opts.ops || [
      { reportId: 'op-full-1', rsdReportId: 'rsd-1', guarnicao: 'BST 1', nome: 'Op A', turno: 'A', local: 'Local A' }
    ];
    return {
      rco: {
        reportId: opts.reportId || 'rco-bench-1',
        periodo: { inicio: '2026-09-30' },
        unidade: { batalhao: 'BPTran', companhia: '1ª CPTran' },
        rcoOrigens: origins,
        semGuarnicaoCpu: !!opts.semCpu,
        observacoes: opts.observacoes || '',
        consolidacaoResponsavel: opts.cons || { matricula: '12345', nome: 'CPU Teste', postoGrad: 'SD', turno: 'A' },
        veiculosRecuperados: veiculos.map(function (x) {
          return {
            placaUf: x.placaUf, tipo: x.tipo, marcaModelo: x.marcaModelo, situacao: x.situacao,
            classificacaoP3: x.classificacaoP3, valorFipe: x.valorFipe, contaComoRecuperado: true, guarnicao: x.guarnicao
          };
        }),
        operacoes: ops.map(function (o) {
          return { id: o.reportId, reportId: o.reportId, guarnicao: o.guarnicao, nome: o.nome, turno: o.turno, local: o.local, statusCumprimento: 'CUMPRIDO' };
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
      operacoesCompletas: ops,
      podExecucao: pod
    };
  }

  function seedDb(pkg, opts) {
    opts = opts || {};
    var rsdRows = (pkg.rco.rcoOrigens || []).map(function (o, i) {
      return {
        REPORT_ID: o.rsdReportId, SERVICE_ID: o.serviceId, STATUS: opts.forceOpen && i === 0 ? 'EM_SERVICO' : (o.status || 'DEFERIDO'),
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
    return {
      RCO: new FakeSheet('RCO', ['REPORT_ID', 'VERSAO', 'DATA_SERVICO', 'BATALHAO', 'COMPANHIA', 'MODO_CONSOLIDACAO', 'OBSERVACOES', 'CONSOLIDADOR_MATRICULA'], []),
      RCO_RASCUNHOS: new FakeSheet('RCO_RASCUNHOS', [
        'RCO_REPORT_ID', 'STATUS', 'P3_CONSOLIDADO', 'P3_CONSOLIDADO_EM',
        'P3_CONSOLIDATE_FP', 'P3_CONSOLIDATE_DRAFT_FP', 'P3_CONSOLIDATE_INTEGRAL', 'REVISAO', 'PAYLOAD_JSON'
      ], [{
        RCO_REPORT_ID: pkg.rco.reportId, STATUS: opts.draftStatus || 'EM_ANDAMENTO',
        P3_CONSOLIDADO: 'NAO', P3_CONSOLIDADO_EM: '',
        P3_CONSOLIDATE_FP: '', P3_CONSOLIDATE_DRAFT_FP: '', P3_CONSOLIDATE_INTEGRAL: 'NAO',
        REVISAO: 1, PAYLOAD_JSON: JSON.stringify(pkg.rco)
      }]),
      PRODUCAO: new FakeSheet('PRODUCAO', ['REGISTRO_ID', 'REPORT_ID'], []),
      VEICULOS: new FakeSheet('VEICULOS', ['REGISTRO_ID', 'REPORT_ID', 'PLACA_UF', 'CLASSIFICACAO_P3', 'VALOR_FIPE'], []),
      RCO_ORIGENS: new FakeSheet('RCO_ORIGENS', ['REGISTRO_ID', 'RCO_REPORT_ID', 'RSD_REPORT_ID'], []),
      RSD: new FakeSheet('RSD', ['REPORT_ID', 'STATUS', 'RCO_REPORT_ID', 'BATALHAO', 'COMPANHIA', 'DATA_SERVICO'], rsdRows),
      PRISOES: new FakeSheet('PRISOES', ['PRISAO_ID', 'RSD_REPORT_ID', 'RCO_REPORT_ID'], pris),
      CIRVC: new FakeSheet('CIRVC', ['CIRVC_ID', 'RSD_REPORT_ID', 'RCO_REPORT_ID'], []),
      POD: new FakeSheet('POD', ['REGISTRO_ID', 'RCO_REPORT_ID', 'OPERACAO', 'STATUS_CUMPRIMENTO'], []),
      OPERACOES: new FakeSheet('OPERACOES', ['REGISTRO_ID', 'RCO_REPORT_ID', 'STATUS_REGISTRO', 'REPORT_ID', 'OPERACAO'], ops),
      AUDITORIA: new FakeSheet('AUDITORIA', ['AUDITORIA_ID', 'ACAO', 'ENTIDADE_ID', 'VERSAO'], [])
    };
  }

  function totals(db) {
    var sheets = ['RCO', 'RCO_RASCUNHOS', 'PRODUCAO', 'VEICULOS', 'RCO_ORIGENS', 'RSD', 'PRISOES', 'CIRVC', 'POD', 'OPERACOES'];
    var reads = 0, writes = 0, scans = 0, deletes = 0;
    sheets.forEach(function (k) {
      reads += db[k].reads; writes += db[k].writes; scans += db[k].scans; deletes += db[k].deletes;
    });
    return { sheetReads: reads, sheetWrites: writes, sheetScans: scans, deletes: deletes };
  }

  /** Simula rco-draft-upsert: preserva markers só se draft FP inalterado. */
  function draftUpsert(db, rcoPayload) {
    var reportId = String((rcoPayload && rcoPayload.reportId) || '');
    var sheet = db.RCO_RASCUNHOS;
    var old = sheet.rows.filter(function (r) { return String(r.RCO_REPORT_ID) === reportId; })[0] || null;
    var priorPkgFp = old ? String(old.P3_CONSOLIDATE_FP || '') : '';
    var priorDraftFp = old ? String(old.P3_CONSOLIDATE_DRAFT_FP || '') : '';
    var priorIntegral = old && String(old.P3_CONSOLIDATE_INTEGRAL || '').toUpperCase() === 'SIM';
    var incomingDraftFp = draftFingerprint(rcoPayload, reportId);
    var outPkgFp = '', outDraftFp = '', outIntegral = 'NAO', p3 = 'NAO', p3Em = '';
    var kept = false;
    if (priorIntegral && priorPkgFp && priorDraftFp && incomingDraftFp === priorDraftFp) {
      kept = true;
      outPkgFp = priorPkgFp; outDraftFp = priorDraftFp; outIntegral = 'SIM';
      p3 = 'SIM'; p3Em = old.P3_CONSOLIDADO_EM || '2026-09-30T12:00:00Z';
    } else if (priorIntegral && priorDraftFp && incomingDraftFp !== priorDraftFp) {
      outPkgFp = ''; outDraftFp = ''; outIntegral = 'NAO'; p3 = 'NAO'; p3Em = '';
    } else if (priorPkgFp && !priorIntegral && (!priorDraftFp || incomingDraftFp === priorDraftFp)) {
      outPkgFp = priorPkgFp; outDraftFp = priorDraftFp || incomingDraftFp; outIntegral = 'NAO';
      p3 = old ? String(old.P3_CONSOLIDADO || 'NAO') : 'NAO';
      p3Em = old ? String(old.P3_CONSOLIDADO_EM || '') : '';
    }
    var rev = old ? Number(old.REVISAO || 0) + 1 : 1;
    // Objeto SEM markers implícitos — só os que setamos (prova o bug se omitidos).
    var obj = {
      RCO_REPORT_ID: reportId,
      STATUS: old ? old.STATUS : 'EM_ANDAMENTO',
      P3_CONSOLIDADO: p3,
      P3_CONSOLIDADO_EM: p3Em,
      P3_CONSOLIDATE_FP: outPkgFp,
      P3_CONSOLIDATE_DRAFT_FP: outDraftFp,
      P3_CONSOLIDATE_INTEGRAL: outIntegral,
      REVISAO: rev,
      PAYLOAD_JSON: JSON.stringify(rcoPayload || {})
    };
    sheet.upsert('RCO_REPORT_ID', reportId, obj);
    return { ok: true, consolidateMarkersKept: kept, revision: rev, draftFp: incomingDraftFp };
  }

  function runLegacy(db, pkg) {
    var t0 = Date.now();
    var reportId = pkg.rco.reportId;
    var marks = {};
    function mark(n, fn) { var a = Date.now(); fn(); marks[n] = Date.now() - a; }

    mark('resolveRsd', function () {
      (pkg.rco.rcoOrigens || []).forEach(function () {
        db.RSD.scanKey('REPORT_ID');
        db.RSD.reads++;
      });
      db.RSD.fullRead();
    });
    mark('producao', function () {
      db.PRODUCAO.deleteWhere('REPORT_ID', reportId);
      (pkg.estatisticaP3.producao || []).forEach(function (x) {
        db.PRODUCAO.append({ REGISTRO_ID: x.registroId, REPORT_ID: reportId });
      });
    });
    mark('veiculos', function () {
      db.VEICULOS.deleteWhere('REPORT_ID', reportId);
      (pkg.estatisticaP3.veiculos || []).forEach(function (x) {
        db.VEICULOS.append({ REGISTRO_ID: x.registroId, REPORT_ID: reportId, PLACA_UF: x.placaUf, CLASSIFICACAO_P3: x.classificacaoP3, VALOR_FIPE: x.valorFipe });
      });
    });
    mark('rcoOrigens', function () {
      db.RCO_ORIGENS.deleteWhere('RCO_REPORT_ID', reportId);
      (pkg.rco.rcoOrigens || []).forEach(function (o) {
        db.RCO_ORIGENS.append({ REGISTRO_ID: 'o-' + o.rsdReportId, RCO_REPORT_ID: reportId, RSD_REPORT_ID: o.rsdReportId });
      });
    });
    mark('relinkRsd', function () {
      var rows = db.RSD.fullRead();
      var set = {};
      (pkg.rco.rcoOrigens || []).forEach(function (o) { set[o.rsdReportId] = true; });
      rows.forEach(function (rr) {
        if (set[rr.REPORT_ID] && ['DEFERIDO', 'DEFERIDO_COM_RESSALVAS', 'INCLUIDO_RCO', 'FINALIZADO'].indexOf(rr.STATUS) >= 0) {
          db.RSD.upsert('REPORT_ID', rr.REPORT_ID, Object.assign({}, rr, { STATUS: 'INCLUIDO_RCO', RCO_REPORT_ID: reportId }));
        }
      });
    });
    mark('prisoes', function () {
      db.PRISOES.fullRead().forEach(function (pr) {
        var ch = false, next = Object.assign({}, pr);
        if (String(pr.RSD_REPORT_ID).indexOf('rsd-') === 0) { next.RCO_REPORT_ID = reportId; ch = true; }
        if (ch) db.PRISOES.upsert('PRISAO_ID', pr.PRISAO_ID, next);
      });
    });
    mark('pod', function () {
      (pkg.estatisticaP3.podExecucao || []).forEach(function (x) {
        db.POD.append({ REGISTRO_ID: x.registroId, RCO_REPORT_ID: reportId, OPERACAO: x.operacao, STATUS_CUMPRIMENTO: x.statusCumprimento });
      });
    });
    mark('operacoes', function () {
      db.OPERACOES.fullRead().forEach(function () { /* scan */ });
      (pkg.operacoesCompletas || []).forEach(function (o) {
        db.OPERACOES.append({ REGISTRO_ID: o.reportId || o.id, RCO_REPORT_ID: reportId, STATUS_REGISTRO: 'CONSOLIDADO', REPORT_ID: o.reportId || o.id, OPERACAO: o.nome });
      });
    });
    db.RCO.upsert('REPORT_ID', reportId, {
      REPORT_ID: reportId, VERSAO: 1, DATA_SERVICO: '2026-09-30', BATALHAO: 'BPTran', COMPANHIA: '1ª CPTran',
      MODO_CONSOLIDACAO: pkg.rco.semGuarnicaoCpu ? 'SEM_CPU' : 'CPU', OBSERVACOES: pkg.rco.observacoes || '',
      CONSOLIDADOR_MATRICULA: (pkg.rco.consolidacaoResponsavel || {}).matricula || ''
    });
    var draft = db.RCO_RASCUNHOS.rows[0];
    var fp = fingerprint(pkg, reportId);
    var dfp = draftFingerprint(pkg.rco, reportId);
    draft.P3_CONSOLIDADO = 'SIM'; draft.P3_CONSOLIDATE_INTEGRAL = 'SIM';
    draft.P3_CONSOLIDATE_FP = fp; draft.P3_CONSOLIDATE_DRAFT_FP = dfp;
    draft.P3_CONSOLIDADO_EM = '2026-09-30T12:00:00Z';
    db.RCO_RASCUNHOS.upsert('RCO_REPORT_ID', reportId, draft);
    db.AUDITORIA.append({ AUDITORIA_ID: 'a1', ACAO: 'CONSOLIDADO', ENTIDADE_ID: reportId, VERSAO: 1 });

    return { totalMs: Date.now() - t0, marks: marks, ops: totals(db), db: db };
  }

  function runOptimized(db, pkg, opts) {
    opts = opts || {};
    var t0 = Date.now();
    var reportId = pkg.rco.reportId;
    var marks = {};
    var fp = fingerprint(pkg, reportId);
    var draftFp = draftFingerprint(pkg.rco, reportId);
    function mark(n, fn) { var a = Date.now(); fn(); marks[n] = (marks[n] || 0) + (Date.now() - a); }

    var draft = db.RCO_RASCUNHOS.rows.filter(function (r) { return String(r.RCO_REPORT_ID) === reportId; })[0];
    if (!opts.skipIdempotency && draft && draft.P3_CONSOLIDADO === 'SIM' && draft.P3_CONSOLIDATE_INTEGRAL === 'SIM' &&
        draft.P3_CONSOLIDATE_FP === fp && integrityOk(db, reportId, pkg)) {
      return { totalMs: Date.now() - t0, marks: { idempotent: Date.now() - t0 }, ops: totals(db), db: db, idempotent: true, fingerprint: fp, version: Number((db.RCO.rows[0] && db.RCO.rows[0].VERSAO) || 1) };
    }

    draft.P3_CONSOLIDATE_INTEGRAL = 'NAO'; draft.P3_CONSOLIDATE_FP = fp; draft.P3_CONSOLIDATE_DRAFT_FP = draftFp;
    db.RCO_RASCUNHOS.upsert('RCO_REPORT_ID', reportId, draft);

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
        return { REGISTRO_ID: x.registroId, REPORT_ID: reportId, PLACA_UF: x.placaUf, CLASSIFICACAO_P3: x.classificacaoP3, VALOR_FIPE: x.valorFipe };
      }));
    });
    mark('rcoOrigens', function () {
      db.RCO_ORIGENS.deleteWhereFast('RCO_REPORT_ID', reportId);
      db.RCO_ORIGENS.appendBatch((pkg.rco.rcoOrigens || []).map(function (o) {
        return { REGISTRO_ID: 'o-' + o.rsdReportId, RCO_REPORT_ID: reportId, RSD_REPORT_ID: o.rsdReportId };
      }));
    });
    mark('relinkRsd', function () {
      var idx = db.RSD.loadIndex('REPORT_ID');
      var set = {};
      (pkg.rco.rcoOrigens || []).forEach(function (o) { set[o.rsdReportId] = true; });
      idx.list.forEach(function (rr) {
        if (set[rr.REPORT_ID] && ['DEFERIDO', 'DEFERIDO_COM_RESSALVAS', 'INCLUIDO_RCO', 'FINALIZADO'].indexOf(rr.STATUS) >= 0) {
          for (var i = 0; i < db.RSD.rows.length; i++) {
            if (db.RSD.rows[i].REPORT_ID === rr.REPORT_ID) {
              db.RSD.rows[i] = Object.assign({}, rr, { STATUS: 'INCLUIDO_RCO', RCO_REPORT_ID: reportId });
              db.RSD.writes++;
              break;
            }
          }
        }
      });
    });
    mark('prisoes', function () {
      var idx = db.PRISOES.loadIndex('PRISAO_ID');
      idx.list.forEach(function (pr) {
        if (String(pr.RSD_REPORT_ID).indexOf('rsd-') === 0) {
          for (var i = 0; i < db.PRISOES.rows.length; i++) {
            if (db.PRISOES.rows[i].PRISAO_ID === pr.PRISAO_ID) {
              db.PRISOES.rows[i] = Object.assign({}, pr, { RCO_REPORT_ID: reportId });
              db.PRISOES.writes++;
              break;
            }
          }
        }
      });
    });
    mark('pod', function () {
      var idx = db.POD.loadIndex('REGISTRO_ID');
      (pkg.estatisticaP3.podExecucao || []).forEach(function (x) {
        var rid = String(x.registroId || x.id);
        indexUpsert(idx, rid, {
          REGISTRO_ID: rid, RCO_REPORT_ID: reportId, OPERACAO: x.operacao || x.OPERACAO || '',
          STATUS_CUMPRIMENTO: x.statusCumprimento || ''
        });
      });
      indexFlush(idx);
    });
    mark('operacoes', function () {
      var idx = db.OPERACOES.loadIndex('REGISTRO_ID');
      (pkg.operacoesCompletas || []).forEach(function (o) {
        var id = String(o.reportId || o.id);
        indexUpsert(idx, id, {
          REGISTRO_ID: id, RCO_REPORT_ID: reportId, STATUS_REGISTRO: 'CONSOLIDADO',
          REPORT_ID: id, OPERACAO: o.nome || ((o.operacao || {}).nome) || ''
        });
      });
      indexFlush(idx);
    });

    var ver = 1;
    if (db.RCO.rows.length) ver = opts.keepVersion ? Number(db.RCO.rows[0].VERSAO || 1) : Number(db.RCO.rows[0].VERSAO || 1) + 1;
    db.RCO.upsert('REPORT_ID', reportId, {
      REPORT_ID: reportId, VERSAO: ver, DATA_SERVICO: '2026-09-30', BATALHAO: 'BPTran', COMPANHIA: '1ª CPTran',
      MODO_CONSOLIDACAO: pkg.rco.semGuarnicaoCpu ? 'SEM_CPU' : 'CPU', OBSERVACOES: pkg.rco.observacoes || '',
      CONSOLIDADOR_MATRICULA: (pkg.rco.consolidacaoResponsavel || {}).matricula || ''
    });

    if (opts.partialStopAfter === 'producao') {
      return { totalMs: Date.now() - t0, marks: marks, ops: totals(db), db: db, partial: true, fingerprint: fp };
    }

    draft = db.RCO_RASCUNHOS.rows.filter(function (r) { return String(r.RCO_REPORT_ID) === reportId; })[0];
    draft.P3_CONSOLIDADO = 'SIM'; draft.P3_CONSOLIDATE_INTEGRAL = 'SIM';
    draft.P3_CONSOLIDATE_FP = fp; draft.P3_CONSOLIDATE_DRAFT_FP = draftFp;
    draft.P3_CONSOLIDADO_EM = '2026-09-30T12:00:00Z';
    db.RCO_RASCUNHOS.upsert('RCO_REPORT_ID', reportId, draft);
    db.AUDITORIA.append({ AUDITORIA_ID: 'a-' + ver, ACAO: 'CONSOLIDADO', ENTIDADE_ID: reportId, VERSAO: ver });

    return { totalMs: Date.now() - t0, marks: marks, ops: totals(db), db: db, version: ver, fingerprint: fp, draftFingerprint: draftFp };
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

  return {
    hash: hash,
    FakeSheet: FakeSheet,
    fingerprint: fingerprint,
    draftFingerprint: draftFingerprint,
    substantiveCanon: substantiveCanon,
    integrityOk: integrityOk,
    buildPkg: buildPkg,
    seedDb: seedDb,
    totals: totals,
    draftUpsert: draftUpsert,
    indexUpsert: indexUpsert,
    indexFlush: indexFlush,
    runLegacy: runLegacy,
    runOptimized: runOptimized,
    snapshotBusiness: snapshotBusiness
  };
});
