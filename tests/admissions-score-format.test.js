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

test('Keimyung retains the fourth decimal in cards and PDF only for its reviewed 2027 formula', () => {
  const fs = require('node:fs'), vm = require('node:vm'), scope = {};
  const formula = {U_ID: 195, 학년도: 2027, 기타설정: '{"keimyung2027UnitNormalized":true}'};
  assert.equal(format(85.625, formula), '85.6250');
  assert.equal(format(84.625, {...formula, 학년도: 2026}), '84.63');
  assert.equal(format(84.625, {...formula, 기타설정: null}), '84.63');
  vm.runInNewContext(fs.readFileSync(require.resolve('../counsel/pdf-1'), 'utf8'), scope);
  const html = scope.pdfRenderCard({records: [], suneung: 85.625, total: 85.625, scoreDigits: 4}, 0);
  assert(html.includes('85.6250'));
});
test('browser score configuration loads before the formatter on both calculation pages', () => {
  const fs = require('node:fs'), path = require('node:path');
  for (const entry of ['counsel.html', 'calculator.html']) {
    const html = fs.readFileSync(path.join(__dirname, '..', entry), 'utf8');
    assert(html.indexOf('config/admissions-score-format.js') >= 0);
    assert(html.indexOf('config/admissions-score-format.js') < html.indexOf('utils/admissions-score-format.js'));
  }
});

test('Hufs, Pukyong and Pusan scores keep reviewed precision through cards and PDF', () => {
  const fs = require('node:fs'), vm = require('node:vm'), scope = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('../counsel/pdf-1'), 'utf8'), scope);
  for (const [uid, feature, value, expected, digits] of [
    [165, 'hufsCsat2027Reviewed', 883.73145, '883.731450', 6],
    [166, 'hufsCsat2027Reviewed', 887.5886, '887.588600', 6],
    [167, 'hufsCsat2027Reviewed', 887.5886, '887.588600', 6],
    [173, 'pknuCsat2027Reviewed', 420.55, '420.5500', 4],
    [174, 'pnuCsat2027Reviewed', 565.3528, '565.3528', 4],
  ]) {
    const formula = {U_ID: uid, 학년도: 2027, 기타설정: {[feature]: true}};
    assert.equal(format(value, formula), expected);
    assert.equal(format(value, {...formula, 학년도: 2026}), value.toFixed(2));
    assert.equal(format(value, {...formula, 기타설정: {}}), value.toFixed(2));
    assert(scope.pdfRenderCard({records: [], suneung: value, total: value, scoreDigits: digits}, 0).includes(expected));
  }
});
