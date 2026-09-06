'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { prepare, resultScore } = require('../utils/practical-input');
const profiles = require('../utils/practical-requirements');
const F = uid => ({ U_ID: uid, 학년도: 2027 });
test('all verified gender-specific profiles reject missing mandatory records', () => {
  for (const [uid, profile] of Object.entries(profiles)) for (const gender of ['남', '여']) {
    const names = profile.genders[gender].filter(name => name !== profile.alternatives?.rain);
    if (!names.length) continue;
    const records = names.map(event => ({ event, value: '1' }));
    assert.equal(prepare(F(uid), gender, records).ready, true, uid + '/' + gender);
    assert.equal(prepare(F(uid), gender, records.slice(1)).ready, false, uid + '/' + gender);
  }
});
test('rain alternative replaces normal running, not both', () => {
  const profile = profiles[119], names = profile.genders.남;
  const records = names.map(event => ({ event, value: '1' }));
  assert.equal(prepare(F(119), '남', records).reason, 'alternative');
  assert.equal(prepare(F(119), '남', records.filter(row => row.event !== profile.alternatives.normal)).ready, true);
});
test('zero, letter grades and absence keywords are not missing input', () => {
  for (const value of ['0', 0, 'F', 'G', '미응시', '파울', '실격']) {
    const records = profiles[43].genders.남.map(event => ({ event, value }));
    assert.equal(prepare(F(43), '남', records).ready, true, String(value));
  }
});
test('female gymnastics do not require male gymnastics records', () => {
  const records = profiles[8].genders.여.map(event => ({ event, value: 'A' }));
  assert.equal(prepare(F(8), '여', records).ready, true);
  assert.ok(!prepare(F(8), '여', records).names.includes('핸스착지'));
});
test('duplicate inputs and malformed numeric records are rejected', () => {
  const records = profiles[43].genders.남.map(event => ({ event, value: '1' }));
  assert.equal(prepare(F(43), '남', [...records, records[0]]).reason, 'invalid');
  records[0].value = 'NaN';
  assert.equal(prepare(F(43), '남', records).reason, 'invalid');
});
test('API contract accepts real zero, rejects absent/nonfinite success scores', () => {
  assert.equal(resultScore({ success: true, result: { totalScore: '0.000' } }), 0);
  for (const value of [null, undefined, '', 'NaN', 'Infinity']) {
    assert.throws(() => resultScore({ success: true, result: { totalScore: value } }));
  }
});
test('edited event names use current table instead of forcing stale source names', () => {
  const formula = { ...F(43), 실기배점: [{ 종목명: '수정한멀리뛰기', 성별: '남' }] };
  const result = prepare(formula, '남', [{ event: '수정한멀리뛰기', value: '280' }]);
  assert.equal(result.ready, true);
  assert.equal(result.profiled, false);
});
