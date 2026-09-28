const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function page(file){
 const html=fs.readFileSync(file,'utf8'),dom=new JSDOM(html,{url:'https://central.example/'+file,runScripts:'outside-only'}),w=dom.window;
 const calls=[],posts=[],timers=[],alerts=[];
 w.setTimeout=(fn,ms)=>{timers.push({fn,ms});return timers.length};w.clearTimeout=()=>{};w.setInterval=()=>1;w.clearInterval=()=>{};
 w.alert=x=>alerts.push(x);w.confirm=()=>true;w.prompt=()=> 'Correção de teste';
 w.CENTRAL_SKIP_VERSION_PROBE=true;
 w.sessionStorage.setItem('pmpb-p3-actor-v1',JSON.stringify({matricula:'123.456-7',nome:'Teste',perfil:'P3'}));
 w.localStorage.setItem('pmpb-p3-token-v1','test-p3');
 w.eval(fs.readFileSync('central_cloud.js','utf8'));
 w.CentralCloud.probe=()=>{throw new Error('Consulta não deve aguardar probe')};
 w.CentralCloud.jsonp=(action,params)=>new Promise((resolve,reject)=>calls.push({action,params,resolve,reject}));
 w.CentralCloud.submitForm=(action,payload)=>{posts.push({action,payload});return Promise.resolve({ok:true})};
 w.eval(fs.readFileSync('p3_queries.js','utf8'));
 const scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];w.eval(scripts.at(-1)[1]);
 const $=id=>w.document.getElementById(id),click=sel=>w.document.querySelector(sel).click();
 const start=()=>timers.find(t=>t.ms===400||t.ms===350).fn();
 return {dom,w,calls,posts,alerts,$,click,start};
}
test('Gestão P3 consulta direto, reúne cliques e ignora resposta de aba anterior',async()=>{
 const e=page('gestao_p3.html');try{
  e.start();await tick();assert.equal(e.calls.length,1);assert.equal(e.calls[0].action,'p3-query');
  e.click('[data-sub="controle-diario"]');e.click('[data-sub="controle-diario"]');await tick();assert.equal(e.calls.length,1);
  e.calls[0].resolve({ok:true,rsd:[],rco:[]});await tick();assert.equal(e.$('title').textContent,'Situação do serviço');
  e.click('[data-sub="operacoes"]');await tick();e.click('[data-sub="prisoes"]');await tick();assert.equal(e.calls.length,3);
  e.calls[2].resolve({ok:true,items:[]});await tick();const title=e.$('title').textContent;assert.match(title,/Prisões/);
  e.calls[1].resolve({ok:true,items:[]});await tick();assert.equal(e.$('title').textContent,title);
  e.click('[data-sub="controle-diario"]');await tick();assert.equal(e.calls.length,3);assert.match(e.$('queryState').textContent,/reutilizada/);
  e.click('#apply');e.click('#apply');await tick();assert.equal(e.calls.length,4);assert.equal(e.calls[3].params.fresh,'1');
  e.calls[3].resolve({ok:true,rsd:[],rco:[]});await tick();assert.match(e.$('progressText').textContent,/atualizada/);
 }finally{e.dom.window.close()}
});
test('retificação invalida consulta local e recarrega do banco',async()=>{
 const e=page('gestao_p3.html');try{
  e.click('[data-main="rco"]');await tick();
  e.calls[0].resolve({ok:true,items:[{REPORT_ID:'test-rco',STATUS:'FINALIZADO',QUANTIDADE_GUARNICOES:1}]});await tick();
  e.click('[data-reopen-rco]');await tick();assert.equal(e.posts[0].action,'rco-retification-open');assert.equal(e.calls.length,2);assert.equal(e.calls[1].params.fresh,'1');
  e.calls[1].resolve({ok:true,items:[]});await tick();assert.match(e.$('rcoBody').textContent,/Nenhum RCO/);
 }finally{e.dom.window.close()}
});
test('comparação, filtros vazios e expiração de sessão são tratados',async()=>{
 const e=page('gestao_p3.html');try{
  e.click('[data-sub="analise"]');await tick();assert.equal(e.calls[0].action,'p3-analysis-compare');assert.ok(e.calls[0].params.refInicio);
  e.calls[0].resolve({ok:true,catalogo:[],metricas:[],periodo:{},referencia:{}});await tick();assert.equal(e.$('title').textContent,'Comparação de indicadores');
  e.click('#clearCompanies');e.click('#apply');await tick();assert.equal(e.calls.length,1);assert.match(e.$('chart').textContent,/Selecione/);
  e.click('#allCompanies');e.click('#apply');await tick();e.calls[1].reject(Object.assign(new Error('inválida'),{code:'AUTH_INVALID'}));await tick();
  assert.equal(e.w.CentralCloud.getToken('p3'),'');assert.match(e.$('p3ActorState').textContent,/não identificada/);
 }finally{e.dom.window.close()}
});
test('tabela de produtividade protege o resultado de consultas fora de ordem',async()=>{
 const e=page('tabela_operacional_p3.html');try{
  e.start();await tick();e.$('di').value='2026-09-01';e.click('#apply');await tick();assert.equal(e.calls.length,2);
  e.calls[1].resolve({ok:true,items:[{GRUPO_CODIGO:'abordagens',INDICADOR_CODIGO:'pessoas',COMPANHIA:'1ª CPTran',QUANTIDADE:17}],rawRows:1});await tick();
  assert.match(e.$('tableArea').textContent,/17/);const shown=e.$('tableArea').innerHTML;
  e.calls[0].resolve({ok:true,items:[],rawRows:0});await tick();assert.equal(e.$('tableArea').innerHTML,shown);
  e.click('#clearCompanies');e.click('#apply');await tick();assert.equal(e.calls.length,2);assert.match(e.$('tableArea').textContent,/Selecione/);
 }finally{e.dom.window.close()}
});
test('probe compartilhado mantém compatibilidade dos demais módulos',async()=>{
 const dom=new JSDOM('<body></body>',{url:'https://central.example/',runScripts:'outside-only'}),w=dom.window;try{
  w.CENTRAL_SKIP_VERSION_PROBE=true;w.eval(fs.readFileSync('central_cloud.js','utf8'));
  const a=w.CentralCloud.probe(),b=w.CentralCloud.probe();
  const scripts=w.document.querySelectorAll('script[src]');assert.equal(scripts.length,1);
  const callback=new URL(scripts[0].src).searchParams.get('callback');w[callback]({ok:true,version:'10.8.4'});
  assert.deepEqual(await Promise.all([a,b]),[true,true]);assert.equal(w.CentralCloud.isEnabled(),true);
  assert.equal(w.CentralCloud.tokenKindForAction('p3-analysis-compare'),'p3');
 }finally{dom.window.close()}
});
