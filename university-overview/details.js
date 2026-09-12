'use strict';
(function () {
  const esc = value => window.escapeHtml(String(value ?? ''));
  const el = id => document.getElementById(id);
  const info = () => window.UniversityInformation;

  function reviewHtml(review, year) {
    if (!review) return '';
    const summaries = Array.isArray(review.summary) ? review.summary : [review.summary];
    const followUp = Array.isArray(review.followUp) ? review.followUp : [review.followUp];
    const sources = (review.sources || []).filter(source => /^https:\/\//.test(source.url || ''));
    return `<h3 class="detail-section-title">${esc(year)}학년도 반영 내용</h3>
      <p class="review-status">${esc(review.status)}</p>
      ${summaries.filter(Boolean).map(note => `<p>${esc(note)}</p>`).join('')}
      ${followUp.filter(Boolean).map(note => `<p class="review-follow-up"><strong>확인할 사항</strong> ${esc(note)}</p>`).join('')}
      ${sources.length ? `<div class="review-sources">${sources.map(source => `<a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.title || '공식 모집요강')} <span class="sr-only">새 창</span></a>`).join(' · ')}</div>` : ''}`;
  }

  function gradeTable(label, rows) {
    if (!rows.length) return '';
    return `<details class="score-grades"><summary>${esc(label)} 등급별 환산점수</summary>
      <div class="detail-table-scroll"><table><thead><tr><th scope="col">등급</th>${rows.map(row => `<th scope="col">${row.grade}</th>`).join('')}</tr></thead>
      <tbody><tr><th scope="row">점수</th>${rows.map(row => `<td>${row.score}</td>`).join('')}</tr></tbody></table></div></details>`;
  }

  function renderInformation(formula, review) {
    const model = info().build(formula, window.SubjectivePractical, review);
    el('mdScoreInfo').innerHTML = `<h3 class="detail-section-title">전형·환산 안내</h3>
      <dl class="score-facts">${model.items.map(item => `<div><dt>${esc(item.label)}</dt><dd>${esc(item.value)}</dd></div>`).join('')}</dl>
      ${model.notes.map(note => `<p class="detail-note">${esc(note)}</p>`).join('')}
      <p class="detail-note">총점과 실기 배점은 가산·감점 전 기준입니다. 등급별 환산점수에는 학교별 반영비율과 산식이 추가 적용될 수 있습니다.</p>
      ${gradeTable('영어', model.english)}${gradeTable('한국사', model.history)}
      ${model.extra ? `<details class="school-extra"><summary>상세 반영 안내</summary><p>${esc(model.extra)}</p></details>` : ''}`;
  }

  function renderPractical(formula, gender) {
    const model = window.UniversityPractical.build(formula, gender, {
      hardcoded: window.SILGI_HARDCODED, subjectivePolicy: window.SubjectivePractical,
    });
    document.querySelector('.silgi-table thead tr').innerHTML = model.headers.map(header => `<th scope="col">${esc(header)}</th>`).join('');
    const policy = window.SubjectivePractical.getPolicy(formula);
    const notices = policy ? ['아래 표는 계산 가능한 객관종목의 배점입니다.', policy.inputHint] : model.notices;
    el('mdPracticalNotice').innerHTML = notices.map(note => `<p>${esc(note)}</p>`).join('');
    el('mdSilgiTbody').innerHTML = model.rows.length ? model.rows.map(row => `<tr><td>${esc(row.event)}</td><td>${esc(row.record)}</td><td>${row.score == null ? '—' : esc(row.score) + '점'}</td><td>${esc(row.deduction)}</td></tr>`).join('')
      : `<tr><td colspan="4" class="empty-msg">${esc(model.emptyMessage)}</td></tr>`;
    el('mdPracticalLevels').innerHTML = model.rows.filter(row => row.levels.length).map(row => `
      <details class="practical-levels"><summary>${esc(row.event)} 전체 등록 배점 (${row.levels.length}개)</summary>
      <table><thead><tr><th scope="col">기록·평가</th><th scope="col">배점</th></tr></thead><tbody>
      ${row.levels.map(level => `<tr><td>${esc(level.record ?? '별도 기준')}</td><td>${level.score == null ? '미확인' : esc(level.score) + '점'}</td></tr>`).join('')}
      </tbody></table></details>`).join('');
    return model;
  }

  function create({ api, getYear, getRows, formulaCache, classifyRaw, formatDangye }) {
    const modal = el('detailModal');
    let requestId = 0, currentFormula = null, currentGender = '남', previousFocus = null;

    function close() {
      requestId++;
      currentFormula = null;
      modal.classList.remove('show');
      if (previousFocus?.isConnected) previousFocus.focus();
    }

    function setGender(gender) {
      currentGender = gender;
      document.querySelectorAll('#mdGenderToggle .gender-btn').forEach(button => {
        button.classList.toggle('active', button.dataset.gender === gender);
        button.setAttribute('aria-pressed', String(button.dataset.gender === gender));
      });
    }

    function renderSubjects(row) {
      el('mdSubjGrid').innerHTML = ['국어', '수학', '영어', '탐구', '한국사'].map(subject => {
        const value = classifyRaw(row.raw?.[subject]);
        return `<div class="subj-cell ${value?.kind || ''}"><div class="lbl">${subject}</div><div class="val">${esc(value?.text || '미반영')}</div></div>`;
      }).join('');
      const count = row.raw?.탐구수;
      if (count && count !== '-') el('mdSubjGrid').insertAdjacentHTML('beforeend', `<p class="inquiry-count">탐구 ${esc(count)}개 반영</p>`);
    }

    function renderCuts(row, year) {
      const cuts = Object.entries(row.totalsByYear || {}).filter(([cutYear]) => Number(cutYear) < Number(year))
        .sort(([a], [b]) => Number(b) - Number(a)).map(([cutYear, value]) => ({ label: `${cutYear}학년도 총점컷`, value }));
      cuts.push({ label: '지점 수능컷', value: row.branchCut }, { label: 'MAX 수능컷', value: row.maxCut });
      el('mdCuts').innerHTML = cuts.map(cut => `<div class="cut-cell"><div class="lbl">${esc(cut.label)}</div><div class="val ${cut.value == null ? 'empty' : ''}">${cut.value == null ? '—' : Number(cut.value).toFixed(2)}</div></div>`).join('');
    }

    async function open(uid) {
      const year = getYear(), row = getRows().find(value => Number(value.U_ID) === Number(uid));
      if (!row) return;
      const generation = ++requestId;
      currentFormula = null;
      previousFocus = document.activeElement;
      const review = info().getReview(window.UniversityReviewNotes, uid, year);
      el('mdTitle').textContent = `${row.univ} — ${row.dept}`;
      const quota = esc(row.seats_raw ?? '—');
      const quotaUnit = info().numeric(row.seats_raw) == null ? '' : '명';
      el('mdSub').innerHTML = `${esc(year)}학년도 · ${esc([row.region, row.city].filter(Boolean).join(' '))} · ${esc(row.gun)}군 · 모집 ${quota}${quotaUnit} · 교직 ${esc(row.교직)}`;
      const chips = [['수능', row.suneung], ['내신', row.naesin], ['실기', row.silgi]].filter(([, ratio]) => ratio > 0).map(([name, ratio]) => `${name} ${ratio}%`);
      if (row.단계별 && row.단계별 !== '-') chips.push(`1단계 ${formatDangye(row.단계별)}`);
      el('mdChips').innerHTML = chips.map(chip => `<span class="meta-chip">${esc(chip)}</span>`).join('');
      el('mdReview').hidden = !review;
      el('mdReview').innerHTML = reviewHtml(review, year);
      renderSubjects(row);
      renderCuts(row, year);
      el('mdScoreInfo').textContent = '전형 정보를 불러오는 중…';
      el('mdPracticalNotice').textContent = '';
      el('mdPracticalLevels').textContent = '';
      el('mdSilgiTbody').innerHTML = '<tr><td colspan="4" class="empty-msg">배점표를 불러오는 중…</td></tr>';
      document.querySelectorAll('#mdGenderToggle button').forEach(button => { button.disabled = true; });
      modal.classList.add('show');
      el('mdClose').focus();
      try {
        const key = `${uid}-${year}`;
        if (!formulaCache[key]) {
          const data = await api(`/jungsi/formula-details?U_ID=${uid}&year=${year}`);
          if (!data?.success || !data.formula || Number(data.formula.U_ID) !== Number(uid) || Number(data.formula.학년도) !== Number(year)) throw new Error('선택한 학과의 전형 정보를 확인할 수 없습니다.');
          formulaCache[key] = data.formula;
        }
        if (generation !== requestId || String(year) !== String(getYear())) return;
        currentFormula = formulaCache[key];
        renderInformation(currentFormula, review);
        const genders = window.UniversityPractical.build(currentFormula, currentGender, {
          hardcoded: window.SILGI_HARDCODED, subjectivePolicy: window.SubjectivePractical,
        }).genders;
        if (genders.length && !genders.includes(currentGender)) setGender(genders[0]);
        else setGender(currentGender);
        document.querySelectorAll('#mdGenderToggle button').forEach(button => { button.disabled = !genders.includes(button.dataset.gender); });
        renderPractical(currentFormula, currentGender);
      } catch (error) {
        if (generation !== requestId) return;
        el('mdScoreInfo').textContent = '전형 정보를 불러오지 못했습니다. 창을 닫고 다시 열어 주세요.';
        el('mdSilgiTbody').innerHTML = '<tr><td colspan="4" class="empty-msg">배점표를 불러오지 못했습니다.</td></tr>';
        if (error.message !== 'auth') console.error('[university-detail]', error);
      }
    }

    el('mdClose').addEventListener('click', close);
    modal.addEventListener('click', event => { if (event.target === modal) close(); });
    document.querySelectorAll('#mdGenderToggle .gender-btn').forEach(button => button.addEventListener('click', () => {
      if (!currentFormula) return;
      setGender(button.dataset.gender);
      renderPractical(currentFormula, currentGender);
    }));
    modal.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (event.key !== 'Tab') return;
      const focusable = [...modal.querySelectorAll('button:not([disabled]), a[href], summary')].filter(node => node.getClientRects().length);
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    });
    return { open, close };
  }

  window.UniversityDetails = { create };
})();
