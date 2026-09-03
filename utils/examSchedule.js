/**
 * Exam schedule config & auto-default logic
 * Each year maps exam dates (시행일) for auto-selecting the most recent exam.
 */
const EXAM_SCHEDULE = {
  2027: { // 2027학년도 (2026년 시행)
    '3월': new Date('2026-03-24'),
    '6월': new Date('2026-06-04'),
    '9월': new Date('2026-09-02'),
    '수능': new Date('2026-11-19'),
  },
  2026: { // 2026학년도 — 이미 완료, 수능 고정
    '수능': new Date('2025-11-13'),
  },
  2028: { // 2028학년도 고2 (2026년 시행)
    '9월': new Date('2026-09-02'),
  },
};

/**
 * Get default exam type based on today's date.
 * Returns the most recently held exam for the given year.
 * Falls back to '수능' if no exam has been held yet.
 */
function getDefaultExam(year) {
  const schedule = EXAM_SCHEDULE[year];
  if (!schedule) return '수능';

  const today = new Date();
  const exams = ['수능', '9월', '6월', '3월']; // reverse order: check latest first

  for (const exam of exams) {
    if (schedule[exam] && today >= schedule[exam]) {
      return exam;
    }
  }
  return '수능'; // no exam held yet for this year
}
