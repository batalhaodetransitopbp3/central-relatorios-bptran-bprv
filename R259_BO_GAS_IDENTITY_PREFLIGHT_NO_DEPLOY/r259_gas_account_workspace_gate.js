'use strict';
/*
 * R259: fail-closed READ-ONLY Apps Script execution account / resource guard.
 *
 * THIS IS NOT A PRODUCTION IDENTITY PROVIDER OR PRODUCTION DEPLOYMENT.
 * No Drive/Sheets mutation, no menu, trigger, doPost or doGet.
 * A reviewer must pin approved account, standalone project ID and resource IDs
 * in an independently reviewed policy; untrusted ScriptProperties alone
 * cannot authorize resources or a personal identity.
 */
var R259BoAccountWorkspaceGate=(function(){
 const RX_EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
 const RX_ID=/^[a-zA-Z0-9_-]{12,180}$/;
 const HEADER=[
  'seq','kind','event_id','object_key','payload_b64',
  'payload_sha256','prev_hmac','row_hmac','recorded_at'
 ];
 const requireOk=(condition,code)=>{
  if(!condition){const e=new Error('R259_'+code);e.code=code;throw e}
 };
 const str=x=>typeof x==='string'?x.trim():'';
 const normalEmail=x=>str(x).toLowerCase();
 function validatePolicy(policy){
  const p=policy||{};
  requireOk(
   RX_EMAIL.test(normalEmail(p.expectedAccountEmail))&&
   RX_ID.test(str(p.expectedScriptId))&&
   RX_ID.test(str(p.expectedFolderId))&&
   RX_ID.test(str(p.expectedSpreadsheetId))&&
   p.expectedFolderId!==p.expectedSpreadsheetId&&
   Array.isArray(p.protectedResourceIds)&&
   Array.isArray(p.disallowedAccountEmails)&&
   p.requireEmptyLedger===true,
   'INDEPENDENT_POLICY_REQUIRED'
  );
  const protectedResources=new Set(p.protectedResourceIds);
  const disallowedAccounts=new Set(p.disallowedAccountEmails.map(normalEmail));
  requireOk(!protectedResources.has(p.expectedFolderId)&&
   !protectedResources.has(p.expectedSpreadsheetId)&&
   !disallowedAccounts.has(normalEmail(p.expectedAccountEmail)),
   'INDEPENDENT_POLICY_REJECTS_TARGET');
  requireOk(p.protectedResourceIds.every(v=>RX_ID.test(str(v)))&&
   p.disallowedAccountEmails.every(v=>RX_EMAIL.test(normalEmail(v))),
   'INVALID_RESTRICTION_LIST');
  return Object.freeze({
   account:normalEmail(p.expectedAccountEmail),
   scriptId:str(p.expectedScriptId),
   folderId:str(p.expectedFolderId),
   sheetId:str(p.expectedSpreadsheetId),
   protectedResources,
   disallowedAccounts
  });
 }
 function create({services,policy}={}){
  const s=services||{};
  for(const required of ['Session','ScriptApp','PropertiesService',
   'DriveApp','SpreadsheetApp']){
   requireOk(!!s[required],'MISSING_SERVICE_'+required);
  }
  const rules=validatePolicy(policy);
  function accountAndProject(){
   const user=s.Session.getEffectiveUser();
   const current=normalEmail(user&&user.getEmail&&user.getEmail());
   const script=str(s.ScriptApp.getScriptId());
   // A blank identity is not a signal to fall back to a shared token,
   // a supplied email, or Session.getActiveUser().getEmail().
   requireOk(RX_EMAIL.test(current),'EFFECTIVE_ACCOUNT_NOT_AVAILABLE');
   requireOk(!rules.disallowedAccounts.has(current),
    'OPERATIONAL_ACCOUNT_FORBIDDEN');
   requireOk(current===rules.account,'WRONG_GOOGLE_ACCOUNT');
   requireOk(script===rules.scriptId,'WRONG_APPS_SCRIPT_PROJECT');
  }
  function readModeAndIds(){
   const store=s.PropertiesService.getScriptProperties();
   requireOk(store&&typeof store.getProperty==='function',
    'SCRIPT_PROPERTIES_UNAVAILABLE');
   const mode=store.getProperty('R258_BO_PHOTO_MODE');
   requireOk(mode==='ISOLATED_HOMOLOGATION','MODE_IS_NOT_ISOLATED');
   const folderId=store.getProperty('R258_BO_PHOTO_FOLDER_ID');
   const sheetId=store.getProperty('R258_BO_PHOTO_SHEET_ID');
   requireOk(folderId===rules.folderId&&sheetId===rules.sheetId&&
    !rules.protectedResources.has(folderId)&&
    !rules.protectedResources.has(sheetId),
    'GOOGLE_RESOURCE_ALLOWLIST_MISMATCH');
   // No reading the HMAC secret is required for account preflight.
   return {folderId,sheetId};
  }
  function userEmail(user){
   const current=normalEmail(user&&user.getEmail&&user.getEmail());
   requireOk(RX_EMAIL.test(current),'ACL_EMAIL_NOT_AVAILABLE');
   return current;
  }
  function privateResource(resource,expectedId,role){
   requireOk(resource&&typeof resource.getId==='function'&&
    resource.getId()===expectedId,'RESOURCE_ID_MISMATCH_'+role);
   requireOk(resource.getSharingAccess()===s.DriveApp.Access.PRIVATE,
    'GENERAL_SHARING_NOT_PRIVATE_'+role);
   requireOk(userEmail(resource.getOwner())===rules.account,
    'RESOURCE_OWNER_MISMATCH_'+role);
   const editors=resource.getEditors(),viewers=resource.getViewers();
   requireOk(Array.isArray(editors)&&Array.isArray(viewers),
    'ACL_ENUMERATION_UNAVAILABLE_'+role);
   requireOk(editors.every(x=>userEmail(x)===rules.account)&&
    viewers.every(x=>userEmail(x)===rules.account),
    'UNAPPROVED_DIRECT_SHARING_'+role);
  }
  function parentsPrivate(resource){
   // DriveApp direct sharing APIs do not guarantee inherited ACL absence
   // for shared drives or externally governed parent policies. This
   // routine conservatively checks every parent visible to DriveApp.
   const visited=new Set();
   let current=resource,depth=0;
   while(true){
    requireOk(typeof current.getParents==='function',
     'PARENT_ENUMERATION_UNAVAILABLE');
    const parents=current.getParents();
    requireOk(parents&&typeof parents.hasNext==='function'&&
     typeof parents.next==='function','PARENT_ITERATOR_INVALID');
    if(!parents.hasNext())break;
    requireOk(depth++<12,'PARENT_CHAIN_LIMIT_EXCEEDED');
    const parent=parents.next();
    requireOk(!parents.hasNext(),'MULTIPLE_PARENT_PATHS');
    requireOk(parent&&typeof parent.getId==='function',
     'PARENT_NOT_RESOLVED');
    const id=parent.getId();
    requireOk(!visited.has(id)&&!rules.protectedResources.has(id),
     'PARENT_CYCLE_OR_PROTECTED_RESOURCE');
    visited.add(id);
    privateResource(parent,id,'PARENT');
    current=parent;
   }
  }
  function inspect({expectEmpty=false}={}){
   accountAndProject(); // absolutely no Drive/Sheets reads before this.
   const ids=readModeAndIds();
   const folder=s.DriveApp.getFolderById(ids.folderId);
   const ledgerFile=s.DriveApp.getFileById(ids.sheetId);
   privateResource(folder,ids.folderId,'FOLDER');
   privateResource(ledgerFile,ids.sheetId,'LEDGER_FILE');
   parentsPrivate(folder);parentsPrivate(ledgerFile);
   const book=s.SpreadsheetApp.openById(ids.sheetId);
   requireOk(book&&typeof book.getSheetByName==='function',
    'SPREADSHEET_UNAVAILABLE');
   const sheet=book.getSheetByName('BO_PHOTO_LEDGER_R258');
   requireOk(sheet,'LEDGER_TAB_MISSING');
   const got=sheet.getRange(1,1,1,HEADER.length).getValues()[0];
   requireOk(JSON.stringify(got)===JSON.stringify(HEADER),
    'LEDGER_HEADER_INVALID');
   const count=sheet.getLastRow();
   requireOk(Number.isInteger(count)&&count>=1&&count<=12001,
    'LEDGER_ROW_COUNT_INVALID');
   if(expectEmpty){
    requireOk(count===1,'LEDGER_NOT_FRESH');
   }
   // We can attest what DriveApp reveals, not domain administration policy.
   return Object.freeze({ok:true,eligibleForIsolatedTest:true,
    scriptVerified:true,accountVerified:true,
    folderGeneralAccessPrivate:true,
    spreadsheetGeneralAccessPrivate:true,
    directEditorsAndViewersChecked:true,
    parentAccessChecked:true,ledgerRows:count,
    filesWritten:0,operation:'READ_ONLY_PREFLIGHT',
    inheritedAclFullyVerified:false,releaseAllowed:false,
    productionDeployExecuted:false});
  }
  function preflight(){
   return inspect({expectEmpty:true});
  }
  function guardedStorage(storage){
   requireOk(storage&&storage.releaseAllowed===false&&
    typeof storage.withExclusiveLock==='function',
    'R258_STORAGE_REQUIRED');
   // Read-only guard before acquiring the R258 script lock AND after the
   // lock has been obtained. Prevents a revocation while waiting.
   return Object.freeze({
    ...storage,
    withExclusiveLock:async(key,fn)=>{
     inspect({expectEmpty:false});
     return storage.withExclusiveLock(key,async()=>{
      inspect({expectEmpty:false});
      return fn();
     });
    },
    releaseAllowed:false
   });
  }
  return Object.freeze({preflight,guardedStorage,releaseAllowed:false});
 }
 function fromNativeGlobals(independentPolicy){
  // Only explicitly executed in a standalone Apps Script project,
  // never registered as the Central's doPost or doGet.
  return create({policy:independentPolicy,
   services:{Session,ScriptApp,PropertiesService,DriveApp,SpreadsheetApp}});
 }
 return Object.freeze({create,fromNativeGlobals,HEADER,releaseAllowed:false});
})();
if(typeof module==='object'&&module.exports)module.exports=R259BoAccountWorkspaceGate;
