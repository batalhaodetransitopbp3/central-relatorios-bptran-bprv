'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
for(const f of ['auto_remocao_veiculos.html','auto_remocao_veiculos_ios.html']){
 const src=fs.readFileSync(path.join(root,f),'utf8');
 const start=src.indexOf('function validarAssinaturasAutos() {'),end=src.indexOf('function arvcDataFile(',start);
 assert.ok(start>=0&&end>start);
 const cases=[
  {militar:true,recebedor:false,recusa:true,expected:true,label:'recusa dispensa assinatura do recebedor'},
  {militar:true,recebedor:false,recusa:false,expected:false,label:'sem recusa exige assinatura do recebedor'},
  {militar:false,recebedor:false,recusa:true,expected:false,label:'recusa não dispensa assinatura do militar'},
  {militar:true,recebedor:true,recusa:false,expected:true,label:'ambas assinaturas válidas'}
 ];
 for(const test of cases){
  const alerts=[];
  const boxes={militar:{dataset:{signatureData:test.militar?'data:image/png;base64,A':''},closest:()=>({classList:{add(){}},scrollIntoView(){}})},recebedor:{dataset:{signatureData:test.recebedor?'data:image/png;base64,B':''},closest:()=>({classList:{add(){}},scrollIntoView(){}})}};
  const card={
   querySelectorAll:()=>[{classList:{remove(){}}},{classList:{remove(){}}}],
   querySelector:x=>x.includes('assinaturaResponsavel')?boxes.militar:x.includes('assinaturaRecebedor')?boxes.recebedor:x.includes('recebedorRecusouAssinar')?{checked:test.recusa}:null
  };
  const ctx={document:{querySelectorAll:()=>[card]},alert:x=>alerts.push(x)};
  vm.createContext(ctx);vm.runInContext(src.slice(start,end),ctx);
  const valid=ctx.validarAssinaturasAutos();
  assert.equal(valid,test.expected,f+' '+test.label);
  if(test.expected)assert.equal(alerts.length,0);
 }
 console.log('PASS '+f+': signed/refused recipient and mandatory officer signatures');
}
