'use strict';
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'apps_script_v10.gs');
let s = fs.readFileSync(file, 'utf8');
// Remove only the FASE7A else-if arm; keep preceding handler's closing brace.
const blockRe = / else if \(action === 'audit-rco-selective-date-recovery-causal-apply-pilot'\) \{\r?\n      \/\/ TEMP-only FASE 7A harness; remover antes do commit\.\r?\n      assertToken_\(p\.token, 'comando'\);\r?\n      out = rcoSelectiveDateRecoveryCausalApplyPilotFase7a_\(\);\r?\n    \}/;
if (!blockRe.test(s)) {
  console.error('ACTION_BLOCK_NOT_FOUND');
  process.exit(1);
}
s = s.replace(blockRe, '');
const needle = " || action === 'audit-rco-selective-date-recovery-causal-apply-pilot'";
if (s.indexOf(needle) < 0) {
  console.error('ALLOWLIST_NEEDLE_NOT_FOUND');
  process.exit(2);
}
s = s.split(needle).join('');
fs.writeFileSync(file, s);
console.log('FASE7A_TEMP_STRIPPED');
