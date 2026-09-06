'use strict';
window.createCalculatorGrid = function ({ esc, resultsThead, sortRows, sortState, getMaximum }) {
function renderHeader(formula) {
    const naeshinRatio = Number(formula.내신 || 0);
    const practicalEvents = [...new Set((formula.실기배점 || []).map(r => r.종목명))];

    let html = '<tr>';
    html += '<th class="name-col">#</th>';
    html += '<th class="name-col">학생</th>';
    html += '<th class="col-suneung"><span class="col-tag"></span>수능 점수</th>';
    if (naeshinRatio > 0) {
      html += `<th class="col-naeshin"><span class="col-tag"></span>내신 (${naeshinRatio}%)</th>`;
    }
    practicalEvents.forEach(ev => {
      html += `<th class="col-silgi"><span class="col-tag"></span>${esc(ev)} · 기록</th>`;
      html += `<th class="col-silgi">점수 (감점)</th>`;
    });
    html += `<th class="col-silgi"><span class="col-tag"></span>실기 총점</th>`;
    html += `<th class="col-total sortable is-active" id="sort-by-total"><span class="col-tag"></span>총점 / ${Number(formula.총점) || 1000} <i class="ph-fill ph-caret-down sort-i"></i></th>`;
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
    let naeshinCell = '';
    if (Number(formula.내신 || 0) > 0) {
      naeshinCell = `<td><input type="number" class="naeshin-input" placeholder="내신 입력"></td>`;
    }
    const practicalEvents = [...new Set((formula.실기배점 || []).map(r => r.종목명))];
    let silgiCells = '';
    practicalEvents.forEach(ev => {
      silgiCells += `<td><input type="text" class="practical-input" data-event="${esc(ev)}" placeholder="기록"></td>`;
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
      ${naeshinCell}
      ${silgiCells}
      <td class="score-cell score-silgi total-silgi">0.00 <span class="deduction zero">(0감)</span></td>
      <td>
        <div class="total-wrap">
          <span class="score-cell score-total">${suneungScore.toFixed(2)}</span>
          <span class="total-bar"><span class="fill" style="width:${totalPct.toFixed(1)}%"></span></span>
        </div>
      </td>
    `;
  }
return { renderHeader, renderRowHtml };
};
