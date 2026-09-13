'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const {format} = require('../utils/admissions-score-format');
test('Konkuk keeps the third decimal for subsequent total calculation', () => {
  const formula = {U_ID: 71, 학년도: 2027, 기타설정: '{"relativeCsat2027Reviewed":true}'};
  assert.equal(format(434.238, formula), '434.238');
  assert.equal(format(Number(format(434.238, formula)) + 300, formula), '734.238');
  assert.equal(format(434.238, {...formula, 학년도: 2026}), '434.24');
  assert.equal(format(434.238, {...formula, U_ID: 131}), '434.24');
  assert.equal(format(434.238, {...formula, 기타설정: null}), '434.24');
});
test('PDF card rendering retains the same CSAT precision as the counselling card', () => {
  const fs = require('node:fs'), vm = require('node:vm'), scope = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('../counsel/pdf-1'), 'utf8'), scope);
  const card = {records: [], suneung: 434.238, total: 734.238, scoreDigits: 3};
  const html = scope.pdfRenderCard(card, 0);
  assert(html.includes('434.238'));
  assert(html.includes('734.238'));
});
test('relative practicals and unpublished Incheon tables have distinct follow-up states', () => {
  const fs = require('node:fs'), vm = require('node:vm'), scope = {window:{}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../university-overview/review-notes'), 'utf8'), scope);
  const schools = scope.window.UniversityReviewNotes.schools;
  for (const uid of [114, 71, 143]) {
    assert.equal(schools[uid].practicalEvaluation, 'relative');
    assert.equal(schools[uid].practicalFollowUp, false);
  }
  for (const uid of [27, 28, 29]) {
    assert.equal(schools[uid].practicalEvaluation, 'publication-pending');
    assert.equal(schools[uid].practicalFollowUp, true);
  }
});
