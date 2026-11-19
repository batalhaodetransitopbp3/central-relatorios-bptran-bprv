'use strict';
/* R252 hardened copy of R239 BO photo archive engine. No GAS API or deployment.
 * Adapter MUST authenticate a user independently of input body.
 * A shared central token is insufficient to enable production.
 */
(function(root,factory){
  var value=factory();
  if(typeof module==='object'&&module.exports)module.exports=value;
  else root.R239BoPhotoArchive=value;
})(typeof window!=='undefined'?window:this,function(){
 const MAX_PHOTOS=96,MAX_BYTES=2*1024*1024;
 const RX_ID=/^post-[a-z0-9-]{12,110}$/i;
 const RX_PHOTO=/^[a-z0-9-]{6,100}$/i;
 const RX_EVENT=/^[a-z0-9_:.-]{10,200}$/i;
 const RX_BO=/^PM20\d{8}$/;
 const error=(code)=>{const e=new Error('R239_'+code);e.code=code;throw e;};
 const assert=(ok,msg)=>{if(!ok)error(msg);};
 const validString=(x,max)=>typeof x==='string'&&x.length>0&&x.length<=max;
 function validateActor(actor){
   assert(actor&&actor.authenticated===true&&
     validString(actor.matricula,25)&&validString(actor.batalhao,20)&&
     validString(actor.companhia,40)&&
     (actor.roles||[]).includes('BO_PHOTO_WRITE'),'UNAUTHENTICATED_PERSONAL_PRINCIPAL');
   assert(actor.source==='TRUSTED_SERVER_SESSION'&&
     actor.sessionValid===true,'PERSONAL_SESSION_NOT_VERIFIED');
 }
 function validateBoundEvent(event,actor,input){
   assert(event&&event.tipo==='BO'&&event.status!=='CANCELADO','BO_CANONICAL_EVENT_NOT_FOUND');
   assert(validString(event.eventId,200)&&
     event.eventId===input.eventId,'BO_EVENT_ID_MISMATCH');
   assert(event.numeroDocumento===input.numeroBO&&RX_BO.test(event.numeroDocumento),
     'BO_NUMBER_MISMATCH');
   const service=event.serviceId||event.rsdReportId||event.rcoReportId;
   assert(validString(service,150),'BO_MISSING_SERVICE_LINK');
   const linked=(validString(input.serviceId,150)&&event.serviceId===input.serviceId)||
     (validString(input.rsdReportId,150)&&event.rsdReportId===input.rsdReportId)||
     (validString(input.rcoReportId,150)&&event.rcoReportId===input.rcoReportId);
   assert(linked,'BO_SERVICE_CONTEXT_MISMATCH');
   assert(actor.batalhao===event.batalhao&&actor.companhia===event.companhia,
     'BO_OUTSIDE_PRINCIPAL_UNIT');
   assert((actor.allowedServiceIds||[]).includes(service)||
     (actor.allowedEventIds||[]).includes(event.eventId),
     'BO_OUTSIDE_PERSONAL_ASSIGNMENT');
   assert(event.status==='ATIVO','BO_NOT_OPEN_FOR_ATTACHMENT');
   assert(!event.locked,'BO_DOCUMENT_LOCKED');
 }
 function validatePhoto(input){
   assert(input&&typeof input==='object'&&!Array.isArray(input),'PAYLOAD_INVALID');
   assert(RX_ID.test(input.requestId||''),'REQUEST_ID_INVALID');
   assert(RX_PHOTO.test(input.photoId||''),'PHOTO_ID_INVALID');
   assert(RX_EVENT.test(input.eventId||''),'EVENT_ID_INVALID');
   assert(RX_BO.test(input.numeroBO||''),'BO_NUMBER_INVALID');
   assert(Number.isInteger(input.position)&&input.position>=1&&input.position<=MAX_PHOTOS,
     'PHOTO_SEQUENCE_INVALID');
   assert(typeof input.renderedDataUrl==='string'&&
     /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(input.renderedDataUrl),
     'ONLY_JPEG_DATA_URL_ALLOWED');
   const base64=input.renderedDataUrl.slice('data:image/jpeg;base64,'.length);
   assert(base64.length<MAX_BYTES*4/3+10,'PHOTO_BASE64_TOO_LARGE');
   assert(validString(input.caption||' ',220)&&
     !/[<>]/.test(input.caption||''),'CAPTION_INVALID');
   return base64;
 }
 function compareRequest(existing,input,digest,actor){
   assert(existing.actorMatricula===actor.matricula,'REQUEST_OWNER_MISMATCH');
   assert(existing.eventId===input.eventId&&existing.photoId===input.photoId&&
     existing.position===input.position&&existing.digest===digest&&
     existing.caption===String(input.caption||''),
     'REQUEST_ID_COLLISION_DIFFERENT_CONTENT');
 }
 function create(adapter){
   const a=adapter||{};
   for(const name of ['now','decodeJpeg','sha256','authenticate','getEvent',
     'withExclusiveLock','getRequest','getPhoto','listPhotos','putRequest',
     'putPhoto','findFileByStableName','writePrivateFile','deletePrivateFile']){
     assert(typeof a[name]==='function','MISSING_ADAPTER_'+name);
   }
   async function upload(body,credential){
     const base64=validatePhoto(body);
     const bytes=a.decodeJpeg(base64);
     assert(bytes&&bytes.length>10&&bytes.length<=MAX_BYTES,'PHOTO_BINARY_SIZE_INVALID');
     assert(bytes[0]===0xff&&bytes[1]===0xd8&&
       bytes[bytes.length-2]===0xff&&bytes[bytes.length-1]===0xd9,
       'JPEG_SIGNATURE_INVALID');
     const digest=a.sha256(bytes);
     assert(/^[a-f0-9]{64}$/.test(digest),'DIGEST_INVALID');
     // Authorization MUST resolve server-side; never trust caller-supplied actor.
     const actor=await a.authenticate(credential);
     validateActor(actor);
     const parent=await a.getEvent(body.eventId,actor);
     validateBoundEvent(parent,actor,body);
     const stableName='BO_'+body.eventId.replace(/[^a-z0-9_-]/gi,'_')+
       '_'+body.photoId+'_'+body.requestId+'.jpg';
     return a.withExclusiveLock('r239:'+body.eventId,async()=>{
       // Recheck parent inside the lock before any sensitive write.
       validateBoundEvent(await a.getEvent(body.eventId,actor),actor,body);
       let request=await a.getRequest(body.requestId);
       if(request){
         compareRequest(request,body,digest,actor);
         if(request.status==='COMMITTED'){
           const image=await a.getPhoto(body.eventId,body.photoId);
           assert(image&&image.requestId===body.requestId&&image.digest===digest&&
             image.createdBy===actor.matricula&&image.position===body.position,
             'COMMIT_LEDGER_INCONSISTENT');
           return {ok:true,duplicate:true,requestId:body.requestId,
             photoId:body.photoId,position:body.position,
             page:Math.ceil(body.position/4),digest};
         }
         assert(request.status==='PENDING'||request.status==='FILE_STORED',
           'INVALID_REQUEST_STATE');
       } else {
         const photos=await a.listPhotos(body.eventId);
         const same=photos.find(p=>p.photoId===body.photoId);
         assert(!same,'PHOTO_ID_ALREADY_USED_BY_ANOTHER_REQUEST');
         assert(photos.length<MAX_PHOTOS,'BO_PHOTO_CAPACITY');
         assert(!photos.some(p=>p.position===body.position),
           'BO_PHOTO_POSITION_COLLISION');
         request={requestId:body.requestId,eventId:body.eventId,
           photoId:body.photoId,position:body.position,digest,
           caption:String(body.caption||''),status:'PENDING',stableName,actorMatricula:actor.matricula,
           createdAt:a.now()};
         await a.putRequest(request);
       }
       // Retry after process interruption: deterministic private lookup avoids
       // recreating files when Drive succeeded but the ledger update failed.
       let file=await a.findFileByStableName(stableName);
       if(file){
         assert(file.digest===digest&&file.eventId===body.eventId,
           'PRIVATE_FILE_COLLISION');
       } else {
         file=await a.writePrivateFile({
           stableName,bytes,mime:'image/jpeg',eventId:body.eventId,
           digest,ownerMatricula:actor.matricula
         });
       }
       assert(file&&validString(file.fileId,150)&&file.digest===digest,
         'PRIVATE_FILE_WRITE_UNVERIFIED');
       await a.putRequest({...request,status:'FILE_STORED',fileId:file.fileId});
       const photo={eventId:body.eventId,photoId:body.photoId,position:body.position,
         caption:String(body.caption||''),requestId:body.requestId,
         fileId:file.fileId,digest,mime:'image/jpeg',bytes:bytes.length,
         createdAt:a.now(),createdBy:actor.matricula};
       await a.putPhoto(photo);
       await a.putRequest({...request,status:'COMMITTED',fileId:file.fileId,
         completedAt:a.now()});
       return {ok:true,duplicate:false,requestId:body.requestId,
         photoId:body.photoId,position:body.position,
         page:Math.ceil(body.position/4),digest};
     });
   }
   async function list(body,credential){
     assert(body&&RX_EVENT.test(body.eventId||''),'EVENT_ID_INVALID');
     const actor=await a.authenticate(credential);
     validateActor(actor);
     const event=await a.getEvent(body.eventId,actor);
     validateBoundEvent(event,actor,{...body,numeroBO:event&&event.numeroDocumento});
     const photos=await a.listPhotos(body.eventId);
     return {ok:true,eventId:body.eventId,items:photos.map(p=>({
       photoId:p.photoId,position:p.position,page:Math.ceil(p.position/4),
       caption:p.caption||'',digest:p.digest,bytes:p.bytes,createdAt:p.createdAt,
       // No Drive URL or base64 content in a general list.
       fileAvailable:!!p.fileId
     })).sort((x,y)=>x.position-y.position)};
   }
   return Object.freeze({upload,list,releaseAllowed:false});
 }
 return Object.freeze({create,MAX_PHOTOS,MAX_BYTES,releaseAllowed:false});
});
