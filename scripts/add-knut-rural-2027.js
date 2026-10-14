'use strict';

const config = require('../config/knut-rural-2027.json');
const { buildPlan } = require('./knut-rural-plan');

async function inspect(connection, ids, lock = false) {
  const snapshot = {};
  for (const [key, table] of [
    ['base', '정시기본'], ['ratios', '정시반영비율'], ['practical', '정시실기배점'],
  ]) {
    const [rows] = await connection.query(
      `SELECT * FROM \`${table}\` WHERE 학년도 = ? AND U_ID IN (38, 39)${lock ? ' FOR UPDATE' : ''}`,
      [config.year],
    );
    snapshot[key] = rows;
    // Check all years and orphan rows too: a new identity must not reuse another unit.
    const [collisions] = await connection.query(
      `SELECT U_ID FROM \`${table}\` WHERE U_ID IN (?, ?)${lock ? ' FOR UPDATE' : ''}`, ids,
    );
    if (collisions.length) throw new Error(`U_ID already exists in ${table}`);
  }
  const [existing] = await connection.query(
    'SELECT U_ID FROM 정시기본 WHERE 학년도 = ? AND 대학명 = ? AND 학과명 LIKE ?'
      + (lock ? ' FOR UPDATE' : ''), [config.year, config.university, '%농어촌%'],
  );
  if (existing.length) throw new Error('KNU rural admissions already exist; review before retrying');
  return buildPlan(snapshot, ids);
}

async function insertRow(connection, table, row) {
  const columns = Object.keys(row);
  const [result] = await connection.query(
    `INSERT INTO \`${table}\` (${columns.map(key => `\`${key}\``).join(',')})`
      + ` VALUES (${columns.map(() => '?').join(',')})`, Object.values(row),
  );
  if (result.affectedRows !== 1) throw new Error(`Insert count mismatch: ${table}`);
}

async function run(connection, ids, { apply = false } = {}) {
  // Validate before any DB operation, including advisory locks.
  if (ids.length !== 2 || !ids.every(id => Number.isSafeInteger(id) && id > 0 && id <= 2147483647)
      || ids[0] === ids[1] || ids.some(id => [38, 39].includes(id))) {
    throw new Error('Specify two distinct, unused integer U_ID values');
  }
  if (!apply) return { mode: 'dry-run', plan: await inspect(connection, ids) };

  const [engines] = await connection.query(
    'SELECT TABLE_NAME, ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()'
      + ' AND TABLE_NAME IN (?, ?, ?)', ['정시기본', '정시반영비율', '정시실기배점'],
  );
  if (engines.length !== 3 || engines.some(row => row.ENGINE !== 'InnoDB')) {
    throw new Error('All target tables must use InnoDB');
  }
  const [locks] = await connection.query("SELECT GET_LOCK('knut-rural-2027', 0) AS acquired");
  if (Number(locks[0].acquired) !== 1) throw new Error('Another KNU migration is running');
  try {
    await connection.beginTransaction();
    try {
      const plan = await inspect(connection, ids, true);
      for (const unit of plan) {
        await insertRow(connection, '정시기본', unit.base);
        await insertRow(connection, '정시반영비율', unit.ratios);
        for (const row of unit.practical) await insertRow(connection, '정시실기배점', row);
      }
      for (const [table, expected] of [['정시기본', 2], ['정시반영비율', 2], ['정시실기배점', 312]]) {
        const [[row]] = await connection.query(
          `SELECT COUNT(*) AS count FROM \`${table}\` WHERE 학년도 = ? AND U_ID IN (?, ?)`,
          [config.year, ...ids],
        );
        if (Number(row.count) !== expected) throw new Error(`Verification failed: ${table}`);
      }
      await connection.commit();
      return { mode: 'applied', ids, base: 2, ratios: 2, practical: 312 };
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  } finally {
    await connection.query("SELECT RELEASE_LOCK('knut-rural-2027')");
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--apply' && !/^--ids=\d+,\d+$/.test(arg))
      || args.filter(arg => arg.startsWith('--ids=')).length !== 1) {
    throw new Error('Usage: node scripts/add-knut-rural-2027.js --ids=<medicine>,<industry> [--apply]');
  }
  if (!process.env.KNUT_DB_URL) throw new Error('KNUT_DB_URL is required; no implicit production connection');
  const ids = args.find(arg => arg.startsWith('--ids=')).slice(6).split(',').map(Number);
  const mysql = require('mysql2/promise');
  const connection = await mysql.createConnection(process.env.KNUT_DB_URL);
  try {
    console.log(JSON.stringify(await run(connection, ids, { apply: args.includes('--apply') }), null, 2));
  } finally {
    await connection.end();
  }
}

if (require.main === module) main().catch(() => {
  // Driver errors can embed connection credentials or SQL values; keep CLI errors private.
  console.error('KNU migration failed. Check arguments, DB access, source rows and ID conflicts. No successful apply reported.');
  process.exitCode = 1;
});

module.exports = { inspect, run };
