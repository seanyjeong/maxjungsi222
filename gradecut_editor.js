/* ============================================================ */
/* gradecut_editor.new.js — 예상 등급컷 입력 (등급컷 기준)      */
/* API: GET /jungsi/grade-cuts/get?year=&exam_type=&subject=   */
/*      POST /jungsi/grade-cuts/set-bulk                        */
/* 엑셀 붙여넣기 (Ctrl+V) 지원 — 탭(열) · 개행(행) 파싱          */
/* ============================================================ */
'use strict';

(function () {
  const LOGIN_PAGE = 'jungsilogin.html';

  // 과목 목록 (optgroup 구조)
  const SUBJECT_GROUPS = [
    { label: '국어 선택', options: ['화법과작문', '언어와매체'] },
    { label: '수학 선택', options: ['확률과통계', '미적분', '기하'] },
    { label: '사회탐구', options: ['생활과윤리', '윤리와사상', '한국지리', '세계지리', '동아시아사', '세계사', '정치와법', '경제', '사회문화'] },
    { label: '과학탐구', options: ['물리1', '화학1', '생명과학1', '지구과학1', '물리2', '화학2', '생명과학2', '지구과학2'] },
  ];

  // DOM
  const branchNameEl = document.getElementById('branchName');
  const yearSelect = document.getElementById('year-select');
  const examTypeSelect = document.getElementById('exam-type-select');
  const subjectSelect = document.getElementById('subject-select');
  const loadBtn = document.getElementById('load-cuts-btn');
  const gradecutForm = document.getElementById('gradecut-form');
  const tableBody = document.querySelector('#fixed-cuts-table tbody');
  const messageEl = document.getElementById('message');

  // ─────────────────────────────────────────────────
  // 인증 게이트 + 지점명 표시
  // ─────────────────────────────────────────────────
  const token = window.getToken && window.getToken();
  if (!token) {
    if (typeof window.showToast === 'function') window.showToast('로그인이 필요합니다', 'error');
    setTimeout(() => { window.location.href = LOGIN_PAGE; }, 800);
    return;
  }
  try {
    const info = window.getCounselorFromToken ? window.getCounselorFromToken() : {};
    branchNameEl.textContent = info.branch || '정보 없음';
  } catch (e) {
    console.warn('[gradecut_editor] JWT decode failed:', e);
    branchNameEl.textContent = '오류';
  }

  // ─────────────────────────────────────────────────
  // 메시지 유틸
  // ─────────────────────────────────────────────────
  function setMessage(text, cls) {
    messageEl.textContent = text || '';
    messageEl.className = 'message' + (cls ? ' ' + cls : '');
  }

  // ─────────────────────────────────────────────────
  // 과목 select 동적 생성 (optgroup)
  // ─────────────────────────────────────────────────
  SUBJECT_GROUPS.forEach((group) => {
    const og = document.createElement('optgroup');
    og.label = group.label;
    group.options.forEach((subject) => {
      const opt = document.createElement('option');
      opt.value = subject;
      opt.textContent = subject;
      og.appendChild(opt);
    });
    subjectSelect.appendChild(og);
  });

  // ─────────────────────────────────────────────────
  // 테이블 input name 세팅 + 9등급 기본값
  // ─────────────────────────────────────────────────
  tableBody.querySelectorAll('tr[data-grade]').forEach((tr) => {
    const grade = tr.dataset.grade;
    const type = tr.dataset.type;
    const inputs = tr.querySelectorAll('input[type="number"]');

    if (type === 'max') {
      inputs[0].name = 'raw_max';
      inputs[1].name = 'std_max';
      inputs[2].name = 'pct_max';
    } else if (grade) {
      inputs[0].name = 'raw_' + grade;
      inputs[1].name = 'std_' + grade;
      inputs[2].name = 'pct_' + grade;
      if (grade === '9') {
        if (!inputs[0].value) inputs[0].value = '0';
        if (!inputs[2].value) inputs[2].value = '0';
      }
    }
    inputs.forEach((input) => { input.required = true; });
  });

  // ─────────────────────────────────────────────────
  // 입력 필드 초기화 (9등급 raw/pct 는 0 유지)
  // ─────────────────────────────────────────────────
  function clearInputFields() {
    tableBody.querySelectorAll('input[type="number"]').forEach((input) => {
      if (input.name === 'raw_9') {
        input.value = '0';
      } else if (input.name === 'pct_9') {
        input.value = '0';
      } else {
        input.value = '';
      }
    });
    const rawMax = tableBody.querySelector('input[name="raw_max"]');
    const stdMax = tableBody.querySelector('input[name="std_max"]');
    const pctMax = tableBody.querySelector('input[name="pct_max"]');
    if (rawMax) rawMax.value = '';
    if (stdMax) stdMax.value = '';
    if (pctMax) pctMax.value = '';
  }

  // ─────────────────────────────────────────────────
  // 엑셀 붙여넣기 (행=\n, 칸=\t)
  // 시작 input 부터 채우기. 현재 행의 input 개수(보통 3)로 다음 행 시작 인덱스 계산.
  // ─────────────────────────────────────────────────
  tableBody.addEventListener('paste', (e) => {
    const startInput = e.target && e.target.closest && e.target.closest('input[type="number"]');
    if (!startInput) return; // 인풋 외 영역 붙여넣기는 기본 동작

    e.preventDefault();
    const clipboardData = (e.clipboardData || window.clipboardData).getData('text');
    if (!clipboardData) return;

    const allInputs = Array.from(tableBody.querySelectorAll('input[type="number"]'));
    const startIndex = allInputs.indexOf(startInput);
    if (startIndex === -1) return;

    const rows = clipboardData.replace(/\r\n/g, '\n').trim().split('\n');
    let currentInputRowIndex = startIndex;

    for (const row of rows) {
      const cells = row.split('\t');
      let tempColIndex = currentInputRowIndex;

      for (const cell of cells) {
        if (allInputs[tempColIndex]) {
          allInputs[tempColIndex].value = cell.trim();
          tempColIndex++;
        } else {
          break;
        }
      }

      if (!allInputs[currentInputRowIndex]) break;
      const currentRow = allInputs[currentInputRowIndex].closest('tr');
      const inputsInRow = currentRow ? currentRow.querySelectorAll('input[type="number"]').length : 3;
      currentInputRowIndex += inputsInRow;

      if (currentInputRowIndex >= allInputs.length) break;
    }
  });

  // ─────────────────────────────────────────────────
  // 불러오기 — GET /jungsi/grade-cuts/get
  // 서버 응답: { success, cuts: [{원점수, 표준점수, 백분위, 등급}...] }
  //   원점수 내림차순 정렬 가정. 맨 첫 row = 만점, 등급별 마지막 row = 해당 등급 컷.
  // ─────────────────────────────────────────────────
  loadBtn.addEventListener('click', async () => {
    const year = yearSelect.value;
    const examType = examTypeSelect.value;
    const subject = subjectSelect.value;

    if (!subject) {
      if (typeof window.showToast === 'function') window.showToast('과목을 선택해주세요', 'error');
      return;
    }

    setMessage('불러오는 중…', 'loading');
    clearInputFields();

    try {
      const qs = '?year=' + encodeURIComponent(year) +
                 '&exam_type=' + encodeURIComponent(examType) +
                 '&subject=' + encodeURIComponent(subject);
      const data = await window.api('/jungsi/grade-cuts/get' + qs);

      if (data && data.success && Array.isArray(data.cuts) && data.cuts.length > 0) {
        const cutsFromServer = data.cuts;

        // 만점 (첫 row)
        const maxRow = cutsFromServer[0];
        if (maxRow) {
          const rawMax = tableBody.querySelector('input[name="raw_max"]');
          const stdMax = tableBody.querySelector('input[name="std_max"]');
          const pctMax = tableBody.querySelector('input[name="pct_max"]');
          if (rawMax) rawMax.value = maxRow.원점수;
          if (stdMax) stdMax.value = maxRow.표준점수;
          if (pctMax) pctMax.value = maxRow.백분위;
        }

        // 1~9 등급별: 해당 등급 중 가장 낮은 원점수(마지막 요소)
        for (let grade = 1; grade <= 9; grade++) {
          const gradeCutData = cutsFromServer.filter((c) => c.등급 === grade).pop();
          if (gradeCutData) {
            const rawEl = tableBody.querySelector('input[name="raw_' + grade + '"]');
            const stdEl = tableBody.querySelector('input[name="std_' + grade + '"]');
            const pctEl = tableBody.querySelector('input[name="pct_' + grade + '"]');
            if (rawEl) rawEl.value = gradeCutData.원점수;
            if (stdEl) stdEl.value = gradeCutData.표준점수;
            if (pctEl) pctEl.value = gradeCutData.백분위;
          }
        }

        setMessage('[' + year + ' ' + examType + ' ' + subject + '] 등급컷을 불러왔습니다.', 'success');
        if (typeof window.showToast === 'function') window.showToast('등급컷 불러옴', 'success');
      } else if (data && data.success) {
        setMessage('저장된 등급컷이 없습니다. 새로 입력해주세요.', '');
      } else {
        setMessage((data && data.message) || '불러오기 실패', 'error');
      }
    } catch (err) {
      if (err && err.message === 'auth') return;
      console.error('[gradecut_editor] load error:', err);
      setMessage('서버 통신 오류: ' + (err && err.message ? err.message : ''), 'error');
    }
  });

  // ─────────────────────────────────────────────────
  // 저장 — POST /jungsi/grade-cuts/set-bulk
  // 페이로드: { year, exam_type, subject, cuts: [{원점수, 표준점수, 백분위, 등급}...] }
  // ─────────────────────────────────────────────────
  gradecutForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    setMessage('저장 중…', 'loading');

    const year = yearSelect.value;
    const examType = examTypeSelect.value;
    const subject = subjectSelect.value;

    if (!subject) {
      if (typeof window.showToast === 'function') window.showToast('과목을 선택해주세요', 'error');
      setMessage('', '');
      return;
    }

    const cutsData = [];
    let isValid = true;

    const rows = tableBody.querySelectorAll('tr[data-grade]');
    rows.forEach((tr) => {
      const grade = parseInt(tr.dataset.grade, 10);
      const type = tr.dataset.type;
      let rawInput, stdInput, pctInput;

      if (type === 'max') {
        rawInput = tr.querySelector('input[name="raw_max"]');
        stdInput = tr.querySelector('input[name="std_max"]');
        pctInput = tr.querySelector('input[name="pct_max"]');
      } else {
        rawInput = tr.querySelector('input[name="raw_' + grade + '"]');
        stdInput = tr.querySelector('input[name="std_' + grade + '"]');
        pctInput = tr.querySelector('input[name="pct_' + grade + '"]');
      }

      const rawScore = rawInput.value === '' ? null : parseInt(rawInput.value, 10);
      const stdScore = stdInput.value === '' ? null : parseInt(stdInput.value, 10);
      const percentile = pctInput.value === '' ? null : parseInt(pctInput.value, 10);

      if (rawScore === null || stdScore === null || percentile === null) {
        isValid = false;
      }

      if (rawScore !== null && stdScore !== null && percentile !== null) {
        cutsData.push({
          원점수: rawScore,
          표준점수: stdScore,
          백분위: percentile,
          등급: grade,
        });
      }
    });

    if (!isValid) {
      setMessage('만점 + 1~9 등급 모든 값을 입력해주세요.', 'error');
      if (typeof window.showToast === 'function') window.showToast('입력값을 확인해주세요', 'error');
      return;
    }

    try {
      const data = await window.api('/jungsi/grade-cuts/set-bulk', {
        method: 'POST',
        body: JSON.stringify({
          year: year,
          exam_type: examType,
          subject: subject,
          cuts: cutsData,
        }),
      });

      if (data && data.success) {
        setMessage('[' + year + ' ' + examType + ' ' + subject + '] 등급컷이 저장되었습니다.', 'success');
        if (typeof window.showToast === 'function') window.showToast('저장 완료', 'success');
      } else {
        setMessage((data && data.message) || '저장 실패', 'error');
      }
    } catch (err) {
      if (err && err.message === 'auth') return;
      console.error('[gradecut_editor] save error:', err);
      setMessage('서버 통신 오류: ' + (err && err.message ? err.message : ''), 'error');
    }
  });
})();
