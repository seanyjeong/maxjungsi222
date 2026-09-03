'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const dataset = require('../scripts/etoos-september-grade-cuts.json');
const { buildGradeCutRows } = require('../scripts/september-grade-cuts.js');
const {
  backupTableName,
  buildCutsMap,
  buildScoreUpdate,
  inspectTarget,
  normalizeSubject,
} = require('../scripts/migrate-high2-september-scores.js');

function high2Cuts() {
  return buildGradeCutRows(dataset)
    .filter((row) => row.year === '2027')
    .filter((row) => ['국어', '수학', '통합사회', '통합과학'].includes(row.subject))
    .map((row) => ({
      선택과목명: row.subject,
      원점수: row.raw,
      표준점수: row.standard,
      백분위: row.percentile,
      등급: row.grade,
    }));
}

test('고2 과목 별칭을 2027 통합 과목명으로 정규화한다', () => {
  assert.equal(normalizeSubject('통합국어', 'korean'), '국어');
  assert.equal(normalizeSubject('통합수학', 'math'), '수학');
  assert.equal(normalizeSubject('', 'inquiry1'), '통합사회');
  assert.equal(normalizeSubject(null, 'inquiry2'), '통합과학');
  assert.throws(() => normalizeSubject('사회문화', 'inquiry1'), /unsupported high2 subject/);
});

test('2027에 저장된 고2 원점수를 고2 이투스 표로 변환한다', () => {
  const update = buildScoreUpdate({
    student_id: 7,
    국어_선택과목: '통합국어', 국어_원점수: 90,
    수학_선택과목: '통합수학', 수학_원점수: 84,
    영어_원점수: 89, 한국사_원점수: 39,
    탐구1_선택과목: '통합사회', 탐구1_원점수: 43,
    탐구2_선택과목: '통합과학', 탐구2_원점수: 44,
  }, buildCutsMap(high2Cuts()));

  assert.equal(update.studentId, 7);
  assert.equal(update.koreanSubject, '국어');
  assert.deepEqual(update.korean, { std: 135, pct: 96, grade: 1 });
  assert.equal(update.mathSubject, '수학');
  assert.equal(update.math.grade, 1);
  assert.equal(update.englishGrade, 2);
  assert.equal(update.historyGrade, 2);
  assert.equal(update.inquiry1.grade, 1);
  assert.equal(update.inquiry2Subject, '통합과학');
});

test('대상 성적 백업 이름은 충돌 없는 시각 형식만 허용한다', () => {
  assert.equal(
    backupTableName('20260903_231500'),
    'bak_sep26_g2_scores_20260903_231500',
  );
  assert.throws(() => backupTableName('latest'));
});

test('운영 검증은 대상·잘못된 과목·미변환 행 수를 숫자로 반환한다', async () => {
  let params;
  const connection = {
    async query(_sql, values) {
      params = values;
      return [[{ targetRows: '3', invalidSubjectRows: '3', incompleteRows: '3' }]];
    },
  };
  const audit = await inspectTarget(connection, '일산');

  assert.deepEqual(params, ['일산', '2', '2027', '9월']);
  assert.deepEqual(audit, {
    targetRows: 3,
    invalidSubjectRows: 3,
    incompleteRows: 3,
  });
});
