'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const root=path.join(__dirname,'..');
const a=fs.readFileSync(path.join(root,'apps_script_v10.gs'),'utf8');
const b=fs.readFileSync(path.join(root,'gas_deploy','Código.js'),'utf8');
assert.strictEqual(a,b,'backend source divergence');
const begin=a.indexOf('function handleApiReadViaGet_('),end=a.indexOf('\nfunction doGet(',begin);
assert.ok(begin>=0 && end>begin,'read dispatcher not found');
const called=[];
const sandbox={assertToken_(token,kind){called.push({token,kind});if(kind==='central'&&token==='COORD_ISOLADO')throw Error('Chave operacional inválida.');},operationList_:p=>[{RCO:p.rcoReportId}],cirvcList_:p=>[{RCO:p.rcoReportId}],serviceEventList_:p=>[{RCO:p.rcoReportId}]};
vm.createContext(sandbox);
vm.runInContext(a.slice(begin,end),sandbox);
for(const action of ['operation-list','cirvc-list','service-event-list']){
  called.length=0;
  const scoped=sandbox.handleApiReadViaGet_(action,{rcoReportId:'cpu-ficticio',token:'COORD_ISOLADO'});
  assert.strictEqual(scoped.ok,true,action);
  assert.strictEqual(called[0].kind,'rco',action+' must use RCO auth for scoped calls');
  called.length=0;
  assert.throws(()=>sandbox.handleApiReadViaGet_(action,{token:'COORD_ISOLADO'}),/Chave operacional inválida/,action+' unscoped must not bypass central auth');
  assert.strictEqual(called[0].kind,'central',action+' unscoped must require central');
}
assert.ok(a.includes('function rcoRowMatchesDraft_'),'RCO row-scope safeguard must be preserved');
for(const fn of ['operationList_','cirvcList_','serviceEventList_']){
  let at=a.indexOf('function '+fn+'('),next=a.indexOf('\nfunction ',at+12);
  assert.ok(at>=0);
  assert.ok(a.slice(at,next>0?next:a.length).includes('rcoRowMatchesDraft_'),fn+' must scope results to canonical RCO');
}
console.log('PASS 3 RCO-scoped linked reads accept coordinator-role path; unscoped reads still require central credential; row scope preserved.');
