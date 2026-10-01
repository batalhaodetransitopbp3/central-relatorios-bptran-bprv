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

test('TEST_CPU_VS_SEM_CPU_FP: CPU e SEM_CPU têm FP diferentes', function () {
  const a = P.fingerprint(pkg, pkg.rco.reportId);
  const pkg2 = P.buildPkg({ guarnicoes: 4, prodRows: 150, vehRows: 10, semCpu: true });
  pkg2.rco.reportId = pkg.rco.reportId;
  pkg2.rco.rcoOrigens = pkg.rco.rcoOrigens;
  pkg2.estatisticaP3 = pkg.estatisticaP3;
  pkg2.operacoesCompletas = pkg.operacoesCompletas;
  assert.notStrictEqual(P.fingerprint(pkg2, pkg.rco.reportId), a, 'modo altera FP');
  assert.strictEqual(P.substantiveCanon(pkg, pkg.rco.reportId).modo, 'CPU');
  assert.strictEqual(P.substantiveCanon(pkg2, pkg.rco.reportId).modo, 'SEM_CPU');
});

test('TEST_POD_FP: alteração POD muda fingerprint', function () {
  const a = P.fingerprint(pkg, pkg.rco.reportId);
  const pkg2 = JSON.parse(JSON.stringify(pkg));
  pkg2.estatisticaP3.podExecucao = [{
    registroId: 'pod-1', guarnicao: 'BST 1', operacao: 'POD ALTERADA', turno: 'B',
    statusCumprimento: 'NAO_CUMPRIDO', localPrevisto: 'Y', localExecutado: 'Z', motivoAlteracao: 'chuva'
  }];
  assert.notStrictEqual(P.fingerprint(pkg2, pkg.rco.reportId), a);
});

test('TEST_OPERATIONS_FP: alteração operação muda fingerprint', function () {
  const a = P.fingerprint(pkg, pkg.rco.reportId);
  const pkg2 = JSON.parse(JSON.stringify(pkg));
  pkg2.operacoesCompletas = [{
    reportId: 'op-full-1', rsdReportId: 'rsd-1', guarnicao: 'BST 2', nome: 'Op B', turno: 'B', local: 'Local B'
  }];
  assert.notStrictEqual(P.fingerprint(pkg2, pkg.rco.reportId), a);
});

test('TEST_VEHICLE_FP: FIPE/classificação/situação mudam fingerprint', function () {
  const a = P.fingerprint(pkg, pkg.rco.reportId);
  const pkg2 = JSON.parse(JSON.stringify(pkg));
  pkg2.estatisticaP3.veiculos[0].valorFipe = 99999;
  assert.notStrictEqual(P.fingerprint(pkg2, pkg.rco.reportId), a);
  const pkg3 = JSON.parse(JSON.stringify(pkg));
  pkg3.estatisticaP3.veiculos[0].classificacaoP3 = 'APREENDIDO';
  assert.notStrictEqual(P.fingerprint(pkg3, pkg.rco.reportId), a);
  const pkg4 = JSON.parse(JSON.stringify(pkg));
  pkg4.estatisticaP3.veiculos[0].situacao = 'APREENDIDO';
  assert.notStrictEqual(P.fingerprint(pkg4, pkg.rco.reportId), a);
});

test('observações / consolidador / produção / quantidade / origens mudam FP', function () {
  const a = P.fingerprint(pkg, pkg.rco.reportId);
  const obs = JSON.parse(JSON.stringify(pkg)); obs.rco.observacoes = 'nova obs';
  assert.notStrictEqual(P.fingerprint(obs, pkg.rco.reportId), a);
  const cons = JSON.parse(JSON.stringify(pkg)); cons.rco.consolidacaoResponsavel.matricula = '99999';
  assert.notStrictEqual(P.fingerprint(cons, pkg.rco.reportId), a);
  const prod = JSON.parse(JSON.stringify(pkg)); prod.estatisticaP3.producao[0].quantidade = 999;
  assert.notStrictEqual(P.fingerprint(prod, pkg.rco.reportId), a);
  const orig = JSON.parse(JSON.stringify(pkg)); orig.rco.rcoOrigens.push({ rsdReportId: 'rsd-extra', serviceId: 'svc-x', guarnicao: 'BST X', status: 'DEFERIDO' });
  assert.notStrictEqual(P.fingerprint(orig, pkg.rco.reportId), a);
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

test('TEST_TIMEOUT_RETRY_DIRECT: segunda chamada após completa → idempotent', function () {
  const db = P.seedDb(pkg, { noiseRsd: 20 });
  const r1 = P.runOptimized(db, pkg);
  const writes1 = db.PRODUCAO.writes;
  const audit1 = db.AUDITORIA.rows.length;
  const ver1 = Number(db.RCO.rows[0].VERSAO);
  const r2 = P.runOptimized(db, pkg);
  assert.strictEqual(r2.idempotent, true);
  assert.strictEqual(db.PRODUCAO.writes, writes1, 'sem regravação PRODUCAO');
  assert.strictEqual(db.AUDITORIA.rows.length, audit1, 'sem nova auditoria');
  assert.strictEqual(Number(db.RCO.rows[0].VERSAO), ver1, 'sem bump versão');
  assert.ok(r1.version === 1 || r1.version >= 1);
});

test('TEST_TIMEOUT_RETRY_WITH_DRAFT_SYNC: consolidate → draft-upsert → retry', function () {
  const db = P.seedDb(pkg, { noiseRsd: 20 });
  const r1 = P.runOptimized(db, pkg);
  assert.ok(!r1.idempotent);
  const draft = db.RCO_RASCUNHOS.rows[0];
  assert.strictEqual(draft.P3_CONSOLIDATE_INTEGRAL, 'SIM');
  assert.ok(draft.P3_CONSOLIDATE_FP);
  assert.ok(draft.P3_CONSOLIDATE_DRAFT_FP);

  const writesProd = db.PRODUCAO.writes;
  const ver1 = Number(db.RCO.rows[0].VERSAO);
  const audit1 = db.AUDITORIA.rows.length;

  // Fluxo real pós-timeout: centralRcoSyncNow → rco-draft-upsert (mesmo conteúdo)
  const sync = P.draftUpsert(db, JSON.parse(JSON.stringify(pkg.rco)));
  assert.strictEqual(sync.consolidateMarkersKept, true, 'markers preservados no draft idêntico');
  assert.strictEqual(db.RCO_RASCUNHOS.rows[0].P3_CONSOLIDATE_INTEGRAL, 'SIM');
  assert.strictEqual(db.RCO_RASCUNHOS.rows[0].P3_CONSOLIDATE_FP, r1.fingerprint);
  assert.strictEqual(db.RCO_RASCUNHOS.rows[0].P3_CONSOLIDADO, 'SIM');

  const r2 = P.runOptimized(db, pkg);
  assert.strictEqual(r2.idempotent, true, 'retry idempotente após draft sync');
  assert.strictEqual(db.PRODUCAO.writes, writesProd, 'sem regravação estatística');
  assert.strictEqual(Number(db.RCO.rows[0].VERSAO), ver1);
  assert.strictEqual(db.AUDITORIA.rows.length, audit1);
});

test('TEST_SAME_DRAFT: draft idêntico preserva markers', function () {
  const db = P.seedDb(pkg, { noiseRsd: 5 });
  P.runOptimized(db, pkg);
  const fp = db.RCO_RASCUNHOS.rows[0].P3_CONSOLIDATE_FP;
  const dfp = db.RCO_RASCUNHOS.rows[0].P3_CONSOLIDATE_DRAFT_FP;
  const r = P.draftUpsert(db, JSON.parse(JSON.stringify(pkg.rco)));
  assert.strictEqual(r.consolidateMarkersKept, true);
  assert.strictEqual(db.RCO_RASCUNHOS.rows[0].P3_CONSOLIDATE_FP, fp);
  assert.strictEqual(db.RCO_RASCUNHOS.rows[0].P3_CONSOLIDATE_DRAFT_FP, dfp);
  assert.strictEqual(db.RCO_RASCUNHOS.rows[0].P3_CONSOLIDATE_INTEGRAL, 'SIM');
});

test('TEST_CHANGED_DRAFT: draft substantivo invalida e exige reconsolidação', function () {
  const db = P.seedDb(pkg, { noiseRsd: 5 });
  P.runOptimized(db, pkg);
  const changed = JSON.parse(JSON.stringify(pkg.rco));
  changed.observacoes = 'editado após consolidar';
  const r = P.draftUpsert(db, changed);
  assert.strictEqual(r.consolidateMarkersKept, false);
  assert.strictEqual(db.RCO_RASCUNHOS.rows[0].P3_CONSOLIDATE_INTEGRAL, 'NAO');
  assert.strictEqual(db.RCO_RASCUNHOS.rows[0].P3_CONSOLIDATE_FP, '');
  assert.strictEqual(db.RCO_RASCUNHOS.rows[0].P3_CONSOLIDADO, 'NAO');

  const pkg2 = JSON.parse(JSON.stringify(pkg));
  pkg2.rco = changed;
  const retry = P.runOptimized(db, pkg2);
  assert.ok(!retry.idempotent, 'reconsolidação legítima');
  assert.strictEqual(db.RCO_RASCUNHOS.rows[0].P3_CONSOLIDATE_INTEGRAL, 'SIM');
});

test('16/17 timeout parcial + retry converge sem duplicar', function () {
  const db = P.seedDb(pkg, { noiseRsd: 30 });
  const partial = P.runOptimized(db, pkg, { partialStopAfter: 'producao' });
  assert.strictEqual(partial.partial, true);
  assert.strictEqual(db.RCO_RASCUNHOS.rows[0].P3_CONSOLIDATE_INTEGRAL, 'NAO');
  const prodCount = db.PRODUCAO.countWhere('REPORT_ID', pkg.rco.reportId);
  assert.strictEqual(prodCount, pkg.estatisticaP3.producao.length);

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
  db.RCO_RASCUNHOS.rows[0].P3_CONSOLIDATE_DRAFT_FP = '';
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

test('TEST_DUPLICATE_POD_ID: REGISTRO_ID duplicado → uma linha (último estado)', function () {
  const p = P.buildPkg({ guarnicoes: 1, prodRows: 5, noiseRsd: 2 });
  p.estatisticaP3.podExecucao = [
    { registroId: 'pod-dup', guarnicao: 'BST 1', operacao: 'OLD', turno: 'A', statusCumprimento: 'PENDENTE' },
    { registroId: 'pod-dup', guarnicao: 'BST 1', operacao: 'NEW', turno: 'B', statusCumprimento: 'CUMPRIDO' }
  ];
  const db = P.seedDb(p, { noiseRsd: 2, noiseOps: 2, noisePris: 2 });
  P.runOptimized(db, p);
  const pods = db.POD.rows.filter(function (r) { return r.REGISTRO_ID === 'pod-dup'; });
  assert.strictEqual(pods.length, 1, 'uma única linha pela chave');
  assert.strictEqual(pods[0].OPERACAO, 'NEW');
  assert.strictEqual(pods[0].STATUS_CUMPRIMENTO, 'CUMPRIDO');
});

test('TEST_DUPLICATE_OPERATION_ID: REGISTRO_ID duplicado em OPERACOES → uma linha', function () {
  const p = P.buildPkg({ guarnicoes: 1, prodRows: 5, noiseRsd: 2 });
  p.operacoesCompletas = [
    { reportId: 'op-dup', nome: 'OLD', turno: 'A', guarnicao: 'BST 1', local: 'L1' },
    { reportId: 'op-dup', nome: 'NEW', turno: 'B', guarnicao: 'BST 1', local: 'L2' }
  ];
  const db = P.seedDb(p, { noiseRsd: 2, noiseOps: 2, noisePris: 2 });
  P.runOptimized(db, p);
  const ops = db.OPERACOES.rows.filter(function (r) { return r.REGISTRO_ID === 'op-dup'; });
  assert.strictEqual(ops.length, 1);
  assert.strictEqual(ops[0].OPERACAO, 'NEW');
});

test('19/20 GAS 10.8.37 helpers + guards + draft markers presentes', function () {
  const src = fs.readFileSync(path.join(__dirname, '..', 'apps_script_v10.gs'), 'utf8');
  assert.ok(src.indexOf("CENTRAL_V10_VERSION = '10.8.37'") >= 0);
  assert.ok(src.indexOf('function rcoLoadIndex_') >= 0);
  assert.ok(src.indexOf('function rcoAppendRows_') >= 0);
  assert.ok(src.indexOf('function rcoConsolidateFingerprint_') >= 0);
  assert.ok(src.indexOf('function rcoConsolidateSubstantiveCanon_') >= 0);
  assert.ok(src.indexOf('function rcoConsolidateDraftFingerprint_') >= 0);
  assert.ok(src.indexOf('function rcoConsolidateIntegrityOk_') >= 0);
  assert.ok(src.indexOf('P3_CONSOLIDATE_INTEGRAL') >= 0);
  assert.ok(src.indexOf('P3_CONSOLIDATE_DRAFT_FP') >= 0);
  assert.ok(src.indexOf('pendingAppendsByKey') >= 0);
  assert.ok(src.indexOf('trackedSheetReads') >= 0);
  assert.ok(src.indexOf('trackedSheetWrites') >= 0);
  assert.ok(src.indexOf('consolidateMarkersKept') >= 0);
  assert.ok(src.indexOf('resolveExistingOperationalDate_') >= 0);
  assert.ok(src.indexOf('keepVersion') >= 0);
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
  SHEETS_WRITES_AFTER: afterOps.sheetWrites,
  NOTE: 'Counters no GAS: trackedSheet* (path instrumentado); wall-clock por fase em perf.marks'
}));
console.log('\nPASSED', passed);
