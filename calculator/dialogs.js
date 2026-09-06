'use strict';
window.createCalculatorDialogs = function ({ esc, examSelect, yearSelect, gunSelect, convertScoresToSuneungFormat, getFormula, getStudents }) {
function openStudentScoresModal(student) {
    const currentFormula = getFormula(), currentStudents = getStudents();
    const modal = document.getElementById('studentScoresModal');
    if (!modal) return;
    const nameEl = document.getElementById('scoresModalName');
    const metaEl = document.getElementById('scoresModalMeta');
    const bodyEl = document.getElementById('scoresModalBody');
    const gender = student.gender || '';
    const genderClass = gender === '여' ? 'f' : 'm';
    const initial = student.student_name ? student.student_name.charAt(0) : '·';
    nameEl.innerHTML = `
      <span class="sc-avatar sc-avatar-${genderClass}">${esc(initial)}</span>
      <span class="sc-name-text">${esc(student.student_name || '—')}</span>
      <span class="sc-gender-chip sc-gender-${genderClass}">${esc(gender || '-')}</span>
    `;
    const examText = examSelect.value ? examSelect.value : '수능';
    const s = student.scores;
    const inputTypeLabel = s && s['입력유형'] === 'official' ? '성적표' : s && s['입력유형'] === 'raw' ? '가채점' : '';
    const inputTypeClass = s && s['입력유형'] === 'official' ? 'official' : 'raw';
    const chips = [
      student.school_name ? `<span class="sc-chip"><i class="ph-light ph-graduation-cap"></i>${esc(student.school_name)}</span>` : '',
      `<span class="sc-chip"><i class="ph-light ph-calendar-dot"></i>${esc(yearSelect.value)}학년도</span>`,
      `<span class="sc-chip"><i class="ph-light ph-exam"></i>${esc(examText)}</span>`,
      inputTypeLabel ? `<span class="sc-chip sc-input-${inputTypeClass}"><i class="ph-light ph-clipboard-text"></i>${esc(inputTypeLabel)}</span>` : '',
    ].filter(Boolean).join('');
    metaEl.innerHTML = chips;

    if (!s) {
      bodyEl.innerHTML = `<div class="modal-empty"><i class="ph-light ph-file-dashed"></i><p>해당 학년도·모형 성적이 없습니다.</p></div>`;
    } else {
      const fmtCell = (v) => (v === null || v === undefined || v === '') ? '<span class="sc-dash">—</span>' : esc(String(v));
      const gradeCell = (v) => {
        if (v === null || v === undefined || v === '') return '<span class="sc-dash">—</span>';
        const n = Number(v);
        const tier = isFinite(n) ? (n <= 2 ? 'top' : n <= 4 ? 'mid' : 'low') : '';
        return `<span class="sc-grade-pill sc-grade-${tier}">${esc(String(v))}</span>`;
      };
      const row = (icon, label, sub, raw, std, pct, grade) => `
        <tr>
          <th class="sc-label">
            <i class="ph-light ${icon}"></i>
            <div>
              <div class="sc-label-name">${esc(label)}</div>
              ${sub ? `<div class="sc-sub">${esc(sub)}</div>` : ''}
            </div>
          </th>
          <td>${fmtCell(raw)}</td>
          <td>${fmtCell(std)}</td>
          <td>${fmtCell(pct)}</td>
          <td class="sc-grade-cell">${gradeCell(grade)}</td>
        </tr>`;
      bodyEl.innerHTML = `
        <div class="scores-wrap">
          <div class="scores-table-wrap">
            <table class="scores-table">
              <thead>
                <tr><th>영역</th><th>원점수</th><th>표준</th><th>백분위</th><th>등급</th></tr>
              </thead>
              <tbody>
                ${row('ph-book-open-text', '국어',   s['국어_선택과목'],   s['국어_원점수'],   s['국어_표준점수'],   s['국어_백분위'],   s['국어_등급'])}
                ${row('ph-function',       '수학',   s['수학_선택과목'],   s['수학_원점수'],   s['수학_표준점수'],   s['수학_백분위'],   s['수학_등급'])}
                ${row('ph-globe-hemisphere-west', '영어', '',           s['영어_원점수'],   null,                null,                s['영어_등급'])}
                ${row('ph-flask',          '탐구1', s['탐구1_선택과목'], s['탐구1_원점수'], s['탐구1_표준점수'], s['탐구1_백분위'], s['탐구1_등급'])}
                ${row('ph-flask',          '탐구2', s['탐구2_선택과목'], s['탐구2_원점수'], s['탐구2_표준점수'], s['탐구2_백분위'], s['탐구2_등급'])}
                ${row('ph-scroll',         '한국사', '',                 s['한국사_원점수'], null,                null,                s['한국사_등급'])}
              </tbody>
            </table>
          </div>
        </div>`;
    }
    modal.classList.add('show');
  }

return { openStudentScoresModal };
};
