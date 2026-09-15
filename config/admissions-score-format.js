'use strict';
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AdmissionsScoreFormatConfig = factory();
})(typeof window === 'undefined' ? globalThis : window, function () {
  return Object.freeze({defaultDigits: 2, profiles: Object.freeze([
    {uid: 71, year: 2027, feature: 'relativeCsat2027Reviewed', digits: 3},
    {uid: 195, year: 2027, feature: 'keimyung2027UnitNormalized', digits: 4},
    {uid: 165, year: 2027, feature: 'hufsCsat2027Reviewed', digits: 6},
    {uid: 166, year: 2027, feature: 'hufsCsat2027Reviewed', digits: 6},
    {uid: 167, year: 2027, feature: 'hufsCsat2027Reviewed', digits: 6},
    {uid: 173, year: 2027, feature: 'pknuCsat2027Reviewed', digits: 4},
    {uid: 174, year: 2027, feature: 'pnuCsat2027Reviewed', digits: 4},
  ])});
});
