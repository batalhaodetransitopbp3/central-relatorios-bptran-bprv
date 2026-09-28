(function(global){
'use strict';
// Somente memória da página: nenhum resultado administrativo é salvo no aparelho.
const TTL=20000,MAX_ENTRIES=16,cache=new Map(),pending=new Map(),versions=new Map();
let generation=0;
function keyFor(action,params){
  const clean={};Object.keys(params||{}).sort().forEach(k=>{if(params[k]!==undefined&&params[k]!==null&&k!=='fresh')clean[k]=params[k]});
  return action+'|'+JSON.stringify(clean);
}
function clear(){generation++;cache.clear();pending.clear();versions.clear()}
function get(action,params={},options={}){
  const key=keyFor(action,params),fresh=options.fresh===true,flightKey=key+'|'+fresh;
  if(pending.has(flightKey))return pending.get(flightKey);
  if(!fresh&&pending.has(key+'|true'))return pending.get(key+'|true');
  const entry=cache.get(key);
  if(!fresh&&entry&&entry.expires>Date.now())return Promise.resolve({...entry.data,clientCacheHit:true});
  const version=(versions.get(key)||0)+1,epoch=generation;versions.set(key,version);
  const request=global.CentralCloud.jsonp(action,{...params,...(fresh?{fresh:'1'}:{})},{timeout:60000}).then(data=>{
    data={...data,clientReceivedAt:new Date().toISOString()};
    if(epoch===generation&&version===versions.get(key)){
      const age=Math.max(0,Number(data.cacheAgeMs)||0,Date.now()-Date.parse(data.dataGeneratedAt)||0);
      cache.delete(key);cache.set(key,{data,expires:Date.now()+Math.max(0,TTL-age)});
      while(cache.size>MAX_ENTRIES)cache.delete(cache.keys().next().value);
    }
    return data;
  }).catch(error=>{
    if(global.CentralCloud.isAuthError?.(error))clear();
    throw error;
  }).finally(()=>{if(pending.get(flightKey)===request)pending.delete(flightKey)});
  pending.set(flightKey,request);return request;
}
function describe(data){
  const when=new Date(data?.dataGeneratedAt||data?.clientReceivedAt||Date.now());
  const time=when.toLocaleTimeString('pt-BR');
  return (data?.dataGeneratedAt?'Dados consultados às ':'Consulta recebida às ')+time+(data?.clientCacheHit||data?.cacheHit?' • consulta recente reutilizada':'');
}
global.P3Queries={get,clear,describe};
})(window);
