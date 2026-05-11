/* ============================================================ */
/* counseling_by_university.new.js — 학교별 상담 현황            */
/* API:                                                          */
/*   GET /jungsi/schools/{year}                                  */
/*   GET /jungsi/counseling/by-university/{U_ID}/{year}          */
/* ============================================================ */
'use strict';

(function () {
  const yearEl       = document.getElementById('year-select');
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

  const STATE = {
    year: '2027',
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

  function buildEventList(scoreTable) {
    // 전체 종목 유니언 (성별 무관 한 번만)
    const seen = new Set();
    const list = [];
    (scoreTable || []).forEach(r => {
      const ev = r['종목명'];
      if (!ev || seen.has(ev)) return;
      seen.add(ev);
      list.push(ev);
    });
    return list;
  }

  function lookupScore(event, gender, record) {
    if (!event || record === '' || record == null) return null;
    const rows = STATE.scoreTable.filter(r =>
      r['종목명'] === event && (r['성별'] === gender || r['성별'] == null || r['성별'] === '')
    );
    if (!rows.length) return null;
    const target = String(record).trim();

    // 1) 정확 매칭 우선
    const exact = rows.find(r => String(r['기록']).trim() === target);
    if (exact) return exact['배점'];

    // 2) 숫자 근사 (선형 환산 근사)
    const num = parseFloat(target);
    if (!isFinite(num)) return null;
    const valid = rows
      .map(r => ({ rec: parseFloat(r['기록']), sc: parseFloat(r['배점']) }))
      .filter(x => isFinite(x.rec) && isFinite(x.sc));
    if (!valid.length) return null;
    valid.sort((a, b) => a.rec - b.rec);

    const higherBetter = valid[valid.length - 1].sc >= valid[0].sc;
    if (higherBetter) {
      // 기록 클수록 좋음: 학생 기록 이하인 row 중 가장 큰 기록의 배점
      const match = [...valid].reverse().find(x => num >= x.rec);
      if (match) return match.sc;
      return valid[0].sc; // 최저 미달이면 최저 배점
    } else {
      // 기록 작을수록 좋음: 학생 기록 이상인 row 중 가장 작은 기록의 배점
      const match = valid.find(x => num <= x.rec);
      if (match) return match.sc;
      return valid[valid.length - 1].sc; // 최대 초과시 최저 배점
    }
  }

  function getDraft(counselId, applicant) {
    if (STATE.drafts.has(counselId)) return STATE.drafts.get(counselId);
    const gender = (applicant.gender === 'F' || applicant.gender === '여') ? '여' : '남';
    const existing = parseSilgi(applicant.silgi_record);
    const existingMap = new Map();
    existing.forEach(s => { if (s.event) existingMap.set(s.event, s); });
    const draft = {
      counsel_id: counselId,
      gender,
      entries: STATE.eventList.map(ev => {
        const prev = existingMap.get(ev) || {};
        return {
          event: ev,
          record: prev.record != null ? String(prev.record) : '',
          score:  prev.score  != null && prev.score !== '' ? String(prev.score) : '',
        };
      }),
      memo: applicant['메모'] || '',
      silgi_score: applicant.silgi_score != null ? String(applicant.silgi_score) : '',
      deduct: 0,
      dirty: false,
    };
    STATE.drafts.set(counselId, draft);
    return draft;
  }

  function recomputeSilgiTotal(draft) {
    const sum = draft.entries.reduce((s, e) => {
      const n = Number(e.score);
      return isFinite(n) ? s + n : s;
    }, 0);
    draft.silgi_score = sum ? sum.toFixed(2) : '';
  }

  function fmtNum(v, digits) {
    if (v === null || v === undefined || v === '') return '—';
    const n = Number(v);
    if (!isFinite(n)) return '—';
    return n.toFixed(digits == null ? 2 : digits);
  }

  function setCutField(field, value) {
    const el = cutBar.querySelector(`[data-field="${field}"]`);
    if (el) el.textContent = fmtNum(value);
  }

  function renderCutBar(cuts) {
    const { mine, max } = cuts || {};
    if (!mine && !max) {
      cutBar.hidden = true;
      return;
    }
    cutBar.hidden = false;
    setCutField('max-suneung', max && max['수능컷']);
    setCutField('max-total',   max && max['총점컷']);
    setCutField('max-25',      max && max['25년총점컷']);
    setCutField('max-26',      max && max['26년총점컷']);
    setCutField('mine-suneung', mine && mine['수능컷']);
    setCutField('mine-total',   mine && mine['총점컷']);
    setCutField('mine-25',      mine && mine['25년총점컷']);
    setCutField('mine-26',      mine && mine['26년총점컷']);
    const info = (window.getCounselorFromToken && window.getCounselorFromToken()) || {};
    if (info.branch) cutMineLabel.textContent = info.branch + '컷';
  }

  function parseSilgi(raw) {
    // 지원 형태:
    //   (A) counsel.new.html 호환: { 종목명: "기록" }
    //   (B) { 종목명: { record, score } }
    //   (C) [ { 종목, 기록, 점수 }, ... ]
    if (raw === null || raw === undefined || raw === '') return [];
    let obj = raw;
    if (typeof raw === 'string') {
      try { obj = JSON.parse(raw); } catch (e) { return []; }
    }
    if (Array.isArray(obj)) {
      return obj.map(it => ({
        event: it.event || it['종목'] || it['종목명'] || '',
        record: it.record != null ? it.record : (it['기록'] != null ? it['기록'] : ''),
        score:  it.score  != null ? it.score  : (it['점수'] != null ? it['점수'] : (it['배점'] != null ? it['배점'] : '')),
      }));
    }
    if (typeof obj === 'object') {
      return Object.entries(obj).map(([event, v]) => {
        if (v && typeof v === 'object') {
          return {
            event,
            record: v.record != null ? v.record : (v['기록'] != null ? v['기록'] : ''),
            score:  v.score  != null ? v.score  : (v['점수'] != null ? v['점수'] : ''),
          };
        }
        // counsel 호환: {종목: "기록문자열"}
        return { event, record: v, score: '' };
      });
    }
    return [];
  }

  // ── 날짜 포맷 (KST) ──
  function fmtDate(str) {
    if (!str) return '-';
    const d = new Date(str);
    if (isNaN(d)) return str;
    return d.toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
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
      const r = await window.api(`/jungsi/counseling/saved-universes/${STATE.year}`);
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
      uniCombo.setOptions([{ value: '', label: '우리 지점 상담 저장 없음' }]);
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
      const r = await window.api(`/jungsi/counseling/by-university/${STATE.U_ID}/${STATE.year}`);
      loadingState.hidden = true;
      if (!r || !r.success) throw new Error((r && r.message) || '로딩 실패');
      STATE.applicants = r.applicants || [];
      STATE.cuts = r.cuts || { mine: null, max: null };
      STATE.scoreTable = r.scoreTable || [];
      STATE.eventList = buildEventList(STATE.scoreTable);
      STATE.drafts.clear();
      STATE.calcTimers.forEach(t => clearTimeout(t));
      STATE.calcTimers.clear();
      renderCutBar(STATE.cuts);
      displayApplicants();

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

  function displayApplicants() {
    const apps = STATE.applicants;
    if (!apps || apps.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon"><i class="ph-light ph-tray"></i></div>
          <div class="empty-title">상담 학생이 없습니다</div>
          <div class="empty-sub">해당 학과에 우리 지점의 상담 저장 내역이 없습니다.</div>
        </div>
      `;
      statsStrip.hidden = true;
      hintEl.textContent = `${STATE.year}학년도 · 0명`;
      return;
    }

    const suneungVals = apps.map(a => Number(a.suneung_score) || 0).filter(v => v > 0);
    const totalVals   = apps.map(a => Number(a.total_score) || 0).filter(v => v > 0);
    const avg = arr => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

    statsStrip.hidden = false;
    statTotal.textContent = `${apps.length}명`;
    statAvgSuneung.textContent = suneungVals.length ? avg(suneungVals).toFixed(2) : '—';
    statMaxSuneung.textContent = suneungVals.length ? Math.max(...suneungVals).toFixed(2) : '—';
    statAvgTotal.textContent   = totalVals.length ? avg(totalVals).toFixed(2) : '—';
    statMaxTotal.textContent   = totalVals.length ? Math.max(...totalVals).toFixed(2) : '—';

    hintEl.textContent = `${STATE.year}학년도 · ${apps.length}명`;
    renderList();
  }

  function sortApplicants() {
    const sorted = [...STATE.applicants];
    switch (STATE.sortBy) {
      case 'total_score':
        sorted.sort((a, b) => (Number(b.total_score) || 0) - (Number(a.total_score) || 0));
        break;
      case 'suneung_score':
        sorted.sort((a, b) => (Number(b.suneung_score) || 0) - (Number(a.suneung_score) || 0));
        break;
      case 'created_at':
        sorted.sort((a, b) => {
          const ta = a.생성일시 ? new Date(a.생성일시).getTime() : 0;
          const tb = b.생성일시 ? new Date(b.생성일시).getTime() : 0;
          return tb - ta;
        });
        break;
    }
    return sorted;
  }

  function renderList() {
    const sorted = sortApplicants();
    const esc = window.escapeHtml || (s => String(s == null ? '' : s));
    const events = STATE.eventList;

    const eventCols = events.map(() => '<col class="col-event-grp">').join('');
    const eventHeaders = events.map(ev => `<th class="th-event" title="${esc(ev)}">${esc(ev)}</th>`).join('');

    const rowsHtml = sorted.map((a, idx) => {
      const rank = idx + 1;
      const genderLabel = a.gender === 'M' || a.gender === '남' ? '남'
                        : a.gender === 'F' || a.gender === '여' ? '여'
                        : (a.gender || '');
      const id = String(a.counsel_id);
      const draft = getDraft(id, a);

      const eventCells = draft.entries.map((e, i) => `
        <td class="td-event">
          <input type="text" class="tiny-input rec-input" data-cid="${esc(id)}" data-idx="${i}" value="${esc(e.record)}" placeholder="기록">
          <input type="text" class="tiny-input score-input" data-cid="${esc(id)}" data-idx="${i}" value="${esc(e.score)}" placeholder="점수">
        </td>`).join('');

      return `
        <tr class="applicant-row" data-cid="${esc(id)}">
          <td class="col-rank">${rank}</td>
          <td class="col-name">
            <div class="name-cell">
              <span class="n">${esc(a.name || '-')}</span>
              ${genderLabel ? `<span class="g-chip g-${genderLabel === '여' ? 'F' : 'M'}">${esc(genderLabel)}</span>` : ''}
            </div>
            <div class="sub-school">${esc(a.school || '')}</div>
          </td>
          <td class="col-gun"><span class="gun-badge">${esc(a.gun || '-')}</span></td>
          <td class="col-num">${fmtNum(a.suneung_score)}</td>
          <td class="col-num">${fmtNum(a.naesin_score)}</td>
          ${eventCells}
          <td class="col-num"><span data-sum="${esc(id)}">${sumHtml(draft)}</span></td>
          <td class="col-num col-total">${fmtNum(a.total_score)}</td>
          <td class="col-memo">
            <input type="text" class="tiny-input memo-input" data-cid="${esc(id)}" value="${esc(draft.memo || '')}" placeholder="메모">
          </td>
          <td class="col-save">
            <button type="button" class="save-icon-btn" data-cid="${esc(id)}" data-dirty="${esc(id)}" aria-label="저장" ${draft.dirty ? '' : 'disabled'}>
              <i class="ph-light ph-floppy-disk"></i>
            </button>
          </td>
        </tr>`;
    }).join('');

    const emptyEventsMsg = events.length === 0
      ? '<div class="no-events-hint"><i class="ph-light ph-info"></i> 이 대학은 실기 배점표가 등록되지 않았습니다.</div>'
      : '';

    container.innerHTML = `
      ${emptyEventsMsg}
      <div class="list-wrap">
        <table class="applicants-table compact">
          <colgroup>
            <col style="width:38px">
            <col style="width:160px">
            <col style="width:44px">
            <col style="width:72px">
            <col style="width:72px">
            ${eventCols}
            <col style="width:70px">
            <col style="width:84px">
            <col style="width:auto">
            <col style="width:36px">
          </colgroup>
          <thead>
            <tr>
              <th>#</th>
              <th class="th-left">학생·학교</th>
              <th>군</th>
              <th>수능</th>
              <th>내신</th>
              ${eventHeaders}
              <th>실기합</th>
              <th>총점</th>
              <th class="th-left">메모</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>`;
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

  function sumHtml(draft) {
    const s = draft.silgi_score || '0';
    const dd = Number(draft.deduct) || 0;
    return dd > 0
      ? `${s} <em class="deduct-tag">(${dd}감)</em>`
      : `${s}`;
  }

  function updateCellsFromDraft(cid, draft) {
    draft.entries.forEach((e, i) => {
      const scEl = container.querySelector(`.score-input[data-cid="${cid}"][data-idx="${i}"]`);
      if (scEl && scEl.value !== e.score) scEl.value = e.score;
    });
    const sumEl = container.querySelector(`[data-sum="${cid}"]`);
    if (sumEl) sumEl.innerHTML = sumHtml(draft);
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
      displayApplicants();
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

  // ── 정렬 pill 이벤트 ──
  sortPillsEl.addEventListener('click', e => {
    const btn = e.target.closest('.sort-pill');
    if (!btn) return;
    sortPillsEl.querySelectorAll('.sort-pill').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    STATE.sortBy = btn.dataset.sort;
    if (STATE.applicants.length) renderCards();
  });

  // ── Combobox 초기화 ──
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
      STATE.U_ID = '';
      uniCombo.setValue('');
      emptyHint('대학을 선택하세요', '학년도가 변경되었습니다. 대학을 다시 선택하세요.');
      loadSchools();
    },
  });
  STATE.year = yearCombo.value || '2027';

  const uniCombo = window.createCombobox(uniEl, {
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
  emptyHint('대학을 선택하세요', '상단에서 학년도·군·대학을 선택하면 우리 지점의 상담 저장 학생 목록이 표시됩니다.');
  loadSchools();
})();
