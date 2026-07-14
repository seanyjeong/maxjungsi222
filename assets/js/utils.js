/* ============================================================ */
/* utils.js — debounce / 한국 날짜 포맷 / 상대시간 / escapeHtml / isMac */
/* ============================================================ */

(function () {
  'use strict';

  window.debounce = function (fn, wait) {
    var t;
    return function () {
      var args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, wait);
    };
  };

  // 2026.04.18 형식
  window.formatDateKo = function (d) {
    var dt = (d instanceof Date) ? d : new Date(d);
    if (isNaN(dt.getTime())) return '';
    var y = dt.getFullYear();
    var m = String(dt.getMonth() + 1).padStart(2, '0');
    var day = String(dt.getDate()).padStart(2, '0');
    return y + '.' + m + '.' + day;
  };

  // "저장됨 · N초 전" 류의 상대시간
  window.formatRelative = function (ts) {
    if (ts == null) return '';
    var then = (ts instanceof Date) ? ts.getTime() : new Date(ts).getTime();
    if (isNaN(then)) return '';
    var diff = Math.max(0, Math.floor((Date.now() - then) / 1000));
    if (diff < 5) return '방금 전';
    if (diff < 60) return diff + '초 전';
    if (diff < 3600) return Math.floor(diff / 60) + '분 전';
    if (diff < 86400) return Math.floor(diff / 3600) + '시간 전';
    return Math.floor(diff / 86400) + '일 전';
  };

  window.escapeHtml = function (s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  window.isMac = function () {
    return /Mac|iPad|iPhone/.test(navigator.platform);
  };

  // 모집정원 — 값과 증감을 분리. "명" 뒤에 증감이 와야 하므로 두 함수로.
  //   formatQuotaValue(v) → "16" 또는 <span class="quota-shu">수</span>
  //   formatQuotaDiff(v, prev) → " ▲2" 또는 ""
  // 사용: `모집 ${formatQuotaValue(v)}명${formatQuotaDiff(v, prev)}`
  window.formatQuotaValue = function (value) {
    if (value == null || value === '') return '-';
    var v = String(value).trim();
    if (v === '수시이월' || v === '수시 이월') {
      return '<span class="quota-shu" title="수시이월" data-tip="수시이월">수</span>';
    }
    var num = Number(v);
    if (isNaN(num)) return window.escapeHtml(v);
    return String(num);
  };
  window.formatQuotaDiff = function (value, prev) {
    if (value == null || value === '' || prev == null || prev === '') return '';
    var num = Number(String(value).trim());
    var prevNum = Number(prev);
    if (isNaN(num) || isNaN(prevNum)) return '';
    var diff = num - prevNum;
    if (diff === 0) return '';
    var cls = diff > 0 ? 'up' : 'down';
    var arrow = diff > 0 ? '▲' : '▼';
    return ' <small class="quota-diff ' + cls + '" title="전년 ' + prevNum + '명">' + arrow + Math.abs(diff) + '</small>';
  };
  // 하위 호환 (기존 호출 안 깨지게)
  window.formatQuota = function (value, prev) {
    return window.formatQuotaValue(value) + window.formatQuotaDiff(value, prev);
  };

  function parseSchoolTags(tags) {
    if (!tags) return [];
    if (typeof tags === 'string') {
      try { tags = JSON.parse(tags); } catch (_) { return []; }
    }
    return Array.isArray(tags) ? tags : [];
  }

  function inferredAdmissionYear(value) {
    if (value != null && value !== '') return Number(value);
    if (typeof document === 'undefined') return null;
    var ids = ['year-select', 'yearSel', 'year-selector'];
    for (var index = 0; index < ids.length; index += 1) {
      var element = document.getElementById(ids[index]);
      var year = element && Number(element.value);
      if (Number.isInteger(year)) return year;
      var label = element && element.querySelector
        ? element.querySelector('.combo-display .label')
        : null;
      var match = label && String(label.textContent).match(/20\d{2}/);
      if (match) return Number(match[0]);
    }
    return null;
  }

  window.getPreviousCompetitionTag = function (tags, admissionYear) {
    var selectedYear = inferredAdmissionYear(admissionYear);
    if (!Number.isInteger(selectedYear)) return null;
    var list = parseSchoolTags(tags);
    for (var index = 0; index < list.length; index += 1) {
      var tag = list[index];
      if (!tag || typeof tag !== 'object' || tag.type !== '전년도경쟁률') continue;
      var catalogYear = Number(tag.catalogYear);
      var year = Number(tag.year);
      var rate = Number(tag.rate);
      var quota = Number(tag.quota);
      var applicants = Number(tag.applicants);
      if (
        !Number.isInteger(catalogYear) || year !== catalogYear - 1 ||
        selectedYear !== catalogYear ||
        !Number.isFinite(rate) || rate < 0 ||
        !Number.isInteger(quota) || quota <= 0 ||
        !Number.isInteger(applicants) || applicants < 0
      ) continue;
      return tag;
    }
    return null;
  };

  function competitionSummary(tags, admissionYear) {
    var tag = window.getPreviousCompetitionTag(tags, admissionYear);
    if (!tag) return null;
    var count = new Intl.NumberFormat('ko-KR');
    return {
      label: Number(tag.year) + '학년도 경쟁률',
      compactLabel: String(tag.year).slice(-2) + ' 경쟁률',
      rate: Number(tag.rate).toFixed(2) + ':1',
      meta: '모집 ' + count.format(Number(tag.quota)) + '명 · 지원 ' + count.format(Number(tag.applicants)) + '명',
      scope: tag.scope || null,
    };
  }

  window.renderPreviousCompetitionDetails = function (tags, admissionYear) {
    var summary = competitionSummary(tags, admissionYear);
    if (!summary) return '<span class="previous-competition-empty">전년도 경쟁률 자료 없음</span>';
    var esc = window.escapeHtml;
    return '<span class="previous-competition-label">' + esc(summary.label) + '</span>'
      + '<strong class="previous-competition-value">' + esc(summary.rate) + '</strong>'
      + '<small class="previous-competition-meta">' + esc(summary.meta) + '</small>'
      + (summary.scope ? '<small class="previous-competition-scope">' + esc(summary.scope) + '</small>' : '');
  };

  function renderCompetitionSchoolTag(tags, admissionYear) {
    var summary = competitionSummary(tags, admissionYear);
    if (!summary) return '';
    var esc = window.escapeHtml;
    return '<span class="school-tag competition-rate" title="'
      + esc(summary.label + ' · ' + summary.meta) + '">'
      + esc(summary.compactLabel + ' ' + summary.rate) + '</span>';
  }

  // 학교 이름 옆 태그 렌더 — schools API의 tags 필드(JSON 배열)를 HTML로
  // 사용: `대학명${window.renderSchoolTags(tags)}` 형태로 학교 이름 끝에 붙이기
  // 형식 두 가지 지원:
  //   - 문자열: ["군이동"] → "군이동"
  //   - 객체:   [{type:"군이동", from:"나", to:"가"}] → "군이동 나→가"
  window.renderSchoolTags = function (tags, admissionYear) {
    admissionYear = inferredAdmissionYear(admissionYear);
    tags = parseSchoolTags(tags);
    if (!Array.isArray(tags) || !tags.length) return '';
    var esc = window.escapeHtml;
    return tags.map(function (t) {
      if (typeof t === 'string') {
        return '<span class="school-tag">' + esc(t) + '</span>';
      }
      if (t && typeof t === 'object' && t.type) {
        if (t.type === '전년도경쟁률') return renderCompetitionSchoolTag([t], admissionYear);
        var label = esc(t.type);
        if (t.from && t.to) label += ' ' + esc(t.from) + '→' + esc(t.to);
        return '<span class="school-tag">' + label + '</span>';
      }
      return '';
    }).join('');
  };
})();
