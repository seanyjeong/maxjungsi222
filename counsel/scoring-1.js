

  /* ====== INPUT → 계산 + 자동 저장 ======
     실기 input: /silgi/calculate (Phase 2 API) → 점수 + 총점 갱신
     내신 input: 클라이언트 환산 — na = (진학사 / 내신만점) × (내신% / 100) × 총점
     둘 다 1.5초 debounce 후 /counseling/wishlist/bulk-save
  */

  function setCardPracticalState(card, status) {
    card.dataset.practicalStatus = status;
    const score = card.querySelector('.score-silgi');
    if (score) { score.textContent = window.PracticalInput.messages[status]; score.setAttribute('role', 'status'); }
    const total = card.querySelector('.score-total');
    if (total) total.textContent = '—';
    const diff = card.closest('.uni-card-shell')?.querySelector('.uni-diff');
    if (diff) diff.style.visibility = 'hidden';
    card.querySelectorAll('[data-event]').forEach(input => {
      const out = input.parentElement?.querySelector('.score-out');
      if (out) { out.textContent = '—'; out.classList.add('empty'); }
    });
    const indicator = document.querySelector('.save-indicator');
    if (indicator) indicator.textContent = '저장 대기 · 실기 기록과 계산 상태를 확인해 주세요.';
    window.CounselSubjectivePractical?.state(card, status);
  }
  function bindInputAutosave(card) {
    card.querySelectorAll('.input-row input, .input-row select[data-event]').forEach(inp => {
      inp.addEventListener(inp.tagName === 'SELECT' ? 'change' : 'input', () => {
        scheduleRecalc(card);
      });
    });
    card.querySelector('[data-subjective-selection]')?.addEventListener('change', triggerAutoSave);
    // 메모는 recalc 없이 저장만
    const memo = card.querySelector('.uni-memo');
    if (memo) {
      memo.addEventListener('input', () => triggerAutoSave());
    }
  }
  function scheduleRecalc(card) {
    clearTimeout(recalcTimers.get(card));
    card.dataset.practicalVersion = String(Number(card.dataset.practicalVersion || 0) + 1);
    setCardPracticalState(card, 'calculating');
    setSaving();
    const t = setTimeout(() => recalcCard(card), 1200);
    recalcTimers.set(card, t);
    triggerAutoSave();
  }

  /* 카드 총점 재계산 — 내신은 raw 저장, 실기는 /silgi/calculate */
  async function recalcCard(card) {
    const version = card.dataset.practicalVersion = String(Number(card.dataset.practicalVersion || 0) + 1);
    const shell = card.closest('.uni-card-shell');
    const uid = shell?.dataset.uid;
    if (!uid) return;
    const year = document.getElementById('yearSel').value;
    const exam = document.getElementById('examSel')?.value;
    const formula = STATE.formulaCache[`${uid}-${year}`];
    const student = STATE.selectedStudent;
    if (!formula || !student) return;

    // 1) 내신 — raw 값 그대로 (클라 환산 X, 선생이 이미 환산된 값 입력)
    let naeshinScore = 0;
    const naeshinInput = card.querySelector('[data-field="naeshin"]');
    if (naeshinInput) {
      const raw = Number(naeshinInput.value);
      naeshinScore = (isNaN(raw) || raw <= 0) ? 0 : raw;
      const out = naeshinInput.parentElement?.querySelector('.score-out');
      if (out) {
        out.textContent = naeshinScore > 0 ? naeshinScore.toFixed(2) : '-';
        out.classList.toggle('empty', naeshinScore <= 0);
      }
      const nEl = card.querySelector('.score-naeshin');
      if (nEl) nEl.textContent = naeshinScore.toFixed(2);
    }

    // 2) 실기 — /silgi/calculate API
    let silgiScore = 0;
    let deductLevel = 0;
    let absenceNotice = '';
    let directScoreNotice = '';
    const silgiInputs = card.querySelectorAll('[data-event]');
    const entered = [];
    silgiInputs.forEach(i => {
      if (i.value && i.value.trim() !== '') entered.push({ event: i.dataset.event, value: i.value.trim() });
    });
    const scopedFormula = { ...formula, 학년도: year };
    const partial = window.SubjectivePractical?.getPolicy(scopedFormula);
    const input = (window.SubjectivePractical || window.PracticalInput).prepare(scopedFormula, student.gender, entered);
    if (!input.ready) {
      setCardPracticalState(card, input.reason);
      window.CounselSubjectivePractical?.state(card, input.reason, input.message);
      triggerAutoSave(); return;
    }
    setCardPracticalState(card, 'calculating');
    const isCurrent = () => card.isConnected && card.dataset.practicalVersion === version &&
      STATE.selectedStudent === student && document.getElementById('yearSel').value === year &&
      document.getElementById('examSel')?.value === exam;

    // 빈 input의 score-out은 - 로
    silgiInputs.forEach(i => {
      if (!i.value || !i.value.trim()) {
        const out = i.parentElement?.querySelector('.score-out');
        if (out) { out.innerHTML = '-'; out.classList.add('empty'); }
      }
    });

    if (input.records.length > 0) {
      try {
        const d = await api('/silgi/calculate', {
          method: 'POST',
          body: JSON.stringify({
            F_data: scopedFormula,
            S_data: { gender: student.gender, practicals: input.records },
          }),
        });
        if (!isCurrent()) return;
        if (partial) {
          window.CounselSubjectivePractical.render(card, scopedFormula, d);
          triggerAutoSave(); return;
        }
        silgiScore = window.PracticalInput.resultScore(d);
        absenceNotice = window.PracticalInput.absenceMessage(d.result);
        directScoreNotice = d.result.breakdown?.provisional ? '하위 급간 임시표 적용' : d.result.breakdown?.direct_score_events?.length ? '기계체조 입력 점수 반영' : '';
        {
          const br = d.result.breakdown || {};
          if (Array.isArray(br.events)) {
            br.events.forEach(ev => {
              const inp = card.querySelector(`[data-event="${ev.event}"]`);
              const out = inp?.parentElement?.querySelector('.score-out');
              if (!out) return;
              if (ev.score == null) {
                out.innerHTML = '-';
                out.classList.add('empty');
              } else {
                out.innerHTML = `${Number(ev.score).toFixed(2)}<span class="deduct">(${ev.direct_score ? '입력 점수' : ev.absent ? '미응시' : (ev.deduction_level || 0) + '감'})</span>`;
                out.classList.remove('empty');
              }
            });
          }
          deductLevel = br.total_deduction_level || 0;
        }
      } catch (_error) {
        if (isCurrent()) { setCardPracticalState(card, 'failed'); triggerAutoSave(); }
        return;
      }
    }
    card.dataset.practicalStatus = 'ready';

    const silgiEl = card.querySelector('.score-silgi');
    if (silgiEl) silgiEl.innerHTML = `${silgiScore.toFixed(2)}<span class="deduct" role="status">(${absenceNotice || directScoreNotice || deductLevel + '감'})</span>`;

    // 3) 총점 = 수능 + 내신 + 실기
    const suText = card.querySelector('.score-suneung')?.textContent || '0';
    const suneung = Number(suText) || 0;
    const total = suneung + naeshinScore + silgiScore;
    const totalEl = card.querySelector('.score-total');
    if (totalEl) totalEl.textContent = window.AdmissionsScoreFormat.format(total, scopedFormula);

    // MAX컷 대비 diff 업데이트 (uni-diff-row)
    const dept = STATE.allFilterData.find(d => String(d.U_ID) === String(uid));
    const maxCut = parseFloat(dept?.max_total_cut);
    const diffEl = card.closest('.uni-card-shell')?.querySelector('.uni-diff');
    if (diffEl && !isNaN(maxCut) && maxCut > 0 && total > 0) {
      const diff = total - maxCut;
      const sign = diff >= 0 ? '+' : '';
      diffEl.textContent = `${sign}${diff.toFixed(1)}`;
      diffEl.className = 'uni-diff ' + (diff > 3 ? 'above' : diff < -3 ? 'below' : 'near');
      diffEl.style.visibility = 'visible';
    }

    // 저장
    triggerAutoSave();
  }
