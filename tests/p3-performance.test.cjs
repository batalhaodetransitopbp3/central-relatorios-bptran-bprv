const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),zlib=require('node:zlib');
const {execFileSync}=require('node:child_process');
const source=fs.readFileSync('apps_script_v10.gs','utf8');
const baseline=execFileSync('git',['show','4155b1b6a31138f24e7b9e05382d6a614e0cf27b:apps_script_v10.gs'],{encoding:'utf8'});
const plain=x=>JSON.parse(JSON.stringify(x));
function environment(code=source){
  const metrics={reads:0,cells:0,payloads:0,opens:0,formats:0},sheets={},values=new Map(),properties=new Map([['P3_TOKEN','test-p3']]);
  let clock=Date.now();
  class Clock extends Date {constructor(...args){super(...(args.length?args:[clock]))}static now(){return clock}}
  const blob=v=>({getBytes:()=>Buffer.from(v),getDataAsString:()=>Buffer.from(v).toString()});
  const cache={get:k=>{const v=values.get(k);return v&&v.until>clock?v.value:null},put:(k,value,ttl)=>{assert.ok(Buffer.byteLength(value)<100000);values.set(k,{value,until:clock+ttl*1000})},remove:k=>values.delete(k)};
  const context=vm.createContext({Date:Clock,console,
    SpreadsheetApp:{openById:()=>{metrics.opens++;return {getSheetByName:n=>sheets[n]||null}},flush(){}},
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>properties.get(k)||null,setProperty:(k,v)=>properties.set(k,v)})},
    CacheService:{getScriptCache:()=>cache},Session:{getScriptTimeZone:()=> 'America/Fortaleza'},
    Utilities:{DigestAlgorithm:{MD5:'md5',SHA_256:'sha256'},Charset:{UTF_8:'utf8'},getUuid:()=>crypto.randomUUID(),
      computeDigest:(alg,v)=>crypto.createHash(alg).update(v).digest(),base64EncodeWebSafe:v=>Buffer.from(v).toString('base64url'),
      base64Encode:v=>Buffer.from(v).toString('base64'),base64Decode:v=>Buffer.from(v,'base64'),newBlob:blob,
      gzip:b=>blob(zlib.gzipSync(b.getBytes())),ungzip:b=>blob(zlib.gunzipSync(b.getBytes())),
      formatDate:d=>{metrics.formats++;return new Date(d.getTime()-3*3600000).toISOString().slice(0,10)}}
  });
  vm.runInContext(code,context);context.jsonp_=out=>plain(out);context.postMessagePage_=(_,out)=>plain(out);
  function add(name,headers,rows){
    const grid=[headers,...rows.map(row=>Array.isArray(row)?row:headers.map(k=>row[k]??''))];
    return sheets[name]={grid,getName:()=>name,getLastRow:()=>grid.length,getLastColumn:()=>headers.length,
      deleteRow:r=>grid.splice(r-1,1),getRange:(r,c,n=1,w=1)=>({
        getValues:()=>{metrics.reads++;metrics.cells+=n*w;const result=grid.slice(r-1,r-1+n).map(row=>row.slice(c-1,c-1+w));if(r>1)for(let col=c-1;col<c-1+w;col++)if(/JSON|PAYLOAD|ASSINATURA/.test(headers[col]))metrics.payloads+=n;return result},
        getDisplayValues:()=>grid.slice(r-1,r-1+n).map(row=>row.slice(c-1,c-1+w).map(String)),
        setValues:rows=>rows.forEach((row,i)=>{grid[r-1+i]??=[];row.forEach((v,j)=>grid[r-1+i][c-1+j]=v)})})};
  }
  return {c:context,metrics,add,cache,values,properties,advance:ms=>clock+=ms,reset:()=>Object.keys(metrics).forEach(k=>metrics[k]=0)};
}
const reportHeaders=['REPORT_ID','DATA_SERVICO','BATALHAO','COMPANHIA','GUARNICAO','TURNO','STATUS','RESPONSAVEL_NOME','VERSAO','PAYLOAD_JSON','RCO_REPORT_ID'];
function reportRows(n){return Array.from({length:n},(_,i)=>({REPORT_ID:'r'+i,DATA_SERVICO:new Date('2026-09-'+String(i%3+26).padStart(2,'0')+'T03:00:00Z'),BATALHAO:i%2?'BPRv':'BPTran',COMPANHIA:(i%3+1)+'ª '+(i%2?'CPRv':'CPTran'),GUARNICAO:'BST '+(i%4+1),TURNO:i%2?'noite':'dia',STATUS:'EM_SERVICO',RESPONSAVEL_NOME:'Teste '+i,VERSAO:1,PAYLOAD_JSON:'x'.repeat(10000),RCO_REPORT_ID:'c'+i}));}
function comparable(out){out=plain(out);delete out.queryMs;return out}
test('projeção preserva filtros, ordem e limite, sem ler payloads',()=>{
  for(const n of [60,8000])for(const filters of [{},{dataInicio:'2026-09-27',dataFim:'2026-09-28'},{batalhao:'BPRv',companhias:'1ª CPRv|2ª CPRv'},{turno:'dia',guarnicao:'BST 1'},{inicio:'2026-09-26',fim:'2026-09-26',companhia:'1ª CPTran'}]){
    const old=environment(baseline),now=environment();for(const e of [old,now]){e.add('RSD',reportHeaders,reportRows(n));e.add('RCO',reportHeaders,reportRows(30))}
    const before=old.c.p3Query_(filters),after=now.c.p3Query_(filters);
    assert.deepEqual(comparable(after),comparable(before));assert.equal(now.metrics.payloads,0);
  }
});
test('menos leituras de planilha na situação diária, mantendo os dados',t=>{
  const old=environment(baseline),now=environment();for(const e of [old,now]){e.add('RSD',reportHeaders,reportRows(1000));e.add('RCO',reportHeaders,reportRows(300))}
  assert.deepEqual(comparable(now.c.p3Query_({})),comparable(old.c.p3Query_({})));
  assert.ok(now.metrics.reads<old.metrics.reads);assert.ok(now.metrics.formats<old.metrics.formats);
  t.diagnostic(JSON.stringify({before:old.metrics,after:now.metrics}));
});
test('linhas dispersas são agrupadas sem acrescentar registros ao resultado',()=>{
  const e=environment(),s=e.add('RSD',reportHeaders,reportRows(4000)),rows=Array.from({length:200},(_,i)=>i*10+2);
  const out=e.c.p3ObjectsForRowsFields_(s,reportHeaders,rows,0,['REPORT_ID','VERSAO','RCO_REPORT_ID']);
  const old=environment(baseline),os=old.add('RSD',reportHeaders,reportRows(4000));
  const before=old.c.p3ObjectsForRowsFields_(os,reportHeaders,rows,0,['REPORT_ID','VERSAO','RCO_REPORT_ID']);
  assert.deepEqual(plain(out),plain(before));assert.deepEqual(plain(out.map(x=>x._row)),rows);assert.equal(e.metrics.payloads,0);assert.ok(e.metrics.reads<old.metrics.reads);
});
const prodHeaders=['DATA_SERVICO','BATALHAO','COMPANHIA','GUARNICAO','GRUPO_CODIGO','GRUPO_NOME','INDICADOR_CODIGO','INDICADOR_NOME','QUANTIDADE','ORIGEM_RELATORIO'];
function prodRows(){return [
 ['2026-09-27','BPTran','1ª CPTran','BST 1','abordagens','Abordagens','pessoas','Pessoas',100,'HISTORICO'],
 ['2026-09-27','BPTran','1ª CPTran','BST 1','abordagens','Abordagens','pessoas','Pessoas',12,'RCO'],
 ['2026-09-27','BPTran','2ª CPTran','BST 2','abordagens','Abordagens','pessoas','Pessoas',7,'IMPORTADO'],
 ['2026-09-26','BPTran','1ª CPTran','BST 1','abordagens','Abordagens','pessoas','Pessoas',6,'HISTORICO']
]}
test('produtividade e comparação preservam totais e supressão de histórico',()=>{
 for(const view of ['produtividade','historico','produtividade-matriz','compare']){
  const old=environment(baseline),now=environment();for(const e of [old,now])e.add('PRODUCAO',prodHeaders,prodRows());
  const p={view,dataInicio:'2026-09-27',dataFim:'2026-09-27',refInicio:'2026-09-26',refFim:'2026-09-26'};
  const result=e=>view==='compare'?e.c.p3AnalysisCompare_(p):e.c.p3Query_(p);
  assert.deepEqual(comparable(result(now)),comparable(result(old)));
 }
});
test('cache autenticado evita releitura, separa filtros e atende fresh',()=>{
 const e=environment();e.add('RSD',reportHeaders,reportRows(10));e.add('RCO',reportHeaders,[]);
 const p={action:'p3-query',token:'test-p3'};
 const first=e.c.doGet({parameter:p});assert.equal(first.ok,true);assert.equal(first.cacheHit,false);e.reset();
 const next=e.c.doGet({parameter:p});assert.equal(next.cacheHit,true);assert.equal(e.metrics.reads,0);
 const denied=e.c.doGet({parameter:{...p,token:'wrong'}});assert.equal(denied.ok,false);assert.equal(e.metrics.reads,0);
 assert.equal(e.c.doGet({parameter:{...p,batalhao:'BPRv'}}).cacheHit,false);
 assert.equal(e.c.doGet({parameter:{...p,fresh:'1'}}).cacheHit,false);
 e.advance(20001);assert.equal(e.c.doGet({parameter:p}).cacheHit,false);
});
test('gravação e falha parcial invalidam o cache anterior',()=>{
 const e=environment(),s=e.add('RSD',reportHeaders,reportRows(1));e.add('RCO',reportHeaders,[]);
 const p={action:'p3-query',token:'test-p3'};
 e.c.doGet({parameter:p});
 e.c.p3ConfigSet_=()=>{e.c.upsert_(s,'REPORT_ID','r0',{...reportRows(1)[0],STATUS:'FINALIZADO'});return {ok:true}};
 assert.equal(e.c.doPost({parameter:{action:'p3-config-set',token:'test-p3'}}).ok,true);
 let result=e.c.doGet({parameter:p});assert.equal(result.cacheHit,false);assert.equal(result.rsd[0].STATUS,'FINALIZADO');
 e.c.p3ConfigSet_=()=>{e.c.upsert_(s,'REPORT_ID','r0',{...reportRows(1)[0],STATUS:'REVISADO'});throw new Error('falha posterior')};
 assert.equal(e.c.doPost({parameter:{action:'p3-config-set',token:'test-p3'}}).ok,false);
 result=e.c.doGet({parameter:p});assert.equal(result.cacheHit,false);assert.equal(result.rsd[0].STATUS,'REVISADO');
});
test('cache comprimido funciona e indisponibilidade do cache não bloqueia a consulta',()=>{
 const e=environment();let reads=0;const read=()=>{reads++;return {ok:true,items:Array.from({length:2000},(_,i)=>({nome:'Companhia de trânsito '+i,quantidade:10}))}};
 const first=e.c.p3CachedRead_('p3-query',{},read),second=e.c.p3CachedRead_('p3-query',{},read);
 assert.equal(reads,1);assert.deepEqual(plain(first.items),plain(second.items));assert.ok([...e.values.values()][0].value.startsWith('z'));
 e.c.CacheService.getScriptCache=()=>{throw new Error('unavailable')};assert.equal(e.c.p3CachedRead_('p3-query',{},read).ok,true);assert.equal(reads,2);
});
function client(){
 let now=Date.now();class Clock extends Date{static now(){return now}}
 const calls=[],window={CentralCloud:{jsonp:(action,params)=>new Promise((resolve,reject)=>calls.push({action,params,resolve,reject})),isAuthError:e=>e.code==='AUTH_INVALID'}};
 vm.runInNewContext(fs.readFileSync('p3_queries.js','utf8'),{window,Date:Clock});
 return {q:window.P3Queries,calls,advance:ms=>now+=ms};
}
test('cliente reúne cliques repetidos, reutiliza só consultas recentes e mantém fresh',async()=>{
 const e=client(),p={token:'one',view:'rco'},a=e.q.get('p3-query',p),b=e.q.get('p3-query',p);
 assert.equal(e.calls.length,1);e.calls[0].resolve({ok:true,items:[],cacheAgeMs:15000});await Promise.all([a,b]);
 assert.equal((await e.q.get('p3-query',p)).clientCacheHit,true);
 e.advance(5001);const c=e.q.get('p3-query',p);assert.equal(e.calls.length,2);e.calls[1].resolve({ok:true});await c;
 const d=e.q.get('p3-query',p,{fresh:true}),duringRefresh=e.q.get('p3-query',p);assert.equal(e.calls.length,3);assert.equal(e.calls[2].params.fresh,'1');e.calls[2].resolve({ok:true});await Promise.all([d,duringRefresh]);
 const f=e.q.get('p3-query',{...p,token:'two'});assert.equal(e.calls.length,4);e.calls[3].resolve({ok:true});await f;
});
test('resposta antiga e consulta anterior à gravação não repovoam o cache',async()=>{
 const e=client(),p={view:'rco'},old=e.q.get('p3-query',p),fresh=e.q.get('p3-query',p,{fresh:true});
 e.calls[1].resolve({ok:true,value:'new'});await fresh;e.calls[0].resolve({ok:true,value:'old'});await old;
 assert.equal((await e.q.get('p3-query',p)).value,'new');
 e.q.clear();const pending=e.q.get('p3-query',p);e.q.clear();e.calls[2].resolve({ok:true});await pending;
 const next=e.q.get('p3-query',p);assert.equal(e.calls.length,4);e.calls[3].resolve({ok:true});await next;
});
test('erro de rede permite tentar novamente e erro de autenticação limpa cache',async()=>{
 const e=client(),p={view:'rco'},a=e.q.get('p3-query',p);e.calls[0].reject(new Error('offline'));await assert.rejects(a);
 const b=e.q.get('p3-query',p);e.calls[1].resolve({ok:true});await b;
 const c=e.q.get('p3-query',{view:'other'});e.calls[2].reject(Object.assign(new Error('invalid'),{code:'AUTH_INVALID'}));await assert.rejects(c);
 const d=e.q.get('p3-query',p);assert.equal(e.calls.length,4);e.calls[3].resolve({ok:true});await d;
});
