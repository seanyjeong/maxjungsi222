/* ============================================================ */
/* topmax_editor.new.js — 최고표점 대량 편집                    */
/* API:                                                           */
/*   GET  /jungsi/topmax/subjects           (과목 목록)           */
/*   GET  /jungsi/topmax/{year}/{exam}      (데이터 로드)         */
/*   POST /jungsi/topmax/bulk-save          (전체 저장)           */
/* ============================================================ */
'use strict';

(function () {
  const subjectsDefault = [
    '화법과작문','언어와매체',
    '확률과통계','미적분','기하',
    '생활과윤리','윤리와사상','한국지리','세계지리','동아시아사','세계사','정치와법','경제','사회문화',
    '생명과학1','생명과학2','화학1','화학2','물리1','물리2','지구과학1','지구과학2'
  ];

  const year = document.getElementById('year');
  const exam = document.getElementById('exam');
  const btnLoad = document.getElementById('btnLoad');
  const btnSave = document.getElementById('btnSave');
  const msg = document.getElementById('msg');
  const hdr = document.getElementById('hdr');
  const row = document.getElementById('row');
  const tbl = document.getElementById('tbl');

  let subjects = subjectsDefault.slice();

  function setStatus(text, kind) {
    msg.textContent = text || '';
    msg.classList.remove('is-success', 'is-error', 'is-info');
    if (kind) msg.classList.add('is-' + kind);
  }

  function escapeAttr(s) {
    return String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  async function ensureSubjects() {
    try {
      const j = await window.api('/jungsi/topmax/subjects', { method: 'GET' });
      if (j && j.success && Array.isArray(j.subjects) && j.subjects.length) {
        subjects = j.subjects;
      }
    } catch (err) {
      // 실패 시 기본 과목 목록 유지
      console.warn('[topmax] subjects fallback:', err && err.message);
    }
  }

  function buildTable() {
    hdr.innerHTML = '<th>과목</th>' + subjects.map(function (s) {
      return '<th>' + escapeAttr(s) + '</th>';
    }).join('');
    row.innerHTML = '<td>최고점</td>' + subjects.map(function (s) {
      return '<td><input class="score" type="number" step="any" data-subject="' + escapeAttr(s) + '" /></td>';
    }).join('');
  }

  async function loadData() {
    const y = year.value;
    const e = exam.value;
    setStatus('[' + y + '/' + e + '] 불러오는 중...', 'info');
    try {
      const j = await window.api('/jungsi/topmax/' + encodeURIComponent(y) + '/' + encodeURIComponent(e), { method: 'GET' });
      if (!j || !j.success) {
        setStatus((j && j.message) || '로드 실패', 'error');
        return;
      }
      // 입력 초기화
      row.querySelectorAll('input.score').forEach(function (inp) { inp.value = ''; });
      // 채우기
      const data = j.data || {};
      Object.keys(data).forEach(function (sub) {
        const inp = row.querySelector('input[data-subject="' + CSS.escape(sub) + '"]');
        if (inp) inp.value = data[sub];
      });
      setStatus('[' + y + '/' + e + '] 불러오기 완료', 'success');
      if (window.showToast) window.showToast('최고표점 로드 완료', 'success');
    } catch (err) {
      console.error('[topmax] load error:', err);
      setStatus('불러오기 실패: ' + (err && err.message ? err.message : '알 수 없는 오류'), 'error');
    }
  }

  async function saveData() {
    const scores = {};
    row.querySelectorAll('input.score').forEach(function (inp) {
      const v = String(inp.value || '').trim();
      if (v !== '') {
        const num = Number(v);
        if (isFinite(num)) scores[inp.dataset.subject] = num;
      }
    });
    setStatus('저장 중...', 'info');
    try {
      const j = await window.api('/jungsi/topmax/bulk-save', {
        method: 'POST',
        body: JSON.stringify({ year: year.value, exam: exam.value, scores: scores })
      });
      const txt = (j && j.message) || ((j && j.success) ? '저장 완료' : '저장 실패');
      setStatus(txt, (j && j.success) ? 'success' : 'error');
      if (window.showToast) window.showToast(txt, (j && j.success) ? 'success' : 'error');
    } catch (err) {
      console.error('[topmax] save error:', err);
      setStatus('저장 실패: ' + (err && err.message ? err.message : '알 수 없는 오류'), 'error');
    }
  }

  // 엑셀 1행 붙여넣기 지원
  tbl.addEventListener('paste', function (e) {
    const cd = e.clipboardData || window.clipboardData;
    const text = cd ? cd.getData('text') : '';
    if (!text) return;
    e.preventDefault();
    const tokens = text.trim().split(/\t|,|\s+/);
    const inputs = Array.prototype.slice.call(row.querySelectorAll('input.score'));
    for (let i = 0; i < inputs.length && i < tokens.length; i++) {
      inputs[i].value = tokens[i];
    }
    if (window.showToast) window.showToast('붙여넣기 ' + Math.min(inputs.length, tokens.length) + '개 채움', 'info');
  });

  btnLoad.addEventListener('click', loadData);
  btnSave.addEventListener('click', saveData);
  year.addEventListener('change', loadData);
  exam.addEventListener('change', loadData);

  // 초기화
  (async function init() {
    if (!window.getToken || !window.getToken()) {
      // auth 미로그인 시 common auth 처리에 맡기되, 테이블 뼈대는 미리 만든다
      buildTable();
      if (window.handleAuthError) window.handleAuthError();
      return;
    }
    await ensureSubjects();
    buildTable();
    await loadData();
  })();
})();
