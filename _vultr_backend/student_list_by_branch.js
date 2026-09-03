'use strict';

const {
  buildCohortCondition,
  buildRegisteredCohortCondition,
  GACHA_COHORT,
  getStudentCohortCompatibilityWarning,
  resolveStudentCohortMode,
} = require('./student_cohort.js');

const EXAMS = new Set(['3월', '6월', '9월', '수능']);

function formatStudent(row) {
  const scores = row.입력유형 ? {
    입력유형: row.입력유형,
    국어_선택과목: row.국어_선택과목,
    국어_원점수: row.국어_원점수,
    국어_표준점수: row.국어_표준점수,
    국어_백분위: row.국어_백분위,
    국어_등급: row.국어_등급,
    수학_선택과목: row.수학_선택과목,
    수학_원점수: row.수학_원점수,
    수학_표준점수: row.수학_표준점수,
    수학_백분위: row.수학_백분위,
    수학_등급: row.수학_등급,
    영어_원점수: row.영어_원점수,
    영어_등급: row.영어_등급,
    한국사_원점수: row.한국사_원점수,
    한국사_등급: row.한국사_등급,
    탐구1_선택과목: row.탐구1_선택과목,
    탐구1_원점수: row.탐구1_원점수,
    탐구1_표준점수: row.탐구1_표준점수,
    탐구1_백분위: row.탐구1_백분위,
    탐구1_등급: row.탐구1_등급,
    탐구2_선택과목: row.탐구2_선택과목,
    탐구2_원점수: row.탐구2_원점수,
    탐구2_표준점수: row.탐구2_표준점수,
    탐구2_백분위: row.탐구2_백분위,
    탐구2_등급: row.탐구2_등급,
  } : null;

  return {
    student_id: row.student_id,
    student_name: row.student_name,
    school_name: row.school_name,
    grade: row.grade,
    gender: row.gender,
    phone_number: row.phone_number,
    phone_owner: row.phone_owner,
    scores,
  };
}

function createStudentListByBranchHandler(db, logger = console) {
  return async function studentListByBranch(req, res) {
    const branch = req.user && req.user.branch;
    const year = String(req.query.year || '');
    const exam = req.query.exam || '수능';
    if (!branch) {
      return res.status(403).json({ success: false, message: '로그인 정보를 다시 확인해주세요.' });
    }
    if (!/^\d{4}$/.test(year) || !EXAMS.has(exam)) {
      return res.status(400).json({ success: false, message: '학년도와 시험을 다시 선택해주세요.' });
    }

    const compatibilityWarning = getStudentCohortCompatibilityWarning(req.query);
    if (compatibilityWarning) logger.warn(compatibilityWarning);
    const cohortMode = resolveStudentCohortMode(req.query);
    const cohort = cohortMode === GACHA_COHORT
      ? buildCohortCondition(year, 'b')
      : buildRegisteredCohortCondition(year, 'b');
    try {
      const [students] = await db.query(`
        SELECT
          b.student_id, b.student_name, b.school_name, b.grade, b.gender,
          b.phone_number, b.phone_owner,
          s.입력유형,
          s.국어_선택과목, s.국어_원점수, s.국어_표준점수, s.국어_백분위, s.국어_등급,
          s.수학_선택과목, s.수학_원점수, s.수학_표준점수, s.수학_백분위, s.수학_등급,
          s.영어_원점수, s.영어_등급,
          s.한국사_원점수, s.한국사_등급,
          s.탐구1_선택과목, s.탐구1_원점수, s.탐구1_표준점수, s.탐구1_백분위, s.탐구1_등급,
          s.탐구2_선택과목, s.탐구2_원점수, s.탐구2_표준점수, s.탐구2_백분위, s.탐구2_등급
        FROM 학생기본정보 b
        LEFT JOIN 학생수능성적 s
          ON b.student_id = s.student_id AND s.학년도 = ? AND s.모형 = ?
        WHERE b.branch_name = ? AND ${cohort.sql}
        ORDER BY b.student_name ASC
      `, [year, exam, branch, ...cohort.params]);

      return res.json({ success: true, students: students.map(formatStudent) });
    } catch (error) {
      console.error('지점 학생 목록 조회 오류:', error);
      return res.status(500).json({
        success: false,
        message: '학생 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.',
      });
    }
  };
}

module.exports = { createStudentListByBranchHandler, formatStudent };
