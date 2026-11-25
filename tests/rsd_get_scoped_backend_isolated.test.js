'use strict';
/** Uses real Apps Script rsdGetScoped_ + unit/date helpers with an in-memory RSD row only.
 * Does not call Sheets, network, Apps Script, or user operational data.
 */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync(path.join(__dirname,'..','apps_script_v10.gs'),'utf8');
function extract(from,to){
 const a=src.indexOf(from),b=src.indexOf(to,a+from.length);
 assert.ok(a>=0&&b>a,'missing backend anchor '+from);return src.slice(a,b);
}
const source=[
 extract('function normBattalion_(v)','function rsdResolveStructuralIdentity_('),
 extract('function dateText_(v)', '/** Aceita somente YYYY-MM-DD'),
 extract('function rsdGetScoped_(p)','function comandoRsdPatch_(')
].join('\n');
const fixture={REPORT_ID:'sd-fixture',BATALHAO:'BPRv',COMPANHIA:'1ª CPRv',DATA_SERVICO:'2026-10-15',INICIADO_EM:'2026-10-16T03:00:00Z',PAYLOAD_JSON:'{"servico":{"data":"2026-10-15"}}'};
let reads=0;
const box={
 P3_SHEET_ID:'P3_TESTE_SEM_CONEXAO',sheet_:()=>({}),findOne_:(_,k,id)=>id==='sd-fixture'?fixture:null,
 rsdGet_:id=>{reads++;return {reportId:id,unidade:{batalhao:fixture.BATALHAO,companhia:fixture.COMPANHIA}};},
 inlineServicoDataYmd_:payload=>JSON.parse(payload||'{}')?.servico?.data||'',
 resolveExistingOperationalDate_:(date,start,explicit)=>String(date||explicit||'').slice(0,10),
 isScriptTokenKind_:(token,kind)=>kind==='central'?token==='TOKEN_RSD_TESTE':kind==='comando'&&token==='TOKEN_SISTEMA_TESTE',
 Utilities:{formatDate:()=>''},scriptTz_:()=> 'America/Fortaleza'
};
vm.createContext(box);vm.runInContext(source,box,{filename:'scoped_backend_fixture'});
function check(label,p,allow,pattern){
 const before=reads;let got;
 try{got=box.rsdGetScoped_({reportId:'sd-fixture',token:'TOKEN_RCO_TESTE',...p})}
 catch(e){if(allow)throw new Error(label+': unexpected '+e.message);assert.match(String(e.message),pattern,label)}
 if(allow){assert.equal(got.reportId,'sd-fixture');assert.equal(reads,before+1,label+' must read exactly once')}
 else assert.equal(reads,before,label+' must not expose original payload');
 console.log('PASS '+label);
}
const unit={batalhao:'BPRv',companhia:'1ª CPRv',data:'2026-10-15'};
check('same company and same 07h-07h operational period',unit,true);
check('same numbered company, wrong battalion', {...unit,batalhao:'BPTran',companhia:'1ª CPTran'},false,/OUT_OF_RCO_SCOPE/);
check('other company, same battalion', {...unit,companhia:'2ª CPRv'},false,/OUT_OF_RCO_SCOPE/);
check('wrong CPTran label on BPRv', {...unit,companhia:'1ª CPTran'},false,/MISSING_UNIT_SCOPE/);
check('different previous operational date', {...unit,data:'2026-10-14'},false,/OUT_OF_RCO_SCOPE/);
check('different subsequent operational date', {...unit,data:'2026-10-16'},false,/OUT_OF_RCO_SCOPE/);
check('scope absent', {data:'2026-10-15'},false,/MISSING_UNIT_SCOPE/);
check('date absent', {batalhao:'BPRv',companhia:'1ª CPRv'},false,/MISSING_OPERATIONAL_DATE/);
check('invalid battalion', {...unit,batalhao:'XYZ'},false,/MISSING_UNIT_SCOPE/);
const original={...fixture};fixture.DATA_SERVICO='';fixture.INICIADO_EM='';fixture.PAYLOAD_JSON='';
check('historical row without resolvable operational date',unit,false,/LEGACY_DATE_CORRUPTION/);
Object.assign(fixture,original);
check('administrative bypass cannot use ordinary RCO token',{module:'SISTEMA'},false,/MISSING_UNIT_SCOPE/);
check('operational RSD bypass cannot use ordinary RCO token',{module:'RSD'},false,/MISSING_UNIT_SCOPE/);
check('authorized operational RSD lookup',{module:'RSD',token:'TOKEN_RSD_TESTE'},true);
check('authorized Sistema lookup',{module:'SISTEMA',token:'TOKEN_SISTEMA_TESTE'},true);
console.log('PASS real backend rsdGetScoped_: 14 scoped tests, no Google Sheets access');
