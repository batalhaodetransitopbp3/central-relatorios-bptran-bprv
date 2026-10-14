'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const root=path.join(__dirname,'..');
const files=['relatorio_cpu.html','relatorio_cpu_ios.html','relatorio_servico_diario.html','relatorio_servico_diario_ios.html','relatorio_operacao.html','relatorio_operacao_ios.html','auto_remocao_veiculos.html','auto_remocao_veiculos_ios.html','boletim_ocorrencia_bptrans_1cprv.html','boletim_ocorrencia_bptrans_1cprv_ios.html'];
let checked=0;
for(const f of files){
 const html=fs.readFileSync(path.join(root,f),'utf8');
 const re=/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
 let m,count=0;
 while((m=re.exec(html))!==null){
    if(/\bsrc\s*=|type\s*=\s*["'](?:application\/json|text\/plain)/i.test(m[1]))continue;
    const body=m[2].trim();if(!body)continue;
    new vm.Script(body,{filename:f+'#inline'+(++count)});
    checked++;
 }
 assert.ok(count>0,f+' nao tem scripts internos');
 assert.ok(html.includes('service_flow.js?v=10.8.44-rco-linked-modules'),f+' nao carrega fluxo revisado');
 console.log('OK '+f+' scripts='+count);
}
const a=fs.readFileSync(path.join(root,'apps_script_v10.gs'),'utf8');
const b=fs.readFileSync(path.join(root,'gas_deploy','Código.js'),'utf8');
assert.strictEqual(a,b,'backend nao sincronizado entre arquivos');
assert.ok(a.includes("function rcoAssertDraftRevision_"),'bloqueio de revisao RCO sumiu');
assert.ok(a.includes('function rcoBindDraftServiceWindow_'),'janela 07h RCO sumiu');
assert.ok(a.includes('function rsdContinueDateEligible_'),'continuidade RSD nao presente');
assert.ok(a.includes('function rcoRequireLinkedScope_'),'escopo dos modulos RCO nao presente');
console.log('OK inline scripts='+checked+' e backend 10.8.43 preservado');
