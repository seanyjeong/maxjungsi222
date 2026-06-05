/* ============================================================ */
/* counseling_by_university_helpers.js — 학교별 상담 순수 헬퍼    */
/* ============================================================ */
'use strict';

(function () {
  function buildEventList(scoreTable) {
    const seen = new Set();
    const list = [];
    (scoreTable || []).forEach(row => {
      const event = row['종목명'];
      if (!event || seen.has(event)) return;
      seen.add(event);
      list.push(event);
    });
    return list;
  }

  function parseSilgi(raw) {
    if (raw === null || raw === undefined || raw === '') return [];
    let obj = raw;
    if (typeof raw === 'string') {
      try {
        obj = JSON.parse(raw);
      } catch (e) {
        return [];
      }
    }
    if (Array.isArray(obj)) {
      return obj.map(item => ({
        event: item.event || item['종목'] || item['종목명'] || '',
        record: item.record != null ? item.record : (item['기록'] != null ? item['기록'] : ''),
        score: item.score != null ? item.score : (
          item['점수'] != null ? item['점수'] : (item['배점'] != null ? item['배점'] : '')
        ),
      }));
    }
    if (typeof obj === 'object') {
      return Object.entries(obj).map(([event, value]) => {
        if (value && typeof value === 'object') {
          return {
            event,
            record: value.record != null ? value.record : (value['기록'] != null ? value['기록'] : ''),
            score: value.score != null ? value.score : (value['점수'] != null ? value['점수'] : ''),
          };
        }
        return { event, record: value, score: '' };
      });
    }
    return [];
  }

  function getDraft(state, counselId, applicant) {
    if (state.drafts.has(counselId)) return state.drafts.get(counselId);
    const gender = (applicant.gender === 'F' || applicant.gender === '여') ? '여' : '남';
    const existing = parseSilgi(applicant.silgi_record);
    const existingMap = new Map();
    existing.forEach(item => {
      if (item.event) existingMap.set(item.event, item);
    });
    const draft = {
      counsel_id: counselId,
      gender,
      entries: state.eventList.map(event => {
        const previous = existingMap.get(event) || {};
        return {
          event,
          record: previous.record != null ? String(previous.record) : '',
          score: previous.score != null && previous.score !== '' ? String(previous.score) : '',
        };
      }),
      memo: applicant['메모'] || '',
      silgi_score: applicant.silgi_score != null ? String(applicant.silgi_score) : '',
      deduct: 0,
      dirty: false,
    };
    state.drafts.set(counselId, draft);
    return draft;
  }

  function recomputeSilgiTotal(draft) {
    const sum = draft.entries.reduce((acc, entry) => {
      const score = Number(entry.score);
      return isFinite(score) ? acc + score : acc;
    }, 0);
    draft.silgi_score = sum ? sum.toFixed(2) : '';
  }

  function formatNumber(value, digits) {
    if (value === null || value === undefined || value === '') return '—';
    const num = Number(value);
    if (!isFinite(num)) return '—';
    return num.toFixed(digits == null ? 2 : digits);
  }

  function getDefaultExamForYear(year) {
    if (typeof window.getDefaultExam === 'function') return window.getDefaultExam(Number(year));
    if (typeof getDefaultExam === 'function') return getDefaultExam(Number(year));
    return '6월';
  }

  function examQuery(exam) {
    return `exam=${encodeURIComponent(exam || '6월')}`;
  }

  window.CounselingByUniversityHelpers = {
    buildEventList,
    examQuery,
    formatNumber,
    getDefaultExamForYear,
    getDraft,
    recomputeSilgiTotal,
  };
})();
