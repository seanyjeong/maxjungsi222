'use strict';
window.CounselSubjectivePractical = (() => {
  const policyApi = () => window.SubjectivePractical;
  function mount(shell, formula, saved, year) {
    const scoped = { ...formula, 학년도: year }, policy = policyApi().getPolicy(scoped);
    if (!policy) return;
    const card = shell.querySelector('.uni-card');
    card.dataset.subjectivePartial = 'true';
    const section = document.createElement('section');
    section.className = 'subjective-practical';
    const id = `subjective-${formula.U_ID}-${year}`;
    section.innerHTML = `<label for="${id}">${policy.selectionLabel}</label>
      <select id="${id}" data-subjective-selection aria-describedby="${id}-note">
        <option value="">선택 안 함</option>${policy.choices.map(value => `<option value="${value}">${value}</option>`).join('')}
      </select><p id="${id}-note">${policyApi().excludedText(policy)}</p>
      <p>${policy.inputHint}</p><p>수능과 객관실기의 합계만 표시합니다. 최종총점·총점컷 비교는 제공하지 않습니다.</p>`;
    card.querySelector('.uni-inputs')?.before(section);
    const select = section.querySelector('select');
    select.value = policyApi().selection(scoped, saved?.[policyApi().SELECTION_KEY]);
    card.querySelector('.score-silgi').classList.add('score-objective');
    card.querySelector('.score-silgi').parentElement.querySelector('.label').textContent = `${policy.label} / ${policy.maximum}점`;
    const row = document.createElement('div');
    row.className = 'uni-breakdown-row objective-subtotal-row';
    row.innerHTML = '<span class="label">수능+객관실기 합계</span><span class="value score-objective-subtotal">—</span>';
    card.querySelector('.uni-breakdown-row.total').before(row);
    card.querySelector('.uni-breakdown-row.total .label').textContent = '최종총점 (주관평가 제외)';
    const notice = document.createElement('p');
    notice.className = 'objective-status';
    notice.setAttribute('role', 'status');
    card.querySelector('.uni-breakdown').after(notice);
    state(card, 'incomplete');
  }
  function state(card, status, message, ineligible = false) {
    if (card.dataset.subjectivePartial !== 'true') return;
    delete card.dataset.objectiveScore;
    const score = card.querySelector('.score-objective');
    if (score) score.textContent = '—';
    card.querySelector('.score-objective-subtotal').textContent = '—';
    card.querySelector('.score-total').textContent = '—';
    const absent = ineligible || [...card.querySelectorAll('[data-event]')].some(input => input.value.trim() === '미응시');
    card.dataset.objectiveIneligible = String(absent);
    const notice = message || (status === 'incomplete' ? '객관 종목의 기록을 모두 입력해 주세요.' : window.PracticalInput.messages[status]);
    card.querySelector('.objective-status').textContent = [absent ? policyApi().INELIGIBLE_MESSAGE : '', notice].filter(Boolean).join(' ');
  }
  function render(card, formula, response) {
    const value = policyApi().readResult(formula, response);
    card.dataset.practicalStatus = value.complete ? 'objective-ready' : 'incomplete';
    state(card, value.complete ? 'ready' : 'invalid', value.complete
      ? '객관점수 계산 완료 · 주관평가 점수는 포함되지 않습니다.'
      : value.errors.map(error => error.message).join(' ') || '객관 기록을 확인해 주세요.', value.ineligible);
    value.events.forEach(event => {
      const input = [...card.querySelectorAll('[data-event]')].find(node => node.dataset.event === event.event);
      const out = input?.parentElement?.querySelector('.score-out');
      if (out) { out.textContent = event.score == null ? '—' : Number(event.score).toFixed(2); out.classList.toggle('empty', event.score == null); }
    });
    if (!value.complete) return;
    card.dataset.objectiveScore = String(value.score);
    card.querySelector('.score-objective').textContent = value.score.toFixed(2);
    const sum = policyApi().subtotal(Number(card.querySelector('.score-suneung').textContent), value.score);
    card.querySelector('.score-objective-subtotal').textContent = sum == null ? '—' : sum.toFixed(2);
  }
  return { mount, state, render };
})();
