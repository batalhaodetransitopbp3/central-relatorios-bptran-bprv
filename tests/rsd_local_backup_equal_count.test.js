'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const backup=require(path.join(__dirname,'..','rsd_local_backup.js'));
const mem=new Map(),storage={getItem:k=>mem.get(k)||null,setItem:(k,v)=>mem.set(k,v)};
const a={reportId:'sd-a',serviceId:'svc-a',guarnicao:{nome:'BST 02',responsavel:'Militar A',viatura:'0891'},
  producao:{abordagens:{motos:5}},alteracoes:{servico:'Troca de serviço'},
  ocorrencias:[{id:'oc-a',descricao:'Ocorrência registrada'}],cirvc:[{id:'cirvc-a',numeroTermo:'001',placa:'AAA1A11'}],
  operacoes:[{id:'op-a',nome:'Operação original'}],
  fisco:{acionamentos:[{id:'fis-a',descricao:'Acionamento original'}]}};
assert.equal(backup.save(storage,a,()=>false).ok,true);
const cases=[
  ['same-size occurrence replaced by another occurrence', {ocorrencias:[{id:'oc-b',descricao:'Outra ocorrência'}]}],
  ['same-size CIRVC replaced by another CIRVC', {cirvc:[{id:'cirvc-b',numeroTermo:'002',placa:'BBB2B22'}]}],
  ['same-size POD entry replaced by another', {operacoes:[{id:'op-b',nome:'Outra operação'}]}],
  ['same-size Fisco acionamento replaced', {fisco:{acionamentos:[{id:'fis-b',descricao:'Outro acionamento'}]}}],
  ['commander erased but guarnicao still named', {guarnicao:{nome:'BST 02',responsavel:'',viatura:'0891'}}],
  ['vehicle prefix erased', {guarnicao:{nome:'BST 02',responsavel:'Militar A',viatura:''}}]
];
for(const [label,patch] of cases){
  const next={...structuredClone(a),...patch};
  const no=backup.save(storage,next,()=>false);
  assert.equal(no.ok,false,label+' must require explicit confirmation');
  assert.equal(no.reason,'REDUCAO_NAO_CONFIRMADA');
  const after=backup.read(storage,'sd-a').payload;
  assert.equal(after.ocorrencias[0].id,'oc-a');
  assert.equal(after.cirvc[0].id,'cirvc-a');
  assert.equal(after.operacoes[0].id,'op-a');
}
console.log('PASS local RSD backup detects replaced same-count records and removed identities, requires confirmation');
