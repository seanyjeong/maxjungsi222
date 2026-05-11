(function () {
  'use strict';

  // ---------- DOM refs ----------
  // year/exam/gun/department — 공통 combobox (no-search)
  const yearSelect = window.createCombobox(document.getElementById('year-select'), {
    options: [{ value: '2027', label: '2027학년도' }, { value: '2026', label: '2026학년도' }],
    value: '2027',
    searchable: false,
    onChange: async (v) => {
      applyDefaultExamFor(v);
      await loadUniversities();
      await loadStudents();
      formulaStrip.hidden = true;
      setEmpty('상단에서 군 / 대학 / 학과를 선택하세요',
               '선택한 학과의 요강에 따라 우리 지점 전체 학생의 수능 환산 점수가 자동 계산됩니다.');
    },
  });
  const examSelect = window.createCombobox(document.getElementById('exam-select'), {
    options: [
      { value: '3월', label: '3월 학평' },
      { value: '6월', label: '6월 모평' },
      { value: '9월', label: '9월 모평' },
      { value: '수능', label: '수능' },
    ],
    value: '수능',
    searchable: false,
    onChange: async (v) => {
      await loadStudents();
      formulaStrip.hidden = true;
      setEmpty('상단에서 군 / 대학 / 학과를 선택하세요',
               '선택한 학과의 요강에 따라 우리 지점 전체 학생의 수능 환산 점수가 자동 계산됩니다.');
    },
  });
  const gunSelect = window.createCombobox(document.getElementById('gun-select'), {
    options: [],  // loadUniversities 가 동적 채움
    value: '',
    placeholder: '군 선택',
    searchable: false,
    onChange: (v) => handleGunChange(v),
  });
  // 대학 = 공통 combobox (searchable)
  const universitySelect = window.createCombobox(document.getElementById('universityCombo'), {
    options: [],
    value: '',
    placeholder: '대학 선택',
    searchable: true,
    searchPlaceholder: '대학 검색…',
    disabled: true,
    onChange: (v) => handleUniversityPick(v),
  });
  const departmentSelect = window.createCombobox(document.getElementById('department-select'), {
    options: [],
    value: '',
    placeholder: '학과 선택',
    searchable: false,
    disabled: true,
    onChange: async (v) => {
      if (!v) return;
      await onDepartmentPicked(v);
    },
  });
  const resultsTable     = document.getElementById('results-table');
  const resultsThead     = document.getElementById('results-thead');
  const resultsTbody     = document.getElementById('results-tbody');
  const emptyState       = document.getElementById('emptyState');
  const loadingState     = document.getElementById('loadingState');

  const formulaStrip     = document.getElementById('formulaStrip');
  const formulaGun       = document.getElementById('formulaGun');
  const formulaUni       = document.getElementById('formulaUniversity');
  const formulaDept      = document.getElementById('formulaDepartment');
  const statQuota        = document.getElementById('statQuota');
  const statNaeshin      = document.getElementById('statNaeshin');
  const statNaeshinWrap  = document.getElementById('statNaeshinWrap');
  const statSilgi        = document.getElementById('statSilgi');
  const statSilgiWrap    = document.getElementById('statSilgiWrap');
  const statSuneung      = document.getElementById('statSuneung');
  const statEtc          = document.getElementById('statEtc');
  const statEtcWrap      = document.getElementById('statEtcWrap');
  const statTotal        = document.getElementById('statTotal');

  const pickerMeta       = document.getElementById('pickerMeta');
  const metaStudentCount = document.getElementById('metaStudentCount');
  const resultsLegend    = document.getElementById('resultsLegend');
  const legendNaeshin    = document.getElementById('legendNaeshin');
  const resultCountHint  = document.getElementById('resultCountHint');

  const cascadeSteps = [
    document.querySelector('[data-step="1"]'),
    document.querySelector('[data-step="2"]'),
    document.querySelector('[data-step="3"]')
  ];

  // ---------- state ----------
  let allUniversities = [];
  let currentStudents = [];
  let currentFormula  = null;
  let currentMaxTotal = 1000;
  let sortDir = 'desc';

  const WOMENS_UNIVERSITIES = [
    '이화여자대학교','숙명여자대학교','성신여자대학교',
    '덕성여자대학교','동덕여자대학교','서울여자대학교'
  ];

  // ---------- helpers ----------
  const esc = (s) => window.escapeHtml ? window.escapeHtml(s) : String(s ?? '');

  function setEmpty(message, sub) {
    resultsThead.innerHTML = '';
    resultsTbody.innerHTML = '';
    resultsTable.classList.add('is-empty');
    emptyState.hidden = false;
    emptyState.querySelector('.empty-title').textContent = message;
    if (sub !== undefined) emptyState.querySelector('.empty-sub').textContent = sub;
    loadingState.hidden = true;
  }
  function setLoading() {
    resultsTable.classList.add('is-empty');
    emptyState.hidden = true;
    loadingState.hidden = false;
  }
  function setTableMode() {
    resultsTable.classList.remove('is-empty');
    emptyState.hidden = true;
    loadingState.hidden = true;
  }

  function updateStepStates() {
    const values = [gunSelect.value, universitySelect.value, departmentSelect.value];
    cascadeSteps.forEach((step, i) => {
      step.classList.remove('is-active', 'is-complete', 'is-disabled');
      if (values[i]) step.classList.add('is-complete');
      else if (i === 0 || values[i - 1]) step.classList.add('is-active');
      else step.classList.add('is-disabled');
    });
  }

  function applyDefaultExamFor(year) {
    const def = window.getDefaultExam ? window.getDefaultExam(year) : '수능';
    examSelect.setValue(def);
  }

  // ---------- API wrappers (use window.api) ----------
  async function fetchUniversities(year) {
    const data = await window.api(`/jungsi/university-list?year=${year}`);
    return (data && data.success && data.list) ? data.list : [];
  }
  async function fetchStudents(year, exam) {
    const data = await window.api(`/jungsi/students/list-by-branch?year=${year}&exam=${exam}`);
    return (data && data.success && data.students) ? data.students : [];
  }
  async function fetchFormula(U_ID, year) {
    const data = await window.api(`/jungsi/formula-details?U_ID=${U_ID}&year=${year}`);
    if (!data || !data.success) throw new Error((data && data.message) || '요강 로딩 실패');
    return data.formula;
  }

  function convertScoresToSuneungFormat(scores) {
    if (!scores) return { subjects: [] };
    const subjects = [];
    if (scores.국어_표준점수 || scores.국어_백분위) subjects.push({ name: '국어', subject: scores.국어_선택과목, std: scores.국어_표준점수, percentile: scores.국어_백분위, grade: scores.국어_등급 });
    if (scores.수학_표준점수 || scores.수학_백분위) subjects.push({ name: '수학', subject: scores.수학_선택과목, std: scores.수학_표준점수, percentile: scores.수학_백분위, grade: scores.수학_등급 });
    if (scores.영어_등급) subjects.push({ name: '영어', grade: scores.영어_등급 });
    if (scores.한국사_등급) subjects.push({ name: '한국사', grade: scores.한국사_등급 });
    if (scores.탐구1_선택과목) subjects.push({ name: '탐구', subject: scores.탐구1_선택과목, std: scores.탐구1_표준점수, percentile: scores.탐구1_백분위, grade: scores.탐구1_등급 });
    if (scores.탐구2_선택과목) subjects.push({ name: '탐구', subject: scores.탐구2_선택과목, std: scores.탐구2_표준점수, percentile: scores.탐구2_백분위, grade: scores.탐구2_등급 });
    return { subjects };
  }

  async function calculateSuneung(student, U_ID, year) {
    try {
      const studentScores = convertScoresToSuneungFormat(student.scores);
      const data = await window.api('/jungsi/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ U_ID, year, studentScores })
      });
      if (!data || !data.success) return 0;
      return Number(data.result?.totalScore || 0);
    } catch (e) { return 0; }
  }

  // ---------- load ----------
  async function loadUniversities() {
    const year = yearSelect.value;
    gunSelect.setOptions([]);
    universitySelect.setOptions([]);
    universitySelect.disable();
    departmentSelect.setOptions([]);
    departmentSelect.disable();
    updateStepStates();

    try {
      allUniversities = await fetchUniversities(year);
      const guns = [...new Set(allUniversities.map(i => i.gun).filter(Boolean))].sort();
      gunSelect.setOptions(guns.map(g => ({ value: g, label: g + '군' })));
    } catch (e) {
      console.error(e);
      window.showToast && window.showToast('대학 목록 로딩 실패', 'error');
    }
  }

  async function loadStudents() {
    const year = yearSelect.value;
    const exam = examSelect.value;
    try {
      currentStudents = await fetchStudents(year, exam);
      metaStudentCount.textContent = currentStudents.length;
      pickerMeta.hidden = currentStudents.length === 0;
    } catch (e) {
      currentStudents = [];
      console.error(e);
      window.showToast && window.showToast('학생 목록 로딩 실패', 'error');
    }
  }

  // ---------- cascade handlers (combobox onChange 에서 호출) ----------
  function handleGunChange(selectedGun) {
    universitySelect.setValue('');
    departmentSelect.setOptions([]);
    departmentSelect.disable();
    formulaStrip.hidden = true;

    if (selectedGun) {
      const unis = [...new Set(
        allUniversities.filter(i => i.gun === selectedGun).map(i => i.university)
      )].sort();
      universitySelect.setOptions(unis.map(u => ({ value: u, label: u })));
      universitySelect.enable();
    } else {
      universitySelect.setOptions([]);
      universitySelect.disable();
    }
    updateStepStates();
    setEmpty('대학을 선택하세요', '선택한 군의 대학 목록에서 대학을 고르세요.');
  }

  function handleUniversityPick(uni) {
    const gun = gunSelect.value;
    departmentSelect.setOptions([]);
    departmentSelect.setValue('');
    formulaStrip.hidden = true;

    if (gun && uni) {
      const depts = allUniversities
        .filter(i => i.gun === gun && i.university === uni)
        .map(i => ({ value: String(i.U_ID), label: i.department }));
      departmentSelect.setOptions(depts);
      departmentSelect.enable();
      updateStepStates();
      setEmpty('학과를 선택하세요', '선택한 대학의 학과 목록에서 학과를 고르세요.');
    } else {
      departmentSelect.disabled = true;
      updateStepStates();
    }
  }

  async function onDepartmentPicked(U_ID) {
    const year = yearSelect.value;
    updateStepStates();
    setLoading();

    try {
      currentFormula = await fetchFormula(U_ID, year);

      // show formula strip
      formulaGun.textContent = gunSelect.value || '—';
      formulaUni.textContent = currentFormula.대학명 || '—';
      const deptOpt = departmentSelect.getOptions().find(o => String(o.value) === String(U_ID));
      formulaDept.textContent = currentFormula.학과명 || (deptOpt ? deptOpt.label : '—');
      statQuota.textContent   = (currentFormula.모집정원 ?? currentFormula.모집인원 ?? '—') + '명';
      const naeshinRatio = Number(currentFormula.내신 || 0);
      const silgiRatio   = Number(currentFormula.실기 || 0);
      const etcRatio     = Number(currentFormula.기타 || 0);
      const suneungRatio = Math.max(0, 100 - naeshinRatio - silgiRatio - etcRatio);
      statSuneung.textContent = suneungRatio + '%';
      statNaeshin.textContent = naeshinRatio + '%';
      statSilgi.textContent   = silgiRatio + '%';
      statEtc.textContent     = etcRatio + '%';
      statNaeshinWrap.hidden = !(naeshinRatio > 0);
      statSilgiWrap.hidden   = !(silgiRatio > 0);
      statEtcWrap.hidden     = !(etcRatio > 0);
      statTotal.textContent   = Number(currentFormula.총점) || 1000;
      currentMaxTotal = Number(currentFormula.총점) || 1000;

      // 맥스컷/지점컷 렌더 (해당 U_ID)
      try {
        const cuts = await fetchCutsForUid(U_ID, year);
        renderFormulaCuts(cuts);
      } catch (e) { /* noop */ }

      // 국어/수학/영어/탐구 반영비율 pill (formula 에 값 있는 것만)
      const subjectRatiosEl = document.getElementById('subjectRatios');
      if (subjectRatiosEl) {
        const subj = [
          { key: '국어', lbl: '국', cls: 'subj-kor' },
          { key: '수학', lbl: '수', cls: 'subj-mat' },
          { key: '영어', lbl: '영', cls: 'subj-eng' },
          { key: '탐구', lbl: '탐', cls: 'subj-sci' },
        ];
        subjectRatiosEl.innerHTML = subj.map(x => {
          const raw = currentFormula[x.key];
          if (raw === null || raw === undefined || raw === '') return '';
          const v = Number(raw);
          if (!isFinite(v) || v <= 0) return '';
          return `<span class="subj-chip ${x.cls}"><em>${x.lbl}</em><span class="v">${v}</span></span>`;
        }).join('');
      }
      formulaStrip.hidden = false;

      // women's university filter
      const isWomensUni = WOMENS_UNIVERSITIES.includes(currentFormula.대학명);
      const studentsToDisplay = isWomensUni
        ? currentStudents.filter(s => s.gender === '여')
        : currentStudents;

      if (studentsToDisplay.length === 0) {
        const msg = isWomensUni
          ? '해당 학년도에 등록된 여학생 데이터가 없습니다'
          : '해당 학년도에 등록된 학생 데이터가 없습니다';
        setEmpty(msg, '');
        return;
      }

      renderHeader(currentFormula);
      legendNaeshin.hidden = !(Number(currentFormula.내신 || 0) > 0);
      resultsLegend.hidden = false;

      // calculate all 수능 scores in parallel
      const suneungScores = await Promise.all(
        studentsToDisplay.map(s => calculateSuneung(s, U_ID, year))
      );

      resultsTbody.innerHTML = '';
      studentsToDisplay.forEach((student, i) => {
        const tr = document.createElement('tr');
        tr.dataset.studentId = student.student_id;
        tr.innerHTML = renderRowHtml(student, suneungScores[i], currentFormula);
        resultsTbody.appendChild(tr);
      });

      setTableMode();
      bindInputListeners();
      sortResultsTable();
      updateResultCountHint(studentsToDisplay.length);

    } catch (err) {
      console.error(err);
      setEmpty('오류가 발생했습니다', err.message || '');
      window.showToast && window.showToast('계산 실패: ' + (err.message || ''), 'error');
    }
  }

  // ---------- rendering ----------
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
      sortDir = (sortDir === 'desc') ? 'asc' : 'desc';
      const icon = sortBtn.querySelector('.sort-i');
      icon.className = 'ph-fill ' + (sortDir === 'desc' ? 'ph-caret-down' : 'ph-caret-up') + ' sort-i';
      sortResultsTable();
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

    const totalPct = Math.min(100, (suneungScore / currentMaxTotal) * 100);
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

  function updateResultCountHint(n) {
    resultCountHint.textContent = `${n}명 · 총점 내림차순`;
  }

  // ---------- live recalculation ----------
  function bindInputListeners() {
    document.querySelectorAll('.practical-input, .naeshin-input').forEach(input => {
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
    if (!currentFormula) return;
    const studentId = tr.dataset.studentId;
    const student = currentStudents.find(s => String(s.student_id) === String(studentId));
    if (!student) return;

    const practicals = [];
    tr.querySelectorAll('.practical-input').forEach(input => {
      practicals.push({ event: input.dataset.event, value: input.value });
    });

    const S_data = { gender: student.gender, practicals };
    const F_data = currentFormula;

    let silgiScore = 0;
    let silgiResult = null;
    try {
      const data = await window.api('/silgi/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ F_data, S_data })
      });
      if (data && data.success) {
        silgiResult = data.result;
        silgiScore = Number(silgiResult?.totalScore || 0);
      }
    } catch (e) { console.error(e); }

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

  // ---------- sort ----------
  function sortResultsTable() {
    const rows = Array.from(resultsTbody.querySelectorAll('tr'));
    rows.sort((a, b) => {
      const aS = Number(a.querySelector('.score-total')?.textContent || 0);
      const bS = Number(b.querySelector('.score-total')?.textContent || 0);
      return sortDir === 'desc' ? (bS - aS) : (aS - bS);
    });
    rows.forEach((row, i) => {
      resultsTbody.appendChild(row);
      const rankCell = row.querySelector('.rank-cell');
      if (rankCell) {
        const badge = rankCell.querySelector('.rank-badge');
        badge.textContent = String(i + 1).padStart(2, '0');
        rankCell.classList.toggle('is-top', i < 3);
      }
    });
  }

  // ---------- init ----------
  // year/exam combobox 의 onChange 가 로드 트리거. 별도 리스너 불필요.

  function setBranchLabel() {
    try {
      const info = window.getCounselorFromToken && window.getCounselorFromToken();
      const el = document.querySelector('[data-branch-name]');
      if (el && info?.branch) el.textContent = info.branch;
    } catch (e) { /* noop */ }
  }

  // ---------- 컷 점수 (맥스/지점) ----------
  const cutsCache = new Map(); // year -> U_ID -> {맥스_수능컷,...}
  async function fetchCutsForUid(U_ID, year) {
    if (!cutsCache.has(year)) {
      try {
        const d = await window.api(`/jungsi/cutoffs/${encodeURIComponent(year)}`);
        const byUid = new Map();
        const list = (d && (d.cutoffs || d.list || (Array.isArray(d) ? d : null))) || [];
        list.forEach(row => byUid.set(String(row.U_ID), row));
        cutsCache.set(year, byUid);
      } catch (e) {
        cutsCache.set(year, new Map());
      }
    }
    return cutsCache.get(year).get(String(U_ID)) || null;
  }

  function fmtCut(v) {
    if (v === null || v === undefined || v === '') return '—';
    const n = Number(v);
    return isFinite(n) ? n.toFixed(2) : String(v);
  }

  function renderFormulaCuts(cuts) {
    const wrap = document.getElementById('formulaCuts');
    if (!wrap) return;
    if (!cuts) { wrap.hidden = true; return; }

    const hasMax  = cuts['맥스_수능컷'] != null || cuts['맥스_총점컷'] != null;
    const hasMine = cuts['지점_수능컷'] != null || cuts['지점_총점컷'] != null;
    if (!hasMax && !hasMine && !cuts['25년총점컷'] && !cuts['26년총점컷']) {
      wrap.hidden = true; return;
    }
    wrap.hidden = false;

    const setV = (key, val) => {
      const el = wrap.querySelector(`[data-cut="${key}"]`);
      if (el) el.textContent = fmtCut(val);
    };
    setV('max-suneung', cuts['맥스_수능컷']);
    setV('max-total',   cuts['맥스_총점컷']);
    setV('max-25',      cuts['25년총점컷']);
    setV('max-26',      cuts['26년총점컷']);
    setV('mine-suneung', cuts['지점_수능컷']);
    setV('mine-total',   cuts['지점_총점컷']);
    // 지점컷은 연도별 컷은 지점별 저장 안 되는 구조 — 같은 필드 재사용
    setV('mine-25', '—');
    setV('mine-26', '—');

    try {
      const info = window.getCounselorFromToken && window.getCounselorFromToken();
      const lbl = wrap.querySelector('[data-cut-mine-label]');
      if (lbl && info?.branch) lbl.textContent = `${info.branch}컷`;
    } catch (e) {}
  }

  // ---------- 학생 성적표 모달 ----------
  function openStudentScoresModal(student) {
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

  document.addEventListener('click', (e) => {
    const close = e.target.closest('[data-close-modal]');
    if (close) {
      const id = close.getAttribute('data-close-modal');
      const m = id ? document.getElementById(id) : close.closest('.modal-backdrop');
      if (m) m.classList.remove('show');
      return;
    }
    // 학생 이름 셀 클릭
    const nameCell = e.target.closest('#results-tbody .student-name-cell');
    if (nameCell) {
      const tr = nameCell.closest('tr');
      const sid = tr && tr.dataset.studentId;
      if (!sid) return;
      const student = currentStudents.find(s => String(s.student_id) === String(sid));
      if (student) openStudentScoresModal(student);
      return;
    }
    // backdrop 바깥 클릭으로 닫기
    if (e.target.classList && e.target.classList.contains('modal-backdrop')) {
      e.target.classList.remove('show');
    }
  });

  (async function init() {
    // wait for bootstrap to inject sidebar/helpers
    await new Promise(r => setTimeout(r, 60));
    setBranchLabel();
    applyDefaultExamFor(yearSelect.value);
    await loadUniversities();
    await loadStudents();
    updateStepStates();
  })();
})();
