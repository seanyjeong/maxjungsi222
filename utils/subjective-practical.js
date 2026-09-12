'use strict';
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./practical-input'));
  else root.SubjectivePractical = factory(root.PracticalInput);
})(typeof window === 'undefined' ? globalThis : window, function (practicalInput) {
  const YEAR = 2027;
  const FEATURE = 'subjectivePractical2027Reviewed';
  const SELECTION_KEY = '_subjectiveSelection';
  const INELIGIBLE_MESSAGE = '실기 미응시 · 모집요강상 불합격 대상입니다.';
  const POLICIES = {
    104: { label: '기초실기', maximum: 300, unscoredMaximum: 300, genders: ['남', '여'],
      events: [{ name: '제자리멀리뛰기', maximum: 150 }, { name: '지그재그런', maximum: 150 }],
      choices: ['축구', '농구', '체조'], selectionLabel: '전공실기 종목',
      excluded: [{ name: '전공실기', maximum: 300 }],
      inputHint: '제자리멀리뛰기는 정수 cm, 지그재그런은 0.1초 단위로 입력해 주세요. 미응시는 0점이며 불합격 대상입니다.' },
    105: { label: '높이뛰기', maximum: 75, unscoredMaximum: 325, genders: ['여'],
      events: [{ name: '높이뛰기', maximum: 75 }],
      choices: ['축구', '농구', '배구', '핸드볼'], selectionLabel: '선택실기 종목',
      excluded: [{ name: '허들', maximum: 75 }, { name: '체조', maximum: 150 }, { name: '선택실기', maximum: 100 }],
      inputHint: '높이 110·115·120·125·130cm, F(110cm 실패·50점), 미응시(0점)를 입력해 주세요.' },
  };
  function getPolicy(formula, year = formula?.학년도) {
    let settings = formula?.기타설정;
    if (typeof settings === 'string') {
      try { settings = JSON.parse(settings); } catch { return null; }
    }
    return Number(year) === YEAR && settings?.[FEATURE] === true ? POLICIES[Number(formula?.U_ID)] || null : null;
  }
  function selection(formula, value) {
    return getPolicy(formula)?.choices.includes(value) ? value : '';
  }
  function eventNames(formula, gender) {
    const policy = getPolicy(formula);
    if (policy) return policy.events.map(event => event.name);
    return [...new Set((formula?.실기배점 || []).filter(row => !gender || row.성별 === gender).map(row => row.종목명))];
  }
  function prepare(formula, gender, practicals) {
    const policy = getPolicy(formula);
    if (!policy) return practicalInput.prepare(formula, gender, practicals);
    const names = eventNames(formula);
    const relevant = practicals.filter(row => names.includes(row.event));
    const records = names.map(event => ({ event, value: String(relevant.find(row => row.event === event)?.value ?? '').trim() }));
    if (!policy.genders.includes(gender)) return { ready: false, reason: 'invalid', records, names,
      message: '이 학과의 모집 성별을 확인해 주세요.' };
    if (new Set(relevant.map(row => row.event)).size !== relevant.length) {
      return { ready: false, reason: 'invalid', records, names, message: '종목별 기록을 하나씩 입력해 주세요.' };
    }
    const invalid = records.some(({ value }) => value && (Number(formula.U_ID) === 105
      ? !(['F', '미응시'].includes(value.toUpperCase()) || /^\d+(?:\.\d+)?$/.test(value) && [110, 115, 120, 125, 130].includes(Number(value)))
      : value !== '미응시' && (!/^\d+(?:\.\d+)?$/.test(value) || !Number.isFinite(Number(value)) || Number(value) <= 0)));
    if (invalid) return { ready: false, reason: 'invalid', records, names, message: policy.inputHint };
    if (Number(formula.U_ID) === 104 && records.some(({ event, value }) =>
      /[1-9]/.test((value.split('.')[1] || '').slice(event === '제자리멀리뛰기' ? 0 : 1)))) {
      return { ready: false, reason: 'invalid', records, names, message: policy.inputHint + ' 중간 기록은 임의로 절사하거나 반올림하지 않습니다.' };
    }
    return { ready: records.every(row => row.value !== ''), reason: 'incomplete', records, names,
      message: '객관 종목의 기록을 모두 입력해 주세요.' };
  }
  function serializeRecords(formula, practicals, selected) {
    const policy = getPolicy(formula);
    const names = policy ? eventNames(formula) : practicals.map(row => row.event);
    const record = Object.fromEntries(practicals.filter(row => names.includes(row.event) && String(row.value ?? '').trim() !== '')
      .map(row => [row.event, String(row.value).trim()]));
    if (policy) record[SELECTION_KEY] = selection(formula, selected);
    return Object.keys(record).length ? record : null;
  }
  function readResult(formula, response) {
    const policy = getPolicy(formula), result = response?.result, br = result?.breakdown;
    if (!policy || response?.success !== true || result?.totalScore !== null || br?.partial !== true ||
        typeof br.objective_complete !== 'boolean' || br.objective_max_score !== policy.maximum ||
        br.unscored_max_score !== policy.unscoredMaximum || !Array.isArray(br.events) || !Array.isArray(br.validation_errors)) {
      throw new Error('invalid-partial-result');
    }
    const score = br.objective_score;
    const complete = br.objective_complete;
    if (complete && (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > policy.maximum ||
        br.validation_errors.length || br.events.length !== policy.events.length || policy.events.some(event => {
          const matches = br.events.filter(row => row.event === event.name);
          return matches.length !== 1 || typeof matches[0].score !== 'number' || !Number.isFinite(matches[0].score) ||
            matches[0].score < 0 || matches[0].score > event.maximum;
        }) || Math.abs(br.events.reduce((sum, row) => sum + row.score, 0) - score) > 0.000001)) {
      throw new Error('invalid-objective-score');
    }
    if (!complete && score !== null) throw new Error('incomplete-objective-score');
    return { complete, score, events: br.events, errors: br.validation_errors,
      ineligible: br.ineligible === true || br.events.some(event => event.status === 'absent') };
  }
  function excludedText(policy) {
    return policy.excluded.map(event => `${event.name} ${event.maximum}점`).join(' · ') + '은 주관평가로 입력·계산에서 제외합니다.';
  }
  function subtotal(suneung, objective) {
    return typeof objective === 'number' && Number.isFinite(objective) && Number.isFinite(suneung)
      ? Math.round((suneung + objective) * 100) / 100 : null;
  }
  return { getPolicy, eventNames, prepare, serializeRecords, selection, readResult, excludedText, subtotal, SELECTION_KEY, INELIGIBLE_MESSAGE };
});
