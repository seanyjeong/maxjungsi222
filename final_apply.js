// final_apply.new.js — main page logic
(function () {
  'use strict';

  const WOMENS_UNIVERSITIES = [
    '이화여자대학교', '숙명여자대학교', '성신여자대학교',
    '덕성여자대학교', '동덕여자대학교', '서울여자대학교',
  ];
  const GUNS = ['가', '나', '다'];

  // ---- State ----
  // final_apply 는 수능 후 최종 지원 — exam='수능' 고정
  const state = {
    year: '2027',
    exam: '수능',
    students: [],
    universities: [],
    selectedStudent: null,
    applications: {}, // keyed by gun
    formulaCache: {},
    cards: {}, // gun -> { el, combos, formula, deptId }
  };

  // ---- DOM ----
  const $ = (s, r = document) => r.querySelector(s);
  const hero = $('#hero');
  const emptyState = $('#empty-state');
  const sectionHead = $('#section-head');
  const gunGrid = $('#gun-grid');
  const saveBtn = $('#save-btn');

  // ---- Topbar combos ----
  const yearCombo = window.createCombobox('#year-cb', {
    options: [{ value: '2027', label: '2027학년도' }, { value: '2026', label: '2026학년도' }],
    value: '2027', searchable: false,
    onChange: async (v) => {
      state.year = v;
      await reloadAll(true);
    },
  });
  const studentCombo = window.createCombobox('#student-cb', {
    options: [], placeholder: '학생을 선택하세요', searchable: true,
    onChange: async (v) => {
      if (!v) { clearSelection(); return; }
      const s = state.students.find((x) => String(x.student_id) === String(v));
      state.selectedStudent = s || null;
      await selectStudent();
    },
  });

  function clearSelection() {
    state.selectedStudent = null;
    state.applications = {};
    state.cards = {};
    saveBtn.disabled = true;
    hero.classList.add('hidden');
    sectionHead.classList.add('hidden');
    gunGrid.classList.add('hidden');
    gunGrid.innerHTML = '';
    emptyState.classList.remove('hidden');
  }

  // ---- API helpers via window.api ----
  async function loadStudents() {
    try {
      const data = await window.api(`/jungsi/students/list-by-branch?year=${state.year}&exam=${encodeURIComponent(state.exam)}`);
      if (data?.success && data.students) {
        state.students = data.students.slice().sort((a, b) => a.student_name.localeCompare(b.student_name, 'ko'));
        studentCombo.setOptions(state.students.map((s) => ({
          value: s.student_id, label: `${s.student_name}`, meta: s.school_name || '',
        })), false);
      } else {
        window.showToast('학생 목록 로딩 실패', 'error');
      }
    } catch (e) {
      console.error(e);
      window.showToast('학생 목록 로딩 오류', 'error');
    }
  }

  async function loadUniversities() {
    try {
      const data = await window.api(`/jungsi/university-list?year=${state.year}`);
      if (data?.success && data.list) {
        state.universities = data.list;
      } else {
        state.universities = [];
        window.showToast('대학 목록 로딩 실패', 'error');
      }
    } catch (e) {
      state.universities = [];
      console.error(e);
    }
  }

  async function getFormula(U_ID) {
    if (!U_ID) return null;
    const key = `${U_ID}-${state.year}`;
    if (state.formulaCache[key]) return state.formulaCache[key];
    try {
      const data = await window.api(`/jungsi/formula-details?U_ID=${U_ID}&year=${state.year}`);
      if (data?.success) {
        state.formulaCache[key] = data.formula;
        return data.formula;
      }
    } catch (e) { console.error(e); }
    return null;
  }

  async function calcSuneung(student, U_ID) {
    if (!student || !student.scores) return 0;
    try {
      const data = await window.api('/jungsi/calculate', {
        method: 'POST',
        body: JSON.stringify({
          U_ID, year: state.year,
          studentScores: window.convertScoresToSuneungFormat(student.scores),
        }),
      });
      if (data?.success) return Number(data.result?.totalScore || 0);
    } catch (e) { console.error(e); }
    return 0;
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

  // ---- Hero render ----
  function renderHero() {
    const s = state.selectedStudent;
    if (!s) { hero.classList.add('hidden'); return; }
    hero.classList.remove('hidden');
    $('#hero-avatar').textContent = (s.student_name || '?').slice(0, 1);
    $('#hero-name').textContent = s.student_name || '-';
    $('#hero-school').textContent = s.school_name || '학교정보없음';

    const g = s.gender || '-';
    const gPill = $('#hero-gender');
    gPill.className = 'pill ' + (g === '남' ? 'gender-m' : g === '여' ? 'gender-f' : '');
    gPill.innerHTML = `<i class="ph ph-${g === '여' ? 'gender-female' : 'gender-male'}"></i><span>${window.escapeHtml(g)}</span>`;

    $('#hero-year').innerHTML = `<i class="ph ph-calendar-blank"></i><span>${state.year}학년도</span>`;

    const scores = s.scores || {};
    const fmtMain = (std, pct) => {
      const parts = [];
      if (std != null) parts.push(`<span>표${std}</span>`);
      if (pct != null) parts.push(`<span class="dim">백${pct}</span>`);
      return parts.join(' ');
    };
    const chip = (title, subject, std, pct, grade, iconGrade = false) => {
      const hasData = grade != null || std != null || pct != null;
      return `
        <div class="score-chip ${hasData ? '' : 'empty'}">
          <div class="label">${title}${subject ? ` <span class="subject-tag">${window.escapeHtml(subject)}</span>` : ''}</div>
          <div class="value">
            ${grade != null ? `<span class="grade">${grade}</span><span style="color:var(--text-3);font-size:11px;">등급</span>` : ''}
            ${(!iconGrade && (std != null || pct != null)) ? fmtMain(std, pct) : ''}
            ${!hasData ? '<span>—</span>' : ''}
          </div>
        </div>`;
    };

    $('#hero-scores').innerHTML = [
      chip('한국사', null, null, null, scores.한국사_등급, true),
      chip('국어', scores.국어_선택과목, scores.국어_표준점수, scores.국어_백분위, scores.국어_등급),
      chip('수학', scores.수학_선택과목, scores.수학_표준점수, scores.수학_백분위, scores.수학_등급),
      chip('영어', null, null, null, scores.영어_등급, true),
      chip('탐구1', scores.탐구1_선택과목, scores.탐구1_표준점수, scores.탐구1_백분위, scores.탐구1_등급),
      chip('탐구2', scores.탐구2_선택과목, scores.탐구2_표준점수, scores.탐구2_백분위, scores.탐구2_등급),
    ].join('');
  }

  // ---- Card render ----
  function cardTemplate(gun) {
    return `
      <div class="gun-card" data-gun="${gun}">
        <div class="gun-head">
          <div class="gun-title">
            <span class="gun-badge">${gun}</span>
            <span>${gun}군 최종 지원</span>
            <span class="label-en">GROUP ${['A','B','C'][GUNS.indexOf(gun)]}</span>
          </div>
          <button class="btn btn-sm btn-danger-ghost reset-btn" type="button">
            <i class="ph ph-arrow-counter-clockwise"></i> 초기화
          </button>
        </div>
        <div class="gun-body">
          <div class="field"><label>대학</label><div class="uni-cb"></div></div>
          <div class="field"><label>학과</label><div class="dept-cb"></div></div>

          <div class="womens-warning hidden">
            <i class="ph-fill ph-warning"></i>
            <span>남학생은 이 대학에 지원할 수 없습니다.</span>
          </div>

          <div class="dept-dependent hidden">
            <div class="score-hud empty">
              <div class="row suneung"><div class="label"><span class="dot"></span>수능 점수</div><div class="value suneung-v mono">0.00</div></div>
              <div class="row naeshin hidden"><div class="label"><span class="dot"></span>내신 점수</div><div class="value naeshin-v mono">0.00</div></div>
              <div class="row silgi"><div class="label"><span class="dot"></span>실기 점수</div><div class="value silgi-v mono">0.00<span class="deduction"></span></div></div>
              <div class="divider"></div>
              <div class="total"><div class="label">총점</div><div class="value total-v mono">0.00<span class="unit">/1000</span></div></div>
              <div class="bar"><div class="fill"></div></div>
              <div class="bar-label"><span class="bar-cur">0</span><span class="bar-max">0</span></div>
            </div>

            <div class="input-block naeshin-block hidden" style="margin-top:12px;">
              <div class="block-label">내신 점수 <span class="naeshin-hint" style="color:var(--text-3); font-size:11px;">(입력값 그대로 총점에 반영)</span></div>
              <input type="number" class="naeshin-input" step="0.01" placeholder="내신 점수 입력" />
            </div>

            <div class="input-block silgi-block" style="margin-top:12px;">
              <div class="block-label">실기 기록</div>
              <div class="silgi-rows"></div>
            </div>

            <div class="result-grid" style="margin-top:14px;">
              <div class="field">
                <label>1단계 결과</label>
                <div class="stage1-cb"></div>
              </div>
              <div class="field">
                <label>최초 결과</label>
                <div class="reserve-group">
                  <div class="initial-cb" style="flex:1;"></div>
                  <input type="number" class="reserve-number-input hidden" placeholder="번호" />
                </div>
              </div>
              <div class="field">
                <label>최종 결과</label>
                <div class="final-cb"></div>
              </div>
              <div class="field">
                <label>최종 등록</label>
                <div class="register-cb"></div>
              </div>
            </div>

            <div class="input-block" style="margin-top:12px;">
              <div class="block-label">메모</div>
              <textarea class="memo-input" rows="2" placeholder="상담 메모를 입력하세요…"></textarea>
            </div>
          </div>

          <div class="card-placeholder placeholder-block">
            <i class="ph ph-cursor-click"></i>
            <div>대학·학과를 선택하면<br/>환산 점수 및 입력 칸이 표시됩니다.</div>
          </div>
        </div>
      </div>`;
  }

  async function renderCards() {
    gunGrid.innerHTML = GUNS.map(cardTemplate).join('');
    sectionHead.classList.remove('hidden');
    gunGrid.classList.remove('hidden');

    for (const gun of GUNS) {
      const el = gunGrid.querySelector(`.gun-card[data-gun="${gun}"]`);
      await wireCard(el, gun);
    }
  }

  async function wireCard(el, gun) {
    const app = state.applications[gun] || {};
    const deptDependent = el.querySelector('.dept-dependent');
    const placeholder = el.querySelector('.placeholder-block');
    const warn = el.querySelector('.womens-warning');

    // Uni options
    const unisInGun = Array.from(new Set(
      state.universities.filter((u) => u.gun === gun).map((u) => u.university),
    )).sort((a, b) => a.localeCompare(b, 'ko'));

    const uniCombo = window.createCombobox(el.querySelector('.uni-cb'), {
      options: [{ value: '', label: '— 대학 선택 —' }].concat(unisInGun.map((u) => ({
        value: u, label: u, meta: WOMENS_UNIVERSITIES.includes(u) ? '여대' : '',
      }))),
      placeholder: '대학 선택…',
      searchable: true,
      onChange: async (v) => {
        cardData.deptId = '';
        await onUniChange(v);
      },
    });

    const deptCombo = window.createCombobox(el.querySelector('.dept-cb'), {
      options: [{ value: '', label: '— 학과 선택 —' }],
      placeholder: '대학을 먼저 선택',
      searchable: true,
      onChange: async (v) => {
        cardData.deptId = v;
        await onDeptChange(v);
      },
    });

    // Small selects (no search)
    const stage1Combo = window.createCombobox(el.querySelector('.stage1-cb'), {
      options: [{ value: '해당없음', label: '해당없음' }, { value: '합격', label: '합격' }, { value: '불합격', label: '불합격' }],
      value: app.결과_1단계 || '해당없음', searchable: false, size: 'sm',
    });
    let initialValue = app.결과_최초 || '미정';
    let reserveValue = '';
    if (initialValue && initialValue.startsWith('예비')) {
      reserveValue = initialValue.replace(/[^0-9]/g, '');
      initialValue = '예비';
    }
    const initialCombo = window.createCombobox(el.querySelector('.initial-cb'), {
      options: [
        { value: '미정', label: '미정' }, { value: '최초합', label: '최초합' },
        { value: '예비', label: '예비' }, { value: '불합격', label: '불합격' },
      ],
      value: initialValue, searchable: false, size: 'sm',
      onChange: (v) => {
        const input = el.querySelector('.reserve-number-input');
        if (v === '예비') input.classList.remove('hidden');
        else { input.classList.add('hidden'); input.value = ''; }
      },
    });
    const reserveInput = el.querySelector('.reserve-number-input');
    if (initialValue === '예비') { reserveInput.classList.remove('hidden'); reserveInput.value = reserveValue; }

    const finalCombo = window.createCombobox(el.querySelector('.final-cb'), {
      options: [{ value: '미정', label: '미정' }, { value: '최종합', label: '최종합' }, { value: '불합격', label: '불합격' }],
      value: app.결과_최종 || '미정', searchable: false, size: 'sm',
    });
    const registerCombo = window.createCombobox(el.querySelector('.register-cb'), {
      options: [{ value: 'false', label: '미등록' }, { value: 'true', label: '등록' }],
      value: app.최종등록_여부 ? 'true' : 'false', searchable: false, size: 'sm',
    });

    // Memo
    el.querySelector('.memo-input').value = app.메모 || '';

    // Reset
    el.querySelector('.reset-btn').addEventListener('click', async () => {
      const ok = await window.confirmDialog(`${gun}군 지원 정보를 초기화하시겠습니까?\n\n서버에 저장된 ${gun}군 정보도 삭제됩니다.`);
      if (!ok) return;
      try {
        await window.api(`/jungsi/final-apply/${state.selectedStudent.student_id}/${state.year}/${gun}`, { method: 'DELETE' });
        delete state.applications[gun];
        window.showToast(`${gun}군 지원 정보가 초기화되었습니다.`, 'success');
      } catch (e) { console.error(e); }
      // Rebuild card from scratch
      await wireCard(el, gun);
    });

    const cardData = {
      el, gun, uniCombo, deptCombo, stage1Combo, initialCombo, finalCombo, registerCombo,
      deptId: app.대학학과_ID || '', formula: null,
    };
    state.cards[gun] = cardData;

    async function onUniChange(uni) {
      deptDependent.classList.add('hidden');
      placeholder.classList.remove('hidden');
      warn.classList.toggle('hidden', !(WOMENS_UNIVERSITIES.includes(uni) && state.selectedStudent?.gender === '남'));
      if (!uni) {
        deptCombo.setOptions([{ value: '', label: '— 학과 선택 —' }], false);
        return;
      }
      const depts = state.universities
        .filter((u) => u.gun === gun && u.university === uni)
        .sort((a, b) => a.department.localeCompare(b.department, 'ko'));
      deptCombo.setOptions([{ value: '', label: '— 학과 선택 —' }].concat(
        depts.map((d) => ({ value: String(d.U_ID), label: d.department })),
      ), false);
    }

    async function onDeptChange(U_ID) {
      if (!U_ID) {
        deptDependent.classList.add('hidden');
        placeholder.classList.remove('hidden');
        el.classList.remove('has-dept');
        return;
      }
      el.classList.add('has-dept');
      placeholder.classList.add('hidden');
      deptDependent.classList.remove('hidden');

      const formula = await getFormula(U_ID);
      cardData.formula = formula;
      if (!formula) { window.showToast('학과 요강 로딩 실패', 'error'); return; }

      // Naeshin
      const hasNaeshin = Number(formula.내신 || 0) > 0;
      el.querySelector('.naeshin-block').classList.toggle('hidden', !hasNaeshin);
      el.querySelector('.score-hud .row.naeshin').classList.toggle('hidden', !hasNaeshin);

      // Silgi rows
      const events = Array.from(new Set((formula.실기배점 || []).map((r) => r.종목명)));
      const silgiRows = el.querySelector('.silgi-rows');
      silgiRows.innerHTML = events.map((ev) => `
        <div class="ghost-input" data-event="${window.escapeHtml(ev)}">
          <span class="event-name">${window.escapeHtml(ev)}</span>
          <input type="text" class="silgi-input" placeholder="기록" />
          <span class="event-score">–</span>
        </div>`).join('') || '<div style="font-size:12px;color:var(--text-3);padding:4px 0;">실기 종목 없음</div>';

      // Prefill from saved
      if (String(cardData.deptId) === String(app.대학학과_ID || '')) {
        const rec = window.safeParse(app.지원_실기기록, {}) || {};
        silgiRows.querySelectorAll('.silgi-input').forEach((inp) => {
          const ev = inp.closest('.ghost-input').dataset.event;
          if (rec[ev] != null) inp.value = rec[ev];
        });
        if (app.지원_내신점수 != null) el.querySelector('.naeshin-input').value = app.지원_내신점수;
      }

      // Bind recalc
      el.querySelector('.naeshin-input').addEventListener('input', () => recalc(el, gun));
      silgiRows.querySelectorAll('.silgi-input').forEach((inp) => {
        inp.addEventListener('change', () => recalc(el, gun));
      });

      // Max
      el.querySelector('.bar-max').textContent = formula.총점 || 0;
      el.querySelector('.total-v').innerHTML = `0.00<span class="unit">/${formula.총점 || 0}</span>`;

      await recalc(el, gun);
    }

    // Prefill
    if (app.대학명) {
      uniCombo.setValue(app.대학명);
      await onUniChange(app.대학명);
      if (app.대학학과_ID) {
        deptCombo.setValue(String(app.대학학과_ID));
        await onDeptChange(String(app.대학학과_ID));
      }
    }
  }

  async function recalc(el, gun) {
    const data = state.cards[gun];
    if (!data || !data.formula || !data.deptId) return;
    const formula = data.formula;
    const student = state.selectedStudent;

    const suneung = await calcSuneung(student, data.deptId);
    el.querySelector('.suneung-v').textContent = window.fmt2(suneung);

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
    const perEvent = {};
    if (practicals.length) {
      const result = await calcSilgi(formula, student, practicals);
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
    el.querySelector('.total-v').innerHTML = `${window.fmt2(total)}<span class="unit">/${max}</span>`;
    el.querySelector('.bar-cur').textContent = window.fmt2(total);
    const pct = Math.max(0, Math.min(100, (total / max) * 100));
    el.querySelector('.score-hud .bar .fill').style.width = `${pct}%`;
    el.querySelector('.score-hud').classList.remove('empty');
  }

  // ---- Select student ----
  async function selectStudent() {
    emptyState.classList.add('hidden');
    renderHero();

    // Load existing applications
    state.applications = {};
    try {
      const data = await window.api(`/jungsi/final-apply/${state.selectedStudent.student_id}/${state.year}`);
      if (data?.success && data.applications) {
        data.applications.forEach((a) => { state.applications[a.모집군] = a; });
      }
    } catch (e) { console.error(e); }

    saveBtn.disabled = false;
    await renderCards();
  }

  // ---- Save ----
  async function save() {
    const s = state.selectedStudent;
    if (!s) { window.showToast('학생을 먼저 선택하세요.', 'error'); return; }
    if (!s.scores || s.scores.입력유형 !== 'official') {
      window.showToast('성적표 기준 성적이 입력된 학생만 수합할 수 있습니다.', 'error'); return;
    }
    saveBtn.disabled = true;
    const origHTML = saveBtn.innerHTML;
    saveBtn.innerHTML = '<span class="spinner"></span> 저장 중…';

    const promises = [];
    for (const gun of GUNS) {
      const card = state.cards[gun];
      if (!card) continue;
      const el = card.el;
      const deptId = card.deptId;

      if (deptId) {
        const naeshinInput = el.querySelector('.naeshin-input');
        const naeshinVal = naeshinInput && naeshinInput.value.trim() !== '' ? parseFloat(naeshinInput.value) : null;
        const 실기기록 = {};
        let hasSilgi = false;
        el.querySelectorAll('.silgi-input').forEach((inp) => {
          if (inp.value.trim()) {
            실기기록[inp.closest('.ghost-input').dataset.event] = inp.value.trim();
            hasSilgi = true;
          }
        });
        let 최초 = card.initialCombo.value;
        if (최초 === '예비') {
          const num = el.querySelector('.reserve-number-input').value.trim();
          최초 = num ? `예비 ${num}번` : '예비';
        }

        const p = (async () => {
          let silgiTotal = null, silgiBreakdown = null;
          if (hasSilgi) {
            const r = await calcSilgi(card.formula, s, Object.entries(실기기록).map(([ev, v]) => ({ event: ev, value: v })));
            if (r) { silgiTotal = r.totalScore; silgiBreakdown = r.breakdown; }
          }
          const suneungDisp = parseFloat(el.querySelector('.suneung-v').textContent) || 0;
          const totalDisp = parseFloat(el.querySelector('.total-v').textContent) || 0;
          const body = {
            학생_ID: s.student_id, 학년도: state.year, 모집군: gun,
            대학학과_ID: parseInt(deptId),
            지원_수능점수: suneungDisp, 지원_내신점수: naeshinVal,
            지원_실기기록: hasSilgi ? 실기기록 : null,
            지원_실기총점: silgiTotal, 지원_실기상세: silgiBreakdown,
            지원_총점: totalDisp,
            결과_1단계: card.stage1Combo.value,
            결과_최초: 최초,
            결과_최종: card.finalCombo.value,
            최종등록_여부: card.registerCombo.value === 'true',
            메모: el.querySelector('.memo-input').value.trim() || null,
          };
          return window.api('/jungsi/final-apply/set', { method: 'POST', body: JSON.stringify(body) });
        })();
        promises.push(p);
      } else {
        promises.push(window.api(`/jungsi/final-apply/${s.student_id}/${state.year}/${gun}`, { method: 'DELETE' }));
      }
    }

    const results = await Promise.allSettled(promises);
    const ok = results.filter((r) => r.status === 'fulfilled' && (r.value === null || r.value?.success)).length;
    const fail = results.length - ok;
    if (!fail) window.showToast(`3군 저장 완료`, 'success');
    else window.showToast(`저장 ${ok}건 / 실패 ${fail}건`, 'error');

    saveBtn.innerHTML = origHTML;
    saveBtn.disabled = false;
    // reload
    await selectStudent();
  }

  saveBtn.addEventListener('click', save);

  // ---- Boot ----
  async function reloadAll(keepStudent = false) {
    const prevSid = keepStudent ? state.selectedStudent?.student_id : null;
    await Promise.all([loadStudents(), loadUniversities()]);
    if (prevSid) {
      const s = state.students.find((x) => x.student_id === prevSid);
      if (s) { studentCombo.setValue(String(s.student_id)); state.selectedStudent = s; await selectStudent(); return; }
    }
    clearSelection();
  }

  (async function boot() {
    await reloadAll();
  })();
})();
