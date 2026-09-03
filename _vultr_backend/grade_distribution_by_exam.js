'use strict';

const { buildRegisteredCohortCondition } = require('./student_cohort.js');

const SOCIAL_SUBJECTS = new Set([
  '생활과윤리', '윤리와사상', '한국지리', '세계지리', '동아시아사',
  '세계사', '정치와법', '경제', '사회문화', '통합사회',
]);
const SCIENCE_SUBJECTS = new Set([
  '물리1', '화학1', '생명과학1', '지구과학1',
  '물리2', '화학2', '생명과학2', '지구과학2', '통합과학',
]);

function createGradeCount() {
  return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 };
}

function increment(subjectMap, subject, grade) {
  if (!subject) return;
  if (!Object.hasOwn(subjectMap, subject)) subjectMap[subject] = createGradeCount();
  const key = String(grade || '');
  if (Object.hasOwn(subjectMap[subject], key)) subjectMap[subject][key] += 1;
}

function buildDistribution(students, year) {
  const distribution = {
    국어: {},
    수학: {},
    영어: {},
    한국사: {},
    사회탐구: {},
    과학탐구: {},
  };

  for (const student of students || []) {
    const isHigh2 = String(student.grade) === '2' || Number(year) === 2028;
    increment(
      distribution.국어,
      student.국어_선택과목 || (isHigh2 ? '국어' : '화법과작문'),
      student.국어_등급,
    );
    increment(
      distribution.수학,
      student.수학_선택과목 || (isHigh2 ? '수학' : '확률과통계'),
      student.수학_등급,
    );
    increment(distribution.영어, '전체', student.영어_등급);
    increment(distribution.한국사, '전체', student.한국사_등급);

    for (const index of [1, 2]) {
      const subject = student[`탐구${index}_선택과목`];
      const grade = student[`탐구${index}_등급`];
      if (SOCIAL_SUBJECTS.has(subject)) {
        increment(distribution.사회탐구, subject, grade);
      } else if (SCIENCE_SUBJECTS.has(subject)) {
        increment(distribution.과학탐구, subject, grade);
      }
    }
  }

  return distribution;
}

function createGradeDistributionByExamHandler(db) {
  return async function gradeDistributionByExam(req, res) {
    const { year, exam } = req.query;
    if (!/^\d{4}$/.test(String(year || '')) || !['3월', '6월', '9월', '수능'].includes(exam)) {
      return res.status(400).json({
        success: false,
        message: '학년도와 시험을 다시 선택해주세요.',
      });
    }

    let connection;
    try {
      connection = await db.getConnection();
      const cohort = buildRegisteredCohortCondition(year, 'b');
      const [students] = await connection.query(`
        SELECT
          b.grade,
          s.국어_선택과목, s.국어_등급,
          s.수학_선택과목, s.수학_등급,
          s.영어_등급, s.한국사_등급,
          s.탐구1_선택과목, s.탐구1_등급,
          s.탐구2_선택과목, s.탐구2_등급
        FROM 학생기본정보 b
        INNER JOIN 학생수능성적 s
          ON b.student_id = s.student_id AND s.학년도 = ? AND s.모형 = ?
        WHERE ${cohort.sql}
          AND (s.국어_등급 IS NOT NULL
               OR s.수학_등급 IS NOT NULL
               OR s.영어_등급 IS NOT NULL
               OR s.한국사_등급 IS NOT NULL
               OR s.탐구1_등급 IS NOT NULL
               OR s.탐구2_등급 IS NOT NULL)
      `, [year, exam, ...cohort.params]);

      return res.json({
        success: true,
        year: Number(year),
        exam,
        totalStudents: students.length,
        distribution: buildDistribution(students, year),
      });
    } catch (error) {
      console.error('grade-distribution-by-exam 오류:', error);
      return res.status(500).json({
        success: false,
        message: '성적 분포를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.',
      });
    } finally {
      if (connection) connection.release();
    }
  };
}

module.exports = { buildDistribution, createGradeDistributionByExamHandler };
