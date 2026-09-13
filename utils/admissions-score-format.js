'use strict';
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AdmissionsScoreFormat = factory();
})(typeof window === 'undefined' ? globalThis : window, function () {
  const DEFAULT_DIGITS = 2, KONKUK_DIGITS = 3, YEAR = 2027, KONKUK_UID = 71;
  function digits(formula) {
    let settings = formula?.기타설정;
    if (typeof settings === 'string') {
      try { settings = JSON.parse(settings); } catch { settings = null; }
    }
    return Number(formula?.U_ID) === KONKUK_UID && Number(formula?.학년도) === YEAR &&
      settings?.relativeCsat2027Reviewed === true ? KONKUK_DIGITS : DEFAULT_DIGITS;
  }
  function format(value, formula) { return Number(value).toFixed(digits(formula)); }
  return {format, digits};
});
