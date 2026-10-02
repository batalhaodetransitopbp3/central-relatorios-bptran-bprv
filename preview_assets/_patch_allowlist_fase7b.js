'use strict';
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'apps_script_v10.gs');
let s = fs.readFileSync(file, 'utf8');
const from = "action === 'audit-rco-quoted-iso-dates-ro' || action === 'version'";
const to = "action === 'audit-rco-quoted-iso-dates-ro' || action === 'audit-rco-selective-date-recovery-causal-apply-serial' || action === 'version'";
const alreadyHandler = /action === 'audit-rco-selective-date-recovery-causal-apply-serial'/.test(s) &&
  /rcoSelectiveDateRecoveryCausalApplySerialFase7b_\(\)/.test(s);
const alreadyAllow = s.indexOf("action === 'audit-rco-selective-date-recovery-causal-apply-serial' || action === 'version'") >= 0;
if (alreadyHandler && alreadyAllow) {
  console.log('ALLOWLIST_ALREADY');
  process.exit(0);
}
if (s.indexOf(from) < 0) {
  console.error('PATTERN_NOT_FOUND');
  process.exit(1);
}
if (!alreadyHandler) {
  const re = /\} else if \(action === 'audit-rco-quoted-iso-dates-ro'\) \{\r?\n\s*assertToken_\(p\.token, 'comando'\);\r?\n\s*out = auditRcoQuotedIsoDatesRo\(\);\r?\n\s*\}/;
  if (!re.test(s)) {
    console.error('ACTION_NEEDLE_NOT_FOUND');
    process.exit(2);
  }
  s = s.replace(re, function (m) {
    var nl = m.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
    return m + ' else if (action === \'audit-rco-selective-date-recovery-causal-apply-serial\') {' + nl +
      '      // TEMP-only FASE 7B harness; remover antes do commit.' + nl +
      '      assertToken_(p.token, \'comando\');' + nl +
      '      out = rcoSelectiveDateRecoveryCausalApplySerialFase7b_();' + nl +
      '    }';
  });
}
if (!alreadyAllow) s = s.replace(from, to);
fs.writeFileSync(file, s);
console.log('ALLOWLIST_PATCHED_FASE7B');
