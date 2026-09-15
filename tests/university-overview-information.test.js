'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const information = require('../university-overview/information');
const subjective = require('../utils/subjective-practical');

test('partial practical totals retain nominal full total and separately identify unscored points', () => {
  const model = information.build({ U_ID: 105, 학년도: 2027, 총점: 1000, 실기총점: 400,
    기타설정: { subjectivePractical2027Reviewed: true } }, subjective);
  assert.deepEqual(model.items.map(item => item.value), ['1000점', '400점', '높이뛰기 75점', '325점 · 계산 제외']);
  assert(model.notes.some(note => note.includes('축구·농구·배구·핸드볼')));
  assert(model.notes.some(note => note.includes('최종총점·순위는 산출하지 않습니다')));
});

test('review notes and partial policies never leak into another admission year', () => {
  const catalog = { year: 2027, schools: { 105: { status: '객관실기' } } };
  assert.equal(information.getReview(catalog, 105, 2026), null);
  assert.equal(information.getReview(catalog, '105', '2027').status, '객관실기');
  const model = information.build({ U_ID: 105, 학년도: 2026, 기타설정: { subjectivePractical2027Reviewed: true } }, subjective);
  assert.equal(model.items.length, 0);
});

test('grade tables preserve zero penalties while omitting missing or malformed values', () => {
  assert.deepEqual(information.gradeRows(JSON.stringify({ 1: '0', 2: null, 3: '', 4: '-2', 5: false, 10: 100 })),
    [{ grade: 1, score: 0 }, { grade: 4, score: -2 }]);
});

test('selection summaries distinguish ranked weighting from choosing a subject count', () => {
  assert.equal(information.selectionSummary({ selection_rules: { type: 'select_n', from: ['수학', '탐구'], count: 1 } }),
    '수학·탐구 중 상위 1개 영역 선택');
  assert.equal(information.selectionSummary({ selection_rules: { type: 'select_ranked_weights', from: ['국어', '수학', '영어'], weights: [.4, .4] } }),
    '국어·수학·영어 중 상위 2개 영역을 40%·40% 반영');
});

test('an unresolved total unit is withheld and a fixed inquiry denominator remains visible', () => {
  const model = information.build({ 총점: 1000, 실기총점: 0,
    score_config: { inquiry: { fixed_subject_count: 2 } } }, subjective, { withholdTotal: true });
  assert.deepEqual(model.items, [{ label: '전형 총점', value: '환산 단위 확인 중' }]);
  assert(model.notes.includes('탐구는 2과목 합을 2로 나누어 반영합니다.'));
});

test('golf avoids an overall specialty selector and Seoul explains the withheld total',()=>{
 const golf=information.build({U_ID:131,학년도:2027,총점:1000,실기총점:700,기타설정:{subjectivePractical2027Reviewed:true}},subjective);
 assert(golf.items.some(row=>row.value==='골프 객관평가 360점'));
 assert(!golf.notes.some(note=>note.includes('중 선택')));
 const snu=information.build({총점:1000,실기총점:200},subjective,{withholdTotal:true,withholdReason:'2단계 환산 대기',practicalDisplay:'원점수 100점 → 최종 20점'});
 assert.deepEqual(snu.items.map(row=>row.value),['2단계 환산 대기','원점수 100점 → 최종 20점']);
});

test('annual inquiry notices preserve review status after the missing configurations are repaired', () => {
  const original = {status: '확인한 실기', summary: '객관평가만 계산', practicalFollowUp: false};
  const catalog = {year: 2027, schools: {105: original}};
  const reviewed = information.getReview(catalog, 105, 2027);
  assert.equal(reviewed.status, original.status);
  assert.equal(reviewed.practicalFollowUp, false);
  assert.equal(original.inquiryFollowUp, undefined);
  assert.match(reviewed.inquiryFollowUp.current, /기존 탐구변환표/);
  assert.equal(reviewed.inquiryFollowUp.needsReview, false);
  for (const uid of [81, 174, 165, 166, 167]) {
    const review = information.getReview(catalog, uid, 2027);
    assert.equal(review.inquiryFollowUp.needsReview, false);
    assert.doesNotMatch(review.inquiryFollowUp.current, /현재는 (표준점수|백분위)로/);
    assert.equal(review.kind, 'follow-up');
  }
  assert.match(information.getReview(catalog, 81, 2027).inquiryFollowUp.current, /세종캠퍼스/);
  assert.match(information.getReview(catalog, 174, 2027).inquiryFollowUp.current, /2026.*공식 정정표.*4자리/);
  assert.equal(information.getReview(catalog, 174, 2027).inquiryFollowUp.provenance, '');
  assert.match(information.getReview(catalog, 23, 2027).inquiryFollowUp.provenance, /출처·연도/);
  assert.equal(information.getReview(catalog, 131, 2027), null);
  assert.equal(information.getReview(catalog, 105, 2026), null);
});

test('all 32 published follow-up targets have notices, without declaring their formulas reviewed', () => {
  const catalog = {year: 2027, schools: {}};
  const expected = [3,4,5,6,13,19,22,23,67,68,71,77,78,79,80,81,105,114,116,117,119,120,128,134,158,159,165,166,167,174,182,183];
  const actual = Array.from({length: 205}, (_, id) => id).filter(id => information.getReview(catalog, id, 2027));
  assert.deepEqual(actual, expected);
  for (const id of actual) assert.equal(information.getReview(catalog, id, 2027).kind, 'follow-up');
});
