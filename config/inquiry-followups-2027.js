'use strict';
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.InquiryFollowupConfig = factory();
})(typeof window === 'undefined' ? globalThis : window, function() {
  return Object.freeze({
    year: 2027,
    active: [3, 4, 5, 6, 13, 19, 22, 23, 67, 68, 71, 77, 78, 79, 80, 81, 105, 114, 116, 117, 119, 120, 128, 134, 158, 159, 165, 166, 167, 174, 182, 183],
    missingTable: [],
    missingSetting: [],
    current: '현재 상담에 사용하는 기존 탐구변환표를 유지합니다.',
    missingTableNotice: '요강은 탐구변환표를 사용하지만 현재는 표준점수로 계산됩니다. 변환표 자료와 반영 방식의 확인이 필요합니다.',
    missingSettingNotice: '요강은 탐구변환표를 사용하지만 현재는 백분위로 계산됩니다. 탐구 반영 방식의 확인이 필요합니다.',
    followUp: '2027학년도 공식 탐구변환표가 발표되면 교체합니다.',
    provenance: '',
    yonseiPedagogy: '',
    details: {
      81: {current: '세종캠퍼스 국제스포츠학부와 같은 기존 상담용 탐구변환표를 적용합니다.',
        provenance: ''},
      174: {current: '2026학년도 부산대 공식 정정표를 소수 4자리 그대로 임시 적용합니다.', provenance: '',
        followUp: '2027학년도 공식 탐구변환표가 발표되면 교체합니다.'},
    },
    listSource: 'https://github.com/seanyjeong/maxjungsi222/blob/main/docs/admissions-2027-later-updates.md',
  });
});
