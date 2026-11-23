'use strict';
/**
 * R265 security regression: actual ephemeral Git repositories, not mocked
 * paths. They contain synthetic text only; never touch the operational repo.
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const cp=require('node:child_process');
const gate=require('../ci/r265_main_source_change_guard.cjs');

function sandbox(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'r265-git-check-'));
 function git(...args){
  return cp.execFileSync('git',['-C',dir,...args],{
   encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 }
 git('init','-q');
 git('config','user.name','R265 Synthetic Test');
 git('config','user.email','r265-synthetic@example.invalid');
 function put(name,content){
  const target=path.join(dir,...name.split('/'));
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target,content);
 }
 function commit(message='synthetic'){
  git('add','-A');git('commit','-qm',message);return git('rev-parse','HEAD');
 }
 function cleanup(){
  fs.rmSync(dir,{recursive:true,force:true,maxRetries:20,retryDelay:50});
 }
 return {dir,git,put,commit,cleanup};
}
test('moving real app code under tests cannot evade the path guard',()=>{
 const s=sandbox();
 try{
  s.put('apps_script_v10.gs','synthetic non-operational source');
  const base=s.commit('baseline');
  s.put('tests/keep.json','{"synthetic":true}');
  s.git('mv','apps_script_v10.gs','tests/app_moved.json');
  s.commit('rename');
  const records=gate.changedEntries(base,'HEAD',s.dir);
  const moved=records.find(x=>x.status==='R');
  assert(moved,'Git must recognize pure rename as R100');
  assert.equal(moved.source,'apps_script_v10.gs');
  assert.equal(moved.destination,'tests/app_moved.json');
  const paths=gate.changedFiles(base,'HEAD',s.dir);
  assert(paths.includes('apps_script_v10.gs'));
  assert(paths.includes('tests/app_moved.json'));
  const decision=gate.evaluateEntries(records);
  assert.equal(decision.result,'BLOCKED');
  assert(decision.blocked.includes('apps_script_v10.gs'));
  assert.equal(decision.releaseAllowed,false);
 }finally{s.cleanup()}
});
test('deleting a protected script cannot become an allowed change',()=>{
 const s=sandbox();
 try{
  s.put('apps_script_v10.gs','synthetic app placeholder');
  const base=s.commit();
  s.git('rm','apps_script_v10.gs');s.commit('delete');
  const decision=gate.evaluateEntries(gate.changedEntries(base,'HEAD',s.dir));
  assert.equal(decision.result,'BLOCKED');
  assert(decision.blocked.includes('apps_script_v10.gs'));
 }finally{s.cleanup()}
});
test('test deletion is denied because it reduces coverage',()=>{
 const s=sandbox();
 try{
  s.put('tests/rco.test.js','synthetic test placeholder');
  const base=s.commit();
  s.git('rm','tests/rco.test.js');s.commit('delete test');
  const decision=gate.evaluateEntries(gate.changedEntries(base,'HEAD',s.dir));
  assert.equal(decision.result,'BLOCKED');
  assert.equal(decision.reason,'UNSAFE_GIT_FILE_MODE_OR_CHANGE_TYPE');
 }finally{s.cleanup()}
});
test('a symlink under an allowed test name is denied by Git file mode',()=>{
 const s=sandbox();
 try{
  s.put('README.md','synthetic');
  const base=s.commit();
  const blob=cp.execFileSync('git',['-C',s.dir,'hash-object','-w','--stdin'],{
   input:'../../apps_script_v10.gs',encoding:'utf8'}).trim();
  s.git('update-index','--add','--cacheinfo',
   '120000,'+blob+',tests/redirect.test.js');
  s.git('commit','-qm','synthetic symbolic link mode');
  const records=gate.changedEntries(base,'HEAD',s.dir);
  assert.equal(records.length,1);
  assert.equal(records[0].newMode,'120000');
  const decision=gate.evaluateEntries(records);
  assert.equal(decision.result,'BLOCKED');
  assert(decision.blocked.includes('tests/redirect.test.js'));
 }finally{s.cleanup()}
});
test('mode changes that mark tests executable are denied',()=>{
 const s=sandbox();
 try{
  s.put('tests/example.test.js','console.log("synthetic")');
  const base=s.commit();
  s.git('update-index','--chmod=+x','tests/example.test.js');
  s.git('commit','-qm','change mode only');
  const records=gate.changedEntries(base,'HEAD',s.dir);
  assert.equal(records.length,1);
  assert.equal(records[0].oldMode,'100644');
  assert.equal(records[0].newMode,'100755');
  assert.equal(gate.evaluateEntries(records).result,'BLOCKED');
 }finally{s.cleanup()}
});
test('safe new test and documentation changes remain reviewable, never GO',()=>{
 const s=sandbox();
 try{
  s.put('README.md','original synthetic documentation');
  const base=s.commit();
  s.put('README.md','revised synthetic documentation');
  s.put('tests/fake.test.js','console.log("synthetic")');
  s.commit('documentation and test only');
  const decision=gate.evaluateEntries(gate.changedEntries(base,'HEAD',s.dir));
  assert.equal(decision.result,'ALLOW_NONPRODUCTION_REVIEW');
  assert.deepEqual(decision.blocked,[]);
  assert.equal(decision.productionRelease,'NO_GO');
  assert.equal(decision.releaseAllowed,false);
  assert.equal(decision.productionDeployExecuted,false);
 }finally{s.cleanup()}
});
test('renaming one allowed test to another allowed test checks both paths',()=>{
 const s=sandbox();
 try{
  s.put('tests/old.test.js','synthetic test, source and destination allowed');
  const base=s.commit();
  s.git('mv','tests/old.test.js','tests/new.test.js');
  s.commit('rename tests');
  const paths=gate.changedFiles(base,'HEAD',s.dir);
  assert.deepEqual(paths,['tests/old.test.js','tests/new.test.js']);
  const result=gate.evaluateEntries(gate.changedEntries(base,'HEAD',s.dir));
  assert.equal(result.result,'ALLOW_NONPRODUCTION_REVIEW');
  assert.equal(result.releaseAllowed,false);
 }finally{s.cleanup()}
});
