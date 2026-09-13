'use strict';
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AdmissionsPracticalInput = factory();
})(typeof window === 'undefined' ? globalThis : window, function() {
  const YEAR = 2027, FEATURE = 'remainingPractical2027Reviewed';
  const CHONNAM = 115, GOLF = 131;
  const STAGE_PENDING = 96;
  const STAGE_NOTICE = '서울대 수능은 1단계 점수입니다. 2단계 환산에는 합격자 최고·최저점이 필요하며 실기 세부요강은 10월 12일 이후 발표 예정입니다. 최종총점은 산출하지 않습니다.';
  const GOLF_SHOTS = ['드라이버샷', '우드샷(3번우드)', '아이언샷', '어프로치'];
  const CHONNAM_EVENTS = ['100m달리기', '지그재그런', '체조', '축구', '축구골인'];
  const GYMNASTICS = {
    남: ['측전백공or백핸드백공', '핸스or백핸드', '백공', '뒤굴러물구나무'],
    여: ['핸스or백핸드', '뒤굴러물구나무', '무릎펴앞구르기', '무릎벌려앞구르기'],
  };
  const GYM_LABELS = {'측전백공or백핸드백공': '옆돌아·제자리 손 짚고 뒤돌아 공중돌기',
    '핸스or백핸드': '손 짚고 앞돌기·뒤돌기', '백공': '뒤 공중돌기',
    '뒤굴러물구나무': '뒤굴러 물구나무서기', '무릎펴앞구르기': '무릎 펴 앞구르기', '무릎벌려앞구르기': '무릎 벌려 앞구르기'};
  const golfPolicy = {label: '골프 객관평가', maximum: 360, unscoredMaximum: 340, genders: ['남', '여'],
    events: GOLF_SHOTS.flatMap(shot => [1, 2, 3].map(attempt => ({name: `${shot} ${attempt}차`, maximum: 30}))),
    choices: [], selectionLabel: '', excluded: [{name: '주관평가', maximum: 340}],
    inputHint: '4종목을 각 3회 평가합니다. 회차별 A 30점·B 20점·C 10점·D 0점을 선택해 주세요. 실제 등급 인정은 심사위원 판정에 따릅니다.'};
  function active(formula, uid = CHONNAM, feature = FEATURE) {
    let settings = formula?.기타설정;
    if (typeof settings === 'string') { try { settings = JSON.parse(settings); } catch { return false; } }
    return Number(formula?.학년도) === YEAR && Number(formula?.U_ID) === uid && settings?.[feature] === true;
  }
  function eventNames(formula) { return active(formula) ? CHONNAM_EVENTS.slice() : null; }
  function options(formula, gender, event) {
    if (active(formula, GOLF, 'subjectivePractical2027Reviewed') && golfPolicy.events.some(item => item.name === event)) {
      return ['A', 'B', 'C', 'D', '미응시'].map(value => ({value, label: value === '미응시' ? value : `${value} · ${ {A:30,B:20,C:10,D:0}[value]}점`}));
    }
    if (!active(formula)) return null;
    if (event === '축구골인') return ['성공', '실패', '미응시'].map(value => ({value, label: value === '실패' ? '실패 · 원점수 10점 감점' : value}));
    if (event === '체조') return (GYMNASTICS[gender] || []).flatMap(name => ['A','B','C'].map(grade => ({value: `${name}|${grade}`, label: `${GYM_LABELS[name]} · ${grade}`})))
      .concat([{value:'실격',label:'최종 실격 · 20점'},{value:'미응시',label:'미응시 · 0점'}]);
    return null;
  }
  function control(formula, gender, event, attributes, fallback) {
    const list = options(formula, gender, event);
    if (!list) return fallback;
    return `<select ${attributes}><option value="">선택해 주세요</option>${list.map(item => `<option value="${item.value}">${item.label}</option>`).join('')}</select>`;
  }
  function restore(formula, gender, saved) {
    if (!active(formula) || !saved || typeof saved !== 'object') return saved;
    const result = {...saved};
    if (!result.체조) {
      const entered = (GYMNASTICS[gender] || []).filter(name => String(saved[name] ?? '').trim());
      if (entered.length === 1) result.체조 = `${entered[0]}|${saved[entered[0]]}`;
    }
    return result;
  }
  function prepare(formula, gender, practicals) {
    if (active(formula, STAGE_PENDING)) return {ready:false, reason:'incomplete', records:[], names:[], message:STAGE_NOTICE};
    if (!active(formula)) return null;
    const records = CHONNAM_EVENTS.map(event => {
      const matches = practicals.filter(row => row.event === event);
      return {event, value: matches.length === 1 ? String(matches[0].value ?? '').trim() : '', duplicate: matches.length > 1};
    });
    const absenceMismatch = records[3].value && records[4].value && ((records[3].value === '미응시') !== (records[4].value === '미응시'));
    const invalid = absenceMismatch || !GYMNASTICS[gender] || records.some(row => {
      if (row.duplicate) return true;
      if (!row.value) return false;
      const allowed = options(formula, gender, row.event);
      return allowed ? !allowed.some(option => option.value === row.value) :
        !['실격','미응시'].includes(row.value) && (!/^\d+(?:\.\d+)?$/.test(row.value) || Number(row.value) <= 0 || !Number.isFinite(Number(row.value)));
    });
    return {ready: !invalid && records.every(row => row.value !== ''), reason: invalid ? 'invalid' : 'incomplete',
      records: records.map(({event,value}) => ({event,value})), names: CHONNAM_EVENTS.slice(),
      message: invalid ? '체조 동작·등급과 축구 골인 여부, 정상 기록을 확인해 주세요.' : '3종목 기록, 체조 동작·등급, 축구 골인 여부를 모두 입력해 주세요.'};
  }
  function stageNotice(formula) { return active(formula, STAGE_PENDING) ? STAGE_NOTICE : ''; }
  return {active, golfPolicy, eventNames, options, control, restore, prepare, stageNotice};
});
