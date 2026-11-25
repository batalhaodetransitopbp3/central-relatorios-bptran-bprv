const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),path=require('path'),{test}=require('node:test');
const root=path.join(__dirname,'..');
const gas=fs.readFileSync(path.join(root,'apps_script_v10.gs'),'utf8').replace(/\r\n/g,'\n');
const deploy=fs.readdirSync(path.join(root,'gas_deploy')).find(n=>/^C.*\.js$/.test(n));
const identity=gas.slice(gas.indexOf('function rcoConsolidateAdministrativeIdentity_('),gas.indexOf('function rcoConsolidateFinal_('));
const original={matricula:'123.456-7',nome:'ORIGINAL',postoGrad:'1º SGT',perfil:'CPU',turno:'24h'};
function fixture(semCpu=true){
 const stored={responsavelRco:{...original},semGuarnicaoCpu:semCpu};
 const draft={RESPONSAVEL_MATRICULA:original.matricula};
 const pkg={administrativeConsolidation:true,coordenador:{perfil:'GESTAO_SISTEMA',matricula:'234.567-8',nome:'INJETADO',postoGrad:'ERRADO',turno:'12h'},rco:{responsavelRco:{...original},semGuarnicaoCpu:semCpu,consolidacaoResponsavel:{nome:'ANTERIOR'}}};
 let active=true;
 const ctx={normMat_:s=>String(s||''),loadJsonPayload_:()=>stored,cadastroSearch_:()=>({items:[{MATRICULA:'234.567-8',NOME:'GESTOR',POSTO_GRAD:'2º TEN',SITUACAO:active?'ATIVO':'INATIVO'}]})};
 vm.createContext(ctx);vm.runInContext(identity,ctx);
 return {pkg,stored,draft,run:()=>ctx.rcoConsolidateAdministrativeIdentity_(pkg,pkg.rco,draft),inactive:()=>{active=false}};
}
test('admin sem CPU preserva autor e registra gestor do cadastro',()=>{const f=fixture();f.run();assert.deepEqual(f.pkg.rco.responsavelRco,original);assert.equal(f.pkg.rco.consolidacaoResponsavel.nome,'GESTOR');assert.equal(f.pkg.rco.consolidacaoResponsavel.turno,'ADMINISTRATIVO');assert.equal(f.pkg.rco.consolidacaoResponsavel.semCpu,true)});
test('admin com CPU preserva composição original',()=>{const f=fixture(false);f.run();assert.equal(f.pkg.rco.semGuarnicaoCpu,false);assert.equal(f.pkg.rco.consolidacaoResponsavel.semCpu,false)});
test('bloqueia substituição de autor',()=>{const f=fixture();f.pkg.rco.responsavelRco.matricula='999.999-9';assert.throws(f.run,/RCO_ADMIN_ORIGEM_INVALIDA/)});
test('bloqueia alteração da composição',()=>{const f=fixture();f.pkg.rco.semGuarnicaoCpu=false;assert.throws(f.run,/RCO_ADMIN_MODO_DIVERGENTE/)});
test('bloqueia cadastro inativo',()=>{const f=fixture();f.inactive();assert.throws(f.run,/RCO_ADMIN_CONSOLIDADOR_INVALIDO/)});
test('bloqueia perfil não administrativo',()=>{const f=fixture();f.pkg.coordenador.perfil='CPU';assert.throws(f.run,/RCO_ADMIN_CONSOLIDADOR_INVALIDO/)});
test('bloqueia identidade histórica já corrompida',()=>{const f=fixture();f.stored.responsavelRco.matricula='';assert.throws(f.run,/RCO_ADMIN_ORIGEM_INVALIDA/)});
test('fluxo não administrativo não muda de identidade',()=>{const f=fixture();f.pkg.administrativeConsolidation=false;f.run();assert.equal(f.pkg.rco.consolidacaoResponsavel.nome,'ANTERIOR')});
test('autorização gestão antes da execução e guarda de rascunho',()=>{assert.match(gas,/if\(payload\.administrativeConsolidation===true\)assertToken_\(token,'comando'\);\s*out = rcoConsolidateFinal_\(payload\)/);assert.match(gas,/RCO_RESPONSAVEL_AUSENTE/);assert.ok(gas.indexOf('rcoConsolidateAdministrativeIdentity_(pkg,rco,draft);')<gas.indexOf('var fp=rcoConsolidateFingerprint_(pkg,reportId);',gas.indexOf('function rcoConsolidateFinal_(')))});
test('backend de deploy idêntico e sintaxe válida',()=>{assert.equal(gas,fs.readFileSync(path.join(root,'gas_deploy',deploy),'utf8').replace(/\r\n/g,'\n'));new vm.Script(gas)});
for(const name of ['relatorio_cpu.html','relatorio_cpu_ios.html'])test(name+' bloqueia save precoce e separa gestor de autor',()=>{const s=fs.readFileSync(path.join(root,name),'utf8');assert.match(s,/!navigator\.onLine\|\|window\.__rcoPendingContinueResponsible\|\|\(window\.__rcoPendingReceiveAfterResponsible&&!window\.__rcoReceiveSyncAuthorized\)/);assert.match(s,/window\.applyCpu\(r\.rco\);if\(!window\.__rcoPendingContinueResponsible&&!window\.__rcoPendingReceiveAfterResponsible\)/);assert.match(s,/p\.responsavelRco=admin&&String\(p\.state\?\.reportId/);assert.match(s,/pkg\.administrativeConsolidation=true/);assert.match(s,/token=CentralCloud\.getToken\('comando'\)/);for(const m of s.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)){if(!/\bsrc\s*=|type\s*=\s*["'](?:application\/json|text\/plain)/i.test(m[1])&&m[2].trim())new vm.Script(m[2])}});

for(const name of ['relatorio_cpu.html','relatorio_cpu_ios.html'])test(name+' permite sincronizar recebimento apenas após validação formal',()=>{const s=fs.readFileSync(path.join(root,name),'utf8');assert.match(s,/window\.__rcoReceiveSyncAuthorized=true;try\{recebido=await window\.centralRcoReceiveCloudPassage\?\.\(\)\}finally\{window\.__rcoReceiveSyncAuthorized=false\}/);assert.ok(s.indexOf('applyResponsible({NOME:mm.nome')<s.indexOf('window.__rcoReceiveSyncAuthorized=true;'))});
