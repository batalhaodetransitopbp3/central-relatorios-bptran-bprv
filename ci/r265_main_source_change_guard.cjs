'use strict';
/*
 * R265: conservative, read-only change allowlist for a protected main.
 * Until external R163 is authorized, only documentation/tests/the exact
 * CI baseline can be reviewed. This NEVER authorizes release or deploy.
 *
 * Security: git --name-only loses the SOURCE of a rename. Parse the
 * full raw diff, including original path, new path and both file modes.
 * A rename of apps_script_v10.gs to tests/payload.json must be blocked.
 */
const cp=require('node:child_process');

const BASE_RE=/^[a-f0-9]{40,64}$/i;
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
  return Object.freeze({result:'BLOCKED',reason:'EMPTY_CHANGE_SET',
   allowed:[],blocked:[],productionRelease:'NO_GO',
   releaseAllowed:false,productionDeployExecuted:false});
 const unique=[...new Set(changed)];
 const blocked=unique.filter(name=>!allowedPath(name));
 return Object.freeze({
  result:blocked.length?'BLOCKED':'ALLOW_NONPRODUCTION_REVIEW',
  reason:blocked.length?'PRODUCTION_SOURCE_OR_UNTRUSTED_PATH_CHANGED':
   'NO_PRODUCTION_FILES_CHANGED',
  allowed:unique.filter(allowedPath),blocked,
  productionRelease:'NO_GO',
  releaseAllowed:false,
  productionDeployExecuted:false
 });
}
function changedEntries(base,head='HEAD',cwd=process.cwd()){
 if(!BASE_RE.test(base))throw new Error('R265_MISSING_TRUSTED_BASE_SHA');
 if(head!=='HEAD')throw new Error('R265_UNTRUSTED_HEAD_REF');
 // Never use a shell. The base must be a 40/64-char object ID, not an
 // attacker-controlled ref, and the head must be the checked-out commit.
 const raw=cp.execFileSync('git',
  ['-c','core.quotePath=false','diff','--raw','--no-abbrev',
   '--no-ext-diff','--no-textconv','--find-renames','-z',
   '--diff-filter=ACDMRTUXB',base,'HEAD'],
  {encoding:'utf8',cwd,maxBuffer:3e6,stdio:['ignore','pipe','pipe']});
 if(!raw)return [];
 const tokens=raw.split('\u0000');
 if(tokens[tokens.length-1]!=='')
  throw new Error('R265_INVALID_GIT_RAW_TERMINATION');
 tokens.pop();
 const entries=[];
 let i=0;
 while(i<tokens.length){
  // Example:
  // :100644 100644 <oldsha> <newsha> R100\0old\0new\0
  const match=/^:([0-7]{6}) ([0-7]{6}) ([0-9a-f]{40,64}) ([0-9a-f]{40,64}) ([A-Z])([0-9]{0,3})$/.exec(tokens[i++]);
  if(!match)throw new Error('R265_INVALID_GIT_DIFF_RECORD');
  const [,oldMode,newMode,, ,status]=match;
  const source=tokens[i++];
  const renamed=status==='R'||status==='C';
  const destination=renamed?tokens[i++]:source;
  if(!validPath(source)||!validPath(destination))
   throw new Error('R265_INVALID_GIT_PATH');
  entries.push(Object.freeze({status,oldMode,newMode,source,destination}));
 }
 return entries;
}
function changedFiles(base,head='HEAD',cwd=process.cwd()){
 const paths=changedEntries(base,head,cwd).flatMap(e=>
  e.source===e.destination?[e.source]:[e.source,e.destination]);
 return [...new Set(paths)];
}
function evaluateEntries(entries){
 if(!Array.isArray(entries))
  throw new Error('R265_ENTRIES_REQUIRED');
 const names=[...new Set(entries.flatMap(e=>e&&e.source===e.destination?
  [e.source]:[e?.source,e?.destination]))];
 const paths=evaluate(names);
 const unsafe=entries.filter(e=>{
  if(!e||!['A','M','R','C'].includes(e.status))return true;
  // Regular files only. Block symlink 120000, gitlink 160000,
  // executable flag changes, and any file deletion until peer review.
  if(e.newMode!=='100644')return true;
  if(e.status==='A')return e.oldMode!=='000000';
  return e.oldMode!=='100644';
 });
 const blocked=[...new Set([
  ...paths.blocked,
  ...unsafe.flatMap(e=>e?[e.source,e.destination]:['INVALID_ENTRY'])
 ])].filter(Boolean);
 return Object.freeze({
  result:blocked.length?'BLOCKED':paths.result,
  reason:unsafe.length?'UNSAFE_GIT_FILE_MODE_OR_CHANGE_TYPE':paths.reason,
  allowed:paths.allowed.filter(x=>!blocked.includes(x)),
  blocked,
  productionRelease:'NO_GO',
  releaseAllowed:false,
  productionDeployExecuted:false
 });
}
if(require.main===module){
 try{
  const sha=process.env.R265_TRUSTED_BASE_SHA||'';
  const result=evaluateEntries(changedEntries(sha));
  console.log('R265_BASELINE_CHANGE_GATE',JSON.stringify(result));
  if(result.result!=='ALLOW_NONPRODUCTION_REVIEW')process.exitCode=3;
 }catch(error){
  console.error('R265_FAIL_CLOSED:',error.message);
  process.exitCode=4;
 }
}
module.exports={allowedPath,evaluate,changedFiles,changedEntries,evaluateEntries};
