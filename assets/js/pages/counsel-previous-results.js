(function (root, factory) {
  'use strict';

  var feature = factory();
  if (typeof module === 'object' && module.exports) module.exports = feature;
  if (!root || !root.document) return;
  root.CounselPreviousResults = feature;
  feature.init(root.document, root);
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var MODAL_ID = 'modalPreviousResults';
  var TRIGGER_ACTION = 'previous-results';
  var PASS_PATTERN = /^(합격|합|OK|PASS|Y|(?:최초|최종|추가|충원)합(?:격)?)$/i;
  var FINAL_FAIL_PATTERN = /^(불합격|불합|탈락|실패|N)$/i;
  var LOAD_ERROR_MESSAGE = '전년도 결과를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';
  var cache = new Map();
  var activeTrigger = null;

  function previousAcademicYear(value) {
    var year = Number(value);
    return Number.isInteger(year) && year > 1 ? year - 1 : null;
  }

  function acceptedStatus(applicant) {
    var result = applicant && applicant.result ? applicant.result : {};
    var finalResult = String(result.final || '').trim();
    var firstResult = String(result.first || '').trim();
    if (FINAL_FAIL_PATTERN.test(finalResult)) return null;
    if (PASS_PATTERN.test(finalResult)) return finalResult;
    if (PASS_PATTERN.test(firstResult)) return firstResult;
    return null;
  }

  function scoreTotal(applicant) {
    var total = Number(applicant && applicant.scores && applicant.scores.total);
    return Number.isFinite(total) ? total : -Infinity;
  }

  function selectAcceptedApplicants(applicants) {
    return (Array.isArray(applicants) ? applicants : [])
      .map(function (applicant) {
        var acceptedLabel = acceptedStatus(applicant);
        return acceptedLabel ? Object.assign({}, applicant, { acceptedLabel: acceptedLabel }) : null;
      })
      .filter(Boolean)
      .sort(function (left, right) { return scoreTotal(right) - scoreTotal(left); });
  }

  function acceptedApplicantsFromPayload(payload) {
    if (!payload || payload.success !== true || !Array.isArray(payload.applicants)) {
      throw new Error('invalid previous results payload');
    }
    return selectAcceptedApplicants(payload.applicants);
  }

  function nullableNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    var number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function normalizePracticalEvents(applicant) {
    var eventMap = new Map();
    var detail = applicant && applicant.practicalDetail;
    var detailEvents = detail && Array.isArray(detail.events) ? detail.events : [];
    detailEvents.forEach(function (item) {
      var eventName = String(item && (item.event || item.종목명) || '').trim();
      if (!eventName) return;
      eventMap.set(eventName, {
        event: eventName,
        record: item.record ?? item.기록 ?? null,
        score: nullableNumber(item.score ?? item.점수 ?? item.배점),
        deductionLevel: nullableNumber(item.deduction_level ?? item.deductionLevel ?? item.감점),
      });
    });

    var records = applicant && applicant.practicalRecords;
    if (records && typeof records === 'object' && !Array.isArray(records)) {
      Object.entries(records).forEach(function (entry) {
        var eventName = String(entry[0] || '').trim();
        if (!eventName) return;
        var existing = eventMap.get(eventName);
        if (existing) {
          if (existing.record === null || existing.record === undefined || existing.record === '') {
            existing.record = entry[1];
          }
          return;
        }
        eventMap.set(eventName, {
          event: eventName,
          record: entry[1],
          score: null,
          deductionLevel: null,
        });
      });
    }
    return Array.from(eventMap.values());
  }

  function buildResultsPath(uid, year) {
    var query = new URLSearchParams({
      U_ID: String(uid),
      year: String(year),
      includeApplicants: '1',
      includeApplicantNames: '1',
    });
    return '/jungsi/analysis/max-live-results?' + query.toString();
  }

  function formatNumber(value) {
    var number = nullableNumber(value);
    if (number === null) return '-';
    return number.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
  }

  function createElement(documentRef, tag, className, text) {
    var element = documentRef.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined && text !== null) element.textContent = String(text);
    return element;
  }

  function appendMetric(documentRef, container, label, value) {
    var item = createElement(documentRef, 'div', 'previous-results-metric');
    item.appendChild(createElement(documentRef, 'span', 'label', label));
    item.appendChild(createElement(documentRef, 'strong', 'value', formatNumber(value)));
    container.appendChild(item);
  }

  function subjectText(score) {
    if (!score || typeof score !== 'object') return '자료 없음';
    var values = [];
    if (nullableNumber(score.standard) !== null) values.push('표준 ' + formatNumber(score.standard));
    if (nullableNumber(score.percentile) !== null) values.push('백분위 ' + formatNumber(score.percentile));
    if (nullableNumber(score.grade) !== null) values.push(formatNumber(score.grade) + '등급');
    return values.length ? values.join(' · ') : '자료 없음';
  }

  function createAcademicPanel(documentRef, scores) {
    var panel = createElement(documentRef, 'section', 'previous-results-panel');
    panel.appendChild(createElement(documentRef, 'h4', '', '수능 성적'));
    var list = createElement(documentRef, 'dl', 'previous-results-definition-list');
    [
      ['국어', scores && scores.korean],
      ['수학', scores && scores.math],
      ['영어', scores && scores.english],
      ['한국사', scores && scores.history],
      ['탐구 1', scores && scores.inquiry1],
      ['탐구 2', scores && scores.inquiry2],
    ].forEach(function (row) {
      list.appendChild(createElement(documentRef, 'dt', '', row[0]));
      list.appendChild(createElement(documentRef, 'dd', '', subjectText(row[1])));
    });
    panel.appendChild(list);
    return panel;
  }

  function practicalValueText(event) {
    var parts = [];
    if (event.record !== null && event.record !== undefined && event.record !== '') {
      parts.push('기록 ' + String(event.record));
    }
    if (event.score !== null) parts.push('환산 ' + formatNumber(event.score) + '점');
    if (event.deductionLevel !== null) parts.push(event.deductionLevel + '감');
    return parts.length ? parts.join(' · ') : '기록 없음';
  }

  function createPracticalPanel(documentRef, applicant) {
    var panel = createElement(documentRef, 'section', 'previous-results-panel');
    panel.appendChild(createElement(documentRef, 'h4', '', '실기 기록'));
    var events = normalizePracticalEvents(applicant);
    if (!events.length) {
      panel.appendChild(createElement(documentRef, 'p', 'previous-results-empty-inline', '등록된 실기 기록이 없습니다.'));
      return panel;
    }
    var list = createElement(documentRef, 'dl', 'previous-results-definition-list practical');
    events.forEach(function (event) {
      list.appendChild(createElement(documentRef, 'dt', '', event.event));
      list.appendChild(createElement(documentRef, 'dd', '', practicalValueText(event)));
    });
    panel.appendChild(list);
    return panel;
  }

  function applicantMeta(applicant) {
    return [applicant.schoolName, applicant.branch, applicant.gender]
      .filter(function (value) { return value !== null && value !== undefined && String(value).trim(); })
      .join(' · ');
  }

  function createApplicantRow(documentRef, applicant, index) {
    var details = createElement(documentRef, 'details', 'previous-results-row');
    if (index === 0) details.open = true;
    var summary = createElement(documentRef, 'summary', 'previous-results-summary');
    var identity = createElement(documentRef, 'span', 'previous-results-identity');
    identity.appendChild(createElement(documentRef, 'strong', '', applicant.name || ('합격자 ' + (index + 1))));
    identity.appendChild(createElement(documentRef, 'small', '', applicantMeta(applicant) || '학생 정보'));
    summary.appendChild(identity);
    summary.appendChild(createElement(documentRef, 'span', 'previous-results-pass', applicant.acceptedLabel));
    summary.appendChild(createElement(documentRef, 'i', 'ph-light ph-caret-down previous-results-caret'));
    details.appendChild(summary);

    var content = createElement(documentRef, 'div', 'previous-results-content');
    var metrics = createElement(documentRef, 'div', 'previous-results-metrics');
    appendMetric(documentRef, metrics, '수능 환산', applicant.scores && applicant.scores.suneung);
    appendMetric(documentRef, metrics, '내신', applicant.scores && applicant.scores.naeshin);
    appendMetric(documentRef, metrics, '실기', applicant.scores && applicant.scores.practical);
    appendMetric(documentRef, metrics, '총점', applicant.scores && applicant.scores.total);
    content.appendChild(metrics);
    var panels = createElement(documentRef, 'div', 'previous-results-panels');
    panels.appendChild(createAcademicPanel(documentRef, applicant.scores));
    panels.appendChild(createPracticalPanel(documentRef, applicant));
    content.appendChild(panels);
    details.appendChild(content);
    return details;
  }

  function setBodyState(documentRef, state, message) {
    var body = documentRef.getElementById('previousResultsModalBody');
    if (!body) return;
    body.replaceChildren();
    var box = createElement(documentRef, 'div', 'previous-results-state ' + state);
    var iconClass = state === 'loading' ? 'ph-light ph-circle-notch spin' : 'ph-light ph-info';
    box.appendChild(createElement(documentRef, 'i', iconClass));
    box.appendChild(createElement(documentRef, 'p', '', message));
    body.appendChild(box);
  }

  function renderResults(documentRef, applicants, year) {
    var body = documentRef.getElementById('previousResultsModalBody');
    if (!body) return;
    body.replaceChildren();
    if (!applicants.length) {
      setBodyState(documentRef, 'empty', year + '학년도 합격 결과가 아직 없습니다.');
      return;
    }
    var intro = createElement(documentRef, 'div', 'previous-results-intro');
    intro.appendChild(createElement(documentRef, 'strong', '', '합격자 ' + applicants.length + '명'));
    intro.appendChild(createElement(documentRef, 'span', '', '맥스라이브에 확정 입력된 최초합·최종합·추가합 결과 기준'));
    body.appendChild(intro);
    var list = createElement(documentRef, 'div', 'previous-results-list');
    applicants.forEach(function (applicant, index) {
      list.appendChild(createApplicantRow(documentRef, applicant, index));
    });
    body.appendChild(list);
  }

  function createModal(documentRef) {
    var existing = documentRef.getElementById(MODAL_ID);
    if (existing) return existing;
    var overlay = createElement(documentRef, 'div', 'modal-overlay');
    overlay.id = MODAL_ID;
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = [
      '<div class="modal-shell wide" role="dialog" aria-modal="true" aria-labelledby="previousResultsModalTitle" tabindex="-1">',
      '<div class="modal">',
      '<div class="modal-head">',
      '<span class="modal-eyebrow">전년도 · 합격자</span>',
      '<div class="modal-title" id="previousResultsModalTitle">전년도 결과</div>',
      '<button class="icon-btn" type="button" data-previous-results-close aria-label="전년도 결과 닫기"><i class="ph-light ph-x"></i></button>',
      '</div>',
      '<div class="modal-body" id="previousResultsModalBody"></div>',
      '</div>',
      '</div>',
    ].join('');
    documentRef.body.appendChild(overlay);
    return overlay;
  }

  function closeModal(documentRef) {
    var modal = documentRef.getElementById(MODAL_ID);
    if (!modal || !modal.classList.contains('open')) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    if (activeTrigger && documentRef.contains(activeTrigger)) activeTrigger.focus();
    activeTrigger = null;
  }

  function focusableElements(modal) {
    return Array.from(modal.querySelectorAll('button, summary, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
      .filter(function (element) { return !element.disabled && element.offsetParent !== null; });
  }

  function bindModal(documentRef, modal) {
    modal.querySelector('[data-previous-results-close]').addEventListener('click', function () {
      closeModal(documentRef);
    });
    modal.addEventListener('click', function (event) {
      if (event.target === modal) closeModal(documentRef);
    });
    documentRef.addEventListener('keydown', function (event) {
      if (!modal.classList.contains('open')) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeModal(documentRef);
        return;
      }
      if (event.key !== 'Tab') return;
      var items = focusableElements(modal);
      if (!items.length) return;
      var first = items[0];
      var last = items[items.length - 1];
      if (event.shiftKey && documentRef.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && documentRef.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }, true);
  }

  async function openResults(documentRef, windowRef, trigger) {
    var shell = trigger.closest('.uni-card-shell');
    var uid = shell && shell.dataset.uid;
    var currentYear = documentRef.getElementById('yearSel');
    var year = previousAcademicYear(currentYear && currentYear.value);
    if (!uid || !year) return;

    activeTrigger = trigger;
    var modal = createModal(documentRef);
    var university = shell.querySelector('.uni-name');
    var department = shell.querySelector('.uni-dept');
    documentRef.getElementById('previousResultsModalTitle').textContent =
      [university && university.textContent.trim(), department && department.textContent.trim(), year + '학년도 합격자']
        .filter(Boolean).join(' · ');
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    modal.querySelector('[role="dialog"]').focus();
    setBodyState(documentRef, 'loading', '전년도 합격 결과를 불러오는 중입니다.');

    var key = uid + ':' + year;
    try {
      var payload = cache.has(key)
        ? cache.get(key)
        : await windowRef.api(buildResultsPath(uid, year));
      cache.set(key, payload);
      renderResults(documentRef, acceptedApplicantsFromPayload(payload), year);
    } catch (_) {
      setBodyState(documentRef, 'error', LOAD_ERROR_MESSAGE);
    }
  }

  function ensureTrigger(documentRef, actions) {
    if (!actions || actions.querySelector('[data-action="' + TRIGGER_ACTION + '"]')) return;
    var shell = actions.closest('.uni-card-shell');
    if (!shell || !shell.dataset.uid) return;
    var trigger = createElement(documentRef, 'button', 'mini-btn previous-results-trigger');
    trigger.type = 'button';
    trigger.dataset.action = TRIGGER_ACTION;
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.innerHTML = '<i class="ph-light ph-clock-counter-clockwise"></i><span>전년도 결과</span>';
    var crossGun = actions.querySelector('[onclick*="openCrossGunModal"]');
    actions.insertBefore(trigger, crossGun || null);
    shell.classList.add('previous-results-enabled');
  }

  function ensureAllTriggers(documentRef) {
    documentRef.querySelectorAll('.uni-card-shell .uni-actions').forEach(function (actions) {
      ensureTrigger(documentRef, actions);
    });
  }

  function init(documentRef, windowRef) {
    if (!documentRef || documentRef.documentElement.dataset.previousResultsReady === '1') return;
    documentRef.documentElement.dataset.previousResultsReady = '1';
    var modal = createModal(documentRef);
    bindModal(documentRef, modal);
    ensureAllTriggers(documentRef);
    documentRef.addEventListener('click', function (event) {
      var trigger = event.target.closest('[data-action="' + TRIGGER_ACTION + '"]');
      if (trigger) openResults(documentRef, windowRef, trigger);
    });
    var board = documentRef.getElementById('gunBoard') || documentRef.body;
    var queued = false;
    new windowRef.MutationObserver(function () {
      if (queued) return;
      queued = true;
      windowRef.requestAnimationFrame(function () {
        queued = false;
        ensureAllTriggers(documentRef);
      });
    }).observe(board, { childList: true, subtree: true });
  }

  return {
    LOAD_ERROR_MESSAGE: LOAD_ERROR_MESSAGE,
    previousAcademicYear: previousAcademicYear,
    acceptedStatus: acceptedStatus,
    selectAcceptedApplicants: selectAcceptedApplicants,
    acceptedApplicantsFromPayload: acceptedApplicantsFromPayload,
    normalizePracticalEvents: normalizePracticalEvents,
    buildResultsPath: buildResultsPath,
    init: init,
  };
});
