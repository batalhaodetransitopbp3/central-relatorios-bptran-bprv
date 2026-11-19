'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {create}=require('../R252_BO_PERSONAL_IDENTITY_CANDIDATE_NO_DEPLOY/r252_bo_photo_archive_core');
const gate=require('../R252_BO_PERSONAL_IDENTITY_CANDIDATE_NO_DEPLOY/r252_personal_bo_gate');
const NOW='2026-11-19T18:35:00.000Z',END='2026-11-19T19:00:00.000Z';
const ID='service-123456789::BO::PM2026123456',BO='PM2026123456';
const IMAGE=Buffer.from([255,216,255,224,0,16,74,70,73,70,0,0,0,0,255,217]);
function make(){
 const state={
  id:{verification:'SERVER_VERIFIED',issuer:'https://trusted-idp.example',
    audience:'bo-photo-gateway-r252-test',email:'TEST@EXAMPLE.TEST',
    subject:'google-person-000001',emailVerified:true,
    issuedAt:'2026-11-19T18:30:00.000Z',expiresAt:END},
  roster:[{email:'test@example.test',idpSubject:'google-person-000001',
    matricula:'000.000-0',batalhao:'BPTran',companhia:'1 CPRv',
    status:'ATIVO',boPhotoWrite:true}],
  assignments:[{matricula:'000.000-0',eventId:ID,batalhao:'BPTran',
    companhia:'1 CPRv',status:'ATIVO',expiresAt:END}],
  event:{eventId:ID,tipo:'BO',status:'ATIVO',numeroDocumento:BO,
    serviceId:'service-123456789',rsdReportId:'rsd-123456789',
    batalhao:'BPTran',companhia:'1 CPRv',locked:false},
  requests:new Map(),photos:new Map(),files:new Map(),writes:0,
  beforeLock:false,clock:NOW
 };
 const clone=x=>structuredClone(x);
 const trusted={
  expectedIssuer:'https://trusted-idp.example',
  expectedAudience:'bo-photo-gateway-r252-test',
  now:()=>state.clock,
  getVerifiedIdentity:async()=>clone(state.id),
  lookupRosterByEmail:async()=>clone(state.roster),
  listAssignmentsByMatricula:async()=>clone(state.assignments),
  readCanonicalEvent:async()=>clone(state.event)
 };
 const personal=gate.create(trusted);
 const backend={
  now:()=>state.clock,
  decodeJpeg:b=>Buffer.from(b,'base64'),
  sha256:b=>crypto.createHash('sha256').update(b).digest('hex'),
  authenticate:personal.authenticate,
  getEvent:personal.getEvent,
  withExclusiveLock:async(_key,fn)=>{
    if(state.beforeLock){state.beforeLock=false;state.assignments[0].status='REVOGADO'}
    return fn();
  },
  getRequest:async id=>clone(state.requests.get(id)||null),
  getPhoto:async(ev,id)=>clone(state.photos.get(ev+':'+id)||null),
  listPhotos:async ev=>[...state.photos.values()].filter(x=>x.eventId===ev).map(clone),
  putRequest:async row=>{state.writes++;state.requests.set(row.requestId,clone(row))},
  putPhoto:async row=>{state.writes++;state.photos.set(row.eventId+':'+row.photoId,clone(row))},
  findFileByStableName:async n=>clone(state.files.get(n)||null),
  writePrivateFile:async file=>{
    state.writes++;
    const v={fileId:'FAKE-DRIVE-FILE',stableName:file.stableName,
      eventId:file.eventId,digest:file.digest};
    state.files.set(file.stableName,v);return clone(v);
  },
  deletePrivateFile:async()=>{state.writes++}
 };
 return {state,personal,service:create(backend)};
}
function body(){
 return {requestId:'post-'+crypto.randomUUID(),photoId:'photo-'+crypto.randomUUID(),
  eventId:ID,numeroBO:BO,serviceId:'service-123456789',position:1,caption:'SINTETICA',
  renderedDataUrl:'data:image/jpeg;base64,'+IMAGE.toString('base64')};
}
async function denied(app,mutate,rx){
 mutate(app.state);
 await assert.rejects(app.service.upload(body()),rx);
 assert.equal(app.state.writes,0,'unauthorized request must not write anything');
}
test('R252 is explicitly never release-allowed',()=>{
 assert.equal(gate.releaseAllowed,false);
 assert.equal(gate.create({
  expectedIssuer:'x',expectedAudience:'y',
  now:()=>NOW,getVerifiedIdentity:async()=>null,
  lookupRosterByEmail:async()=>[],listAssignmentsByMatricula:async()=>[],
  readCanonicalEvent:async()=>null
 }).releaseAllowed,false);
});
test('trusted verified identity + current assignment can write and list metadata',async()=>{
 const a=make(),b=body();
 const result=await a.service.upload(b);
 assert.equal(result.ok,true);
 assert.equal(a.state.files.size,1);
 const listed=await a.service.list({eventId:ID,serviceId:b.serviceId});
 assert.equal(listed.items.length,1);
 assert.equal(listed.items[0].fileAvailable,true);
 assert.equal(JSON.stringify(listed).includes('fileId'),false);
});
test('exact replay is idempotent and no duplicate file',async()=>{
 const a=make(),b=body();
 assert.equal((await a.service.upload(b)).duplicate,false);
 assert.equal((await a.service.upload(b)).duplicate,true);
 assert.equal(a.state.files.size,1);
});
test('request body identity spoofing cannot change server principal',async()=>{
 const a=make(),b={...body(),actor:{matricula:'999.999-9'},
  userEmail:'fake@attacker.test',roles:['ADMIN'],allowedEventIds:['fake-event']};
 await a.service.upload(b);
 const stored=[...a.state.requests.values()][0];
 assert.equal(stored.actorMatricula,'000.000-0');
});
test('a shared legacy token cannot authorize personal photos',async()=>{
 const a=make();
 await assert.rejects(a.service.upload(body(),'CENTRAL_TOKEN_SHARED'),/R252_CLIENT_CREDENTIAL_NOT_PERSONAL_IDENTITY/);
 assert.equal(a.state.writes,0);
});
test('missing verified server identity rejects before writing',async()=>{
 await denied(make(),s=>{s.id=null},/R252_VERIFIED_IDENTITY_REQUIRED/);
});
test('unverified email and forged provider are rejected',async()=>{
 for(const change of [{emailVerified:false},{issuer:'WRONG'},{verification:'CLIENT_ASSERTED'}]){
  await denied(make(),s=>Object.assign(s.id,change),/R252_VERIFIED_IDENTITY_REQUIRED/);
 }
});
test('expired and stale personal sessions are rejected',async()=>{
 await denied(make(),s=>{s.id.expiresAt='2026-11-19T18:34:59.000Z'},/R252_PERSONAL_SESSION_EXPIRED/);
 await denied(make(),s=>{s.id.issuedAt='2026-11-19T17:00:00.000Z'},/R252_PERSONAL_SESSION_EXPIRED/);
});
test('missing or duplicate personal roster row fails closed',async()=>{
 await denied(make(),s=>{s.roster=[]},/R252_ROSTER_NOT_UNIQUE/);
 await denied(make(),s=>{s.roster.push(structuredClone(s.roster[0]))},/R252_ROSTER_NOT_UNIQUE/);
});
test('roster subject, active status and authorization are enforced',async()=>{
 await denied(make(),s=>{s.roster[0].idpSubject='OTHER'},/R252_PERSONAL_ACTOR_NOT_APPROVED/);
 await denied(make(),s=>{s.roster[0].status='DESLIGADO'},/R252_PERSONAL_ACTOR_NOT_APPROVED/);
 await denied(make(),s=>{s.roster[0].boPhotoWrite=false},/R252_PERSONAL_ACTOR_NOT_APPROVED/);
});
test('unassigned, expired, wrong unit and wrong matricula fail closed',async()=>{
 await denied(make(),s=>{s.assignments=[]},/R252_EVENT_ASSIGNMENT_REVOKED/);
 await denied(make(),s=>{s.assignments[0].expiresAt=NOW},/R252_EVENT_ASSIGNMENT_REVOKED/);
 await denied(make(),s=>{s.assignments[0].companhia='2 CPRv'},/R252_EVENT_ASSIGNMENT_REVOKED/);
 await denied(make(),s=>{s.assignments[0].matricula='999.999-9'},/R252_EVENT_ASSIGNMENT_REVOKED/);
});
test('canonical event and registered unit must match server records',async()=>{
 await denied(make(),s=>{s.event=null},/R252_CANONICAL_EVENT_NOT_AUTHORIZED/);
 await denied(make(),s=>{s.event.companhia='2 CPRv'},/R252_CANONICAL_EVENT_NOT_AUTHORIZED/);
 await denied(make(),s=>{s.event.eventId='fake-event'},/R252_CANONICAL_EVENT_NOT_AUTHORIZED/);
});
test('authorization revoked while waiting for lock blocks all file writes',async()=>{
 const a=make();a.state.beforeLock=true;
 await assert.rejects(a.service.upload(body()),/R252_EVENT_ASSIGNMENT_REVOKED/);
 assert.equal(a.state.writes,0);
});
test('identity changes between authentication and locked event lookup fails closed',async()=>{
 const a=make();
 const original=a.personal.getEvent;
 const actor=await a.personal.authenticate();
 a.state.id.subject='google-person-NEW';
 await assert.rejects(original(ID,actor),/R252_PERSONAL_ACTOR_NOT_APPROVED|R252_PERSONAL_SESSION_CHANGED/);
});
test('event that is closed or locked is rejected by underlying R239',async()=>{
 await denied(make(),s=>{s.event.status='FINALIZADO'},/R239_BO_NOT_OPEN_FOR_ATTACHMENT/);
 await denied(make(),s=>{s.event.locked=true},/R239_BO_DOCUMENT_LOCKED/);
});

test('cross-user reuse of an existing requestId is refused even if both assigned',async()=>{
 const a=make(),b=body();
 await a.service.upload(b);
 const before=a.state.writes;
 a.state.id.subject='google-person-000002';
 a.state.roster[0].idpSubject='google-person-000002';
 a.state.roster[0].matricula='111.111-1';
 a.state.assignments[0].matricula='111.111-1';
 await assert.rejects(a.service.upload(b),/R239_REQUEST_OWNER_MISMATCH/);
 assert.equal(a.state.writes,before);
 assert.equal(a.state.files.size,1);
});
test('same requestId with changed caption is rejected rather than silently acknowledged',async()=>{
 const a=make(),b=body();await a.service.upload(b);
 const before=a.state.writes;
 await assert.rejects(a.service.upload({...b,caption:'ALTERADA'}),
   /R239_REQUEST_ID_COLLISION_DIFFERENT_CONTENT/);
 assert.equal(a.state.writes,before);
});
test('committed ledger with manipulated author is rejected on idempotent replay',async()=>{
 const a=make(),b=body();await a.service.upload(b);
 const record=a.state.photos.get(b.eventId+':'+b.photoId);
 record.createdBy='999.999-9';
 const before=a.state.writes;
 await assert.rejects(a.service.upload(b),/R239_COMMIT_LEDGER_INCONSISTENT/);
 assert.equal(a.state.writes,before);
});
