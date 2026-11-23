'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const guard=require('../ci/r265_main_source_change_guard.cjs');
const BASE='4f9ea78e29484d7883baecece01819d0e82dade1';

test('allow only baseline CI, its guard, tests and Markdown documentation',()=>{
 for(const filename of [
  '.github/workflows/r265_central_main_baseline.yml',
  'ci/r265_main_source_change_guard.cjs',
  'tests/rco_metrics_cloud_divergence.test.js',
  'tests/r265_main_source_change_guard.test.cjs',
  'tests/synthetic_payload.json',
  'docs/R265_MAIN_CI_README.md',
  'README.md'
 ])assert.equal(guard.allowedPath(filename),true,filename);
});
test('fail closed for production Apps Script, core JS and HTML changes',()=>{
 for(const filename of [
  'apps_script_v10.gs','gas_deploy/Code.js','central_cloud.js',
  'boletim_ocorrencia_bptrans_1cprv.html',
  'boletim_ocorrencia_bptrans_1cprv_ios.html',
  'index.html','service_flow.js','relatorio_cpu.html'
 ])assert.equal(guard.allowedPath(filename),false,filename);
});
test('fail closed for alternate workflow or privileged configuration',()=>{
 for(const filename of [
  '.github/workflows/deploy.yml','.github/CODEOWNERS',
  '.github/workflows/r263_trusted_webkit_ci.yml',
  'ci/disable_release_gate.cjs','.env','.env.production',
  'gas_deploy/.clasp.json'
 ])assert.equal(guard.allowedPath(filename),false,filename);
});
test('reject unexpected absolute paths and parent traversal',()=>{
 for(const filename of [
  '../apps_script_v10.gs','tests/../apps_script_v10.gs',
  '/etc/passwd','C:\\Windows\\file','docs/./readme.md',
  'tests\\rco_metrics_cloud_divergence.test.js',
  '',null,undefined
 ])assert.equal(guard.allowedPath(filename),false,String(filename));
});
test('no changes cannot be used to create a successful gate',()=>{
 const state=guard.evaluate([]);
 assert.equal(state.result,'BLOCKED');
 assert.equal(state.productionRelease,'NO_GO');
 assert.equal(state.releaseAllowed,false);
});
test('single source production change blocks even when tests are modified',()=>{
 const state=guard.evaluate([
  'tests/rco_metrics_cloud_divergence.test.js',
  'apps_script_v10.gs'
 ]);
 assert.equal(state.result,'BLOCKED');
 assert.deepEqual(state.blocked,['apps_script_v10.gs']);
 assert.equal(state.releaseAllowed,false);
});
test('candidate only modifies allowed CI infrastructure and a synthetic test',()=>{
 const state=guard.evaluate([
  '.github/workflows/r265_central_main_baseline.yml',
  'ci/r265_main_source_change_guard.cjs',
  'tests/r265_main_source_change_guard.test.cjs',
  'tests/rco_metrics_cloud_divergence.test.js',
  'docs/R265_MAIN_CI_README.md'
 ]);
 assert.equal(state.result,'ALLOW_NONPRODUCTION_REVIEW');
 assert.deepEqual(state.blocked,[]);
 assert.equal(state.productionRelease,'NO_GO');
 assert.equal(state.releaseAllowed,false);
 assert.equal(state.productionDeployExecuted,false);
});
test('duplicates cannot change classification',()=>{
 const x=guard.evaluate(['README.md','README.md']);
 assert.equal(x.result,'ALLOW_NONPRODUCTION_REVIEW');
 assert.equal(x.allowed.length,1);
});
test('untrusted base SHAs cannot run a git diff',()=>{
 assert.throws(()=>guard.changedFiles('HEAD'),/R265_MISSING_TRUSTED_BASE_SHA/);
 assert.throws(()=>guard.changedFiles('main;rm -rf /'),/R265_MISSING_TRUSTED_BASE_SHA/);
 assert.throws(()=>guard.changedFiles(BASE,'origin/main'),/R265_UNTRUSTED_HEAD_REF/);
});
test('read-only git diff accepts validated original main SHA',()=>{
 const files=guard.changedFiles(BASE);
 assert(Array.isArray(files));
 assert(!files.some(f=>f.includes('\u0000')));
});
test('normal tests cannot silently authorize a production release',()=>{
 const result=guard.evaluate(['README.md']);
 assert.equal(result.releaseAllowed,false);
 assert.equal(result.productionRelease,'NO_GO');
 assert.equal(result.productionDeployExecuted,false);
});
