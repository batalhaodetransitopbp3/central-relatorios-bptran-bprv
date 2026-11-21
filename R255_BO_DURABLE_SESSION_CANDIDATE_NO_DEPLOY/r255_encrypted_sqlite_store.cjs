'use strict';
/*
 * R255: Isolated SQLite proof of durable encrypted challenge/session storage.
 * Requirements: Node 24+, private file permissions and 32-byte secret from a
 * server-side secrets manager. Never commit the key or the database.
 *
 * The database is not a real cross-region/session HA solution and does not
 * authorize production release. Each operation is synchronous and local.
 */
const {DatabaseSync}=require('node:sqlite');
const crypto=require('node:crypto');
function deny(code){const e=new Error('R255_STORE_'+code);e.code=code;throw e}
function seal(key,context,plain){
 const iv=crypto.randomBytes(12);
 const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
 cipher.setAAD(Buffer.from(context,'utf8'));
 const body=Buffer.concat([cipher.update(Buffer.from(JSON.stringify(plain),'utf8')),cipher.final()]);
 return Buffer.concat([iv,cipher.getAuthTag(),body]);
}
function unseal(key,context,ciphertext){
 if(!ArrayBuffer.isView(ciphertext)||ciphertext.byteLength<29)deny('CIPHERTEXT_INVALID');
 // Node built-in SQLite returns Uint8Array, not necessarily Buffer.
 ciphertext=Buffer.from(ciphertext.buffer,ciphertext.byteOffset,ciphertext.byteLength);
 const dec=crypto.createDecipheriv('aes-256-gcm',key,ciphertext.subarray(0,12));
 dec.setAAD(Buffer.from(context,'utf8'));
 dec.setAuthTag(ciphertext.subarray(12,28));
 try{return JSON.parse(Buffer.concat([
   dec.update(ciphertext.subarray(28)),dec.final()
 ]).toString('utf8'))}
 catch(_){deny('CIPHERTEXT_AUTHENTICATION_FAILED')}
}
function create({dbPath,encryptionKey,now,namespace}={}){
 if(typeof dbPath!=='string'||!dbPath||
   (namespace!=='challenge'&&namespace!=='session')||
   !Buffer.isBuffer(encryptionKey)||encryptionKey.length!==32||
   typeof now!=='function')deny('CONFIG_INVALID');
 const encryption=Buffer.from(encryptionKey);
 const db=new DatabaseSync(dbPath,{timeout:5000});
 db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
 db.exec(`CREATE TABLE IF NOT EXISTS bo_auth_state (
    namespace TEXT NOT NULL,
    key_hash TEXT NOT NULL,
    ciphertext BLOB NOT NULL,
    expires_ms INTEGER NOT NULL,
    PRIMARY KEY(namespace,key_hash)
  ); CREATE INDEX IF NOT EXISTS bo_auth_expiry
    ON bo_auth_state(expires_ms);`);
 function clock(){
  const ms=Date.parse(now());
  if(!Number.isSafeInteger(ms))deny('CLOCK_INVALID');
  return ms;
 }
 function identity(value){
  if(typeof value!=='string'||!value||value.length>512)deny('KEY_INVALID');
  return crypto.createHmac('sha256',encryption)
    .update(namespace+'\x00'+value).digest('hex');
 }
 const select=db.prepare('SELECT ciphertext,expires_ms FROM bo_auth_state WHERE namespace=? AND key_hash=?');
 const remove=db.prepare('DELETE FROM bo_auth_state WHERE namespace=? AND key_hash=?');
 const insert=db.prepare('INSERT INTO bo_auth_state(namespace,key_hash,ciphertext,expires_ms) VALUES(?,?,?,?) ON CONFLICT(namespace,key_hash) DO UPDATE SET ciphertext=excluded.ciphertext,expires_ms=excluded.expires_ms');
 const expires=db.prepare('DELETE FROM bo_auth_state WHERE namespace=? AND expires_ms<=?');
 const count=db.prepare('SELECT COUNT(*) AS n FROM bo_auth_state WHERE namespace=? AND expires_ms>?');
 function context(id){return 'r255-bo-sessions:v1:'+namespace+':'+id}
 function get(key){
  const id=identity(key),r=select.get(namespace,id);
  if(!r||r.expires_ms<=clock())return null;
  return unseal(encryption,context(id),r.ciphertext);
 }
 function set(key,value){
  const id=identity(key);
  if(!value||typeof value!=='object'||!Number.isSafeInteger(value.expiresMs)||
     value.expiresMs<=clock())deny('VALUE_INVALID_OR_EXPIRED');
  insert.run(namespace,id,seal(encryption,context(id),value),value.expiresMs);
 }
 function del(key){return remove.run(namespace,identity(key)).changes>0}
 function consume(key){
  const id=identity(key);
  db.exec('BEGIN IMMEDIATE');
  try{
   const row=select.get(namespace,id);
   remove.run(namespace,id);
   db.exec('COMMIT');
   if(!row||row.expires_ms<=clock())return null;
   return unseal(encryption,context(id),row.ciphertext);
  }catch(e){
   if(db.isTransaction)db.exec('ROLLBACK');
   throw e;
  }
 }
 function isActive(key,old){
  if(!old||typeof old.revision!=='string'||old.revision.length<16)return false;
  const fresh=get(key);
  return !!(fresh&&fresh.revision===old.revision&&fresh.expiresMs>clock());
 }
 return Object.freeze({
  get,set,has:key=>!!get(key),delete:del,consume,isActive,
  prune:()=>expires.run(namespace,clock()),
  get size(){return Number(count.get(namespace,clock()).n)},
  close:()=>db.close(),
  releaseAllowed:false
 });
}
module.exports=Object.freeze({create,releaseAllowed:false});
