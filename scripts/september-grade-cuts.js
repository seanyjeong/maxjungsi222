'use strict';

function normalizeRawCut(rawValue) {
  const values = String(rawValue)
    .split(/\s*~\s*/)
    .map(Number)
    .filter(Number.isFinite);
  if (!values.length) return NaN;
  return Math.ceil(Math.max(...values));
}

function buildGradeCutRows(dataset) {
  const rows = [];
  for (const [year, exam] of Object.entries(dataset.exams || {})) {
    for (const subject of exam.subjects || []) {
      const subjectRows = [{
        year,
        exam: exam.exam,
        subject: subject.name,
        raw: subject.max[0],
        standard: subject.max[1],
        percentile: subject.max[2],
        grade: 1,
      }];
      subject.cuts.forEach((cut, index) => {
        subjectRows.push({
          year,
          exam: exam.exam,
          subject: subject.name,
          raw: normalizeRawCut(cut[0]),
          standard: cut[1],
          percentile: cut[2],
          grade: index + 1,
        });
      });
      subjectRows.push({
        year,
        exam: exam.exam,
        subject: subject.name,
        raw: 0,
        standard: 0,
        percentile: 0,
        grade: 9,
      });
      const uniqueRawScores = new Set();
      const uniqueRows = subjectRows.filter((row) => {
        if (uniqueRawScores.has(row.raw)) return false;
        uniqueRawScores.add(row.raw);
        return true;
      });
      rows.push(...uniqueRows);
      if (year === '2028') {
        rows.push(...uniqueRows.map((row) => ({ ...row, year: '2027' })));
      }
    }
  }
  return rows;
}

function buildTopmaxRows(dataset) {
  const rows = [];
  for (const [year, exam] of Object.entries(dataset.exams || {})) {
    for (const subject of exam.subjects || []) {
      rows.push({
        year,
        exam: exam.exam,
        subject: subject.name,
        highest: subject.max[1],
      });
      if (year === '2028') {
        rows.push({
          year: '2027',
          exam: exam.exam,
          subject: subject.name,
          highest: subject.max[1],
        });
      }
    }
  }
  return rows;
}

function validateDataset(dataset) {
  const errors = [];
  const expectedCounts = { 2027: 22, 2028: 4 };
  for (const [year, expectedCount] of Object.entries(expectedCounts)) {
    const exam = dataset.exams && dataset.exams[year];
    if (!exam) {
      errors.push(`${year} 시험 데이터가 없습니다.`);
      continue;
    }
    if (exam.exam !== '9월') errors.push(`${year} 모형이 9월이 아닙니다.`);
    if (!/^https:\/\/www\.etoos\.com\//.test(exam.sourceUrl || '')) {
      errors.push(`${year} 이투스 출처 URL이 없습니다.`);
    }
    if (!Array.isArray(exam.subjects) || exam.subjects.length !== expectedCount) {
      errors.push(`${year} 과목 수가 ${expectedCount}개가 아닙니다.`);
      continue;
    }
    const names = new Set();
    for (const subject of exam.subjects) {
      if (!subject.name || names.has(subject.name)) {
        errors.push(`${year} 과목명이 없거나 중복됩니다: ${subject.name || '빈 값'}`);
      }
      names.add(subject.name);
      if (!Array.isArray(subject.max) || subject.max.length !== 3) {
        errors.push(`${year} ${subject.name} 최고점 행이 올바르지 않습니다.`);
      }
      if (!Array.isArray(subject.cuts) || subject.cuts.length !== 8) {
        errors.push(`${year} ${subject.name} 1~8등급 행이 올바르지 않습니다.`);
        continue;
      }
      let previousRaw = Number(subject.max[0]);
      subject.cuts.forEach((cut, index) => {
        const raw = normalizeRawCut(cut[0]);
        if (![raw, Number(cut[1]), Number(cut[2])].every(Number.isFinite)) {
          errors.push(`${year} ${subject.name} ${index + 1}등급 값이 숫자가 아닙니다.`);
        }
        if (raw > previousRaw) {
          errors.push(`${year} ${subject.name} ${index + 1}등급 원점수 순서가 잘못되었습니다.`);
        }
        previousRaw = raw;
      });
    }
  }
  return errors;
}

if (require.main === module) {
  const dataset = require('./etoos-september-grade-cuts.json');
  const errors = validateDataset(dataset);
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  } else {
    const gradeRows = buildGradeCutRows(dataset);
    const topmaxRows = buildTopmaxRows(dataset);
    console.log(`validated: gradeCuts=${gradeRows.length}, topmax=${topmaxRows.length}`);
  }
}

module.exports = {
  buildGradeCutRows,
  buildTopmaxRows,
  normalizeRawCut,
  validateDataset,
};
