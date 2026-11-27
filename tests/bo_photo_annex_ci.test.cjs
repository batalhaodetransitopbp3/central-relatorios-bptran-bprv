'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const files=['boletim_ocorrencia_bptrans_1cprv.html','boletim_ocorrencia_bptrans_1cprv_ios.html'].map(f=>fs.readFileSync(path.join(root,f),'utf8'));
const extract=(s,id,tag='script')=>{const m=s.match(new RegExp('<'+tag+' id="'+id+'">([\\s\\S]*?)<\\/'+tag+'>'));assert(m,id);return m[1]};
const annex=files.map(s=>extract(s,'boPhotoAnnexScript')),framer=files.map(s=>extract(s,'photoFramerScript')),css=files.map(s=>extract(s,'boPhotoAnnexStyle','style'));
test('both BO variants identical annex and framer',()=>{assert.equal(annex[0],annex[1]);assert.equal(framer[0],framer[1]);assert.equal(css[0],css[1]);});
for(let i=0;i<2;i++){
test('variant '+i+' compiles; no photo persistence, vault, network or cookie API',()=>{new vm.Script(annex[i]);new vm.Script(framer[i]);assert.doesNotMatch(annex[i]+framer[i],/indexedDB|localStorage|sessionStorage|BoPhotoVault|fetch\s*\(|XMLHttpRequest|sendBeacon|document\.cookie|caches\./);assert(!files[i].includes('boPhotoVaultScript'));});
test('variant '+i+' four slots, PDF pages and no empty annex',()=>{assert.match(annex[i],/PER_PAGE=4/);assert.match(annex[i],/Math\.ceil\(state\.photos\.length\/PER_PAGE\)/);assert.match(css[i],/page-break-before:always!important/);assert.match(css[i],/is-empty\{display:none!important\}/);});
test('variant '+i+' retains core BO actions and lifecycle safeguards',()=>{for(const x of ['function serializeForm(','function restoreForm(','function prepareAndPrint(','function clearForm(','id="boForm"','id="ciopCopom"'])assert(files[i].includes(x),x);assert.match(annex[i],/state\.epoch\+\+/);assert.match(annex[i],/still\(epoch,key\)/);assert.match(annex[i],/pagehide/);assert.match(framer[i],/releaseImage\(\)/);});
}