'use strict';
/**
 * R264 — read-only, non-authorizing release readiness observer.
 *
 * The R163 independent gate remains the authoritative NO_GO input.
 * This module never issues a GO, never executes deploy, never updates
 * branch protection and never treats self-asserted claims as approvals.
 * Accepts only safe summaries; avoid credentials / resource identifiers.
 */
const fs=require('node:fs');
const path=require('node:path');
const CHECKS=Object.freeze([
 ['R81_26_DEFINED','STAGING_CASES','26 scenarios enumerated in R81'],
 ['R81_EXTERNAL_CASE_EVIDENCE','STAGING_CASES','26 real Google scenarios independently reviewed'],
 ['R81_8_CHECKPOINTS_DEFINED','STAGING_CHECKPOINTS','Eight independent checkpoints enumerated'],
 ['R81_8_CHECKPOINTS_APPROVED','STAGING_CHECKPOINTS','Eight checkpoints supported by independent proof'],
 ['STAGING_APPROVAL','INSTITUTIONAL_APPROVAL','Separate staging access approved by two reviewers'],
 ['DEPLOY_APPROVAL','INSTITUTIONAL_APPROVAL','Express institutional deployment approval'],
 ['R82_EXTERNAL_GATE','EXTERNAL_GATES','R82 performed in authorized isolated Google environment'],
 ['LOCAL_BASELINE','LOCAL_CODE','R162 local code baseline checks passed'],
 ['R162_RELEASE_GATE','EXTERNAL_GATES','R162 independent production release gate'],
 ['EXTERNAL_activeWriterInventory','PRODUCTION_CUSTODY','Identify authorized writers and decommission unsafe paths'],
 ['EXTERNAL_restorableBackup','PRODUCTION_CUSTODY','Restore evidence and BO integrity in staging'],
 ['EXTERNAL_crossModuleStagingRoundtrip','PRODUCTION_CUSTODY','Index/RSD/RCO canonical round-trip in isolated Google staging'],
 ['EXTERNAL_offlineLegacyRequestIdReconciliation','PRODUCTION_CUSTODY','Reconcile old request IDs and collision/replay behavior'],
 ['EXTERNAL_physicalMobileAndPdfReview','PHYSICAL_DEVICES','Actual Android/iOS and PDF inspection signed'],
 ['EXTERNAL_independentSecuritySignoff','EXTERNAL_GATES','Security, LGPD, retention and custody signoff'],
 ['OUT_OF_BAND_INDEPENDENT_WITNESS','EXTERNAL_GATES','Independent witness signs separate release change control']
]);
const IDS=Object.freeze(CHECKS.map(x=>x[0]));
const EXPECTED_CHECKS=new Set(IDS);
const SOURCE_MARKER='R163_PROOF_BASED_CUTOVER_GATE';
function assert(v,reason){if(!v){const e=new Error('R264_'+reason);e.code=reason;throw e}}
function isText(v){return typeof v==='string'&&v.trim().length>0}
function safeSha(v){return typeof v==='string'&&/^[0-9a-f]{40}$/i.test(v)}
function observe({r163,branch,google}={}){
 assert(r163&&r163.marker===SOURCE_MARKER,'AUTHENTIC_R163_SUMMARY_REQUIRED');
 assert(Array.isArray(r163.checks)&&r163.checks.length===IDS.length,
  'R163_16_CHECKS_REQUIRED');
 const rowmap=new Map();
 for(const c of r163.checks){
  assert(c&&isText(c.id)&&EXPECTED_CHECKS.has(c.id)&&
   !rowmap.has(c.id)&&typeof c.passed==='boolean',
   'R163_UNKNOWN_DUPLICATE_OR_INVALID_CHECK');
  rowmap.set(c.id,c);
 }
 assert(IDS.every(id=>rowmap.has(id)),'R163_CHECKLIST_INCOMPLETE');
 assert(r163.decision==='NO_GO'&&r163.releaseAllowed===false&&
   r163.productionDeployExecuted===false,
   'UNAPPROVED_R163_GO_OR_DEPLOY_CLAIM');
 const passed=IDS.filter(id=>rowmap.get(id).passed);
 const failures=CHECKS.filter(x=>!rowmap.get(x[0]).passed).map(x=>Object.freeze({
  id:x[0],category:x[1],requiredProof:x[2],
  reason:isText(rowmap.get(x[0]).reason)?rowmap.get(x[0]).reason:
   'Independent proof is missing'
 }));
 assert(passed.length===r163.passCount&&
   failures.length===r163.failedCount,
   'R163_INTERNAL_COUNTS_INCONSISTENT');
 const branchState=branch||{};
 // Never trust a textual assertion saying a branch is protected; branch
 // metadata must come from a read-only GitHub API response.
 const primarySafeguards={
  protectionVerified:branchState.protected===true,
  codeReviewRulesVerified:branchState.pullRequestReviewsEnforced===true,
  requiredCiVerified:branchState.requiredCiEnforced===true,
  noDirectPushVerified:branchState.directPushRestricted===true,
  noForcePushVerified:branchState.forcePushBlocked===true,
  releaseApprovalOutsideLocalCode:false
 };
 const branchWarnings=[];
 if(!primarySafeguards.protectionVerified)
  branchWarnings.push('MAIN_BRANCH_NOT_VERIFIABLY_PROTECTED');
 if(!primarySafeguards.codeReviewRulesVerified)
  branchWarnings.push('MAIN_PR_REVIEW_NOT_VERIFIABLY_REQUIRED');
 if(!primarySafeguards.requiredCiVerified)
  branchWarnings.push('MAIN_REQUIRED_STATUS_CHECKS_NOT_VERIFIED');
 if(!primarySafeguards.noDirectPushVerified)
  branchWarnings.push('MAIN_DIRECT_PUSH_NOT_VERIFIABLY_RESTRICTED');
 if(!primarySafeguards.noForcePushVerified)
  branchWarnings.push('MAIN_FORCE_PUSH_NOT_VERIFIABLY_BLOCKED');
 const googleStatus=google&&google.isolatedAccountIndependentlyApproved===true
  &&google.isolatedResourcesIndependentlyApproved===true
  &&google.realGoogleWriteExecutedAndReviewed===true
  ?'CLAIMED_APPROVAL_REQUIRES_EXTERNAL_AUDIT'
  :'ISOLATED_GOOGLE_STAGING_NOT_VERIFIED';
 // Even if 16/16 are claimed locally, only a separate change-control
 // process with independent out-of-band witness can authorize a release.
 return Object.freeze({
  marker:'R264_READ_ONLY_RELEASE_READINESS_OBSERVER',
  sourceGate:SOURCE_MARKER,
  sourceDecision:'NO_GO',
  observedPrerequisites:{total:16,passCount:passed.length,
   failCount:failures.length,passed,failed:failures},
  repositoryProtection:{
   branch:'main',
   sha:safeSha(branchState.sha)?branchState.sha:null,
   safeguards:primarySafeguards,warnings:branchWarnings
  },
  googleStaging:googleStatus,
  productionRelease:'NO_GO',
  releaseAllowed:false,
  productionDeployExecuted:false,
  independentWitnessVerified:false,
  evidenceCanBeSelfCertified:false,
  advisoryOnly:true,
  actionRequired:'Require protected main, approved isolated Google staging, '+
   'independent proof of all 16 prerequisites and signed out-of-band release authority.'
 });
}
function fromJsonFile(file){
 assert(isText(file),'INPUT_FILE_REQUIRED');
 // Read summaries only: no attempt to load/execute uploaded JS.
 const source=JSON.parse(fs.readFileSync(path.resolve(file),'utf8').replace(/^\uFEFF/,''));
 assert(source&&typeof source==='object'&&
  !Array.isArray(source),'BAD_JSON_OBJECT');
 return observe(source);
}
if(require.main===module){
 const input=process.argv[2];
 if(!input){console.error('Usage: node r264_release_readiness_observer.cjs <R163 summary JSON path>');process.exitCode=2}
 else{
  try{
   const report=fromJsonFile(input);
   console.log(JSON.stringify(report,null,2));
   if(report.productionRelease!=='NO_GO'||report.releaseAllowed)
    throw Error('UNREACHABLE_RELEASE_STATE');
  }catch(e){console.error('R264_READINESS_REFUSED:',e.code||e.message);process.exitCode=3}
 }
}
module.exports={observe,fromJsonFile,CHECKS,IDS};
