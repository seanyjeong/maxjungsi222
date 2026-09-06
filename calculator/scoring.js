'use strict';
window.createCalculatorScoring = function ({ resultsTbody, getFormula, getStudents, getMaximum, getSort }) {
function setPracticalState(tr, status) {
    tr.dataset.practicalStatus = status;
    const cell = tr.querySelector('.total-silgi');
    if (cell) { cell.textContent = window.PracticalInput.messages[status]; cell.setAttribute('role', 'status'); }
    const total = tr.querySelector('.score-total');
    if (total) total.textContent = '—';
    const fill = tr.querySelector('.total-bar .fill');
    if (fill) fill.style.width = '0%';
    tr.querySelectorAll('[data-event-score]').forEach(cell => { cell.textContent = '—'; });
  }
function bindInputListeners() {
    document.querySelectorAll('.practical-input, .naeshin-input').forEach(input => {
      if (input.classList.contains('practical-input')) input.addEventListener('input', () => {
        const tr = input.closest('tr');
        tr.dataset.practicalVersion = String(Number(tr.dataset.practicalVersion || 0) + 1);
        setPracticalState(tr, 'incomplete');
      });
      input.addEventListener('change', (e) => {
        const tr = e.target.closest('tr');
        if (e.target.classList.contains('practical-input')) {
          recalculateSilgiAndTotal(tr);
        } else {
          recalculateTotal(tr);
          sortResultsTable();
        }
      });
    });
  }

async function recalculateSilgiAndTotal(tr) {
    const currentFormula = getFormula(), currentStudents = getStudents();
    const version = tr.dataset.practicalVersion = String(Number(tr.dataset.practicalVersion || 0) + 1);
    if (!currentFormula) return;
    const studentId = tr.dataset.studentId;
    const student = currentStudents.find(s => String(s.student_id) === String(studentId));
    if (!student) return;

    const practicals = [];
    tr.querySelectorAll('.practical-input').forEach(input => {
      practicals.push({ event: input.dataset.event, value: input.value });
    });

    const input = window.PracticalInput.prepare(currentFormula, student.gender, practicals);
    if (!input.ready) { setPracticalState(tr, input.reason); sortResultsTable(); return; }
    const S_data = { gender: student.gender, practicals: input.records };
    const F_data = currentFormula;
    setPracticalState(tr, 'calculating');
    const isCurrent = () => tr.isConnected && tr.dataset.practicalVersion === version && getFormula() === currentFormula;

    let silgiScore = 0;
    let silgiResult = null;
    try {
      const data = await window.api('/silgi/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ F_data, S_data })
      });
      if (!isCurrent()) return;
      silgiScore = window.PracticalInput.resultScore(data);
      silgiResult = data.result;
    } catch (_error) {
      if (isCurrent()) { setPracticalState(tr, 'failed'); sortResultsTable(); }
      return;
    }
    tr.dataset.practicalStatus = 'ready';

    // per-event cells
    if (silgiResult?.breakdown?.events) {
      silgiResult.breakdown.events.forEach(ev => {
        const cell = tr.querySelector(`td[data-event-score="${ev.event}"]`);
        if (!cell) return;
        if (ev.score === null) {
          cell.innerHTML = '—';
        } else {
          const lvl = ev.deduction_level || 0;
          const dedClass = lvl > 0 ? 'deduction' : 'deduction zero';
          cell.innerHTML = `${ev.score} <span class="${dedClass}">(${lvl}감)</span>`;
        }
      });
    }

    // total silgi
    const totalSilgiCell = tr.querySelector('.total-silgi');
    const totalDed = silgiResult?.breakdown?.total_deduction_level || 0;
    const dedClass = totalDed > 0 ? 'deduction' : 'deduction zero';
    totalSilgiCell.innerHTML = `${silgiScore.toFixed(2)} <span class="${dedClass}">(${totalDed}감)</span>`;

    recalculateTotal(tr, silgiScore);
    sortResultsTable();
  }

function recalculateTotal(tr, silgiScore = null) {
    const currentFormula = getFormula(), currentMaxTotal = getMaximum();
    if (tr.dataset.practicalStatus && tr.dataset.practicalStatus !== 'ready') return;
    const suneungScore = Number(tr.querySelector('.score-suneung')?.textContent || 0);

    if (silgiScore === null) {
      const silgiText = tr.querySelector('.total-silgi')?.textContent || '0';
      silgiScore = parseFloat(silgiText) || 0;
    }

    const naeshinInput = tr.querySelector('.naeshin-input');
    let naeshinScore = 0;
    if (naeshinInput && currentFormula) {
      const raw = Number(naeshinInput.value || 0);
      const ratio = (Number(currentFormula.내신) || 0) / 100;
      const max = Number(currentFormula.내신만점) || 0;
      const SCHOOL_TOTAL = Number(currentFormula.총점) > 0 ? Number(currentFormula.총점) : 1000;
      if (ratio > 0 && max > 0 && raw > 0) naeshinScore = (raw / max) * ratio * SCHOOL_TOTAL;
      else if (ratio > 0 && raw > 0 && max === 0) naeshinScore = raw;
    }

    const total = suneungScore + silgiScore + naeshinScore;
    const totalEl = tr.querySelector('.score-total');
    if (totalEl) totalEl.textContent = total.toFixed(2);
    const bar = tr.querySelector('.total-bar .fill');
    if (bar) {
      const pct = Math.min(100, (total / currentMaxTotal) * 100);
      bar.style.width = pct.toFixed(1) + '%';
    }
  }

function sortResultsTable() {
    const sortDir = getSort();
    const rows = Array.from(resultsTbody.querySelectorAll('tr'));
    rows.sort((a, b) => {
      const aS = Number(a.querySelector('.score-total')?.textContent || 0);
      const bS = Number(b.querySelector('.score-total')?.textContent || 0);
      if (!Number.isFinite(aS)) return Number.isFinite(bS) ? 1 : 0;
      if (!Number.isFinite(bS)) return -1;
      return sortDir === 'desc' ? (bS - aS) : (aS - bS);
    });
    rows.forEach((row, i) => {
      resultsTbody.appendChild(row);
      const rankCell = row.querySelector('.rank-cell');
      if (rankCell) {
        const badge = rankCell.querySelector('.rank-badge');
        const valid = Number.isFinite(Number(row.querySelector('.score-total')?.textContent));
        badge.textContent = valid ? String(i + 1).padStart(2, '0') : '—';
        rankCell.classList.toggle('is-top', valid && i < 3);
      }
    });
  }
return { bindInputListeners, recalculateSilgiAndTotal, recalculateTotal, sortResultsTable };
};
