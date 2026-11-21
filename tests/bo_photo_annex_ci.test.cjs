'use strict';
/* GitHub CI contract gate for BO-only photo annex, no production credentials.
 * Built-in Node APIs only; safe on Linux and Windows.
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const docs=[
 'boletim_ocorrencia_bptrans_1cprv.html',
 'boletim_ocorrencia_bptrans_1cprv_ios.html'
];
const parse=(s,id,tag)=>{
 const rx=new RegExp('<'+tag+'\\b[^>]*\\bid="'+id+'"[^>]*>([\\s\\S]*?)<\\/'+tag+'>','i');
 const m=s.match(rx);
 assert(m,'Missing '+tag+' id '+id);
 return m[1];
};
const files=docs.map(name=>({
 name,text:fs.readFileSync(path.join(root,name),'utf8')
}));
const all=files.map(f=>({
 ...f,
 js:parse(f.text,'boPhotoAnnexScript','script'),
 vault:parse(f.text,'boPhotoVaultScript','script'),
 css:parse(f.text,'boPhotoAnnexStyle','style'),
 framer:parse(f.text,'photoFramerScript','script'),
 framerCss:parse(f.text,'photoFramerStyles','style')
}));
const canonicalCIRVC=fs.readFileSync(path.join(root,'auto_remocao_veiculos.html'),'utf8');
test('Exactly two BO variants exist and share byte-identical annex source',()=>{
 assert.equal(all.length,2);
 assert.equal(all[0].js,all[1].js);
 assert.equal(all[0].vault,all[1].vault);
 assert.equal(all[0].css,all[1].css);
 assert.equal(all[0].framer,all[1].framer);
});
test('Embedded annex JS and CIRVC PhotoFramer compile as JavaScript',()=>{
 for(const f of all){
  assert.doesNotThrow(()=>new vm.Script(f.js,{filename:f.name+':annex'}));
  assert.doesNotThrow(()=>new vm.Script(f.vault,{filename:f.name+':vault'}));
  assert.doesNotThrow(()=>new vm.Script(f.framer,{filename:f.name+':PhotoFramer'}));
 }
});
test('PhotoFramer code and CSS match existing CIRVC exactly',()=>{
 const sourceJs=parse(canonicalCIRVC,'photoFramerScript','script');
 const sourceCss=parse(canonicalCIRVC,'photoFramerStyles','style');
 for(const f of all){
  assert.equal(f.framer,sourceJs);
  assert.equal(f.framerCss,sourceCss);
 }
});
test('Every BO variant retains core forms, draft, signatures and print action',()=>{
 for(const f of files){
  for(const token of [
   'id="boForm"','id="ciopCopom"','function serializeForm(',
   'function restoreForm(','function saveDraft(','function loadDraft(',
   'function prepareAndPrint(','function clearForm(','id="boAnnexOpenButton"'
  ]){
   if(token==='id="boAnnexOpenButton"'){
     // Created by the annex controller after DOM is available.
     assert(all.find(x=>x.name===f.name).js.includes("button.id='boAnnexOpenButton'"));
   }else assert(f.text.includes(token),f.name+' lacks '+token);
  }
 }
});
test('Pages have exactly 4 photo positions, with print 2x2 grid and A4 breaks',()=>{
 for(const f of all){
  assert.match(f.js,/MAX_PHOTOS=96,PER_PAGE=4/);
  assert.match(f.js,/Array\.from\(\{length:PER_PAGE\}/);
  assert.match(f.js,/Math\.ceil\(state\.photos\.length\/PER_PAGE\)/);
  assert.match(f.css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
  assert.match(f.css,/grid-template-rows:repeat\(2,minmax\(0,1fr\)\)!important/);
  assert.match(f.css,/page-break-before:always!important/);
 }
});
test('Photos are not stored in the legacy BO text draft or sent to public endpoints',()=>{
 for(const f of all){
  assert.match(f.js,/indexedDB\.open\(DB,1\)/);
  assert.match(f.js,/central-bo-photo-annex-v1/);
  assert.doesNotMatch(f.js,/\bfetch\s*\(|XMLHttpRequest|google\.script\.run|UrlFetchApp|DriveApp/);
  assert.match(f.js,/Não são anexadas à nuvem/);
 }
});
test('One canonical BO number works for index, RSD and RCO; no service-only key',()=>{
 for(const f of all){
  assert.match(f.js,/if\(number\)return 'bo-annex::number:'\+number/);
  assert.doesNotMatch(f.js,/return 'bo-annex::'\+service\+'::number:'/);
  assert(f.js.includes(String.raw`/^PM20\d{8}$/`)); // canonical-number validation in source text
  assert.match(f.js,/function ensureLoaded\(\)/);
  assert.match(f.js,/state\.key!==wanted/);
 }
});
test('Duplicate tabs use IndexedDB compare-and-swap version plus deletion tombstone',()=>{
 for(const f of all){
  assert.match(f.js,/revision:0/);
  assert.match(f.js,/const read=store\.get\(key\)/);
  assert.match(f.js,/current!==expected/);
  assert.match(f.js,/tx\.abort\(\)/);
  assert.match(f.js,/const encrypted=await vault.encrypt/);
  assert.match(f.vault,/AES-GCM/);
  assert.match(f.vault,/PBKDF2/);
  assert.match(f.js,/deletedAt:new Date\(\)\.toISOString\(\)/);
 }
});
test('PDF button blocks uncommitted photos and incomplete images',()=>{
 for(const f of all){
  assert.match(f.js,/window\.prepareAndPrint=function/);
  assert.match(f.js,/state\.busy\|\|pendingMutations>0/);
  assert.match(f.js,/state\.key!==documentScope\(\)/);
  assert.match(f.js,/!img\.complete\|\|img\.naturalWidth===0/);
 }
});
test('All variants have visible user warning and preservation instructions',()=>{
 for(const f of all){
  assert.match(f.js,/Preserve os arquivos fotográficos originais/);
  assert.match(f.js,/armazenadas|salva\(s\)|salvo/);
  assert.match(f.css,/#boPhotoAnnex/);
 }
});
test('PR-reviewed static image code contains no hardcoded credentials',()=>{
 for(const f of all){
  assert.doesNotMatch(f.js+f.vault,/AKfycb|AIza|ghp_[A-Za-z0-9]{30,}|-----BEGIN PRIVATE KEY/);
 }
});
