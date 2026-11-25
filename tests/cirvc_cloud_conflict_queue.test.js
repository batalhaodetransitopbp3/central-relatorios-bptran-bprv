'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const src=fs.readFileSync(path.join(__dirname,'..','central_cloud.js'),'utf8');
const start=src.indexOf('function readQueue(){'),end=src.indexOf('async function compressImage(',start);
assert.ok(start>=0&&end>start);
const storage=new Map(),attempts={};
const ctx={
 QUEUE_KEY:'synthetic-queue',
 localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
 navigator:{onLine:true},
 getToken:()=> 'SYNTHETIC_TOKEN',tokenKindForAction:()=> 'central',
 uid:()=> 'test-queue-item',isAuthError:()=> false,
 submitForm:async(action,payload)=>{
  const cid=payload?.cirvcs?.[0]?.cirvcId||'';
  attempts[cid]=(attempts[cid]||0)+1;
  if(cid==='cross-service')throw Error('CIRVC_ORIGIN_CONFLICT: registro já vinculado');
  if(cid==='duplicate-in-batch')throw Error('CIRVC_DUPLICATE_ID_IN_BATCH: ID repetido');
  return {ok:true};
 }
};
vm.createContext(ctx);vm.runInContext(src.slice(start,end),ctx);
(async()=>{
 for(const id of ['cross-service','duplicate-in-batch']){
  const payload={cirvcs:[{cirvcId:id,numeroTermo:'FAKE 001'}]};
  await assert.rejects(ctx.postOrQueue('cirvc-register',payload),/CIRVC_(ORIGIN_CONFLICT|DUPLICATE_ID_IN_BATCH)/,'deterministic backend errors must be shown, not silently queued');
  assert.equal(ctx.queueCount(),0,'online conflict must not be enqueued');
 }
 const q=[{id:'entry-1',action:'cirvc-register',payload:{cirvcs:[{cirvcId:'cross-service',numeroTermo:'FAKE 001'}]}},
  {id:'entry-2',action:'cirvc-register',payload:{cirvcs:[{cirvcId:'duplicate-in-batch',numeroTermo:'FAKE 002'}]}},
  {id:'entry-3',action:'cirvc-register',payload:{cirvcs:[{cirvcId:'valid',numeroTermo:'FAKE 003'}]}}];
 ctx.writeQueue(q);
 const first=await ctx.retryQueue();
 assert.equal(first.sent,1);assert.equal(first.blocked,2);
 assert.equal(ctx.queueCount(),2);assert.equal(ctx.queueBlockedCount(),2);
 assert.equal(JSON.stringify(ctx.readQueue().map(x=>x.blockedReason)),JSON.stringify(['DATA_CONFLICT','DATA_CONFLICT']));
 assert.equal(ctx.readQueue()[0].payload.cirvcs[0].numeroTermo,'FAKE 001','retained data must remain intact');
 const before=Object.assign({},attempts);
 const after=await ctx.retryQueue();
 assert.equal(after.sent,0);assert.equal(after.blocked,2);
 assert.equal(attempts['cross-service'],before['cross-service']);
 assert.equal(attempts['duplicate-in-batch'],before['duplicate-in-batch']);
 assert.match(src,/conflito\(s\) de registro/,'visible badge should be generic for both operations and CIRVC');
 console.log('PASS CIRVC definitive conflicts show error online; offline drafts retained but not automatically retried; ordinary items synchronize');
})().catch(e=>{console.error(e);process.exitCode=1});
