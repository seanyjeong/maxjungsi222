/**
 * 2026년 9월 가채점 화면의 학년별 기준 연도 라우팅.
 * 브라우저와 Node 테스트에서 함께 사용한다.
 */
(function attachGachaCohort(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.JungsiGachaCohort = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createGachaCohort() {
  'use strict';

  function isAutomaticSeptemberView(year, exam) {
    return String(year) === '2027' && exam === '9월';
  }

  function getViewYears(year, _exam) {
    return [String(year)];
  }

  function getStudentScoreYear(_student, _sourceYear, viewYear, _exam) {
    return String(viewYear);
  }

  function mergeStudentCohorts(cohorts, viewYear, exam) {
    const studentsById = new Map();
    for (const cohort of cohorts || []) {
      for (const student of cohort.students || []) {
        const scoreYear = getStudentScoreYear(student, cohort.year, viewYear, exam);
        studentsById.set(String(student.student_id), { ...student, scoreYear });
      }
    }
    return [...studentsById.values()].sort((a, b) => (
      String(a.student_name || '').localeCompare(String(b.student_name || ''), 'ko')
    ));
  }

  function groupItemsByScoreYear(items) {
    const grouped = new Map();
    for (const item of items || []) {
      const year = String(item.scoreYear);
      if (!grouped.has(year)) grouped.set(year, []);
      grouped.get(year).push({ student_id: item.student_id, scores: item.scores });
    }
    return [...grouped.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([year, groupedItems]) => ({ year, items: groupedItems }));
  }

  return {
    getStudentScoreYear,
    getViewYears,
    groupItemsByScoreYear,
    isAutomaticSeptemberView,
    mergeStudentCohorts,
  };
});
