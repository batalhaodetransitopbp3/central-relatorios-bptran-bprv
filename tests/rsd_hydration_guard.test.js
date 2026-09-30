#!/usr/bin/env node
/**
 * Testes simulados do hotfix de hidratação/sync do RSD (rodada 2).
 * Não grava na planilha P3.
 */
const assert = require('assert');
const hydration = require('../rsd_hydration_guard.js');
const structural = require('../rsd_structural_guard.js');

let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log('ok  ' + name);
  } catch (e) {
    failed++;
    console.error('FAIL ' + name);
    console.error('  ' + (e && e.stack || e));
  }
}

const intact = {
  reportId: 'sd-5be69bb5-5cb1-4137-b9d1-4ae35692b632',
  serviceId: 'svc-0d643a5c-e6f5-4b9c-94c7-d2099dd5fc46',
  segmento: 1,
  unidade: { batalhao: 'BPTran', companhia: '1ª CPTran' },
  servico: { data: '2026-09-30', operationalDate: '2026-09-30', serviceId: 'svc-0d643a5c-e6f5-4b9c-94c7-d2099dd5fc46', segmento: 1 },
  guarnicao: {
    nome: 'BST 03',
    tipo: 'BST',
    viatura: '0891, 0894',
    vtrPrincipal: '0891',
    responsavel: '1º SGT COSTA',
    matricula: '516.925-9',
    efetivo: '02'
  },
  producao: { abordagens: { pessoas: 4 } },
  ocorrencias: [{ id: 'oc-1' }],
  operacoes: [{ id: 'op-1' }]
};

const blank = {
  reportId: intact.reportId,
  serviceId: intact.serviceId,
  segmento: 1,
  unidade: { batalhao: 'BPTran', companhia: '1ª CPTran' },
  servico: { data: '2026-09-30', operationalDate: '2026-09-30', serviceId: intact.serviceId, segmento: 1 },
  guarnicao: { nome: '', tipo: '', viatura: '', vtrPrincipal: '', responsavel: '', matricula: '', efetivo: '', viaturas: [] },
  producao: { abordagens: { pessoas: 0 } },
  ocorrencias: [],
  operacoes: []
};

const sheetFb = {
  source: 'SHEET_READ_FALLBACK',
  nome: 'BST 03',
  tipo: 'BST',
  vtr: '0891',
  responsavel: '1º SGT COSTA',
  matricula: '516.925-9'
};

function makeScheduler(guard) {
  const sent = [];
  let timer = null;
  let retries = 0;
  return {
    sent,
    get retries() { return retries; },
    schedule(payload, delayMs) {
      if (!guard.canSync()) return { scheduled: false, state: guard.getState(), sync: guard.getSyncState() };
      clearTimeout(timer);
      timer = setTimeout(function () { sent.push(payload); }, delayMs || 8);
      return { scheduled: true, state: guard.getState() };
    },
    /** Simula autosave após CONFLICT: não deve reenviar. */
    afterConflictAttempt(payload) {
      retries++;
      return this.schedule(payload);
    },
    flush() {
      return new Promise(function (resolve) { setTimeout(resolve, 20); });
    },
    cancel() { clearTimeout(timer); }
  };
}

test('1. payload válido existente + formulário vazio antes de hydrate → sync não ocorre', function () {
  const g = hydration.create({ state: hydration.HYDRATION.UNRESOLVED });
  const sch = makeScheduler(g);
  assert.strictEqual(sch.schedule(blank).scheduled, false);
  g.markLoading();
  assert.strictEqual(g.canSync(), false);
});

test('A. cliente antigo sem knownDraftRevision → LEGACY_CLIENT_RELOAD_REQUIRED, nuvem intacta', function () {
  const missing = structural.assertDraftRevision({ DRAFT_REVISION: 10 }, 0, { revisionPresent: false });
  assert.strictEqual(missing.ok, false);
  assert.strictEqual(missing.reason, 'LEGACY_CLIENT_RELOAD_REQUIRED');
  assert.strictEqual(structural.knownDraftRevisionPresent({}, {}), false);
  assert.strictEqual(structural.knownDraftRevisionPresent({ knownDraftRevision: 10 }, {}), true);
  const g = hydration.create({ state: hydration.HYDRATION.HYDRATED });
  g.markHydrated(10);
  const code = g.applySyncFailure('LEGACY_CLIENT_RELOAD_REQUIRED: Esta página está usando uma versão anterior');
  assert.strictEqual(code, 'LEGACY_CLIENT_RELOAD_REQUIRED');
  assert.strictEqual(g.getSyncState(), 'LEGACY_CLIENT');
  assert.strictEqual(g.canSync(), false);
  const sch = makeScheduler(g);
  assert.strictEqual(sch.afterConflictAttempt(blank).scheduled, false);
  assert.strictEqual(sch.afterConflictAttempt(blank).scheduled, false);
  assert.strictEqual(g.getHydrationState(), 'HYDRATED');
});

test('B. cliente novo stale rev 11 / known 10 → CONFLICT, revisão preservada, local ok', function () {
  const stale = structural.assertDraftRevision({ DRAFT_REVISION: 11 }, 10, { revisionPresent: true });
  assert.strictEqual(stale.ok, false);
  assert.strictEqual(stale.reason, 'STALE_REVISION');
  const g = hydration.create();
  g.markHydrated(10);
  assert.strictEqual(g.canLocalAutosave(), true);
  g.applySyncFailure('STALE_REVISION: revisão 10 < 11');
  assert.strictEqual(g.getSyncState(), 'CONFLICT');
  assert.strictEqual(g.getHydrationState(), 'HYDRATED');
  assert.strictEqual(g.canLocalAutosave(), true);
  assert.strictEqual(g.canSync(), false);
  const sch = makeScheduler(g);
  assert.strictEqual(sch.schedule(intact).scheduled, false);
  assert.strictEqual(sch.afterConflictAttempt(intact).scheduled, false);
});

test('C. RSD danificado → DEGRADED; local ok; cloud bloqueado', function () {
  assert.strictEqual(hydration.isDegradedPayload(blank, sheetFb), true);
  assert.strictEqual(hydration.isDegradedPayload(intact, sheetFb), false);
  const g = hydration.create();
  g.markLoading();
  g.markDegraded(22, sheetFb);
  assert.strictEqual(g.getHydrationState(), 'DEGRADED');
  assert.strictEqual(g.canLocalAutosave(), true);
  assert.strictEqual(g.canSync(), false);
  assert.ok(g.getSheetFallback().source === 'SHEET_READ_FALLBACK' || g.getSheetFallback().nome === 'BST 03');
});

test('D. RSD íntegro → HYDRATED; operação normal', function () {
  const g = hydration.create();
  g.markLoading();
  g.markHydrated(5);
  assert.strictEqual(g.getHydrationState(), 'HYDRATED');
  assert.strictEqual(g.canSync(), true);
  assert.strictEqual(g.canLocalAutosave(), true);
  g.markSyncOk(6);
  assert.strictEqual(g.getSyncState(), 'OK');
  assert.strictEqual(g.getKnownDraftRevision(), 6);
});

test('E. offline depois de HYDRATED → local salva; HYDRATED permanece; sync OFFLINE', function () {
  const g = hydration.create();
  g.markHydrated(3);
  g.markSyncOffline();
  assert.strictEqual(g.getHydrationState(), 'HYDRATED');
  assert.strictEqual(g.getSyncState(), 'OFFLINE');
  assert.strictEqual(g.canLocalAutosave(), true);
  assert.strictEqual(g.canSync(), false);
  assert.strictEqual(g.hasPendingLocal(), true);
});

test('F. retorno da internet → não merge cego; sync só se revisão corresponder', function () {
  const g = hydration.create();
  g.markHydrated(10);
  g.markSyncOffline();
  // Ainda known=10; se servidor estiver em 11, assert falha
  const match = structural.assertDraftRevision({ DRAFT_REVISION: 10 }, 10, { revisionPresent: true });
  const mismatch = structural.assertDraftRevision({ DRAFT_REVISION: 11 }, 10, { revisionPresent: true });
  assert.strictEqual(match.ok, true);
  assert.strictEqual(mismatch.ok, false);
  g.clearCloudSuspension();
  g.markSyncIdle();
  assert.strictEqual(g.canSync(), true);
});

test('G. BST 03 vs BST 3 → mesma identidade', function () {
  const next = JSON.parse(JSON.stringify(intact));
  next.guarnicao.nome = 'BST 3';
  assert.strictEqual(structural.detectStructuralRegression(intact, next).length, 0);
  next.guarnicao.nome = 'bst 03';
  assert.strictEqual(structural.detectStructuralRegression(intact, next).length, 0);
  assert.strictEqual(structural.normalizeGuarnicaoNome('BST 3', 'BST'), 'BST 03');
  assert.strictEqual(structural.normMat('5169259'), '516.925-9');
  assert.strictEqual(structural.normMat('516.925-9'), '516.925-9');
  // Regra oficial do sistema: prefixo preserva dígitos (0891 ≠ 891)
  assert.notStrictEqual(structural.primaryVtr('0891'), structural.primaryVtr('891'));
});

test('H. dois RSDs independentes simultâneos → não misturar', function () {
  const a = hydration.create();
  const b = hydration.create();
  a.markHydrated(4);
  b.markHydrated(9);
  a.applySyncFailure('STALE_REVISION: x');
  assert.strictEqual(a.getSyncState(), 'CONFLICT');
  assert.strictEqual(b.getSyncState(), 'IDLE');
  assert.strictEqual(b.canSync(), true);
  assert.strictEqual(a.getKnownDraftRevision(), 4);
  assert.strictEqual(b.getKnownDraftRevision(), 9);
});

test('I. vinte RSDs concorrentes — métrica de ScriptLock serializado', function () {
  // Simulação: região crítica ≈ load+save+upsert (Drive no pior caso).
  // ScriptLock global serializa; waitLock(15000).
  const criticalMsPerRsd = 250; // estimativa conservadora com Drive
  const n = 20;
  const serialized = n * criticalMsPerRsd;
  const waitCap = 15000;
  assert.ok(serialized < waitCap * 2, 'carga serializada elevada: ' + serialized + 'ms');
  const waits = [];
  for (let i = 0; i < n; i++) waits.push(i * criticalMsPerRsd);
  const maxWait = Math.max.apply(null, waits);
  console.log('    lock-sim: n=20 critical≈' + criticalMsPerRsd + 'ms maxWait≈' + maxWait + 'ms waitCap=' + waitCap + 'ms timeoutRisk=' + (maxWait > waitCap));
  assert.ok(maxWait <= waitCap || maxWait - waitCap < criticalMsPerRsd * 5, 'risco de timeout em cauda longa');
});

test('J. linha/payload após save — invariantes estruturais', function () {
  const ok = structural.assertLinePayloadCoherence(
    { GUARNICAO: 'BST 03', VTR_PRINCIPAL: '0891' },
    intact
  );
  assert.strictEqual(ok.ok, true);
  const bad = structural.assertLinePayloadCoherence(
    { GUARNICAO: 'BST 03', VTR_PRINCIPAL: '0891' },
    blank
  );
  assert.strictEqual(bad.ok, false);
  assert.strictEqual(bad.reason, 'LINE_PAYLOAD_DIVERGENCE');
});

test('K. Fisco/módulo + STALE_REVISION → não navegar silenciosamente', function () {
  const g = hydration.create();
  g.markHydrated(10);
  g.applySyncFailure('STALE_REVISION: 10 < 11');
  const last = { ok: false, reason: 'STALE_REVISION', message: g.syncMessage() };
  const blocking = /LEGACY_CLIENT_RELOAD_REQUIRED|STALE_REVISION|CONFLICT/i.test(String(last.reason || ''));
  const syncSt = g.getSyncState();
  const allowNavigate = !(blocking || syncSt === 'CONFLICT' || syncSt === 'LEGACY_CLIENT');
  assert.strictEqual(allowNavigate, false);
});

test('payload BST 03 existente + incoming blank → backend rejeita', function () {
  const regressions = structural.detectStructuralRegression(intact, blank);
  assert.ok(regressions.some(function (x) { return x.field === 'nome'; }));
});

test('campo operacional legítimo atualizado mantendo identidade → salva', function () {
  const updated = JSON.parse(JSON.stringify(intact));
  updated.producao.abordagens.pessoas = 9;
  assert.strictEqual(structural.detectStructuralRegression(intact, updated).length, 0);
});

test('debounce de 8s não autoriza UNRESOLVED/LOADING/ERROR/DEGRADED', function () {
  ['UNRESOLVED', 'LOADING', 'ERROR', 'DEGRADED'].forEach(function (st) {
    assert.strictEqual(hydration.canScheduleCloudSync(st, 'IDLE'), false, st);
  });
  assert.strictEqual(hydration.canScheduleCloudSync('HYDRATED', 'IDLE'), true);
  assert.strictEqual(hydration.canScheduleCloudSync('HYDRATED', 'CONFLICT'), false);
  assert.strictEqual(hydration.canScheduleCloudSync('HYDRATED', 'LEGACY_CLIENT'), false);
  assert.strictEqual(hydration.canScheduleCloudSync('HYDRATED', 'OFFLINE'), false);
});

test('autosave local permitido em DEGRADED e HYDRATED; bloqueado em LOADING/ERROR', function () {
  assert.strictEqual(hydration.canLocalAutosave('DEGRADED'), true);
  assert.strictEqual(hydration.canLocalAutosave('HYDRATED'), true);
  assert.strictEqual(hydration.canLocalAutosave('LOADING'), false);
  assert.strictEqual(hydration.canLocalAutosave('ERROR'), false);
});

test('falha de rede NÃO vira erro de hidratação', function () {
  const g = hydration.create();
  g.markHydrated(7);
  g.markSyncFailed('Tempo esgotado');
  assert.strictEqual(g.getHydrationState(), 'HYDRATED');
  assert.strictEqual(g.getSyncState(), 'FAILED');
  assert.strictEqual(g.canLocalAutosave(), true);
});

test('DRAFT_REVISION=0 sem campo de revisão → permitido (documentado)', function () {
  // RSD ainda sem revisão (pré-versionamento ou linha recém-criada sem draft sync).
  const r = structural.assertDraftRevision({ DRAFT_REVISION: 0 }, 0, { revisionPresent: false });
  assert.strictEqual(r.ok, true);
});

(async function () {
  const g = hydration.create();
  const sch = makeScheduler(g);
  g.markLoading();
  sch.schedule(blank, 8);
  await sch.flush();
  test('nenhum payload é enviado enquanto LOADING mesmo após o timer', function () {
    assert.strictEqual(sch.sent.length, 0);
  });
  g.markHydrated(1);
  sch.schedule(intact, 8);
  await sch.flush();
  test('após HYDRATED o debounce pode enviar', function () {
    assert.strictEqual(sch.sent.length, 1);
  });

  // refreshRsd gate
  test('refreshRsd UNRESOLVED/LOADING/ERROR → zero cloud; HYDRATED → permitido', function () {
    const states = {
      UNRESOLVED: hydration.create({ state: 'UNRESOLVED' }),
      LOADING: (function () { const x = hydration.create(); x.markLoading(); return x; })(),
      ERROR: (function () { const x = hydration.create(); x.markError(); return x; })(),
      HYDRATED: (function () { const x = hydration.create(); x.markHydrated(1); return x; })()
    };
    assert.strictEqual(states.UNRESOLVED.canSync(), false);
    assert.strictEqual(states.LOADING.canSync(), false);
    assert.strictEqual(states.ERROR.canSync(), false);
    assert.strictEqual(states.HYDRATED.canSync(), true);
  });

  if (failed) {
    console.error('\n' + failed + ' teste(s) falharam.');
    process.exit(1);
  }
  console.log('\nTodos os testes simulados passaram.');
})().catch(function (e) {
  console.error(e);
  process.exit(1);
});
