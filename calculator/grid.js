'use strict';
window.createCalculatorGrid = function ({ esc, resultsThead, sortRows, sortState, getMaximum }) {
function renderHeader(formula) {
    const naeshinRatio = Number(formula.내신 || 0);
    const partial = window.SubjectivePractical?.getPolicy(formula);
    const practicalEvents = window.SubjectivePractical?.eventNames(formula) || [...new Set((formula.실기배점 || []).map(r => r.종목명))];

    let html = '<tr>';
    html += '<th class="name-col">#</th>';
    html += '<th class="name-col">학생</th>';
    html += '<th class="col-suneung"><span class="col-tag"></span>수능 점수</th>';
    if (partial) html += `<th>${partial.selectionLabel}</th>`;
    if (naeshinRatio > 0) {
      html += `<th class="col-naeshin"><span class="col-tag"></span>내신 (${naeshinRatio}%)</th>`;
    }
    practicalEvents.forEach(ev => {
      html += `<th class="col-silgi"><span class="col-tag"></span>${esc(ev)} · 기록</th>`;
      html += `<th class="col-silgi">${partial ? '객관점수' : '점수 (감점)'}</th>`;
    });
    html += `<th class="col-silgi"><span class="col-tag"></span>${partial ? partial.label + ' / ' + partial.maximum + '점' : '실기 총점'}</th>`;
    if (partial) html += '<th>수능+객관실기 합계</th><th>최종총점 (주관평가 제외)</th>';
    else html += `<th class="col-total sortable is-active" id="sort-by-total"><span class="col-tag"></span>총점 / ${Number(formula.총점) || 1000} <i class="ph-fill ph-caret-down sort-i"></i></th>`;
    if (partial) html += '<th class="consult-col">상담멘트</th>';
    html += '</tr>';
    resultsThead.innerHTML = html;

    const sortBtn = document.getElementById('sort-by-total');
    if (sortBtn) sortBtn.addEventListener('click', () => {
      sortState.value = (sortState.value === 'desc') ? 'asc' : 'desc';
      const icon = sortBtn.querySelector('.sort-i');
      icon.className = 'ph-fill ' + (sortState.value === 'desc' ? 'ph-caret-down' : 'ph-caret-up') + ' sort-i';
      sortRows();
    });
  }

function renderRowHtml(student, suneungScore, formula) {
    const genderClass = student.gender === '여' ? 'f' : 'm';
    const partial = window.SubjectivePractical?.getPolicy(formula);
    const selectionCell = partial ? `<td><select class="subjective-selection" data-subjective-selection aria-label="${esc(student.student_name)} ${partial.selectionLabel}" aria-describedby="subjectiveCalculationNote">
      <option value="">선택 안 함</option>${partial.choices.map(value => `<option value="${value}">${value}</option>`).join('')}</select></td>` : '';
    let naeshinCell = '';
    if (Number(formula.내신 || 0) > 0) {
      naeshinCell = `<td><input type="number" class="naeshin-input" placeholder="내신 입력"></td>`;
    }
    const practicalEvents = window.SubjectivePractical?.eventNames(formula) || [...new Set((formula.실기배점 || []).map(r => r.종목명))];
    let silgiCells = '';
    practicalEvents.forEach(ev => {
      silgiCells += `<td><input type="text" class="practical-input" data-event="${esc(ev)}" aria-label="${esc(student.student_name)} ${esc(ev)} 기록" placeholder="${ev === '기계체조' ? '학교에서 받은 점수' : '기록'}"></td>`;
      silgiCells += `<td class="score-cell score-silgi" data-event-score="${esc(ev)}">—</td>`;
    });

    const totalPct = Math.min(100, (suneungScore / getMaximum()) * 100);
    return `
      <td class="rank-cell"><span class="rank-badge">—</span></td>
      <td class="student-name-cell">
        <span class="gender-dot ${genderClass}"></span><span class="name">${esc(student.student_name)}</span>
        <span class="student-info">${esc(student.gender)} · ${esc(student.school_name || '정보없음')}</span>
      </td>
      <td class="score-cell score-suneung">${suneungScore.toFixed(2)}</td>
      ${selectionCell}
      ${naeshinCell}
      ${silgiCells}
      ${partial ? `<td><span class="score-cell score-objective total-silgi">—</span><p class="objective-status" role="status">객관 종목의 기록을 모두 입력해 주세요.</p></td>
        <td class="score-cell score-objective-subtotal">—</td>` : '<td class="score-cell score-silgi total-silgi">0.00 <span class="deduction zero">(0감)</span></td>'}
      <td>
        <div class="total-wrap">
          <span class="score-cell score-total">${partial ? '—' : suneungScore.toFixed(2)}</span>
          ${partial ? '' : `<span class="total-bar"><span class="fill" style="width:${totalPct.toFixed(1)}%"></span></span>`}
        </div>
      </td>
${partial ? `      <td class="consult-cell">
        <button type="button" class="consult-open-btn" data-consult-open>
          <i class="ph-light ph-sparkle"></i><span>생성</span>
        </button>
      </td>` : ''}
    `;
  }
return { renderHeader, renderRowHtml };
};
