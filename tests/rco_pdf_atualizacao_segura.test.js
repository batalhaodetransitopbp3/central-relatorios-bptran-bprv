'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');const read=file=>fs.readFileSync(path.join(root,file),'utf8');
async function run(){
 for(const suffix of ['', '_ios']){
  const rco=read('relatorio_cpu'+suffix+'.html');
  const rsd=read('relatorio_servico_diario'+suffix+'.html');
  const prep=rco.slice(rco.indexOf('function prepareCloudViewer('),rco.indexOf('async function openCloudReboquePdf('));
  assert.ok(prep.startsWith('function prepareCloudViewer('),'RCO PDF source not found');
  let viewer;
  const ctx={
    window:{open:()=>viewer={
      sessionStorage:{values:{},setItem(k,v){this.values[k]=v;}},
      location:{replace(u){this.url=u;}},
      opener:'window'
    }},
    rcoWorkflowToken:()=> 'ROLE_TEST',
    currentUnit:()=>({batalhao:'BPRv',companhia:'1ª CPRv',companhiaNumero:1}),
    rcoOperationalDate:()=> '2026-10-15',val:()=> '2026-10-15',
    cloudDocumentPage:()=> 'relatorio_servico_diario.html',
    alert:msg=>{throw new Error(msg)}
  };
  vm.createContext(ctx);vm.runInContext(prep,ctx);
  ctx.openCloudRsdPdf({reportId:'sd-fixture'});
  assert.equal(viewer.location.url,'relatorio_servico_diario.html?cloudView=sd-fixture&autoPdf=1');
  assert.equal(viewer.sessionStorage.values['pmpb-cloud-viewer-token-v1'],'ROLE_TEST');
  const scope=JSON.parse(viewer.sessionStorage.values['pmpb-cloud-viewer-rco-scope-v1']);
  assert.equal(scope.reportId,'sd-fixture');assert.equal(scope.data,'2026-10-15');assert.equal(scope.companhia,'1ª CPRv');assert.equal(scope.batalhao,'BPRv');

  const start=rsd.indexOf('async function loadCloudViewer('),end=rsd.indexOf('function install(){',start);
  assert.ok(start>=0&&end>start,'RSD viewer source missing');
  const requests=[],applied=[],alerts=[],prints=[];
  const scopedContext={
    READONLY_VIEWER:true,
    CLOUD_VIEW_REPORT:'sd-fixture',URLSearchParams,
    sessionStorage:{getItem:k=>viewer.sessionStorage.values[k]||''},
    CentralCloud:{getToken:()=>'',jsonp:async(action,args)=>{requests.push({action,args});return {rsd:{reportId:'sd-fixture',guarnicao:{nome:'BST 02'}}};}},
    window:{applyPayload:p=>applied.push(p),print:()=>prints.push('printed')},location:{search:'?cloudView=sd-fixture&autoPdf=1'},nomePdf:()=> 'RSD de teste',setTimeout:cb=>cb(),document:{
      body:{classList:{add:()=>{}}},
      getElementById:()=>null,
      createElement:()=>({style:{}}),
      querySelector:()=>null,
      querySelectorAll:()=>[]
    },syncAllPrint:()=>{},atualizarAssinaturaPrint:()=>{},alert:m=>alerts.push(m)
  };
  vm.createContext(scopedContext);vm.runInContext(rsd.slice(start,end),scopedContext);
  await scopedContext.loadCloudViewer();
  assert.equal(requests.length,1,'one read-only RSD lookup');
  assert.equal(requests[0].action,'rsd-get');
  assert.equal(requests[0].args.reportId,'sd-fixture');
  assert.equal(requests[0].args.companhia,'1ª CPRv');
  assert.equal(requests[0].args.data,'2026-10-15');
  assert.equal(applied.length,1);
  assert.equal(alerts.length,0);assert.equal(prints.length,1,'cloud viewer should open the PDF print dialog automatically');

  viewer.sessionStorage.values['pmpb-cloud-viewer-rco-scope-v1']=JSON.stringify({...scope,reportId:'different'});
  await scopedContext.loadCloudViewer();
  assert.equal(requests.length,1,'mismatched report scope cannot trigger network request');

  const refreshStart=rco.indexOf('async function refreshCloudGuarnicao('),refreshEnd=rco.indexOf('async function addAll(',refreshStart);
  assert.ok(refreshStart>=0&&refreshEnd>refreshStart);
  const incoming={reportId:'r-fixture',guarnicao:'BST 02',draftRevision:4,version:1,status:'EM_SERVICO'};
  const old={reportId:'r-fixture',guarnicao:'BST 02',draftRevision:2,version:1,status:'EM_SERVICO'};
  const reports=[],messages=[],listReads=[];
  const refreshContext={
    rcoWorkflowToken:()=> 'COORD',
    currentUnit:()=>({batalhao:'BPRv',companhia:'1ª CPRv',companhiaNumero:1}),
    rcoOperationalDate:()=> '2026-10-15',val:()=> '2026-10-15',
    CentralCloud:{unitParams:u=>u,jsonp:async(act,q)=>{listReads.push({act,q});return {items:[incoming]}}},
    rsdBelongsToRcoUnit:()=>true,rsdBelongsToRcoWindow:()=>true,
    origins:[{rsdReportId:'r-fixture',draftRevision:2,versao:1}],
    rcoSnapshotIsNewer:(orig,item)=> Number(item.draftRevision)>Number(orig.draftRevision),
    cloudItems:[old],
    addCloud:async x=>reports.push(x),
    alert:msg=>messages.push(msg)
  };
  vm.createContext(refreshContext);vm.runInContext(rco.slice(refreshStart,refreshEnd),refreshContext);
  await refreshContext.refreshCloudGuarnicao(old);
  assert.equal(reports.length,1);assert.equal(reports[0].draftRevision,4);
  assert.equal(listReads[0].act,'rsd-list');assert.equal(listReads[0].q.data,'2026-10-15');
  assert.equal(refreshContext.cloudItems[0].draftRevision,4);
  refreshContext.origins[0].draftRevision=4;
  await refreshContext.refreshCloudGuarnicao(old);
  assert.equal(reports.length,1,'no reimport for already current revision');
  assert.ok(messages.some(s=>s.includes('Não há progressão mais recente')));
  console.log('PASS RCO/PDF'+suffix+': scoped read-only viewer and on-demand revision update');
 }
}
run().catch(e=>{console.error(e);process.exitCode=1});
