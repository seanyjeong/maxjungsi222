(function (root, factory) {
  'use strict';
  var modules = factory();
  if (typeof module === 'object' && module.exports) module.exports = modules;
  if (root) root.ET_PAGE_MODULES = modules;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  return Object.freeze({
    counsel: Object.freeze({
      styles: Object.freeze(['assets/css/pages/counsel-previous-results.css']),
      scripts: Object.freeze(['assets/js/pages/counsel-previous-results.js']),
    }),
  });
});
