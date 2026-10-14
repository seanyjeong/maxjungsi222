'use strict';

const config = require('../config/knut-rural-2027.json');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function buildPlan(snapshot, ids) {
  assert(ids.length === 2 && ids.every(id => Number.isSafeInteger(id) && id > 0 && id <= 2147483647),
    'Two positive integer U_ID values are required');
  assert(new Set(ids).size === 2 && !ids.some(id => [38, 39].includes(id)), 'U_ID collision');
  return config.units.map((unit, index) => {
    const matching = rows => rows.filter(row => Number(row.U_ID) === unit.source_uid
      && Number(row.학년도) === config.year);
    const bases = matching(snapshot.base);
    const ratios = matching(snapshot.ratios);
    const practical = matching(snapshot.practical);
    assert(bases.length === 1 && ratios.length === 1, 'Missing or duplicate source unit');
    const base = bases[0];
    const ratio = ratios[0];
    assert(base.대학명 === config.university && base.학과명 === unit.department && base.군 === '가',
      'Source identity changed');
    assert(Number(ratio.수능) === unit.school_record_percent && Number(ratio.내신 || 0) === 0
      && Number(ratio.실기) === unit.practical_percent && Number(ratio.총점) === 1000
      && Number(ratio.실기총점) === unit.practical_percent * 10
      && ratio.계산방식 === '환산' && ratio.실기모드 === 'basic'
      && (ratio.실기특수설정 == null || ratio.실기특수설정 === 'null'), 'Source scoring changed');
    assert(practical.length === 156, 'Source practical row count changed');
    for (const gender of ['남', '여']) {
      let fullScore = 0;
      for (const event of config.events) {
        const rows = practical.filter(row => row.성별 === gender && row.종목명 === event);
        assert(rows.length === 26 && new Set(rows.map(row => row.기록)).size === 26,
          'Missing or duplicate practical records');
        assert(rows.every(row => row.배점 != null && String(row.배점).trim() !== ''
          && Number.isFinite(Number(row.배점))), 'Invalid practical score');
        fullScore += Math.max(...rows.map(row => Number(row.배점)));
      }
      assert(fullScore === Number(ratio.실기총점), 'Practical full score mismatch');
    }
    const uid = ids[index];
    const metadata = {
      admission: unit.admission, quota: config.quota, quota_reason: config.quota_reason,
      csat_minimum: config.csat_minimum, eligibility: config.eligibility,
      school_record_input: config.school_record_input, source: config.source,
      practical_source_uid: unit.source_uid,
    };
    return {
      key: unit.key,
      base: {
        U_ID: uid, 학년도: config.year, 군: '가', 형태: base.형태,
        광역: base.광역, 시구: base.시구, 입학처: base.입학처,
        대학명: config.university, 학과명: `${unit.department} ${unit.admission}`,
        모집정원: null, logo_url: base.logo_url, 교직: base.교직, 단계별: null,
        tags: JSON.stringify(['농어촌', '수시 이월 시 모집', '수능최저 없음']),
        실기종목_display: config.events.join(','), 실기종목_diff_note: null,
      },
      ratios: {
        U_ID: uid, 학년도: config.year, 계산방식: '환산', 총점: Number(ratio.총점),
        계산유형: '기본비율', 반영방법: '학생부교과', 수능: '0',
        내신: String(unit.school_record_percent), 실기: String(unit.practical_percent),
        실기총점: Number(ratio.실기총점), 선택형여부: 0, 선택조건: null, 선택가중치: null,
        한국사방식: null, 한국사점수: null, 기본점수: 0, 미달처리: ratio.미달처리,
        기타: null, 국어: null, 수학: null, 영어: null, 탐구: null, 탐구수: null, 한국사: null,
        english_scores: null, history_scores: null, selection_rules: null, 특수공식: null,
        기타설정: JSON.stringify({ admissions: metadata }), bonus_rules: null, score_config: null,
        실기모드: 'basic', 실기특수설정: null,
      },
      practical: practical.map(row => ({
        U_ID: uid, 학년도: String(config.year), 종목명: row.종목명,
        성별: row.성별, 기록: row.기록, 배점: row.배점,
      })),
    };
  });
}

module.exports = { buildPlan };
