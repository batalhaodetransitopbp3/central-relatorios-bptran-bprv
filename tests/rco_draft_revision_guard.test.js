'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const gas = fs.readFileSync(path.join(root, 'apps_script_v10.gs'), 'utf8');
const twin = fs.readFileSync(path.join(root, 'gas_deploy', 'Código.js'), 'utf8');
const desktop = fs.readFileSync(path.join(root, 'relatorio_cpu.html'), 'utf8');
const ios = fs.readFileSync(path.join(root, 'relatorio_cpu_ios.html'), 'utf8');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('OK', name);
}

function extract(src, name) {
  const start = src.indexOf('function ' + name);
  assert.ok(start >= 0, name);
  const next = src.indexOf('\nfunction ', start + 1);
  return src.slice(start, next > start ? next : src.length);
}

assert.strictEqual(twin, gas, 'apps_script_v10.gs e gas_deploy/Código.js divergiram');

const ctx = {
  rsdHasOwn_: function (obj, k) {
    return !!(obj && Object.prototype.hasOwnProperty.call(obj, k) && obj[k] != null && obj[k] !== '');
  }
};
vm.createContext(ctx);
vm.runInContext(
  extract(gas, 'rcoKnownRevisionPresent_') + '\n' +
  extract(gas, 'rcoKnownRevision_') + '\n' +
  extract(gas, 'rcoAssertDraftRevision_'),
  ctx
);

test('criação sem linha não exige revisão', function () {
  const out = ctx.rcoAssertDraftRevision_(null, 0, false);
  assert.strictEqual(out.ok, true);
  assert.strictEqual(out.current, 0);
  assert.strictEqual(out.known, 0);
});

test('linha antiga sem REVISAO ainda pode ser gravada uma vez', function () {
  const out = ctx.rcoAssertDraftRevision_({ REVISAO: '' }, 0, false);
  assert.strictEqual(out.ok, true);
  assert.strictEqual(out.current, 0);
});

test('página em cache, sem revisão, não grava quando a Central já tem revisão', function () {
  const out = ctx.rcoAssertDraftRevision_({ REVISAO: 4 }, 0, false);
  assert.strictEqual(out.ok, false);
  assert.strictEqual(out.reason, 'LEGACY_CLIENT_RELOAD_REQUIRED');
  assert.strictEqual(out.current, 4);
});

test('revisão antiga é recusada', function () {
  const out = ctx.rcoAssertDraftRevision_({ REVISAO: 4 }, 3, true);
  assert.strictEqual(out.ok, false);
  assert.strictEqual(out.reason, 'STALE_REVISION');
  assert.strictEqual(out.known, 3);
  assert.strictEqual(out.current, 4);
});

test('revisão adiantada também é recusada', function () {
  const out = ctx.rcoAssertDraftRevision_({ REVISAO: 4 }, 9, true);
  assert.strictEqual(out.reason, 'STALE_REVISION');
});

test('revisão atual é aceita', function () {
  const out = ctx.rcoAssertDraftRevision_({ REVISAO: 4 }, 4, true);
  assert.strictEqual(out.ok, true);
  assert.strictEqual(out.current, 4);
  assert.strictEqual(out.known, 4);
});

test('o campo só vale no envelope, não dentro do JSON do RCO', function () {
  assert.strictEqual(ctx.rcoKnownRevisionPresent_({ knownDraftRevision: 4 }), true);
  assert.strictEqual(ctx.rcoKnownRevisionPresent_({}), false);
  assert.strictEqual(ctx.rcoKnownRevision_({ draftRevision: '4' }), 4);
  assert.strictEqual(ctx.rcoKnownRevision_({ rco: { draftRevision: 4 } }), 0);
});

test('a recusa acontece antes de gravar e a assunção de aparelho não fura a revisão', function () {
  const fn = extract(gas, 'rcoDraftUpsert_');
  const gate = fn.indexOf('rcoAssertDraftRevision_');
  const lease = fn.indexOf('assertLease_');
  const persist = fn.indexOf('saveJsonPayload_');
  const markers = fn.indexOf('rcoDraftResolveConsolidateMarkers_');
  assert.ok(gate > 0 && gate < lease && lease < markers && markers < persist);
  assert.ok(fn.slice(gate, lease).indexOf('forceTakeover') < 0);
  assert.ok(fn.includes('Os dados já gravados na Central não foram alterados'));
  assert.ok(fn.includes('as alterações deste aparelho não foram apagadas'));
});

function cloudSlice(html) {
  const start = html.indexOf('function rcoRevisionStorageKey(');
  const end = html.indexOf('function scheduleRcoSync(', start);
  assert.ok(start > 0 && end > start);
  return html.slice(start, end);
}

test('desktop e iOS enviam a mesma revisão e preservam a tela', function () {
  assert.strictEqual(cloudSlice(desktop), cloudSlice(ios));
  const slice = cloudSlice(desktop);
  assert.ok(slice.includes('body.knownDraftRevision=known'));
  assert.ok(slice.includes('rcoRememberRevision(r.reportId||reportId,r.revision)'));
  const claim = 'rcoRememberRevision(item.reportId||r.rco?.state?.reportId||r.rco?.reportId,r.revision)';
  assert.ok(desktop.includes(claim) && ios.includes(claim));
  assert.ok(slice.includes('LEGACY_CLIENT_RELOAD_REQUIRED|STALE_REVISION'));
  assert.ok(slice.includes('As alterações deste aparelho continuam nesta tela'));
  assert.ok(!slice.includes('limparFormulario'));
  assert.ok(!slice.includes('localStorage.removeItem'));
});

console.log('rco_draft_revision_guard', passed, 'OK');
