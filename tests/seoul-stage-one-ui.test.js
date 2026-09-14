'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const information = require('../university-overview/information');
const stageInput = require('../utils/admissions-practical-input');
const stage = require('../config/admissions-stage-2027');
const formula = { U_ID: 96, 학년도: 2027, 수능: 80, 실기: 20, 총점: 100, 실기총점: 20,
  기타설정: { remainingPractical2027Reviewed: true }, 실기배점: [{ 종목명: '제자리멀리뛰기', 성별: '남', 기록: 280, 배점: 30 }] };

test('stage-only model exposes CSAT selection and penalties without using stage-two maxima', () => {
  const review = { stageOneOnly: true, stageLabel: stage.label, stageSelection: stage.selection, stageFormula: stage.formula };
  const model = information.build({ ...formula, english_scores: { 1: 0, 2: .5 }, history_scores: { 1: 0, 9: 2.4 } }, null, review);
  assert.equal(model.stageOneOnly, true);
  assert.deepEqual(model.items.map(item => item.value), ['1단계 수능 점수', '수능 100% · 3배수 선발']);
  assert.deepEqual(model.notes, [stage.formula]);
  assert.deepEqual(model.english, [{ grade: 1, score: 0 }, { grade: 2, score: .5 }]);
  assert.deepEqual(model.history, [{ grade: 1, score: 0 }, { grade: 9, score: 2.4 }]);
});

test('calculator only removes practical and final fields for enabled Seoul 2027', () => {
  const window = { AdmissionsPracticalInput: stageInput, AdmissionsScoreFormat: { format: value => value.toFixed(2) } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../calculator/grid'), 'utf8'), { window, document: { getElementById: () => null } });
  const header = {};
  const grid = window.createCalculatorGrid({ esc: value => value, resultsThead: header, sortRows() {}, sortState: { value: 'desc' }, getMaximum: () => 100 });
  const student = { student_name: '합성학생', gender: '남' };
  grid.renderHeader(formula);
  assert.match(header.innerHTML, /1단계 수능 점수/);
  assert.equal((header.innerHTML.match(/<th /g) || []).length, 3);
  assert.doesNotMatch(header.innerHTML, /최종총점|실기 총점/);
  const row = grid.renderRowHtml(student, 408.8, formula);
  assert.match(row, /408\.80/);
  assert.doesNotMatch(row, /practical-input|score-total|total-bar/);
  for (const scoped of [{ ...formula, 학년도: 2026 }, { ...formula, U_ID: 155 }, { ...formula, 기타설정: {} }]) {
    assert.equal(stageInput.stagePolicy(scoped), null);
    grid.renderHeader(scoped);
    assert.doesNotMatch(header.innerHTML, /1단계 수능 점수/);
    assert.match(grid.renderRowHtml(student, 408.8, scoped), /score-total/);
  }
});
