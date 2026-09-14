'use strict';
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ReviewedPracticalConfig = factory();
})(typeof window === 'undefined' ? globalThis : window, function() {
  const profiles = {
    111: {events: ['제자리멀리뛰기', '10m반복달리기']},
    25: {events: ['지그재그런', '배구언더오버(1분)', '높이뛰기'], digits: {'지그재그런': 1, '높이뛰기': 0}, counts: ['배구언더오버(1분)'], eventFinalCodes: {'배구언더오버(1분)': [], '지그재그런': ['F', '파울', '실격']}},
    102: {events: ['제자리멀리뛰기', '메디신볼던지기', '20m왕복달리기'], digits: {'제자리멀리뛰기': 0, '메디신볼던지기': 1, '20m왕복달리기': 2}, finalCodes: ['실격']},
    31: {events: ['윗몸일으키기', '제자리멀리뛰기', 'Z자달리기'], counts: ['윗몸일으키기'], eventFinalCodes: {'윗몸일으키기': [], 'Z자달리기': ['실격']}},
    32: {events: ['윗몸일으키기', '제자리멀리뛰기', 'Z자달리기'], counts: ['윗몸일으키기'], eventFinalCodes: {'윗몸일으키기': [], 'Z자달리기': ['실격']}},
    70: {events: ['제자리멀리뛰기', '10m왕복달리기', '메디신볼던지기'], timeDigits: 2},
    204: {events: ['메디신볼던지기', '20m왕복달리기(80m)', '수직점프'], timeDigits: 2},
  };
  return {year: 2027, feature: 'fivePractical2027Reviewed', profiles, finalCodes: ['F', '파울'],
    timeEvents: ['10m반복달리기', '지그재그런', '20m왕복달리기', 'Z자달리기', '10m왕복달리기', '20m왕복달리기(80m)'],
    messages: {incomplete: '실기 기록을 모두 입력해 주세요.', invalid: '종목·성별·기록을 확인해 주세요. 횟수는 정수로 입력합니다.',
      absent: '미응시 종목이 있어 최종총점을 산출하지 않습니다.', precision: '호서대 달리기는 소수 둘째 자리까지 확인된 기록을 입력해 주세요.'},
    conditionalRules: [
      {key: 'yongin', ids: [111], event: '제자리멀리뛰기', gender: '남', minimum: 261, below: 269},
      {key: 'wonkwang', ids: [25], event: '배구언더오버(1분)', equal: {남: 26, 여: 24}},
      {key: 'sejong', ids: [102], event: '메디신볼던지기', below: {남: 9, 여: 7}},
      {key: 'chosun', ids: [31, 32], event: 'Z자달리기', above: {남: 17.70, 여: 19}},
      {key: 'hoseo', ids: [70, 204], event: '메디신볼던지기', below: {남: 5.3, 여: 2.3}},
      {key: 'hoseoTime', ids: [70, 204], time: true},
    ],
    notices: {yongin: '용인 제멀 경계 · 상담 기준 적용', wonkwang: '원광 배구 중복 경계 · 상담 기준 적용',
      sejong: '세종 메디신 최저 경계 밖 · 상담용 25점', chosun: '조선 Z자 최저 경계 밖 · 상담용 0점',
      hoseo: '호서 메디신 최저 경계 밖 · 상담용 30점', hoseoTime: '호서 달리기 · 0.01초 급간 적용'},
  };
});
