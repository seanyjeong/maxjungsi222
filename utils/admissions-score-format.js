'use strict';
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../config/admissions-score-format'));
  else root.AdmissionsScoreFormat = factory(root.AdmissionsScoreFormatConfig);
})(typeof window === 'undefined' ? globalThis : window, function (config) {
  function digits(formula) {
    let settings = formula?.기타설정;
    if (typeof settings === 'string') {
      try { settings = JSON.parse(settings); } catch { settings = null; }
    }
    const profile = config.profiles.find(row => Number(formula?.U_ID) === row.uid &&
      Number(formula?.학년도) === row.year && settings?.[row.feature] === true);
    return profile?.digits ?? config.defaultDigits;
  }
  function format(value, formula) { return Number(value).toFixed(digits(formula)); }
  return {format, digits};
});
