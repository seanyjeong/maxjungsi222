'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { buildPlan } = require('../scripts/knut-rural-plan');
const { run } = require('../scripts/add-knut-rural-2027');
const snapshot = require('./fixtures/knut-rural-2027/source-rows.json');

test('rural plan switches CSAT to school records without inheriting history', () => {
  const before = JSON.stringify(snapshot);
  const plan = buildPlan(snapshot, [205, 206]);
  for (const [index, unit] of plan.entries()) {
    assert.equal(unit.base.학년도, 2027);
    assert.equal(unit.base.군, '가');
    assert.equal(unit.base.모집정원, null);
    assert.equal(unit.ratios.수능, '0');
    assert.equal(unit.ratios.내신, index === 0 ? '60' : '30');
    assert.equal(unit.ratios.실기, index === 0 ? '40' : '70');
    assert.equal(unit.ratios.selection_rules, null);
    assert.equal(unit.ratios.한국사방식, null);
    assert.equal(unit.ratios.english_scores, null);
    assert.equal(unit.ratios.score_config, null);
    assert.equal(unit.ratios.특수공식, null);
    assert.ok(!unit.base.tags.includes('전년도경쟁률'));
    const meta = JSON.parse(unit.ratios.기타설정).admissions;
    assert.equal(meta.csat_minimum, false);
    assert.match(meta.quota_reason, /수시 미충원/);
    assert.match(meta.eligibility, /6년 또는 12년/);
    assert.match(meta.eligibility, /특목고·체육고/);
    assert.equal(unit.practical.length, 156);
    assert.deepEqual(unit.practical.map(({ U_ID, ...row }) => row),
      snapshot.practical.filter(row => Number(row.U_ID) === (index === 0 ? 39 : 38))
        .map(({ id, U_ID, ...row }) => row));
  }
  assert.equal(JSON.stringify(snapshot), before);
});

test('missing source, duplicate IDs and incomplete score tables fail closed', () => {
  for (const ids of [[38, 205], [205, 205], [205], [NaN, 206], [205.1, 206]]) {
    assert.throws(() => buildPlan(snapshot, ids));
  }
  const changed = structuredClone(snapshot);
  changed.practical.pop();
  assert.throws(() => buildPlan(changed, [205, 206]), /row count/);
  changed.practical = snapshot.practical;
  changed.ratios[0].수능 = '40';
  assert.throws(() => buildPlan(changed, [205, 206]), /scoring changed/);
});

test('default dry run issues SELECT only', async () => {
  const calls = [];
  const connection = { query: async sql => {
    calls.push(sql);
    assert.match(sql, /^SELECT /);
    assert.doesNotMatch(sql, /FOR UPDATE|GET_LOCK/);
    if (sql.includes('SELECT *')) {
      const key = sql.includes('정시기본') ? 'base' : sql.includes('정시반영비율') ? 'ratios' : 'practical';
      return [snapshot[key]];
    }
    return [[]];
  } };
  const result = await run(connection, [205, 206]);
  assert.equal(result.mode, 'dry-run');
  assert.equal(result.plan.length, 2);
  assert.equal(calls.length, 7);
});

test('isolated MySQL: apply, API joins, collision, rollback and untouched sources', {
  skip: !process.env.KNUT_TEST_DB_URL,
}, async () => {
  const mysql = require('mysql2/promise');
  const url = new URL(process.env.KNUT_TEST_DB_URL);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname));
  assert.equal(url.pathname, '/knut_rural_test');
  const db = await mysql.createConnection(process.env.KNUT_TEST_DB_URL);
  const tables = [['base', '정시기본'], ['ratios', '정시반영비율'], ['practical', '정시실기배점']];
  try {
    for (const [, table] of [...tables].reverse()) await db.query(`DROP TABLE IF EXISTS \`${table}\``);
    const schema = fs.readFileSync(`${__dirname}/fixtures/knut-rural-2027/schema.sql`, 'utf8');
    for (const statement of schema.split(';').filter(s => s.trim())) await db.query(statement);
    for (const [key, table] of tables) {
      for (const row of snapshot[key]) {
        await db.query(`INSERT INTO \`${table}\` SET ?`, row);
      }
    }
    const readSources = async () => {
      const result = {};
      for (const [key, table] of tables) {
        [result[key]] = await db.query(`SELECT * FROM \`${table}\` WHERE U_ID IN (38,39) ORDER BY U_ID`
          + (key === 'base' ? ',학년도' : ',id'));
      }
      return result;
    };
    const before = await readSources();
    assert.equal((await run(db, [205, 206])).mode, 'dry-run');
    const [[dryCount]] = await db.query('SELECT COUNT(*) AS n FROM 정시기본');
    assert.equal(dryCount.n, 2);

    // Fail after both units start inserting, proving the entire operation rolls back.
    let inserts = 0;
    const failing = new Proxy(db, { get(target, key) {
      if (key === 'query') return async (...args) => {
        if (args[0].startsWith('INSERT INTO') && ++inserts === 160) throw new Error('injected failure');
        return target.query(...args);
      };
      return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
    } });
    await assert.rejects(run(failing, [205, 206], { apply: true }), /injected failure/);
    for (const [, table] of tables) {
      const [[row]] = await db.query(`SELECT COUNT(*) AS n FROM \`${table}\` WHERE U_ID IN (205,206)`);
      assert.equal(row.n, 0);
    }
    const applied = await run(db, [205, 206], { apply: true });
    assert.equal(applied.practical, 312);
    // Exercise the same year/U_ID joins used by schools, cutoffs and school-details.
    const [rows] = await db.query(`SELECT b.*, r.수능, r.내신, r.실기, r.기타설정
      FROM 정시기본 b JOIN 정시반영비율 r ON b.U_ID=r.U_ID AND b.학년도=r.학년도
      WHERE b.학년도=2027 AND b.U_ID IN (205,206) ORDER BY b.U_ID`);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map(row => [row.모집정원, row.수능, row.내신, row.실기]),
      [[null, '0', '60', '40'], [null, '0', '30', '70']]);
    assert.equal(rows[0].기타설정.admissions.csat_minimum, false);
    assert.deepEqual(await readSources(), before);
    await assert.rejects(run(db, [205, 206], { apply: true }), /already exists/);
    await assert.rejects(run(db, [207, 208], { apply: true }), /already exist/);
    const [[yearCount]] = await db.query('SELECT COUNT(*) AS n FROM 정시기본 WHERE 학년도<>2027');
    assert.equal(yearCount.n, 0);
  } finally {
    await db.end();
  }
});
