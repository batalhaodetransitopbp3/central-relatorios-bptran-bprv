'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {create:openR256}=require('../R256_BO_PHOTO_LEDGER_CANDIDATE_NO_DEPLOY/r256_private_photo_ledger.cjs');
const {create:makeArchive}=require('../R252_BO_PERSONAL_IDENTITY_CANDIDATE_NO_DEPLOY/r252_bo_photo_archive_core');
const r257=require('../R257_BO_RECOVERY_CANDIDATE_NO_DEPLOY/r257_signed_evidence_snapshot.cjs');
const EVENT='svc-123123123::BO::PM2026999999';
const SERVICE='svc-123123123';
const BO='PM2026999999';
const CLOCK='2026-11-21T17:30:00.000Z';
const JPG=Buffer.from([255,216,255,224,0,16,74,70,73,70,0,0,0,0,255,217]);
function makeFixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'r257-safe-evidence-'));
 const photoDirectory=path.join(root,'live-photos');
 const dbPath=path.join(root,'live-photo.sqlite');
 const backupRoot=path.join(root,'snapshots');
 const restoreRoot=path.join(root,'restores');
 fs.mkdirSync(photoDirectory,{recursive:true});
 fs.mkdirSync(backupRoot,{recursive:true});
 fs.mkdirSync(restoreRoot,{recursive:true});
 const encryptionKey=crypto.randomBytes(32);
 const auditKey=crypto.randomBytes(32);
 const pair=crypto.generateKeyPairSync('ed25519');
 const ledger=openR256({dbPath,photoDirectory,encryptionKey,auditKey,now:()=>CLOCK});
 const personal={authenticated:true,matricula:'1111111',batalhao:'BPRv',
  companhia:'1 CPRv',roles:['BO_PHOTO_WRITE'],source:'TRUSTED_SERVER_SESSION',
  sessionValid:true,allowedEventIds:[EVENT],allowedServiceIds:[SERVICE]};
 const event={eventId:EVENT,tipo:'BO',status:'ATIVO',numeroDocumento:BO,
  serviceId:SERVICE,batalhao:'BPRv',companhia:'1 CPRv',locked:false};
 const photos=makeArchive({...ledger,
  authenticate:async()=>({...personal}),
  getEvent:async()=>({...event})});
 async function addPhoto(n=1){
  const body={requestId:'post-'+crypto.randomUUID(),
   photoId:'photo-'+crypto.randomUUID(),eventId:EVENT,
   numeroBO:BO,serviceId:SERVICE,position:n,
   caption:'SYNTHETIC PHOTO '+n,
   renderedDataUrl:'data:image/jpeg;base64,'+JPG.toString('base64')};
  const result=await photos.upload(body,'fake-session-not-used');
  return {body,result};
 }
 const snapshot=async hooks=>r257.createSnapshot({
  dbPath,photoDirectory,backupRoot,encryptionKey,auditKey,
  signingPrivateKey:pair.privateKey,verificationPublicKey:pair.publicKey,
  now:()=>CLOCK,hooks
 });
 const verify=dir=>r257.verifySnapshot({
  snapshotDir:dir,verificationPublicKey:pair.publicKey});
 const restore=dir=>r257.restoreSnapshot({
  snapshotDir:dir,restoreRoot,verificationPublicKey:pair.publicKey,
  encryptionKey,auditKey,now:()=>CLOCK
 });
 function cleanup(){
  ledger.close();fs.rmSync(root,{recursive:true,force:true});
 }
 return {root,dbPath,photoDirectory,backupRoot,restoreRoot,
  encryptionKey,auditKey,pair,ledger,addPhoto,snapshot,verify,restore,cleanup};
}
test('R257 remains NO-GO even with cryptographic backups',()=>{
 assert.equal(r257.releaseAllowed,false);
});
test('signed snapshot of 9 photo pages verifies and restores in independent directory',async()=>{
 const f=makeFixture();
 try{
  for(let i=1;i<=9;i++)await f.addPhoto(i);
  const snap=await f.snapshot();
  assert.equal(snap.ok,true);
  assert.equal(snap.files,9);
  assert.equal(f.verify(snap.snapshotDir).files,9);
  const restored=f.restore(snap.snapshotDir);
  assert.equal(restored.ok,true);
  assert.equal(restored.files,9);
  const review=openR256({dbPath:path.join(restored.restoredDir,'photo.sqlite'),
   photoDirectory:path.join(restored.restoredDir,'photos'),
   encryptionKey:f.encryptionKey,auditKey:f.auditKey,now:()=>CLOCK});
  try{
   assert.equal(review.listPhotos instanceof Function,true);
   assert.equal((await review.listPhotos(EVENT)).length,9);
   assert.equal(review.reconcile().ok,true);
   assert.equal(review.verifyAuditChain().ok,true);
  }finally{review.close()}
 }finally{f.cleanup()}
});
test('one-photo snapshot still verifies after live state receives additional photos',async()=>{
 const f=makeFixture();
 try{
  await f.addPhoto(1);
  const first=await f.snapshot();
  await f.addPhoto(2);
  assert.equal(f.verify(first.snapshotDir).files,1);
  assert.equal(f.verify((await f.snapshot()).snapshotDir).files,2);
 }finally{f.cleanup()}
});
test('signature tampering fails without any restoration directory created',async()=>{
 const f=makeFixture();
 try{
  await f.addPhoto();
  const snap=await f.snapshot();
  const manifest=path.join(snap.snapshotDir,'manifest.json');
  fs.appendFileSync(manifest,' ');
  assert.throws(()=>f.verify(snap.snapshotDir),/R257_SIGNATURE_VERIFICATION_FAILED/);
  assert.throws(()=>f.restore(snap.snapshotDir),/R257_SIGNATURE_VERIFICATION_FAILED/);
  assert.equal(fs.readdirSync(f.restoreRoot).length,0);
 }finally{f.cleanup()}
});
test('separate Ed25519 public key cannot verify an otherwise valid signed snapshot',async()=>{
 const f=makeFixture();
 try{
  await f.addPhoto();
  const snap=await f.snapshot();
  const other=crypto.generateKeyPairSync('ed25519');
  assert.throws(()=>r257.verifySnapshot({
   snapshotDir:snap.snapshotDir,verificationPublicKey:other.publicKey
  }),/R257_SIGNATURE_VERIFICATION_FAILED/);
 }finally{f.cleanup()}
});
test('photo ciphertext changed in snapshot is rejected by SHA-256 manifest',async()=>{
 const f=makeFixture();
 try{
  await f.addPhoto();
  const snap=await f.snapshot();
  const filename=fs.readdirSync(path.join(snap.snapshotDir,'photos'))[0];
  const file=path.join(snap.snapshotDir,'photos',filename);
  const bytes=fs.readFileSync(file);bytes[bytes.length-1]^=1;fs.writeFileSync(file,bytes);
  assert.throws(()=>f.verify(snap.snapshotDir),/R257_BLOB_MANIFEST_MISMATCH/);
 }finally{f.cleanup()}
});
test('SQLite database changed after sealing backup is rejected',async()=>{
 const f=makeFixture();
 try{
  await f.addPhoto();
  const snap=await f.snapshot();
  const target=path.join(snap.snapshotDir,'photo.sqlite');
  fs.appendFileSync(target,Buffer.from('tamper'));
  assert.throws(()=>f.verify(snap.snapshotDir),/R257_DATABASE_CHECKSUM_MISMATCH/);
 }finally{f.cleanup()}
});
test('unexpected backup file or traversal-like name is rejected before restore',async()=>{
 const f=makeFixture();
 try{
  await f.addPhoto();
  const snap=await f.snapshot();
  const extra=path.join(snap.snapshotDir,'unexpected.txt');
  fs.writeFileSync(extra,'untrusted');
  assert.throws(()=>f.verify(snap.snapshotDir),/R257_SNAPSHOT_LAYOUT_INVALID/);
  fs.unlinkSync(extra);
  fs.writeFileSync(path.join(snap.snapshotDir,'photos','backdoor.enc'),'fake');
  assert.throws(()=>f.verify(snap.snapshotDir),/R257_UNSAFE_BLOB_FILE_NAME/);
 }finally{f.cleanup()}
});
test('wrong decryption key fails restore without publishing a broken directory',async()=>{
 const f=makeFixture();
 try{
  await f.addPhoto();
  const snap=await f.snapshot();
  assert.throws(()=>r257.restoreSnapshot({
   snapshotDir:snap.snapshotDir,restoreRoot:f.restoreRoot,
   verificationPublicKey:f.pair.publicKey,
   encryptionKey:crypto.randomBytes(32),auditKey:f.auditKey,
   now:()=>CLOCK
  }),/R256_ENCRYPTED_BLOB_AUTHENTICATION_FAILED/);
  assert.equal(fs.readdirSync(f.restoreRoot).length,0);
 }finally{f.cleanup()}
});
test('backup is rejected when live encrypted evidence is missing or altered',async()=>{
 const f=makeFixture();
 try{
  await f.addPhoto();
  const file=path.join(f.photoDirectory,fs.readdirSync(f.photoDirectory)[0]);
  fs.unlinkSync(file);
  await assert.rejects(f.snapshot(),/R257_LEDGER_RECONCILIATION_FAILED/);
  assert.equal(fs.readdirSync(f.backupRoot).length,0);
 }finally{f.cleanup()}
});
test('backup detects concurrent new photo after DB snapshot and does not publish',async()=>{
 const f=makeFixture();
 try{
  await f.addPhoto(1);
  await assert.rejects(f.snapshot({afterDatabaseSnapshot:async()=>{
   await f.addPhoto(2);
  }}),/R257_SOURCE_CHANGED_DURING_SNAPSHOT|R257_LEDGER_RECONCILIATION_FAILED/);
  assert.equal(fs.readdirSync(f.backupRoot).length,0);
 }finally{f.cleanup()}
});
test('fault injected just before backup publication removes partial staging',async()=>{
 const f=makeFixture();
 try{
  await f.addPhoto();
  await assert.rejects(f.snapshot({beforePublish:()=>{
   throw Error('R257_SYNTHETIC_POWER_LOSS')
  }}),/R257_SYNTHETIC_POWER_LOSS/);
  assert.equal(fs.readdirSync(f.backupRoot).length,0);
 }finally{f.cleanup()}
});
test('restore refuses a pre-existing target and never overwrites evidence',async()=>{
 const f=makeFixture();
 try{
  await f.addPhoto();
  const snap=await f.snapshot();
  const first=f.restore(snap.snapshotDir);
  const marker=path.join(first.restoredDir,'operator-note.txt');
  fs.writeFileSync(marker,'do-not-overwrite');
  assert.throws(()=>f.restore(snap.snapshotDir),/R257_TARGET_ALREADY_EXISTS/);
  assert.equal(fs.readFileSync(marker,'utf8'),'do-not-overwrite');
  assert.equal(fs.readdirSync(f.restoreRoot).length,1);
 }finally{f.cleanup()}
});
test('failure during restore finalization leaves no partial published restore',async()=>{
 const f=makeFixture();
 try{
  await f.addPhoto();
  const snap=await f.snapshot();
  assert.throws(()=>r257.restoreSnapshot({
   snapshotDir:snap.snapshotDir,restoreRoot:f.restoreRoot,
   verificationPublicKey:f.pair.publicKey,
   encryptionKey:f.encryptionKey,auditKey:f.auditKey,now:()=>CLOCK,
   hooks:{beforePublish:()=>{throw Error('RESTORE_TEST_ABORT')}}
  }),/RESTORE_TEST_ABORT/);
  assert.equal(fs.readdirSync(f.restoreRoot).length,0);
 }finally{f.cleanup()}
});
test('mismatched signing public key fails before opening snapshot',async()=>{
 const f=makeFixture();
 try{
  await f.addPhoto();
  const wrong=crypto.generateKeyPairSync('ed25519');
  await assert.rejects(r257.createSnapshot({
   dbPath:f.dbPath,photoDirectory:f.photoDirectory,backupRoot:f.backupRoot,
   encryptionKey:f.encryptionKey,auditKey:f.auditKey,
   signingPrivateKey:f.pair.privateKey,verificationPublicKey:wrong.publicKey,
   now:()=>CLOCK
  }),/R257_SIGNATURE_KEY_PAIR_MISMATCH/);
  assert.equal(fs.readdirSync(f.backupRoot).length,0);
 }finally{f.cleanup()}
});
test('backup root nested inside evidence directory is rejected',async()=>{
 const f=makeFixture();
 try{
  await f.addPhoto();
  await assert.rejects(r257.createSnapshot({
   dbPath:f.dbPath,photoDirectory:f.photoDirectory,backupRoot:f.photoDirectory,
   encryptionKey:f.encryptionKey,auditKey:f.auditKey,
   signingPrivateKey:f.pair.privateKey,verificationPublicKey:f.pair.publicKey,
   now:()=>CLOCK
  }),/R257_BACKUP_ROOT_INSIDE_SOURCE/);
 }finally{f.cleanup()}
});
test('backup manifest itself does not expose plaintext JPEG or user email',async()=>{
 const f=makeFixture();
 try{
  await f.addPhoto();
  const snap=await f.snapshot();
  const manifest=fs.readFileSync(path.join(snap.snapshotDir,'manifest.json'),'utf8');
  assert(!manifest.includes('SYNTHETIC PHOTO'));
  assert(!manifest.includes('1111111'));
  assert(!manifest.includes(BO));
  assert(!manifest.includes(JPG.toString('base64')));
  assert.equal(JSON.parse(manifest).blobs.length,1);
 }finally{f.cleanup()}
});

test('unsigned staging alteration before snapshot publish cannot escape signature verification',async()=>{
 const f=makeFixture();
 try{
  await f.addPhoto();
  await assert.rejects(f.snapshot({beforePublish:()=>{
   const stage=fs.readdirSync(f.backupRoot).find(x=>x.startsWith('.stage-'));
   assert(stage);
   const photos=path.join(f.backupRoot,stage,'photos');
   const target=path.join(photos,fs.readdirSync(photos)[0]);
   const bytes=fs.readFileSync(target);
   bytes[bytes.length-1]^=1;
   fs.writeFileSync(target,bytes);
  }}),/R257_BLOB_MANIFEST_MISMATCH/);
  assert.equal(fs.readdirSync(f.backupRoot).length,0);
 }finally{f.cleanup()}
});
test('restore detects signed source photo changing just before final publication',async()=>{
 const f=makeFixture();
 try{
  await f.addPhoto();
  const snap=await f.snapshot();
  assert.throws(()=>r257.restoreSnapshot({
   snapshotDir:snap.snapshotDir,restoreRoot:f.restoreRoot,
   verificationPublicKey:f.pair.publicKey,
   encryptionKey:f.encryptionKey,auditKey:f.auditKey,now:()=>CLOCK,
   hooks:{beforePublish:()=>{
    const photos=path.join(snap.snapshotDir,'photos');
    const file=path.join(photos,fs.readdirSync(photos)[0]);
    const bytes=fs.readFileSync(file);bytes[bytes.length-1]^=1;
    fs.writeFileSync(file,bytes);
   }}
  }),/R257_BLOB_MANIFEST_MISMATCH/);
  assert.equal(fs.readdirSync(f.restoreRoot).length,0);
 }finally{f.cleanup()}
});
test('restore detects altered staging photo after its first successful reconciliation',async()=>{
 const f=makeFixture();
 try{
  await f.addPhoto();
  const snap=await f.snapshot();
  assert.throws(()=>r257.restoreSnapshot({
   snapshotDir:snap.snapshotDir,restoreRoot:f.restoreRoot,
   verificationPublicKey:f.pair.publicKey,
   encryptionKey:f.encryptionKey,auditKey:f.auditKey,now:()=>CLOCK,
   hooks:{beforePublish:()=>{
    const stage=fs.readdirSync(f.restoreRoot).find(x=>x.startsWith('.restore-stage-'));
    assert(stage);
    const photos=path.join(f.restoreRoot,stage,'photos');
    const target=path.join(photos,fs.readdirSync(photos)[0]);
    const bytes=fs.readFileSync(target);
    bytes[bytes.length-1]^=1;fs.writeFileSync(target,bytes);
   }}
  }),/R257_RESTORED_FILE_HASH_MISMATCH/);
  assert.equal(fs.readdirSync(f.restoreRoot).length,0);
 }finally{f.cleanup()}
});
test('wrong audit HMAC key fails restore and preserves destination cleanliness',async()=>{
 const f=makeFixture();
 try{
  await f.addPhoto();
  const snap=await f.snapshot();
  assert.throws(()=>r257.restoreSnapshot({
   snapshotDir:snap.snapshotDir,restoreRoot:f.restoreRoot,
   verificationPublicKey:f.pair.publicKey,
   encryptionKey:f.encryptionKey,auditKey:crypto.randomBytes(32),now:()=>CLOCK
  }),/R257_LEDGER_RECONCILIATION_FAILED/);
  assert.equal(fs.readdirSync(f.restoreRoot).length,0);
 }finally{f.cleanup()}
});
test('empty archive snapshot is still signed, independently verifiable, and restorable',async()=>{
 const f=makeFixture();
 try{
  const snap=await f.snapshot();
  assert.equal(snap.files,0);
  assert.equal(f.verify(snap.snapshotDir).ledger.tip,'GENESIS');
  const restored=f.restore(snap.snapshotDir);
  assert.equal(restored.files,0);
  assert.equal(fs.readdirSync(path.join(restored.restoredDir,'photos')).length,0);
 }finally{f.cleanup()}
});
