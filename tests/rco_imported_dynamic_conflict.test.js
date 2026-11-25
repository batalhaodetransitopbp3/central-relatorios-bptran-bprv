'use strict';
/* Imported RSD-owned dynamic rows edited in the RCO must not be overwritten
 * during a cloud refresh without explicit approval.
 * Runs real frontend function bodies, simulated DOM and no cloud access.
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
for(const name of ['relatorio_cpu.html','relatorio_cpu_ios.html']){
 const html=fs.readFileSync(path.join(root,name),'utf8');
 const a=html.indexOf('  function rcoImportedDynamicEdits(');
 const b=html.indexOf('  function rcoManualOverlayBeforeUpdate(',a);
 assert.ok(a>=0&&b>a,'missing imported dynamic edit detector in '+name);
 const applyA=html.indexOf('  function rcoApplyCloudSnapshot('),applyB=html.indexOf('  window.rcoStaleIncludedGuarnicoes',applyA);
 assert.ok(applyA>=0&&applyB>applyA,'missing update function '+name);
 const source=html.slice(a,b)+'\n'+html.slice(applyA,applyB);
 const payload={reportId:'sd-rsd',operacoes:[{id:'op-rsd',nome:'Operação original',local:'Via original'}],
    veiculosRecuperados:[{id:'veh-rsd',placaUf:'AAA1A11/PB',tipo:'Motocicleta'}],
    cirvc:[{cirvcId:'cirvc-rsd',placa:'BBB2B22',numeroTermo:'123'}]};
 const entries={cpuOperations:[],cpuVehicles:[],cpuArvcs:[]};
 const card=(id,gu,data)=>({dataset:{id},payload:{id,guarnicao:gu,...data},
  querySelector:q=>q==='[data-k="guarnicao"]'?{value:gu}:null});
 entries.cpuOperations=[card('op-rsd','BST 02',{nome:'Operação original',local:'Via original'}),
   card('op-cpu','BST 02',{nome:'Operação exclusiva CPU'})];
 entries.cpuVehicles=[card('veh-rsd','BST 02',{placaUf:'AAA1A11/PB',tipo:'Motocicleta'})];
 entries.cpuArvcs=[card('cirvc-rsd','BST 02',{placa:'BBB2B22',numeroTermo:'123'})];
 const ctx={origins:[{rsdReportId:'sd-rsd',guarnicao:'BST 02',recordIds:[]}],
  cloudPayloads:{'sd-rsd':payload},state:{rcoLinkedRecords:[]},
  recordFromEntry:e=>({...e.payload}),
  document:{querySelectorAll:q=>{const m=q.match(/^#(cpuOperations|cpuVehicles|cpuArvcs) \.entry$/);return m?entries[m[1]]:[]}}
 };
 vm.createContext(ctx);vm.runInContext(source,ctx,{filename:name});
 const detect=()=>Array.from(ctx.rcoImportedDynamicEdits('BST 02'));
 assert.deepEqual(detect(),[],name+': identical source must not prompt');
 entries.cpuOperations[1].payload.nome='CPU altered';assert.deepEqual(detect(),[],'RCO-only rows must not count as imported');
 entries.cpuOperations[0].payload.local='Via corrigida pelo coordenador';
 assert.ok(detect().includes('Operações'),name+' edited operation missed');
 entries.cpuOperations[0].payload.local='Via original';
 entries.cpuVehicles[0].payload.placaUf='CCC3C33/PB';
 assert.ok(detect().includes('Veículos'),name+' edited vehicle missed');
 entries.cpuVehicles[0].payload.placaUf='AAA1A11/PB';
 entries.cpuArvcs[0].payload.numeroTermo='456';
 assert.ok(detect().includes('CIRVC'),name+' edited CIRVC missed');
 entries.cpuArvcs[0].payload.numeroTermo='123';
 assert.deepEqual(detect(),[]);
 // Legacy ARVC must remain visible when modern CIRVC is present but empty.
 payload.arvc=[{cirvcId:'cirvc-rsd',placa:'BBB2B22',numeroTermo:'123'}];payload.cirvc=[];
 entries.cpuArvcs[0].payload.numeroTermo='789';
 assert.ok(detect().includes('CIRVC'),name+' lost the edited legacy ARVC when cirvc=[]');
 entries.cpuArvcs[0].payload.numeroTermo='123';
 assert.deepEqual(detect(),[]);
 // Actual refresh path must refuse to mutate either the old RSD or the RCO
 // until the coordinator explicitly accepts overwriting corrected imported rows.
 let prompted=0,rebuilds=0;
 Object.assign(ctx,{
   rcoSnapshotIsNewer:()=>true,rcoImportWouldEraseWork:()=>false,
   rcoSnapshotWouldDiscardFields:()=>false,rcoColumnDivergesFromSnapshot:()=>false,
   confirm:()=>{prompted++;return false},alert:()=>{},
   payloadIds:()=>new Set(['op-rsd','veh-rsd','cirvc-rsd']),
   rcoManualOverlayBeforeUpdate:()=>null,rebuildCloudGuarnicao:()=>{rebuilds++},
   rcoRestoreManualOverlayAfterUpdate:()=>{}
 });
 entries.cpuOperations[0].payload.nome='Operação corrigida no RCO';
 const original=ctx.cloudPayloads['sd-rsd'];
 const next={...payload,operacoes:[{id:'op-rsd',nome:'Operação revisada na guarnição'}]};
 const incoming={reportId:'sd-rsd',guarnicao:'BST 02',version:2};
 const refusal=ctx.rcoApplyCloudSnapshot(incoming,next,'2026-10-15');
 assert.equal(refusal,'cancelado');
 assert.equal(prompted,1,'must warn before data loss');
 assert.equal(ctx.cloudPayloads['sd-rsd'],original,'source must remain unchanged on rejection');
 assert.equal(rebuilds,0,'refused update must not rebuild');
 ctx.confirm=()=>{prompted++;return true};
 const accepted=ctx.rcoApplyCloudSnapshot(incoming,next,'2026-10-15');
 assert.equal(accepted,'atualizado');
 assert.equal(ctx.cloudPayloads['sd-rsd'],next,'new revision accepted only after permission');
 assert.equal(rebuilds,1);
 console.log('PASS '+name+' edited source-owned POD/vehicle/CIRVC detected; refresh rejected or accepted explicitly');
}
