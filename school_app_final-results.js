/* 맥스라이브 합격 결과 표시·정렬 이상 감지 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MaxFinalApplicantResults = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  function resultBadge(label, value, escapeHtml) {
    if (value == null || value === '') return '';
    const text = String(value).trim();
    if (!text || text === '-' || text === '0') return '';
    let className = 'result-badge';
    if (/합격|합|OK|최초합/i.test(text)) className += ' result-pass';
    else if (/예비/i.test(text)) className += ' result-wait';
    else if (/불합격|불합|탈락/i.test(text)) className += ' result-fail';
    const esc = escapeHtml || (item => item);
    return '<span class="' + className + '"><span class="r-lbl">' + esc(label)
      + '</span><span class="r-val">' + esc(text) + '</span></span>';
  }

  function resultTier(applicant) {
    const final = String(applicant.result_final || '').trim();
    const first = String(applicant.result_first || '').trim();
    const stageOne = String(applicant.result_1st || '').trim();
    const pass = /^(합격|합|OK|최초합|최종합|PASS|Y)$/i;
    const fail = /불합|불$|탈락|실패|N$/i;
    const wait = /예비|대기/;
    const waitNumber = value => parseInt((String(value).match(/\d+/) || ['9999'])[0], 10);

    if (pass.test(final)) return 1;
    if (fail.test(final)) return 3;
    if (pass.test(first)) return 1;
    if (fail.test(first)) return 3;
    if (wait.test(first)) return 2 + waitNumber(first) / 10000;
    if (pass.test(stageOne)) return 1.5;
    if (fail.test(stageOne)) return 3;
    if (wait.test(stageOne)) return 2 + waitNumber(stageOne) / 10000;
    return 99;
  }

  function detectAnomalySet(applicants) {
    const entries = applicants.map((applicant, index) => ({
      index,
      tier: resultTier(applicant),
      total: Number(applicant.total_score) || 0,
    }));
    const anomalies = new Set();
    entries.forEach(current => {
      if (current.tier !== 1 || current.total <= 0) return;
      const inverted = entries.some(other => (
        other.index !== current.index
        && other.tier !== 99
        && other.total > current.total
        && other.tier > 1
      ));
      if (inverted) anomalies.add(current.index);
    });
    return anomalies;
  }

  return { detectAnomalySet, resultBadge, resultTier };
});
