'use strict';
const fs=require('fs'),assert=require('assert/strict'),vm=require('vm'),path=require('path');
for(const file of ['relatorio_cpu.html','relatorio_cpu_ios.html']){
 const html=fs.readFileSync(path.join(__dirname,'..',file),'utf8');
 const extract=name=>{const i=html.indexOf(name);assert.ok(i>=0,name);return html.slice(i,html.indexOf('\n',i))};
 const a=html.indexOf('function rcoPayloadIds('),b=html.indexOf('function rcoModuleContext(',a);assert.ok(a>=0&&b>a);const s=[html.slice(a,b),extract('function payloadIds('),extract('function dedupeAppend(')].join('\n');
 const env={state:{importedRecordIds:[]}};vm.createContext(env);vm.runInContext(s,env);
 const data={cirvc:[{cirvcId:'c1',numeroTermo:'01'},{CIRVC_ID:'c2',numeroTermo:'02'}]};
 for(const fn of ['payloadIds','rcoPayloadIds']){const ids=Array.from(env[fn](data));assert.ok(ids.includes('c1')&&ids.includes('c2'),file+' '+fn+' lost CIRVC identity')}
 const first=html.indexOf('  function rcoSnapshotWouldDiscardFields('),last=html.indexOf('  function rcoApplyCloudSnapshot(',first);assert.ok(first>=0&&last>first);env.productionMapV2=()=>({});env.num=v=>Number(v)||0;vm.runInContext(html.slice(first,last),env);
 assert.equal(env.rcoSnapshotWouldDiscardFields({cirvc:[{cirvcId:'c1',numeroTermo:'01'}]},{cirvc:[{cirvcId:'c2',numeroTermo:'02'}]}),true,file+' same-count replacement must be classified as destructive');
 for(const fn of ['payloadIds','rcoPayloadIds']){
  const legacyOnly={arvc:[{cirvcId:'legacy-arvc',numeroTermo:'LEG001'}],cirvc:[]};
  const newOnly={arvc:[],cirvc:[{cirvcId:'current-cirvc',numeroTermo:'NEW001'}]};
  assert.ok(Array.from(env[fn](legacyOnly)).includes('legacy-arvc'),file+' '+fn+' lost legacy ARVC because new CIRVC list is empty');
  assert.ok(Array.from(env[fn](newOnly)).includes('current-cirvc'),file+' '+fn+' lost current CIRVC because ARVC list is empty');
 }
 const added=[];env.dedupeAppend(x=>added.push(x),data.cirvc);env.dedupeAppend(x=>added.push(x),data.cirvc);
 assert.equal(added.length,2,file+' imported duplicates');assert.deepEqual(added.map(x=>x.id),['c1','c2']);
 console.log('PASS '+file+' CIRVC identity');
}
