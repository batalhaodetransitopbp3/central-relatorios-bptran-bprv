'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');const pages=['relatorio_cpu.html','relatorio_cpu_ios.html','relatorio_servico_diario.html','relatorio_servico_diario_ios.html'];
for(const f of pages){
 const html=fs.readFileSync(path.join(root,f),'utf8'),start=html.indexOf('function podTurnosFromLegacy('),end=html.indexOf('function restaurarTurnosPod(',start);
 assert.ok(start>=0&&end>start, 'missing turnos functions '+f);
 const context={};vm.runInNewContext(html.slice(start,end),context);
 const parse=x=>Array.from(context.podTurnosFromLegacy(x));
 assert.deepEqual(parse('24h'),['Manhã','Tarde','Noite']);
 assert.deepEqual(parse('12h (dia)'),['Manhã','Tarde']);
 assert.deepEqual(parse('12h (noite)'),['Noite']);
 assert.deepEqual(parse('Madrugada'),['Noite']);
 assert.deepEqual(parse('Manhã, Tarde'),['Manhã','Tarde']);
 assert.deepEqual(parse('Noite'),['Noite']);
 assert.deepEqual(parse('Manhã Tarde'),['Manhã','Tarde']);
 assert.deepEqual(parse(''),[]);
 assert.match(html, /<input type="hidden" data-k="turno">/);
 assert.match(html, /data-turno-op="Manhã"/);
 assert.match(html, /data-turno-op="Tarde"/);
 assert.match(html, /data-turno-op="Noite"/);
 assert.match(html, /restaurarTurnosPod\(e\)/);
}
console.log('PASS POD turnos multi, old 12h/24h compatibility, RSD/RCO desktop+iOS');
