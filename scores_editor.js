/* ============================================================ */
/* scores_editor.new.js — 등급별 점수 대량 편집 (영어 + 한국사)  */
/* API: GET /jungsi/schools/{year}                               */
/*      POST /jungsi/scores/bulk-save                            */
/* 엑셀 붙여넣기 (Ctrl+V): 여러 줄 붙여넣기 시 다음 row textarea 로 연쇄 채움 */
/* ============================================================ */
'use strict';

(function () {
  const LOGIN_PAGE = 'jungsilogin.html';

  // DOM
  const yearSelector = document.getElementById('year-selector');
  const loadBtn = document.getElementById('load-btn');
  const saveBtn = document.getElementById('save-btn');
  const englishTbody = document.getElementById('english-tbody');
  const historyTbody = document.getElementById('history-tbody');
  const messageArea = document.getElementById('message-area');

  // ─────────────────────────────────────────────────
  // 인증 게이트
  // ─────────────────────────────────────────────────
  const token = window.getToken && window.getToken();
  if (!token) {
    if (typeof window.showToast === 'function') window.showToast('로그인이 필요합니다', 'error');
    setTimeout(() => { window.location.href = LOGIN_PAGE; }, 800);
    return;
  }

  // ─────────────────────────────────────────────────
  // 메시지 유틸
  // ─────────────────────────────────────────────────
  function showMessage(text, cls) {
    messageArea.textContent = text || '';
    messageArea.className = 'message' + (cls ? ' ' + cls : '');
    messageArea.classList.remove('hidden');
  }
  function hideMessage() {
    messageArea.classList.add('hidden');
  }

  // ─────────────────────────────────────────────────
  // JSON({"1":..., "9":...}) -> 탭 구분 텍스트
  // ─────────────────────────────────────────────────
  function jsonToText(value) {
    if (value === null || value === undefined || value === '') return '';
    let obj = value;
    if (typeof value === 'string') {
      try { obj = JSON.parse(value); } catch (e) { return ''; }
    }
    if (typeof obj !== 'object' || obj === null) return '';
    return Array.from({ length: 9 }, (_, i) => {
      const v = obj[String(i + 1)];
      return (v === undefined || v === null) ? '' : v;
    }).join('\t');
  }

  // ─────────────────────────────────────────────────
  // HTML escape (XSS 방지)
  // ─────────────────────────────────────────────────
  function esc(v) {
    if (v === null || v === undefined) return '';
    return String(v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ─────────────────────────────────────────────────
  // 빈 상태 / 로딩 상태
  // ─────────────────────────────────────────────────
  function renderEmpty(tbody, iconCls, text) {
    tbody.innerHTML =
      '<tr><td colspan="11"><div class="empty-state">' +
      '<i class="ph-light ' + iconCls + '"></i>' +
      '<span>' + esc(text) + '</span>' +
      '</div></td></tr>';
  }

  // JSON 값 → 9개 배열 ['','',...]
  function jsonToArr(value) {
    if (value === null || value === undefined || value === '') return Array(9).fill('');
    let obj = value;
    if (typeof value === 'string') {
      try { obj = JSON.parse(value); } catch (e) { return Array(9).fill(''); }
    }
    if (typeof obj !== 'object' || obj === null) return Array(9).fill('');
    return Array.from({ length: 9 }, (_, i) => {
      const v = obj[String(i + 1)];
      return (v === undefined || v === null) ? '' : String(v);
    });
  }

  function rowInputsHtml(uid, arr) {
    let html = '';
    for (let i = 0; i < 9; i++) {
      html += '<td class="col-grade"><input type="text" inputmode="decimal" data-uid="' + uid + '" data-grade="' + (i + 1) + '" value="' + esc(arr[i] || '') + '" spellcheck="false"></td>';
    }
    return html;
  }

  // ─────────────────────────────────────────────────
  // 데이터 불러오기 — GET /jungsi/schools/{year}
  //   응답: { success, schools: [{ U_ID, 대학명, 학과명, english_scores, history_scores }...] }
  // ─────────────────────────────────────────────────
  async function loadAllData() {
    const selectedYear = yearSelector.value;
    showMessage('[' + selectedYear + '학년도] 데이터를 불러오는 중…', '');

    renderEmpty(englishTbody, 'ph-circle-notch spin', '불러오는 중…');
    renderEmpty(historyTbody, 'ph-circle-notch spin', '불러오는 중…');

    try {
      const data = await window.api('/jungsi/scores/list/' + encodeURIComponent(selectedYear));

      if (data && data.success && Array.isArray(data.schools)) {
        if (data.schools.length === 0) {
          renderEmpty(englishTbody, 'ph-inbox', '데이터 없음');
          renderEmpty(historyTbody, 'ph-inbox', '데이터 없음');
          showMessage('[' + selectedYear + '학년도] 데이터가 없습니다.', '');
          return;
        }

        const enRows = [];
        const hiRows = [];
        data.schools.forEach((school) => {
          const uid = esc(school.U_ID);
          const univ = esc(school.university || school.대학명 || '');
          const dept = esc(school.department || school.학과명 || '');
          const enArr = jsonToArr(school.english_scores);
          const hiArr = jsonToArr(school.history_scores);
          enRows.push(
            '<tr data-uid="' + uid + '">' +
            '<td class="univ" title="' + univ + '">' + univ + '</td>' +
            '<td class="dept" title="' + dept + '">' + dept + '</td>' +
            rowInputsHtml(uid, enArr) +
            '</tr>'
          );
          hiRows.push(
            '<tr data-uid="' + uid + '">' +
            '<td class="univ" title="' + univ + '">' + univ + '</td>' +
            '<td class="dept" title="' + dept + '">' + dept + '</td>' +
            rowInputsHtml(uid, hiArr) +
            '</tr>'
          );
        });
        englishTbody.innerHTML = enRows.join('');
        historyTbody.innerHTML = hiRows.join('');

        showMessage('[' + selectedYear + '학년도] ' + data.schools.length + '개의 데이터를 불러왔습니다.', 'success');
        if (typeof window.showToast === 'function') {
          window.showToast(data.schools.length + '개 불러옴', 'success');
        }
      } else {
        renderEmpty(englishTbody, 'ph-warning', '불러오기 실패');
        renderEmpty(historyTbody, 'ph-warning', '불러오기 실패');
        showMessage((data && data.message) || '[' + selectedYear + '학년도] 데이터를 불러오지 못했습니다.', 'error');
      }
    } catch (err) {
      if (err && err.message === 'auth') return;
      console.error('[scores_editor] load error:', err);
      renderEmpty(englishTbody, 'ph-warning', '오류');
      renderEmpty(historyTbody, 'ph-warning', '오류');
      showMessage('서버 통신 중 오류: ' + (err && err.message ? err.message : ''), 'error');
    }
  }

  // ─────────────────────────────────────────────────
  // 저장 — POST /jungsi/scores/bulk-save
  //   body: { year, scores_data: [{U_ID, english_text, history_text}...] }
  // ─────────────────────────────────────────────────
  function rowToText(tr) {
    const inputs = tr.querySelectorAll('input[data-grade]');
    const arr = [];
    inputs.forEach((inp) => arr.push((inp.value || '').trim()));
    return arr.join('\t');
  }

  async function saveAllData() {
    const selectedYear = yearSelector.value;
    showMessage('[' + selectedYear + '학년도] 저장 중…', '');

    const enRows = englishTbody.querySelectorAll('tr[data-uid]');
    const hiRows = historyTbody.querySelectorAll('tr[data-uid]');

    if (enRows.length === 0) {
      showMessage('저장할 데이터가 없습니다. 먼저 불러오기를 해주세요.', 'error');
      return;
    }

    const hiMap = new Map();
    hiRows.forEach((tr) => hiMap.set(tr.dataset.uid, rowToText(tr)));

    const scoresData = [];
    enRows.forEach((tr) => {
      const uid = tr.dataset.uid;
      scoresData.push({
        U_ID: uid,
        english_text: rowToText(tr),
        history_text: hiMap.get(uid) || '',
      });
    });

    try {
      const data = await window.api('/jungsi/scores/bulk-save', {
        method: 'POST',
        body: JSON.stringify({
          year: selectedYear,
          scores_data: scoresData,
        }),
      });
      showMessage(data && data.message ? data.message : (data && data.success ? '저장 완료' : '저장 실패'),
                  data && data.success ? 'success' : 'error');
      if (typeof window.showToast === 'function') {
        window.showToast(data && data.success ? '저장 완료' : '저장 실패', data && data.success ? 'success' : 'error');
      }
    } catch (err) {
      if (err && err.message === 'auth') return;
      console.error('[scores_editor] save error:', err);
      showMessage('서버 통신 중 오류: ' + (err && err.message ? err.message : ''), 'error');
    }
  }

  // ─────────────────────────────────────────────────
  // 엑셀 붙여넣기 — 여러 줄이면 다음 row 의 textarea 로 연쇄 채움
  // ─────────────────────────────────────────────────
  function handlePaste(event) {
    const target = event.target;
    if (!target || target.tagName !== 'INPUT' || !target.dataset.grade) return;

    const pasteData = (event.clipboardData || window.clipboardData).getData('text');
    if (!pasteData) return;

    // 여러 줄 붙여넣기인 경우만 커스텀 처리, 단일 값은 브라우저 기본
    const rawRows = pasteData.replace(/\r\n|\r/g, '\n').replace(/\n+$/, '').split('\n');
    const looksTabular = rawRows.some(r => /\t/.test(r)) || rawRows.length > 1;
    if (!looksTabular) return;

    event.preventDefault();
    const startGrade = parseInt(target.dataset.grade, 10) - 1;
    let currentTr = target.closest('tr');

    rawRows.forEach((line) => {
      if (!currentTr) return;
      const cells = line.split('\t');
      const inputs = currentTr.querySelectorAll('input[data-grade]');
      for (let i = 0; i < cells.length; i++) {
        const idx = startGrade + i;
        if (idx >= inputs.length) break;
        inputs[idx].value = cells[i].trim();
      }
      currentTr = currentTr.nextElementSibling;
    });
  }

  // ─────────────────────────────────────────────────
  // 이벤트 바인딩
  // ─────────────────────────────────────────────────
  englishTbody.addEventListener('paste', handlePaste);
  historyTbody.addEventListener('paste', handlePaste);

  loadBtn.addEventListener('click', loadAllData);
  saveBtn.addEventListener('click', saveAllData);
  yearSelector.addEventListener('change', loadAllData);

  // 초기 로드
  loadAllData();
})();
