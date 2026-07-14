(function () {
  'use strict';

  if (typeof window.api !== 'function' || typeof window.renderPreviousCompetitionDetails !== 'function') return;

  var originalApi = window.api;
  var latestFormulaRequest = 0;
  var latestSchoolYear = null;
  var schoolTags = {};

  function targets() {
    return Array.prototype.slice.call(document.querySelectorAll('[data-competition-rate]'));
  }

  function render(html) {
    targets().forEach(function (element) {
      element.hidden = false;
      element.innerHTML = html;
    });
  }

  function hide() {
    targets().forEach(function (element) {
      element.hidden = true;
      element.replaceChildren();
    });
  }

  function requestYear(path) {
    try {
      return new URL(path, window.location.href).searchParams.get('year');
    } catch (_) {
      var match = String(path).match(/[?&]year=([^&]+)/);
      return match ? decodeURIComponent(match[1]) : null;
    }
  }

  function rememberSchoolTags(path, data) {
    var match = String(path).match(/^\/jungsi\/schools\/(\d{4})/);
    if (!match || !data || !Array.isArray(data.list)) return;
    latestSchoolYear = match[1];
    data.list.forEach(function (school) {
      schoolTags[latestSchoolYear + ':' + school.U_ID] = school.tags;
    });
  }

  if (typeof document.addEventListener === 'function') {
    document.addEventListener('click', function (event) {
      var row = event.target && event.target.closest ? event.target.closest('tr[data-uid]') : null;
      if (!row || !latestSchoolYear) return;
      var key = latestSchoolYear + ':' + row.dataset.uid;
      if (!Object.prototype.hasOwnProperty.call(schoolTags, key)) return;
      render(window.renderPreviousCompetitionDetails(schoolTags[key], latestSchoolYear));
    });
  }

  window.api = async function (path, options) {
    var isFormula = String(path).indexOf('/jungsi/formula-details') === 0;
    var isSchoolList = /^\/jungsi\/schools\//.test(String(path));
    var resetsSelection = /^\/jungsi\/(?:schools\/|university-list|counseling\/saved-universes\/)/.test(String(path));
    if (resetsSelection) hide();
    if (!isFormula) {
      var response = await originalApi.call(window, path, options);
      if (isSchoolList) rememberSchoolTags(path, response);
      return response;
    }

    var requestId = ++latestFormulaRequest;
    var year = requestYear(path);
    render('<span class="previous-competition-loading">전년도 경쟁률을 불러오는 중입니다.</span>');
    try {
      var data = await originalApi.call(window, path, options);
      if (requestId === latestFormulaRequest) {
        var formula = data && data.formula ? data.formula : data;
        render(window.renderPreviousCompetitionDetails(formula && formula.tags, year));
      }
      return data;
    } catch (error) {
      if (requestId === latestFormulaRequest) {
        render('<span class="previous-competition-error">전년도 경쟁률을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</span>');
      }
      throw error;
    }
  };
})();
