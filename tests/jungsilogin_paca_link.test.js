const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'jungsilogin.html'), 'utf8');

assert(source.includes("urlParams.get('paca_link_state')"), 'PACA link state param should be read');
assert(source.includes("urlParams.get('paca_link_callback')"), 'PACA link callback param should be read');
assert(source.includes('function isAllowedPacaCallback'), 'PACA callback allowlist guard should exist');
assert(source.includes("'https://supermax.kr'"), 'supermax PACA origin should be allowed');
assert(source.includes("'https://chejump.com'"), 'production PACA origin should be allowed');
assert(source.includes("'https://dev-paca.sean8320.dedyn.io'"), 'dev PACA origin should be allowed');
assert(source.includes("url.pathname.endsWith('/paca/jungsi/link/callback')"), 'callback path should be restricted');
assert(source.includes("source: PACA_LINK_SOURCE"), 'PACA parent window should receive a link result message');
assert(source.includes("status: 'success'"), 'PACA parent window message should include success status');
assert(source.includes('state: pacaLinkState'), 'PACA parent window message should echo the link state');
assert(source.includes('window.close()'), 'PACA link popup should close after success');
assert(source.includes('PACA에 정상적으로 연동되었습니다'), 'success copy should be Korean');
assert(source.includes('PACA에서 다시 시도해주세요'), 'failure copy should be Korean');
assert(!source.includes('HTTP 500'), 'technical status codes should not be shown in copy');
assert(!source.includes('CORS'), 'technical browser error terms should not be shown in copy');

console.log('jungsilogin PACA link tests passed');
