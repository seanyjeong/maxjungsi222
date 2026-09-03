'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  getStudentScoreYear,
  getViewYears,
  groupItemsByScoreYear,
  mergeStudentCohorts,
} = require('../utils/gachaCohort.js');

test('현재 9월 화면은 2027 등록 학생을 한 번만 조회한다', () => {
  assert.deepEqual(getViewYears('2027', '9월'), ['2027']);
  assert.deepEqual(getViewYears('2027', '6월'), ['2027']);
  assert.deepEqual(getViewYears('2026', '9월'), ['2026']);
});

test('고2와 고3 성적은 모두 등록 학년도에 저장한다', () => {
  assert.equal(getStudentScoreYear({ grade: '2' }, '2027', '2027', '9월'), '2027');
  assert.equal(getStudentScoreYear({ grade: '3' }, '2027', '2027', '9월'), '2027');
  assert.equal(getStudentScoreYear({ grade: 'N' }, '2027', '2027', '9월'), '2027');
  assert.equal(getStudentScoreYear({ grade: '2' }, '2027', '2027', '6월'), '2027');
});

test('2027 목록의 두 학년을 합치고 같은 저장 연도를 보존한다', () => {
  const students = mergeStudentCohorts([
    { year: '2027', students: [
      { student_id: 1, student_name: '고3', grade: '3' },
      { student_id: 2, student_name: '고2', grade: '2' },
    ] },
  ], '2027', '9월');

  assert.deepEqual(students.map((student) => [student.student_id, student.scoreYear]), [
    [2, '2027'],
    [1, '2027'],
  ]);
});

test('변경된 두 학년 행은 2027 저장 요청 하나로 묶는다', () => {
  const batches = groupItemsByScoreYear([
    { student_id: 1, scoreYear: '2027', scores: { 국어_원점수: 90 } },
    { student_id: 2, scoreYear: '2027', scores: { 국어_원점수: 90 } },
  ]);

  assert.deepEqual(batches, [
    { year: '2027', items: [
      { student_id: 1, scores: { 국어_원점수: 90 } },
      { student_id: 2, scores: { 국어_원점수: 90 } },
    ] },
  ]);
});
