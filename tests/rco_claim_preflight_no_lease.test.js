'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('node:assert/strict');
const names=['relatorio_cpu.html','relatorio_cpu_ios.html'];
(async()=>{for(const file of names){
 const s=fs.readFileSync(path.resolve(process.argv[2]||path.resolve(__dirname,'..'),file),'utf8'),a=s.indexOf('async function claimRcoDraft('),b=s.indexOf('async function continueRcoCloud()',a);
 const helper=s.indexOf('function rcoClaimScopeFromItem_(');assert(helper>0&&helper<a&&b>a,'scoped RCO claim helper missing');let claims=0,reads=0,mode='absent';const notices=[];
 const ctx={window:{},rcoDeviceId:'fixture-test-device',sessionStorage:{setItem:()=>{}},
 currentUnit:()=>({batalhao:'BPRv',companhia:'1ª CPRv',companhiaNumero:1}),rcoOperationalDate:x=>x,val:()=> '2026-10-17',rcoWorkflowToken:()=> 'TEST_TOKEN',
 CentralCloud:{unitParams:u=>({batalhao:u.batalhao,companhia:u.companhia,companhiaNumero:String((u.companhia||'').match(/\d+/)?.[0]||'')}),jsonp:async()=>{reads++;return {ok:true,rco:{state:{reportId:'rco-test',guarnicoes:{}},auditoria:mode==='erased'?{passagens:[{id:'pass1',slot:1,status:'AGUARDANDO_RECEBIMENTO',reportId:'rco-test'}],snapshots:{cpu1AtPassage:{state:{reportId:'rco-test',guarnicoes:{cpu:{metrics:{total:99}}}}}}}:{passagens:[],snapshots:{}}}}},submitForm:async()=>{claims++;throw Error('claim forbidden during failed read-only preflight')}},
 alert:x=>notices.push(x),confirm:()=>false};
 vm.createContext(ctx);vm.runInContext(s.slice(helper,b),ctx);
 const result=await ctx.claimRcoDraft({reportId:'rco-test',data:'2026-10-17',batalhao:'BPRv',companhia:'1ª CPRv'},false,true,'TEST_TOKEN');
 assert.equal(result,false);assert.equal(claims,0,'invalid handover must not acquire device lease');assert.equal(reads,1,'read-only check must occur before claim');
 assert(notices.some(t=>String(t).includes('RECEBIMENTO BLOQUEADO')));
 mode='erased';const again=await ctx.claimRcoDraft({reportId:'rco-test',data:'2026-10-17',batalhao:'BPRv',companhia:'1ª CPRv'},false,true,'TEST_TOKEN');
 assert.equal(again,false,'erased current RCO with preserved snapshot must not be claimed');assert.equal(claims,0,'no lease when data differ');
 console.log('PASS '+file+' missing RCO history blocked BEFORE claim/lease');
}})().catch(e=>{console.error(e);process.exitCode=1});
