'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const gas = fs.readFileSync(path.join(root, 'apps_script_v10.gs'), 'utf8');
const clasp = fs.readFileSync(path.join(root, 'gas_deploy', 'Código.js'), 'utf8');
const rsdDesk = fs.readFileSync(path.join(root, 'relatorio_servico_diario.html'), 'utf8');
const rsdIos = fs.readFileSync(path.join(root, 'relatorio_servico_diario_ios.html'), 'utf8');
const cpuDesk = fs.readFileSync(path.join(root, 'relatorio_cpu.html'), 'utf8');
const cpuIos = fs.readFileSync(path.join(root, 'relatorio_cpu_ios.html'), 'utf8');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('OK', name);
}

function extractFunction(src, name) {
  const token = 'function ' + name + '(';
  const start = src.indexOf(token);
  if (start < 0) throw new Error('função ausente: ' + name);
  let i = src.indexOf('{', start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error('função sem fechamento: ' + name);
}

function formatDate(date, tz, pattern) {
  const timeZone = tz === 'UTC' ? 'UTC' : 'America/Fortaleza';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hourCycle: 'h23', minute: '2-digit', second: '2-digit'
  }).formatToParts(date);
  const g = function (type) { return parts.find(function (p) { return p.type === type; }).value; };
  if (pattern === 'yyyy-MM-dd') return g('year') + '-' + g('month') + '-' + g('day');
  if (pattern === 'H') return String(Number(g('hour')));
  throw new Error('formato não usado no teste: ' + pattern);
}

const names = [
  'rsdOpenEditableStatuses_', 'normVtrPrefix_', 'normGuarnicaoTipo_', 'guarnicaoTipoFromNome_',
  'padGuarnicaoOrdem_', 'normalizeGuarnicaoNome_', 'normBattalion_', 'dateText_',
  'sheetDateSerialYmd_', 'addCalendarDaysYmd_', 'getServiceWindow_', 'operationalServiceDate_',
  'rsdDateTokenFilled_', 'quotedMidnightSpOperationalYmd_', 'explicitYmd_',
  'parseExistingServiceInstant_', 'resolveExistingOperationalDate_', 'strictYmdDate_',
  'rsdStoredOperationalYmd_', 'rsdOpenVtrConflictRows_'
];
const script = 'var SERVICE_WINDOW_HOUR_=7;\nfunction scriptTz_(){return "America/Fortaleza";}\n' +
  names.map(function (n) { return extractFunction(gas, n); }).join('\n');
const sandbox = { Utilities: { formatDate: formatDate }, Date: Date, Object: Object, String: String, Number: Number, isNaN: isNaN, isFinite: isFinite };
vm.createContext(sandbox);
vm.runInContext(script, sandbox);

function row(extra) {
  return Object.assign({
    REPORT_ID: 'sd-1', STATUS: 'EM_SERVICO', VTR_PRINCIPAL: '8564',
    DATA_SERVICO: '2026-10-13', INICIADO_EM: '2026-10-14T09:59:50.340Z',
    BATALHAO: 'BPTran', COMPANHIA: '5ª CPTran', GUARNICAO: 'BASE 01', GUARNICAO_TIPO: 'BASE'
  }, extra);
}
function conflicts(rows, extra) {
  return sandbox.rsdOpenVtrConflictRows_(rows, Object.assign({
    data: '2026-10-14', vtr: '8564', batalhao: 'BPTran', companhia: '5ª CPTran', guarnicao: 'BASE 02', tipo: 'BASE'
  }, extra));
}

test('backends permanecem idênticos', function () {
  assert.strictEqual(gas, clasp);
});

test('versão publicada e a credencial do RCO permanecem', function () {
  assert.ok(gas.includes("var CENTRAL_V10_VERSION = '10.8.44.2-service-start-window';"));
  assert.strictEqual(gas.split("p.rcoReportId ? 'rco' : 'central'").length - 1, 3);
});

test('a mensagem antiga de VTR não bloqueia mais o início', function () {
  assert.ok(!gas.includes('já aparece em outro serviço nesta unidade e data'));
  assert.ok(gas.includes('ownStartAllowed:true'));
  assert.ok(gas.includes('serviço aberto de outra guarnição'));
});

test('caso 2: VTR encerrada em análise não impede outra guarnição no dia seguinte', function () {
  const closed = row({ STATUS: 'AGUARDANDO_ANALISE' });
  assert.strictEqual(conflicts([closed]).length, 0);
  assert.strictEqual(conflicts([closed], { data: '2026-10-13' }).length, 0);
});

test('a mesma VTR em serviço aberto de outra guarnição continua visível', function () {
  const hit = conflicts([row()], { data: '2026-10-13' });
  assert.strictEqual(hit.length, 1);
  assert.strictEqual(hit[0].GUARNICAO, 'BASE 01');
});

test('a própria guarnição aberta não entra no aviso de VTR', function () {
  assert.strictEqual(conflicts([row()], { data: '2026-10-13', guarnicao: 'BASE 01' }).length, 0);
});

test('serviço finalizado e data histórica não bloqueiam o período novo', function () {
  assert.strictEqual(conflicts([row({ STATUS: 'FINALIZADO' })], { data: '2026-10-13' }).length, 0);
  assert.strictEqual(conflicts([row({ DATA_SERVICO: '2026-10-02' })]).length, 0);
});

test('instante ISO antes das 07h pertence ao período anterior', function () {
  const iso = row({ DATA_SERVICO: '2026-10-14T09:59:50.340Z' });
  assert.strictEqual(sandbox.rsdStoredOperationalYmd_(iso.DATA_SERVICO, iso.INICIADO_EM), '2026-10-13');
  assert.strictEqual(conflicts([iso], { data: '2026-10-14' }).length, 0);
  assert.strictEqual(conflicts([iso], { data: '2026-10-13' }).length, 1);
});

test('data com aspas de meia-noite local permanece no dia civil', function () {
  const quoted = row({ DATA_SERVICO: '"2026-10-13T03:00:00.000Z"' });
  assert.strictEqual(sandbox.rsdStoredOperationalYmd_(quoted.DATA_SERVICO, ''), '2026-10-13');
  assert.strictEqual(conflicts([quoted], { data: '2026-10-14' }).length, 0);
});

test('07:00 abre o novo período e 06:59 permanece no anterior', function () {
  assert.strictEqual(sandbox.getServiceWindow_(new Date('2026-10-14T09:59:50.340Z')).operationalDate, '2026-10-13');
  assert.strictEqual(sandbox.getServiceWindow_(new Date('2026-10-14T10:00:00.000Z')).operationalDate, '2026-10-14');
});

test('RCO sem responsável não é criado e o canônico continua único', function () {
  assert.ok(gas.includes("outcome:'AWAITING_RESPONSIBLE'"));
  assert.ok(gas.includes('Nenhum relatório foi criado agora'));
  assert.ok(gas.includes("uniq.outcome==='EXISTING'"));
  assert.ok(gas.includes('Já existe RCO em andamento'));
});

test('desktop e iOS oferecem iniciar a própria guarnição e atualizam a data automática', function () {
  [rsdDesk, rsdIos].forEach(function (html) {
    assert.ok(html.includes('id="rsdDupOwn">Iniciar o serviço desta guarnição'));
    assert.ok(html.includes('acknowledgeVtrConflict=true'));
    assert.ok(html.includes('dataset.autoOperational'));
    assert.ok(!html.includes('já aparece em outro serviço nesta unidade e data'));
  });
});

test('desktop e iOS abrem o RCO canônico sem o alerta de bloqueio', function () {
  [cpuDesk, cpuIos].forEach(function (html) {
    assert.ok(html.includes('AWAITING_RESPONSIBLE'));
    assert.ok(html.includes('uniqueness:true'));
    assert.ok(html.includes('Os dados salvos foram preservados'));
    assert.ok(!html.includes('Já existe RCO em andamento para esta unidade e data. Abrindo o relatório canônico.'));
    assert.ok(html.includes('RCO carregado da nuvem. Identifique o responsável que continuará este RCO antes de editar ou consolidar.'));
  });
});

console.log('service-start-window', passed);
