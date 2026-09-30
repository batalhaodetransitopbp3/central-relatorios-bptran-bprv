'use strict';
/**
 * Simulação somente leitura do filtro RCO sobre auditoria_dados/RSD.csv.
 * Não altera CSVs nem dados de produção.
 */
const fs = require('fs');
const path = require('path');
const G = require('../rco_scope_guard.js');

const csvPath = path.join(__dirname, '..', 'auditoria_dados', 'RSD.csv');
if (!fs.existsSync(csvPath)) {
  console.error('CSV não encontrado:', csvPath);
  process.exit(1);
}

function parseCsv(text) {
  const rows = [];
  let i = 0, field = '', row = [], inQ = false;
  while (i < text.length) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQ = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQ = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(x => String(x).trim() !== '')) rows.push(row);
      row = []; i++; continue;
    }
    field += c; i++;
  }
  if (field.length || row.length) { row.push(field); if (row.some(x => String(x).trim() !== '')) rows.push(row); }
  return rows;
}

const raw = fs.readFileSync(csvPath, 'utf8');
const table = parseCsv(raw);
const headers = table[0].map(h => String(h || '').trim());
const idx = Object.fromEntries(headers.map((h, i) => [h, i]));
function cell(r, name) { const i = idx[name]; return i == null ? '' : r[i]; }

const records = table.slice(1).map(r => ({
  REPORT_ID: cell(r, 'REPORT_ID'),
  BATALHAO: String(cell(r, 'BATALHAO') || '').replace(/^"+|"+$/g, '').trim(),
  COMPANHIA: String(cell(r, 'COMPANHIA') || '').replace(/^"+|"+$/g, '').trim(),
  DATA_SERVICO: G.dateText(cell(r, 'DATA_SERVICO')),
  INICIADO_EM: cell(r, 'INICIADO_EM'),
  STATUS: cell(r, 'STATUS'),
  GUARNICAO: cell(r, 'GUARNICAO')
})).filter(x => x.REPORT_ID);

console.log('Total RSDs no CSV:', records.length);

const byDate = {};
records.forEach(x => {
  const d = x.DATA_SERVICO || G.operationalDateOf(x, (v) => G.dateText(v)) || '(vazio)';
  byDate[d] = (byDate[d] || 0) + 1;
});
console.log('\nDatas com mais RSDs:');
Object.keys(byDate).sort((a, b) => byDate[b] - byDate[a]).slice(0, 12).forEach(d => console.log(' ', byDate[d], '\t', d));

console.log('\nContagem global por BATALHÃO + COMPANHIA:');
const globalCounts = {};
records.forEach(x => {
  const u = G.sheetUnitCanon(x);
  const key = u.valid ? (u.batalhao + ' | ' + u.companhia) : ('INVALID/' + (u.reason || '?') + ' | raw=' + x.BATALHAO + '/' + x.COMPANHIA);
  globalCounts[key] = (globalCounts[key] || 0) + 1;
});
Object.keys(globalCounts).sort().forEach(k => console.log(' ', globalCounts[k], '\t', k));

function analyzeDate(TARGET) {
  const onDate = records.filter(x => {
    const op = G.operationalDateOf(x, (d) => G.dateText(d));
    return op === TARGET || x.DATA_SERVICO === TARGET;
  });
  console.log('\n=== Data', TARGET, '| RSDs:', onDate.length, '===');
  const counts = {};
  onDate.forEach(x => {
    const u = G.sheetUnitCanon(x);
    const key = u.valid ? (u.batalhao + ' | ' + u.companhia) : ('INVALID/' + (u.reason || '?') + ' | raw=' + x.BATALHAO + '/' + x.COMPANHIA);
    counts[key] = (counts[key] || 0) + 1;
  });
  Object.keys(counts).sort().forEach(k => console.log(' ', counts[k], '\t', k));

  const scopes = [
    { batalhao: 'BPTran', companhia: '1ª CPTran' },
    { batalhao: 'BPTran', companhia: '2ª CPTran' },
    { batalhao: 'BPRv', companhia: '1ª CPRv' },
    { batalhao: 'BPRv', companhia: '4ª CPRv' }
  ];
  console.log('Simulação filtro RCO:');
  scopes.forEach(s => {
    const r = G.filterRowsForRco(onDate, s, TARGET, (d) => G.dateText(d));
    const foreign = r.rejected.filter(x => x.reason === 'OTHER_UNIT').length;
    const missing = r.rejected.filter(x => x.reason === 'MISSING_UNIT' || x.reason === 'INVALID_COMPANY' || x.reason === 'UNIT_TYPE_MISMATCH').length;
    console.log('  RCO', s.batalhao, s.companhia, '→', r.items.length, 'RSD(s); OTHER_UNIT=', foreign, 'INVALID/MISSING=', missing);
    if (s.batalhao === 'BPTran' && s.companhia === '1ª CPTran') {
      const leak = r.items.filter(x => /CPRv/i.test(x.COMPANHIA) || /BPRv/i.test(x.BATALHAO));
      console.log('    anti-vazamento BPRv/CPRv no RCO 1ª CPTran:', leak.length === 0 ? 'OK (0)' : 'FALHA ' + leak.length);
    }
  });
  return Object.keys(counts).length;
}

let densest = '2026-09-30', densestUnits = -1;
Object.keys(byDate).forEach(d => {
  if (d === '(vazio)') return;
  const units = new Set();
  records.filter(x => x.DATA_SERVICO === d).forEach(x => {
    const u = G.sheetUnitCanon(x);
    if (u.valid) units.add(u.batalhao + '|' + u.companhia);
  });
  if (units.size > densestUnits) { densestUnits = units.size; densest = d; }
});
analyzeDate('2026-09-30');
if (densest !== '2026-09-30') analyzeDate(densest);
