'use strict';

const path = require('node:path');
const {
  getEnglishGrade,
  getHistoryGrade,
  interpolateScore,
} = require('../utils/scoreEstimator.js');
const { readServerDbConfig } = require('./apply-september-data.js');

const TARGET_YEAR = '2027';
const TARGET_EXAM = '9월';
const TARGET_GRADE = '2';

const SUBJECT_RULES = {
  korean: {
    fallback: '국어',
    aliases: new Map([['국어', '국어'], ['통합국어', '국어']]),
  },
  math: {
    fallback: '수학',
    aliases: new Map([['수학', '수학'], ['통합수학', '수학']]),
  },
  inquiry1: {
    fallback: '통합사회',
    aliases: new Map([['통합사회', '통합사회']]),
  },
  inquiry2: {
    fallback: '통합과학',
    aliases: new Map([['통합과학', '통합과학']]),
  },
};

function backupTableName(suffix) {
  if (!/^\d{8}_\d{6}$/.test(suffix || '')) {
    throw new Error('backup suffix must be YYYYMMDD_HHMMSS');
  }
  return `bak_sep26_g2_scores_${suffix}`;
}

function normalizeSubject(value, ruleName) {
  const rule = SUBJECT_RULES[ruleName];
  const subject = String(value || '').trim() || rule.fallback;
  const normalized = rule.aliases.get(subject);
  if (!normalized) throw new Error(`unsupported high2 subject: ${ruleName}`);
  return normalized;
}

function buildCutsMap(rows) {
  const cutsMap = new Map();
  for (const row of rows || []) {
    if (!cutsMap.has(row.선택과목명)) cutsMap.set(row.선택과목명, []);
    cutsMap.get(row.선택과목명).push(row);
  }
  return cutsMap;
}

function estimateScore(cutsMap, subject, rawScore) {
  if (rawScore == null) return null;
  const cuts = cutsMap.get(subject);
  if (!cuts || !cuts.length) throw new Error(`missing high2 grade cuts: ${subject}`);
  return interpolateScore(rawScore, cuts);
}

function buildScoreUpdate(row, cutsMap) {
  const koreanSubject = normalizeSubject(row.국어_선택과목, 'korean');
  const mathSubject = normalizeSubject(row.수학_선택과목, 'math');
  const inquiry1Subject = normalizeSubject(row.탐구1_선택과목, 'inquiry1');
  const inquiry2Subject = normalizeSubject(row.탐구2_선택과목, 'inquiry2');
  const korean = estimateScore(cutsMap, koreanSubject, row.국어_원점수);
  const math = estimateScore(cutsMap, mathSubject, row.수학_원점수);
  const inquiry1 = estimateScore(cutsMap, inquiry1Subject, row.탐구1_원점수);
  const inquiry2 = estimateScore(cutsMap, inquiry2Subject, row.탐구2_원점수);

  return {
    studentId: row.student_id,
    koreanSubject,
    korean,
    mathSubject,
    math,
    englishGrade: row.영어_원점수 == null ? null : getEnglishGrade(row.영어_원점수),
    historyGrade: row.한국사_원점수 == null ? null : getHistoryGrade(row.한국사_원점수),
    inquiry1Subject,
    inquiry1,
    inquiry2Subject,
    inquiry2,
  };
}

async function loadTargetRows(connection, branch) {
  const [rows] = await connection.query(
    `SELECT s.student_id,
            s.국어_선택과목, s.국어_원점수,
            s.수학_선택과목, s.수학_원점수,
            s.영어_원점수, s.한국사_원점수,
            s.탐구1_선택과목, s.탐구1_원점수,
            s.탐구2_선택과목, s.탐구2_원점수
       FROM 학생수능성적 s
       JOIN 학생기본정보 b ON b.student_id=s.student_id
      WHERE b.branch_name=? AND b.grade=?
        AND s.학년도=? AND s.모형=? AND s.입력유형='raw'
      ORDER BY s.student_id`,
    [branch, TARGET_GRADE, TARGET_YEAR, TARGET_EXAM],
  );
  return rows;
}

async function loadCuts(connection) {
  const [rows] = await connection.query(
    `SELECT 선택과목명, 원점수, 표준점수, 백분위, 등급
       FROM 정시예상등급컷
      WHERE 학년도=? AND 모형=?
        AND 선택과목명 IN ('국어','수학','통합사회','통합과학')`,
    [TARGET_YEAR, TARGET_EXAM],
  );
  return rows;
}

async function inspectTarget(connection, branch) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS targetRows,
            COALESCE(SUM(s.국어_선택과목 <> '국어'
                      OR s.수학_선택과목 <> '수학'
                      OR s.탐구1_선택과목 <> '통합사회'
                      OR s.탐구2_선택과목 <> '통합과학'), 0) AS invalidSubjectRows,
            COALESCE(SUM(
              (s.국어_원점수 IS NOT NULL AND
                (s.국어_표준점수 IS NULL OR s.국어_백분위 IS NULL OR s.국어_등급 IS NULL))
              OR (s.수학_원점수 IS NOT NULL AND
                (s.수학_표준점수 IS NULL OR s.수학_백분위 IS NULL OR s.수학_등급 IS NULL))
              OR (s.탐구1_원점수 IS NOT NULL AND
                (s.탐구1_표준점수 IS NULL OR s.탐구1_백분위 IS NULL OR s.탐구1_등급 IS NULL))
              OR (s.탐구2_원점수 IS NOT NULL AND
                (s.탐구2_표준점수 IS NULL OR s.탐구2_백분위 IS NULL OR s.탐구2_등급 IS NULL))
            ), 0) AS incompleteRows
       FROM 학생수능성적 s
       JOIN 학생기본정보 b ON b.student_id=s.student_id
      WHERE b.branch_name=? AND b.grade=?
        AND s.학년도=? AND s.모형=? AND s.입력유형='raw'`,
    [branch, TARGET_GRADE, TARGET_YEAR, TARGET_EXAM],
  );
  const audit = rows[0] || {};
  return {
    targetRows: Number(audit.targetRows || 0),
    invalidSubjectRows: Number(audit.invalidSubjectRows || 0),
    incompleteRows: Number(audit.incompleteRows || 0),
  };
}

async function createBackup(connection, tableName, branch) {
  const [existing] = await connection.query(
    'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?',
    [tableName],
  );
  if (existing.length) throw new Error('backup table already exists');
  await connection.query(`CREATE TABLE \`${tableName}\` LIKE 학생수능성적`);
  await connection.query(
    `INSERT INTO \`${tableName}\`
     SELECT s.* FROM 학생수능성적 s
     JOIN 학생기본정보 b ON b.student_id=s.student_id
     WHERE b.branch_name=? AND b.grade=?
       AND s.학년도=? AND s.모형=? AND s.입력유형='raw'`,
    [branch, TARGET_GRADE, TARGET_YEAR, TARGET_EXAM],
  );
}

async function applyMigration(connection, branch) {
  const rows = await loadTargetRows(connection, branch);
  const cutsMap = buildCutsMap(await loadCuts(connection));
  const updates = rows.map((row) => buildScoreUpdate(row, cutsMap));

  await connection.beginTransaction();
  try {
    for (const update of updates) {
      await connection.query(
        `UPDATE 학생수능성적 SET
           국어_선택과목=?, 국어_표준점수=?, 국어_백분위=?, 국어_등급=?,
           수학_선택과목=?, 수학_표준점수=?, 수학_백분위=?, 수학_등급=?,
           영어_등급=?, 한국사_등급=?,
           탐구1_선택과목=?, 탐구1_표준점수=?, 탐구1_백분위=?, 탐구1_등급=?,
           탐구2_선택과목=?, 탐구2_표준점수=?, 탐구2_백분위=?, 탐구2_등급=?
         WHERE student_id=? AND 학년도=? AND 모형=? AND 입력유형='raw'`,
        [
          update.koreanSubject, update.korean?.std ?? null,
          update.korean?.pct ?? null, update.korean?.grade ?? null,
          update.mathSubject, update.math?.std ?? null,
          update.math?.pct ?? null, update.math?.grade ?? null,
          update.englishGrade, update.historyGrade,
          update.inquiry1Subject, update.inquiry1?.std ?? null,
          update.inquiry1?.pct ?? null, update.inquiry1?.grade ?? null,
          update.inquiry2Subject, update.inquiry2?.std ?? null,
          update.inquiry2?.pct ?? null, update.inquiry2?.grade ?? null,
          update.studentId, TARGET_YEAR, TARGET_EXAM,
        ],
      );
    }
    const after = await inspectTarget(connection, branch);
    if (after.invalidSubjectRows || after.incompleteRows) {
      throw new Error('high2 score verification failed');
    }
    await connection.commit();
    return { targetRows: rows.length, updatedRows: updates.length, after };
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const branchArg = process.argv.find((arg) => arg.startsWith('--branch='));
  const suffixArg = process.argv.find((arg) => arg.startsWith('--backup-suffix='));
  const serverArg = process.argv.find((arg) => arg.startsWith('--server-file='));
  const branch = branchArg && branchArg.split('=', 2)[1];
  if (!branch) throw new Error('branch is required');
  const serverFile = serverArg
    ? serverArg.split('=', 2)[1]
    : '/root/supermax/jungsi.js';

  const mysql = require('mysql2/promise');
  const db = mysql.createPool(readServerDbConfig(path.resolve(serverFile)));
  const connection = await db.getConnection();
  try {
    const before = await inspectTarget(connection, branch);
    const rows = await loadTargetRows(connection, branch);
    const cutsMap = buildCutsMap(await loadCuts(connection));
    rows.forEach((row) => buildScoreUpdate(row, cutsMap));
    if (!args.has('--apply')) {
      console.log(JSON.stringify({ mode: 'dry-run', branch, before }, null, 2));
      return;
    }
    const tableName = backupTableName(suffixArg && suffixArg.split('=', 2)[1]);
    await createBackup(connection, tableName, branch);
    const result = await applyMigration(connection, branch);
    console.log(JSON.stringify({ mode: 'applied', branch, backup: tableName, ...result }, null, 2));
  } finally {
    connection.release();
    await db.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  applyMigration,
  backupTableName,
  buildCutsMap,
  buildScoreUpdate,
  inspectTarget,
  normalizeSubject,
};
