#!/usr/bin/env node
/**
 * Testes simulados do hotfix de hidratação/guarda estrutural do RSD.
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

function makeScheduler(guard) {
  const sent = [];
  let timer = null;
  return {
    sent,
    schedule(payload, delayMs) {
      if (!guard.canSync()) return { scheduled: false, state: guard.getState() };
      clearTimeout(timer);
      timer = setTimeout(function () { sent.push(payload); }, delayMs || 8);
      return { scheduled: true, state: guard.getState() };
    },
    flush() {
      return new Promise(function (resolve) { setTimeout(resolve, 20); });
    },
    cancel() { clearTimeout(timer); }
  };
}

test('1. payload válido existente + formulário vazio antes de hydrate → sync não ocorre', function () {
  const g = hydration.create({ state: hydration.STATES.UNRESOLVED });
  const sch = makeScheduler(g);
  const r = sch.schedule(blank);
  assert.strictEqual(r.scheduled, false);
  assert.strictEqual(g.getState(), 'UNRESOLVED');
  g.markLoading();
  assert.strictEqual(g.canSync(), false);
  assert.strictEqual(sch.schedule(blank).scheduled, false);
});

test('2. rsd-get demora 20s → nenhum sync durante espera', function () {
  const g = hydration.create();
  const sch = makeScheduler(g);
  g.markLoading();
  for (let t = 0; t <= 20000; t += 8000) {
    assert.strictEqual(sch.schedule(blank, 8000).scheduled, false, 't=' + t);
  }
  assert.strictEqual(sch.sent.length, 0);
});

test('3. rsd-get falha → nenhum sync', function () {
  const g = hydration.create();
  g.markLoading();
  g.markError();
  assert.strictEqual(g.canSync(), false);
  assert.ok(/proteger os dados/i.test(g.errorMessage()));
});

test('4. payload BST 03 existente + incoming blank → backend rejeita', function () {
  const regressions = structural.detectStructuralRegression(intact, blank);
  const fields = regressions.map(function (x) { return x.field; });
  assert.ok(fields.indexOf('nome') >= 0);
  assert.ok(fields.indexOf('tipo') >= 0);
  assert.ok(fields.indexOf('vtr') >= 0);
  assert.ok(fields.indexOf('responsavel') >= 0);
  assert.ok(fields.indexOf('matricula') >= 0);
  assert.ok(fields.indexOf('efetivo') >= 0);
});

test('5. campo operacional legítimo atualizado mantendo identidade → salva', function () {
  const updated = JSON.parse(JSON.stringify(intact));
  updated.producao.abordagens.pessoas = 9;
  updated.ocorrencias.push({ id: 'oc-2' });
  const regressions = structural.detectStructuralRegression(intact, updated);
  assert.strictEqual(regressions.length, 0);
});

test('6. conteúdo operacional posterior não é apagado quando a identidade permanece', function () {
  const updated = JSON.parse(JSON.stringify(intact));
  updated.observacoes = 'lançamento posterior';
  assert.strictEqual(structural.detectStructuralRegression(intact, updated).length, 0);
  const fp = structural.operationalFingerprint(updated);
  assert.ok(fp.productionSum >= 4);
  assert.ok(fp.occurrences >= 1);
  assert.ok(fp.operations >= 1);
});

test('7. novo serviço consegue agendar sync após cadastro (HYDRATED/NEW_SERVICE)', function () {
  const g = hydration.create();
  g.markNewService();
  assert.strictEqual(g.canSync(), true);
  g.markHydrated(1);
  assert.strictEqual(g.canSync(), true);
  assert.strictEqual(g.getKnownDraftRevision(), 1);
});

test('8. continuidade hidrata e depois permite sync', function () {
  const g = hydration.create({ state: hydration.STATES.UNRESOLVED });
  assert.strictEqual(g.canSync(), false);
  g.markLoading();
  const gaps = hydration.identityGaps(intact, {
    nome: 'BST 03',
    tipo: 'BST',
    vtr: '0891',
    responsavel: '1º SGT COSTA',
    matricula: '516.925-9',
    data: '2026-09-30',
    batalhao: 'BPTran',
    companhia: '1ª CPTran',
    efetivo: '02'
  });
  assert.deepStrictEqual(gaps, []);
  g.markHydrated(22);
  assert.strictEqual(g.canSync(), true);
});

test('9. dois aparelhos / revisão inferior não sobrescreve revisão superior', function () {
  const stale = structural.assertDraftRevision({ DRAFT_REVISION: 22 }, 21);
  assert.strictEqual(stale.ok, false);
  assert.strictEqual(stale.reason, 'STALE_REVISION');
  const current = structural.assertDraftRevision({ DRAFT_REVISION: 22 }, 22);
  assert.strictEqual(current.ok, true);
  const missing = structural.assertDraftRevision({ DRAFT_REVISION: 22 }, 0);
  assert.strictEqual(missing.ok, false);
});

test('retificação formal de cabeçalho (HEADER_EDIT_AUTH) permite troca preenchido→preenchido', function () {
  const next = JSON.parse(JSON.stringify(intact));
  next.guarnicao.nome = 'BST 02';
  assert.ok(structural.detectStructuralRegression(intact, next).length > 0);
  const allowed = structural.detectStructuralRegression(intact, next, { allowIdentityChange: true });
  assert.strictEqual(allowed.filter(function (x) { return x.field === 'nome'; }).length, 0);
  assert.strictEqual(structural.hasHeaderRectificationAuth({ HEADER_EDIT_AUTH: 'OPEN' }, { headerRectificationAuth: 'OPEN' }), true);
  assert.strictEqual(structural.hasHeaderRectificationAuth({ HEADER_EDIT_AUTH: '' }, { headerRectificationAuth: 'OPEN' }), false);
});

test('retificação NÃO autoriza esvaziar identidade', function () {
  const regressions = structural.detectStructuralRegression(intact, blank, { allowIdentityChange: true });
  assert.ok(regressions.some(function (x) { return x.reason === 'EMPTY'; }));
});

test('payload já danificado (vazio) não é classificado como nova regressão', function () {
  const regressions = structural.detectStructuralRegression(blank, blank);
  assert.strictEqual(regressions.length, 0);
});

test('hydrate incompleto: payload com cabeçalho e form vazio gera gaps', function () {
  const gaps = hydration.identityGaps(intact, { nome: '', vtr: '', responsavel: '' });
  assert.ok(gaps.indexOf('nome') >= 0);
  assert.ok(gaps.indexOf('vtr') >= 0);
});

test('debounce de 8s não autoriza UNRESOLVED/LOADING/ERROR', function () {
  ['UNRESOLVED', 'LOADING', 'ERROR'].forEach(function (st) {
    assert.strictEqual(hydration.canScheduleCloudSync(st), false, st);
  });
  assert.strictEqual(hydration.canScheduleCloudSync('HYDRATED'), true);
  assert.strictEqual(hydration.canScheduleCloudSync('NEW_SERVICE'), true);
});

test('autosave local bloqueado até HYDRATED/NEW_SERVICE', function () {
  const g = hydration.create({ state: hydration.STATES.UNRESOLVED });
  globalThis.__rsdHydration = g;
  assert.strictEqual(g.canLocalAutosave(), false);
  assert.strictEqual(hydration.localPersistAllowed(), false);
  g.markLoading();
  assert.strictEqual(hydration.canLocalAutosave('LOADING'), false);
  assert.strictEqual(hydration.localPersistAllowed(), false);
  g.markError();
  assert.strictEqual(hydration.localPersistAllowed(), false);
  g.markHydrated(3);
  assert.strictEqual(hydration.localPersistAllowed(), true);
  g.markNewService();
  assert.strictEqual(hydration.localPersistAllowed(), true);
  delete globalThis.__rsdHydration;
});

test('fallback REGISTERED_KEY bloqueia persist se o guard ainda não existe', function () {
  const prevH = globalThis.__rsdHydration;
  const prevLs = globalThis.localStorage;
  delete globalThis.__rsdHydration;
  const store = { 'pmpb-transito-servico-diario-v2-cloud-registered': '1' };
  globalThis.localStorage = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; }
  };
  assert.strictEqual(hydration.localPersistAllowed(), false);
  store['pmpb-transito-servico-diario-v2-cloud-registered'] = '';
  assert.strictEqual(hydration.localPersistAllowed(), true);
  if (prevH) globalThis.__rsdHydration = prevH;
  else delete globalThis.__rsdHydration;
  if (prevLs) globalThis.localStorage = prevLs;
  else delete globalThis.localStorage;
});

test('incoming blank com identidade existente não grava payload vazio (guarda recusa antes do save)', function () {
  const regressions = structural.detectStructuralRegression(intact, blank);
  assert.ok(regressions.length > 0);
  const fpExisting = structural.operationalFingerprint(intact);
  const fpBlank = structural.operationalFingerprint(blank);
  assert.ok(fpExisting.occurrences > fpBlank.occurrences);
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
    assert.strictEqual(sch.sent[0].guarnicao.nome, 'BST 03');
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
