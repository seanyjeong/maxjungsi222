'use strict';
window.CalculatorSubjectivePractical = (() => {
  function formulaNotice(formula) {
    const policy = window.SubjectivePractical.getPolicy(formula);
    const pending = window.AdmissionsPracticalInput?.stageNotice(formula);
    let note = document.getElementById('subjectiveCalculationNote');
    if (!note) {
      note = document.createElement('section');
      note.id = 'subjectiveCalculationNote';
      note.className = 'calculator-subjective-note';
      document.getElementById('formulaStrip')?.after(note);
    }
    note.hidden = !policy && !pending;
    const totalLegend = document.querySelector('#resultsLegend .dot-total')?.parentElement;
    if (totalLegend) totalLegend.hidden = !!policy || !!pending;
    if (pending) {
      note.textContent = pending;
      const cuts = document.getElementById('formulaCuts'); if (cuts) cuts.hidden = true;
      return;
    }
    if (!policy) return;
    note.innerHTML = `<strong>${policy.label} ${policy.maximum}점만 계산</strong>
      <p>${window.SubjectivePractical.excludedText(policy)}</p><p>${policy.inputHint}</p>
      <p>${policy.choices.length ? '학생별 종목 선택은 객관점수에 영향을 주지 않습니다. ' : ''}수능+객관실기 합계는 최종총점·컷 비교·순위에 사용하지 않습니다.</p>`;
    const cuts = document.getElementById('formulaCuts');
    if (cuts) cuts.hidden = true;
  }
  function state(tr, status, message, ineligible = false) {
    if (!tr.querySelector('.score-objective')) return;
    delete tr.dataset.objectiveScore;
    tr.querySelector('.score-objective').textContent = '—';
    tr.querySelector('.score-objective-subtotal').textContent = '—';
    tr.querySelector('.score-total').textContent = '—';
    const absent = ineligible || [...tr.querySelectorAll('[data-event]')].some(input => input.value.trim() === '미응시');
    tr.dataset.objectiveIneligible = String(absent);
    const notice = message || (status === 'incomplete' ? '객관 종목의 기록을 모두 입력해 주세요.' : window.PracticalInput.messages[status]);
    tr.querySelector('.objective-status').textContent = [absent ? window.SubjectivePractical.INELIGIBLE_MESSAGE : '', notice].filter(Boolean).join(' ');
  }
  function render(tr, formula, response) {
    const value = window.SubjectivePractical.readResult(formula, response);
    tr.dataset.practicalStatus = value.complete ? 'objective-ready' : 'incomplete';
    state(tr, value.complete ? 'ready' : 'invalid', value.complete
      ? '주관평가 제외' : value.errors.map(error => error.message).join(' ') || '객관 기록을 확인해 주세요.', value.ineligible);
    value.events.forEach(event => {
      const cell = [...tr.querySelectorAll('[data-event-score]')].find(node => node.dataset.eventScore === event.event);
      if (cell) cell.textContent = event.score == null ? '—' : Number(event.score).toFixed(2);
    });
    if (!value.complete) return;
    tr.dataset.objectiveScore = String(value.score);
    tr.querySelector('.score-objective').textContent = value.score.toFixed(2);
    const sum = window.SubjectivePractical.subtotal(Number(tr.querySelector('.score-suneung').textContent), value.score);
    tr.querySelector('.score-objective-subtotal').textContent = sum == null ? '—' : sum.toFixed(2);
  }
  function draft(tr, formula) {
    const policy = window.SubjectivePractical.getPolicy(formula);
    const pending = window.AdmissionsPracticalInput?.stageNotice(formula);
    const selection = window.SubjectivePractical.selection(formula, tr.querySelector('[data-subjective-selection]')?.value);
    const score = tr.dataset.practicalStatus === 'objective-ready' ? Number(tr.dataset.objectiveScore) : null;
    const suneung = Number(tr.querySelector('.score-suneung').textContent);
    const sum = window.SubjectivePractical.subtotal(suneung, score);
    return [policy.choices.length ? `${policy.selectionLabel}: ${selection || '선택 안 함'}` : '',
      `수능 점수: ${suneung.toFixed(2)}점`,
      `${policy.label}: ${score == null ? '기록 확인 필요' : score.toFixed(2) + '점 / ' + policy.maximum + '점'}`,
      `수능+객관실기 합계: ${sum == null ? '미산출' : sum.toFixed(2) + '점'}`,
      window.SubjectivePractical.excludedText(policy),
      tr.dataset.objectiveIneligible === 'true' ? window.SubjectivePractical.INELIGIBLE_MESSAGE : '',
      '최종총점은 산출하지 않으며, 총점컷 비교와 합격 판단에 사용하지 않습니다.'].join('\n');
  }
  return { formulaNotice, state, render, draft };
})();
