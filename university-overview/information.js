'use strict';
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.UniversityInformation = factory();
})(typeof window === 'undefined' ? globalThis : window, function () {
  function object(value) {
    if (typeof value === 'string') {
      try { return JSON.parse(value) || {}; } catch { return {}; }
    }
    return value && typeof value === 'object' ? value : {};
  }

  function numeric(value) {
    if (value == null || typeof value === 'boolean' || String(value).trim() === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function selectionSummary(formula) {
    const rule = object(formula.selection_rules);
    const subjects = Array.isArray(rule.from) ? rule.from.join('·') : '';
    if (!subjects) return '';
    if (rule.type === 'select_n' && numeric(rule.count) > 0) {
      return `${subjects} 중 상위 ${rule.count}개 영역 선택`;
    }
    if (rule.type === 'select_ranked_weights' && Array.isArray(rule.weights)) {
      const weights = rule.weights.map(numeric);
      if (weights.length && weights.every(value => value != null && value > 0)) {
        return `${subjects} 중 상위 ${weights.length}개 영역을 ${weights.map(value => +(value * 100).toFixed(2) + '%').join('·')} 반영`;
      }
    }
    return '';
  }

  function gradeRows(value) {
    const scores = object(value);
    return Object.entries(scores).filter(([grade, score]) => /^[1-9]$/.test(grade) && numeric(score) != null)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([grade, score]) => ({ grade: Number(grade), score: numeric(score) }));
  }

  function build(formula, subjective, review) {
    const total = numeric(formula.총점), practical = numeric(formula.실기총점);
    const policy = subjective?.getPolicy(formula) || null;
    const items = [];
    if (review?.withholdTotal) items.push({ label: '전형 총점', value: '환산 단위 확인 중' });
    else if (total != null) items.push({ label: '전형 총점', value: `${total}점` });
    if (practical != null && practical > 0) items.push({ label: '실기 만점(등록 기준)', value: `${practical}점` });
    if (policy) {
      items.push({ label: '계산 가능한 실기', value: `${policy.label} ${policy.maximum}점` });
      items.push({ label: '주관평가', value: `${policy.unscoredMaximum}점 · 계산 제외` });
    }
    const notes = [];
    const selection = selectionSummary(formula);
    if (selection) notes.push(selection);
    const inquiry = object(object(formula.score_config).inquiry);
    if (inquiry.fixed_subject_count === 2) notes.push('탐구는 2과목 합을 2로 나누어 반영합니다.');
    if (formula.한국사방식) notes.push(`한국사: ${formula.한국사방식}`);
    if (policy) {
      if (!review) notes.push(subjective.excludedText(policy));
      notes.push(`${policy.selectionLabel}: ${policy.choices.join('·')} 중 선택. 개인상담과 통합계산기에서 선택할 수 있습니다.`);
      notes.push('상담에서는 수능과 객관실기 소계만 표시하며, 주관평가를 포함한 최종총점·순위는 산출하지 않습니다.');
    }
    return { items, notes, english: gradeRows(formula.english_scores), history: gradeRows(formula.history_scores),
      extra: typeof formula.기타 === 'string' ? formula.기타.trim() : '' };
  }

  function getReview(catalog, uid, year) {
    return Number(year) === Number(catalog?.year) ? catalog.schools?.[String(uid)] || null : null;
  }

  return { build, getReview, gradeRows, selectionSummary, numeric };
});
