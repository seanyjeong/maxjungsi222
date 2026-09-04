'use strict';

const path = require('node:path');
const {
  getEnglishGrade,
  getHistoryGrade,
  interpolateScore,
} = require('../utils/scoreEstimator.js');
const { readServerDbConfig } = require('./apply-september-data.js');
const { normalizeSubject: normalizeHigh2Subject } = require('./migrate-high2-september-scores.js');

const TARGET_YEAR = '2027';
const TARGET_EXAM = '9월';
const BACKUP_PATTERN = /^bak_sep26_all_scores_\d{8}_\d{6}$/;

function backupTableName(suffix) {
  if (!/^\d{8}_\d{6}$/.test(suffix || '')) {
    throw new Error('backup suffix must be YYYYMMDD_HHMMSS');
  }
  return `bak_sep26_all_scores_${suffix}`;
}

function buildCutsMap(rows) {
  const cutsMap = new Map();
  for (const row of rows || []) {
    if (!cutsMap.has(row.선택과목명)) cutsMap.set(row.선택과목명, []);
    cutsMap.get(row.선택과목명).push(row);
  }
  return cutsMap;
}

function normalizeSubject(value, grade, high2Rule) {
  if (String(grade) === '2') return normalizeHigh2Subject(value, high2Rule);
  return String(value || '').trim() || null;
}

function estimateScore(cutsMap, subject, rawScore) {
  if (rawScore == null) return null;
  const cuts = subject && cutsMap.get(subject);
  if (!cuts || !cuts.length) throw new Error(`missing grade cuts: ${subject || 'empty subject'}`);
  return interpolateScore(rawScore, cuts);
}

function buildScoreUpdate(row, cutsMap) {
  const koreanSubject = normalizeSubject(row.국어_선택과목, row.grade, 'korean');
  const mathSubject = normalizeSubject(row.수학_선택과목, row.grade, 'math');
  const inquiry1Subject = normalizeSubject(row.탐구1_선택과목, row.grade, 'inquiry1');
  const inquiry2Subject = normalizeSubject(row.탐구2_선택과목, row.grade, 'inquiry2');

  return {
    studentId: row.student_id,
    koreanSubject,
    korean: estimateScore(cutsMap, koreanSubject, row.국어_원점수),
    mathSubject,
    math: estimateScore(cutsMap, mathSubject, row.수학_원점수),
    englishGrade: row.영어_원점수 == null ? null : getEnglishGrade(row.영어_원점수),
    historyGrade: row.한국사_원점수 == null ? null : getHistoryGrade(row.한국사_원점수),
    inquiry1Subject,
    inquiry1: estimateScore(cutsMap, inquiry1Subject, row.탐구1_원점수),
    inquiry2Subject,
    inquiry2: estimateScore(cutsMap, inquiry2Subject, row.탐구2_원점수),
  };
}

function scoreValue(value) {
  return value == null ? null : Number(value);
}

function scoreMatches(row, update) {
  return String(row.국어_선택과목 || '') === String(update.koreanSubject || '')
    && scoreValue(row.국어_표준점수) === scoreValue(update.korean?.std)
    && scoreValue(row.국어_백분위) === scoreValue(update.korean?.pct)
    && scoreValue(row.국어_등급) === scoreValue(update.korean?.grade)
    && String(row.수학_선택과목 || '') === String(update.mathSubject || '')
    && scoreValue(row.수학_표준점수) === scoreValue(update.math?.std)
    && scoreValue(row.수학_백분위) === scoreValue(update.math?.pct)
    && scoreValue(row.수학_등급) === scoreValue(update.math?.grade)
    && scoreValue(row.영어_등급) === scoreValue(update.englishGrade)
    && scoreValue(row.한국사_등급) === scoreValue(update.historyGrade)
    && String(row.탐구1_선택과목 || '') === String(update.inquiry1Subject || '')
    && scoreValue(row.탐구1_표준점수) === scoreValue(update.inquiry1?.std)
    && scoreValue(row.탐구1_백분위) === scoreValue(update.inquiry1?.pct)
    && scoreValue(row.탐구1_등급) === scoreValue(update.inquiry1?.grade)
    && String(row.탐구2_선택과목 || '') === String(update.inquiry2Subject || '')
    && scoreValue(row.탐구2_표준점수) === scoreValue(update.inquiry2?.std)
    && scoreValue(row.탐구2_백분위) === scoreValue(update.inquiry2?.pct)
    && scoreValue(row.탐구2_등급) === scoreValue(update.inquiry2?.grade);
}

function scoreColumns(alias) {
  return `${alias}.student_id,
          b.grade,
          ${alias}.국어_선택과목, ${alias}.국어_원점수, ${alias}.국어_표준점수, ${alias}.국어_백분위, ${alias}.국어_등급,
          ${alias}.수학_선택과목, ${alias}.수학_원점수, ${alias}.수학_표준점수, ${alias}.수학_백분위, ${alias}.수학_등급,
          ${alias}.영어_원점수, ${alias}.영어_등급,
          ${alias}.한국사_원점수, ${alias}.한국사_등급,
          ${alias}.탐구1_선택과목, ${alias}.탐구1_원점수, ${alias}.탐구1_표준점수, ${alias}.탐구1_백분위, ${alias}.탐구1_등급,
          ${alias}.탐구2_선택과목, ${alias}.탐구2_원점수, ${alias}.탐구2_표준점수, ${alias}.탐구2_백분위, ${alias}.탐구2_등급`;
}

async function loadCuts(connection) {
  const [rows] = await connection.query(
    `SELECT 선택과목명, 원점수, 표준점수, 백분위, 등급
       FROM 정시예상등급컷
      WHERE 학년도=? AND 모형=?`,
    [TARGET_YEAR, TARGET_EXAM],
  );
  return rows;
}

async function loadTargetRows(connection, tableName = '학생수능성적', studentIds = []) {
  if (tableName !== '학생수능성적' && !BACKUP_PATTERN.test(tableName)) {
    throw new Error('invalid score table name');
  }
  let idClause = '';
  const params = [TARGET_YEAR, TARGET_EXAM];
  if (studentIds.length) {
    idClause = ` AND s.student_id IN (${studentIds.map(() => '?').join(',')})`;
    params.push(...studentIds);
  }
  const [rows] = await connection.query(
    `SELECT ${scoreColumns('s')}
       FROM \`${tableName}\` s
       JOIN 학생기본정보 b ON b.student_id=s.student_id
      WHERE s.학년도=? AND s.모형=? AND s.입력유형='raw'${idClause}
      ORDER BY s.student_id`,
    params,
  );
  return rows;
}

function summarizeRows(rows) {
  const gradeCounts = {};
  for (const row of rows) {
    const grade = String(row.grade || 'unknown');
    gradeCounts[grade] = (gradeCounts[grade] || 0) + 1;
  }
  return { targetRows: rows.length, gradeCounts };
}

async function createBackup(connection, tableName) {
  const [existing] = await connection.query(
    'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?',
    [tableName],
  );
  if (existing.length) throw new Error('backup table already exists');
  await connection.query(`CREATE TABLE \`${tableName}\` LIKE 학생수능성적`);
  await connection.query(
    `INSERT INTO \`${tableName}\`
     SELECT * FROM 학생수능성적
      WHERE 학년도=? AND 모형=? AND 입력유형='raw'`,
    [TARGET_YEAR, TARGET_EXAM],
  );
}

async function updateScore(connection, update) {
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

async function applyRecompute(connection, backupTable) {
  const rows = await loadTargetRows(connection, backupTable);
  const cutsMap = buildCutsMap(await loadCuts(connection));
  const updates = rows.map((row) => buildScoreUpdate(row, cutsMap));

  await connection.beginTransaction();
  try {
    for (const update of updates) await updateScore(connection, update);
    const currentRows = await loadTargetRows(
      connection,
      '학생수능성적',
      updates.map((update) => update.studentId),
    );
    const currentByStudent = new Map(currentRows.map((row) => [String(row.student_id), row]));
    const mismatchCount = updates.filter((update) => {
      const row = currentByStudent.get(String(update.studentId));
      return !row || !scoreMatches(row, update);
    }).length;
    if (currentRows.length !== rows.length || mismatchCount) {
      throw new Error('score verification failed');
    }
    await connection.commit();
    return { ...summarizeRows(rows), updatedRows: updates.length, mismatchCount };
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const suffixArg = process.argv.find((arg) => arg.startsWith('--backup-suffix='));
  const serverArg = process.argv.find((arg) => arg.startsWith('--server-file='));
  const serverFile = serverArg
    ? serverArg.split('=', 2)[1]
    : '/root/supermax/jungsi.js';
  const mysql = require('mysql2/promise');
  const db = mysql.createPool(readServerDbConfig(path.resolve(serverFile)));
  const connection = await db.getConnection();
  try {
    const rows = await loadTargetRows(connection);
    const cutsMap = buildCutsMap(await loadCuts(connection));
    rows.forEach((row) => buildScoreUpdate(row, cutsMap));
    if (!args.has('--apply')) {
      console.log(JSON.stringify({ mode: 'dry-run', ...summarizeRows(rows) }, null, 2));
      return;
    }
    const backup = backupTableName(suffixArg && suffixArg.split('=', 2)[1]);
    await createBackup(connection, backup);
    const result = await applyRecompute(connection, backup);
    console.log(JSON.stringify({ mode: 'applied', backup, ...result }, null, 2));
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
  applyRecompute,
  backupTableName,
  buildCutsMap,
  buildScoreUpdate,
  scoreMatches,
  summarizeRows,
};
