'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),vm=require('node:vm');
const root=path.join(__dirname,'..');
const api=require(path.join(root,'rsd_local_backup.js'));
function store(){const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k),map};}
const ls=store();
const record={reportId:'sd-001',serviceId:'svc-001',guarnicao:{nome:'BST 02',matricula:'0000'},servico:{data:'2026-10-15'},producao:{abordagens:{motos:0}},alteracoes:{servico:'Troca na equipe'},ocorrencias:[],cirvc:[]};
assert.equal(api.save(ls,record,()=>false).ok,true,'zero production but service changes should save');
const first=api.read(ls,'sd-001');assert.equal(first.payload.alteracoes.servico,'Troca na equipe');assert.equal(first.serviceId,'svc-001');
assert.equal(api.read(ls,'sd-other'),null,'cannot select another service');
const next={...record,producao:{abordagens:{motos:9}},ocorrencias:[{id:'o1',descricao:'Ocorrência integral'}],cirvc:[{id:'c1',numeroTermo:'001'}]};
assert.equal(api.save(ls,next,()=>false).ok,true);
const fewer={...record,observacoes:'Sem ocorrências'};
const reduced=api.save(ls,fewer,()=>false);
assert.equal(reduced.ok,false);assert.equal(reduced.reason,'REDUCAO_NAO_CONFIRMADA');
assert.equal(api.read(ls,'sd-001').payload.ocorrencias.length,1,'previous backup must not be overwritten');
assert.equal(api.save(ls,fewer,()=>true).ok,true,'intentional reduction explicitly confirmed');
assert.equal(api.read(ls,'sd-001').payload.ocorrencias.length,0);
assert.equal(api.save(ls,{...next,serviceId:'svc-other'},()=>true).reason,'OUTRO_SERVICO');
assert.equal(api.save(ls,{reportId:'sd-002',producao:{x:0}},()=>true).reason,'CONTEUDO_VAZIO');
assert.equal(api.save(ls,{...record,reportId:'sd-002',guarnicao:{nome:'EXTRA 01'},operacoes:[{id:'op1'}]},()=>true).ok,true);
const busted={getItem:()=>null,setItem:()=>{throw new Error('QuotaExceededError')}};
assert.throws(()=>api.save(busted,record,()=>true),/QuotaExceededError/);
for(const f of ['relatorio_servico_diario.html','relatorio_servico_diario_ios.html']){
 const html=fs.readFileSync(path.join(root,f),'utf8');
 assert.match(html,/src="rsd_local_backup.js\?v=2"/);
 assert.match(html,/onclick="salvarCopiaLocalRsd\(\)"/);
 assert.match(html,/onclick="recuperarCopiaLocalRsd\(\)"/);
 const start=html.indexOf('function salvarCopiaLocalRsd('),end=html.indexOf('function salvarRascunhoGuarnicao(s=false)',start);
 assert.ok(start>=0&&end>start);
 const alerts=[],savedDraft=[];
 let payload=structuredClone(record);
 const ctx={
  window:{CENTRAL_READONLY_VIEWER:false,CentralRsdLocalBackup:api,payloadV2:()=>payload,rsdLocalPersistAllowed:()=>false,applyPayload:p=>{payload=p}},
  localStorage:ls,reportId:'sd-001',alert:msg=>alerts.push(msg),
  confirm:msg=>true,salvarRascunhoGuarnicao:()=>savedDraft.push(true)
 };
 vm.createContext(ctx);vm.runInContext(html.slice(start,end),ctx);
 // Simulate manual contingency while cloud synchronization is blocked.
 assert.equal(ctx.salvarCopiaLocalRsd(),true,f+' manual save');
 assert.equal(savedDraft.length,0,'must not overwrite canonical draft before cloud hydration');
 payload={...record,alteracoes:{servico:'Mutação em tela'}};const count=alerts.length;
 assert.equal(ctx.recuperarCopiaLocalRsd(),true,f+' recovery');
 assert.equal(payload.alteracoes.servico,'Troca na equipe');
 assert.ok(alerts.length>count,'user notified on restore');
 console.log('PASS '+f+' manual save + recovery while cloud hydration blocked');
}
console.log('PASS isolated RSD local contingency identity, integrity, reductions, storage failures');
