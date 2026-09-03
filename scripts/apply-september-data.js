'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  buildGradeCutRows,
  buildTopmaxRows,
  validateDataset,
} = require('./september-grade-cuts.js');

const TARGET_YEARS = ['2027', '2028'];
const TARGET_EXAM = '9월';
const EXPECTED_GRADE_CUT_COUNT = 298;
const EXPECTED_TOPMAX_COUNT = 30;

function backupNames(suffix) {
  if (!/^\d{8}_\d{6}$/.test(suffix || '')) {
    throw new Error('backup suffix must be YYYYMMDD_HHMMSS');
  }
  return {
    gradeCuts: `bak_sep26_gc_${suffix}`,
    topmax: `bak_sep26_tm_${suffix}`,
  };
}

function readServerDbConfig(serverFile) {
  const source = fs.readFileSync(serverFile, 'utf8');
  const match = source.match(/const db = mysql\.createPool\(\{([\s\S]*?)\}\);/);
  if (!match) throw new Error('database config not found in server file');
  return Function(`"use strict"; return ({${match[1]}});`)();
}

async function inspectCurrent(connection) {
  const [gradeCuts] = await connection.query(
    'SELECT 학년도, COUNT(*) rowCount, COUNT(DISTINCT 선택과목명) subjectCount FROM 정시예상등급컷 WHERE 학년도 IN (?, ?) AND 모형 = ? GROUP BY 학년도 ORDER BY 학년도',
    [...TARGET_YEARS, TARGET_EXAM],
  );
  const [topmax] = await connection.query(
    'SELECT 학년도, COUNT(*) rowCount FROM 정시최고표점 WHERE 학년도 IN (?, ?) AND 모형 = ? GROUP BY 학년도 ORDER BY 학년도',
    [...TARGET_YEARS, TARGET_EXAM],
  );
  return { gradeCuts, topmax };
}

async function createBackups(connection, names) {
  const [existing] = await connection.query(
    'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (?, ?)',
    [names.gradeCuts, names.topmax],
  );
  if (existing.length) throw new Error('backup table already exists');

  await connection.query(`CREATE TABLE \`${names.gradeCuts}\` LIKE 정시예상등급컷`);
  await connection.query(
    `INSERT INTO \`${names.gradeCuts}\` SELECT * FROM 정시예상등급컷 WHERE 학년도 IN (?, ?) AND 모형 = ?`,
    [...TARGET_YEARS, TARGET_EXAM],
  );
  await connection.query(`CREATE TABLE \`${names.topmax}\` LIKE 정시최고표점`);
  await connection.query(
    `INSERT INTO \`${names.topmax}\` SELECT * FROM 정시최고표점 WHERE 학년도 IN (?, ?) AND 모형 = ?`,
    [...TARGET_YEARS, TARGET_EXAM],
  );
}

async function applyDataset(connection, dataset) {
  const gradeRows = buildGradeCutRows(dataset);
  const topmaxRows = buildTopmaxRows(dataset);
  await connection.beginTransaction();
  try {
    await connection.query(
      'DELETE FROM 정시예상등급컷 WHERE 학년도 IN (?, ?) AND 모형 = ?',
      [...TARGET_YEARS, TARGET_EXAM],
    );
    await connection.query(
      'INSERT INTO 정시예상등급컷 (학년도, 모형, 선택과목명, 원점수, 표준점수, 백분위, 등급) VALUES ?',
      [gradeRows.map((row) => [
        row.year, row.exam, row.subject, row.raw,
        row.standard, row.percentile, row.grade,
      ])],
    );
    await connection.query(
      'DELETE FROM 정시최고표점 WHERE 학년도 IN (?, ?) AND 모형 = ?',
      [...TARGET_YEARS, TARGET_EXAM],
    );
    await connection.query(
      'INSERT INTO 정시최고표점 (학년도, 모형, 과목명, 최고점) VALUES ?',
      [topmaxRows.map((row) => [row.year, row.exam, row.subject, row.highest])],
    );

    const current = await inspectCurrent(connection);
    const gradeCount = current.gradeCuts.reduce((sum, row) => sum + Number(row.rowCount), 0);
    const topmaxCount = current.topmax.reduce((sum, row) => sum + Number(row.rowCount), 0);
    if (gradeCount !== EXPECTED_GRADE_CUT_COUNT || topmaxCount !== EXPECTED_TOPMAX_COUNT) {
      throw new Error(`verification mismatch: gradeCuts=${gradeCount}, topmax=${topmaxCount}`);
    }
    await connection.commit();
    return current;
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const apply = args.has('--apply');
  const suffixArg = process.argv.find((arg) => arg.startsWith('--backup-suffix='));
  const suffix = suffixArg && suffixArg.split('=', 2)[1];
  const serverArg = process.argv.find((arg) => arg.startsWith('--server-file='));
  const serverFile = serverArg
    ? serverArg.split('=', 2)[1]
    : '/root/supermax/jungsi.js';
  const dataset = require('./etoos-september-grade-cuts.json');
  const errors = validateDataset(dataset);
  if (errors.length) throw new Error(errors.join('\n'));

  const mysql = require('mysql2/promise');
  const db = mysql.createPool(readServerDbConfig(path.resolve(serverFile)));
  const connection = await db.getConnection();
  try {
    const before = await inspectCurrent(connection);
    if (!apply) {
      console.log(JSON.stringify({ mode: 'dry-run', before, source: dataset.meta }, null, 2));
      return;
    }
    const names = backupNames(suffix);
    await createBackups(connection, names);
    const after = await applyDataset(connection, dataset);
    console.log(JSON.stringify({ mode: 'applied', backups: names, before, after }, null, 2));
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

module.exports = { applyDataset, backupNames, inspectCurrent, readServerDbConfig };
