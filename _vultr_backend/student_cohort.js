'use strict';

const CURRENT_HIGH2_YEAR = '2028';
const LEGACY_HIGH2_YEAR = '2027';
const HIGH2_GRADE = '2';
const CURRENT_SCHOOL_YEAR_START = '2026-03-01';
const GACHA_COHORT = 'gacha';
const REGISTERED_COHORT = 'registered';

function safeAlias(alias) {
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(alias)) {
    throw new Error('invalid SQL alias');
  }
  return alias;
}

function buildCohortCondition(year, alias = 'b') {
  const tableAlias = safeAlias(alias);
  const normalizedYear = String(year);
  const currentHigh2 = [
    `${tableAlias}.학년도 = ?`,
    `${tableAlias}.grade = ?`,
    `${tableAlias}.created_at >= ?`,
  ].join(' AND ');

  if (normalizedYear === CURRENT_HIGH2_YEAR) {
    return {
      sql: `(${tableAlias}.학년도 = ? OR (${currentHigh2}))`,
      params: [
        CURRENT_HIGH2_YEAR,
        LEGACY_HIGH2_YEAR,
        HIGH2_GRADE,
        CURRENT_SCHOOL_YEAR_START,
      ],
    };
  }

  if (normalizedYear === LEGACY_HIGH2_YEAR) {
    return {
      sql: `(${tableAlias}.학년도 = ? AND NOT (${tableAlias}.grade = ? AND ${tableAlias}.created_at >= ?))`,
      params: [LEGACY_HIGH2_YEAR, HIGH2_GRADE, CURRENT_SCHOOL_YEAR_START],
    };
  }

  return { sql: `${tableAlias}.학년도 = ?`, params: [normalizedYear] };
}

function buildRegisteredCohortCondition(year, alias = 'b') {
  const tableAlias = safeAlias(alias);
  return {
    sql: `${tableAlias}.학년도 = ?`,
    params: [String(year)],
  };
}

function resolveStudentCohortMode(query = {}) {
  if (query.cohort === GACHA_COHORT) return GACHA_COHORT;
  if (Object.prototype.hasOwnProperty.call(query, 'cohort')) return REGISTERED_COHORT;
  if (query.exam) return GACHA_COHORT;
  return REGISTERED_COHORT;
}

function getStudentCohortCompatibilityWarning(query = {}) {
  const hasCohort = Object.prototype.hasOwnProperty.call(query, 'cohort');
  if (!hasCohort && query.exam) {
    return 'student-list cohort: inferred gacha from legacy exam query';
  }
  if (hasCohort && query.cohort !== GACHA_COHORT && query.cohort !== REGISTERED_COHORT) {
    return 'student-list cohort: unsupported cohort used registered fallback';
  }
  return null;
}

module.exports = {
  buildCohortCondition,
  buildRegisteredCohortCondition,
  CURRENT_HIGH2_YEAR,
  CURRENT_SCHOOL_YEAR_START,
  GACHA_COHORT,
  getStudentCohortCompatibilityWarning,
  LEGACY_HIGH2_YEAR,
  REGISTERED_COHORT,
  resolveStudentCohortMode,
};
