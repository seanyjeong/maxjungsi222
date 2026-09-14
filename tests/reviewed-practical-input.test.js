'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const input = require('../utils/practical-input');
const reviewed = require('../utils/reviewed-practical-input');
const config = require('../config/reviewed-practical-2027');
const formula = uid => ({U_ID: uid, 학년도: 2027, 기타설정: {[config.feature]: true}});
const rows = (uid, values) => config.profiles[uid].events.map((event, index) => ({event, value: String(values[index])}));

test('reviewed schools require every event and reject invalid measured records before requesting a score', () => {
  for (const uid of Object.keys(config.profiles)) {
    const records = rows(uid, [300, 30, 30]);
    assert.equal(input.prepare(formula(uid), '남', records.slice(1)).ready, false);
    assert.equal(input.prepare(formula(uid), '남', records.concat(records[0])).ready, false);
    assert.equal(input.prepare(formula(uid), '남', records.concat({event: 'unknown', value: '10'})).ready, false);
    assert.equal(input.prepare(formula(uid), '남', records.map(row => ({...row, value: '-1'}))).ready, false);
    assert.equal(input.prepare(formula(uid), '미상', records).ready, false);
    const absence = records.map((row, index) => index ? row : {...row, value: '미응시'});
    assert.equal(input.prepare(formula(uid), '남', absence).reason, 'absent');
  }
});

test('measurement rules preserve exact time boundaries and final-failure meanings', () => {
  const wonkwang = input.prepare(formula(25), '남', rows(25, [32.099, 26, 158.9]));
  assert.equal(wonkwang.ready, true);
  assert.deepEqual(wonkwang.records.map(row => row.value), ['32.0', '26', '158']);
  for (const token of ['F', '파울', '실격', '26.5']) {
    assert.equal(input.prepare(formula(25), '남', rows(25, [32, token, 158])).ready, false);
  }
  assert.equal(input.prepare(formula(25), '남', rows(25, ['실격', 41, 158])).ready, true);
  assert.equal(input.prepare(formula(31), '남', rows(31, [68, 270, '실격'])).ready, true);
  assert.equal(input.prepare(formula(31), '남', rows(31, ['F', 270, 14.2])).ready, false);
  assert.equal(input.prepare(formula(102), '남', rows(102, ['실격', 12, 13.4])).ready, true);
  assert.equal(input.prepare(formula(102), '남', rows(102, ['F', 12, 13.4])).ready, false);
  assert.equal(input.prepare(formula(70), '남', rows(70, [285, 8.01, 11])).records[1].value, '8.01');
  assert.equal(input.prepare(formula(70), '남', rows(70, [285, 8.019, 11])).reason, 'precision');
});

test('only source-ambiguous records are marked provisional after the complete Sejong HWP is verified', () => {
  const note = (uid, gender, event, record, score) => reviewed.notices(formula(uid), gender, [{event, record, score}]);
  assert.deepEqual(note(111, '남', '제자리멀리뛰기', '261', 54), ['yongin']);
  assert.deepEqual(note(111, '남', '제자리멀리뛰기', '269', 61), []);
  assert.deepEqual(note(25, '여', '배구언더오버(1분)', '24', 87), ['wonkwang']);
  assert.deepEqual(note(102, '남', '제자리멀리뛰기', '255', 45), []);
  assert.deepEqual(note(102, '남', '메디신볼던지기', '9.0', 25), []);
  assert.deepEqual(note(102, '남', '메디신볼던지기', '8.9', 25), ['sejong']);
  assert.deepEqual(note(70, '여', '메디신볼던지기', '2.29', 30), ['hoseo']);
  assert.deepEqual(note(70, '여', '메디신볼던지기', 'F', 0), []);
  assert.equal(input.resultNotice({breakdown: {counseling_policy_notes: ['sejong', '<script>']}}), config.notices.sejong);
});

test('historical and unreviewed formulas retain their existing input contract', () => {
  assert.equal(reviewed.prepare({...formula(111), 학년도: 2026}, '남', []), null);
  assert.equal(reviewed.prepare({...formula(111), 기타설정: {}}, '남', []), null);
  assert.equal(reviewed.prepare(formula(155), '남', []), null);
});
