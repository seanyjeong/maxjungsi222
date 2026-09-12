'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const modulePath = '../university-overview/practical.js';
const { build } = require(modulePath);
const subjectivePolicy = require('../utils/subjective-practical');
const row = (event, gender, record, score) => ({ 종목명: event, 성별: gender, 기록: record, 배점: score });
const formula = rows => ({ U_ID: 9001, 학년도: '2027', 실기: '40', 실기모드: 'basic', 실기배점: rows });

test('keeps gender-specific event order, all tied maxima and every level without changing source', () => {
  const input = formula([row('달리기', '여', '13.2', '99.75'), row('멀리뛰기', '여', '280', '100'),
    row('달리기', '여', '13.1', '100'), row('달리기', '여', '13.0', '100'), row('달리기', '여', '13.3', '99.25'),
    row('남자종목', '남', '300', '200')]);
  const before = structuredClone(input);
  const result = build(input, '여');
  assert.deepEqual(result.genders, ['여', '남']);
  assert.deepEqual(result.rows.map(item => item.event), ['달리기', '멀리뛰기']);
  assert.equal(result.rows[0].record, '13.1 / 13.0');
  assert.equal(result.rows[0].score, 100);
  assert.equal(result.rows[0].deduction, '-0.25 ~ -0.5');
  assert.equal(result.rows[0].levels.length, 4);
  assert.equal(result.rows[0].levels[0].record, '13.2');
  assert.deepEqual(input, before);
  assert.deepEqual(build(input, '여', { eventOrder: ['멀리뛰기', '달리기'] }).rows.map(item => item.event), ['멀리뛰기', '달리기']);
});

test('zero is real while absent, malformed and nonfinite score fields remain null', () => {
  const levels = [row('단일0', '남', 0, '0'), ...[null, '', ' ', undefined, 'NaN', Infinity, false].map((score, index) => row('미확인', '남', index, score))];
  const result = build(formula(levels), '남');
  assert.equal(result.rows[0].record, '0');
  assert.equal(result.rows[0].score, 0);
  assert.equal(result.rows[1].score, null);
  assert.ok(result.rows[1].levels.every(level => level.score === null));
  assert.ok(result.notices.some(notice => notice.includes('0점으로 환산하지 않습니다')));
  const incomplete = build(formula([row('A', '남', '100', 100), row('A', '남', '90', null), row('A', '남', '80', 80)]), '남');
  assert.equal(incomplete.rows[0].deduction, '—');
});

test('exception zero scores stay visible but never expand normal deduction ranges', () => {
  const input = formula([row('높이뛰기', '여', '130', 75), row('높이뛰기', '여', '125', 70),
    row('높이뛰기', '여', 'F', 50), row('높이뛰기', '여', '미응시', 0), row('높이뛰기', '여', '실격', 0)]);
  const result = build(input, '여');
  assert.equal(result.rows[0].deduction, '-5 ~ -20');
  assert.equal(result.rows[0].levels.length, 5);
  assert.equal(result.rows[0].levels.find(level => level.record === '미응시').score, 0);
  assert.ok(result.notices.some(notice => notice.includes('정상 급간')));
});

test('empty non-practical and unregistered data are distinct; JSON tables and year strings work', () => {
  assert.equal(build({ 실기: 0 }, '남').emptyMessage, '실기 반영 없음');
  assert.equal(build({ 실기: '0' }, '남').emptyMessage, '실기 반영 없음');
  for (const practical of [null, undefined, 40]) {
    assert.equal(build({ 실기: practical }, '남').emptyMessage, '등록된 실기 배점표가 없습니다.');
  }
  const input = formula([row('여자종목', '여', 100, 75)]);
  assert.equal(build(input, '남').emptyMessage, '해당 성별 배점 데이터가 없습니다.');
  const encoded = { ...input, 실기배점: JSON.stringify(input.실기배점) };
  assert.deepEqual(build(JSON.stringify(encoded), '여'), build(input, '여'));
});

test('special-mode database fields remain raw reference values without fake zero scores', () => {
  const result = build({ ...formula([row('특수종목', '남', '300', null)]), 실기모드: 'special' }, '남');
  assert.equal(result.rows[0].score, null);
  assert.equal(result.rows[0].deduction, '—');
  assert.ok(result.notices.some(notice => notice.includes('특수 환산')));
});

test('explicit zero practical maximum and no records confirm non-practical blank/null ratios', () => {
  for (const ratio of ['', null]) {
    assert.equal(build({ 실기: ratio, 실기총점: 0, 실기배점: [] }, '남').emptyMessage, '실기 반영 없음');
    assert.equal(build({ 실기: ratio, 실기총점: null, 실기배점: [] }, '남').emptyMessage, '등록된 실기 배점표가 없습니다.');
  }
  const basic = build({ ...formula([row('기록', '여', '100', 25)]), 실기총점: 600 }, '여');
  assert.equal(basic.rows[0].score, 25);
  assert.ok(basic.notices.some(notice => notice.includes('최종 실기 반영점수와 단위가 다를 수 있습니다')));
});

test('reviewed objective policy filters subjective choices and retains selectable sports as a notice', () => {
  const input = { ...formula([row('높이뛰기', '여', '130', 75), row('허들', '여', 'A', 75),
    row('선택실기(축구)', '여', 'A', 100), row('체조', '여', 'A', 150)]),
    U_ID: 105, 기타설정: JSON.stringify({ subjectivePractical2027Reviewed: true }) };
  const result = build(input, '여', { subjectivePolicy });
  assert.deepEqual(result.rows.map(item => item.event), ['높이뛰기']);
  assert.ok(result.notices.some(notice => notice.includes('허들 75점') && notice.includes('체조 150점')));
  assert.ok(result.notices.some(notice => notice.includes('축구 / 농구 / 배구 / 핸드볼')));
  assert.equal(build({ ...input, 학년도: '2026' }, '여', { subjectivePolicy }).rows.length, 4);
  assert.equal(build({ ...input, 기타설정: {} }, '여', { subjectivePolicy }).rows.length, 4);
});

test('Dongguk legacy linear reference wins over misleading API bands with explicit year provenance', () => {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../assets/js/silgi-hardcode.js'), 'utf8'), sandbox);
  const hardcoded = sandbox.window.SILGI_HARDCODED;
  const input = { ...formula([row('배근력', '남', '220', null)]), U_ID: 13, 실기모드: 'special' };
  const current = build({ ...input, 학년도: '2026' }, '남', { hardcoded });
  assert.equal(current.rows.length, 4);
  assert.equal(current.rows[0].record, '220kg 이상');
  assert.equal(current.rows[0].deduction, '130kg 이하');
  assert.equal(current.rows[0].score, 100);
  assert.ok(current.notices[0].includes('2026학년도') && !current.notices[0].includes('참고'));
  const later = build(input, '여', { hardcoded });
  assert.equal(later.rows[0].record, '151kg 이상');
  assert.ok(later.notices[0].includes('기존 기준 참고표'));
  assert.ok(later.notices[0].includes('최신 원문 검증을 완료한 표가 아닙니다'));
});

test('browser UMD produces the same model without DOM or network dependencies', () => {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve(modulePath), 'utf8'), sandbox);
  const input = formula([row('기록', '여', '120', 75)]);
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.window.UniversityPractical.build(input, '여'))), build(input, '여'));
});
