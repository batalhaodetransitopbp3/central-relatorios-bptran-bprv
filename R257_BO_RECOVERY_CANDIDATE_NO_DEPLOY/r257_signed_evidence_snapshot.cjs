'use strict';
/*
 * R257: signed, verifiable, self-contained snapshot / guarded restore of the
 * ISOLATED R256 SQLite + encrypted JPEG vault. Not a production backup system.
 * No credentials, external network, cloud storage, or operational data.
 *
 * SQLite online backup ensures database consistency. A pre/post live digest
 * and R256 reconciliation fail closed on changing files or concurrent writes.
 * Ed25519 signed manifest must be verified using an INDEPENDENT pinned key.
 */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {DatabaseSync,backup:sqliteBackup}=require('node:sqlite');
const {create:openPhotoLedger}=require('../R256_BO_PHOTO_LEDGER_CANDIDATE_NO_DEPLOY/r256_private_photo_ledger.cjs');
const MAX_ITEMS=96*200,MAX_SNAPSHOT_BYTES=1024*1024*1024;
const EMPTY=Object.freeze({version:1});
function deny(code){const e=new Error('R257_'+code);e.code=code;throw e}
function hashFile(file){
 const st=fs.lstatSync(file);
 if(!st.isFile()||st.isSymbolicLink())deny('NONREGULAR_EVIDENCE_FILE');
 if(st.size<1||st.size>MAX_SNAPSHOT_BYTES)deny('EVIDENCE_FILE_SIZE_INVALID');
 return {sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),bytes:st.size};
}
function requireKey(input,type){
 if(!(input instanceof crypto.KeyObject)||input.type!==type||
    input.asymmetricKeyType!=='ed25519')deny('INDEPENDENT_SIGNING_KEY_REQUIRED');
 return input;
}
function plainPath(file){
 if(typeof file!=='string'||!file||
    file.includes('\0')||path.basename(file)!==file||
    file==='.'||file==='..'||!/^([a-f0-9]{64}\.enc)$/.test(file))
   deny('UNSAFE_BLOB_FILE_NAME');
 return file;
}
function snapshotFiles(dir){
 if(!fs.existsSync(dir))deny('PHOTO_DIRECTORY_UNAVAILABLE');
 const directory=fs.lstatSync(dir);
 if(!directory.isDirectory()||directory.isSymbolicLink())deny('UNTRUSTED_PHOTO_DIRECTORY');
 const files=fs.readdirSync(dir).sort();
 if(files.length>MAX_ITEMS)deny('EVIDENCE_COUNT_EXCEEDS_LIMIT');
 return files.map(file=>({
   file:plainPath(file),...hashFile(path.join(dir,file))
 }));
}
function sameFiles(a,b){
 return JSON.stringify(a)===JSON.stringify(b);
}
function fullAudit(dbPath){
 const db=new DatabaseSync(dbPath,{readOnly:true});
 try{
  const audit=db.prepare('SELECT COUNT(*) as n, MAX(sequence) as maxSeq FROM bo_photo_audit').get();
  const last=db.prepare('SELECT tag FROM bo_photo_audit ORDER BY sequence DESC LIMIT 1').get();
  const requests=db.prepare('SELECT COUNT(*) AS n FROM bo_photo_requests').get();
  const photos=db.prepare('SELECT COUNT(*) AS n FROM bo_photo_items').get();
  return {
   verified:audit.n,
   highestSequence:audit.maxSeq||0,
   tip:last?last.tag:'GENESIS',
   requests:requests.n,photos:photos.n
  };
 }finally{db.close()}
}
function checkLedger({dbPath,photoDirectory,encryptionKey,auditKey,now}){
 const ledger=openPhotoLedger({dbPath,photoDirectory,encryptionKey,auditKey,now});
 try{
  const report=ledger.reconcile();
  if(!report.ok)deny('LEDGER_RECONCILIATION_FAILED');
  const audit=fullAudit(dbPath);
  if(audit.tip!==report.audit.tip||audit.verified!==report.audit.verified)
   deny('AUDIT_TIP_MISMATCH');
  return audit;
 }finally{ledger.close()}
}
async function removeOfflineWorkDirectory(dir){
 // SQLite VFS Windows may release a closed SHM.tmp asynchronously. Keep
 // the backup stage unpublished until disposal is complete. Bounded retries
 // fail closed rather than silently shipping a dirty signed snapshot.
 for(let attempt=0;attempt<60;attempt++){
  try{
   await fs.promises.rm(dir,{recursive:true,force:true,
    maxRetries:2,retryDelay:30});
   return;
  }catch(error){
   if(!['EPERM','EBUSY','ENOTEMPTY','EACCES'].includes(error.code)||attempt===59)
    throw error;
   await new Promise(resolve=>setTimeout(resolve,40+10*attempt));
  }
 }
}
function finalizeOfflineSnapshotDb(databasePath){
 // All connections to the snapshot must have closed before this function.
 // Merge WAL contents and switch only this OFFLINE COPY to DELETE journal.
 const db=new DatabaseSync(databasePath);
 try{
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  const result=db.prepare('PRAGMA journal_mode=DELETE').get();
  if(String(result.journal_mode||'').toLowerCase()!=='delete')
   deny('SNAPSHOT_JOURNAL_NOT_FINALIZED');
 }finally{db.close()}
 // SQLite's Windows VFS may create a short-lived SHM.tmp and still hold its
 // handle after the connection closes. Never publish a dirty snapshot.
 // Only remove recognized SQLite temporary names in the disposable staging
 // directory. The real evidence directory is NEVER passed here.
 const base=path.basename(databasePath).toLowerCase();
 const parent=path.dirname(databasePath);
 const sleep=new Int32Array(new SharedArrayBuffer(4));
 let clear=false;
 for(let attempt=0;attempt<24;attempt++){
  let busy=false;
  for(const file of fs.readdirSync(parent)){
   const normalized=file.toLowerCase();
   if(normalized===base+'-shm.tmp'||normalized===base+'-wal.tmp'){
    const full=path.join(parent,file);
    try{
     const st=fs.lstatSync(full);
     if(!st.isFile()||st.isSymbolicLink())deny('UNTRUSTED_SQLITE_TEMPORARY_FILE');
     fs.unlinkSync(full);
    }catch(err){
     // ENOENT: SQLite already removed it. EBUSY/EPERM: wait briefly for
     // the native SQLite/Windows handle to release, then retry.
     if(err.code==='EBUSY'||err.code==='EPERM')busy=true;
     else if(err.code!=='ENOENT')throw err;
    }
   }
  }
  const leftovers=fs.readdirSync(parent).some(name=>{
   const lower=name.toLowerCase();
   return lower===base+'-shm.tmp'||lower===base+'-wal.tmp';
  });
  if(!busy&&!leftovers){clear=true;break}
  Atomics.wait(sleep,0,0,20);
 }
 if(!clear)deny('SQLITE_TEMPORARY_FILE_LOCKED');
 for(const suffix of ['-wal','-shm']){
  if(fs.existsSync(databasePath+suffix))deny('SNAPSHOT_JOURNAL_SIDECAR_REMAINS');
 }
}
function copyProtected(src,dst){
 fs.copyFileSync(src,dst,fs.constants.COPYFILE_EXCL);
 try{fs.chmodSync(dst,0o600)}catch(_){}
 // Windows FlushFileBuffers requires a writable file handle.
 const fd=fs.openSync(dst,'r+');
 try{fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
}
function reconcileDisposableDatabase(sourceDb,photoDirectory,options,stageRoot){
 // Critical: never open/modify the immutable restored database in SQLite
 // until the restored snapshot is formally published by the operator.
 const workDir=path.join(stageRoot,'.r257-check-'+crypto.randomUUID());
 fs.mkdirSync(workDir,{mode:0o700});
 try{
  const workDb=path.join(workDir,'photo.sqlite');
  copyProtected(sourceDb,workDb);
  return checkLedger({
   dbPath:workDb,photoDirectory,
   encryptionKey:options.encryptionKey,
   auditKey:options.auditKey,now:options.now
  });
 }finally{
  fs.rmSync(workDir,{recursive:true,force:true,maxRetries:60,retryDelay:50});
 }
}
function safeNewTarget(base,name){
 if(typeof base!=='string'||!base||typeof name!=='string'||
    !/^(snapshot|restored)-[a-f0-9-]{36}$/.test(name))
   deny('BAD_TARGET');
 const root=path.resolve(base);
 if(!fs.existsSync(root))deny('ROOT_MISSING');
 const parent=fs.lstatSync(root);
 if(!parent.isDirectory()||parent.isSymbolicLink())deny('UNTRUSTED_BACKUP_OR_RESTORE_ROOT');
 const out=path.join(root,name);
 if(fs.existsSync(out))deny('TARGET_ALREADY_EXISTS');
 return {root,out};
}
function validateOptions(options){
 const o=options||{};
 for(const k of ['dbPath','photoDirectory','backupRoot']){
  if(typeof o[k]!=='string'||!o[k])deny('MISSING_SOURCE_OR_TARGET');
 }
 if(!fs.existsSync(o.dbPath)||!fs.lstatSync(o.dbPath).isFile())
  deny('SOURCE_DATABASE_UNAVAILABLE');
 if(!Buffer.isBuffer(o.encryptionKey)||o.encryptionKey.length!==32||
    !Buffer.isBuffer(o.auditKey)||o.auditKey.length!==32||
    typeof o.now!=='function')deny('SOURCE_KEYS_OR_CLOCK_REQUIRED');
 requireKey(o.signingPrivateKey,'private');
 requireKey(o.verificationPublicKey,'public');
 const pub=crypto.createPublicKey(o.signingPrivateKey);
 if(!pub.equals(o.verificationPublicKey))deny('SIGNATURE_KEY_PAIR_MISMATCH');
 const source=path.resolve(o.photoDirectory),dest=path.resolve(o.backupRoot);
 if(source===dest||source.startsWith(dest+path.sep)||
    dest.startsWith(source+path.sep))deny('BACKUP_ROOT_INSIDE_SOURCE');
 return o;
}
async function createSnapshot(input){
 const o=validateOptions(input);
 const id=crypto.randomUUID();
 const {root,out}=safeNewTarget(o.backupRoot,'snapshot-'+id);
 const tmp=path.join(root,'.stage-'+id);
 let published=false;
 fs.mkdirSync(tmp,{mode:0o700});
 const backupDb=path.join(tmp,'photo.sqlite');
 const backupPhotos=path.join(tmp,'photos');
 fs.mkdirSync(backupPhotos,{mode:0o700});
 try{
  const initialAudit=checkLedger(o);
  const originalFiles=snapshotFiles(o.photoDirectory);
  // sqlite.backup and SQLite read-only audit may generate short-lived Windows
  // VFS files. Work in a disposable subdirectory, never in the folder to be
  // signed/published. Copy the finalized DB only after closing all handles.
  const workDir=path.join(tmp,'.r257-db-work');
  fs.mkdirSync(workDir,{mode:0o700});
  const workDb=path.join(workDir,'photo.sqlite');
  let snapshotAudit,dbFingerprint;
  try{
   const rawDb=new DatabaseSync(o.dbPath,{readOnly:true});
   try{await sqliteBackup(rawDb,workDb)}
   finally{rawDb.close()}
   if(o.hooks?.afterDatabaseSnapshot)await o.hooks.afterDatabaseSnapshot();
   finalizeOfflineSnapshotDb(workDb);
   snapshotAudit=fullAudit(workDb);
   finalizeOfflineSnapshotDb(workDb);
   copyProtected(workDb,backupDb);
   dbFingerprint=hashFile(backupDb);
  }finally{
   await removeOfflineWorkDirectory(workDir);
  }
  const copied=[];
  for(const entry of originalFiles){
   const src=path.join(o.photoDirectory,entry.file);
   copyProtected(src,path.join(backupPhotos,entry.file));
   const found=hashFile(path.join(backupPhotos,entry.file));
   if(found.sha256!==entry.sha256||found.bytes!==entry.bytes)
    deny('BLOB_CHANGED_DURING_COPY');
   copied.push({...entry});
   if(o.hooks?.afterBlobCopied)await o.hooks.afterBlobCopied(entry.file);
  }
  const copiedFileList=snapshotFiles(backupPhotos);
  if(!sameFiles(originalFiles,copiedFileList))deny('BACKUP_BLOB_INTEGRITY_FAILED');
  // The copied database has never been opened by SQLite in the signed
  // staging area. Compare the independently measured work copy's audit
  // tip/counts against the live source before sealing the manifest.
  const finalAudit=checkLedger(o);
  const finalFiles=snapshotFiles(o.photoDirectory);
  if(JSON.stringify(initialAudit)!==JSON.stringify(snapshotAudit)||
     JSON.stringify(initialAudit)!==JSON.stringify(finalAudit)||
     !sameFiles(originalFiles,finalFiles))deny('SOURCE_CHANGED_DURING_SNAPSHOT');
  const manifest={
   schema:'R257-ISOLATED-BO-EVIDENCE-SNAPSHOT',version:1,
   snapshotId:id,createdAt:o.now(),
   database:{file:'photo.sqlite',...dbFingerprint},
   blobs:copied,ledger:initialAudit
  };
  const payload=Buffer.from(JSON.stringify(manifest),'utf8');
  const signature=crypto.sign(null,payload,o.signingPrivateKey).toString('base64url');
  fs.writeFileSync(path.join(tmp,'manifest.json'),payload,{flag:'wx',mode:0o600});
  fs.writeFileSync(path.join(tmp,'manifest.sig'),signature+'\n',{flag:'wx',mode:0o600});
  for(const name of ['manifest.json','manifest.sig']){
   const fd=fs.openSync(path.join(tmp,name),'r+');
   try{fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
  }
  const verification=verifySnapshot({snapshotDir:tmp,verificationPublicKey:o.verificationPublicKey});
  if(!verification.ok)deny('SNAPSHOT_SIGNATURE_REJECTED');
  if(o.hooks?.beforePublish)await o.hooks.beforePublish();
  // Recheck signed bytes after all hooks: no successful publication of an
  // artifact altered between its first verification and the atomic rename.
  verifySnapshot({snapshotDir:tmp,verificationPublicKey:o.verificationPublicKey});
  if(fs.existsSync(out))deny('SNAPSHOT_TARGET_ALREADY_EXISTS');
  fs.renameSync(tmp,out);published=true;
  return {ok:true,snapshotDir:out,snapshotId:id,
    files:copied.length,auditTip:initialAudit.tip,releaseAllowed:false};
 }finally{
  if(!published)await removeOfflineWorkDirectory(tmp);
 }
}
function verifySnapshot({snapshotDir,verificationPublicKey}={}){
 requireKey(verificationPublicKey,'public');
 if(typeof snapshotDir!=='string'||!snapshotDir||!fs.existsSync(snapshotDir))
  deny('SNAPSHOT_MISSING');
 const dir=fs.lstatSync(snapshotDir);
 if(!dir.isDirectory()||dir.isSymbolicLink())deny('UNTRUSTED_SNAPSHOT_DIRECTORY');
 const names=fs.readdirSync(snapshotDir).sort();
 if(JSON.stringify(names)!==JSON.stringify(['manifest.json','manifest.sig','photo.sqlite','photos'].sort()))
  deny('SNAPSHOT_LAYOUT_INVALID');
 const manifestFile=path.join(snapshotDir,'manifest.json');
 const signatureFile=path.join(snapshotDir,'manifest.sig');
 for(const f of [manifestFile,signatureFile]){
  const st=fs.lstatSync(f);
  if(!st.isFile()||st.isSymbolicLink())deny('UNTRUSTED_MANIFEST_FILE');
 }
 const raw=fs.readFileSync(manifestFile);
 if(raw.length<40||raw.length>5*1024*1024)deny('MANIFEST_SIZE_INVALID');
 const sigString=fs.readFileSync(signatureFile,'utf8').trim();
 if(!/^[A-Za-z0-9_-]{86}$/.test(sigString))deny('SIGNATURE_FORMAT_INVALID');
 const sig=Buffer.from(sigString,'base64url');
 if(!crypto.verify(null,raw,verificationPublicKey,sig))
  deny('SIGNATURE_VERIFICATION_FAILED');
 let manifest;
 try{manifest=JSON.parse(raw.toString('utf8'))}catch(_){deny('MANIFEST_JSON_INVALID')}
 if(manifest.schema!=='R257-ISOLATED-BO-EVIDENCE-SNAPSHOT'||manifest.version!==1||
    !/^[a-f0-9-]{36}$/.test(manifest.snapshotId||'')||
    !Array.isArray(manifest.blobs)||manifest.blobs.length>MAX_ITEMS||
    manifest.database?.file!=='photo.sqlite'||
    !manifest.ledger||typeof manifest.ledger.tip!=='string')
   deny('MANIFEST_SCHEMA_INVALID');
 const dbReal=hashFile(path.join(snapshotDir,'photo.sqlite'));
 if(dbReal.sha256!==manifest.database.sha256||dbReal.bytes!==manifest.database.bytes)
  deny('DATABASE_CHECKSUM_MISMATCH');
 const actual=snapshotFiles(path.join(snapshotDir,'photos'));
 if(!sameFiles(actual,manifest.blobs))
  deny('BLOB_MANIFEST_MISMATCH');
 // The Ed25519 signature covers the full manifest, including the audited
 // ledger tip and the SHA-256 of the OFFLINE SQLite file. Do not open that
 // signed file in SQLite during verification: the VFS may create sidecars.
 // Restore performs a fresh full R256 reconciliation on a disposable copy.
 const dbAudit=manifest.ledger;
 return {ok:true,files:actual.length,ledger:dbAudit,
   snapshotId:manifest.snapshotId,releaseAllowed:false};
}
function restoreSnapshot({snapshotDir,restoreRoot,verificationPublicKey,
 encryptionKey,auditKey,now,hooks={}}={}){
 const checked=verifySnapshot({snapshotDir,verificationPublicKey});
 if(typeof restoreRoot!=='string'||!restoreRoot||typeof now!=='function'||
   !Buffer.isBuffer(encryptionKey)||encryptionKey.length!==32||
   !Buffer.isBuffer(auditKey)||auditKey.length!==32)deny('RESTORE_INPUT_INVALID');
 const {root,out}=safeNewTarget(restoreRoot,'restored-'+checked.snapshotId);
 const tmp=path.join(root,'.restore-stage-'+crypto.randomUUID());
 let completed=false;
 fs.mkdirSync(tmp,{mode:0o700});
 fs.mkdirSync(path.join(tmp,'photos'),{mode:0o700});
 try{
  copyProtected(path.join(snapshotDir,'photo.sqlite'),path.join(tmp,'photo.sqlite'));
  const fileList=snapshotFiles(path.join(snapshotDir,'photos'));
  for(const entry of fileList){
   copyProtected(path.join(snapshotDir,'photos',entry.file),
    path.join(tmp,'photos',entry.file));
  }
  if(oopsFileMismatch(snapshotDir,tmp))deny('RESTORED_FILE_HASH_MISMATCH');
  const db=path.join(tmp,'photo.sqlite'),photos=path.join(tmp,'photos');
  if(hooks.beforePublish)hooks.beforePublish();
  // Protect against a backup edited after initial signature verification,
  // and against staged evidence changed during the restoration window.
  verifySnapshot({snapshotDir,verificationPublicKey});
  if(!sameFiles(snapshotFiles(photos),snapshotFiles(path.join(snapshotDir,'photos'))))
   deny('RESTORED_FILE_HASH_MISMATCH');
  const finalAudit=reconcileDisposableDatabase(db,photos,
   {encryptionKey,auditKey,now},tmp);
  if(JSON.stringify(finalAudit)!==JSON.stringify(checked.ledger))
   deny('RESTORED_LEDGER_MISMATCH');
  if(!sameFiles(snapshotFiles(photos),snapshotFiles(path.join(snapshotDir,'photos'))))
   deny('RESTORED_FILE_HASH_MISMATCH');
  if(hashFile(db).sha256!==hashFile(path.join(snapshotDir,'photo.sqlite')).sha256)
   deny('RESTORED_DATABASE_HASH_MISMATCH');
  if(JSON.stringify(fs.readdirSync(tmp).sort())!==
     JSON.stringify(['photo.sqlite','photos'].sort()))
   deny('RESTORE_STAGE_LAYOUT_INVALID');
  if(fs.existsSync(out))deny('RESTORE_TARGET_ALREADY_EXISTS');
  fs.renameSync(tmp,out);completed=true;
  return {ok:true,restoredDir:out,snapshotId:checked.snapshotId,
   files:checked.files,auditTip:checked.ledger.tip,releaseAllowed:false};
 }finally{
  if(!completed)fs.rmSync(tmp,{recursive:true,force:true,maxRetries:60,retryDelay:50});
 }
}
function oopsFileMismatch(snapshotDir,stagingDir){
 if(hashFile(path.join(snapshotDir,'photo.sqlite')).sha256!==
    hashFile(path.join(stagingDir,'photo.sqlite')).sha256)return true;
 return !sameFiles(snapshotFiles(path.join(snapshotDir,'photos')),
   snapshotFiles(path.join(stagingDir,'photos')));
}
module.exports=Object.freeze({
 createSnapshot,verifySnapshot,restoreSnapshot,releaseAllowed:false
});
