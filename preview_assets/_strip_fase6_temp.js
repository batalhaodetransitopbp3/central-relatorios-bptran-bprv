'use strict';
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'apps_script_v10.gs');
let s = fs.readFileSync(file, 'utf8');
// Remove only the FASE6 else-if arm; keep the preceding handler's closing brace.
const blockRe = / else if \(action === 'audit-rco-active-ab-causal-signature-ro'\) \{\r?\n      \/\/ TEMP-only FASE 6 harness; remover antes do commit\.\r?\n      assertToken_\(p\.token, 'comando'\);\r?\n      out = auditRcoActiveAbCausalSignatureRo_\(\);\r?\n    \}/;
if (!blockRe.test(s)) {
  console.error('ACTION_BLOCK_NOT_FOUND');
  process.exit(1);
}
s = s.replace(blockRe, '');
const needle = " || action === 'audit-rco-active-ab-causal-signature-ro'";
if (s.indexOf(needle) < 0) {
  console.error('ALLOWLIST_NEEDLE_NOT_FOUND');
  process.exit(2);
}
s = s.split(needle).join('');
fs.writeFileSync(file, s);
console.log('FASE6_TEMP_STRIPPED');
