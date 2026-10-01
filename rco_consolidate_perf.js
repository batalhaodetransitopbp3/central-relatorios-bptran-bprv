/**
 * Simulação de custo I/O da consolidação P3 — Node (benchmark / equivalência).
 * Espelha a estratégia 10.8.37: índice em memória + append/delete em lote.
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
    var next = Object.assign({}, obj); next[keyField] = key;
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
    list.forEach(function (r) {
      var k = String(r[keyField] || '');
      if (k) byKey[k] = r;
    });
    return { list: list, byKey: byKey, keyField: keyField, sheet: this, pending: {} };
  };

  function fingerprint(pkg, reportId) {
    var rco = pkg.rco || pkg || {};
    var stat = pkg.estatisticaP3 || {};
    var origins = (rco.rcoOrigens || []).map(function (o) { return String(o.rsdReportId || ''); }).filter(Boolean).sort();
    var prod = (stat.producao || []).map(function (x) {
      return [x.guarnicao || '', x.grupoCodigo || '', x.indicadorCodigo || '', String(x.quantidade || 0)].join(':');
    }).sort();
    var veh = (stat.veiculos || []).map(function (x) { return String(x.placaUf || '').toUpperCase(); }).sort();
    return hash([reportId, origins.join(','), prod.join('|'), veh.join(','), String((rco.periodo || {}).inicio || '')].join('#'));
  }

  function integrityOk(db, reportId, pkg) {
    var expectProd = (pkg.estatisticaP3.producao || []).length;
    var expectOrig = (pkg.rco.rcoOrigens || []).length;
    return db.PRODUCAO.countWhere('REPORT_ID', reportId) === expectProd &&
      db.RCO_ORIGENS.countWhere('RCO_REPORT_ID', reportId) === expectOrig &&
      db.RCO.rows.some(function (r) { return String(r.REPORT_ID) === reportId; });
  }

  function buildPkg(opts) {
    opts = opts || {};
    var nGu = opts.guarnicoes || 3;
    var nProd = opts.prodRows || 120;
    var origins = [];
    for (var g = 1; g <= nGu; g++) {
      origins.push({ rsdReportId: 'rsd-' + g, serviceId: 'svc-' + g, guarnicao: 'BST ' + g, status: opts.rsdStatus || 'DEFERIDO' });
    }
    var producao = [];
    for (var i = 0; i < nProd; i++) {
      producao.push({
        registroId: 'prod-' + i, guarnicao: 'BST ' + ((i % nGu) + 1),
        grupoCodigo: 'G' + (i % 10), indicadorCodigo: 'I' + i, quantidade: i % 5
      });
    }
    var veiculos = [];
    for (var v = 0; v < (opts.vehRows || 8); v++) {
      veiculos.push({ registroId: 'veh-' + v, placaUf: 'ABC' + v + 'PB', guarnicao: 'BST 1' });
    }
    return {
      rco: {
        reportId: opts.reportId || 'rco-bench-1',
        periodo: { inicio: '2026-09-30' },
        unidade: { batalhao: 'BPTran', companhia: '1ª CPTran' },
        rcoOrigens: origins,
        semGuarnicaoCpu: !!opts.semCpu
      },
      estatisticaP3: { producao: producao, veiculos: veiculos, podExecucao: opts.pod || [] },
      operacoesCompletas: opts.ops || []
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
    // noise rows to simulate base growth
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
      RCO: new FakeSheet('RCO', ['REPORT_ID', 'VERSAO', 'DATA_SERVICO', 'BATALHAO', 'COMPANHIA'], []),
      RCO_RASCUNHOS: new FakeSheet('RCO_RASCUNHOS', ['RCO_REPORT_ID', 'STATUS', 'P3_CONSOLIDADO', 'P3_CONSOLIDATE_FP', 'P3_CONSOLIDATE_INTEGRAL'], [
        { RCO_REPORT_ID: pkg.rco.reportId, STATUS: opts.draftStatus || 'EM_ANDAMENTO', P3_CONSOLIDADO: 'NAO', P3_CONSOLIDATE_FP: '', P3_CONSOLIDATE_INTEGRAL: 'NAO' }
      ]),
      PRODUCAO: new FakeSheet('PRODUCAO', ['REGISTRO_ID', 'REPORT_ID'], []),
      VEICULOS: new FakeSheet('VEICULOS', ['REGISTRO_ID', 'REPORT_ID', 'PLACA_UF'], []),
      RCO_ORIGENS: new FakeSheet('RCO_ORIGENS', ['REGISTRO_ID', 'RCO_REPORT_ID', 'RSD_REPORT_ID'], []),
      RSD: new FakeSheet('RSD', ['REPORT_ID', 'STATUS', 'RCO_REPORT_ID', 'BATALHAO', 'COMPANHIA', 'DATA_SERVICO'], rsdRows),
      PRISOES: new FakeSheet('PRISOES', ['PRISAO_ID', 'RSD_REPORT_ID', 'RCO_REPORT_ID'], pris),
      CIRVC: new FakeSheet('CIRVC', ['CIRVC_ID', 'RSD_REPORT_ID', 'RCO_REPORT_ID'], []),
      POD: new FakeSheet('POD', ['REGISTRO_ID', 'RCO_REPORT_ID'], []),
      OPERACOES: new FakeSheet('OPERACOES', ['REGISTRO_ID', 'RCO_REPORT_ID', 'STATUS_REGISTRO', 'REPORT_ID'], ops)
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

  /** Algoritmo legado (N+1) — custo simulado. */
  function runLegacy(db, pkg) {
    var t0 = Date.now();
    var reportId = pkg.rco.reportId;
    var marks = {};
    function mark(n, fn) { var a = Date.now(); fn(); marks[n] = Date.now() - a; }

    mark('resolveRsd', function () {
      (pkg.rco.rcoOrigens || []).forEach(function (o) {
        db.RSD.scanKey('REPORT_ID');
        db.RSD.reads++; // row fetch
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
        db.VEICULOS.append({ REGISTRO_ID: x.registroId, REPORT_ID: reportId, PLACA_UF: x.placaUf });
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
    mark('operacoes', function () {
      db.OPERACOES.fullRead().forEach(function () { /* scan */ });
    });
    db.RCO.upsert('REPORT_ID', reportId, { REPORT_ID: reportId, VERSAO: 1, DATA_SERVICO: '2026-09-30', BATALHAO: 'BPTran', COMPANHIA: '1ª CPTran' });
    var draft = db.RCO_RASCUNHOS.rows[0];
    draft.P3_CONSOLIDADO = 'SIM'; draft.P3_CONSOLIDATE_INTEGRAL = 'SIM';
    draft.P3_CONSOLIDATE_FP = fingerprint(pkg, reportId);
    db.RCO_RASCUNHOS.upsert('RCO_REPORT_ID', reportId, draft);

    var tot = totals(db);
    return { totalMs: Date.now() - t0, marks: marks, ops: tot, db: db };
  }

  /** Algoritmo 10.8.37 — índice + batch. */
  function runOptimized(db, pkg, opts) {
    opts = opts || {};
    var t0 = Date.now();
    var reportId = pkg.rco.reportId;
    var marks = {};
    var fp = fingerprint(pkg, reportId);
    function mark(n, fn) { var a = Date.now(); fn(); marks[n] = (marks[n] || 0) + (Date.now() - a); }

    var draft = db.RCO_RASCUNHOS.rows[0];
    if (!opts.skipIdempotency && draft.P3_CONSOLIDADO === 'SIM' && draft.P3_CONSOLIDATE_INTEGRAL === 'SIM' && draft.P3_CONSOLIDATE_FP === fp && integrityOk(db, reportId, pkg)) {
      return { totalMs: Date.now() - t0, marks: { idempotent: Date.now() - t0 }, ops: totals(db), db: db, idempotent: true };
    }

    draft.P3_CONSOLIDATE_INTEGRAL = 'NAO'; draft.P3_CONSOLIDATE_FP = fp;
    db.RCO_RASCUNHOS.upsert('RCO_REPORT_ID', reportId, draft);

    mark('resolveRsd', function () {
      db.RSD.loadIndex('REPORT_ID');
    });

    mark('producao', function () {
      db.PRODUCAO.deleteWhereFast('REPORT_ID', reportId);
      db.PRODUCAO.appendBatch((pkg.estatisticaP3.producao || []).map(function (x) {
        return { REGISTRO_ID: x.registroId, REPORT_ID: reportId };
      }));
    });
    mark('veiculos', function () {
      db.VEICULOS.deleteWhereFast('REPORT_ID', reportId);
      db.VEICULOS.appendBatch((pkg.estatisticaP3.veiculos || []).map(function (x) {
        return { REGISTRO_ID: x.registroId, REPORT_ID: reportId, PLACA_UF: x.placaUf };
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
      var dirty = [];
      idx.list.forEach(function (rr) {
        if (set[rr.REPORT_ID] && ['DEFERIDO', 'DEFERIDO_COM_RESSALVAS', 'INCLUIDO_RCO', 'FINALIZADO'].indexOf(rr.STATUS) >= 0) {
          dirty.push(Object.assign({}, rr, { STATUS: 'INCLUIDO_RCO', RCO_REPORT_ID: reportId }));
        }
      });
      // batch: one write per dirty row without re-scan (row known)
      dirty.forEach(function (d) {
        for (var i = 0; i < db.RSD.rows.length; i++) {
          if (db.RSD.rows[i].REPORT_ID === d.REPORT_ID) { db.RSD.rows[i] = d; db.RSD.writes++; break; }
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
    mark('operacoes', function () {
      db.OPERACOES.loadIndex('REGISTRO_ID');
    });

    var ver = 1;
    if (db.RCO.rows.length) ver = opts.keepVersion ? Number(db.RCO.rows[0].VERSAO || 1) : Number(db.RCO.rows[0].VERSAO || 1) + 1;
    db.RCO.upsert('REPORT_ID', reportId, { REPORT_ID: reportId, VERSAO: ver, DATA_SERVICO: '2026-09-30', BATALHAO: 'BPTran', COMPANHIA: '1ª CPTran' });

    if (opts.partialStopAfter === 'producao') {
      return { totalMs: Date.now() - t0, marks: marks, ops: totals(db), db: db, partial: true };
    }

    draft = db.RCO_RASCUNHOS.rows[0];
    draft.P3_CONSOLIDADO = 'SIM'; draft.P3_CONSOLIDATE_INTEGRAL = 'SIM'; draft.P3_CONSOLIDATE_FP = fp;
    db.RCO_RASCUNHOS.upsert('RCO_REPORT_ID', reportId, draft);

    return { totalMs: Date.now() - t0, marks: marks, ops: totals(db), db: db, version: ver, fingerprint: fp };
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
    integrityOk: integrityOk,
    buildPkg: buildPkg,
    seedDb: seedDb,
    totals: totals,
    runLegacy: runLegacy,
    runOptimized: runOptimized,
    snapshotBusiness: snapshotBusiness
  };
});
