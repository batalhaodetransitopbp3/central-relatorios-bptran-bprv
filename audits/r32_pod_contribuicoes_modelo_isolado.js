'use strict';
// R32 standalone collaboration contract. No Google, credentials or production changes.
// Prototype: one planned POD, independent signed-off team contributions.
const crypto=require('node:crypto');
function fingerprint(x){return crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex')}
function validateTeam(t){if(!/^(BST|BASE|TOR|GTTRAN|REBOQUE|EXTRA) (0[1-9]|10)$/.test(String(t)))throw Error('INVALID_TEAM');return t}
function ensure(v,message){if(!v)throw Error(message)}
function createStore(authorize){
 ensure(typeof authorize==='function','SERVER_AUTHORIZER_REQUIRED');
 const plans=new Map(),contribs=new Map();
 function plan(p){ensure(/^[a-zA-Z0-9_-]{8,100}$/.test(p.id||''),'INVALID_POD_ID');
   if(plans.has(p.id))throw Error('POD_ALREADY_PLANNED');
   ensure(p.unit&&p.date&&p.rcoReportId,'INCOMPLETE_ORIGIN');
   plans.set(p.id,Object.freeze({...p}));return p.id;
 }
 function contribute({planId,requestId,knownVersion,team,session,eventRecords=[],notes='',execution={}}){
   const p=plans.get(planId);ensure(p,'POD_NOT_FOUND');
   const t=validateTeam(team);
   // Security context MUST come from a server-owned session authorizer.
   // Never accept a client-supplied operatorId/company as proof of identity.
   const auth=authorize(session);
   ensure(auth&&auth.battalion===p.unit.battalion&&auth.company===p.unit.company,'UNIT_SCOPE_DENIED');
   ensure(auth.team===t&&/^[0-9]{4,12}$/.test(auth.operatorId||''),'CREW_AUTH_REQUIRED');
   ensure(/^[A-Za-z0-9_-]{12,90}$/.test(requestId||''),'INVALID_REQUEST_ID');
   ensure(Array.isArray(eventRecords)&&eventRecords.length<=250,'INVALID_EVENTS');
   const seen=new Set(),events=eventRecords.map(event=>{
     ensure(event&&/^[A-Za-z0-9:_-]{6,110}$/.test(event.eventId||''),'INVALID_EVENT_ID');
     ensure(!seen.has(event.eventId),'DUPLICATE_EVENT_IN_SUBMISSION');seen.add(event.eventId);
     ensure(['ait','abordagem','remocao','prisao'].includes(event.type),'INVALID_EVENT_TYPE');
     ensure(Number.isSafeInteger(event.quantity)&&event.quantity>=0&&event.quantity<=1000,'INVALID_QUANTITY');
     return {eventId:event.eventId,type:event.type,quantity:event.quantity};
   });
   const key=planId+'|'+t,old=contribs.get(key);
   const requestData={planId,team:t,events,notes,execution};
   const hash=fingerprint(requestData);
   if(old&&old.requestId===requestId){
     ensure(old.payloadHash===hash,'REQUEST_REUSED_DIFFERENT_CONTENT');
     return {version:old.version,idempotent:true};
   }
   ensure(Number.isSafeInteger(knownVersion)&&knownVersion===(old?.version||0),'CONTRIBUTION_VERSION_CONFLICT');
   // Validate cross-team identities BEFORE committing any new contribution.
   // Otherwise an invalid event can poison a previously valid POD projection.
   for(const current of contribs.values()){
     if(current.planId!==planId||current.team===t)continue;
     for(const e of events){const previous=current.events.find(x=>x.eventId===e.eventId);
       if(previous&&(previous.type!==e.type||previous.quantity!==e.quantity))
         throw Error('SHARED_EVENT_CONFLICT:'+e.eventId);
     }
   }
   const record={planId,team:t,requestId,payloadHash:hash,version:(old?.version||0)+1,
     author:auth.operatorId,events,notes,execution:structuredClone(execution)};
   contribs.set(key,record);
   return {version:record.version,idempotent:false};
 }
 function preview(planId){const p=plans.get(planId);ensure(p,'POD_NOT_FOUND');
   const records=[...contribs.values()].filter(v=>v.planId===planId).sort((a,b)=>a.team.localeCompare(b.team));
   const events=new Map();
   for(const r of records)for(const ev of r.events){
     const previous=events.get(ev.eventId);
     if(previous&&(previous.type!==ev.type||previous.quantity!==ev.quantity))
       throw Error('SHARED_EVENT_CONFLICT:'+ev.eventId);
     if(!previous)events.set(ev.eventId,ev);
   }
   const totals={ait:0,abordagem:0,remocao:0,prisao:0};
   for(const ev of events.values())totals[ev.type]+=ev.quantity;
   return {planId,sourceRco:p.rcoReportId,teams:records.map(x=>({team:x.team,version:x.version,author:x.author})),
     totals,distinctEvents:events.size,contributions:records.length,
     status:'READ_ONLY_DRAFT_NOT_P3'};
 }
 return {plan,contribute,preview};
}
module.exports={createStore};
