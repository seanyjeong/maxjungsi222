'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const formatter = require('../utils/admissions-score-format');

function harness(uid = 165, year = 2027, enabled = true) {
  const fields = new Map();
  const node = selector => {
    if (!fields.has(selector)) fields.set(selector, {textContent: '', innerHTML: '', value: '', style: {},
      classList: {remove() {}, add() {}}});
    return fields.get(selector);
  };
  const el = {querySelector: node, querySelectorAll: () => []};
  const feature = {165: 'hufsCsat2027Reviewed', 173: 'pknuCsat2027Reviewed', 174: 'pnuCsat2027Reviewed', 71: 'relativeCsat2027Reviewed'}[uid];
  const student = {student_id: 'synthetic', scores: {}};
  const state = {year: String(year), selectedStudent: student, cards: {가: {deptId: String(uid), el,
    formula: {U_ID: uid, 학년도: year, 기타설정: {[feature]: enabled}, 총점: 1000, 내신: 0}}}};
  let result = '538.123456';
  const window = {api: async () => ({success: true, result: {totalScore: result}}),
    fmt2: value => Number(value).toFixed(2), convertScoresToSuneungFormat: () => ({subjects: []}),
    AdmissionsScoreFormat: formatter};
  vm.runInNewContext(fs.readFileSync(path.join(root, 'final-apply-scoring.js'), 'utf8'), {window, console});
  return {state, window, node, el, scoring: window.createFinalApplyScoring(state), setResult: value => {result = value;}};
}

for (const [uid, year, enabled, expected] of [[165, 2027, true, '538.123456'], [173, 2027, true, '538.1235'],
  [174, 2027, true, '538.1235'], [71, 2027, true, '538.123'], [165, 2026, true, '538.12'],
  [165, 2027, false, '538.12'], [1, 2027, true, '538.12']]) {
  test(`precise state with scoped display ${uid}/${year}/${enabled}`, async () => {
    const h = harness(uid, year, enabled), result = await h.scoring.recalc(h.el, '가');
    assert.equal(result.suneung, 538.123456);
    assert.equal(result.total, 538.123456);
    assert.equal(h.node('.suneung-v').textContent, expected);
    assert.equal(h.node('.total-v').innerHTML, `${expected}<span class="unit">/1000</span>`);
    assert.equal(h.state.cards.가.scoreSnapshot, result);
  });
}

test('invalid CSAT clears the precise state instead of making a saved zero', async () => {
  const h = harness();
  await h.scoring.recalc(h.el, '가');
  h.setResult(null);
  assert.equal(await h.scoring.recalc(h.el, '가'), null);
  assert.equal(h.state.cards.가.scoreSnapshot, null);
  assert.equal(h.node('.suneung-v').textContent, '—');
});

test('a stale response cannot replace the current university calculation', async () => {
  const h = harness();
  let resolve;
  h.window.api = () => new Promise(done => {resolve = done;});
  const pending = h.scoring.recalc(h.el, '가');
  h.state.cards.가.deptId = '173';
  resolve({success: true, result: {totalScore: '538.123456'}});
  assert.equal(await pending, null);
  assert.equal(h.state.cards.가.scoreSnapshot, null);
});
