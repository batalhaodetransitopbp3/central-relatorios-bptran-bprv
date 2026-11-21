'use strict';
/*
 * R258 bootstrap ONLY — no doGet/doPost, trigger or deploy.
 * This module does not create or modify Drive/Sheets resources by itself.
 * ScriptProperties must be set manually in an independent Apps Script
 * homologation project, never the live Central's deployment.
 */
var R258BoGasIsolatedBootstrap=(function(){
 function deny(code){const e=new Error('R258_BOOT_'+code);e.code=code;throw e}
 function create({services,now,adapterFactory}={}){
  const s=services||{};
  if(!s.PropertiesService||typeof s.PropertiesService.getScriptProperties!=='function')
   deny('SCRIPT_PROPERTIES_REQUIRED');
  const properties=s.PropertiesService.getScriptProperties();
  if(!properties||typeof properties.getProperty!=='function')
   deny('SCRIPT_PROPERTIES_UNAVAILABLE');
  // The mode is read before any Drive/Sheets call or access to secrets.
  if(properties.getProperty('R258_BO_PHOTO_MODE')!=='ISOLATED_HOMOLOGATION')
   deny('ISOLATED_MODE_REQUIRED');
  const config={
   mode:'ISOLATED_HOMOLOGATION',
   folderId:properties.getProperty('R258_BO_PHOTO_FOLDER_ID'),
   spreadsheetId:properties.getProperty('R258_BO_PHOTO_SHEET_ID'),
   sheetName:'BO_PHOTO_LEDGER_R258',
   hmacKey:properties.getProperty('R258_BO_PHOTO_HMAC_KEY')
  };
  if(!config.folderId||!config.spreadsheetId||!config.hmacKey)
   deny('ISOLATED_PROPERTIES_MISSING');
  const factory=adapterFactory||
   (typeof R258BoGasPrivateStorage!=='undefined'?R258BoGasPrivateStorage:null);
  if(!factory||typeof factory.create!=='function')
   deny('GAS_STORAGE_ADAPTER_NOT_LOADED');
  if(typeof now!=='function')deny('SERVER_CLOCK_REQUIRED');
  return factory.create({config,services:s,now});
 }
 function preflight(options){
  const adapter=create(options);
  const read=adapter.verifyLedger();
  return Object.freeze({ok:read.ok,ledgerEvents:read.events,
   releaseAllowed:false,filesWritten:0,productionDeployed:false});
 }
 function fromNativeGlobals(){
  // Invoking this manually requires explicit properties + isolated resources.
  return create({
   services:{DriveApp,SpreadsheetApp,LockService,Utilities,PropertiesService},
   now:function(){return new Date().toISOString()}
  });
 }
 return Object.freeze({create,preflight,fromNativeGlobals,releaseAllowed:false});
})();
if(typeof module==='object'&&module.exports)module.exports=R258BoGasIsolatedBootstrap;
