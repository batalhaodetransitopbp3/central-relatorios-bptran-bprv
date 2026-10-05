'use strict';
/**
 * Roundtrip do hotfix de progressão contra o contrato real do Apps Script.
 *
 * doPost/doGet e rsd-draft-sync/rsd-get/rsd-start rodam o código de
 * apps_script_v10.gs. A planilha é um fake em memória: SpreadsheetApp.openById
 * não fala com o Google. Nenhum RSD operacional é lido ou alterado.
 *
 * O formulário usa as funções reais dos HTML (payloadV2, enrichPayload,
 * syncCloudDraft, centralRsdSaveProgression, recoverRegisteredServiceFromCloud,
 * rsdPayloadForHydration, applyPayload, collectProduction).
 */
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'relatorio_servico_diario.html'), 'utf8');
const ios = fs.readFileSync(path.join(root, 'relatorio_servico_diario_ios.html'), 'utf8');
const gs = fs.readFileSync(path.join(root, 'apps_script_v10.gs'), 'utf8');
const Guard = require('../rsd_hydration_guard.js');
const Diag = require('../rsd_local_draft_diag.js');
const Identity = require('../rsd_structural_identity.js');

const TOKEN = 'contract-test-central-token';
const DEVICE = 'dev-contract-validation';
const DRAFT_KEY = 'pmpb-transito-servico-diario-v2-draft';
const REPORT_ID_KEY = 'pmpb-transito-servico-diario-v2-report-id';
const REGISTERED_KEY = 'pmpb-transito-servico-diario-v2-cloud-registered';
const OBS = 'OBS-CONTRACT-PROGRESSAO-3-5-2';
const OBS2 = 'OBS-CONTRACT-SEGUNDA-8-9-4';
const OCC_ID = 'oc-contract-progressao';
const OCC_DESC = 'Ocorrencia de teste da progressao';

let passed = 0;
function test(name, fn) {
  const result = fn();
  if (result && typeof result.then === 'function') {
    return result.then(function () {
      passed++;
      console.log('OK', name);
    });
  }
  passed++;
  console.log('OK', name);
}

function scanBraces(src, i) {
  let depth = 0;
  let started = false;
  let q = null;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (q) {
      if (c === '\\') { j++; continue; }
      if (c === q) q = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '{') { depth++; started = true; }
    else if (c === '}') {
      depth--;
      if (started && depth === 0) return j + 1;
    }
  }
  throw new Error('bloco não fechado');
}

function extractFn(src, token) {
  const i = src.indexOf(token);
  if (i < 0) throw new Error('trecho ausente: ' + token);
  if (token.indexOf('UNIT_TYPES') >= 0) return src.slice(i, scanBraces(src, i));
  const open = src.indexOf('(', i);
  let depth = 0;
  let q = null;
  let k = open;
  for (; k < src.length; k++) {
    const c = src[k];
    if (q) {
      if (c === '\\') { k++; continue; }
      if (c === q) q = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) { k++; break; }
    }
  }
  while (src[k] === ' ' || src[k] === '\n' || src[k] === '\r' || src[k] === '\t') k++;
  return src.slice(i, scanBraces(src, k));
}

function oneLine(src, name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('função ausente: ' + name);
  const end = src.indexOf('\n', start);
  return src.slice(start, end < 0 ? src.length : end).replace(/\r$/, '');
}

function normSrc(s) {
  return String(s || '')
    .replace(/\r\n/g, '\n')
    .replace(/^[ \t]*\/\/.*$/gm, '')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function memoryStorage(seed) {
  const data = Object.assign({}, seed || {});
  return {
    getItem(k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem(k, v) { data[k] = String(v); },
    removeItem(k) { delete data[k]; },
    _data: data
  };
}

function makeSheet(name, headers) {
  const rows = [headers.slice()];
  return {
    getName() { return name; },
    getLastRow() {
      for (let i = rows.length - 1; i >= 0; i--) {
        const row = rows[i] || [];
        for (let j = 0; j < row.length; j++) {
          if (row[j] !== '' && row[j] != null) return i + 1;
        }
      }
      return 0;
    },
    getLastColumn() {
      let max = 0;
      rows.forEach(function (row) {
        for (let j = row.length - 1; j >= 0; j--) {
          if (row[j] !== '' && row[j] != null) { max = Math.max(max, j + 1); break; }
        }
      });
      return max || 1;
    },
    getRange(r, c, numRows, numCols) {
      const nR = numRows == null ? 1 : numRows;
      const nC = numCols == null ? 1 : numCols;
      return {
        getValues() {
          const out = [];
          for (let i = 0; i < nR; i++) {
            const row = rows[r - 1 + i] || [];
            const line = [];
            for (let j = 0; j < nC; j++) {
              const v = row[c - 1 + j];
              line.push(v == null ? '' : v);
            }
            out.push(line);
          }
          return out;
        },
        getDisplayValues() {
          return this.getValues().map(function (line) {
            return line.map(function (v) { return v instanceof Date ? v.toISOString() : String(v); });
          });
        },
        setValues(values) {
          values.forEach(function (line, i) {
            const ri = r - 1 + i;
            while (rows.length <= ri) rows.push([]);
            line.forEach(function (cell, j) { rows[ri][c - 1 + j] = cell; });
          });
        }
      };
    },
    deleteRow(row) { rows.splice(row - 1, 1); }
  };
}

function createGas() {
  const opened = [];
  const sheets = {};
  function add(name, headers) { sheets[name] = makeSheet(name, headers); }
  add('RSD', [
    'REPORT_ID', 'VERSAO', 'DATA_SERVICO', 'BATALHAO', 'COMPANHIA', 'GUARNICAO', 'GUARNICAO_TIPO', 'GUARNICAO_ORDEM',
    'VTR_PRINCIPAL', 'TURNO', 'STATUS', 'RESPONSAVEL_MATRICULA', 'RESPONSAVEL_POSTO_GRAD', 'RESPONSAVEL_NOME',
    'INICIADO_EM', 'FINALIZADO_EM', 'RETIFICADO_EM', 'CANCELADO_EM', 'RCO_REPORT_ID', 'INCLUIDO_RCO_EM',
    'PAYLOAD_JSON', 'SCHEMA_VERSION', 'SINCRONIZADO_EM', 'ORIGEM', 'OBSERVACOES', 'PAYLOAD_FILE_ID', 'PAYLOAD_FILE_URL',
    'PAYLOAD_HASH', 'SERVICE_ID', 'SEGMENTO', 'RSD_ANTERIOR_ID', 'PASSAGEM_ORIGEM_ID', 'ULTIMO_RASCUNHO_EM',
    'EDIT_DEVICE_ID', 'EDIT_LEASE_UNTIL', 'DRAFT_REVISION', 'HEADER_EDIT_AUTH', 'HEADER_EDIT_AUTH_EM', 'HEADER_EDIT_AUTH_POR',
    'REVIEW_STATUS', 'REVIEW_MOTIVO', 'REVIEW_OBSERVACAO', 'REVIEW_AUTOR_MATRICULA', 'REVIEW_AUTOR_NOME', 'REVIEW_EM',
    'CANCELADO_MOTIVO', 'CANCELADO_POR_MATRICULA', 'CANCELADO_POR_NOME', 'CANCELADO_POR_PERFIL', 'DUPLICATE_OVERRIDE_JUSTIFICATIVA'
  ]);
  add('AUDITORIA_VERSOES', [
    'AUDITORIA_ID', 'TIPO_ENTIDADE', 'ENTIDADE_ID', 'VERSAO', 'DATA_HORA', 'ACAO', 'RESPONSAVEL_MATRICULA',
    'RESPONSAVEL_NOME', 'BATALHAO', 'COMPANHIA', 'SNAPSHOT_JSON', 'HASH', 'ORIGEM'
  ]);
  add('RSD_VIATURAS', [
    'REGISTRO_ID', 'RSD_REPORT_ID', 'VIATURA_ID', 'PREFIXO', 'PLACA', 'MARCA_MODELO', 'TIPO', 'ORDEM', 'ORIGEM', 'REGISTRADO_EM'
  ]);
  const props = { CENTRAL_TOKEN: TOKEN };
  const sandbox = {
    openedIds: opened,
    __posts: [],
    SpreadsheetApp: {
      openById(id) {
        opened.push(String(id));
        return { getSheetByName(name) { return sheets[name] || null; } };
      }
    },
    LockService: {
      getScriptLock() {
        return { waitLock() {}, releaseLock() {}, tryLock() { return true; } };
      }
    },
    Utilities: {
      DigestAlgorithm: { MD5: 'MD5', SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF-8' },
      getUuid() { return crypto.randomUUID(); },
      computeDigest(algo, text) {
        const name = algo === 'SHA_256' ? 'sha256' : 'md5';
        return Array.from(crypto.createHash(name).update(String(text || ''), 'utf8').digest());
      },
      formatDate(date, tz, format) {
        const d = date instanceof Date ? date : new Date(date);
        const zone = tz === 'UTC' ? 'UTC' : 'America/Sao_Paulo';
        const parts = {};
        new Intl.DateTimeFormat('en-US', {
          timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
        }).formatToParts(d).forEach(function (p) { parts[p.type] = p.value; });
        const yyyy = parts.year;
        const MM = parts.month;
        const dd = parts.day;
        let HH = parts.hour;
        if (HH === '24') HH = '00';
        const mm = parts.minute;
        const ss = parts.second;
        if (format === 'yyyy-MM-dd') return yyyy + '-' + MM + '-' + dd;
        if (format === 'H') return String(Number(HH));
        if (format === 'yyyyMMdd_HHmmss') return yyyy + MM + dd + '_' + HH + mm + ss;
        if (format === "yyyy-MM-dd'T'HH:mm:ssXXX") {
          return yyyy + '-' + MM + '-' + dd + 'T' + HH + ':' + mm + ':' + ss + (zone === 'UTC' ? 'Z' : '-03:00');
        }
        throw new Error('formatDate não suportado: ' + format);
      }
    },
    PropertiesService: {
      getScriptProperties() {
        return {
          getProperty(k) { return props[k] || null; },
          setProperty(k, v) { props[k] = String(v); }
        };
      }
    },
    CacheService: { getScriptCache() { return { get() { return null; }, put() {}, remove() {} }; } },
    Session: { getScriptTimeZone() { return 'America/Sao_Paulo'; } },
    DriveApp: {
      getFileById() { throw new Error('DriveApp não pode ser usado neste teste'); },
      createFolder() { throw new Error('DriveApp não pode ser usado neste teste'); }
    },
    RsdStructuralIdentity: Identity,
    console: console
  };
  vm.createContext(sandbox);
  vm.runInContext(gs, sandbox, { filename: 'apps_script_v10.gs' });
  vm.runInContext(
    'postMessagePage_=function(action,obj,requestId){' +
      'var data=Object.assign({source:"central-p3-v10",action:action,requestId:String(requestId||"")},obj||{});' +
      '__posts.push(data);return data;};',
    sandbox
  );
  let seq = 0;
  function post(action, payload) {
    const requestId = 'req-' + (++seq);
    sandbox.doPost({
      parameter: {
        action: action,
        token: TOKEN,
        requestId: requestId,
        payload: JSON.stringify(payload || {})
      }
    });
    const msg = sandbox.__posts[sandbox.__posts.length - 1];
    if (!msg) throw new Error('doPost não devolveu postMessage para ' + action);
    return msg;
  }
  function stored(reportId) {
    const row = sandbox.findOne_(sandbox.sheet_(sandbox.P3_SHEET_ID, 'RSD'), 'REPORT_ID', reportId);
    if (!row) return null;
    return {
      revision: Number(row.DRAFT_REVISION || 0),
      status: String(row.STATUS || ''),
      companhia: String(row.COMPANHIA || ''),
      guarnicao: String(row.GUARNICAO || ''),
      data: String(row.DATA_SERVICO || ''),
      payload: sandbox.parseJson_(row.PAYLOAD_JSON, {})
    };
  }
  return { sandbox, opened, post, stored };
}

function catalog(src) {
  const start = src.indexOf('const PRODUCAO=');
  const end = src.indexOf(';', start);
  const box = {};
  vm.createContext(box);
  vm.runInContext(src.slice(start, end + 1) + '\nthis.PRODUCAO=PRODUCAO;', box);
  return box.PRODUCAO;
}

function createPage(src, storage, gas) {
  const inputs = [];
  catalog(src).forEach(function (group) {
    const gk = group[0];
    (group[2] || []).forEach(function (item) {
      inputs.push({ dataset: { prodG: gk, prodI: item[0] }, value: '', type: 'number' });
    });
  });
  const occurrences = [];
  const fields = {};
  function el(id) {
    if (!fields[id]) {
      fields[id] = {
        id: id, value: '', checked: false, textContent: '', hidden: false, disabled: false,
        readOnly: false, title: '', type: id === 'fiscoAtivo' ? 'checkbox' : 'text', style: {},
        dataset: {}, setAttribute() {}, removeAttribute() {}, getAttribute() { return ''; }
      };
    }
    return fields[id];
  }
  const document = {
    getElementById: el,
    querySelector(sel) {
      const g = String(sel || '').match(/data-prod-g="([^"]+)"/);
      const i = String(sel || '').match(/data-prod-i="([^"]+)"/);
      if (g && i) {
        return inputs.find(function (e) { return e.dataset.prodG === g[1] && e.dataset.prodI === i[1]; }) || null;
      }
      return null;
    },
    querySelectorAll(sel) {
      if (sel === '[data-prod-g]') return inputs;
      if (sel === '#occurrences .entry') return occurrences;
      return [];
    },
    createElement() { return { style: {}, appendChild() {}, remove() {} }; },
    body: { appendChild() {} }
  };
  const wires = [];
  const alerts = [];
  const page = { inputs, occurrences, fields, wires, alerts, failSync: false, storage };
  const guard = Guard.create({
    state: storage.getItem(REGISTERED_KEY) === '1' ? Guard.STATES.UNRESOLVED : Guard.STATES.NEW_SERVICE
  });
  const sandbox = {
    document: document,
    localStorage: storage,
    navigator: { onLine: true },
    alert(msg) { alerts.push(String(msg)); },
    uid(p) { return String(p || 'id') + '-local'; },
    reportId: storage.getItem(REPORT_ID_KEY) || '',
    serviceId: '',
    segmento: 1,
    serviceRegistered: storage.getItem(REGISTERED_KEY) === '1',
    deviceId: DEVICE,
    rsdAnteriorId: '',
    passagemOrigemId: '',
    commanderPostoGrad: 'CB',
    serviceStartedAt: '2026-10-02T13:00:00.000Z',
    READONLY_VIEWER: false,
    cloudConflictNotified: false,
    DRAFT_KEY: DRAFT_KEY,
    REPORT_ID_KEY: REPORT_ID_KEY,
    REGISTERED_KEY: REGISTERED_KEY,
    rsdHydration: guard,
    __rsdHydration: guard,
    RsdHydrationGuard: Guard,
    RsdLocalDraftDiag: Diag,
    __clearOcc() { occurrences.length = 0; },
    __pushOcc(x) {
      x = x || {};
      const keys = ['data', 'hora', 'numero', 'tipo', 'descricao', 'tcoSasp', 'local'];
      const controls = keys.filter(function (k) { return x[k] != null && x[k] !== ''; }).map(function (k) {
        return { dataset: { k: k }, type: 'text', value: String(x[k]), checked: false };
      });
      occurrences.push({
        dataset: { id: x.id || '' },
        querySelectorAll(sel) { return sel === '[data-k]' ? controls : []; }
      });
    }
  };
  sandbox.window = sandbox;
  sandbox.rsdLocalPersistAllowed = function () {
    const prev = global.__rsdHydration;
    global.__rsdHydration = guard;
    try { return Guard.localPersistAllowed(); }
    finally { global.__rsdHydration = prev; }
  };
  sandbox.CentralCloud = {
    getToken() { return TOKEN; },
    getServiceWindow(when) {
      const op = String(when || '').trim();
      return { operationalDate: op, windowStart: op + 'T07:00:00', windowEnd: op + 'T07:00:00+1', cutoffHour: 7 };
    },
    operationalServiceDate(when) { return String(when || '').trim(); },
    async submitForm(action, payload, token) {
      if (page.failSync && action === 'rsd-draft-sync') {
        page.failSync = false;
        throw new Error('Tempo esgotado ao comunicar com a Central.');
      }
      const raw = JSON.stringify(payload || {});
      const body = JSON.parse(raw);
      wires.push({ action: action, token: token, raw: raw, body: body });
      const msg = gas.post(action, body);
      if (msg.ok === false) {
        const err = new Error(msg.message || 'Operação rejeitada.');
        err.response = msg;
        throw err;
      }
      return msg;
    },
    async jsonp(action, params) {
      const p = Object.assign({}, params || {});
      if (action === 'rsd-get' && !p.module && !p.forModule) p.module = 'RSD';
      const token = p.token;
      delete p.token;
      delete p.callback;
      delete p._;
      return this.submitForm(action, p, token);
    }
  };
  const script = [
    extractFn(src, 'const UNIT_TYPES={').replace(/^const /, 'var '),
    oneLine(src, 'num'),
    oneLine(src, 'calcAits'),
    oneLine(src, 'collectProduction'),
    oneLine(src, 'setProduction'),
    oneLine(src, 'recordFromEntry'),
    oneLine(src, 'entriesFrom'),
    oneLine(src, 'collectDynamic'),
    oneLine(src, 'val'),
    oneLine(src, 'currentUnit'),
    extractFn(src, 'function payloadV2('),
    extractFn(src, 'function applyPayload('),
    extractFn(src, 'function draftObj('),
    extractFn(src, 'function salvarRascunhoGuarnicao('),
    extractFn(src, 'function rsdPayloadForHydration('),
    extractFn(src, 'function paintRsdHeaderRead('),
    extractFn(src, 'function currentFormIdentity('),
    extractFn(src, 'function rememberDraftRevision('),
    extractFn(src, 'function confirmHydratedIdentity('),
    extractFn(src, 'function enrichPayload('),
    extractFn(src, 'async function syncCloudDraft('),
    extractFn(src, 'async function recoverRegisteredServiceFromCloud('),
    extractFn(src, 'async function rsdStartWithRetry('),
    extractFn(src, 'window.centralRsdSaveProgression=async function(){'),
    'function atualizarDiaSemana(){}',
    'function syncPrintValue(){}',
    'function syncUnitHeader(){}',
    'function toggleFiscoMode(){}',
    'function clearEntries(){__clearOcc();}',
    'function addOccurrence(x){__pushOcc(x);}',
    'function addOperationSummary(){}',
    'function addVehicle(){}',
    'function addArvc(){}',
    'function renderRsdSyncBanner(){}',
    'function renderReviewBanner(){}',
    'function showRsdHydrationStatus(){}',
    'function updateIdentityLock(){}',
    'function updateFinalizeUi(){}',
    'function saveIdentity(){}',
    'function saveActiveContext(){}',
    'function setTeamDisplay(){}',
    'function collectVtrs(){var p=String(val("viatura")||"").trim();return p?[{prefixo:p,origem:"RSD"}]:[];}',
    'function listFiscoLinks(){return [];}',
    'function readFiscoAcionamentos(){return [];}',
    'window.applyPayload=applyPayload;',
    'var __basePayloadV2=payloadV2;',
    'window.payloadV2=function(){return enrichPayload(__basePayloadV2());};'
  ].join('\n');
  vm.createContext(sandbox);
  vm.runInContext(script, sandbox, { filename: 'rsd-page.js' });
  page.sandbox = sandbox;
  page.guard = guard;
  page.el = el;
  page.setInput = function (g, i, value) {
    const found = inputs.find(function (e) { return e.dataset.prodG === g && e.dataset.prodI === i; });
    if (!found) throw new Error('indicador ausente no formulário: ' + g + '.' + i);
    found.value = value == null ? '' : String(value);
  };
  page.leaf = function (g, i) {
    const found = inputs.find(function (e) { return e.dataset.prodG === g && e.dataset.prodI === i; });
    return sandbox.num(found ? found.value : '');
  };
  return page;
}

function fillHeader(page, fx) {
  page.sandbox.reportId = fx.reportId;
  page.sandbox.serviceId = fx.serviceId;
  page.storage.setItem(REPORT_ID_KEY, fx.reportId);
  const set = function (id, value) { page.el(id).value = value == null ? '' : String(value); };
  set('batalhao', fx.batalhao);
  set('companhiaNumero', fx.companhiaNumero);
  set('data', fx.data);
  set('diaSemana', 'sexta-feira');
  set('guarnicaoTipo', fx.tipo);
  set('guarnicao', fx.nome);
  set('viatura', fx.vtr);
  set('responsavel', fx.responsavel);
  set('matriculaResponsavel', fx.matricula);
  set('efetivo', '02');
  set('observacoes', '');
  page.el('fiscoAtivo').checked = false;
}

function fillOperational(page) {
  page.setInput('abordagens', 'motocicletas', '3');
  page.setInput('abordagens', 'automoveis', '5');
  page.setInput('notificacoes', 'demais-aits-com-abordagem', '2');
  page.setInput('notificacoes', 'total-aits', '2');
  page.sandbox.addOccurrence({
    id: OCC_ID,
    data: '2026-10-02',
    numero: 'PM-CONTRACT-PROGRESSAO',
    tipo: 'BST',
    descricao: OCC_DESC,
    tcoSasp: 'Não'
  });
  page.el('observacoes').value = OBS;
}

function leafOf(payload, g, i) {
  const n = payload && payload.producao && payload.producao[g] ? payload.producao[g][i] : 0;
  const v = parseInt(String(n == null ? '' : n).replace(/[^0-9-]/g, ''), 10);
  return isFinite(v) ? v : 0;
}

function assertCloudZeros(stored, label) {
  assert.strictEqual(leafOf(stored.payload, 'abordagens', 'motocicletas'), 0, label + ' motos');
  assert.strictEqual(leafOf(stored.payload, 'abordagens', 'automoveis'), 0, label + ' autos');
  assert.strictEqual(Array.isArray(stored.payload.ocorrencias) ? stored.payload.ocorrencias.length : 0, 0, label + ' ocorrencias');
  assert.strictEqual(String(stored.payload.observacoes || ''), '', label + ' obs');
}

function assertFormOperational(page, motos, autos, aits, obs) {
  assert.strictEqual(page.leaf('abordagens', 'motocicletas'), motos);
  assert.strictEqual(page.leaf('abordagens', 'automoveis'), autos);
  assert.strictEqual(page.leaf('notificacoes', 'demais-aits-com-abordagem'), aits);
  assert.strictEqual(page.el('observacoes').value, obs);
  const dyn = page.sandbox.collectDynamic();
  const occ = (dyn.ocorrencias || []).find(function (o) { return o.id === OCC_ID; });
  assert.ok(occ, 'ocorrência ausente no formulário');
  assert.strictEqual(occ.descricao, OCC_DESC);
  assert.strictEqual(occ.numero, 'PM-CONTRACT-PROGRESSAO');
}

function assertPayloadOperational(payload, motos, autos, aits, obs) {
  assert.strictEqual(leafOf(payload, 'abordagens', 'motocicletas'), motos);
  assert.strictEqual(leafOf(payload, 'abordagens', 'automoveis'), autos);
  assert.strictEqual(leafOf(payload, 'notificacoes', 'demais-aits-com-abordagem'), aits);
  assert.strictEqual(String(payload.observacoes || ''), obs);
  const occ = (payload.ocorrencias || []).find(function (o) { return o.id === OCC_ID; });
  assert.ok(occ, 'ocorrência ausente no payload');
  assert.strictEqual(occ.descricao, OCC_DESC);
}

async function startHeader(page, gas, fx) {
  fillHeader(page, fx);
  const packed = page.sandbox.window.payloadV2();
  assert.strictEqual(leafOf(packed, 'abordagens', 'motocicletas'), 0);
  const started = await page.sandbox.rsdStartWithRetry(packed, TOKEN);
  const resp = started.response;
  assert.strictEqual(resp.ok, true, resp.message || 'rsd-start');
  assert.strictEqual(resp.existing, undefined);
  assert.strictEqual(resp.draftRevision, 1, JSON.stringify(resp));
  page.sandbox.serviceRegistered = true;
  page.storage.setItem(REGISTERED_KEY, '1');
  page.sandbox.rsdHydration.markHydrated(resp.draftRevision);
  const row = gas.stored(fx.reportId);
  assert.strictEqual(row.revision, 1);
  assert.strictEqual(row.status, 'EM_SERVICO');
  assertCloudZeros(row, 'início');
  return resp;
}

async function reopen(src, storage, gas) {
  const page = createPage(src, storage, gas);
  const rec = await page.sandbox.recoverRegisteredServiceFromCloud(TOKEN, false);
  if (!rec || !rec.active) {
    let gaps = [];
    try { gaps = Guard.identityGaps(rec && rec.rp, page.sandbox.currentFormIdentity()); } catch (_) {}
    throw new Error('reidratação não ficou ativa: ' + JSON.stringify({
      active: rec && rec.active,
      degraded: rec && rec.degraded,
      error: rec && rec.error && rec.error.message,
      state: page.sandbox.rsdHydration.getHydrationState(),
      gaps: gaps,
      tipo: page.el('guarnicaoTipo').value,
      nome: page.el('guarnicao').value
    }));
  }
  return page;
}

async function runScenario(src, label) {
  const gas = createGas();
  const fx = {
    reportId: 'sd-contract-' + label,
    serviceId: 'svc-contract-' + label,
    batalhao: 'BPRv',
    companhiaNumero: 1,
    data: '2026-10-02',
    tipo: 'BASE',
    nome: 'BASE 02',
    vtr: '8801',
    responsavel: 'COMANDANTE TESTE',
    matricula: '500.000-1'
  };
  const storage = memoryStorage();
  const page = createPage(src, storage, gas);

  await startHeader(page, gas, fx);
  assert.ok(gas.opened.indexOf(gas.sandbox.P3_SHEET_ID) >= 0, 'o backend tentou abrir a planilha e o fake interceptou');

  fillOperational(page);
  page.failSync = true;
  const blocked = await page.sandbox.centralRsdSaveProgression();
  assert.strictEqual(blocked, false, 'sincronização temporária deve falhar');
  assert.ok(!page.wires.some(function (w) { return w.action === 'rsd-draft-sync'; }), 'timeout não pode gravar rsd-draft-sync');
  const localAfterFail = JSON.parse(storage.getItem(DRAFT_KEY));
  assertPayloadOperational(localAfterFail, 3, 5, 2, OBS);
  assert.strictEqual(localAfterFail.reportId, fx.reportId);
  const stillZero = gas.stored(fx.reportId);
  assert.strictEqual(stillZero.revision, 1);
  assertCloudZeros(stillZero, 'após falha');

  const reopened = await reopen(src, storage, gas);
  assertFormOperational(reopened, 3, 5, 2, OBS);
  assert.strictEqual(reopened.el('guarnicao').value, 'BASE 02');
  assert.strictEqual(reopened.el('data').value, '2026-10-02');
  const stillZeroAfterReopen = gas.stored(fx.reportId);
  assert.strictEqual(stillZeroAfterReopen.revision, 1);
  assertCloudZeros(stillZeroAfterReopen, 'reabertura');

  const saved = await reopened.sandbox.centralRsdSaveProgression();
  assert.strictEqual(saved, true, reopened.el('rsdProgressaoStatus').textContent);
  const syncs = reopened.wires.filter(function (w) { return w.action === 'rsd-draft-sync'; });
  assert.strictEqual(syncs.length, 1);
  const posted = syncs[0].body;
  assert.strictEqual(posted.rsd.knownDraftRevision, 1);
  assertPayloadOperational(posted.rsd, 3, 5, 2, OBS);
  const persisted = gas.stored(fx.reportId);
  assert.strictEqual(persisted.revision, 2);
  assertPayloadOperational(persisted.payload, 3, 5, 2, OBS);
  const got = gas.post('rsd-get', { reportId: fx.reportId, module: 'RSD' });
  assert.strictEqual(got.ok, true);
  assert.strictEqual(got.rsd.draftRevision, 2);
  assertPayloadOperational(got.rsd, 3, 5, 2, OBS);

  const freshStorage = memoryStorage();
  freshStorage.setItem(REPORT_ID_KEY, fx.reportId);
  freshStorage.setItem(REGISTERED_KEY, '1');
  freshStorage.setItem(DRAFT_KEY, JSON.stringify({ reportId: 'sd-outro-rascunho', producao: { abordagens: { motocicletas: 99 } }, observacoes: 'NAO-USAR' }));
  const fresh = await reopen(src, freshStorage, gas);
  assertFormOperational(fresh, 3, 5, 2, OBS);
  assert.notStrictEqual(fresh.el('observacoes').value, 'NAO-USAR');

  fresh.setInput('abordagens', 'motocicletas', '8');
  fresh.setInput('abordagens', 'automoveis', '9');
  fresh.setInput('notificacoes', 'demais-aits-com-abordagem', '4');
  fresh.setInput('notificacoes', 'total-aits', '4');
  fresh.el('observacoes').value = OBS2;
  const second = await fresh.sandbox.centralRsdSaveProgression();
  assert.strictEqual(second, true);
  const secondPost = fresh.wires.filter(function (w) { return w.action === 'rsd-draft-sync'; }).pop();
  assertPayloadOperational(secondPost.body.rsd, 8, 9, 4, OBS2);
  const secondStored = gas.stored(fx.reportId);
  assert.strictEqual(secondStored.revision, 3);
  assertPayloadOperational(secondStored.payload, 8, 9, 4, OBS2);

  const unsynced = memoryStorage();
  unsynced.setItem(REPORT_ID_KEY, fx.reportId);
  unsynced.setItem(REGISTERED_KEY, '1');
  const draftSix = JSON.parse(JSON.stringify(secondStored.payload));
  draftSix.reportId = fx.reportId;
  draftSix.producao.abordagens.motocicletas = 6;
  unsynced.setItem(DRAFT_KEY, JSON.stringify(draftSix));
  const kept = await reopen(src, unsynced, gas);
  assert.strictEqual(kept.leaf('abordagens', 'motocicletas'), 8, 'redução local não sincronizada não substitui o positivo da Central');
  kept.setInput('abordagens', 'motocicletas', '6');
  const rectified = await kept.sandbox.centralRsdSaveProgression();
  assert.strictEqual(rectified, true, kept.el('rsdProgressaoStatus').textContent);
  const rectPost = kept.wires.filter(function (w) { return w.action === 'rsd-draft-sync'; }).pop();
  assert.strictEqual(leafOf(rectPost.body.rsd, 'abordagens', 'motocicletas'), 6);
  const rectGot = gas.post('rsd-get', { reportId: fx.reportId, module: 'RSD' });
  assert.strictEqual(rectGot.rsd.draftRevision, 4);
  assert.strictEqual(leafOf(rectGot.rsd, 'abordagens', 'motocicletas'), 6);
  assert.strictEqual(leafOf(rectGot.rsd, 'abordagens', 'automoveis'), 9);
  assert.strictEqual(String(rectGot.rsd.observacoes || ''), OBS2);
  const rectOcc = (rectGot.rsd.ocorrencias || []).find(function (o) { return o.id === OCC_ID; });
  assert.ok(rectOcc);

  await assertIsolation(src, gas, storage, fx);
  return { label: label, revisions: [1, 2, 3, 4] };
}

async function assertIsolation(src, gas, storageWithA, fxA) {
  const cases = [
    {
      name: 'guarnicao',
      fx: Object.assign({}, fxA, { reportId: fxA.reportId + '-b', serviceId: fxA.serviceId + '-b', nome: 'BASE 01', vtr: '8802' })
    },
    {
      name: 'companhia',
      fx: Object.assign({}, fxA, { reportId: fxA.reportId + '-c', serviceId: fxA.serviceId + '-c', companhiaNumero: 2, nome: 'BASE 02', vtr: '8803' })
    },
    {
      name: 'janela',
      fx: Object.assign({}, fxA, { reportId: fxA.reportId + '-d', serviceId: fxA.serviceId + '-d', data: '2026-10-03', nome: 'BASE 02', vtr: '8804' })
    }
  ];
  for (const item of cases) {
    const clean = memoryStorage();
    const starter = createPage(src, clean, gas);
    await startHeader(starter, gas, item.fx);
    const box = memoryStorage();
    box.setItem(DRAFT_KEY, storageWithA.getItem(DRAFT_KEY));
    box.setItem(REPORT_ID_KEY, item.fx.reportId);
    box.setItem(REGISTERED_KEY, '1');
    const opened = await reopen(src, box, gas);
    assert.strictEqual(opened.sandbox.reportId, item.fx.reportId, item.name);
    assert.strictEqual(opened.leaf('abordagens', 'motocicletas'), 0, item.name + ' motos de A');
    assert.strictEqual(opened.leaf('abordagens', 'automoveis'), 0, item.name + ' autos de A');
    assert.notStrictEqual(opened.el('observacoes').value, OBS, item.name + ' observação de A');
    assert.notStrictEqual(opened.el('observacoes').value, OBS2, item.name + ' observação posterior de A');
    const dyn = opened.sandbox.collectDynamic();
    assert.ok(!(dyn.ocorrencias || []).some(function (o) { return o.id === OCC_ID || o.descricao === OCC_DESC; }), item.name + ' ocorrência de A');
    assert.strictEqual(opened.el('guarnicao').value, item.fx.nome, item.name + ' guarnição');
    assert.strictEqual(opened.el('data').value, item.fx.data, item.name + ' data');
    assert.strictEqual(Number(opened.el('companhiaNumero').value), item.fx.companhiaNumero, item.name + ' companhia');
    assert.strictEqual(opened.sandbox.currentUnit().companhia, item.fx.companhiaNumero + 'ª CPRv', item.name + ' companhia canônica');
  }
}

function countCalls(src) {
  const needle = 'window.applyPayload(rsdPayloadForHydration(rp))';
  let n = 0;
  let i = 0;
  while ((i = src.indexOf(needle, i)) >= 0) { n++; i += needle.length; }
  return n;
}

(async function main() {
  try {
    await test('HTML padrão e iOS têm a mesma proteção de hidratação', function () {
      const tokens = [
        'function rsdPayloadForHydration(',
        'function salvarRascunhoGuarnicao(',
        'async function syncCloudDraft(',
        'async function recoverRegisteredServiceFromCloud(',
        'window.centralRsdSaveProgression=async function(){',
        'function payloadV2(',
        'function applyPayload(',
        'function collectProduction(',
        'function setProduction('
      ];
      tokens.forEach(function (token) {
        assert.strictEqual(normSrc(extractFn(ios, token)), normSrc(extractFn(html, token)), token);
      });
      assert.strictEqual(countCalls(html), 2);
      assert.strictEqual(countCalls(ios), 2);
      assert.ok(html.indexOf('rsd_local_draft_diag.js?v=10.8.41-progression-local') >= 0);
      assert.ok(ios.indexOf('rsd_local_draft_diag.js?v=10.8.41-progression-local') >= 0);
    });

    const std = await runScenario(html, 'padrao');
    console.log('OK roundtrip página padrão', std.revisions.join('→'));
    passed++;
    const iosRun = await runScenario(ios, 'ios');
    console.log('OK roundtrip página iOS', iosRun.revisions.join('→'));
    passed++;

    console.log('PASSED', passed);
  } catch (err) {
    console.error('FAIL', err && err.stack || err);
    process.exit(1);
  }
})();
