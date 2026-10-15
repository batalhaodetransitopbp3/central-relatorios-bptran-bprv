'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const vm = require('vm');
const root = path.join(__dirname, '..');
const cpu = fs.readFileSync(path.join(root, 'relatorio_cpu.html'), 'utf8');
const cpuIos = fs.readFileSync(path.join(root, 'relatorio_cpu_ios.html'), 'utf8');
const flow = fs.readFileSync(path.join(root, 'service_flow.js'), 'utf8');
const gas = fs.readFileSync(path.join(root, 'apps_script_v10.gs'), 'utf8');
const clasp = fs.readFileSync(path.join(root, 'gas_deploy', 'Código.js'), 'utf8');

function sliceFn(html, name, until) {
  const at = html.indexOf('function ' + name);
  const end = html.indexOf('function ' + until, at);
  if (at < 0 || end < 0) throw new Error('trecho ausente: ' + name);
  return html.slice(at, end);
}
const code = sliceFn(cpu, 'rcoClassifyModuleOrigins', 'rcoLinkedBlockHtml');
assert.strictEqual(sliceFn(cpuIos, 'rcoClassifyModuleOrigins', 'rcoLinkedBlockHtml'), code, 'desktop e iOS divergem no contrato');
const api = new Function(code + '\nreturn {rcoClassifyModuleOrigins,rcoRecordInScope,rcoStableLinkedId,rcoPayloadIds,rcoModuleContext,rcoPlanLinkedMerge};')();

function ok(name) { console.log('ok ', name); }
const scope = { batalhao: 'BPTran', companhia: '3ª CPTran', companhiaNumero: 3, operationalDate: '2026-10-08', guarnicao: 'BST 01', rcoReportId: 'cpu-rco-1', rsdReportIds: ['rsd-1', 'rsd-2'] };
function op(extra) {
  return Object.assign({ reportId: 'op-1', rcoReportId: 'cpu-rco-1', rsdReportId: 'rsd-2', serviceId: 'svc-2', segmento: 2, batalhao: 'BPTran', companhia: '3ª CPTran', data: '2026-10-08', guarnicao: 'BST 01' }, extra || {});
}

(function A_rsd_context() {
  const ctx = api.rcoModuleContext({ returnUrl: 'relatorio_cpu.html', rcoReportId: 'cpu-rco-1', guarnicao: 'BST 01', operationalDate: '2026-10-08', unidade: { batalhao: 'BPTran', companhia: '3ª CPTran', companhiaNumero: 3 }, vtrs: ['9157'], comandante: 'ALMEIDA', comandanteMatricula: '518.666-8' }, { rsdReportId: 'rsd-1', serviceId: 'svc-1', segmento: 2 });
  assert.strictEqual(ctx.returnModule, 'rco');
  assert.strictEqual(ctx.rcoReportId, 'cpu-rco-1');
  assert.strictEqual(ctx.rsdReportId, 'rsd-1');
  assert.strictEqual(ctx.serviceId, 'svc-1');
  assert.strictEqual(ctx.segmento, 2);
  assert.strictEqual(ctx.data, '2026-10-08');
  ok('A/G. contexto RSD preserva rcoReportId, rsdReportId e serviceId');
})();

(function D_cpu_context() {
  const ctx = api.rcoModuleContext({ returnUrl: 'relatorio_cpu.html', rcoReportId: 'cpu-rco-1', guarnicao: 'CPU', operationalDate: '2026-10-08', unidade: { batalhao: 'BPTran', companhia: '3ª CPTran', companhiaNumero: 3 }, comandante: 'ALMEIDA', comandanteMatricula: '518.666-8' }, null);
  assert.strictEqual(ctx.rsdReportId, '');
  assert.strictEqual(ctx.serviceId, '');
  assert.strictEqual(ctx.segmento, 1);
  assert.strictEqual(ctx.rcoReportId, 'cpu-rco-1');
  assert.strictEqual(ctx.guarnicao, 'CPU');
  ok('D/E/F. CPU sem RSD usa rcoReportId, segmento 1 e não inventa RSD');
})();

(function H_latest_segment() {
  const older = { rsdReportId: 'rsd-1', serviceId: 'svc-1', segmento: 1, status: 'EM_SERVICO', adicionadoEm: '2026-10-08T08:00:00Z' };
  const newer = { rsdReportId: 'rsd-2', serviceId: 'svc-2', segmento: 2, status: 'EM_SERVICO', adicionadoEm: '2026-10-08T12:00:00Z' };
  const found = api.rcoClassifyModuleOrigins([older, newer]);
  assert.strictEqual(found.mode, 'latest');
  assert.strictEqual(found.chosen.rsdReportId, 'rsd-2');
  assert.notStrictEqual(found.chosen.rsdReportId, older.rsdReportId);
  ok('H. múltiplos segmentos escolhem o mais recente, não o primeiro da lista');
})();

(function I_ambiguous() {
  const a = { rsdReportId: 'rsd-1', serviceId: 'svc-1', segmento: 2, status: 'EM_SERVICO', adicionadoEm: '2026-10-08T12:00:00Z' };
  const b = { rsdReportId: 'rsd-2', serviceId: 'svc-2', segmento: 2, status: 'EM_SERVICO', adicionadoEm: '2026-10-08T12:00:00Z' };
  const found = api.rcoClassifyModuleOrigins([a, b]);
  assert.strictEqual(found.ambiguous, true);
  assert.strictEqual(found.chosen, null);
  assert.strictEqual(found.options.length, 2);
  assert.ok(cpu.includes('Esta guarnição possui mais de um segmento de serviço.'));
  assert.ok(cpu.includes('Selecione o segmento ao qual este registro pertence.'));
  ok('I. empate de segmento pede escolha e não vincula sozinho');
})();

(function J_dedup_operation() {
  const first = api.rcoPlanLinkedMerge([], { operacoes: [op()] }, scope);
  assert.strictEqual(first.accept.length, 1);
  assert.strictEqual(first.accept[0].id, 'op-1');
  const second = api.rcoPlanLinkedMerge(first.ids, { operacoes: [op()] }, scope);
  assert.strictEqual(second.accept.length, 0);
  assert.strictEqual(second.reject[0].reason, 'duplicado');
  ok('J. operation reportId não duplica');
})();

(function K_dedup_cirvc() {
  const rec = { id: 'cirvc-abc', rcoReportId: 'cpu-rco-1', rsdReportId: 'rsd-1', batalhao: 'BPTran', companhia: '3ª CPTran', data: '2026-10-08', guarnicao: 'BST 01' };
  const first = api.rcoPlanLinkedMerge([], { cirvc: [rec] }, scope);
  const second = api.rcoPlanLinkedMerge(first.ids, { cirvc: [Object.assign({}, rec, { CIRVC_ID: 'cirvc-abc', id: '' })] }, scope);
  assert.strictEqual(first.accept.length, 1);
  assert.strictEqual(second.accept.length, 0);
  ok('K. CIRVC id não duplica');
})();

(function L_dedup_bo() {
  const rec = { referenciaId: 'PM2026123456', rcoReportId: 'cpu-rco-1', rsdReportId: 'rsd-1', batalhao: 'BPTran', companhia: '3ª CPTran', data: '2026-10-08', guarnicao: 'BST 01' };
  const first = api.rcoPlanLinkedMerge([], { boletins: [rec] }, scope);
  const second = api.rcoPlanLinkedMerge(first.ids, { boletins: [rec] }, scope);
  assert.strictEqual(api.rcoStableLinkedId('bopm', rec), 'PM2026123456');
  assert.strictEqual(second.reject[0].reason, 'duplicado');
  ok('L. BO referenciaId não duplica');
})();

(function M_snapshot_same_id() {
  const already = ['PM2026123456', 'op-1', 'cirvc-abc'];
  const plan = api.rcoPlanLinkedMerge(already, {
    operacoes: [op()],
    cirvc: [{ id: 'cirvc-abc', rcoReportId: 'cpu-rco-1', rsdReportId: 'rsd-1', batalhao: 'BPTran', companhia: '3ª CPTran', data: '2026-10-08', guarnicao: 'BST 01' }],
    boletins: [{ referenciaId: 'PM2026123456', rcoReportId: 'cpu-rco-1', rsdReportId: 'rsd-1', batalhao: 'BPTran', companhia: '3ª CPTran', data: '2026-10-08', guarnicao: 'BST 01' }]
  }, scope);
  assert.strictEqual(plan.accept.length, 0);
  ok('M. registro que já veio do RSD não entra de novo no refresh');
})();

(function N_same_id_as_import() {
  const direct = api.rcoPlanLinkedMerge([], { operacoes: [op({ reportId: 'op-9' })], boletins: [{ referenciaId: 'PM202600000009', numero: 'PM202600000009', rcoReportId: 'cpu-rco-1', rsdReportId: 'rsd-1', batalhao: 'BPTran', companhia: '3ª CPTran', data: '2026-10-08', guarnicao: 'BST 01' }] }, scope);
  const ids = new Set(direct.ids);
  const snapshot = { ocorrencias: [{ id: 'PM202600000009' }], operacoes: [{ id: 'op-9' }], arvc: [{ id: 'cirvc-keep' }] };
  const fromSnapshot = api.rcoPayloadIds(snapshot);
  assert.ok(fromSnapshot.has('op-9'));
  assert.ok(fromSnapshot.has('PM202600000009'));
  assert.ok(ids.has('op-9') && ids.has('PM202600000009'));
  const again = api.rcoPlanLinkedMerge([...ids], { operacoes: [op({ reportId: 'op-9' })] }, scope);
  assert.strictEqual(again.accept.length, 0);
  ok('N. o mesmo id do snapshot não duplica depois de Atualizar dados');
})();

(function O_central_not_local_store() {
  const fresh = api.rcoPlanLinkedMerge([], { operacoes: [op({ reportId: 'op-device-b' })] }, scope);
  assert.strictEqual(fresh.accept.length, 1);
  const refresh = cpu.slice(cpu.indexOf('async function centralRcoRefreshLinkedRecords'), cpu.indexOf('window.centralRcoRefreshLinkedRecords='));
  assert.ok(refresh.includes("jsonp('operation-list'"));
  assert.ok(refresh.includes("jsonp('cirvc-list'"));
  assert.ok(refresh.includes("jsonp('service-event-list'"));
  assert.ok(!refresh.includes('pmpb-transito-operacoes-dia-v1'));
  assert.ok(!refresh.includes('rebuildCloudGuarnicao'));
  assert.ok(!refresh.includes('importDailyV2'));
  assert.ok(!refresh.includes('productionMapV2'));
  assert.ok(!refresh.includes('addMetricMap'));
  assert.ok(!refresh.includes('g.metrics'));
  ok('O. aparelho B lê a Central; o refresh não reconstrói metrics');
})();

(function PQR_fail_closed() {
  const otherCompany = api.rcoPlanLinkedMerge([], { operacoes: [op({ companhia: '2ª CPTran', companhiaNumero: 2 })] }, scope);
  const otherDay = api.rcoPlanLinkedMerge([], { operacoes: [op({ data: '2026-10-09' })] }, scope);
  const otherGu = api.rcoPlanLinkedMerge([], { operacoes: [op({ guarnicao: 'BST 02' })] }, scope);
  const otherOrigin = api.rcoPlanLinkedMerge([], { operacoes: [op({ rsdReportId: 'rsd-outra' })] }, scope);
  assert.strictEqual(otherCompany.accept.length, 0);
  assert.strictEqual(otherDay.accept.length, 0);
  assert.strictEqual(otherGu.accept.length, 0);
  assert.strictEqual(otherOrigin.accept.length, 0);
  ok('P/Q/R. outra companhia, outro período, outra guarnição ou outra origem são rejeitados');
})();

(function S_metrics_untouched() {
  const metrics = { 'abordagens::pessoas': 4, 'notificacoes::art-165': 2 };
  const before = JSON.stringify(metrics);
  api.rcoPlanLinkedMerge([], { operacoes: [op()] }, scope);
  assert.strictEqual(JSON.stringify(metrics), before);
  ok('S. metrics manuais permanecem idênticos');
})();

(function T_save_around_navigation() {
  const open = cpu.slice(cpu.indexOf('async function rcoOpenLinkedModule'), cpu.indexOf('window.rcoOpenLinkedModule='));
  assert.ok(open.indexOf('centralRcoSaveProgression') < open.indexOf('location.href'));
  assert.ok(open.includes('Os dados deste aparelho não foram apagados.'));
  const refresh = cpu.slice(cpu.indexOf('async function centralRcoRefreshLinkedRecords'), cpu.indexOf('window.centralRcoRefreshLinkedRecords='));
  assert.ok(refresh.includes('centralRcoSaveProgression'));
  assert.ok(refresh.includes('importedRecordIds'));
  ok('T. salva a progressão antes de sair e depois de incorporar');
})();

(function UVW_service_flow() {
  assert.ok(flow.includes("new URLSearchParams({resumeRsd:'1'})"));
  assert.ok(flow.includes("new URLSearchParams({resumeRco:'1'})"));
  assert.ok(flow.includes("if(!c.serviceId||!c.rsdReportId)"));
  assert.ok(flow.includes("from:'rsd'"));
  const pages = flow.match(/const RETURN_PAGES=\/.+\/i;/);
  const fn = flow.match(/function safeReturnPage\(raw, fallback\)\{[\s\S]*?\n\}/);
  const safe = new Function(pages[0] + '\n' + fn[0] + '\nreturn safeReturnPage;')();
  assert.strictEqual(safe('relatorio_servico_diario.html', 'relatorio_cpu.html'), 'relatorio_servico_diario.html');
  assert.strictEqual(safe('relatorio_servico_diario_ios.html', 'relatorio_cpu.html'), 'relatorio_servico_diario_ios.html');
  assert.strictEqual(safe('relatorio_cpu.html', 'relatorio_servico_diario.html'), 'relatorio_cpu.html');
  assert.strictEqual(safe('relatorio_cpu_ios.html', 'relatorio_servico_diario.html'), 'relatorio_cpu_ios.html');
  assert.strictEqual(safe('https://evil.example/phish.html', 'relatorio_cpu.html'), 'relatorio_cpu.html');
  assert.strictEqual(safe('https://evil.example/relatorio_cpu.html', 'relatorio_servico_diario.html'), 'relatorio_cpu.html');
  assert.notStrictEqual(safe('https://evil.example/relatorio_cpu.html', 'relatorio_cpu.html'), 'https://evil.example/relatorio_cpu.html');
  assert.strictEqual(safe('javascript:alert(1)', 'relatorio_servico_diario.html'), 'relatorio_servico_diario.html');
  ok('U/V/W. retorno do RSD permanece; URL externa é rejeitada');
})();

(function ui_and_modules() {
  ['relatorio_cpu.html', 'relatorio_cpu_ios.html'].forEach(function (file) {
    const src = fs.readFileSync(path.join(root, file), 'utf8');
    assert.ok(src.includes('Registros vinculados'), file);
    assert.ok(src.includes('Registrar BOPM'), file);
    assert.ok(src.includes('Registrar operação'), file);
    assert.ok(src.includes('Registrar CIRVC'), file);
    assert.ok(src.includes('class="field span12 no-print rco-linked-box"'), file);
  });
  ['relatorio_operacao.html', 'relatorio_operacao_ios.html'].forEach(function (file) {
    const src = fs.readFileSync(path.join(root, file), 'utf8');
    assert.ok(src.includes('p.rcoReportId=ctx.rcoReportId||p.rcoReportId'), file);
    assert.ok(src.includes('p.rsdReportId=p.rsdReportId||ctx.rsdReportId'), file);
    assert.ok(src.includes('rcoApplyOperationRecord'), file);
  });
  ['auto_remocao_veiculos.html', 'auto_remocao_veiculos_ios.html'].forEach(function (file) {
    const src = fs.readFileSync(path.join(root, file), 'utf8');
    assert.ok(src.includes('rcoReportId:a.rcoReportId||ctx.rcoReportId'), file);
    assert.ok(src.includes('rsdReportId:a.rsdReportId||ctx.rsdReportId'), file);
  });
  assert.ok(flow.includes("anchor+'::BO::'+num"));
  assert.ok(flow.includes('Abrir módulo') === false);
  assert.ok(cpu.includes('>Abrir módulo</button>'));
  assert.ok(cpu.includes('>Ver / editar</button>'));
  assert.ok(cpu.includes("\\'bo\\',\\''+id+'\\')\">Abrir BOPM</button>"));
  assert.ok(cpuIos.includes("\\'bo\\',\\''+id+'\\')\">Abrir BOPM</button>"));
  assert.ok(!cpu.includes("\\'bo\\',\\''+id+'\\')\">Ver / editar</button>"));
  ok('UI. operação permanece Ver / editar; BOPM abre o módulo sem prometer o boletim completo');
})();

(function backend_contract() {
  function grab(src, name) {
    const at = src.indexOf('function ' + name);
    if (at < 0) throw new Error(name);
    const end = src.indexOf('\nfunction ', at + 12);
    return src.slice(at, end < 0 ? src.length : end);
  }
  ['operationUpsert_', 'operationList_', 'cirvcRegister_', 'cirvcList_', 'serviceEventUpsert_', 'serviceEventList_', 'rcoCanonicalDraft_', 'rcoRequireLinkedScope_', 'rcoLinkedScopeDecision_', 'rcoRowMatchesDraft_'].forEach(function (name) {
    const a = grab(gas, name);
    const b = grab(clasp, name);
    assert.ok(a.includes('rcoReportId') || a.includes('RCO_REPORT_ID') || a.includes('rcoCanonicalDraft_') || a.includes('rcoLinkedScopeDecision_'), name);
    assert.strictEqual(a, b, name + ' divergente entre apps_script e clasp');
  });
  assert.ok(gas.includes("var CENTRAL_V10_VERSION = '10.8.44.2-service-start-window'"));
  assert.ok(!gas.includes("CENTRAL_V10_VERSION = '10.8.38'"));
  assert.ok(gas.includes('RCO_REPORT_ID:incomingRco||old&&old.RCO_REPORT_ID||\'\''));
  assert.ok(gas.includes('if(!sid&&!rid&&!rco)throw new Error'));
  const up = grab(gas, 'operationUpsert_');
  assert.ok(up.indexOf('rcoRequireLinkedScope_') >= 0 && up.indexOf('rcoRequireLinkedScope_') < up.indexOf('upsert_(opSheet'));
  assert.ok(up.includes('RSD_REPORT_ID:p.rsdReportId||(p.contextoServico||{}).rsdReportId||(old&&old.RSD_REPORT_ID)||\'\''));
  assert.ok(up.includes('SERVICE_ID:p.serviceId||(p.contextoServico||{}).serviceId||(old&&old.SERVICE_ID)||\'\''));
  assert.ok(up.includes('eventAnchor=row.SERVICE_ID||row.RSD_REPORT_ID||row.RCO_REPORT_ID'));
  const cir = grab(gas, 'cirvcRegister_');
  assert.ok(cir.indexOf('rcoRequireLinkedScope_') >= 0 && cir.indexOf('rcoRequireLinkedScope_') < cir.indexOf("upsert_(s,'CIRVC_ID'"));
  const ev = grab(gas, 'serviceEventUpsert_');
  assert.ok(ev.indexOf('rcoRequireLinkedScope_') < ev.indexOf("upsert_(s,'EVENT_ID'"));
  const tmp = path.join(require('os').tmpdir(), 'codigo-linked-check.js');
  fs.writeFileSync(tmp, clasp);
  execSync('node --check ' + JSON.stringify(tmp), { stdio: 'pipe' });
  ok('backend. upsert/list aceitam rcoReportId e os dois arquivos coincidem');
})();

(function bo_event_id_rules() {
  assert.ok(flow.includes("const anchor=String(c.serviceId||'').trim()||String(c.rcoReportId||'').trim()"));
  assert.ok(flow.includes('eventId:anchor+\'::BO::\'+num') || flow.includes("eventId:anchor+'::BO::'+num"));
  ok('BOPM. com serviço usa serviceId; sem RSD o eventId usa rcoReportId');
})();

(function cache_bust() {
  ['relatorio_cpu.html', 'relatorio_cpu_ios.html', 'relatorio_operacao.html', 'relatorio_operacao_ios.html', 'auto_remocao_veiculos.html', 'auto_remocao_veiculos_ios.html', 'boletim_ocorrencia_bptrans_1cprv.html', 'boletim_ocorrencia_bptrans_1cprv_ios.html', 'relatorio_servico_diario.html', 'relatorio_servico_diario_ios.html'].forEach(function (file) {
    const src = fs.readFileSync(path.join(root, file), 'utf8');
    assert.ok(src.includes('service_flow.js?v=10.8.44-rco-linked-modules'), file);
    assert.ok(!src.includes('service_flow.js"') && !src.includes('service_flow.js?v=10.8.34') && !src.includes('service_flow.js?v=10.8.35') && !src.includes('service_flow.js?v=10.8.16'), file);
  });
  ok('cache. service_flow.js?v=10.8.44-rco-linked-modules nas páginas do fluxo e no RSD');
})();

(function backend_scope_AH() {
  function grab(src, name) {
    const at = src.indexOf('function ' + name);
    if (at < 0) throw new Error(name);
    const end = src.indexOf('\nfunction ', at + 12);
    return src.slice(at, end < 0 ? src.length : end);
  }
  const prelude = ['normBattalion_', 'strictYmdDate_', 'rcoCompanyKey_', 'rcoLinkedScopeDecision_', 'rcoRowMatchesDraft_'].map(function (name) { return grab(gas, name); }).join('\n');
  const api = new Function(prelude + '\nreturn {rcoLinkedScopeDecision_:rcoLinkedScopeDecision_,rcoRowMatchesDraft_:rcoRowMatchesDraft_};')();
  const requireLinked = new Function(prelude + '\nfunction rcoCanonicalDraft_(){return null}\n' + grab(gas, 'rcoRequireLinkedScope_') + '\nreturn rcoRequireLinkedScope_;')();
  const draft = { reportId: 'rco-3', batalhao: 'BPTran', companhia: '3ª CPTran', data: '2026-10-08' };
  const incoming = { batalhao: 'BPTran', companhia: '3ª CPTran', data: '2026-10-08' };
  assert.strictEqual(api.rcoLinkedScopeDecision_(null, incoming).reason, 'rco-ausente');
  assert.throws(function () { requireLinked('rco-inexistente', incoming); }, /não localizado/);
  ok('A. rcoReportId inexistente rejeita o vínculo');
  assert.strictEqual(api.rcoLinkedScopeDecision_(draft, { batalhao: 'BPTran', companhia: '1ª CPTran', data: '2026-10-08' }).reason, 'companhia');
  ok('B. RCO da 3ª CPTran rejeita registro da 1ª CPTran');
  assert.strictEqual(api.rcoLinkedScopeDecision_(draft, { batalhao: 'BPTran', companhia: '3ª CPTran', data: '2026-10-09' }).reason, 'data');
  ok('C. RCO de 08/10 rejeita registro de 09/10');
  assert.strictEqual(api.rcoLinkedScopeDecision_(draft, incoming).ok, true);
  ok('D. RCO correto aceita o vínculo da CPU');
  assert.strictEqual(api.rcoLinkedScopeDecision_(draft, incoming).ok, true);
  const up = grab(gas, 'operationUpsert_');
  assert.ok(up.includes('RSD_REPORT_ID:p.rsdReportId'));
  assert.ok(up.includes('SERVICE_ID:p.serviceId'));
  assert.ok(up.includes('RCO_REPORT_ID:incomingRco||old&&old.RCO_REPORT_ID'));
  ok('E. RCO correto preserva rcoReportId junto com rsdReportId e serviceId');
  const same = { RCO_REPORT_ID: 'rco-3', BATALHAO: 'BPTran', COMPANHIA: '3ª CPTran', DATA: '2026-10-08', GUARNICAO_RESPONSAVEL: 'BST 01' };
  const otherCompany = { RCO_REPORT_ID: 'rco-3', BATALHAO: 'BPTran', COMPANHIA: '1ª CPTran', DATA: '2026-10-08', GUARNICAO_RESPONSAVEL: 'BST 01' };
  assert.strictEqual(api.rcoRowMatchesDraft_(same, draft, ''), true);
  assert.strictEqual(api.rcoRowMatchesDraft_(otherCompany, draft, ''), false);
  assert.ok(grab(gas, 'operationList_').includes('if(rco&&!draft)return []'));
  ok('F. operation-list não devolve outra companhia');
  const otherDate = { RCO_REPORT_ID: 'rco-3', BATALHAO: 'BPTran', COMPANHIA: '3ª CPTran', DATA_EVENTO: '2026-10-09' };
  const sameDate = { RCO_REPORT_ID: 'rco-3', BATALHAO: 'BPTran', COMPANHIA: '3ª CPTran', DATA_EVENTO: '2026-10-08' };
  assert.strictEqual(api.rcoRowMatchesDraft_(sameDate, draft, ''), true);
  assert.strictEqual(api.rcoRowMatchesDraft_(otherDate, draft, ''), false);
  assert.ok(grab(gas, 'serviceEventList_').includes('if(rco&&!draft)return []'));
  ok('G. service-event-list não devolve outra data');
  const cirA = { RCO_REPORT_ID: 'rco-3', BATALHAO: 'BPTran', COMPANHIA: '3ª CPTran', DATA_CADASTRO: '2026-10-08', GUARNICAO: 'BST 01' };
  const cirB = { RCO_REPORT_ID: 'rco-3', BATALHAO: 'BPTran', COMPANHIA: '3ª CPTran', DATA_CADASTRO: '2026-10-08', GUARNICAO: 'BST 02' };
  assert.strictEqual(api.rcoRowMatchesDraft_(cirA, draft, 'BST 01'), true);
  assert.strictEqual(api.rcoRowMatchesDraft_(cirB, draft, 'BST 01'), false);
  assert.strictEqual(api.rcoRowMatchesDraft_(cirB, draft, ''), true);
  assert.ok(grab(gas, 'cirvcList_').includes('rcoRowMatchesDraft_(x,draft,p.guarnicao||\'\')'));
  ok('H. cirvc-list não devolve outra guarnição quando o filtro foi informado');
})();

(function TEST_DIRECT_LINKED_REBUILD() {
  function oneLine(html, name) {
    const at = html.indexOf(name);
    if (at < 0) throw new Error('ausente: ' + name);
    return html.slice(at, html.indexOf('\n', at));
  }
  function block(html, start, until) {
    const at = html.indexOf('function ' + start);
    const end = html.indexOf('function ' + until, at);
    if (at < 0 || end < 0) throw new Error(start);
    return html.slice(at, end);
  }
  assert.strictEqual(block(cpu, 'rcoRememberLinkedRecord', 'removeDynamicForGu'), block(cpuIos, 'rcoRememberLinkedRecord', 'removeDynamicForGu'));
  assert.strictEqual(oneLine(cpu, 'function rebuildCloudGuarnicao('), oneLine(cpuIos, 'function rebuildCloudGuarnicao('));
  const reapply = block(cpu, 'rcoReapplyLinkedRecords', 'removeDynamicForGu');
  assert.ok(!reapply.includes('addMetricMap') && !reapply.includes('rcoCloudPayloads') && !reapply.includes('.metrics'));
  function boot() {
    const sandbox = {
      console: console,
      state: { reportId: 'cpu-local', guarnicoes: {}, importedReportIds: [], importedRecordIds: [], rcoLinkedRecords: [] },
      origins: [],
      cloudPayloads: {},
      seen: new Set(),
      ops: [],
      cir: [],
      alert: function () {},
      confirm: function () { return true; },
      currentUnit: function () { return { batalhao: 'BPTran', companhia: '3ª CPTran', companhiaNumero: 3 }; },
      val: function () { return '2026-10-08'; },
      uid: function (p) { return p + '-test'; },
      fmtDateISO: function (v) { return v || ''; },
      appendText: function (a, b) { return a || b || ''; },
      renderGuarnicoes: function () {},
      renderMatrix: function () {},
      renderFisco: function () {},
      addCpuVehicle: function () {},
      validateImportedUnit: function () { return true; },
      productionMapV2: function () { return {}; },
      addMetricMap: function () {},
      num: function (v) { return Number(v) || 0; }
    };
    sandbox.globalThis = sandbox;
    sandbox.addCpuOperation = function (d) { sandbox.seen.add(String(d.id)); sandbox.ops.push(Object.assign({}, d)); };
    sandbox.addCpuArvc = function (d) { sandbox.seen.add(String(d.id)); sandbox.cir.push(Object.assign({}, d)); };
    function nodes(list) {
      return list.map(function (d) {
        return {
          querySelector: function (sel) { return String(sel).indexOf('guarnicao') >= 0 ? { value: d.guarnicao } : null; },
          remove: function () {
            const i = list.findIndex(function (x) { return x.id === d.id; });
            if (i >= 0) list.splice(i, 1);
            sandbox.seen.delete(String(d.id));
          }
        };
      });
    }
    sandbox.document = {
      getElementById: function () { return { value: '', textContent: '', checked: false }; },
      querySelector: function (sel) {
        const m = String(sel).match(/data-id="([^"]+)"/);
        return m && sandbox.seen.has(m[1]) ? { dataset: { id: m[1] } } : null;
      },
      querySelectorAll: function (sel) {
        if (String(sel).indexOf('cpuOperations') >= 0) return nodes(sandbox.ops);
        if (String(sel).indexOf('cpuArvcs') >= 0) return nodes(sandbox.cir);
        return [];
      }
    };
    vm.createContext(sandbox);
    vm.runInContext([
      'window=globalThis;',
      oneLine(cpu, 'function guId('),
      oneLine(cpu, 'function ensureGuarnicao('),
      oneLine(cpu, 'function dedupeAppend('),
      oneLine(cpu, 'function payloadIds('),
      oneLine(cpu, 'function importDailyV2('),
      block(cpu, 'rcoRememberLinkedRecord', 'removeDynamicForGu'),
      oneLine(cpu, 'function removeDynamicForGu('),
      oneLine(cpu, 'function clearCloudGuarnicao('),
      oneLine(cpu, 'function rebuildCloudGuarnicao(')
    ].join('\n'), sandbox);
    return sandbox;
  }
  function countKind(box, kind, id) {
    if (kind === 'operacao') return box.ops.filter(function (x) { return String(x.id) === id; }).length;
    if (kind === 'cirvc') return box.cir.filter(function (x) { return String(x.id) === id; }).length;
    let n = 0;
    Object.keys(box.state.guarnicoes || {}).forEach(function (k) {
      (box.state.guarnicoes[k].ocorrencias || []).forEach(function (o) {
        if (String(o.id || '') === id || String(o.referenciaId || '') === id) n += 1;
      });
    });
    return n;
  }
  function arm(box, includeId) {
    box.origins = [{ rsdReportId: 'rsd-old', guarnicao: 'BST 01', segmento: 1, recordIds: ['somente-snapshot'] }];
    const snap = {
      reportId: 'rsd-old',
      unidade: { batalhao: 'BPTran', companhia: '3ª CPTran', companhiaNumero: 3 },
      guarnicao: { nome: 'BST 01' },
      producao: {},
      ocorrencias: includeId && includeId.kind === 'bopm' ? [{ id: includeId.id, referenciaId: includeId.id, tipo: 'BO', numero: includeId.id, descricao: 'furto' }] : [],
      operacoes: includeId && includeId.kind === 'operacao' ? [{ id: includeId.id, nome: 'Op X', incluirNoCpu: true }] : [],
      cirvc: includeId && includeId.kind === 'cirvc' ? [{ id: includeId.id, placa: 'ABC1D23', numeroTermo: '1' }] : [],
      observacoes: ''
    };
    box.cloudPayloads = { 'rsd-old': snap };
  }
  function receive(box, kind, id) {
    const data = kind === 'operacao' ? { nome: 'Op X' } : kind === 'cirvc' ? { placa: 'ABC1D23', numeroTermo: '1', data: '2026-10-08' } : { numero: id, descricao: 'furto', data: '2026-10-08', hora: '10:00', tipificacao: '', tcoSasp: 'Não', numeroTco: '' };
    box.rcoRememberLinkedRecord({ id: id, kind: kind, guarnicao: 'BST 01', data: data });
    if (kind === 'operacao') box.addCpuOperation(Object.assign({ id: id, guarnicao: 'BST 01' }, data));
    else if (kind === 'cirvc') box.addCpuArvc(Object.assign({ id: id, guarnicao: 'BST 01' }, data));
    else {
      const g = box.ensureGuarnicao('BST 01');
      g.ocorrencias.push(Object.assign({ id: id, referenciaId: id, tipo: 'BO' }, data));
    }
    if (box.state.importedRecordIds.indexOf(id) < 0) box.state.importedRecordIds.push(id);
  }
  ['operacao', 'cirvc', 'bopm'].forEach(function (kind) {
    const id = 'direct-' + kind;
    const box = boot();
    arm(box, null);
    receive(box, kind, id);
    const saved = JSON.parse(JSON.stringify({ state: box.state, origins: box.origins, cloudPayloads: box.cloudPayloads }));
    box.rebuildCloudGuarnicao('BST 01');
    assert.strictEqual(countKind(box, kind, id), 1, 'TEST_DIRECT_LINKED_SURVIVES_OLD_SNAPSHOT_REBUILD ' + kind);
    assert.strictEqual(box.state.rcoLinkedRecords.filter(function (r) { return r.id === id; }).length, 1);
    const again = boot();
    again.state = JSON.parse(JSON.stringify(saved.state));
    again.origins = JSON.parse(JSON.stringify(saved.origins));
    again.cloudPayloads = JSON.parse(JSON.stringify(saved.cloudPayloads));
    again.ops = [];
    again.cir = [];
    again.seen.clear();
    again.rebuildCloudGuarnicao('BST 01');
    assert.strictEqual(countKind(again, kind, id), 1, 'save → reopen → rebuild ' + kind);
    const later = boot();
    arm(later, { kind: kind, id: id });
    receive(later, kind, id);
    later.rebuildCloudGuarnicao('BST 01');
    assert.strictEqual(countKind(later, kind, id), 1, 'TEST_DIRECT_LINKED_THEN_SNAPSHOT_CONTAINS_SAME_ID ' + kind);
  });
  ok('TEST_DIRECT_LINKED_SURVIVES_OLD_SNAPSHOT_REBUILD e TEST_DIRECT_LINKED_THEN_SNAPSHOT_CONTAINS_SAME_ID para operação, CIRVC e BOPM, inclusive save/reopen/rebuild');
})();

console.log('rco_linked_modules: OK');
