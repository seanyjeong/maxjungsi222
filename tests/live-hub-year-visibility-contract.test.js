const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

function assertYearContract(source, applicantPath) {
  assert.match(source, /value:\s*'2027',\s*label:\s*'2027학년도'/);
  assert.match(source, /value:\s*'2026',\s*label:\s*'2026학년도'/);
  assert.match(source, new RegExp(`${applicantPath}\\/\\$\\{STATE\\.U_ID\\}\\/\\$\\{STATE\\.year\\}`));
  assert.match(source, /\/jungsi\/schools\/\$\{STATE\.year\}/);
}

function assertPrivacyContract(htmlFile, scriptFile) {
  const html = read(htmlFile);
  const source = read(scriptFile);
  assert.match(html, /id="btnPrivacy"/);
  assert.match(html, /id="privacyPasswordModal"/);
  assert.match(html, /<script src="applicant-privacy\.js"><\/script>[\s\S]*<script src="school_app/);
  assert.match(source, /privacy\.visibleApplicant/);
  assert.match(source, /const privacyEnabled = privacy\.isEnabled\(\)/);
  assert.match(source, /!privacyEnabled/);
  assert.doesNotMatch(source, /로드 실패:\s*['"]?\s*\+\s*e\.message/);
}

test('live supports 2026 and 2027 through year-scoped API requests', () => {
  assertYearContract(read('school_app_final.js'), '/jungsi/university-final-applicants');
  assertPrivacyContract('school_app_final.html', 'school_app_final.js');
});

test('consulting hub supports 2026 and 2027 through year-scoped API requests', () => {
  assertYearContract(read('school_app.js'), '/jungsi/university-applicants');
  assertPrivacyContract('school_app.html', 'school_app.js');
});

test('visibility tokens and Windows rendering meet the shared contract', () => {
  const base = read('assets/css/base.css');
  const tokens = read('assets/css/tokens.css');

  assert.match(base, /html\.os-win[\s\S]*font-family:\s*'Pretendard'/);
  assert.match(base, /html\.os-win[\s\S]*text-rendering:\s*auto/);
  assert.match(base, /html\.os-win[\s\S]*letter-spacing:\s*0/);
  assert.match(tokens, /--text-3:\s*#78716c/);
  assert.match(tokens, /\.dark[\s\S]*--text-3:\s*#a8a29e/);
});
