'use strict';
const assert=require('node:assert/strict');
const {createStore}=require('../audits/r32_pod_contribuicoes_modelo_isolado');
assert.throws(()=>createStore(),/SERVER_AUTHORIZER_REQUIRED/);
const sessions=new Map([
 ['session-bst',{battalion:'BPRv',company:'1ª CPRv',team:'BST 01',operatorId:'123456'}],
 ['session-tor',{battalion:'BPRv',company:'1ª CPRv',team:'TOR 02',operatorId:'234567'}],
 ['session-other-company',{battalion:'BPRv',company:'2ª CPRv',team:'BST 01',operatorId:'345678'}]
]);
const db=createStore(id=>sessions.get(id)||null);
const p={id:'pod-17out26-test',rcoReportId:'rco-test-17out',
 unit:{battalion:'BPRv',company:'1ª CPRv'},date:'2026-10-17'};
db.plan(p);
const team=(t,sess)=>({planId:p.id,team:t,session:sess,knownVersion:0,
 requestId:'attempt-'+t.replace(/ /g,'')+'-20261017'});
const bst={...team('BST 01','session-bst'),eventRecords:[
 {eventId:'AIT-TEST-0001',type:'ait',quantity:1},
 {eventId:'ABO-TEST-0001',type:'abordagem',quantity:3}]};
const tor={...team('TOR 02','session-tor'),eventRecords:[
 {eventId:'AIT-TEST-0001',type:'ait',quantity:1},
 {eventId:'AIT-TEST-0002',type:'ait',quantity:1},
 {eventId:'ABO-TEST-0002',type:'abordagem',quantity:5}]};
assert.deepEqual(db.contribute(bst),{version:1,idempotent:false});
assert.deepEqual(db.contribute(tor),{version:1,idempotent:false});
let view=db.preview(p.id);
assert.equal(view.contributions,2);assert.equal(view.distinctEvents,4);
assert.deepEqual(view.totals,{ait:2,abordagem:8,remocao:0,prisao:0});
assert.equal(view.status,'READ_ONLY_DRAFT_NOT_P3');
assert.deepEqual(db.contribute(bst),{version:1,idempotent:true},'retry does not duplicate');
assert.deepEqual(db.preview(p.id).totals,view.totals,'retry does not increase stats');
assert.throws(()=>db.contribute({...bst,eventRecords:[{eventId:'NEW-EVENT-0001',type:'ait',quantity:5}]}),
 /REQUEST_REUSED_DIFFERENT_CONTENT/,'same request ID different payload denied');
assert.throws(()=>db.contribute({...bst,requestId:'another-attempt-111111',eventRecords:[],knownVersion:0}),
 /CONTRIBUTION_VERSION_CONFLICT/,'stale crew data denied');
assert.throws(()=>db.contribute({...bst,requestId:'another-attempt-222222',
 team:'BASE 01'}),/CREW_AUTH_REQUIRED/,'cannot impersonate another crew');
assert.throws(()=>db.contribute({...bst,requestId:'another-attempt-333333',
 session:'session-other-company'}),/UNIT_SCOPE_DENIED/);
assert.throws(()=>db.contribute({...bst,requestId:'another-attempt-444444',
 session:'forged-session',operatorId:'123456',company:'1ª CPRv'}),/UNIT_SCOPE_DENIED/);
assert.throws(()=>db.contribute({...bst,eventRecords:[
 {eventId:'AIT-TEST-0001',type:'ait',quantity:1},{eventId:'AIT-TEST-0001',type:'ait',quantity:1}]}),
 /DUPLICATE_EVENT_IN_SUBMISSION/);
const newer={...bst,requestId:'attempt-BST01-rev2-20261017',knownVersion:1,
 eventRecords:[...bst.eventRecords,{eventId:'REM-TEST-0001',type:'remocao',quantity:1}]};
assert.deepEqual(db.contribute(newer),{version:2,idempotent:false});
view=db.preview(p.id);
assert.equal(view.contributions,2,'revision does not create third contribution');
assert.deepEqual(view.totals,{ait:2,abordagem:8,remocao:1,prisao:0});
const dispute={...tor,requestId:'attempt-TOR02-rev2-20261017',knownVersion:1,
 eventRecords:[{eventId:'AIT-TEST-0001',type:'ait',quantity:2}]};
assert.throws(()=>db.contribute(dispute),/SHARED_EVENT_CONFLICT/,
 'conflicting shared event must be rejected BEFORE writing the second crew contribution');
assert.deepEqual(db.preview(p.id).totals,{ait:2,abordagem:8,remocao:1,prisao:0},
 'invalid event cannot poison an already valid consolidated POD');
assert.deepEqual(db.contribute({...tor,requestId:'attempt-TOR02-rev2-20261017',
 knownVersion:1}),{version:2,idempotent:false});
assert.deepEqual(db.preview(p.id).totals,{ait:2,abordagem:8,remocao:1,prisao:0});
console.log('PASS R32: 2 crew contributions, stable origin, dedupe by event ID, revisions, scope and author guards, replay and conflict');
