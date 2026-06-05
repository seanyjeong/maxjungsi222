/* ============================================================ */
/* counseling_by_university.new.js — 학교별 상담 현황            */
/* API:                                                          */
/*   GET /jungsi/schools/{year}                                  */
/*   GET /jungsi/counseling/by-university/{U_ID}/{year}          */
/* ============================================================ */
'use strict';

(function () {
  const yearEl       = document.getElementById('year-select');
  const examEl       = document.getElementById('exam-select');
  const gunChips     = document.getElementById('gunChips');
  const uniEl        = document.getElementById('university-select');
  const sortPillsEl  = document.getElementById('sortPills');
  const statsStrip   = document.getElementById('statsStrip');
  const statTotal    = document.getElementById('statTotal');
  const statAvgSuneung = document.getElementById('statAvgSuneung');
  const statMaxSuneung = document.getElementById('statMaxSuneung');
  const statAvgTotal = document.getElementById('statAvgTotal');
  const statMaxTotal = document.getElementById('statMaxTotal');
  const container    = document.getElementById('applicantsContainer');
  const hintEl       = document.getElementById('applicantsHint');
  const loadingState = document.getElementById('loadingState');
  const cutBar       = document.getElementById('cutBar');
  const cutMineLabel = document.getElementById('cutMineLabel');
  const helpers = window.CounselingByUniversityHelpers || {};
  const {
    buildEventList,
    examQuery,
    formatNumber,
    getDefaultExamForYear,
    getDraft: buildDraft,
    recomputeSilgiTotal,
  } = helpers;

  const STATE = {
    year: '2027',
    exam: '6월',
    gun: '',
    U_ID: '',
    schools: [],
    applicants: [],
    cuts: { mine: null, max: null },
    scoreTable: [],
    eventList: [],
    sortBy: 'total_score',
    drafts: new Map(),
    formula: null,
    calcTimers: new Map(),
  };

  const renderer = window.createUniversityCounselRenderer({
    state: STATE,
    formatNumber,
    getDraft,
    elements: {
      container,
      cutBar,
      cutMineLabel,
      hintEl,
      statAvgSuneung,
      statAvgTotal,
      statMaxSuneung,
      statMaxTotal,
      statTotal,
      statsStrip,
    },
  });

  function getDraft(counselId, applicant) {
    return buildDraft(STATE, counselId, applicant);
  }

  // ── empty state ──
  function emptyHint(title, sub) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon"><i class="ph-light ph-graduation-cap"></i></div>
        <div class="empty-title">${title}</div>
        <div class="empty-sub">${sub}</div>
      </div>
    `;
    statsStrip.hidden = true;
    hintEl.textContent = '대학을 선택하면 상담 학생이 표시됩니다';
  }

  function setLoading() {
    container.innerHTML = '';
    loadingState.hidden = false;
  }

  // ── 대학 목록 로드 (우리 지점이 상담 저장한 학교만) ──
  async function loadSchools() {
    try {
      const r = await window.api(`/jungsi/counseling/saved-universes/${STATE.year}?${examQuery(STATE.exam)}`);
      STATE.schools = (r && r.success) ? (r.list || []) : [];
      applyUniversityOptions();
    } catch (e) {
      if (e.message === 'auth' || e.message === 'no-token') return;
      window.showToast && window.showToast('대학 목록 로드 실패: ' + e.message, 'error');
    }
  }

  function applyUniversityOptions() {
    const filtered = STATE.gun
      ? STATE.schools.filter(s => s.gun === STATE.gun)
      : STATE.schools;

    if (filtered.length === 0) {
      uniCombo.setOptions([{ value: '', label: `${STATE.exam} 상담 저장 없음` }]);
      uniCombo.setValue('');
      return;
    }
    const opts = filtered.map(s => ({
      value: String(s.U_ID),
      label: `${s.university} — ${s.department}`,
      meta: s.saved_count ? `${s.saved_count}명` : '',
    }));
    uniCombo.setOptions(opts);
    uniCombo.setValue('');
  }

  // ── 상담 학생 로드 ──
  async function loadApplicants() {
    if (!STATE.U_ID) return;
    setLoading();
    try {
      const r = await window.api(`/jungsi/counseling/by-university/${STATE.U_ID}/${STATE.year}?${examQuery(STATE.exam)}`);
      loadingState.hidden = true;
      if (!r || !r.success) throw new Error((r && r.message) || '로딩 실패');
      STATE.applicants = r.applicants || [];
      STATE.cuts = r.cuts || { mine: null, max: null };
      STATE.scoreTable = r.scoreTable || [];
      STATE.eventList = buildEventList(STATE.scoreTable);
      STATE.drafts.clear();
      STATE.calcTimers.forEach(t => clearTimeout(t));
      STATE.calcTimers.clear();
      renderer.renderCutBar(STATE.cuts);
      renderer.displayApplicants();

      // formula 병렬 fetch (서버 실기 계산용)
      try {
        const f = await window.api(`/jungsi/formula-details?U_ID=${encodeURIComponent(STATE.U_ID)}&year=${encodeURIComponent(STATE.year)}`);
        STATE.formula = (f && f.formula) ? f.formula : f;
        window.__formula = STATE.formula;
      } catch (err) {
        console.warn('[formula-details]', err && err.message);
        STATE.formula = null;
      }

      // 저장된 기록 기반 자동 점수 계산
      if (STATE.formula) {
        await autoCalcAll();
      }
    } catch (e) {
      loadingState.hidden = true;
      if (e.message === 'auth' || e.message === 'no-token') return;
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon"><i class="ph-light ph-warning"></i></div>
          <div class="empty-title">로드 실패</div>
          <div class="empty-sub">${window.escapeHtml ? window.escapeHtml(e.message) : e.message}</div>
        </div>
      `;
      statsStrip.hidden = true;
    }
  }

  function markDirty(cid, dirty) {
    const draft = STATE.drafts.get(cid);
    if (!draft) return;
    draft.dirty = dirty !== false;
    const btn = container.querySelector(`.save-icon-btn[data-dirty="${cid}"]`);
    if (btn) btn.disabled = !draft.dirty;
  }

  // save click delegation
  container.addEventListener('click', (e) => {
    const saveBtn = e.target.closest('.save-icon-btn');
    if (saveBtn && !saveBtn.disabled) { saveDraft(saveBtn.dataset.cid); return; }
  });

  container.addEventListener('input', (e) => {
    const t = e.target;
    if (!t || !t.classList) return;
    const cid = t.dataset.cid;
    if (!cid) return;
    const draft = STATE.drafts.get(cid);
    if (!draft) return;

    if (t.classList.contains('rec-input')) {
      const idx = Number(t.dataset.idx);
      const entry = draft.entries[idx];
      if (!entry) return;
      entry.record = t.value;
      markDirty(cid, true);
      // 서버 실기 계산 (debounce)
      scheduleSilgiCalc(cid);
    } else if (t.classList.contains('score-input')) {
      const idx = Number(t.dataset.idx);
      const entry = draft.entries[idx];
      if (!entry) return;
      entry.score = t.value;
      recomputeSilgiTotal(draft);
      const sumEl = container.querySelector(`[data-sum="${cid}"]`);
      if (sumEl) sumEl.textContent = draft.silgi_score || '0';
      markDirty(cid, true);
    } else if (t.classList.contains('memo-input')) {
      draft.memo = t.value;
      markDirty(cid, true);
    }
  });

  async function autoCalcAll() {
    for (const a of STATE.applicants) {
      const cid = String(a.counsel_id);
      const draft = STATE.drafts.get(cid);
      if (!draft) continue;
      const hasRecord = draft.entries.some(e => e.record != null && String(e.record).trim() !== '');
      if (!hasRecord) continue;
      await runSilgiCalc(cid, { silent: true });
    }
  }

  function scheduleSilgiCalc(cid) {
    const prev = STATE.calcTimers.get(cid);
    if (prev) clearTimeout(prev);
    const t = setTimeout(() => runSilgiCalc(cid), 450);
    STATE.calcTimers.set(cid, t);
  }

  async function runSilgiCalc(cid, opts) {
    opts = opts || {};
    const silent = !!opts.silent;
    const draft = STATE.drafts.get(cid);
    if (!draft) return;
    if (!STATE.formula) {
      if (!silent) window.showToast && window.showToast('요강 정보 로딩 실패 — 새로고침 필요', 'warn');
      return;
    }
    const entered = draft.entries
      .filter(e => e.record != null && String(e.record).trim() !== '')
      .map(e => ({ event: e.event, value: String(e.record).trim() }));
    if (entered.length === 0) {
      draft.entries.forEach(e => { e.score = ''; });
      recomputeSilgiTotal(draft);
      updateCellsFromDraft(cid, draft);
      return;
    }
    try {
      const d = await window.api('/silgi/calculate', {
        method: 'POST',
        body: JSON.stringify({
          F_data: STATE.formula,
          S_data: { gender: draft.gender, practicals: entered },
        }),
      });
      if (!d || !d.success) {
        if (!silent) window.showToast && window.showToast('계산 실패: ' + ((d && d.message) || 'unknown'), 'error');
        return;
      }
      if (!d.result) return;
      const events = (d.result.breakdown && d.result.breakdown.events) || [];
      const byEv = new Map();
      events.forEach(ev => byEv.set(ev.event, ev));
      draft.entries.forEach(e => {
        const ev = byEv.get(e.event);
        e.score = (ev && ev.score != null) ? Number(ev.score).toFixed(2) : '';
      });
      if (d.result.totalScore != null) {
        draft.silgi_score = Number(d.result.totalScore).toFixed(2);
      } else {
        recomputeSilgiTotal(draft);
      }
      draft.deduct = (d.result.breakdown && d.result.breakdown.total_deduction_level) || 0;
      updateCellsFromDraft(cid, draft);
    } catch (e) {
      if (e && e.message === 'auth') return;
      console.warn('[runSilgiCalc]', e && e.message);
      if (!silent) window.showToast && window.showToast('계산 API 오류: ' + (e && e.message ? e.message : ''), 'error');
    }
  }

  function updateCellsFromDraft(cid, draft) {
    draft.entries.forEach((e, i) => {
      const scEl = container.querySelector(`.score-input[data-cid="${cid}"][data-idx="${i}"]`);
      if (scEl && scEl.value !== e.score) scEl.value = e.score;
    });
    const sumEl = container.querySelector(`[data-sum="${cid}"]`);
    if (sumEl) sumEl.innerHTML = renderer.sumHtml(draft);
  }

  async function saveDraft(cid) {
    const draft = STATE.drafts.get(cid);
    if (!draft) return;
    // counsel.new.html 와 호환: { 종목: "기록" } object 로 저장 (점수는 합계로만 전달)
    const silgi_record = {};
    draft.entries.forEach(e => {
      const rec = e.record != null ? String(e.record).trim() : '';
      if (rec !== '') silgi_record[e.event] = rec;
    });

    const silgi_score = draft.silgi_score === '' ? null : Number(draft.silgi_score);

    try {
      const r = await window.api(`/jungsi/counseling/update/${encodeURIComponent(cid)}`, {
        method: 'PUT',
        body: JSON.stringify({
          silgi_record,
          silgi_score: (silgi_score != null && isFinite(silgi_score)) ? silgi_score : null,
          memo: draft.memo || '',
        }),
      });
      if (!r || !r.success) throw new Error((r && r.message) || '저장 실패');

      // 로컬 STATE 갱신 (object 형태 저장) + 총점 재계산
      const appIdx = STATE.applicants.findIndex(a => String(a.counsel_id) === String(cid));
      if (appIdx >= 0) {
        const a = STATE.applicants[appIdx];
        a.silgi_record = silgi_record;
        a.silgi_score = silgi_score;
        const suneungN = Number(a.suneung_score) || 0;
        const naesinN  = Number(a.naesin_score)  || 0;
        const silgiN   = silgi_score != null ? Number(silgi_score) : 0;
        a.total_score = suneungN + naesinN + silgiN;
        a['메모'] = draft.memo || null;
        a['수정일시'] = new Date().toISOString();
      }
      draft.dirty = false;
      // draft 는 유지 (점수·감수 화면에 표시되는 상태 보존)
      renderer.displayApplicants();
      window.showToast && window.showToast('저장 완료', 'success');
    } catch (err) {
      if (err.message === 'auth' || err.message === 'no-token') return;
      window.showToast && window.showToast('저장 실패: ' + err.message, 'error');
    }
  }

  // ── 군 chip 이벤트 ──
  gunChips.addEventListener('click', e => {
    const btn = e.target.closest('.gun-chip');
    if (!btn) return;
    gunChips.querySelectorAll('.gun-chip').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    STATE.gun = btn.dataset.gun || '';
    STATE.U_ID = '';
    applyUniversityOptions();
    emptyHint('대학을 선택하세요', '선택한 군에 해당하는 대학을 고르면 상담 학생이 표시됩니다.');
  });

  let uniCombo;

  // ── 정렬 pill 이벤트 ──
  sortPillsEl.addEventListener('click', e => {
    const btn = e.target.closest('.sort-pill');
    if (!btn) return;
    sortPillsEl.querySelectorAll('.sort-pill').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    STATE.sortBy = btn.dataset.sort;
    if (STATE.applicants.length) renderer.renderList();
  });

  // ── Combobox 초기화 ──
  const examCombo = window.createCombobox(examEl, {
    options: [
      { value: '3월', label: '3월 모의고사' },
      { value: '6월', label: '6월 모의고사' },
      { value: '9월', label: '9월 모의고사' },
      { value: '수능', label: '수능' },
    ],
    value: getDefaultExamForYear(2027),
    searchable: false,
    onChange: (v) => {
      STATE.exam = v || getDefaultExamForYear(STATE.year);
      STATE.U_ID = '';
      if (uniCombo) uniCombo.setValue('');
      emptyHint('대학을 선택하세요', '모의고사가 변경되었습니다. 대학을 다시 선택하세요.');
      loadSchools();
    },
  });
  STATE.exam = examCombo.value || getDefaultExamForYear(2027);

  const yearCombo = window.createCombobox(yearEl, {
    options: [
      { value: '2027', label: '2027학년도' },
      { value: '2026', label: '2026학년도' },
      { value: '2025', label: '2025학년도' },
    ],
    value: '2027',
    searchable: false,
    onChange: (v) => {
      STATE.year = v;
      STATE.exam = getDefaultExamForYear(v);
      examCombo.setValue(STATE.exam);
      STATE.U_ID = '';
      if (uniCombo) uniCombo.setValue('');
      emptyHint('대학을 선택하세요', '학년도가 변경되었습니다. 대학을 다시 선택하세요.');
      loadSchools();
    },
  });
  STATE.year = yearCombo.value || '2027';

  uniCombo = window.createCombobox(uniEl, {
    options: [{ value: '', label: '대학 · 학과 검색…' }],
    value: '',
    searchable: true,
    placeholder: '대학·학과 검색…',
    onChange: (v) => {
      STATE.U_ID = v;
      if (v) loadApplicants();
      else emptyHint('대학을 선택하세요', '상단에서 대학·학과를 선택하면 상담 학생 목록이 표시됩니다.');
    },
  });

  // 초기 로드
  emptyHint('대학을 선택하세요', '상단에서 학년도·모의고사·군·대학을 선택하면 우리 지점의 상담 저장 학생 목록이 표시됩니다.');
  loadSchools();
})();
