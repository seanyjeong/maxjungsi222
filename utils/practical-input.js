'use strict';
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./practical-requirements'));
  else root.PracticalInput = factory(root.PracticalRequirements);
})(typeof window === 'undefined' ? globalThis : window, function (profiles) {
  const messages = {
    incomplete: '실기 기록을 모두 입력해 주세요.',
    alternative: '일반 종목과 우천 대체 종목 중 하나만 입력해 주세요.',
    invalid: '입력한 실기 기록을 확인해 주세요.',
    failed: '점수를 계산하지 못했습니다. 잠시 후 다시 시도해 주세요.',
    calculating: '점수를 계산하고 있어요.',
  };
  function prepare(formula, gender, practicals) {
    const records = practicals.map(record => ({ event: record.event, value: String(record.value ?? '').trim() }));
    const known = Number(formula.학년도) === 2027 ? profiles[Number(formula.U_ID)] : null;
    const tableNames = [...new Set((formula.실기배점 || []).filter(row => row.성별 === gender).map(row => row.종목명))];
    const expected = known?.genders[gender] || [];
    // 편집기에서 종목을 바꾼 표에는 과거 종목 구성을 강제하지 않는다.
    const compatible = !Array.isArray(formula.실기배점) ||
      (tableNames.length === expected.length && expected.every(name => tableNames.includes(name)));
    const profile = compatible ? known : null;
    const entered = records.filter(record => record.value !== '');
    let names = profile?.genders[gender] || tableNames;
    const alternatives = profile?.alternatives;
    if (alternatives) {
      const normal = entered.some(record => record.event === alternatives.normal);
      const rain = entered.some(record => record.event === alternatives.rain);
      if (normal && rain) return { ready: false, reason: 'alternative', records, names };
      names = names.filter(name => name !== (rain ? alternatives.normal : alternatives.rain));
    }
    const relevant = entered.filter(record => names.includes(record.event));
    if (new Set(relevant.map(record => record.event)).size !== relevant.length ||
        relevant.some(record => !/^(?:-?(?:\d+(?:\.\d*)?|\.\d+)|[A-G]|미응시|파울|실격|P|PASS)$/i.test(record.value))) {
      return { ready: false, reason: 'invalid', records, names };
    }
    const complete = names.map(event => relevant.find(record => record.event === event) || { event, value: '' });
    return { ready: complete.every(record => record.value !== ''), reason: 'incomplete',
      records: complete, names, profiled: !!profile };
  }
  function resultScore(response) {
    const raw = response?.result?.totalScore;
    if (!response?.success || raw === null || raw === undefined || String(raw).trim() === '' ||
        !Number.isFinite(Number(raw))) throw new Error('invalid-score');
    return Number(raw);
  }
  return { prepare, resultScore, messages };
});
