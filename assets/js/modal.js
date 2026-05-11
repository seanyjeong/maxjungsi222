/* ============================================================ */
/* modal.js — 공용 모달 shell (open/close + backdrop 클릭 시 닫기) */
/* ============================================================ */

(function () {
  'use strict';

  function resolve(id) {
    return typeof id === 'string' ? document.getElementById(id) : id;
  }

  window.openModal = function (id) {
    var el = resolve(id);
    if (!el) return;
    el.classList.add('show');
    if (!el.dataset.backdropBound) {
      el.addEventListener('click', function (e) {
        if (e.target === el) el.classList.remove('show');
      });
      el.dataset.backdropBound = '1';
    }
  };

  window.closeModal = function (id) {
    var el = resolve(id);
    if (!el) return;
    el.classList.remove('show');
  };
})();
