'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const dir=path.resolve(__dirname,'..');
for(const f of ['relatorio_cpu.html','relatorio_cpu_ios.html']){
 const html=fs.readFileSync(path.join(dir,f),'utf8');
 assert.match(html, /class="field span12 rco-occurrences-block"/);
 const style=html.match(/<style id="central-rco-print-readability-20261016">([\s\S]*?)<\/style>/);
 assert.ok(style,'missing scoped print CSS');
 for(const pattern of [
  /\.gu-compact-grid\s*>\s*\.rco-occurrences-block/,/grid-column:\s*1\s*\/\s*-1\s*!important/,
  /\.gu-occ-print\s*\{[\s\S]*?width:\s*100%/,
  /\.gu-occ-print\s+thead\s*\{display:table-header-group/,
  /\.gu-occ-print\s+tbody\s+tr\s*\{break-inside:avoid-page/,
  /\.gu-occ-print\s+td/,/font-size:calc\(6\.8px\s*\+\s*2pt\)/,
  /\.gu-compact-grid\s+\.print-value/,/font-size:calc\(7\.5px\s*\+\s*2pt\)/,
  /\.stats-block\s+\.entry\s*\{break-inside:auto/,
  /\.print-matrix-chunk\s+tbody\s+td:nth-child\(n\+3\)/
 ])assert.match(style[1],pattern,'print layout contract failed '+f+': '+pattern);
 const scripts=Array.from(html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi));
 let parsed=0;
 for(const m of scripts){if(m[1].includes('src=')||m[1].includes('application/json')||!m[2].trim())continue;new vm.Script(m[2],{filename:f});parsed++}
 assert.ok(parsed>0);
 console.log('PASS '+f+' print CSS, full-width occurrences, +2pt and JS parsing');
}
