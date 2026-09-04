const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const results = require('../assets/js/pages/counsel-previous-results.js');

function applicant(overrides = {}) {
  return {
    name: '홍길동',
    branch: '일산',
    gender: '남',
    scores: { suneung: 510, naeshin: 0, practical: 330, total: 840 },
    practicalRecords: { 제자리멀리뛰기: '280', 메디신볼던지기: '12' },
    practicalDetail: {
      events: [
        { event: '제자리멀리뛰기', record: '280', score: 95, deduction_level: 1 },
      ],
    },
    result: { first: '최초합', final: '최종합' },
    ...overrides,
  };
}

test('previousAcademicYear returns the immediately preceding admission year', () => {
  assert.equal(results.previousAcademicYear('2027'), 2026);
  assert.equal(results.previousAcademicYear('invalid'), null);
});

test('selectAcceptedApplicants excludes stage-one, waitlisted, failed, and undecided rows', () => {
  const selected = results.selectAcceptedApplicants([
    applicant({ name: '최종', scores: { total: 800 }, result: { final: '최종합' } }),
    applicant({ name: '추가', scores: { total: 820 }, result: { final: '추가합격' } }),
    applicant({ name: '최초', scores: { total: 810 }, result: { first: '최초합', final: '미정' } }),
    applicant({ name: '일단계', result: { stage1: '합격' } }),
    applicant({ name: '예비', result: { first: '예비 3번' } }),
    applicant({ name: '불합', result: { first: '최초합', final: '불합격' } }),
    applicant({ name: '미정', result: {} }),
  ]);

  assert.deepEqual(selected.map((item) => item.name), ['추가', '최초', '최종']);
  assert.deepEqual(selected.map((item) => item.acceptedLabel), ['추가합격', '최초합', '최종합']);
});

test('normalizePracticalEvents merges detailed scores with raw-only event records', () => {
  assert.deepEqual(results.normalizePracticalEvents(applicant()), [
    {
      event: '제자리멀리뛰기',
      record: '280',
      score: 95,
      deductionLevel: 1,
    },
    {
      event: '메디신볼던지기',
      record: '12',
      score: null,
      deductionLevel: null,
    },
  ]);
});

test('buildResultsPath requests named applicants without widening the branch scope', () => {
  const path = results.buildResultsPath('119/unsafe', 2026);

  assert.match(path, /^\/jungsi\/analysis\/max-live-results\?/);
  assert.match(path, /U_ID=119%2Funsafe/);
  assert.match(path, /year=2026/);
  assert.match(path, /includeApplicants=1/);
  assert.match(path, /includeApplicantNames=1/);
  assert.doesNotMatch(path, /includeAllBranches/);
});

test('technical failures are replaced with a Korean plain-language message', () => {
  assert.match(results.LOAD_ERROR_MESSAGE, /불러오지 못했습니다/);
  assert.doesNotMatch(results.LOAD_ERROR_MESSAGE, /HTTP|CORS|stack|Error|500/);
});

test('page asset registry loads the counsel feature without editing the legacy page', () => {
  const registry = require('../assets/js/page-modules.js');
  const bootstrap = fs.readFileSync(path.join(__dirname, '../assets/js/bootstrap.js'), 'utf8');

  assert.deepEqual(registry.counsel.styles, ['assets/css/pages/counsel-previous-results.css']);
  assert.deepEqual(registry.counsel.scripts, ['assets/js/pages/counsel-previous-results.js']);
  assert.match(bootstrap, /assets\/js\/page-modules\.js/);
  assert.match(bootstrap, /loadPageAssets/);
});
