'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const subject = require('../utils/subjective-practical');
const formula = uid => ({ U_ID: uid, 학년도: 2027, 기타설정: { subjectivePractical2027Reviewed: true } });
function response(uid, scores) {
  const policy = subject.getPolicy(formula(uid));
  return { success: true, result: { totalScore: null, breakdown: { partial: true, objective_complete: true,
    objective_score: scores.reduce((sum, score) => sum + score, 0), objective_max_score: policy.maximum,
    unscored_max_score: policy.unscoredMaximum, validation_errors: [],
    events: policy.events.map((event, i) => ({ event: event.name, score: scores[i] })) } } };
}
test('only explicitly reviewed 2027 Suwon/Sookmyung enable partial scoring', () => {
  for (const uid of [104, 105]) {
    assert.ok(subject.getPolicy(formula(uid)));
    assert.equal(subject.getPolicy({ ...formula(uid), 학년도: 2026 }), null);
    assert.equal(subject.getPolicy({ ...formula(uid), 기타설정: {} }), null);
    assert.equal(subject.getPolicy({ ...formula(uid), 기타설정: '{invalid' }), null);
    assert.ok(subject.getPolicy({ ...formula(uid), 기타설정: JSON.stringify(formula(uid).기타설정) }));
  }
  assert.equal(subject.getPolicy(formula(145)), null);
});
test('Suwon requires both objective events and never submits excluded numeric inputs or selection', () => {
  const f = formula(104), records = [{ event: '제자리멀리뛰기', value: '280' }, { event: '지그재그런', value: '13.6' }];
  assert.equal(subject.prepare(f, '남', records.slice(1)).ready, false);
  assert.equal(subject.prepare(f, '여', [...records, { event: '전공실기', value: '300' }]).records.length, 2);
  assert.equal(subject.prepare(f, '남', [...records, records[0]]).reason, 'invalid');
  for (const value of ['0', '-1', 'NaN', 'F', '실격']) {
    assert.equal(subject.prepare(f, '남', [{ ...records[0], value }, records[1]]).ready, false, value);
  }
});
test('Suwon absence is zero-capable while unsupported precision stays incomplete', () => {
  const f = formula(104), records = [{ event: '제자리멀리뛰기', value: '미응시' }, { event: '지그재그런', value: '12.0' }];
  assert.equal(subject.prepare(f, '여', records).ready, true);
  assert.equal(subject.prepare(f, '여', [records[0], { ...records[1], value: '12.01' }]).ready, false);
  assert.equal(subject.prepare(f, '여', [{ ...records[0], value: '294.5' }, records[1]]).ready, false);
  assert.equal(subject.prepare(f, '여', [{ ...records[0], value: '294.0' }, records[1]]).ready, true);
  const data = response(104, [0, 150]);
  Object.assign(data.result.breakdown, { ineligible: true, absence_status: 'partial' });
  assert.equal(subject.readResult(f, data).score, 150);
  assert.equal(subject.readResult(f, data).ineligible, true);
});
test('Sookmyung distinguishes F (50), absence (0), blank and unsupported heights', () => {
  const f = formula(105), input = value => [{ event: '높이뛰기', value }];
  for (const value of ['110', '110.0', '115', '120', '125', '130', 'f', '미응시']) assert.equal(subject.prepare(f, '여', input(value)).ready, true);
  assert.equal(subject.prepare(f, '여', input('')).reason, 'incomplete');
  for (const value of ['0', '105', '112', 'F50', 'A']) assert.equal(subject.prepare(f, '여', input(value)).reason, 'invalid');
  assert.equal(subject.prepare(f, '남', input('130')).ready, false);
  assert.equal(subject.readResult(f, response(105, [50])).score, 50);
  assert.equal(subject.readResult(f, response(105, [0])).score, 0);
});
test('selection and objective records round trip without subjective score fields', () => {
  const f = formula(104), records = [{ event: '제자리멀리뛰기', value: ' 280 ' }, { event: '전공실기', value: '300' }];
  const saved = JSON.parse(JSON.stringify(subject.serializeRecords(f, records, '축구')));
  assert.deepEqual(saved, { 제자리멀리뛰기: '280', _subjectiveSelection: '축구' });
  assert.equal(subject.selection(f, saved._subjectiveSelection), '축구');
  assert.equal(subject.selection(f, '배구'), '');
  assert.deepEqual(subject.serializeRecords(f, [], ''), { _subjectiveSelection: '' });
});
test('partial response rejects obsolete full scores, missing values and impossible totals', () => {
  const f = formula(104), valid = response(104, [150, 150]);
  assert.equal(subject.readResult(f, valid).score, 300);
  assert.equal(subject.subtotal(200, subject.readResult(f, valid).score), 500);
  assert.equal(subject.subtotal(200, null), null);
  assert.equal(subject.subtotal(200, 0), 200);
  const mutations = [r => r.result.totalScore = 600,
    r => r.result.breakdown.objective_score = null,
    r => r.result.breakdown.objective_score = 299,
    r => r.result.breakdown.objective_max_score = 600,
    r => r.result.breakdown.events[0].score = -1,
    r => r.result.breakdown.objective_complete = false];
  for (const mutate of mutations) {
    const invalid = structuredClone(valid); mutate(invalid);
    assert.throws(() => subject.readResult(f, invalid));
  }
});
test('incomplete API result remains unscored and keeps actionable errors', () => {
  const f = formula(105), data = response(105, [75]);
  Object.assign(data.result.breakdown, { objective_complete: false, objective_score: null,
    validation_errors: [{ event: '높이뛰기', code: 'invalid_record', message: '높이를 확인해 주세요.' }] });
  assert.deepEqual(subject.readResult(f, data).errors, data.result.breakdown.validation_errors);
  assert.equal(subject.readResult(f, data).score, null);
});
