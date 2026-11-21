'use strict';
/* R260 review-only, server-side canonical BO resolver for Index/RSD/RCO.
 * R240 UI still uses encrypted local IndexedDB and is NOT connected to cloud.
 * Requires an independently trusted R252 personal authority, canonical BO
 * lookup and R239/252 archive. No network listener, login or production write.
 */
(function(root,factory){
 const v=factory();
 if(typeof module==='object'&&module.exports)module.exports=v;
 else root.R260CanonicalBoBridge=v;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const BO=/^PM20\d{8}$/;
 const EVENT=/^[a-z0-9_:.-]{10,200}$/i;
 const LINK=/^[a-z0-9_.:-]{3,160}$/i;
 const PHOTO_KEYS=['requestId','photoId','position','caption','renderedDataUrl'];
 function deny(code){const e=new Error('R260_'+code);e.code=code;throw e}
 function guard(ok,code){if(!ok)deny(code)}
 const text=x=>typeof x==='string'?x.trim():'';
 function link(x){
  const s=text(x);
  guard(!s||LINK.test(s),'MALFORMED_LAUNCH_OR_EVENT_LINK');
  return s;
 }
 function parseLaunch(value){
  guard(value&&typeof value==='object'&&!Array.isArray(value),
    'LAUNCH_CONTEXT_REQUIRED');
  const from=text(value.from).toLowerCase()||'index';
  guard(['index','rsd','rco'].includes(from),'UNKNOWN_BO_ENTRYPOINT');
  if(value.module!==undefined&&value.module!==null&&value.module!=='')
   guard(value.module==='bo','WRONG_LAUNCH_MODULE');
  const serviceId=link(value.serviceId),
   rsdReportId=link(value.rsdReportId),
   rcoReportId=link(value.rcoReportId);
  const editId=text(value.editId);
  guard(editId.length<=200&&!/[<>]/.test(editId),'INVALID_EDIT_REFERENCE');
  if(from==='rsd')guard(!!serviceId&&!!rsdReportId&&!rcoReportId,
    'RSD_REQUIRED_LINKS_MISSING');
  if(from==='index')guard(!serviceId&&!rsdReportId&&!rcoReportId,
    'INDEX_MUST_NOT_CLAIM_SERVICE');
  if(from==='rco')guard(!rsdReportId||!!serviceId,
    'RCO_INCOMPLETE_RSD_LINK');
  // The real RCO BO URL carries from=rco + optional editId; its service
  // context is in browser storage, which the server MUST NOT trust.
  return Object.freeze({from,serviceId,rsdReportId,rcoReportId,editId});
 }
 function create({authority,findCanonicalEventsByBoNumber,archive}={}){
  guard(authority&&typeof authority.authenticate==='function'&&
   typeof authority.getEvent==='function'&&
   typeof findCanonicalEventsByBoNumber==='function'&&archive&&
   typeof archive.upload==='function'&&typeof archive.list==='function'&&
   archive.releaseAllowed===false,'TRUSTED_COMPONENTS_REQUIRED');
  async function resolve({numeroBO,launch,credential}={}){
   guard(typeof numeroBO==='string'&&BO.test(numeroBO),
    'CANONICAL_BO_NUMBER_REQUIRED');
   const route=parseLaunch(launch||{from:'index'});
   if(BO.test(route.editId))
    guard(route.editId===numeroBO,'EDIT_REFERENCE_BO_MISMATCH');
   const actor=await authority.authenticate(credential);
   guard(actor&&actor.authenticated===true&&
    actor.source==='TRUSTED_SERVER_SESSION'&&actor.sessionValid===true,
    'PERSONAL_SESSION_REQUIRED');
   const matches=await findCanonicalEventsByBoNumber(numeroBO,actor);
   guard(Array.isArray(matches)&&matches.length===1,
    'CANONICAL_BO_NOT_UNIQUE_OR_ABSENT');
   const candidate=matches[0];
   guard(candidate&&EVENT.test(candidate.eventId||''),
    'CANONICAL_EVENT_ID_INVALID');
   const event=await authority.getEvent(candidate.eventId,actor);
   guard(event&&event.eventId===candidate.eventId&&
    event.numeroDocumento===numeroBO&&event.tipo==='BO'&&
    event.status==='ATIVO'&&!event.locked,
    'CANONICAL_BO_NOT_ACTIVE_OR_MISMATCH');
   guard(event.batalhao===actor.batalhao&&
    event.companhia===actor.companhia,'BO_OUTSIDE_PERSONAL_UNIT');
   const refs={
    serviceId:link(event.serviceId),
    rsdReportId:link(event.rsdReportId),
    rcoReportId:link(event.rcoReportId)
   };
   guard(refs.serviceId||refs.rsdReportId||refs.rcoReportId,
    'CANONICAL_SERVICE_LINK_MISSING');
   if(route.serviceId)
    guard(route.serviceId===refs.serviceId,'LAUNCH_SERVICE_ID_MISMATCH');
   if(route.rsdReportId)
    guard(route.rsdReportId===refs.rsdReportId,'LAUNCH_RSD_ID_MISMATCH');
   if(route.rcoReportId)
    guard(route.rcoReportId===refs.rcoReportId,'LAUNCH_RCO_ID_MISMATCH');
   if(route.from==='rsd')
    guard(refs.serviceId&&refs.rsdReportId,'BO_NOT_ATTACHED_TO_THIS_RSD');
   if(route.from==='rco')
    guard(refs.rcoReportId,'BO_NOT_ATTACHED_TO_RCO');
   return Object.freeze({eventId:event.eventId,numeroBO,
    ...refs,from:route.from});
  }
  function photoFields(p){
   guard(p&&typeof p==='object'&&!Array.isArray(p),
    'PHOTO_PAYLOAD_REQUIRED');
   guard(Object.keys(p).every(k=>PHOTO_KEYS.includes(k)),
    'CLIENT_CANNOT_CHOOSE_EVENT_OR_ACTOR');
   guard(['requestId','photoId','position','renderedDataUrl']
    .every(k=>Object.hasOwn(p,k)),'PHOTO_FIELDS_MISSING');
   return Object.fromEntries(PHOTO_KEYS.filter(k=>Object.hasOwn(p,k))
    .map(k=>[k,p[k]]));
  }
  async function upload({numeroBO,launch,photo,credential}={}){
   const p=photoFields(photo);
   const canonical=await resolve({numeroBO,launch,credential});
   // R239 rechecks R252 authorizations INSIDE its server-side exclusive lock.
   return archive.upload({...p,eventId:canonical.eventId,
    numeroBO:canonical.numeroBO,serviceId:canonical.serviceId,
    rsdReportId:canonical.rsdReportId,
    rcoReportId:canonical.rcoReportId},credential);
  }
  async function list({numeroBO,launch,credential}={}){
   const canonical=await resolve({numeroBO,launch,credential});
   return archive.list({eventId:canonical.eventId,
    numeroBO:canonical.numeroBO,serviceId:canonical.serviceId,
    rsdReportId:canonical.rsdReportId,
    rcoReportId:canonical.rcoReportId},credential);
  }
  return Object.freeze({resolve,upload,list,releaseAllowed:false,
   connectedToLiveBoPage:false});
 }
 return Object.freeze({create,releaseAllowed:false,
  connectedToLiveBoPage:false});
});
