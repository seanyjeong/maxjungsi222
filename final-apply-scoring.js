'use strict';
(function () {
  window.createFinalApplyScoring = function (state) {
  async function calcSuneung(student, U_ID, year = state.year) {
    if (!student || !student.scores) return null;
    try {
      const data = await window.api('/jungsi/calculate', {
        method: 'POST',
        body: JSON.stringify({
          U_ID, year,
          studentScores: window.convertScoresToSuneungFormat(student.scores),
        }),
      });
      const score = data?.result?.totalScore;
      if (data?.success && score !== null && score !== undefined && score !== '' && Number.isFinite(Number(score))) return Number(score);
    } catch (e) { console.error(e); }
    return null;
  }

  async function calcSilgi(formula, student, practicals) {
    try {
      const data = await window.api('/silgi/calculate', {
        method: 'POST',
        body: JSON.stringify({
          F_data: formula,
          S_data: { gender: student.gender, practicals },
        }),
      });
      if (data?.success) return data.result;
    } catch (e) { console.error(e); }
    return null;
  }

  async function recalc(el, gun) {
    const data = state.cards[gun];
    if (!data || !data.formula || !data.deptId) return;
    const formula = data.formula;
    const student = state.selectedStudent;
    const year = state.year, deptId = data.deptId, request = (data.scoreRequest || 0) + 1;
    data.scoreRequest = request;
    data.scoreSnapshot = null;
    const current = () => state.cards[gun] === data && state.selectedStudent === student &&
      state.year === year && data.deptId === deptId && data.scoreRequest === request;
    const scopedFormula = {...formula, U_ID: deptId, 학년도: year};
    const format = value => window.AdmissionsScoreFormat.format(value, scopedFormula);

    const suneung = await calcSuneung(student, deptId, year);
    if (!current()) return null;
    if (suneung === null) {
      el.querySelector('.suneung-v').textContent = '—';
      el.querySelector('.total-v').textContent = '—';
      return null;
    }
    el.querySelector('.suneung-v').textContent = format(suneung);

    // Naeshin client calc
    let naeshin = 0;
    const hasNaeshin = Number(formula.내신 || 0) > 0;
    if (hasNaeshin) {
      const raw = parseFloat(el.querySelector('.naeshin-input').value);
      if (Number.isFinite(raw) && raw > 0) {
        const ratio = (Number(formula.내신) || 0) / 100;
        const total = Number(formula.총점) || 1000;
        const max = Number(formula.내신만점) || 0;
        if (max > 0) naeshin = (raw / max) * ratio * total;
        else naeshin = raw;
      }
    }
    el.querySelector('.naeshin-v').textContent = window.fmt2(naeshin);

    // Silgi via API
    const practicals = [];
    el.querySelectorAll('.silgi-input').forEach((inp) => {
      if (inp.value.trim()) practicals.push({ event: inp.closest('.ghost-input').dataset.event, value: inp.value.trim() });
    });
    let silgiScore = 0;
    let totalDeduct = 0;
    let practicalResult = null;
    const perEvent = {};
    if (practicals.length) {
      const result = await calcSilgi(formula, student, practicals);
      if (!current()) return null;
      practicalResult = result;
      if (result) {
        silgiScore = Number(result.totalScore || 0);
        totalDeduct = result.breakdown?.total_deduction_level || 0;
        (result.breakdown?.events || []).forEach((ev) => { perEvent[ev.event] = ev; });
      }
    }
    el.querySelector('.silgi-v').innerHTML = `${window.fmt2(silgiScore)}${totalDeduct ? ` <span class="deduction">(${totalDeduct}감)</span>` : ''}`;
    el.querySelectorAll('.ghost-input').forEach((row) => {
      const ev = row.dataset.event;
      const span = row.querySelector('.event-score');
      const det = perEvent[ev];
      if (det && det.score != null) {
        span.innerHTML = `<strong>${window.fmt2(det.score)}</strong> <span class="deduction">(${det.deduction_level}감)</span>`;
      } else { span.textContent = '–'; }
    });

    // Total
    const total = suneung + naeshin + silgiScore;
    const max = Number(formula.총점) || 1000;
    el.querySelector('.total-v').innerHTML = `${format(total)}<span class="unit">/${max}</span>`;
    el.querySelector('.bar-cur').textContent = format(total);
    const pct = Math.max(0, Math.min(100, (total / max) * 100));
    el.querySelector('.score-hud .bar .fill').style.width = `${pct}%`;
    el.querySelector('.score-hud').classList.remove('empty');
    data.scoreSnapshot = {suneung, total, practicalResult, year, deptId, studentId: student.student_id};
    return data.scoreSnapshot;
  }

  // ---- Select student ----
    return {calcSuneung, calcSilgi, recalc};
  };
})();
