'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const P = require('../rco_consolidate_perf.js');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('OK', name);
}

const pkg = P.buildPkg({ guarnicoes: 4, prodRows: 150, vehRows: 10, noiseRsd: 800, noisePris: 400, noiseOps: 500 });

test('1/2 CPU e P3 sem CPU: pacote e fingerprint estáveis', function () {
  const a = P.fingerprint(pkg, pkg.rco.reportId);
  const pkg2 = P.buildPkg({ guarnicoes: 4, prodRows: 150, vehRows: 10, semCpu: true });
  pkg2.rco.reportId = pkg.rco.reportId;
  pkg2.rco.rcoOrigens = pkg.rco.rcoOrigens;
  pkg2.estatisticaP3 = pkg.estatisticaP3;
  assert.strictEqual(P.fingerprint(pkg2, pkg.rco.reportId), a);
  assert.ok(pkg.rco.rcoOrigens.length >= 1);
});

let beforeOps, afterOps, beforeMs, afterMs, beforeMarks, afterMarks;

test('benchmark BEFORE (legado N+1) vs AFTER (batch/index)', function () {
  const dbBefore = P.seedDb(pkg, { noiseRsd: 800, noisePris: 400, noiseOps: 500 });
  const leg = P.runLegacy(dbBefore, pkg);
  beforeOps = leg.ops; beforeMs = leg.totalMs; beforeMarks = leg.marks;

  const dbAfter = P.seedDb(pkg, { noiseRsd: 800, noisePris: 400, noiseOps: 500 });
  const opt = P.runOptimized(dbAfter, pkg);
  afterOps = opt.ops; afterMs = opt.totalMs; afterMarks = opt.marks;

  console.log('    BEFORE_TOTAL_MS', beforeMs, 'reads', beforeOps.sheetReads, 'writes', beforeOps.sheetWrites, 'scans', beforeOps.sheetScans);
  console.log('    AFTER_TOTAL_MS', afterMs, 'reads', afterOps.sheetReads, 'writes', afterOps.sheetWrites, 'scans', afterOps.sheetScans);
  console.log('    TIMINGS_BEFORE', JSON.stringify(beforeMarks));
  console.log('    TIMINGS_AFTER', JSON.stringify(afterMarks));
  assert.ok(afterOps.sheetWrites < beforeOps.sheetWrites, 'menos writes');
  assert.ok(afterOps.sheetScans < beforeOps.sheetScans, 'menos scans');
  // PRODUCAO: legado = 1 scan + N deletes + N appends; novo = 1 scan + N deletes + 1 append batch
  assert.ok(afterOps.sheetWrites <= beforeOps.sheetWrites - 100, 'redução ampla de writes (append batch)');
});

test('equivalência golden negócio legado vs otimizado', function () {
  const dbL = P.seedDb(pkg, { noiseRsd: 50, noisePris: 20, noiseOps: 20 });
  P.runLegacy(dbL, pkg);
  const snapL = P.snapshotBusiness(dbL, pkg.rco.reportId);

  const dbO = P.seedDb(pkg, { noiseRsd: 50, noisePris: 20, noiseOps: 20 });
  P.runOptimized(dbO, pkg);
  const snapO = P.snapshotBusiness(dbO, pkg.rco.reportId);

  assert.deepStrictEqual(snapO.producao, snapL.producao);
  assert.deepStrictEqual(snapO.veiculos, snapL.veiculos);
  assert.deepStrictEqual(snapO.origens, snapL.origens);
  assert.deepStrictEqual(snapO.rsdLinks, snapL.rsdLinks);
  assert.strictEqual(snapO.integral, 'SIM');
});

test('3/4 uma e várias guarnições', function () {
  const one = P.buildPkg({ guarnicoes: 1, prodRows: 20, noiseRsd: 10 });
  const many = P.buildPkg({ guarnicoes: 6, prodRows: 40, noiseRsd: 10 });
  const d1 = P.seedDb(one); P.runOptimized(d1, one);
  const d2 = P.seedDb(many); P.runOptimized(d2, many);
  assert.strictEqual(d1.RCO_ORIGENS.countWhere('RCO_REPORT_ID', one.rco.reportId), 1);
  assert.strictEqual(d2.RCO_ORIGENS.countWhere('RCO_REPORT_ID', many.rco.reportId), 6);
});

test('5/6/8 AGUARDANDO_ANALISE / EM_SERVICO force-open seed', function () {
  const p = P.buildPkg({ guarnicoes: 2, prodRows: 10, noiseRsd: 5 });
  const db = P.seedDb(p, { forceOpen: true });
  assert.strictEqual(db.RSD.rows[0].STATUS, 'EM_SERVICO');
  P.runOptimized(db, p);
  assert.ok(db.RSD.rows.some(function (r) { return r.RCO_REPORT_ID === p.rco.reportId; }));
});

test('15 segunda chamada após completa → idempotent', function () {
  const db = P.seedDb(pkg, { noiseRsd: 20 });
  const r1 = P.runOptimized(db, pkg);
  const writes1 = db.PRODUCAO.writes;
  const r2 = P.runOptimized(db, pkg);
  assert.strictEqual(r2.idempotent, true);
  assert.strictEqual(db.PRODUCAO.writes, writes1, 'sem regravação PRODUCAO');
  assert.ok(r1.version === 1 || r1.version >= 1);
});

test('16/17 timeout parcial + retry converge sem duplicar', function () {
  const db = P.seedDb(pkg, { noiseRsd: 30 });
  const partial = P.runOptimized(db, pkg, { partialStopAfter: 'producao' });
  assert.strictEqual(partial.partial, true);
  assert.strictEqual(db.RCO_RASCUNHOS.rows[0].P3_CONSOLIDATE_INTEGRAL, 'NAO');
  const prodCount = db.PRODUCAO.countWhere('REPORT_ID', pkg.rco.reportId);
  assert.strictEqual(prodCount, pkg.estatisticaP3.producao.length);

  // retry: keepVersion path simulado — não duplica PRODUCAO
  const retry = P.runOptimized(db, pkg, { keepVersion: true });
  assert.ok(!retry.partial);
  assert.strictEqual(db.PRODUCAO.countWhere('REPORT_ID', pkg.rco.reportId), pkg.estatisticaP3.producao.length);
  assert.strictEqual(db.RCO_RASCUNHOS.rows[0].P3_CONSOLIDATE_INTEGRAL, 'SIM');
  assert.ok(P.integrityOk(db, pkg.rco.reportId, pkg));
});

test('14 retificação: FP zera e reconsolida', function () {
  const db = P.seedDb(pkg, { noiseRsd: 10 });
  P.runOptimized(db, pkg);
  db.RCO_RASCUNHOS.rows[0].STATUS = 'EM_RETIFICACAO';
  db.RCO_RASCUNHOS.rows[0].P3_CONSOLIDADO = 'NAO';
  db.RCO_RASCUNHOS.rows[0].P3_CONSOLIDATE_INTEGRAL = 'NAO';
  db.RCO_RASCUNHOS.rows[0].P3_CONSOLIDATE_FP = '';
  const pkg2 = JSON.parse(JSON.stringify(pkg));
  pkg2.estatisticaP3.producao.push({ registroId: 'prod-extra', guarnicao: 'BST 1', grupoCodigo: 'GX', indicadorCodigo: 'IX', quantidade: 1 });
  P.runOptimized(db, pkg2);
  assert.strictEqual(db.PRODUCAO.countWhere('REPORT_ID', pkg.rco.reportId), pkg2.estatisticaP3.producao.length);
});

test('18 outra companhia intocada', function () {
  const db = P.seedDb(pkg, { noiseRsd: 100 });
  const foreignBefore = db.RSD.rows.filter(function (r) { return r.BATALHAO === 'BPRv'; }).length;
  P.runOptimized(db, pkg);
  const foreignAfter = db.RSD.rows.filter(function (r) { return r.BATALHAO === 'BPRv' && r.RCO_REPORT_ID; }).length;
  assert.strictEqual(foreignBefore > 0, true);
  assert.strictEqual(foreignAfter, 0);
});

test('19/20 GAS 10.8.37 helpers + guards presentes', function () {
  const src = fs.readFileSync(path.join(__dirname, '..', 'apps_script_v10.gs'), 'utf8');
  assert.ok(src.indexOf("CENTRAL_V10_VERSION = '10.8.37'") >= 0);
  assert.ok(src.indexOf('function rcoLoadIndex_') >= 0);
  assert.ok(src.indexOf('function rcoAppendRows_') >= 0);
  assert.ok(src.indexOf('function rcoConsolidateFingerprint_') >= 0);
  assert.ok(src.indexOf('function rcoConsolidateIntegrityOk_') >= 0);
  assert.ok(src.indexOf('P3_CONSOLIDATE_INTEGRAL') >= 0);
  assert.ok(src.indexOf('resolveExistingOperationalDate_') >= 0);
  assert.ok(src.indexOf('keepVersion') >= 0);
  // upsert_ global ainda existe para outros módulos
  assert.ok(src.indexOf('function upsert_') >= 0);
});

test('idempotência não short-circuita só com P3_CONSOLIDADO + 1 linha', function () {
  const db = P.seedDb(pkg, { noiseRsd: 5 });
  db.RCO_RASCUNHOS.rows[0].P3_CONSOLIDADO = 'SIM';
  db.RCO_RASCUNHOS.rows[0].P3_CONSOLIDATE_INTEGRAL = 'NAO';
  db.RCO_RASCUNHOS.rows[0].P3_CONSOLIDATE_FP = P.fingerprint(pkg, pkg.rco.reportId);
  db.PRODUCAO.append({ REGISTRO_ID: 'only-one', REPORT_ID: pkg.rco.reportId });
  const r = P.runOptimized(db, pkg);
  assert.ok(!r.idempotent, 'parcial não é short-circuit');
  assert.strictEqual(db.PRODUCAO.countWhere('REPORT_ID', pkg.rco.reportId), pkg.estatisticaP3.producao.length);
});

console.log('\nBENCH_SUMMARY', JSON.stringify({
  BEFORE_TOTAL_MS: beforeMs,
  AFTER_TOTAL_MS: afterMs,
  GANHO_WRITES_PCT: Math.round((1 - afterOps.sheetWrites / beforeOps.sheetWrites) * 100),
  GANHO_SCANS_PCT: Math.round((1 - afterOps.sheetScans / beforeOps.sheetScans) * 100),
  SHEETS_READS_BEFORE: beforeOps.sheetReads,
  SHEETS_READS_AFTER: afterOps.sheetReads,
  SHEETS_WRITES_BEFORE: beforeOps.sheetWrites,
  SHEETS_WRITES_AFTER: afterOps.sheetWrites
}));
console.log('\nPASSED', passed);
