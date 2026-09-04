'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const profiles = require('../utils/examProfiles.js');
const {
  buildGradeCutRows,
  buildTopmaxRows,
  normalizeRawCut,
  validateDataset,
} = require('../scripts/september-grade-cuts.js');
const dataset = require('../scripts/etoos-september-grade-cuts.json');
const serverSource = fs.readFileSync(path.join(__dirname, '..', '_vultr_backend', 'jungsi.js'), 'utf8');
const {
  buildDistribution,
  createGradeDistributionByExamHandler,
} = require('../_vultr_backend/grade_distribution_by_exam.js');
const {
  buildCohortCondition,
  buildRegisteredCohortCondition,
  getStudentCohortCompatibilityWarning,
  resolveStudentCohortMode,
} = require('../_vultr_backend/student_cohort.js');
const { backupNames } = require('../scripts/apply-september-data.js');
const {
  createStudentListByBranchHandler,
} = require('../_vultr_backend/student_list_by_branch.js');
const {
  getEnglishGrade,
  getHistoryGrade,
  interpolateScore,
} = require('../utils/scoreEstimator.js');

test('2027 학생의 학년값으로 고3과 고2 과목 구성을 분리한다', () => {
  const high3 = profiles.getExamProfileForStudent({ grade: '3' }, 2027);
  const high2 = profiles.getExamProfileForStudent({ grade: '2' }, 2027);

  assert.deepEqual(high3.korean, ['화법과작문', '언어와매체']);
  assert.deepEqual(high3.math, ['확률과통계', '미적분', '기하']);
  assert.deepEqual(high2.korean, ['국어']);
  assert.deepEqual(high2.math, ['수학']);
  assert.deepEqual(high2.inquiry, ['통합사회', '통합과학']);
  assert.equal(high2.defaults.inquiry1, '통합사회');
  assert.equal(high2.defaults.inquiry2, '통합과학');
});

test('이투스 예상 컷 범위는 과대평가를 막는 정수 상한으로 정규화한다', () => {
  assert.equal(normalizeRawCut('82 ~ 83'), 83);
  assert.equal(normalizeRawCut('42.5'), 43);
  assert.equal(normalizeRawCut('44'), 44);
});

test('고3 22과목과 고2 4과목 데이터가 완결된다', () => {
  assert.deepEqual(validateDataset(dataset), []);
  assert.equal(dataset.exams['2027'].subjects.length, 22);
  assert.equal(dataset.exams['2028'].subjects.length, 4);

  const gradeRows = buildGradeCutRows(dataset);
  const topmaxRows = buildTopmaxRows(dataset);
  assert.equal(gradeRows.length, 297);
  assert.equal(topmaxRows.length, 30);
  const uniqueKeys = new Set(gradeRows.map((row) => (
    `${row.year}|${row.exam}|${row.subject}|${row.raw}`
  )));
  assert.equal(uniqueKeys.size, gradeRows.length);

  for (const year of ['2027', '2028']) {
    for (const subject of dataset.exams[year].subjects) {
      const rows = gradeRows.filter((row) => (
        row.year === year && row.subject === subject.name
      ));
      const maxDuplicatesFirstCut = subject.max[0] === normalizeRawCut(subject.cuts[0][0]);
      assert.equal(rows.length, maxDuplicatesFirstCut ? 9 : 10, `${year} ${subject.name}`);
      assert.deepEqual(rows.at(-1), {
        year,
        exam: '9월',
        subject: subject.name,
        raw: 0,
        standard: 0,
        percentile: 0,
        grade: 9,
      });
    }
  }

  for (const subject of dataset.exams['2028'].subjects) {
    assert.ok(
      gradeRows.some((row) => row.year === '2027' && row.subject === subject.name),
      `2027 통합 조회용 ${subject.name}`,
    );
  }
});

test('2026-09-04 이투스 최신 컷과 출처 메타데이터를 보존한다', () => {
  const rows = buildTopmaxRows(dataset);
  const find = (year, subject) => rows.find(
    (row) => row.year === year && row.subject === subject,
  );
  const findSubject = (year, subject) => dataset.exams[year].subjects.find(
    (item) => item.name === subject,
  );

  assert.match(dataset.meta.capturedAt, /^2026-09-04T/);
  assert.equal(find('2027', '언어와매체').highest, 142);
  assert.equal(find('2027', '미적분').highest, 143);
  assert.equal(find('2027', '화학2').highest, 72);
  assert.deepEqual(findSubject('2027', '화법과작문').cuts[0], ['88 ~ 89', 129, 96]);
  assert.equal(find('2027', '국어').highest, 144);
  assert.equal(find('2027', '수학').highest, 151);
  assert.equal(find('2028', '국어').highest, 144);
  assert.equal(find('2028', '수학').highest, 151);
  assert.match(dataset.exams['2027'].sourceUrl, /^https:\/\/www\.etoos\.com\//);
  assert.match(dataset.exams['2028'].sourceUrl, /^https:\/\/www\.etoos\.com\//);
});

test('2027 고2 통합과목을 성적분포에 포함하고 빈 선택과목 기본값도 고2로 처리한다', () => {
  const distribution = buildDistribution([
    {
      grade: '2',
      국어_선택과목: null,
      국어_등급: 2,
      수학_선택과목: null,
      수학_등급: 3,
      영어_등급: 2,
      한국사_등급: 1,
      탐구1_선택과목: '통합사회',
      탐구1_등급: 4,
      탐구2_선택과목: '통합과학',
      탐구2_등급: 5,
    },
  ], 2027);

  assert.equal(distribution.국어.국어['2'], 1);
  assert.equal(distribution.수학.수학['3'], 1);
  assert.equal(distribution.사회탐구.통합사회['4'], 1);
  assert.equal(distribution.과학탐구.통합과학['5'], 1);
});

test('운영 변환기에서 고3·고2 컷과 절대평가 등급을 함께 계산한다', () => {
  const rows = buildGradeCutRows(dataset);
  const table = (year, subject) => rows
    .filter((row) => row.year === year && row.subject === subject)
    .map((row) => ({
      원점수: row.raw,
      표준점수: row.standard,
      백분위: row.percentile,
      등급: row.grade,
    }));

  assert.deepEqual(interpolateScore(90, table('2027', '화법과작문')), {
    std: 130,
    pct: 96,
    grade: 1,
  });
  assert.deepEqual(interpolateScore(90, table('2027', '국어')), {
    std: 135,
    pct: 96,
    grade: 1,
  });
  assert.equal(interpolateScore(43, table('2027', '통합사회')).grade, 1);
  assert.equal(interpolateScore(42, table('2027', '통합사회')).grade, 2);
  assert.equal(getEnglishGrade(90), 1);
  assert.equal(getHistoryGrade(40), 1);
});

test('기존 2027 등록 고2를 2028 화면에만 안전하게 포함한다', () => {
  const high2 = buildCohortCondition(2028, 'b');
  const high3 = buildCohortCondition(2027, 'b');

  assert.match(high2.sql, /b\.학년도 = \?/);
  assert.match(high2.sql, /b\.grade = \?/);
  assert.deepEqual(high2.params, ['2028', '2027', '2', '2026-03-01']);
  assert.match(high3.sql, /NOT/);
  assert.deepEqual(high3.params, ['2027', '2', '2026-03-01']);
});

test('학생등록 목록은 학년과 무관하게 실제 등록 학년도만 조회한다', () => {
  assert.deepEqual(buildRegisteredCohortCondition(2027, 'b'), {
    sql: 'b.학년도 = ?',
    params: ['2027'],
  });
});

test('학생 목록 요청은 구버전 등록 화면과 가채점 화면을 안전하게 구분한다', () => {
  assert.equal(resolveStudentCohortMode({ year: '2028' }), 'registered');
  assert.equal(resolveStudentCohortMode({ year: '2028', cohort: 'registered' }), 'registered');
  assert.equal(resolveStudentCohortMode({ year: '2028', cohort: 'gacha' }), 'gacha');
  assert.equal(resolveStudentCohortMode({ year: '2028', exam: '9월' }), 'gacha');
  assert.equal(resolveStudentCohortMode({ year: '2028', exam: '' }), 'registered');
  assert.equal(resolveStudentCohortMode({ year: '2028', cohort: 'unknown' }), 'registered');
});

test('레거시·미지원 코호트 요청만 운영 로그로 관측한다', () => {
  assert.match(getStudentCohortCompatibilityWarning({ exam: '9월' }), /legacy exam/);
  assert.match(getStudentCohortCompatibilityWarning({ cohort: 'unknown' }), /unsupported cohort/);
  assert.equal(getStudentCohortCompatibilityWarning({ exam: '' }), null);
  assert.equal(getStudentCohortCompatibilityWarning({ cohort: 'registered' }), null);
  assert.equal(getStudentCohortCompatibilityWarning({ cohort: 'gacha' }), null);
});

test('운영 반영 백업 이름은 충돌 없는 시각 형식만 허용한다', () => {
  assert.deepEqual(backupNames('20260903_041500'), {
    gradeCuts: 'bak_sep26_gc_20260903_041500',
    topmax: 'bak_sep26_tm_20260903_041500',
  });
  assert.throws(() => backupNames('latest'));
});

function responseRecorder() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return payload; },
  };
}

test('고2 학생 목록 API는 2027 등록·성적을 함께 조회한다', async () => {
  let params;
  const warnings = [];
  const db = {
    async query(_sql, values) {
      params = values;
      return [[{ student_id: 1, student_name: '학생', grade: '2', 입력유형: null }]];
    },
  };
  const handler = createStudentListByBranchHandler(db, {
    warn(message) { warnings.push(message); },
  });
  const res = responseRecorder();
  await handler(
    { user: { branch: '수원' }, query: { year: '2027', exam: '9월', cohort: 'registered' } },
    res,
  );

  assert.deepEqual(params, ['2027', '9월', '수원', '2027']);
  assert.equal(warnings.length, 0);
  assert.equal(res.payload.success, true);
  assert.equal(res.payload.students[0].scores, null);
});

test('학생등록 목록 API는 2027 등록 고2를 2027에서 조회한다', async () => {
  let sql;
  let params;
  const db = {
    async query(query, values) {
      sql = query;
      params = values;
      return [[{ student_id: 2, student_name: '고2학생', grade: '2', 입력유형: null }]];
    },
  };
  const handler = createStudentListByBranchHandler(db);
  const res = responseRecorder();
  await handler(
    {
      user: { branch: '일산' },
      query: { year: '2027', exam: '9월', cohort: 'registered' },
    },
    res,
  );

  assert.doesNotMatch(sql, /created_at|grade =/);
  assert.deepEqual(params, ['2027', '9월', '일산', '2027']);
  assert.equal(res.payload.students[0].grade, '2');
});

test('구버전 학생등록 목록 API도 학년값과 무관하게 2028 실제 등록 학생을 조회한다', async () => {
  let sql;
  let params;
  const db = {
    async query(query, values) {
      sql = query;
      params = values;
      return [[
        { student_id: 3, student_name: '학년미상', grade: null, 입력유형: null },
        { student_id: 4, student_name: '기타학년', grade: '기타', 입력유형: null },
      ]];
    },
  };
  const handler = createStudentListByBranchHandler(db);
  const res = responseRecorder();
  await handler(
    { user: { branch: '일산' }, query: { year: '2028' } },
    res,
  );

  assert.doesNotMatch(sql, /created_at|grade =/);
  assert.deepEqual(params, ['2028', '수능', '일산', '2028']);
  assert.deepEqual(res.payload.students.map((student) => student.grade), [null, '기타']);
});

test('2027 성적분포 API 응답은 고2 통합과목을 포함하고 연결을 반환한다', async () => {
  let released = false;
  let distributionSql;
  let distributionParams;
  const connection = {
    async query(sql, params) {
      distributionSql = sql;
      distributionParams = params;
      return [[{
        grade: '2',
        국어_선택과목: '국어', 국어_등급: 1,
        수학_선택과목: '수학', 수학_등급: 2,
        탐구1_선택과목: '통합사회', 탐구1_등급: 3,
        탐구2_선택과목: '통합과학', 탐구2_등급: 4,
      }]];
    },
    release() { released = true; },
  };
  const handler = createGradeDistributionByExamHandler({
    async getConnection() { return connection; },
  });
  const res = responseRecorder();
  await handler({ query: { year: '2027', exam: '9월' } }, res);

  assert.equal(res.payload.distribution.사회탐구.통합사회['3'], 1);
  assert.equal(res.payload.distribution.과학탐구.통합과학['4'], 1);
  assert.doesNotMatch(distributionSql, /created_at|grade =/);
  assert.deepEqual(distributionParams, ['2027', '9월', '2027']);
  assert.equal(released, true);
});

test('성적분포 API는 로그인 확인 뒤에만 집계한다', () => {
  const routeStart = serverSource.indexOf("'/jungsi/grade-distribution-by-exam'");
  assert.notEqual(routeStart, -1);
  const routeDefinition = serverSource.slice(routeStart, routeStart + 180);
  assert.match(routeDefinition, /authMiddleware/);
  assert.match(routeDefinition, /createGradeDistributionByExamHandler\(db\)/);
});

test('성적분포 API 오류 응답은 내부 오류 내용을 노출하지 않는다', async () => {
  const handler = createGradeDistributionByExamHandler({
    async getConnection() { throw new Error('SQL stack CORS 401'); },
  });
  const res = responseRecorder();
  await handler({ query: { year: '2028', exam: '9월' } }, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(Object.keys(res.payload).sort(), ['message', 'success']);
  assert.doesNotMatch(res.payload.message, /SQL|stack|CORS|401/);
});
