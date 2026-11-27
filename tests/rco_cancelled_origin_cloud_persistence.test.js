'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
(async()=>{
 for(const file of ['relatorio_cpu.html','relatorio_cpu_ios.html']){
  const html=fs.readFileSync(path.join(root,file),'utf8');
  const a=html.indexOf('  async function loadCloud(){'),b=html.indexOf('  window.centralRcoRefreshCloud=loadCloud;',a);
  assert.ok(a>=0&&b>a,'loadCloud missing '+file);
  for(const [removed,cloudSaved] of [[1,true],[1,false],[0,true]]){
   const messages=[];
   let syncs=0;
   const box={cloudItems:[],rcoWorkflowToken:()=> 'FAKE_TOKEN',
    val:()=> '2026-10-15',currentUnit:()=>({batalhao:'BPRv',companhia:'1ª CPRv'}),
    rcoOperationalDate:()=> '2026-10-15',rsdBelongsToRcoUnit:()=>true,rsdBelongsToRcoWindow:()=>true,
    rcoCloudStatusRank:()=>0,CentralCloud:{unitParams:()=>({}),jsonp:async()=>({items:[{reportId:'sd-1',status:'CANCELADO'}]})},
    reconcileCancelledOrigins:()=>removed,renderCloud:()=>{},
    syncRcoDraft:async()=>{syncs++;return cloudSaved},alert:x=>messages.push(String(x))}
   vm.createContext(box);vm.runInContext(html.slice(a,b),box,{filename:file});
   await box.loadCloud();
   assert.equal(syncs,removed?1:0,file+' automatic cancellation must be saved to RCO cloud');
   if(removed&&cloudSaved)assert.ok(messages.some(m=>/salv|nuvem/i.test(m)),'success must mention confirmed cloud save');
   if(removed&&!cloudSaved)assert.ok(messages.some(m=>/NÃO|não|aparelho/.test(m)),'failed sync must not be described as persisted');
  }
  console.log('PASS '+file+' cancellation reconciles and separately confirms/denies RCO cloud persistence');
 }
})().catch(e=>{console.error(e);process.exitCode=1});
