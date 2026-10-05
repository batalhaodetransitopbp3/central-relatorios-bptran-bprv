'use strict';
/**
 * Salvar progressão — o teste só passa se produção, ocorrência e observação
 * reaparecem numa leitura NOVA do JSON persistido, sem reutilizar o objeto
 * que estava na memória do formulário.
 *
 * Fixtures sintéticas. Não chama a Central e não grava planilha.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const I = require('../rsd_structural_identity.js');
const diag = require('../rsd_local_draft_diag.js');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'relatorio_servico_diario.html'), 'utf8');
const ios = fs.readFileSync(path.join(root, 'relatorio_servico_diario_ios.html'), 'utf8');
const gs = fs.readFileSync(path.join(root, 'apps_script_v10.gs'), 'utf8');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('OK', name);
}

function oneLineFn(src, name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('função ausente: ' + name);
  const end = src.indexOf('\n', start);
  return src.slice(start, end).replace(/\r$/, '');
}

function loadCollector(src) {
  const inputs = [];
  const occurrences = [];
  const document = {
    querySelectorAll(sel) {
      if (sel === '[data-prod-g]') return inputs;
      if (sel === '#occurrences .entry') return occurrences;
      return [];
    }
  };
  const sandbox = { document: document, uid: function (p) { return String(p) + '-x'; } };
  vm.createContext(sandbox);
  vm.runInContext(
    ['num', 'collectProduction', 'recordFromEntry', 'entriesFrom', 'collectDynamic']
      .map(function (name) { return oneLineFn(src, name); })
      .join('\n'),
    sandbox
  );
  return {
    inputs: inputs,
    occurrences: occurrences,
    collectProduction: sandbox.collectProduction,
    collectDynamic: sandbox.collectDynamic,
    setInput: function (group, indicator, value) {
      var el = null;
      for (var i = 0; i < inputs.length; i++) {
        if (inputs[i].dataset.prodG === group && inputs[i].dataset.prodI === indicator) el = inputs[i];
      }
      if (!el) {
        el = { dataset: { prodG: group, prodI: indicator }, value: '' };
        inputs.push(el);
      }
      el.value = value == null ? '' : String(value);
    },
    setOccurrence: function (data) {
      var fields = Object.keys(data).filter(function (k) { return k !== 'id'; }).map(function (k) {
        return { dataset: { k: k }, type: 'text', value: data[k] == null ? '' : String(data[k]) };
      });
      occurrences.length = 0;
      occurrences.push({
        dataset: { id: data.id },
        querySelectorAll: function (sel) { return sel === '[data-k]' ? fields : []; }
      });
    },
    clearInputs: function () { inputs.length = 0; occurrences.length = 0; }
  };
}

function loadRevisionGate() {
  const start = gs.indexOf('function rsdHasOwn_');
  const end = gs.indexOf('function rsdAuditBlockedDraft_');
  if (start < 0 || end < start) throw new Error('gate de revisão não localizado');
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(gs.slice(start, end), sandbox);
  return sandbox;
}

const gate = loadRevisionGate();
const OBS = 'OBS-PROGRESSAO-TESTE-3-5-2';
const OCC_ID = 'oc-teste-progressao';
const OCC_DESC = 'Ocorrência de teste da progressão';

function identity(overrides) {
  return Object.assign({
    reportId: 'sd-test-progressao',
    serviceId: 'svc-test-progressao',
    batalhao: 'BPRv',
    companhia: '1ª CPRv',
    companhiaNumero: 1,
    data: '2026-10-02',
    nome: 'BASE 02',
    tipo: 'BASE',
    vtr: '8569',
    responsavel: 'COMANDANTE TESTE',
    matricula: '500.000-1',
    observacoes: OBS
  }, overrides || {});
}

function fillCanonical(form) {
  form.setInput('abordagens', 'motocicletas', 3);
  form.setInput('abordagens', 'automoveis', 5);
  form.setInput('notificacoes', 'demais-aits-com-abordagem', 2);
  form.setInput('notificacoes', 'total-aits', 2);
  form.setOccurrence({
    id: OCC_ID,
    data: '2026-10-02',
    numero: 'PM-TESTE-PROGRESSAO',
    tipo: 'BST',
    descricao: OCC_DESC,
    tcoSasp: 'Não'
  });
}

function progressionPayload(form, id) {
  const dyn = form.collectDynamic();
  return {
    schema: 'pmpb-transito-servico-diario-v2',
    schemaVersion: 2,
    reportId: id.reportId,
    serviceId: id.serviceId,
    segmento: 1,
    unidade: { batalhao: id.batalhao, companhia: id.companhia, companhiaNumero: id.companhiaNumero },
    servico: { data: id.data, operationalDate: id.data, serviceId: id.serviceId, segmento: 1 },
    guarnicao: {
      nome: id.nome,
      tipo: id.tipo,
      viatura: id.vtr,
      vtrPrincipal: id.vtr,
      responsavel: id.responsavel,
      matricula: id.matricula
    },
    producao: form.collectProduction(),
    ocorrencias: dyn.ocorrencias,
    observacoes: id.observacoes
  };
}

function fresh(json) {
  return JSON.parse(String(json));
}

function assertCanonical(rsd) {
  assert.strictEqual(rsd.producao.abordagens.motocicletas, 3);
  assert.strictEqual(rsd.producao.abordagens.automoveis, 5);
  assert.strictEqual(rsd.producao.notificacoes['demais-aits-com-abordagem'], 2);
  assert.strictEqual(rsd.producao.notificacoes['total-aits'], 2);
  assert.strictEqual(rsd.ocorrencias.length, 1);
  assert.strictEqual(rsd.ocorrencias[0].id, OCC_ID);
  assert.strictEqual(rsd.ocorrencias[0].descricao, OCC_DESC);
  assert.strictEqual(rsd.ocorrencias[0].numero, 'PM-TESTE-PROGRESSAO');
  assert.strictEqual(rsd.observacoes, OBS);
}

/**
 * Espelha rsdDraftSync_/rsdDraftObject_: revisão primeiro; se aceitar,
 * persiste o JSON inteiro e a leitura seguinte só enxerga essa string.
 */
function persistProgression(store, payload, known) {
  const incoming = JSON.parse(JSON.stringify(payload));
  if (store.row) {
    const present = !(known == null || known === '');
    const knownNum = present ? Number(known) : 0;
    const check = gate.rsdAssertDraftRevision_(store.row, knownNum, present);
    if (!check.ok) {
      return { ok: false, reason: check.reason, revision: Number(store.row.DRAFT_REVISION) || 0, rsd: fresh(store.json) };
    }
  }
  const pipe = I.draftPersistPipeline(store.row, incoming, { doUpsert: true });
  if (!pipe.ok) {
    return {
      ok: false,
      reason: pipe.code,
      revision: store.row ? (Number(store.row.DRAFT_REVISION) || 0) : 0,
      rsd: store.json ? fresh(store.json) : null
    };
  }
  const rev = store.row ? (Number(store.row.DRAFT_REVISION) || 0) + 1 : 1;
  store.json = pipe.json;
  store.row = {
    REPORT_ID: incoming.reportId,
    SERVICE_ID: incoming.serviceId,
    BATALHAO: pipe.line.BATALHAO,
    COMPANHIA: pipe.line.COMPANHIA,
    DATA_SERVICO: pipe.line.DATA_SERVICO,
    STATUS: 'EM_SERVICO',
    DRAFT_REVISION: rev,
    PAYLOAD_JSON: pipe.json
  };
  return { ok: true, revision: rev, rsd: fresh(store.json) };
}

test('coletor real das duas páginas lê os mesmos campos', function () {
  assert.strictEqual(oneLineFn(html, 'num'), oneLineFn(ios, 'num'));
  assert.strictEqual(oneLineFn(html, 'collectProduction'), oneLineFn(ios, 'collectProduction'));
  assert.strictEqual(oneLineFn(html, 'collectDynamic'), oneLineFn(ios, 'collectDynamic'));
  const form = loadCollector(html);
  fillCanonical(form);
  const prod = form.collectProduction();
  assert.strictEqual(prod.abordagens.motocicletas, 3);
  assert.strictEqual(prod.abordagens.automoveis, 5);
  assert.strictEqual(prod.notificacoes['total-aits'], 2);
  const dyn = form.collectDynamic();
  assert.strictEqual(dyn.ocorrencias[0].descricao, OCC_DESC);
});

test('A) iniciar → preencher → salvar progressão → leitura nova', function () {
  const form = loadCollector(html);
  fillCanonical(form);
  const payload = progressionPayload(form, identity());
  const store = { json: '', row: null };
  const saved = persistProgression(store, payload, null);
  assert.strictEqual(saved.ok, true);
  assert.strictEqual(saved.revision, 1);
  payload.producao = null;
  payload.ocorrencias = [];
  payload.observacoes = '';
  form.clearInputs();
  assertCanonical(fresh(store.json));
  assertCanonical(saved.rsd);
});

test('B) continuar RSD zerado → produção local → salvar → leitura nova mantém o cabeçalho', function () {
  const stored = progressionPayload(loadCollector(html), identity({ observacoes: '' }));
  stored.producao = { abordagens: { motocicletas: 0, automoveis: 0 }, notificacoes: { 'total-aits': 0 } };
  stored.ocorrencias = [];
  const store = { json: '', row: null };
  const created = persistProgression(store, stored, null);
  assert.strictEqual(created.revision, 1);
  assert.strictEqual(fresh(store.json).producao.abordagens.motocicletas, 0);

  const form = loadCollector(html);
  fillCanonical(form);
  const local = progressionPayload(form, identity({ nome: 'NAO-USAR-NOME-LOCAL', responsavel: 'OUTRO' }));
  const hydrated = diag.preserveUnsyncedOperationalContent(fresh(store.json), local);
  assert.strictEqual(hydrated.guarnicao.nome, 'BASE 02');
  assert.strictEqual(hydrated.guarnicao.responsavel, 'COMANDANTE TESTE');
  const saved = persistProgression(store, hydrated, 1);
  assert.strictEqual(saved.ok, true);
  assert.strictEqual(saved.revision, 2);
  form.clearInputs();
  const again = fresh(store.json);
  assertCanonical(again);
  assert.strictEqual(again.guarnicao.nome, 'BASE 02');
  assert.strictEqual(again.guarnicao.responsavel, 'COMANDANTE TESTE');
});

test('C) dois salvamentos consecutivos: a leitura nova mostra os valores da segunda', function () {
  const form = loadCollector(html);
  fillCanonical(form);
  const store = { json: '', row: null };
  const first = persistProgression(store, progressionPayload(form, identity()), null);
  assert.strictEqual(first.revision, 1);
  form.setInput('abordagens', 'motocicletas', 8);
  form.setInput('abordagens', 'automoveis', 9);
  form.setInput('notificacoes', 'total-aits', 4);
  form.setInput('notificacoes', 'demais-aits-com-abordagem', 4);
  const secondId = identity({ observacoes: 'OBS-PROGRESSAO-SEGUNDA' });
  const second = persistProgression(store, progressionPayload(form, secondId), first.revision);
  assert.strictEqual(second.ok, true);
  assert.strictEqual(second.revision, 2);
  form.clearInputs();
  const again = fresh(store.json);
  assert.strictEqual(again.producao.abordagens.motocicletas, 8);
  assert.strictEqual(again.producao.abordagens.automoveis, 9);
  assert.strictEqual(again.producao.notificacoes['total-aits'], 4);
  assert.strictEqual(again.ocorrencias[0].id, OCC_ID);
  assert.strictEqual(again.observacoes, 'OBS-PROGRESSAO-SEGUNDA');
});

test('D) produção e ocorrência no mesmo ciclo reaparecem juntas', function () {
  const form = loadCollector(html);
  fillCanonical(form);
  const saved = persistProgression({ json: '', row: null }, progressionPayload(form, identity()), null);
  assert.ok(saved.rsd.producao.abordagens.motocicletas > 0);
  assert.strictEqual(saved.rsd.ocorrencias.length, 1);
  assert.ok(saved.rsd.observacoes);
});

test('E) valor positivo já gravado não é zerado pelo rascunho local nem pelo save seguinte', function () {
  const server = progressionPayload(loadCollector(html), identity({ observacoes: 'OBS-JA-GRAVADA' }));
  server.producao = { abordagens: { motocicletas: 7, automoveis: 0 } };
  server.ocorrencias = [{ id: 'oc-ja-gravada', descricao: 'Ocorrência já na Central', tipo: 'BST' }];
  const form = loadCollector(html);
  form.setInput('abordagens', 'motocicletas', 0);
  form.setInput('abordagens', 'automoveis', 5);
  form.setOccurrence({ id: OCC_ID, descricao: OCC_DESC, tipo: 'BST', numero: 'PM-TESTE-PROGRESSAO', data: '2026-10-02', tcoSasp: 'Não' });
  const local = progressionPayload(form, identity({ observacoes: 'OBS-LOCAL-NAO-SUBSTITUI' }));
  const hydrated = diag.preserveUnsyncedOperationalContent(server, local);
  assert.strictEqual(hydrated.producao.abordagens.motocicletas, 7);
  assert.strictEqual(hydrated.producao.abordagens.automoveis, 5);
  assert.strictEqual(hydrated.observacoes, 'OBS-JA-GRAVADA');
  assert.strictEqual(hydrated.ocorrencias.length, 2);
  const store = { json: '', row: null };
  const saved = persistProgression(store, hydrated, null);
  form.clearInputs();
  const again = fresh(store.json);
  assert.strictEqual(again.producao.abordagens.motocicletas, 7);
  assert.strictEqual(again.producao.abordagens.automoveis, 5);
  assert.strictEqual(again.ocorrencias.map(function (o) { return o.id; }).sort().join(','), 'oc-ja-gravada,oc-teste-progressao');
  assert.strictEqual(saved.revision, 1);
});

test('F) revisão ausente ou atrasada não grava e não apaga o JSON anterior', function () {
  const form = loadCollector(html);
  fillCanonical(form);
  const store = { json: '', row: null };
  const first = persistProgression(store, progressionPayload(form, identity()), null);
  const before = store.json;
  const omitted = persistProgression(store, progressionPayload(form, identity({ observacoes: 'NAO-GRAVAR' })), undefined);
  assert.strictEqual(omitted.ok, false);
  assert.strictEqual(omitted.reason, 'LEGACY_CLIENT_RELOAD_REQUIRED');
  assert.strictEqual(store.json, before);
  const stale = persistProgression(store, progressionPayload(form, identity({ observacoes: 'NAO-GRAVAR' })), 0);
  assert.strictEqual(stale.ok, false);
  assert.strictEqual(stale.reason, 'STALE_REVISION');
  assert.strictEqual(store.row.DRAFT_REVISION, first.revision);
  assertCanonical(fresh(store.json));
});

test('rascunho de outro RSD não entra na reidratação', function () {
  const server = progressionPayload(loadCollector(html), identity({ observacoes: '' }));
  server.producao = { abordagens: { motocicletas: 0 } };
  server.ocorrencias = [];
  const other = progressionPayload(loadCollector(html), identity({ reportId: 'sd-outro', observacoes: OBS }));
  const form = loadCollector(html);
  fillCanonical(form);
  other.producao = form.collectProduction();
  other.ocorrencias = form.collectDynamic().ocorrencias;
  const hydrated = diag.preserveUnsyncedOperationalContent(server, other);
  assert.strictEqual(hydrated.producao.abordagens.motocicletas, 0);
  assert.strictEqual(hydrated.ocorrencias.length, 0);
  assert.strictEqual(hydrated.observacoes, '');
});

test('botão bloqueado ainda guarda progressão positiva sem apagar o rascunho do mesmo RSD', function () {
  const prev = progressionPayload(loadCollector(html), identity());
  prev.ocorrencias = [{ id: 'oc-ja-gravada', descricao: 'já local', tipo: 'BST' }];
  const form = loadCollector(html);
  form.setInput('abordagens', 'motocicletas', 3);
  const next = progressionPayload(form, identity({ observacoes: '' }));
  next.ocorrencias = [];
  const empty = diag.commitExplicitLocalDraft(prev, progressionPayload(loadCollector(html), identity({ observacoes: '' })));
  assert.strictEqual(empty.write, false);
  const foreign = diag.commitExplicitLocalDraft(prev, Object.assign(progressionPayload(form, identity()), { reportId: 'sd-outro' }));
  assert.strictEqual(foreign.write, false);
  const kept = diag.commitExplicitLocalDraft(prev, next);
  assert.strictEqual(kept.write, true);
  assert.strictEqual(kept.draft.producao.abordagens.motocicletas, 3);
  assert.strictEqual(kept.draft.ocorrencias[0].id, 'oc-ja-gravada');
});

test('as duas páginas reidratam pelo preservador e só anunciam sucesso depois da nuvem', function () {
  [html, ios].forEach(function (src) {
    assert.ok(src.indexOf('function rsdPayloadForHydration') >= 0);
    assert.ok(src.indexOf('preserveUnsyncedOperationalContent') >= 0);
    assert.ok(src.indexOf('commitExplicitLocalDraft') >= 0);
    assert.strictEqual((src.match(/window\.applyPayload\(rsdPayloadForHydration\(rp\)\)/g) || []).length, 2);
    const start = src.indexOf('window.centralRsdSaveProgression=async function');
    const end = src.indexOf('window.centralRsdSyncNow', start);
    const fn = src.slice(start, end);
    const okAt = fn.indexOf('if(ok)');
    const successAt = fn.indexOf('Progressão salva na nuvem');
    assert.ok(okAt >= 0 && successAt > okAt);
    assert.ok(fn.indexOf('rsd-draft-sync') < 0);
    assert.ok(src.indexOf("submitForm('rsd-draft-sync'") >= 0);
  });
});

console.log(passed + ' testes de progressão OK');
