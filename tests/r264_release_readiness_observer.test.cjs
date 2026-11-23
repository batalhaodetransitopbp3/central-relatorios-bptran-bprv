'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),
 fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const gate=require('../R264_BO_EVIDENCE_INTAKE_NO_DEPLOY/r264_release_readiness_observer.cjs');
const sha='4f9ea78e29484d7883baecece01819d0e82dade1';
const fields=['R81_26_DEFINED','R81_8_CHECKPOINTS_DEFINED','LOCAL_BASELINE'];
function summary(passed=fields){
 const yes=new Set(passed);
 const checks=gate.IDS.map(id=>({id,passed:yes.has(id),
  ...(!yes.has(id)?{reason:'Not independently verified'}:{})}));
 return {marker:'R163_PROOF_BASED_CUTOVER_GATE',
  date:'2026-11-11',decision:'NO_GO',releaseAllowed:false,
  productionDeployExecuted:false,checks,
  passCount:checks.filter(c=>c.passed).length,
  failedCount:checks.filter(c=>!c.passed).length};
}
function view(overrides={}){
 return gate.observe({r163:summary(),branch:{sha,protected:false},
  google:{isolatedAccountIndependentlyApproved:false},...overrides});
}
test('R264 exactly mirrors the 16 independent R163 gate IDs',()=>{
 assert.equal(gate.CHECKS.length,16);
 assert.equal(gate.IDS.length,16);
 assert.equal(new Set(gate.IDS).size,16);
 assert.equal(gate.IDS.filter(s=>s.startsWith('EXTERNAL_')).length,6);
 assert(gate.IDS.includes('OUT_OF_BAND_INDEPENDENT_WITNESS'));
});
test('actual observed R163 status 3/16 remains NO-GO',()=>{
 const x=view();
 assert.equal(x.observedPrerequisites.total,16);
 assert.equal(x.observedPrerequisites.passCount,3);
 assert.equal(x.observedPrerequisites.failCount,13);
 assert.deepEqual(x.observedPrerequisites.passed,fields);
 assert.equal(x.productionRelease,'NO_GO');
 assert.equal(x.releaseAllowed,false);
 assert.equal(x.productionDeployExecuted,false);
});
test('unprotected default branch is flagged as a release blocker',()=>{
 const x=view();
 assert(x.repositoryProtection.warnings.includes(
  'MAIN_BRANCH_NOT_VERIFIABLY_PROTECTED'));
 assert(x.repositoryProtection.warnings.includes(
  'MAIN_REQUIRED_STATUS_CHECKS_NOT_VERIFIED'));
 assert.equal(x.repositoryProtection.sha,sha);
});
test('R264 reflects newly protected main but still flags absence of required CI',()=>{
 const r=gate.observe({r163:summary(),branch:{
  sha,protected:true,pullRequestReviewsEnforced:true,
  requiredCiEnforced:false,directPushRestricted:true,
  forcePushBlocked:true
 }});
 assert.equal(r.repositoryProtection.safeguards.protectionVerified,true);
 assert.equal(r.repositoryProtection.safeguards.codeReviewRulesVerified,true);
 assert.equal(r.repositoryProtection.safeguards.noDirectPushVerified,true);
 assert.equal(r.repositoryProtection.safeguards.noForcePushVerified,true);
 assert.deepEqual(r.repositoryProtection.warnings,[
  'MAIN_REQUIRED_STATUS_CHECKS_NOT_VERIFIED'
 ]);
 assert.equal(r.observedPrerequisites.passCount,3);
 assert.equal(r.observedPrerequisites.failCount,13);
 assert.equal(r.productionRelease,'NO_GO');
 assert.equal(r.releaseAllowed,false);
});
test('a source saying GO rather than actual R163 NO_GO must be rejected',()=>{
 const r=summary();r.decision='GO';
 assert.throws(()=>gate.observe({r163:r}),
  /R264_UNAPPROVED_R163_GO_OR_DEPLOY_CLAIM/);
});
test('a source saying it executed production deploy must be rejected',()=>{
 const r=summary();r.productionDeployExecuted=true;
 assert.throws(()=>gate.observe({r163:r}),
  /R264_UNAPPROVED_R163_GO_OR_DEPLOY_CLAIM/);
});
test('a source granting releaseAllowed is never accepted',()=>{
 const r=summary();r.releaseAllowed=true;
 assert.throws(()=>gate.observe({r163:r}),
  /R264_UNAPPROVED_R163_GO_OR_DEPLOY_CLAIM/);
});
test('unknown or duplicate check cannot be silently counted',()=>{
 const r=summary();r.checks[3].id=r.checks[2].id;
 assert.throws(()=>gate.observe({r163:r}),
  /R264_R163_UNKNOWN_DUPLICATE_OR_INVALID_CHECK/);
});
test('missing 16th check prevents issuing a summary',()=>{
 const r=summary();r.checks.pop();
 assert.throws(()=>gate.observe({r163:r}),/R264_R163_16_CHECKS_REQUIRED/);
});
test('inconsistent pass counts cannot overstate readiness',()=>{
 const r=summary();r.passCount=16;
 assert.throws(()=>gate.observe({r163:r}),
  /R264_R163_INTERNAL_COUNTS_INCONSISTENT/);
});
test('empty or missing input cannot become authorized state',()=>{
 assert.throws(()=>gate.observe({}),/R264_AUTHENTIC_R163_SUMMARY_REQUIRED/);
 assert.throws(()=>gate.observe({r163:{}}),
  /R264_AUTHENTIC_R163_SUMMARY_REQUIRED/);
});
test('all 16 self-attested checks DO NOT enable deployment',()=>{
 const r=summary(gate.IDS);
 const x=gate.observe({r163:r,branch:{
  sha,protected:true,pullRequestReviewsEnforced:true,
  requiredCiEnforced:true,directPushRestricted:true,
  forcePushBlocked:true},
  google:{isolatedAccountIndependentlyApproved:true,
   isolatedResourcesIndependentlyApproved:true,
   realGoogleWriteExecutedAndReviewed:true}});
 assert.equal(x.observedPrerequisites.passCount,16);
 assert.equal(x.repositoryProtection.warnings.length,0);
 assert.equal(x.googleStaging,'CLAIMED_APPROVAL_REQUIRES_EXTERNAL_AUDIT');
 assert.equal(x.productionRelease,'NO_GO');
 assert.equal(x.releaseAllowed,false);
 assert.equal(x.independentWitnessVerified,false);
 assert.equal(x.evidenceCanBeSelfCertified,false);
});
test('unverified Google test workspace is never treated as a real cloud test',()=>{
 const x=view();
 assert.equal(x.googleStaging,'ISOLATED_GOOGLE_STAGING_NOT_VERIFIED');
});
test('source marker mismatch is a hard refusal',()=>{
 const r=summary();r.marker='R999_FAKE_RELEASE_APPROVAL';
 assert.throws(()=>gate.observe({r163:r}),
  /R264_AUTHENTIC_R163_SUMMARY_REQUIRED/);
});
test('scrubs malformed SHA and avoids exposing arbitrary metadata',()=>{
 const x=gate.observe({r163:summary(),branch:{
  sha:'not-a-sha-INTERNAL_TOKEN_VALUE',protected:true,token:'secret!'},
  google:{credentials:'never print this'}});
 assert.equal(x.repositoryProtection.sha,null);
 assert(!JSON.stringify(x).includes('secret!'));
 assert(!JSON.stringify(x).includes('INTERNAL_TOKEN_VALUE'));
 assert(!JSON.stringify(x).includes('never print this'));
});
test('read-only JSON loader accepts a valid structure without JS evaluation',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'r264-readonly-'));
 try{
  const f=path.join(dir,'summary.json');
  fs.writeFileSync(f,JSON.stringify({r163:summary(),
   branch:{sha,protected:false}}));
  const x=gate.fromJsonFile(f);
  assert.equal(x.observedPrerequisites.failCount,13);
  assert.equal(x.releaseAllowed,false);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('PowerShell UTF-8 BOM cannot prevent reading a valid R163 summary',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'r264-utf8bom-'));
 try{
  const f=path.join(dir,'summary.json');
  fs.writeFileSync(f,'\uFEFF'+JSON.stringify({r163:summary(),branch:{sha}}));
  const x=gate.fromJsonFile(f);
  assert.equal(x.observedPrerequisites.passCount,3);
  assert.equal(x.productionRelease,'NO_GO');
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('empty JSON loader path refuses instead of guessing',()=>{
 assert.throws(()=>gate.fromJsonFile(''),/R264_INPUT_FILE_REQUIRED/);
});
test('R264 observer has no mutating Google, deploy or shell entrypoints',()=>{
 const exports=Object.keys(gate).sort();
 assert.deepEqual(exports,['CHECKS','IDS','fromJsonFile','observe']);
 assert.equal(typeof gate.deploy,'undefined');
 assert.equal(typeof gate.setBranchProtection,'undefined');
});
