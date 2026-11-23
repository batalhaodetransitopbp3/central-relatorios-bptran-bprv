'use strict';
/*
 * R265: conservative, read-only change allowlist for a protected main.
 * Until external R163 is authorized, this CI candidate ONLY accepts
 * documentation, tests and this exact CI baseline. It cannot issue GO.
 * It is not a replacement for GitHub's required independent PR reviews.
 */
const cp=require('node:child_process');

const BASE_RE=/^[a-f0-9]{40}$/i;
const PERMITTED_EXACT=new Set([
  '.gitignore',
  '.github/workflows/r265_central_main_baseline.yml',
  'ci/r265_main_source_change_guard.cjs',
  'tests/r265_main_source_change_guard.test.cjs'
]);
function validPath(name){
 return typeof name==='string' && name.length>=1 && name.length<=1024 &&
  !name.includes('\\') && !name.includes('\u0000') &&
  !name.startsWith('/') && !name.startsWith('../') &&
  !name.split('/').includes('..') && !name.split('/').includes('.');
}
function allowedPath(name){
 if(!validPath(name))return false;
 if(PERMITTED_EXACT.has(name))return true;
 if(/^(?:docs\/)?[A-Za-z0-9_./-]+\.md$/.test(name) &&
    !name.startsWith('.github/'))return true;
 if(/^tests\/[A-Za-z0-9_./-]+\.(?:test\.(?:js|cjs)|json)$/.test(name))
  return true;
 return false;
}
function evaluate(changed){
 if(!Array.isArray(changed)||!changed.length)
  return Object.freeze({result:'BLOCKED',reason:'EMPTY_CHANGE_SET',allowed:[],blocked:[],productionRelease:'NO_GO',releaseAllowed:false});
 const unique=[...new Set(changed)];
 const blocked=unique.filter(name=>!allowedPath(name));
 return Object.freeze({
  result:blocked.length?'BLOCKED':'ALLOW_NONPRODUCTION_REVIEW',
  reason:blocked.length?'PRODUCTION_SOURCE_OR_UNTRUSTED_PATH_CHANGED':'NO_PRODUCTION_FILES_CHANGED',
  allowed:unique.filter(allowedPath),blocked,
  productionRelease:'NO_GO',
  releaseAllowed:false,
  productionDeployExecuted:false
 });
}
function changedFiles(base,head='HEAD'){
 if(!BASE_RE.test(base))throw new Error('R265_MISSING_TRUSTED_BASE_SHA');
 if(head!=='HEAD')throw new Error('R265_UNTRUSTED_HEAD_REF');
 // No shell, literal validated SHA, and NUL output prevent filename injection.
 const out=cp.execFileSync('git',
  ['-c','core.quotePath=false','diff','--no-ext-diff','--name-only',
   '--diff-filter=ACDMRTUXB','-z',base,'HEAD'],
  {encoding:'utf8',maxBuffer:3e6,stdio:['ignore','pipe','pipe']});
 return out.split('\u0000').filter(Boolean);
}
if(require.main===module){
 try{
  const sha=process.env.R265_TRUSTED_BASE_SHA||'';
  const changed=changedFiles(sha);
  const outcome=evaluate(changed);
  console.log('R265_BASELINE_CHANGE_GATE',JSON.stringify(outcome));
  if(outcome.result!=='ALLOW_NONPRODUCTION_REVIEW')process.exitCode=3;
 }catch(error){
  console.error('R265_FAIL_CLOSED:',error.message);
  process.exitCode=4;
 }
}
module.exports={allowedPath,evaluate,changedFiles};
