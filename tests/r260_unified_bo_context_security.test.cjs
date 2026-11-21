'use strict';
/* R260 synthetic Index/RSD/RCO canonical BO contract tests.
 * Node only; browser remains local-only and Google services are not accessed.
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs'),path=require('node:path');
const r260=require('../R260_BO_UNIFIED_REVIEW_NO_DEPLOY/r260_canonical_entry_bridge.js');
const r252=require('../R252_BO_PERSONAL_IDENTITY_CANDIDATE_NO_DEPLOY/r252_personal_bo_gate.js');
const r239=require('../R252_BO_PERSONAL_IDENTITY_CANDIDATE_NO_DEPLOY/r252_bo_photo_archive_core.js');
const ROOT=path.resolve(__dirname,'..');
const NOW='2026-11-21T17:40:00.000Z';
const BO='PM2026123456',SERVICE='SVC-R260-ISOLATED-1',
 RSD='RSD-R260-ISOLATED-1',RCO='RCO-R260-ISOLATED-1';
const EVENT=SERVICE+'::BO::'+BO;
const PHOTO=Buffer.from([255,216,255,224,0,16,74,70,73,70,0,0,0,0,255,217]);
function fixture({standaloneRco=false}={}){
 const row={email:'synthetic.r260@example.test',idpSubject:'r260-sub',
  matricula:'R260-TEST-01',batalhao:'BPRv',companhia:'1 CPRv',
  status:'ATIVO',boPhotoWrite:true};
 const event={eventId:standaloneRco?RCO+'::BO::'+BO:EVENT,
  tipo:'BO',status:'ATIVO',numeroDocumento:BO,
  serviceId:standaloneRco?'':SERVICE,
  rsdReportId:standaloneRco?'':RSD,
  rcoReportId:RCO,batalhao:'BPRv',companhia:'1 CPRv',locked:false};
 const events=[event];
 const assignment={matricula:row.matricula,eventId:event.eventId,
  batalhao:'BPRv',companhia:'1 CPRv',status:'ATIVO',
  expiresAt:'2026-11-21T20:00:00.000Z'};
 const identity={verification:'SERVER_VERIFIED',
  issuer:'https://accounts.google.com',audience:'r260-synthetic',
  emailVerified:true,subject:row.idpSubject,email:row.email,
  issuedAt:'2026-11-21T17:35:00.000Z',
  expiresAt:'2026-11-21T17:50:00.000Z'};
 const auth=r252.create({expectedIssuer:identity.issuer,
  expectedAudience:identity.audience,now:()=>NOW,
  getVerifiedIdentity:async()=>identity,
  lookupRosterByEmail:async()=>[row],
  listAssignmentsByMatricula:async()=>[assignment],
  readCanonicalEvent:async id=>events.find(e=>e.eventId===id)||null});
 const requests=new Map(),photos=new Map(),files=new Map();
 let writes=0,lockHook=null;
 const adapter={
  now:()=>NOW,sha256:b=>crypto.createHash('sha256').update(b).digest('hex'),
  decodeJpeg:base64=>Buffer.from(base64,'base64'),
  authenticate:auth.authenticate,getEvent:auth.getEvent,
  withExclusiveLock:async(_key,fn)=>{
   if(lockHook)await lockHook();
   return fn();
  },
  getRequest:async id=>requests.get(id)||null,
  putRequest:async x=>{requests.set(x.requestId,{...x})},
  getPhoto:async(ev,id)=>photos.get(ev+':'+id)||null,
  listPhotos:async ev=>[...photos.values()].filter(x=>x.eventId===ev),
  putPhoto:async x=>{photos.set(x.eventId+':'+x.photoId,{...x})},
  findFileByStableName:async name=>files.get(name)||null,
  writePrivateFile:async x=>{
   const file={fileId:'R260-SYNTHETIC-FILE-'+(++writes),
    eventId:x.eventId,digest:x.digest};
   files.set(x.stableName,file);return file;
  },
  deletePrivateFile:async()=>{throw Error('NO_DELETION_IN_TEST')}
 };
 const archive=r239.create(adapter);
 const bridge=r260.create({authority:auth,
  findCanonicalEventsByBoNumber:async number=>
   events.filter(e=>e.numeroDocumento===number).map(e=>({eventId:e.eventId})),
  archive});
 const launchIndex={from:'index',module:'bo'};
 const launchRsd={from:'rsd',module:'bo',serviceId:SERVICE,
  rsdReportId:RSD,editId:BO};
 const launchRco={from:'rco',module:'bo',editId:BO};
 const photo=(position=1,overrides={})=>({
  requestId:'post-'+crypto.randomUUID(),
  photoId:'photo-'+crypto.randomUUID(),
  position,caption:'R260 synthetic JPEG',
  renderedDataUrl:'data:image/jpeg;base64,'+PHOTO.toString('base64'),
  ...overrides
 });
 return {row,event,events,assignment,identity,requests,photos,files,
  auth,bridge,photo,launchIndex,launchRsd,launchRco,archive,
  setLockHook:fn=>{lockHook=fn},writes:()=>writes};
}
test('merged R260 and renderer are explicitly not deployable',()=>{
 assert.equal(r260.releaseAllowed,false);
 assert.equal(r260.connectedToLiveBoPage,false);
 assert.equal(fixture().bridge.connectedToLiveBoPage,false);
});
test('same canonical event is found via Index, RSD and RCO verified contexts',async()=>{
 const f=fixture();
 for(const launch of [f.launchIndex,f.launchRsd,f.launchRco]){
  const x=await f.bridge.resolve({numeroBO:BO,launch});
  assert.equal(x.eventId,EVENT);
  assert.equal(x.numeroBO,BO);
  assert.equal(x.serviceId,SERVICE);
  assert.equal(x.rcoReportId,RCO);
 }
});
test('Index can upload photo only after server finds a canonical BO record',async()=>{
 const f=fixture();
 const result=await f.bridge.upload({numeroBO:BO,launch:f.launchIndex,
  photo:f.photo()});
 assert.equal(result.ok,true);
 assert.equal(result.page,1);
 assert.equal(f.writes(),1);
 assert.equal(f.requests.size,1);
 assert.equal(f.photos.size,1);
});
test('RSD user and RCO user see the same BO photos if canonical service matches',async()=>{
 const f=fixture(),photo=f.photo(1);
 const first=await f.bridge.upload({numeroBO:BO,launch:f.launchRsd,photo});
 const listRco=await f.bridge.list({numeroBO:BO,launch:f.launchRco});
 assert.equal(first.ok,true);
 assert.equal(listRco.items.length,1);
 assert.equal(listRco.items[0].digest,first.digest);
 const replay=await f.bridge.upload({numeroBO:BO,launch:f.launchIndex,photo});
 assert.equal(replay.duplicate,true);
 assert.equal(f.writes(),1);
});
test('standalone RCO without serviceId resolves through canonical rcoReportId',async()=>{
 const f=fixture({standaloneRco:true});
 const r=await f.bridge.upload({numeroBO:BO,launch:{from:'rco',module:'bo',
  editId:BO},photo:f.photo(2)});
 assert.equal(r.ok,true);
 assert.equal(r.page,1);
 const list=await f.bridge.list({numeroBO:BO,launch:f.launchIndex});
 assert.equal(list.items.length,1);
});
test('RCO launch URL WITHOUT serviceId still uses server canonical link',async()=>{
 const f=fixture();
 const ctx=await f.bridge.resolve({numeroBO:BO,
  launch:{from:'rco',module:'bo',editId:BO}});
 assert.equal(ctx.serviceId,SERVICE);
 assert.equal(ctx.rcoReportId,RCO);
});
test('9 separate photos preserve 4 per printable annex page in archive listing',async()=>{
 const f=fixture();
 for(let n=1;n<=9;n++){
  const launch=[f.launchIndex,f.launchRsd,f.launchRco][(n-1)%3];
  await f.bridge.upload({numeroBO:BO,launch,photo:f.photo(n)});
 }
 const list=await f.bridge.list({numeroBO:BO,launch:f.launchIndex});
 assert.deepEqual(list.items.map(x=>x.page),[1,1,1,1,2,2,2,2,3]);
 assert.equal(f.writes(),9);
});
test('uncommitted new BO has no photo target; never invent canonical eventId',async()=>{
 const f=fixture();f.events.length=0;
 await assert.rejects(f.bridge.upload({numeroBO:BO,launch:f.launchIndex,
  photo:f.photo()}),/R260_CANONICAL_BO_NOT_UNIQUE_OR_ABSENT/);
 assert.equal(f.writes(),0);
});
test('duplicate event number in canonical database cannot choose first arbitrarily',async()=>{
 const f=fixture();
 f.events.push({...f.event,eventId:RCO+'::BO::'+BO});
 await assert.rejects(f.bridge.resolve({numeroBO:BO,launch:f.launchIndex}),
  /R260_CANONICAL_BO_NOT_UNIQUE_OR_ABSENT/);
});
test('client cannot forge actor roles, eventId, token, company or BO in JPEG payload',async()=>{
 const f=fixture();
 for(const key of ['actorMatricula','eventId','token','batalhao','numeroBO']){
  const payload=f.photo(1,{[key]:'malicious-value'});
  await assert.rejects(f.bridge.upload({numeroBO:BO,
   launch:f.launchIndex,photo:payload}),
   /R260_CLIENT_CANNOT_CHOOSE_EVENT_OR_ACTOR/);
 }
 assert.equal(f.requests.size,0);
});
test('RSD launch cannot claim someone else serviceId or rsdReportId',async()=>{
 const f=fixture();
 await assert.rejects(f.bridge.resolve({numeroBO:BO,
  launch:{...f.launchRsd,serviceId:'SVC-FORGED-0001'}}),
  /R260_LAUNCH_SERVICE_ID_MISMATCH/);
 await assert.rejects(f.bridge.resolve({numeroBO:BO,
  launch:{...f.launchRsd,rsdReportId:'RSD-FORGED-0001'}}),
  /R260_LAUNCH_RSD_ID_MISMATCH/);
});
test('RCO claimed reportId inconsistent with canonical event fails closed',async()=>{
 const f=fixture();
 await assert.rejects(f.bridge.resolve({numeroBO:BO,
  launch:{...f.launchRco,rcoReportId:'RCO-FORGED-0001'}}),
  /R260_LAUNCH_RCO_ID_MISMATCH/);
});
test('Index launch cannot claim a service context in query string',async()=>{
 const f=fixture();
 await assert.rejects(f.bridge.resolve({numeroBO:BO,
  launch:{from:'index',serviceId:SERVICE}}),
  /R260_INDEX_MUST_NOT_CLAIM_SERVICE/);
});
test('mismatched editId or invalid BO prevents writing anything',async()=>{
 const f=fixture();
 await assert.rejects(f.bridge.upload({numeroBO:BO,photo:f.photo(),
  launch:{from:'rco',editId:'PM2026987654'}}),
  /R260_EDIT_REFERENCE_BO_MISMATCH/);
 await assert.rejects(f.bridge.resolve({numeroBO:'NOT_A_BO',
  launch:f.launchIndex}),/R260_CANONICAL_BO_NUMBER_REQUIRED/);
 assert.equal(f.writes(),0);
});
test('unit and active military assignment are checked by server R252',async()=>{
 const f=fixture();
 f.row.boPhotoWrite=false;
 await assert.rejects(f.bridge.resolve({numeroBO:BO,launch:f.launchIndex}),
  /R252_PERSONAL_ACTOR_NOT_APPROVED/);
 f.row.boPhotoWrite=true;f.assignment.status='INATIVO';
 await assert.rejects(f.bridge.resolve({numeroBO:BO,launch:f.launchIndex}),
  /R252_EVENT_ASSIGNMENT_REVOKED/);
});
test('BO cancellation or lock prevents photo append before calling archive',async()=>{
 const f=fixture();
 f.event.status='CANCELADO';
 await assert.rejects(f.bridge.upload({numeroBO:BO,launch:f.launchIndex,
  photo:f.photo()}),/R260_CANONICAL_BO_NOT_ACTIVE_OR_MISMATCH/);
 f.event.status='ATIVO';f.event.locked=true;
 await assert.rejects(f.bridge.upload({numeroBO:BO,launch:f.launchIndex,
  photo:f.photo()}),/R260_CANONICAL_BO_NOT_ACTIVE_OR_MISMATCH/);
 assert.equal(f.writes(),0);
});
test('personal session is checked again inside photo archive critical section',async()=>{
 const f=fixture();
 f.setLockHook(async()=>{f.assignment.status='INATIVO'});
 await assert.rejects(f.bridge.upload({numeroBO:BO,launch:f.launchIndex,
  photo:f.photo()}),/R252_EVENT_ASSIGNMENT_REVOKED/);
 assert.equal(f.requests.size,0);
 assert.equal(f.writes(),0);
});
test('shared CENTRAL_TOKEN is never accepted as a personal credential',async()=>{
 const f=fixture();
 await assert.rejects(f.bridge.resolve({numeroBO:BO,launch:f.launchIndex,
  credential:{CENTRAL_TOKEN:'shared'}}),
  /R252_CLIENT_CREDENTIAL_NOT_PERSONAL_IDENTITY/);
});
test('RCO origin cannot target an event with no canonical RCO linkage',async()=>{
 const f=fixture();
 f.event.rcoReportId='';
 await assert.rejects(f.bridge.resolve({numeroBO:BO,launch:f.launchRco}),
  /R260_BO_NOT_ATTACHED_TO_RCO/);
});
test('actual RSD/RCO and Index source route to same BO HTML family',()=>{
 const main=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
 const rsd=fs.readFileSync(path.join(ROOT,'service_flow.js'),'utf8');
 const rco=fs.readFileSync(path.join(ROOT,'relatorio_cpu.html'),'utf8');
 const normal='boletim_ocorrencia_bptrans_1cprv.html';
 const ios='boletim_ocorrencia_bptrans_1cprv_ios.html';
 for(const src of [main,rsd,rco]){
  assert(src.includes(normal));
  assert(src.includes(ios));
 }
 assert(rsd.includes("contextQuery({module:kind})"));
 assert(rco.includes("new URLSearchParams({from:'rco',returnTo:page,module:kind})"));
});
test('both BO renderers still use local-only protected annex, not cloud custody',()=>{
 const names=['boletim_ocorrencia_bptrans_1cprv.html',
  'boletim_ocorrencia_bptrans_1cprv_ios.html'];
 for(const name of names){
  const text=fs.readFileSync(path.join(ROOT,name),'utf8');
  assert(text.includes('id="boPhotoAnnexScript"'));
  assert(text.includes('central-bo-photo-annex-v1'));
  assert(text.includes('window.BoPhotoAnnex=Object.freeze'));
  assert(text.includes("const DB='central-bo-photo-annex-v1'"));
  assert(text.includes('N\u00e3o s\u00e3o anexadas \u00e0 nuvem')||
   text.includes('NÃ£o sÃ£o anexadas Ã  nuvem'));
 }
});
