'use strict';
/*
 * R254 optional HTTP adapter (no listener, no network calls of its own).
 * Same-origin JSON POST only, with strict cookies and generic errors.
 * Synthetic local-test utility, NOT a production-ready service.
 */
function makeHandler(sessionGate){
 if(!sessionGate||typeof sessionGate.beginLogin!=='function')
   throw Error('R254_HANDLER_GATE_REQUIRED');
 function fail(code){const e=new Error('R254_HTTP_'+code);e.code=code;throw e}
 function cookies(header){
   const result=Object.create(null);
   if(typeof header!=='string'||header.length>8192)fail('COOKIE_HEADER_INVALID');
   for(const part of header.split(';')){
     const piece=part.trim();
     if(!piece)continue;
     const ix=piece.indexOf('=');
     if(ix<1)fail('COOKIE_HEADER_INVALID');
     const name=piece.slice(0,ix);
     if(!/^[A-Za-z0-9_-]+$/.test(name)||Object.hasOwn(result,name))
       fail('COOKIE_HEADER_DUPLICATE_OR_INVALID');
     result[name]=piece.slice(ix+1);
   }
   return result;
 }
 async function jsonBody(req){
   const type=String(req.headers['content-type']||'').toLowerCase();
   if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/.test(type))
     fail('JSON_CONTENT_TYPE_REQUIRED');
   const length=Number(req.headers['content-length']||0);
   if(!Number.isFinite(length)||length>3000000)fail('REQUEST_BODY_TOO_LARGE');
   let size=0;const chunks=[];
   for await (const chunk of req){
     size+=chunk.length;
     if(size>3000000)fail('REQUEST_BODY_TOO_LARGE');
     chunks.push(chunk);
   }
   let obj;
   try{obj=JSON.parse(Buffer.concat(chunks).toString('utf8'))}
   catch(_){fail('BAD_JSON_BODY')}
   if(!obj||typeof obj!=='object'||Array.isArray(obj))fail('BAD_JSON_BODY');
   return obj;
 }
 return async function handler(req,res){
   res.setHeader('Cache-Control','no-store, max-age=0');
   res.setHeader('Pragma','no-cache');
   res.setHeader('Content-Security-Policy',"default-src 'none'");
   res.setHeader('X-Content-Type-Options','nosniff');
   res.setHeader('Referrer-Policy','no-referrer');
   res.setHeader('Content-Type','application/json; charset=utf-8');
   try{
     if(req.method!=='POST'||typeof req.url!=='string'||req.url.includes('?'))
       fail('INVALID_ROUTE_OR_METHOD');
     const routes={
       '/bo-api/login/start':'start',
       '/bo-api/login/complete':'complete',
       '/bo-api/photos/upload':'upload',
       '/bo-api/photos/list':'list',
       '/bo-api/logout':'logout'
     };
     const route=routes[req.url];
     if(!route)fail('INVALID_ROUTE_OR_METHOD');
     const body=await jsonBody(req);
     const ctx={
       method:req.method,origin:req.headers.origin,
       cookies:cookies(req.headers.cookie||''),
       csrf:req.headers['x-bo-csrf'],body
     };
     let out;
     if(route==='start')out=sessionGate.beginLogin(ctx);
     else if(route==='complete')out=await sessionGate.finishLogin({
       ...ctx,idToken:body.idToken
     });
     else if(route==='logout')out=sessionGate.logout(ctx);
     else out=await sessionGate.operate({...ctx,operation:route});
     const payload={...out};
     delete payload.setCookies;
     if(Array.isArray(out.setCookies))
       res.setHeader('Set-Cookie',out.setCookies);
     res.statusCode=200;
     res.end(JSON.stringify(payload));
   }catch(error){
     const code=String(error&&error.code||'');
     res.statusCode=code==='REQUEST_BODY_TOO_LARGE'?413:
       (code==='BAD_JSON_BODY'||code==='JSON_CONTENT_TYPE_REQUIRED'||
       code.startsWith('COOKIE_HEADER_')?400:403);
     // Deliberately do not return internal ids, subjects, tokens or backend
     // error messages to an unauthenticated client.
     res.end(JSON.stringify({ok:false,message:'Request rejected'}));
   }
 };
}
module.exports=Object.freeze({makeHandler,releaseAllowed:false});
