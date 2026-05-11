/* ============================================================ */
/* debug.new.js — 정시 계산 엔진 디버거                            */
/* API:                                                           */
/*   GET  /jungsi/debug-notes?year=Y                              */
/*   POST /jungsi/debug-notes/set                                 */
/*   GET  /jungsi/schools/{year}                                  */
/*   POST /jungsi/calculate                                       */
/* ============================================================ */
'use strict';

(function () {
  // ── DOM refs ──
  const runBtn        = document.getElementById('runBtn');
  const filterBar     = document.getElementById('filterBar');
  const statusBar     = document.getElementById('statusBar');
  const statusText    = document.getElementById('statusText');
  const resultsEl     = document.getElementById('resultsContainer');
  const countAll      = document.getElementById('count-all');
  const countY        = document.getElementById('count-Y');
  const countN        = document.getElementById('count-N');
  const countUnk      = document.getElementById('count-unk');

  // ── state ──
  const STATE = {
    year: '2027',
    filter: 'all',
    notesMap: {},    // U_ID -> { is_correct, memo, updated_at }
  };

  // 디버그용 학생 점수 (원본 유지)
  const studentScoresForDebug = {
    subjects: [
      { name: '국어', subject: '화법과작문', std: 124, percentile: 88, grade: 3 },
      { name: '수학', subject: '확률과통계', std: 125, percentile: 90, grade: 2 },
      { name: '영어', grade: 2 },
      { name: '한국사', grade: 1 },
      { name: '탐구', subject: '세계사',   std: 63, percentile: 85, grade: 3 },
      { name: '탐구', subject: '정치와법', std: 64, percentile: 91, grade: 2 },
    ],
  };

  const _esc = (s) => (window.escapeHtml ? window.escapeHtml(s) : String(s == null ? '' : s));

  function toast(msg, kind) {
    if (window.showToast) window.showToast(msg, kind || 'info');
  }

  function setStatus(msg, kind) {
    if (!msg) { statusBar.hidden = true; return; }
    statusBar.hidden = false;
    statusBar.classList.remove('is-error', 'is-success');
    if (kind === 'error') statusBar.classList.add('is-error');
    else if (kind === 'success') statusBar.classList.add('is-success');
    statusText.textContent = msg;
  }

  // ── combobox ──
  const yearCombo = window.createCombobox(document.getElementById('yearSel'), {
    options: [
      { value: '2027', label: '2027학년도' },
      { value: '2026', label: '2026학년도' },
      { value: '2025', label: '2025학년도' },
    ],
    value: '2027',
    searchable: false,
    onChange: (v) => { STATE.year = v; },
  });
  STATE.year = yearCombo.value || '2027';

  // ── 상태 뱃지 ──
  function badgeForStatus(s) {
    if (s === 'Y') return '<span class="badge ok"><i class="ph-light ph-check"></i>맞음</span>';
    if (s === 'N') return '<span class="badge ng"><i class="ph-light ph-x"></i>틀림</span>';
    return '<span class="badge unknown"><i class="ph-light ph-question"></i>미확인</span>';
  }

  // ── 필터 ──
  function updateFilterCounts() {
    const cards = resultsEl.querySelectorAll('.result-card');
    let nY = 0, nN = 0, nU = 0;
    cards.forEach(c => {
      if (c.classList.contains('correct')) nY++;
      else if (c.classList.contains('incorrect')) nN++;
      else nU++;
    });
    countAll.textContent = cards.length;
    countY.textContent = nY;
    countN.textContent = nN;
    countUnk.textContent = nU;
  }

  function applyFilter() {
    const cards = resultsEl.querySelectorAll('.result-card');
    cards.forEach(card => {
      let s = '?';
      if (card.classList.contains('correct')) s = 'Y';
      else if (card.classList.contains('incorrect')) s = 'N';
      card.style.display = (STATE.filter === 'all' || STATE.filter === s) ? '' : 'none';
    });
  }

  filterBar.addEventListener('click', (e) => {
    const btn = e.target.closest('button.fbtn');
    if (!btn) return;
    STATE.filter = btn.dataset.filter || 'all';
    filterBar.querySelectorAll('.fbtn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    applyFilter();
  });

  // ── 메모 저장 ──
  async function saveDebugNote(U_ID, year, is_correct, memo) {
    const r = await window.api('/jungsi/debug-notes/set', {
      method: 'POST',
      body: JSON.stringify({ U_ID, year, is_correct, memo }),
    });
    if (!r || !r.success) throw new Error((r && r.message) || '메모 저장 실패');
    return true;
  }

  // ── 클릭 위임 (저장 버튼) ──
  resultsEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action="save"]');
    if (!btn) return;
    const uid = btn.dataset.uid;
    const yr = STATE.year;
    const card = resultsEl.querySelector(`.result-card[data-uid="${CSS.escape(uid)}"]`);
    if (!card) return;
    const status = card.querySelector(`input[name="status-${CSS.escape(uid)}"]:checked`)?.value || '?';
    const memo = card.querySelector(`textarea[data-uid="${CSS.escape(uid)}"]`)?.value || '';
    const prev = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="ph-light ph-circle-notch spin"></i> 저장 중…';
    try {
      await saveDebugNote(uid, yr, status, memo);
      // 상태 클래스 갱신
      card.classList.remove('correct', 'incorrect');
      if (status === 'Y') card.classList.add('correct');
      else if (status === 'N') card.classList.add('incorrect');
      const badgeEl = card.querySelector('.card-head .badge-slot');
      if (badgeEl) badgeEl.innerHTML = badgeForStatus(status);
      const metaEl = card.querySelector('.save-row .meta');
      if (metaEl) metaEl.textContent = `저장 · ${new Date().toLocaleString('ko-KR')}`;
      updateFilterCounts();
      applyFilter();
      btn.innerHTML = '<i class="ph-light ph-check"></i> 저장됨';
      setTimeout(() => {
        btn.innerHTML = prev;
        btn.disabled = false;
      }, 900);
      toast('메모 저장 완료', 'success');
    } catch (err) {
      btn.innerHTML = prev;
      btn.disabled = false;
      if (err.message === 'auth' || err.message === 'no-token') return;
      toast('메모 저장 실패: ' + err.message, 'error');
    }
  });

  // ── 디버거 실행 ──
  async function runDebugger() {
    const YEAR = String(STATE.year || '2027');
    runBtn.disabled = true;
    const origBtn = runBtn.innerHTML;
    runBtn.innerHTML = '<i class="ph-light ph-circle-notch spin"></i> 실행 중…';
    setStatus(`[${YEAR}] 규칙 로드 중…`, 'info');
    resultsEl.innerHTML = '';

    try {
      // 1) 메모
      const notesRes = await window.api(`/jungsi/debug-notes?year=${encodeURIComponent(YEAR)}`);
      if (!notesRes || !notesRes.success) throw new Error((notesRes && notesRes.message) || 'debug-notes 로딩 실패');
      STATE.notesMap = notesRes.notes || {};

      // 2) 학교 목록
      const schRes = await window.api(`/jungsi/schools/${encodeURIComponent(YEAR)}`);
      if (!schRes || !schRes.success) throw new Error((schRes && schRes.message) || '학교 목록 로딩 실패');
      const rows =
        Array.isArray(schRes.schools) ? schRes.schools :
        Array.isArray(schRes.list)    ? schRes.list    :
        Array.isArray(schRes)         ? schRes         : [];

      const saved = rows.filter(s =>
        s.계산유형 === '특수공식' ||
        s.selection_rules ||
        s.bonus_rules ||
        s.score_config
      );

      if (!saved.length) {
        setStatus('규칙 저장된 학교가 없습니다.', 'info');
        resultsEl.innerHTML = `
          <div class="empty-state">
            <i class="ph-light ph-funnel"></i>
            <h3>${YEAR}학년도에 규칙이 저장된 학과가 없습니다</h3>
            <p>특수공식 · selection_rules · bonus_rules · score_config 중 하나 이상 필요.</p>
          </div>`;
        updateFilterCounts();
        return;
      }

      setStatus(`${saved.length}개 학과 계산 중…`, 'info');

      // 3) 병렬 계산
      const results = await Promise.all(saved.map(school =>
        window.api('/jungsi/calculate', {
          method: 'POST',
          body: JSON.stringify({ U_ID: school.U_ID, year: YEAR, studentScores: studentScoresForDebug }),
        }).catch(err => ({ success: false, message: err.message || '계산 오류' }))
      ));

      // 4) 렌더
      const html = saved.map((school, idx) => buildCardHtml(school, results[idx], STATE.notesMap[school.U_ID])).join('');
      resultsEl.innerHTML = html || `
        <div class="empty-state">
          <i class="ph-light ph-circle-dashed"></i>
          <h3>렌더 대상 없음</h3>
        </div>`;

      updateFilterCounts();
      applyFilter();
      setStatus(`계산 완료 — 총 ${saved.length}건`, 'success');
    } catch (err) {
      if (err.message === 'auth' || err.message === 'no-token') { setStatus('', ''); return; }
      console.error('[runDebugger]', err);
      setStatus(err.message || '실행 실패', 'error');
      toast('실행 실패: ' + err.message, 'error');
    } finally {
      runBtn.disabled = false;
      runBtn.innerHTML = origBtn;
    }
  }

  function buildCardHtml(school, r, note) {
    note = note || { is_correct: '?', memo: '' };
    const uniName  = school.대학명 || school.university || school.univ_name || school.univ || '';
    const deptName = school.학과명 || school.department || school.major || school.dept_name || '';
    const uid = school.U_ID;
    const cardClass =
      note.is_correct === 'Y' ? 'correct' :
      note.is_correct === 'N' ? 'incorrect' : '';

    let inner = '';
    if (r && r.success) {
      const calc = r.result || {};
      const total = (calc.totalScore != null) ? calc.totalScore : '—';
      let breakdownRows = '';
      if (calc.breakdown && typeof calc.breakdown === 'object') {
        for (const [k, v] of Object.entries(calc.breakdown)) {
          const num = (typeof v === 'number') ? v : Number(v);
          const val = Number.isFinite(num) ? num.toFixed(3) : _esc(v);
          breakdownRows += `<tr><td>${_esc(k)}</td><td>${val}</td></tr>`;
        }
      }
      inner = `
        <div class="total-score">${_esc(total)}</div>
        <table class="breakdown-table">${breakdownRows}</table>
        <div class="judge">
          <div class="status-group">
            <label><input type="radio" name="status-${_esc(uid)}" value="Y" ${note.is_correct==='Y'?'checked':''}> 맞음</label>
            <label><input type="radio" name="status-${_esc(uid)}" value="N" ${note.is_correct==='N'?'checked':''}> 틀림</label>
            <label><input type="radio" name="status-${_esc(uid)}" value="?" ${(note.is_correct!=='Y' && note.is_correct!=='N')?'checked':''}> 미확인</label>
          </div>
          <textarea data-uid="${_esc(uid)}" placeholder="메모를 입력하세요…">${_esc(note.memo || '')}</textarea>
        </div>
        <div class="save-row">
          <span class="meta">${note.updated_at ? ('최근 ' + new Date(note.updated_at).toLocaleString('ko-KR')) : '저장 이력 없음'}</span>
          <button class="btn btn-ghost" data-action="save" data-uid="${_esc(uid)}">
            <i class="ph-light ph-floppy-disk"></i> 저장
          </button>
        </div>`;
      if (calc.calculationLog) {
        const logStr = Array.isArray(calc.calculationLog)
          ? calc.calculationLog.map(l => String(l)).join('\n')
          : String(calc.calculationLog);
        inner += `
          <div class="calc-log">
            <h4>계산 과정</h4>${_esc(logStr)}
          </div>`;
      }
    } else {
      const errMsg = (r && r.message) ? r.message : '계산 실패';
      inner = `<div class="calc-error"><i class="ph-fill ph-warning-circle"></i> ${_esc(errMsg)}</div>`;
    }

    return `
      <article class="result-card ${cardClass}" data-uid="${_esc(uid)}">
        <header class="card-head">
          <div class="title"><span class="uid">[${_esc(uid)}]</span>${_esc(uniName)} · ${_esc(deptName)}</div>
          <span class="badge-slot">${badgeForStatus(note.is_correct)}</span>
        </header>
        ${inner}
      </article>`;
  }

  runBtn.addEventListener('click', runDebugger);

  // ── init ──
  if (!window.getToken || !window.getToken()) {
    setStatus('로그인이 필요합니다.', 'error');
  }
})();
