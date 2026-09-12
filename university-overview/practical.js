'use strict';
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.UniversityPractical = factory();
})(typeof window === 'undefined' ? globalThis : window, function () {
  const HEADERS = ['종목', '최고 배점 기록', '최고 배점', '급간 점수 차이'];
  const LEGACY_DONGGUK = { uid: 13, year: 2026, maximum: 100 };
  const EXCEPTION_RECORD = /미응시|결시|실격|파울|기권|불합격/;

  function parsed(value, fallback) {
    if (typeof value !== 'string') return value ?? fallback;
    try { return JSON.parse(value); } catch { return fallback; }
  }
  function numberOrNull(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value !== 'string' || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  function recordText(value) {
    return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
  }
  function unique(values) { return [...new Set(values)]; }
  function isException(level) { return EXCEPTION_RECORD.test(level.record); }
  function summarize(event, levels) {
    const regular = levels.filter(level => !isException(level) && level.score !== null);
    const scores = unique(regular.map(level => level.score)).sort((a, b) => b - a);
    const top = scores[0] ?? null;
    const records = top === null ? [] : unique(regular.filter(level => level.score === top).map(level => level.record));
    const gaps = scores.slice(1).map((score, index) => Number((scores[index] - score).toPrecision(12)));
    let deduction = '—';
    // 누락 급간 사이의 차이를 정상적인 한 급간 감점으로 오해하지 않도록 한다.
    if (gaps.length && !levels.some(level => !isException(level) && level.score === null)) {
      const min = Math.min(...gaps), max = Math.max(...gaps);
      deduction = min === max ? `-${min}` : `-${min} ~ -${max}`;
    }
    return { event, record: records.filter(Boolean).join(' / ') || '—', score: top, deduction, levels };
  }
  function policyFor(formula, module) {
    return typeof module?.getPolicy === 'function' ? module.getPolicy(formula) : null;
  }
  function policyNotices(policy) {
    const excluded = Array.isArray(policy.excluded) ? policy.excluded.map(event => `${event.name} ${event.maximum}점`).join(' · ') : '';
    const choices = Array.isArray(policy.choices) ? policy.choices.join(' / ') : '';
    return [
      `${policy.label} ${policy.maximum}점의 객관 종목만 표시합니다. 주관평가를 포함한 최종 실기 총점은 계산하지 않습니다.`,
      excluded ? `${excluded}은 주관평가로 입력·계산에서 제외합니다.` : '',
      choices ? `${policy.selectionLabel}: ${choices} 중 선택하며 객관점수에는 영향을 주지 않습니다.` : '',
      policy.inputHint || '',
    ].filter(Boolean);
  }
  function legacyModel(formula, gender, hardcoded) {
    if (Number(formula.U_ID) !== LEGACY_DONGGUK.uid) return null;
    const reference = hardcoded?.[String(formula.U_ID)];
    if (!reference?.events || typeof reference.events !== 'object') return null;
    const genders = Object.keys(reference.events).filter(key => Array.isArray(reference.events[key]) && reference.events[key].length);
    const rows = (Array.isArray(reference.events[gender]) ? reference.events[gender] : []).map(event => ({
      event: recordText(event.종목), record: recordText(event.max) || '—', score: LEGACY_DONGGUK.maximum,
      deduction: recordText(event.min) || '—', levels: [
        { record: recordText(event.max), score: LEGACY_DONGGUK.maximum },
        { record: recordText(event.min), score: 0 },
      ],
    }));
    const current = Number(formula.학년도) === LEGACY_DONGGUK.year;
    return { headers: ['종목', '100점 기준', '종목 기준점수', '0점 기준'], rows, genders,
      notices: [current ? '2026학년도 동국대학교 정시모집요강 기준표입니다.'
        : '2026학년도 기존 기준 참고표입니다. 선택한 학년도의 최신 원문 검증을 완료한 표가 아닙니다.',
      '선형 환산 방식으로 종목별 기준점을 표시합니다. 중간 기록은 두 기준 사이에서 환산하며 아래 두 행은 전체 급간표가 아닙니다.',
      reference.note].filter(Boolean), emptyMessage: rows.length ? '' : '해당 성별 배점 데이터가 없습니다.' };
  }
  function build(value, gender, options = {}) {
    const formula = parsed(value, {});
    if (!formula || typeof formula !== 'object' || Array.isArray(formula)) {
      return { headers: HEADERS.slice(), rows: [], notices: [], emptyMessage: '등록된 실기 배점표가 없습니다.', genders: [] };
    }
    const source = parsed(formula.실기배점, []);
    const table = Array.isArray(source) ? source.filter(row => row && typeof row === 'object' && !Array.isArray(row)) : [];
    if (numberOrNull(formula.실기) === 0 || numberOrNull(formula.실기총점) === 0 && !table.length) {
      return { headers: HEADERS.slice(), rows: [], notices: [], emptyMessage: '실기 반영 없음', genders: [] };
    }
    const policy = policyFor(formula, options.subjectivePolicy);
    const legacy = !policy && legacyModel(formula, gender, options.hardcoded);
    if (legacy) return legacy;
    const objectiveNames = policy ? policy.events.map(event => event.name) : null;
    const applicable = table.filter(row => recordText(row.종목명) && (!objectiveNames || objectiveNames.includes(recordText(row.종목명))));
    const genders = unique(applicable.map(row => recordText(row.성별)).filter(Boolean))
      .filter(value => !policy || !Array.isArray(policy.genders) || policy.genders.includes(value));
    const grouped = new Map();
    if (genders.includes(gender)) for (const row of applicable.filter(row => recordText(row.성별) === gender)) {
      const event = recordText(row.종목명);
      if (!grouped.has(event)) grouped.set(event, []);
      grouped.get(event).push({ record: recordText(row.기록), score: numberOrNull(row.배점) });
    }
    const order = Array.isArray(options.eventOrder) ? unique(options.eventOrder.filter(event => grouped.has(event))) : [];
    const names = [...order, ...[...grouped.keys()].filter(event => !order.includes(event))];
    const rows = names.map(event => summarize(event, grouped.get(event)));
    const notices = policy ? policyNotices(policy) : [];
    if (rows.length) notices.push('종목별 등록 배점이며 최종 실기 반영점수와 단위가 다를 수 있습니다. 전형·환산 안내를 함께 확인하세요.');
    if (formula.실기모드 && formula.실기모드 !== 'basic') {
      notices.push('특수 환산 방식입니다. 아래 값은 등록된 종목별 배점표 기준이며 최종 실기 반영점수와 다를 수 있습니다.');
    }
    if (rows.some(row => row.levels.some(level => level.score === null))) {
      notices.push('배점이 비어 있거나 숫자로 확인되지 않는 기록은 미확인으로 표시하며 0점으로 환산하지 않습니다.');
    }
    if (rows.some(row => row.levels.some(isException))) {
      notices.push('미응시·실격·파울 등 별도 판정은 전체 기록에서 확인할 수 있으며 정상 급간의 점수 차이에는 포함하지 않습니다.');
    }
    return { headers: HEADERS.slice(), rows, notices, genders,
      emptyMessage: rows.length ? '' : applicable.length ? '해당 성별 배점 데이터가 없습니다.' : '등록된 실기 배점표가 없습니다.' };
  }
  return { build };
});
