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

const pkg = P.buildPkg({ guarnicoes: 4, prodRows: 150, vehRows: 10 });

test('TEST_CPU_VS_SEM_CPU_FP', function () {
  const a = P.fingerprint(pkg, pkg.rco.reportId);
  const pkg2 = JSON.parse(JSON.stringify(pkg));
  pkg2.rco.semGuarnicaoCpu = true;
  assert.notStrictEqual(P.fingerprint(pkg2, pkg.rco.reportId), a);
});

test('TEST_FP_FULL_WRITE_PROJECTION: campos persistidos alteram FP', function () {
  const base = P.fingerprint(pkg, pkg.rco.reportId);
  function mutate(fn) {
    const p = JSON.parse(JSON.stringify(pkg));
    fn(p);
    assert.notStrictEqual(P.fingerprint(p, pkg.rco.reportId), base, fn.name || 'mutate');
  }
  mutate(function marca(p) { p.estatisticaP3.veiculos[0].marca = 'FIAT'; });
  mutate(function modelo(p) { p.estatisticaP3.veiculos[0].modelo = 'UNO'; });
  mutate(function ano(p) { p.estatisticaP3.veiculos[0].ano = '2020'; });
  mutate(function placaUf(p) { p.estatisticaP3.veiculos[0].placaOriginalUf = 'PE'; });
  mutate(function houveCond(p) { p.estatisticaP3.veiculos[0].houveConduzidos = 'NAO'; });
  mutate(function podCoord(p) { p.estatisticaP3.podExecucao[0].coordenadasExecutadas = '-8,-35'; });
  mutate(function horaIni(p) { p.estatisticaP3.podExecucao[0].horaInicio = '10:00'; });
  mutate(function horaFim(p) { p.estatisticaP3.podExecucao[0].horaFim = '11:00'; });
  mutate(function houveAlt(p) { p.estatisticaP3.podExecucao[0].houveAlteracao = true; });
  mutate(function lat(p) { p.operacoesCompletas[0].local.latitude = '-8.0'; });
  mutate(function lng(p) { p.operacoesCompletas[0].local.longitude = '-35.0'; });
  mutate(function rsdOp(p) { p.operacoesCompletas[0].rsdReportId = 'rsd-99'; });
  mutate(function termino(p) { p.rco.periodo.termino = '2026-10-02'; });
  mutate(function horario(p) { p.rco.periodo.horario = '08:00-20:00'; });
  mutate(function origemRel(p) { p.estatisticaP3.producao[0].origemRelatorio = 'RSD'; });
  mutate(function origemId(p) { p.estatisticaP3.producao[0].origemRegistroId = 'alt-1'; });
  // Projeção contém os campos
  const proj = P.projectWrites(pkg, pkg.rco.reportId);
  assert.ok(proj.veiculos[0].MARCA);
  assert.ok(proj.pod[0].COORDENADAS_EXECUTADAS);
  assert.ok(proj.operacoes[0].LATITUDE);
  assert.ok(proj.rco.TERMINO);
  assert.ok(proj.rco.HORARIO_SERVICO);
});

test('TEST_POD_FP / OPERATIONS / VEHICLE', function () {
  const a = P.fingerprint(pkg, pkg.rco.reportId);
  const p1 = JSON.parse(JSON.stringify(pkg));
  p1.estatisticaP3.podExecucao[0].operacao = 'POD B';
  assert.notStrictEqual(P.fingerprint(p1, pkg.rco.reportId), a);
  const p2 = JSON.parse(JSON.stringify(pkg));
  p2.operacoesCompletas[0].nome = 'Op B';
  assert.notStrictEqual(P.fingerprint(p2, pkg.rco.reportId), a);
  const p3 = JSON.parse(JSON.stringify(pkg));
  p3.estatisticaP3.veiculos[0].valorFipe = 1;
  assert.notStrictEqual(P.fingerprint(p3, pkg.rco.reportId), a);
});

let benchA, benchB, benchC, beforeOps, afterOps, beforeMs, afterMs;

test('benchmark BEFORE vs AFTER (primeira consolidação PRODUCAO=0)', function () {
  const dbBefore = P.seedDb(pkg, { noiseRsd: 800, noisePris: 400, noiseOps: 500 });
  const leg = P.runLegacy(dbBefore, pkg);
  beforeOps = leg.ops; beforeMs = leg.totalMs;

  const dbAfter = P.seedDb(pkg, { noiseRsd: 800, noisePris: 400, noiseOps: 500 });
  const opt = P.runOptimized(dbAfter, pkg);
  afterOps = opt.ops; afterMs = opt.totalMs;
  benchA = {
    label: 'FIRST_CONSOLIDATION',
    nodeMs: afterMs,
    trackedWrites: afterOps.sheetWrites,
    scans: afterOps.sheetScans,
    deleteCalls: afterOps.deleteCalls,
    deleteRows: afterOps.deleteRows,
    legacyDeleteCalls: beforeOps.deleteCalls,
    note: 'PRODUCAO anterior=0'
  };
  console.log('    BENCH_A', JSON.stringify(benchA));
  console.log('    BEFORE writes', beforeOps.sheetWrites, 'deleteCalls', beforeOps.deleteCalls);
  console.log('    AFTER writes', afterOps.sheetWrites, 'deleteCalls', afterOps.deleteCalls);
  assert.ok(afterOps.sheetWrites < beforeOps.sheetWrites);
  assert.ok(afterOps.sheetScans < beforeOps.sheetScans);
});

test('BENCHMARK_RETRY_150_ROWS: PRODUCAO pré-existente contígua', function () {
  const db = P.seedDb(pkg, { noiseRsd: 20, noisePris: 5, noiseOps: 5, prefillProducao: 150 });
  assert.strictEqual(db.PRODUCAO.rows.filter(function (r) { return r.REPORT_ID === pkg.rco.reportId; }).length, 150);
  const t0 = Date.now();
  const r = P.runOptimized(db, pkg);
  const ms = Date.now() - t0;
  benchB = {
    label: 'RETRY_150_ROWS',
    nodeMs: ms,
    trackedWrites: r.ops.sheetWrites,
    scans: r.ops.sheetScans,
    deleteCalls: db.PRODUCAO.deleteCalls,
    deleteRows: db.PRODUCAO.deleteRowsCount,
    note: '150 linhas contíguas → 1 deleteRows (vs 150 deleteRow legado)'
  };
  console.log('    BENCH_B', JSON.stringify(benchB));
  assert.strictEqual(db.PRODUCAO.deleteCalls, 1, 'um bloco contíguo');
  assert.strictEqual(db.PRODUCAO.deleteRowsCount, 150);
  assert.strictEqual(db.PRODUCAO.countWhere('REPORT_ID', pkg.rco.reportId), 150);
});

test('BENCHMARK_RETIFICATION_150_ROWS', function () {
  const db = P.seedDb(pkg, { noiseRsd: 10, noisePris: 5, noiseOps: 5 });
  P.runOptimized(db, pkg);
  db.RCO_RASCUNHOS.rows[0].STATUS = 'EM_RETIFICACAO';
  db.RCO_RASCUNHOS.rows[0].P3_CONSOLIDADO = 'NAO';
  db.RCO_RASCUNHOS.rows[0].P3_CONSOLIDATE_INTEGRAL = 'NAO';
  db.RCO_RASCUNHOS.rows[0].P3_CONSOLIDATE_FP = '';
  db.RCO_RASCUNHOS.rows[0].P3_CONSOLIDATE_DRAFT_FP = '';
  db.PRODUCAO.deleteCalls = 0; db.PRODUCAO.deleteRowsCount = 0; db.PRODUCAO.writes = 0;
  const pkg2 = JSON.parse(JSON.stringify(pkg));
  pkg2.estatisticaP3.producao.push({ registroId: 'prod-extra', guarnicao: 'BST 1', grupoCodigo: 'GX', indicadorCodigo: 'IX', quantidade: 1 });
  const t0 = Date.now();
  const r = P.runOptimized(db, pkg2);
  benchC = {
    label: 'RETIFICATION_150_PLUS',
    nodeMs: Date.now() - t0,
    trackedWrites: r.ops.sheetWrites,
    scans: r.ops.sheetScans,
    deleteCalls: db.PRODUCAO.deleteCalls,
    deleteRows: db.PRODUCAO.deleteRowsCount
  };
  console.log('    BENCH_C', JSON.stringify(benchC));
  assert.strictEqual(db.PRODUCAO.deleteCalls, 1);
  assert.strictEqual(db.PRODUCAO.countWhere('REPORT_ID', pkg.rco.reportId), pkg2.estatisticaP3.producao.length);
});

test('TEST_DELETE_CONTIGUOUS', function () {
  const rows = [];
  for (var i = 0; i < 150; i++) rows.push(i + 2);
  const blocks = P.groupContiguous(rows);
  assert.strictEqual(blocks.length, 1);
  assert.strictEqual(blocks[0].count, 150);
  const sheet = new P.FakeSheet('T', ['REPORT_ID'], rows.map(function (_, i) { return { REPORT_ID: 'rco-bench-1', REGISTRO_ID: 'p' + i }; }));
  sheet.deleteWhereFast('REPORT_ID', 'rco-bench-1');
  assert.strictEqual(sheet.deleteCalls, 1);
  assert.strictEqual(sheet.rows.length, 0);
});

test('TEST_DELETE_INTERLEAVED', function () {
  const db = P.seedDb(pkg, { noiseRsd: 2, noiseOps: 2, noisePris: 2, interleaveProducao: 50 });
  const beforeOther = db.PRODUCAO.rows.filter(function (r) { return r.REPORT_ID === 'other-rco'; }).length;
  assert.strictEqual(beforeOther, 50);
  P.runOptimized(db, pkg);
  assert.strictEqual(db.PRODUCAO.rows.filter(function (r) { return r.REPORT_ID === 'other-rco'; }).length, 50, 'outro REPORT_ID intacto');
  assert.ok(db.PRODUCAO.deleteCalls >= 50, 'blocos intercalados ≥ 50');
  assert.ok(db.PRODUCAO.deleteCalls < 150, 'ainda agrupa menos que N×deleteRow se houver runs');
  assert.strictEqual(db.PRODUCAO.countWhere('REPORT_ID', pkg.rco.reportId), pkg.estatisticaP3.producao.length);
});

test('equivalência golden legado vs otimizado', function () {
  const dbL = P.seedDb(pkg, { noiseRsd: 50, noisePris: 20, noiseOps: 20 });
  P.runLegacy(dbL, pkg);
  const snapL = P.snapshotBusiness(dbL, pkg.rco.reportId);
  const dbO = P.seedDb(pkg, { noiseRsd: 50, noisePris: 20, noiseOps: 20 });
  P.runOptimized(dbO, pkg);
  const snapO = P.snapshotBusiness(dbO, pkg.rco.reportId);
  assert.deepStrictEqual(snapO.producao, snapL.producao);
  assert.deepStrictEqual(snapO.veiculos, snapL.veiculos);
  assert.deepStrictEqual(snapO.origens, snapL.origens);
  assert.strictEqual(snapO.integral, 'SIM');
});

test('TEST_DRAFT_CONSOLIDATE_RACE: draft enfileira enquanto consolidate segura lock', function () {
  const db = P.seedDb(pkg, { noiseRsd: 5, noisePris: 2, noiseOps: 2 });
  let draftDeferred = null;
  let sawMidIntegral = null;
  const r1 = P.runOptimized(db, pkg, {
    midFlightHook: function (dbHook) {
      sawMidIntegral = dbHook.RCO_RASCUNHOS.rows[0].P3_CONSOLIDATE_INTEGRAL;
      draftDeferred = P.draftUpsert(dbHook, JSON.parse(JSON.stringify(pkg.rco)));
      assert.strictEqual(draftDeferred.deferred, true, 'draft não interleave');
      assert.strictEqual(dbHook.RCO_RASCUNHOS.rows[0].REVISAO, 1, 'draft ainda não escreveu');
    }
  });
  assert.ok(!r1.idempotent);
  assert.strictEqual(sawMidIntegral, 'NAO');
  assert.ok(draftDeferred);
  assert.strictEqual(draftDeferred.deferred, false, 'waiter drenado após consolidate');
  assert.strictEqual(draftDeferred.result.consolidateMarkersKept, true);
  assert.strictEqual(db.RCO_RASCUNHOS.rows[0].P3_CONSOLIDATE_INTEGRAL, 'SIM');
  assert.strictEqual(db.RCO_RASCUNHOS.rows[0].P3_CONSOLIDATE_FP, r1.fingerprint);
  // Sem payload B + FP de A: payload e markers coerentes
  const payload = JSON.parse(db.RCO_RASCUNHOS.rows[0].PAYLOAD_JSON);
  assert.strictEqual(payload.reportId, pkg.rco.reportId);
  assert.strictEqual(P.draftFingerprint(payload, pkg.rco.reportId), db.RCO_RASCUNHOS.rows[0].P3_CONSOLIDATE_DRAFT_FP);
});

test('TEST_TIMEOUT_DRAFT_RETRY', function () {
  const db = P.seedDb(pkg, { noiseRsd: 20 });
  const r1 = P.runOptimized(db, pkg);
  const writesProd = db.PRODUCAO.writes;
  const ver1 = Number(db.RCO.rows[0].VERSAO);
  const audit1 = db.AUDITORIA.rows.length;
  const sync = P.draftUpsert(db, JSON.parse(JSON.stringify(pkg.rco)));
  assert.strictEqual(sync.consolidateMarkersKept, true);
  const r2 = P.runOptimized(db, pkg);
  assert.strictEqual(r2.idempotent, true);
  assert.strictEqual(db.PRODUCAO.writes, writesProd);
  assert.strictEqual(Number(db.RCO.rows[0].VERSAO), ver1);
  assert.strictEqual(db.AUDITORIA.rows.length, audit1);
});

test('TEST_SAME_DRAFT / TEST_CHANGED_DRAFT', function () {
  const db = P.seedDb(pkg, { noiseRsd: 5 });
  P.runOptimized(db, pkg);
  assert.strictEqual(P.draftUpsert(db, JSON.parse(JSON.stringify(pkg.rco))).consolidateMarkersKept, true);
  const changed = JSON.parse(JSON.stringify(pkg.rco));
  changed.observacoes = 'editado';
  const inv = P.draftUpsert(db, changed);
  assert.strictEqual(inv.consolidateMarkersKept, false);
  assert.strictEqual(db.RCO_RASCUNHOS.rows[0].P3_CONSOLIDATE_INTEGRAL, 'NAO');
  const pkg2 = JSON.parse(JSON.stringify(pkg));
  pkg2.rco = changed;
  assert.ok(!P.runOptimized(db, pkg2).idempotent);
});

test('retry direto idempotent', function () {
  const db = P.seedDb(pkg, { noiseRsd: 10 });
  P.runOptimized(db, pkg);
  const w = db.PRODUCAO.writes;
  assert.strictEqual(P.runOptimized(db, pkg).idempotent, true);
  assert.strictEqual(db.PRODUCAO.writes, w);
});

test('parcial + retry converge', function () {
  const db = P.seedDb(pkg, { noiseRsd: 10 });
  const partial = P.runOptimized(db, pkg, { partialStopAfter: 'producao' });
  assert.strictEqual(partial.partial, true);
  P.runOptimized(db, pkg, { keepVersion: true });
  assert.strictEqual(db.RCO_RASCUNHOS.rows[0].P3_CONSOLIDATE_INTEGRAL, 'SIM');
});

test('TEST_DUPLICATE_POD_ID / OPERATION_ID', function () {
  const p = P.buildPkg({ guarnicoes: 1, prodRows: 5, noiseRsd: 2 });
  p.estatisticaP3.podExecucao = [
    { registroId: 'pod-dup', operacao: 'OLD', turno: 'A', statusCumprimento: 'PENDENTE' },
    { registroId: 'pod-dup', operacao: 'NEW', turno: 'B', statusCumprimento: 'CUMPRIDO' }
  ];
  p.operacoesCompletas = [
    { reportId: 'op-dup', nome: 'OLD', turno: 'A' },
    { reportId: 'op-dup', nome: 'NEW', turno: 'B' }
  ];
  const db = P.seedDb(p, { noiseRsd: 2, noiseOps: 2, noisePris: 2 });
  P.runOptimized(db, p);
  assert.strictEqual(db.POD.rows.filter(function (r) { return r.REGISTRO_ID === 'pod-dup'; }).length, 1);
  // POD: incoming || old → segundo vence
  assert.strictEqual(db.POD.rows.filter(function (r) { return r.REGISTRO_ID === 'pod-dup'; })[0].OPERACAO, 'NEW');
  assert.strictEqual(db.OPERACOES.rows.filter(function (r) { return r.REGISTRO_ID === 'op-dup'; }).length, 1);
  // OPERACOES 10.8.36: existing || incoming → primeiro grava OLD e segundo não sobrescreve
  assert.strictEqual(db.OPERACOES.rows.filter(function (r) { return r.REGISTRO_ID === 'op-dup'; })[0].OPERACAO, 'OLD');
});

test('TEST_POD_EXISTING_FALLBACK_EQUIVALENCE', function () {
  const oldPod = {
    REGISTRO_ID: 'pod-1', REPORT_ID: 'pod-1', RCO_REPORT_ID: '',
    GUARNICAO: 'G OLD', OPERACAO: 'OP OLD', TURNO: 'T OLD', STATUS_CUMPRIMENTO: 'ST OLD',
    LOCAL_PREVISTO: 'PREV OLD', LOCAL_EXECUTADO: 'LOCAL ANTIGO', COORDENADAS_EXECUTADAS: 'COORD OLD',
    HORA_INICIO: '07:00', HORA_FIM: '08:00', MOTIVO_ALTERACAO: 'MOT OLD',
    ORIGEM_RELATORIO: 'RSD', ORIGEM_REGISTRO_ID: 'orig-old'
  };
  // incoming sem localExecutado / coords / horas / etc.
  const incoming = { registroId: 'pod-1', statusCumprimento: 'CUMPRIDO' };
  const merged = P.mergePodRow(oldPod, incoming, 'rco-bench-1', 'BPTran', '1ª CPTran', '2026-09-30');
  assert.strictEqual(merged.LOCAL_EXECUTADO, 'LOCAL ANTIGO');
  assert.strictEqual(merged.GUARNICAO, 'G OLD');
  assert.strictEqual(merged.OPERACAO, 'OP OLD');
  assert.strictEqual(merged.TURNO, 'T OLD');
  assert.strictEqual(merged.LOCAL_PREVISTO, 'PREV OLD');
  assert.strictEqual(merged.COORDENADAS_EXECUTADAS, 'COORD OLD');
  assert.strictEqual(merged.HORA_INICIO, '07:00');
  assert.strictEqual(merged.HORA_FIM, '08:00');
  assert.strictEqual(merged.MOTIVO_ALTERACAO, 'MOT OLD');
  assert.strictEqual(merged.ORIGEM_RELATORIO, 'RSD');
  assert.strictEqual(merged.ORIGEM_REGISTRO_ID, 'orig-old');
  assert.strictEqual(merged.STATUS_CUMPRIMENTO, 'CUMPRIDO'); // incoming vence quando presente
  assert.strictEqual(merged.RCO_REPORT_ID, 'rco-bench-1');
});

test('TEST_OPERATION_EXISTING_PRECEDENCE_EQUIVALENCE', function () {
  const existing = {
    REGISTRO_ID: 'op-full-1', REPORT_ID: 'op-full-1', RSD_REPORT_ID: 'rsd-KEEP',
    DATA: '2026-09-29', GUARNICAO_RESPONSAVEL: 'G KEEP', OPERACAO: 'OP KEEP',
    TURNO: 'T KEEP', LOCAL: 'LOC KEEP', LATITUDE: '-1', LONGITUDE: '-2', VERSAO_ORIGEM: 3
  };
  const incoming = {
    reportId: 'op-full-1', rsdReportId: 'rsd-NEW', guarnicao: 'G NEW', nome: 'OP NEW',
    turno: 'T NEW', local: { descricao: 'LOC NEW', latitude: '-9', longitude: '-9' }
  };
  const merged = P.mergeOpRow(existing, incoming, 'rco-bench-1', 'BPTran', '1ª CPTran', '2026-09-30');
  assert.strictEqual(merged.RSD_REPORT_ID, 'rsd-KEEP');
  assert.strictEqual(merged.GUARNICAO_RESPONSAVEL, 'G KEEP');
  assert.strictEqual(merged.OPERACAO, 'OP KEEP');
  assert.strictEqual(merged.TURNO, 'T KEEP');
  assert.strictEqual(merged.LOCAL, 'LOC KEEP');
  assert.strictEqual(merged.LATITUDE, '-1');
  assert.strictEqual(merged.LONGITUDE, '-2');
  assert.strictEqual(merged.DATA, '2026-09-29');
  assert.strictEqual(merged.VERSAO_ORIGEM, 3);
  assert.strictEqual(merged.STATUS_REGISTRO, 'CONSOLIDADO');
  assert.strictEqual(merged.RCO_REPORT_ID, 'rco-bench-1');
  assert.strictEqual(merged.BATALHAO, 'BPTran');
});

test('TEST_GOLDEN_EXISTING_POD / TEST_GOLDEN_EXISTING_OPERATIONS', function () {
  const p = P.buildPkg({ guarnicoes: 2, prodRows: 8, vehRows: 2 });
  p.estatisticaP3.podExecucao = [
    { registroId: 'pod-1', statusCumprimento: 'CUMPRIDO' } // sem LOCAL_EXECUTADO
  ];
  p.operacoesCompletas = [
    { reportId: 'op-full-1', nome: 'INCOMING_NAME', rsdReportId: 'rsd-incoming',
      local: { descricao: 'INCOMING_LOC', latitude: '99', longitude: '99' } }
  ];
  const existingPod = [{
    REGISTRO_ID: 'pod-1', REPORT_ID: 'pod-1', RCO_REPORT_ID: '',
    DATA: '2026-09-28', BATALHAO: 'BPTran', COMPANHIA: '1ª CPTran',
    GUARNICAO: 'G OLD', OPERACAO: 'OP OLD', TURNO: 'T OLD', STATUS_CUMPRIMENTO: 'PENDENTE',
    LOCAL_PREVISTO: 'PREV', LOCAL_EXECUTADO: 'LOCAL ANTIGO', COORDENADAS_EXECUTADAS: 'C-OLD',
    HORA_INICIO: '06:00', HORA_FIM: '07:00', HOUVE_ALTERACAO: 'SIM', MOTIVO_ALTERACAO: 'chuva',
    ORIGEM_RELATORIO: 'RSD', ORIGEM_REGISTRO_ID: 'pod-1'
  }];
  const existingOps = [{
    REGISTRO_ID: 'op-full-1', REPORT_ID: 'op-full-1', RCO_REPORT_ID: '', RSD_REPORT_ID: 'rsd-KEEP',
    DATA: '2026-09-28', BATALHAO: 'BPTran', COMPANHIA: '1ª CPTran',
    GUARNICAO_RESPONSAVEL: 'G KEEP', OPERACAO: 'OP KEEP', TURNO: 'T KEEP',
    LOCAL: 'LOC KEEP', LATITUDE: '-1.1', LONGITUDE: '-2.2',
    STATUS_REGISTRO: 'OPERACAO_FINALIZADA', VERSAO_ORIGEM: 4
  }];
  const dbL = P.seedDb(p, { noiseRsd: 5, noiseOps: 0, noisePris: 2, existingPod: existingPod, existingOps: existingOps });
  const dbO = P.seedDb(p, { noiseRsd: 5, noiseOps: 0, noisePris: 2, existingPod: existingPod, existingOps: existingOps });
  P.runLegacy(dbL, p);
  P.runOptimized(dbO, p);
  const snapL = P.snapshotPodOps(dbL, p.rco.reportId);
  const snapO = P.snapshotPodOps(dbO, p.rco.reportId);
  assert.deepStrictEqual(snapO.pod, snapL.pod, 'POD golden legacy===optimized');
  assert.deepStrictEqual(snapO.operacoes, snapL.operacoes, 'OPERACOES golden legacy===optimized');
  assert.strictEqual(snapO.pod[0].LOCAL_EXECUTADO, 'LOCAL ANTIGO');
  assert.strictEqual(snapO.operacoes[0].OPERACAO, 'OP KEEP');
  assert.strictEqual(snapO.operacoes[0].LATITUDE, '-1.1');
});

test('TEST_WRITE_ORDER_PRODUCAO / VEICULOS / ORIGENS', function () {
  const p = P.buildPkg({ guarnicoes: 3, prodRows: 5, vehRows: 3 });
  // Ordem não-alfabética
  p.estatisticaP3.producao = [
    { registroId: 'prod-z', guarnicao: 'BST 1', grupoCodigo: 'G', indicadorCodigo: 'I', quantidade: 1 },
    { registroId: 'prod-a', guarnicao: 'BST 1', grupoCodigo: 'G', indicadorCodigo: 'I', quantidade: 2 },
    { registroId: 'prod-m', guarnicao: 'BST 1', grupoCodigo: 'G', indicadorCodigo: 'I', quantidade: 3 }
  ];
  p.estatisticaP3.veiculos = [
    { registroId: 'veh-z', placaUf: 'ZZZ1PB', marca: 'A' },
    { registroId: 'veh-a', placaUf: 'AAA1PB', marca: 'B' }
  ];
  p.rco.rcoOrigens = [
    { rsdReportId: 'rsd-z', serviceId: 's1', guarnicao: 'BST 1', status: 'DEFERIDO' },
    { rsdReportId: 'rsd-a', serviceId: 's2', guarnicao: 'BST 2', status: 'DEFERIDO' }
  ];
  const writeProj = P.projectWrites(p, p.rco.reportId, { forWrite: true });
  assert.deepStrictEqual(writeProj.producao.map(function (r) { return r.REGISTRO_ID; }), ['prod-z', 'prod-a', 'prod-m']);
  assert.deepStrictEqual(writeProj.veiculos.map(function (r) { return r.REGISTRO_ID; }), ['veh-z', 'veh-a']);
  assert.deepStrictEqual(writeProj.origens.map(function (r) { return r.RSD_REPORT_ID; }), ['rsd-z', 'rsd-a']);
  const fpProj = P.projectWrites(p, p.rco.reportId, { forFingerprint: true });
  assert.deepStrictEqual(fpProj.producao.map(function (r) { return r.REGISTRO_ID; }), ['prod-a', 'prod-m', 'prod-z']);
  const db = P.seedDb(p, { noiseRsd: 2, noiseOps: 0, noisePris: 0 });
  // seed RSD for new origens
  db.RSD.rows.push(
    { REPORT_ID: 'rsd-z', STATUS: 'DEFERIDO', RCO_REPORT_ID: '', BATALHAO: 'BPTran', COMPANHIA: '1ª CPTran', DATA_SERVICO: '2026-09-30' },
    { REPORT_ID: 'rsd-a', STATUS: 'DEFERIDO', RCO_REPORT_ID: '', BATALHAO: 'BPTran', COMPANHIA: '1ª CPTran', DATA_SERVICO: '2026-09-30' }
  );
  P.runOptimized(db, p);
  const prodOrder = db.PRODUCAO.rows.filter(function (r) { return r.REPORT_ID === p.rco.reportId; }).map(function (r) { return r.REGISTRO_ID; });
  const vehOrder = db.VEICULOS.rows.filter(function (r) { return r.REPORT_ID === p.rco.reportId; }).map(function (r) { return r.REGISTRO_ID; });
  const origOrder = db.RCO_ORIGENS.rows.filter(function (r) { return r.RCO_REPORT_ID === p.rco.reportId; }).map(function (r) { return r.RSD_REPORT_ID; });
  assert.deepStrictEqual(prodOrder, ['prod-z', 'prod-a', 'prod-m']);
  assert.deepStrictEqual(vehOrder, ['veh-z', 'veh-a']);
  assert.deepStrictEqual(origOrder, ['rsd-z', 'rsd-a']);
});

test('GAS helpers + ScriptLock draft + write projection + deleteRows + merge legado', function () {
  const src = fs.readFileSync(path.join(__dirname, '..', 'apps_script_v10.gs'), 'utf8');
  assert.ok(src.indexOf("CENTRAL_V10_VERSION = '10.8.38'") >= 0 || src.indexOf("CENTRAL_V10_VERSION = '10.8.37'") >= 0);
  assert.ok(src.indexOf('function rcoConsolidateProjectWrites_') >= 0);
  assert.ok(src.indexOf('function rcoConsolidateMergePodRow_') >= 0);
  assert.ok(src.indexOf('function rcoConsolidateMergeOpRow_') >= 0);
  assert.ok(src.indexOf('sheet.deleteRows') >= 0);
  assert.ok(src.indexOf('pendingAppendsByKey') >= 0);
  assert.ok(src.indexOf('trackedDeleteCalls') >= 0);
  assert.ok(src.indexOf('Ordenação só no fingerprint') >= 0);
  const draftFn = src.slice(src.indexOf('function rcoDraftUpsert_'), src.indexOf('function rcoDraftList_'));
  assert.ok(draftFn.indexOf('LockService.getScriptLock()') >= 0);
  assert.ok(draftFn.indexOf('waitLock(20000)') >= 0);
  assert.ok(draftFn.indexOf('if(!old){createLock') < 0);
  assert.ok(src.indexOf('RETRY integrity check') >= 0 || src.indexOf('RETRY integrity') >= 0);
});

test('3/4 guarnições + force-open + foreign company', function () {
  const one = P.buildPkg({ guarnicoes: 1, prodRows: 10 });
  const many = P.buildPkg({ guarnicoes: 6, prodRows: 20 });
  const d1 = P.seedDb(one, { noiseRsd: 5 }); P.runOptimized(d1, one);
  const d2 = P.seedDb(many, { noiseRsd: 5 }); P.runOptimized(d2, many);
  assert.strictEqual(d1.RCO_ORIGENS.countWhere('RCO_REPORT_ID', one.rco.reportId), 1);
  assert.strictEqual(d2.RCO_ORIGENS.countWhere('RCO_REPORT_ID', many.rco.reportId), 6);
  const p = P.buildPkg({ guarnicoes: 2, prodRows: 5 });
  const db = P.seedDb(p, { forceOpen: true, noiseRsd: 20 });
  P.runOptimized(db, p);
  assert.strictEqual(db.RSD.rows.filter(function (r) { return r.BATALHAO === 'BPRv' && r.RCO_REPORT_ID; }).length, 0);
});

console.log('\nBENCH_SUMMARY', JSON.stringify({
  BENCHMARK_FIRST_CONSOLIDATION: benchA,
  BENCHMARK_RETRY_150_ROWS: benchB,
  BENCHMARK_RETIFICATION_150_ROWS: benchC,
  GANHO_WRITES_PCT: Math.round((1 - afterOps.sheetWrites / beforeOps.sheetWrites) * 100),
  NOTE: 'Node FakeSheet ≈ tracked*; wall-clock Sheets é maior (latência API)'
}));
console.log('\nPASSED', passed);
