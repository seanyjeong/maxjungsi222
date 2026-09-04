'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const dataset = require('../scripts/etoos-september-grade-cuts.json');
const { buildGradeCutRows } = require('../scripts/september-grade-cuts.js');
const {
  backupTableName,
  buildCutsMap,
  buildScoreUpdate,
  summarizeRows,
} = require('../scripts/recompute-september-scores.js');

function currentCuts() {
  return buildGradeCutRows(dataset)
    .filter((row) => row.year === '2027')
    .map((row) => ({
      선택과목명: row.subject,
      원점수: row.raw,
      표준점수: row.standard,
      백분위: row.percentile,
      등급: row.grade,
    }));
}

test('고3과 N수는 9월 최신 선택과목 컷으로 재계산한다', () => {
  const update = buildScoreUpdate({
    student_id: 31,
    grade: '3',
    국어_선택과목: '언어와매체', 국어_원점수: 90,
    수학_선택과목: '미적분', 수학_원점수: 88,
    영어_원점수: 89, 한국사_원점수: 39,
    탐구1_선택과목: '정치와법', 탐구1_원점수: 42,
    탐구2_선택과목: '화학2', 탐구2_원점수: 47,
  }, buildCutsMap(currentCuts()));

  assert.deepEqual(update.korean, { std: 133, pct: 97, grade: 1 });
  assert.deepEqual(update.math, { std: 133, pct: 96, grade: 1 });
  assert.deepEqual(update.inquiry1, { std: 68, pct: 96, grade: 1 });
  assert.deepEqual(update.inquiry2, { std: 70, pct: 96, grade: 1 });
  assert.equal(update.englishGrade, 2);
  assert.equal(update.historyGrade, 2);
});

test('고2는 이전 고3 과목명도 2027 통합 과목으로 정규화한다', () => {
  const update = buildScoreUpdate({
    student_id: 32,
    grade: '2',
    국어_선택과목: '화법과작문', 국어_원점수: 90,
    수학_선택과목: '확률과통계', 수학_원점수: 84,
    영어_원점수: 90, 한국사_원점수: 40,
    탐구1_선택과목: '동아시아사', 탐구1_원점수: 43,
    탐구2_선택과목: '사회문화', 탐구2_원점수: 44,
  }, buildCutsMap(currentCuts()));

  assert.equal(update.koreanSubject, '국어');
  assert.equal(update.mathSubject, '수학');
  assert.equal(update.inquiry1Subject, '통합사회');
  assert.equal(update.inquiry2Subject, '통합과학');
  assert.deepEqual(update.korean, { std: 135, pct: 96, grade: 1 });
});

test('원점수가 있는데 컷이 없으면 성적을 변경하지 않는다', () => {
  assert.throws(() => buildScoreUpdate({
    student_id: 33,
    grade: '3',
    국어_선택과목: '없는과목', 국어_원점수: 50,
  }, buildCutsMap(currentCuts())), /missing grade cuts/);
});

test('미응시와 과목 미지정 원점수는 추측 변환하지 않는다', () => {
  const update = buildScoreUpdate({
    student_id: 34,
    grade: '3',
    국어_선택과목: '미응시', 국어_원점수: 0,
    탐구1_선택과목: null, 탐구1_원점수: 43,
  }, buildCutsMap(currentCuts()));

  assert.equal(update.koreanSubject, '미응시');
  assert.equal(update.korean, null);
  assert.equal(update.inquiry1Subject, null);
  assert.equal(update.inquiry1, null);
  assert.equal(summarizeRows([{
    grade: '3',
    탐구1_선택과목: null,
    탐구1_원점수: 43,
  }]).unmappedRawFields, 1);
});

test('전체 재계산 백업명은 충돌 없는 시각만 허용한다', () => {
  assert.equal(
    backupTableName('20260904_190000'),
    'bak_sep26_all_scores_20260904_190000',
  );
  assert.throws(() => backupTableName('today'));
});
