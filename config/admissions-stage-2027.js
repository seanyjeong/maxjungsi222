'use strict';
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AdmissionsStageConfig = factory();
})(typeof window === 'undefined' ? globalThis : window, function() {
  return Object.freeze({year: 2027, uid: 96, feature: 'remainingPractical2027Reviewed',
    label: '1단계 수능 점수', selection: '수능 100% · 3배수 선발',
    formula: '국어 표준점수 + 수학 표준점수 × 1.2 + 탐구 2과목 표준점수 합 × 0.8 − 영어·한국사 감점',
    subjects: {국어: '표준점수 × 1', 수학: '표준점수 × 1.2', 영어: '감점', 탐구: '2과목 표준점수 합 × 0.8', 한국사: '감점', 탐구수: 2},
    practicalSummary: '2단계 실기는 제자리멀리뛰기·남 턱걸이/여 오래매달리기·핸드볼공던지기·100m달리기 각15점, 농구 레이업·축구 장애물 드리블 각20점으로 원점수100점이며 최종20점 반영입니다. 세부 급간·실시방법은 10월12일 이후 안내로 갱신합니다.',
    followUp: '2단계 환산은 시험 후 1단계 합격자 성적과 실기 결과를 확인해 적용합니다.',
    notice: '1단계 수능 점수 · 수능 100%로 3배수 선발합니다. 2단계 환산은 시험 후 합격자 최고·최저점으로 적용하며, 실기 세부 안내는 10월 12일 이후 확인할 후속 작업입니다.',
  });
});
