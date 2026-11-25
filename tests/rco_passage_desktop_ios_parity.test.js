'use strict';
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const read=n=>fs.readFileSync(path.join(root,n),'utf8').replace(/\r\n/g,'\n');
const desktop=read('relatorio_cpu.html'),ios=read('relatorio_cpu_ios.html');
for(const [begin,end] of [
 ['function renderRcoAnteriores_(){','function installUi(){'],
 ['async function rcoPassagemConferidaNaNuvem_(','function pendingRcoPassage(){'],
 ['async function claimRcoDraft(','async function continueRcoCloud(){']
]){
 const a=desktop.indexOf(begin),b=desktop.indexOf(end,a),c=ios.indexOf(begin),e=ios.indexOf(end,c);
 assert(a>0&&b>a&&c>0&&e>c,'missing RCO block '+begin);
 assert.equal(desktop.slice(a,b),ios.slice(c,e),'desktop/iOS parity for '+begin);
}
for(const html of [desktop,ios]){
 const received=html.indexOf('recebido=await window.centralRcoReceiveCloudPassage?.()');
 const guard=html.lastIndexOf('window.__rcoReceiveSyncAuthorized=true',received);
 const release=html.indexOf('finally{window.__rcoReceiveSyncAuthorized=false}',received);
 assert(guard>=0&&received>guard&&release>received,'recebimento sincronizado somente durante registro validado');
 const complete=html.indexOf('window.__rcoPendingReceiveAfterResponsible=false',release);
 assert(complete>release&&html.slice(release,complete).includes('if(!recebido)throw new Error'),'não confirma passagem quando gravação falha');
}
console.log('PASS RCO previous snapshots, passage, receipt and claim guards identical on desktop/iOS');
