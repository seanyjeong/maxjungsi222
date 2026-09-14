'use strict';
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.InquiryFollowupConfig = factory();
})(typeof window === 'undefined' ? globalThis : window, function() {
  return Object.freeze({
    year: 2027,
    active: [3, 4, 5, 6, 13, 19, 22, 23, 67, 68, 71, 77, 78, 79, 80, 105, 114, 116, 117, 119, 120, 128, 134, 158, 159, 182, 183],
    missingTable: [81, 174],
    missingSetting: [165, 166, 167],
    current: '현재 상담에 사용하는 기존 탐구변환표를 유지합니다.',
    missingTableNotice: '요강은 탐구변환표를 사용하지만 현재는 표준점수로 계산됩니다. 변환표 자료와 반영 방식의 확인이 필요합니다.',
    missingSettingNotice: '요강은 탐구변환표를 사용하지만 현재는 백분위로 계산됩니다. 탐구 반영 방식의 확인이 필요합니다.',
    followUp: '2027학년도 공식 탐구변환표 발표 후 전체 구간과 환산 결과를 검수하여 갱신합니다.',
    provenance: '기존표의 출처·연도는 새 공식표와 함께 대조합니다.',
    yonseiPedagogy: '체육교육과의 기존표는 스포츠응용산업학과의 검수된 표와 달라 출처·연도·적용 유형을 함께 확인합니다.',
    listSource: 'https://github.com/seanyjeong/maxjungsi222/blob/main/docs/admissions-2027-later-updates.md',
  });
});
