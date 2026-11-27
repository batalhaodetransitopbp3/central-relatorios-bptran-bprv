'use strict';
/* Strictly local regression for multi-CIRVC collection: no network or production. */
const assert=require('node:assert/strict'), fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
const sources=['auto_remocao_veiculos.html','auto_remocao_veiculos_ios.html'];
for(const f of sources){
 const html=fs.readFileSync(path.join(root,f),'utf8');
 const first=html.indexOf('function cirvcCardHasData(')>=0?html.indexOf('function cirvcCardHasData('):html.indexOf('function arvcPayloadCpu(){');
 const last=html.indexOf('function downloadArvcJson(',first);
 assert.ok(first>=0&&last>first,'CIRVC collect section missing in '+f);
 const cloudBegin=html.indexOf('function cloudRecords(){');
 const cloudEnd=html.indexOf('async function publicarCirvcs(',cloudBegin);
 assert.ok(cloudBegin>=0&&cloudEnd>cloudBegin,'CIRVC cloud section missing in '+f);
 let cards=[];
 const ctx={batalhao:'BPRv',companhiaNumero:1,unidade:{batalhao:'BPRv',companhia:'1ª CPRv',companhiaNumero:1},serviceId:'svc-demo',rsdReportId:'rsd-demo',segmento:1};
 const context={window:{getInstitution:()=>ctx},coletarTodos:()=>cards,activeServiceContextCirvc:()=>ctx,
  cirvcReportId:'cirvc-demo',getInstitution:()=>ctx,unit:()=>ctx,stableArvcToken:s=>String(s).split('').reduce((a,c)=>a+c.charCodeAt(0),0).toString(36)};
 vm.createContext(context);
 vm.runInContext(html.slice(first,last),context);
 vm.runInContext(html.slice(cloudBegin,cloudEnd),context);
 const collect=()=>context.arvcPayloadCpu().registros;
 const cloud=()=>context.cloudRecords();
 cards=[
  {cirvcId:'cirvc-test-101',numeroTermo:'101',placa:'AAA1A11',militarResponsavel:'A',motivo:'Sinistro de trânsito',localDestino:'Base'},
  {cirvcId:'cirvc-test-102',numeroTermo:'102',placa:'BBB2B22',militarResponsavel:'B',motivo:'DETRAN',localDestino:'Pátio'},
  {cirvcId:'cirvc-test-103',numeroTermo:'103',placa:'CCC3C33',militarResponsavel:'C',motivo:'Apoio a outro órgão',localDestino:'Base'}
 ];
 let records=collect();
 assert.equal(records.length,3,'all 3 entries must be exported');
 assert.deepEqual(Array.from(records,x=>x.numeroTermo),['101','102','103']);
 assert.deepEqual(Array.from(records,x=>x.id),['cirvc-test-101','cirvc-test-102','cirvc-test-103']);
 assert.deepEqual(Array.from(cloud(),x=>x.placa),['AAA1A11','BBB2B22','CCC3C33']);
 cards=[{numeroTermo:'',placa:'',motivo:'',localDestino:''},...cards];
 records=collect();
 assert.equal(records.length,3,'trailing records must survive a blank form before them');
 const enriched=cloud();
 assert.deepEqual(Array.from(enriched,x=>x.numeroTermo),['101','102','103']);
 assert.deepEqual(Array.from(enriched,x=>x.id),['cirvc-test-101','cirvc-test-102','cirvc-test-103'],'stable identifiers survive preceding empty card');
 assert.deepEqual(Array.from(enriched,x=>x.motivo),['Sinistro de trânsito','DETRAN','Apoio a outro órgão'],'enrichment cannot shift after a blank form');
 cards=[{numeroTermo:'104'},{numeroTermo:'105',placa:'DDD4D44'}];
 records=collect();
 assert.equal(records.length,2,'number-of-term-only filled record must not be silently dropped');
 assert.equal(records[0].numeroTermo,'104');
 console.log('PASS '+f+' three CIRVCs, blank cards, number-only preservation, individual values');
}
