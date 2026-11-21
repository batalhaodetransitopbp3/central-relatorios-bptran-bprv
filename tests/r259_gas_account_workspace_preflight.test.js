'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const gateModule=require('../R259_BO_GAS_IDENTITY_PREFLIGHT_NO_DEPLOY/r259_gas_account_workspace_gate.js');
const ACCEPTED='isolated.reviewer@example.test';
const FORBIDDEN='operational.unit@example.test';
const SCRIPT='r259-approved-script-12345';
const FOLDER='r259-approved-folder-12345';
const SHEET='r259-approved-sheet-12345';
const PROTECTED='central-production-resource-12345';
const HEADER=[...gateModule.HEADER];
function workspace(){
 const state={
  email:ACCEPTED,scriptId:SCRIPT,mode:'ISOLATED_HOMOLOGATION',
  folderId:FOLDER,sheetId:SHEET,folderOwner:ACCEPTED,sheetOwner:ACCEPTED,
  folderAccess:'PRIVATE',sheetAccess:'PRIVATE',folderEditors:[],
  folderViewers:[],sheetEditors:[],sheetViewers:[],
  parentAccess:'PRIVATE',parentOwner:ACCEPTED,
  parentEditors:[],parentViewers:[],extraParents:false,
  invalidParentIterator:false,skipParentMethods:false,
  rowCount:1,header:[...HEADER],writeCount:0,driveCalls:0,
  spreadsheetCalls:0,propertyKeys:[],
 };
 const user=(email)=>({getEmail:()=>email});
 const root={
  getId:()=> 'r259-personal-drive-root-12345',
  getSharingAccess:()=>state.parentAccess,
  getOwner:()=>user(state.parentOwner),
  getEditors:()=>state.parentEditors.map(user),
  getViewers:()=>state.parentViewers.map(user),
  getParents:()=>({hasNext:()=>false,next:()=>null})
 };
 const resource=(kind)=>{
  const prefix=kind==='folder'?'folder':'sheet';
  const base={
   getId:()=>kind==='folder'?FOLDER:SHEET,
   getSharingAccess:()=>state[prefix+'Access'],
   getOwner:()=>user(state[prefix+'Owner']),
   getEditors:()=>state[prefix+'Editors'].map(user),
   getViewers:()=>state[prefix+'Viewers'].map(user),
   getParents:()=>{
    if(state.invalidParentIterator)return undefined;
    const parents=state.extraParents?[root,root]:[root];
    let i=0;
    return {hasNext:()=>i<parents.length,next:()=>parents[i++]};
   }
  };
  if(state.skipParentMethods)delete base.getParents;
  return base;
 };
 const actualFolder=resource('folder'),actualSheet=resource('sheet');
 const properties={
  R258_BO_PHOTO_MODE:()=>state.mode,
  R258_BO_PHOTO_FOLDER_ID:()=>state.folderId,
  R258_BO_PHOTO_SHEET_ID:()=>state.sheetId
 };
 const services={
  Session:{getEffectiveUser:()=>user(state.email)},
  ScriptApp:{getScriptId:()=>state.scriptId},
  PropertiesService:{getScriptProperties:()=>({
   getProperty:key=>{state.propertyKeys.push(key);return properties[key]?.()??null}
  })},
  DriveApp:{
   Access:{PRIVATE:'PRIVATE',ANYONE:'ANYONE',DOMAIN:'DOMAIN'},
   getFolderById:()=>{state.driveCalls++;return actualFolder},
   getFileById:()=>{state.driveCalls++;return actualSheet}
  },
  SpreadsheetApp:{
   openById:()=>{state.spreadsheetCalls++;
    return {getSheetByName:name=>name==='BO_PHOTO_LEDGER_R258'?{
     getRange:(row,col,numRows,numCols)=>({
      getValues:()=>[state.header.slice(col-1,col-1+numCols)]
     }),getLastRow:()=>state.rowCount
    }:null};
   }
  }
 };
 const policy={
  expectedAccountEmail:ACCEPTED,expectedScriptId:SCRIPT,
  expectedFolderId:FOLDER,expectedSpreadsheetId:SHEET,
  protectedResourceIds:[PROTECTED],
  disallowedAccountEmails:[FORBIDDEN],
  requireEmptyLedger:true
 };
 const make=(overrides={})=>gateModule.create({services,
  policy:{...policy,...overrides}});
 return {state,services,policy,make};
}
test('release stays NO-GO for all workspace guards',()=>{
 assert.equal(gateModule.releaseAllowed,false);
 assert.equal(workspace().make().releaseAllowed,false);
});
test('read-only preflight approves separate, empty private account and project',()=>{
 const x=workspace(),result=x.make().preflight();
 assert.equal(result.ok,true);
 assert.equal(result.releaseAllowed,false);
 assert.equal(result.operation,'READ_ONLY_PREFLIGHT');
 assert.equal(result.accountVerified,true);
 assert.equal(result.scriptVerified,true);
 assert.equal(result.ledgerRows,1);
 assert.equal(result.inheritedAclFullyVerified,false);
 assert.equal(result.filesWritten,0);
 assert.equal(x.state.writeCount,0);
 assert.equal(x.state.driveCalls,2);
 assert.equal(x.state.spreadsheetCalls,1);
 assert(!JSON.stringify(result).includes(ACCEPTED));
 assert(!JSON.stringify(result).includes(SCRIPT));
});
test('connected operational Google account is denied before Drive and Sheets access',()=>{
 const x=workspace();x.state.email=FORBIDDEN;
 assert.throws(()=>x.make().preflight(),/R259_OPERATIONAL_ACCOUNT_FORBIDDEN/);
 assert.equal(x.state.driveCalls,0);
 assert.equal(x.state.spreadsheetCalls,0);
 assert.equal(x.state.propertyKeys.length,0);
});
test('another Google account is rejected even if its resource IDs match',()=>{
 const x=workspace();x.state.email='unrelated@example.test';
 assert.throws(()=>x.make().preflight(),/R259_WRONG_GOOGLE_ACCOUNT/);
 assert.equal(x.state.driveCalls,0);
 assert.equal(x.state.propertyKeys.length,0);
});
test('missing or unavailable effective email fails closed, never reads active user',()=>{
 const x=workspace();x.state.email='';
 assert.throws(()=>x.make().preflight(),/R259_EFFECTIVE_ACCOUNT_NOT_AVAILABLE/);
 assert.equal(x.state.driveCalls,0);
});
test('wrong Apps Script project ID cannot inspect private data',()=>{
 const x=workspace();x.state.scriptId='central-production-script-12345';
 assert.throws(()=>x.make().preflight(),/R259_WRONG_APPS_SCRIPT_PROJECT/);
 assert.equal(x.state.driveCalls,0);
 assert.equal(x.state.spreadsheetCalls,0);
});
test('same email but wrong isolated mode is blocked',()=>{
 const x=workspace();x.state.mode='PRODUCTION';
 assert.throws(()=>x.make().preflight(),/R259_MODE_IS_NOT_ISOLATED/);
 assert.equal(x.state.driveCalls,0);
});
test('folder or spreadsheet ID altered in ScriptProperties is blocked',()=>{
 const x=workspace();
 x.state.folderId=PROTECTED;
 assert.throws(()=>x.make().preflight(),/R259_GOOGLE_RESOURCE_ALLOWLIST_MISMATCH/);
 x.state.folderId=FOLDER;x.state.sheetId='different-sheet-123456';
 assert.throws(()=>x.make().preflight(),/R259_GOOGLE_RESOURCE_ALLOWLIST_MISMATCH/);
 assert.equal(x.state.driveCalls,0);
});
test('independent allowlist cannot designate a protected production resource',()=>{
 const x=workspace();
 assert.throws(()=>x.make({expectedFolderId:PROTECTED}),
  /R259_INDEPENDENT_POLICY_REJECTS_TARGET/);
 assert.equal(x.state.driveCalls,0);
});
test('independent allowlist cannot approve an operational account',()=>{
 const x=workspace();
 assert.throws(()=>x.make({expectedAccountEmail:FORBIDDEN}),
  /R259_INDEPENDENT_POLICY_REJECTS_TARGET/);
 assert.equal(x.state.driveCalls,0);
});
test('no independent policy or missing denylist is a fail-closed configuration error',()=>{
 const x=workspace();
 assert.throws(()=>gateModule.create({services:x.services}),
  /R259_INDEPENDENT_POLICY_REQUIRED/);
 assert.throws(()=>x.make({disallowedAccountEmails:undefined}),
  /R259_INDEPENDENT_POLICY_REQUIRED/);
});
test('non-private folder blocks preflight',()=>{
 const x=workspace();x.state.folderAccess='ANYONE';
 assert.throws(()=>x.make().preflight(),/R259_GENERAL_SHARING_NOT_PRIVATE_FOLDER/);
 assert.equal(x.state.spreadsheetCalls,0);
});
test('non-private Google Sheet blocks preflight',()=>{
 const x=workspace();x.state.sheetAccess='DOMAIN';
 assert.throws(()=>x.make().preflight(),/R259_GENERAL_SHARING_NOT_PRIVATE_LEDGER_FILE/);
 assert.equal(x.state.spreadsheetCalls,0);
});
test('folder owner must match independently approved effective identity',()=>{
 const x=workspace();x.state.folderOwner=FORBIDDEN;
 assert.throws(()=>x.make().preflight(),/R259_RESOURCE_OWNER_MISMATCH_FOLDER/);
});
test('spreadsheet owner mismatch blocks read-only testing',()=>{
 const x=workspace();x.state.sheetOwner=FORBIDDEN;
 assert.throws(()=>x.make().preflight(),/R259_RESOURCE_OWNER_MISMATCH_LEDGER_FILE/);
});
test('extra direct editor on folder fails closed',()=>{
 const x=workspace();x.state.folderEditors.push('outside@example.test');
 assert.throws(()=>x.make().preflight(),/R259_UNAPPROVED_DIRECT_SHARING_FOLDER/);
});
test('extra direct viewer on spreadsheet fails closed',()=>{
 const x=workspace();x.state.sheetViewers.push('outside@example.test');
 assert.throws(()=>x.make().preflight(),/R259_UNAPPROVED_DIRECT_SHARING_LEDGER_FILE/);
});
test('parent folder shared by link fails closed even with private leaf folder',()=>{
 const x=workspace();x.state.parentAccess='ANYONE';
 assert.throws(()=>x.make().preflight(),/R259_GENERAL_SHARING_NOT_PRIVATE_PARENT/);
});
test('parent folder owned by operational account fails closed',()=>{
 const x=workspace();x.state.parentOwner=FORBIDDEN;
 assert.throws(()=>x.make().preflight(),/R259_RESOURCE_OWNER_MISMATCH_PARENT/);
});
test('parent with unapproved direct editor fails closed',()=>{
 const x=workspace();x.state.parentEditors=['outside@example.test'];
 assert.throws(()=>x.make().preflight(),/R259_UNAPPROVED_DIRECT_SHARING_PARENT/);
});
test('unavailable parent iterator is treated as unknown access, not private',()=>{
 const x=workspace();x.state.invalidParentIterator=true;
 assert.throws(()=>x.make().preflight(),/R259_PARENT_ITERATOR_INVALID/);
});
test('resource without parent API is not accepted',()=>{
 const x=workspace(),old=x.services.DriveApp.getFolderById;
 x.services.DriveApp.getFolderById=()=>({...old(),getParents:undefined});
 assert.throws(()=>x.make().preflight(),/R259_PARENT_ENUMERATION_UNAVAILABLE/);
});
test('conflicting parent paths cannot be silently resolved',()=>{
 const x=workspace();x.state.extraParents=true;
 assert.throws(()=>x.make().preflight(),/R259_MULTIPLE_PARENT_PATHS/);
});
test('incorrect private spreadsheet header is refused',()=>{
 const x=workspace();x.state.header[5]='bad_hash';
 assert.throws(()=>x.make().preflight(),/R259_LEDGER_HEADER_INVALID/);
});
test('new homolgation project must begin with an empty ledger',()=>{
 const x=workspace();x.state.rowCount=7;
 assert.throws(()=>x.make().preflight(),/R259_LEDGER_NOT_FRESH/);
});
test('malformed or overflowing ledger row count is refused',()=>{
 const x=workspace();x.state.rowCount=12002;
 assert.throws(()=>x.make().preflight(),/R259_LEDGER_ROW_COUNT_INVALID/);
});
test('no secret is read by the read-only account preflight',()=>{
 const x=workspace();x.make().preflight();
 assert.deepEqual(x.state.propertyKeys,[
  'R258_BO_PHOTO_MODE','R258_BO_PHOTO_FOLDER_ID',
  'R258_BO_PHOTO_SHEET_ID'
 ]);
});
test('guardedStorage refuses an untrusted legacy storage object',()=>{
 const x=workspace();
 assert.throws(()=>x.make().guardedStorage({withExclusiveLock:async()=>null}),
  /R259_R258_STORAGE_REQUIRED/);
});
test('guardedStorage allows the isolated lock only after two account checks',async()=>{
 const x=workspace(),changes=[];
 const fakeStorage={releaseAllowed:false,
  withExclusiveLock:async(_key,fn)=>{
   changes.push('LOCK');
   return fn();
  }};
 const wrapped=x.make().guardedStorage(fakeStorage);
 const answer=await wrapped.withExclusiveLock('r239:synthetic',async()=>{
  changes.push('WORK');
  return 123;
 });
 assert.equal(answer,123);
 assert.deepEqual(changes,['LOCK','WORK']);
 assert.equal(x.state.driveCalls,4,'pre-lock and after-lock verification');
 assert.equal(wrapped.releaseAllowed,false);
});
test('guardedStorage revocation while waiting for lock prevents any write',async()=>{
 const x=workspace();let writes=0;
 const fakeStorage={releaseAllowed:false,
  withExclusiveLock:async(_key,fn)=>{
   x.state.email=FORBIDDEN;return fn();
  }};
 const wrapped=x.make().guardedStorage(fakeStorage);
 await assert.rejects(wrapped.withExclusiveLock('r239:synthetic',
  async()=>{writes++;return 1}),
  /R259_OPERATIONAL_ACCOUNT_FORBIDDEN/);
 assert.equal(writes,0);
});
test('guardedStorage refuses folder ACL switched to public while acquiring lock',async()=>{
 const x=workspace();let writes=0;
 const fakeStorage={releaseAllowed:false,
  withExclusiveLock:async(_key,fn)=>{
   x.state.folderAccess='ANYONE';return fn();
  }};
 const wrapped=x.make().guardedStorage(fakeStorage);
 await assert.rejects(wrapped.withExclusiveLock('r239:synthetic',
  async()=>{writes++;return 1}),
  /R259_GENERAL_SHARING_NOT_PRIVATE_FOLDER/);
 assert.equal(writes,0);
});
test('an existing isolated ledger can be used after an approved initial preflight',async()=>{
 const x=workspace(),gate=x.make();
 assert.equal(gate.preflight().ok,true);
 x.state.rowCount=5;
 let writes=0;
 const storage=gate.guardedStorage({releaseAllowed:false,
  withExclusiveLock:async(_,fn)=>fn()});
 const ok=await storage.withExclusiveLock('r239:synthetic',
  async()=>{writes++;return true});
 assert.equal(ok,true);
 assert.equal(writes,1);
});
