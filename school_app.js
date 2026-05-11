/* ============================================================ */
/* school_app.new.js — 맥스라이브 (학교별 전지점 지원자 현황)     */
/* API:                                                            */
/*   GET /jungsi/schools/{year}  → 대학/학과 목록                   */
/*   GET /jungsi/university-applicants/{U_ID}/{year}  → 지원자       */
/* ============================================================ */
'use strict';

(function () {
  const yearEl = document.getElementById('year-select');
  const gunEl = document.getElementById('gun-select');
  const uniEl = document.getElementById('university-select');
  const deptEl = document.getElementById('department-select');
  const sortEl = document.getElementById('sort-select');

  const statsStrip = document.getElementById('statsStrip');
  const statQuota = document.getElementById('statQuota');
  const statTotal = document.getElementById('statTotal');
  const statAvgSuneung = document.getElementById('statAvgSuneung');
  const statMaxSuneung = document.getElementById('statMaxSuneung');
  const statMinSuneung = document.getElementById('statMinSuneung');
  const statAvgTotal = document.getElementById('statAvgTotal');
  const statMaxTotal = document.getElementById('statMaxTotal');
  const statMinTotal = document.getElementById('statMinTotal');

  const container = document.getElementById('applicantsContainer');
  const legendEl = document.getElementById('applicantsLegend');
  const hintEl = document.getElementById('applicantsHint');
  const loadingState = document.getElementById('loadingState');

  const STATE = {
    year: '2027',
    gun: '',
    university: '',
    U_ID: '',
    schools: [],
    applicants: [],
    stats: {},
    quota: 0,
    myBranch: '',
    sortBy: 'total_score',
  };

  STATE.myBranch = (window.getCounselorFromToken && window.getCounselorFromToken().branch) || '';

  // ── 초기 render ──
  function emptyHint(title, sub) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon"><i class="ph-light ph-broadcast"></i></div>
        <div class="empty-title">${title}</div>
        <div class="empty-sub">${sub}</div>
      </div>
    `;
    statsStrip.hidden = true;
    legendEl.hidden = true;
    hintEl.textContent = '학과를 선택하면 지원자가 표시됩니다';
  }

  function setLoading() {
    container.innerHTML = '';
    loadingState.hidden = false;
  }

  // ── 대학 목록 로드 ──
  async function loadSchools() {
    try {
      const r = await window.api(`/jungsi/schools/${STATE.year}`);
      STATE.schools = (r && r.success) ? (r.list || []) : [];
      applyUniversityOptions();
    } catch (e) {
      if (e.message === 'auth' || e.message === 'no-token') return;
      console.error('[loadSchools]', e);
      window.showToast && window.showToast('대학 목록 로드 실패: ' + e.message, 'error');
    }
  }

  function applyUniversityOptions() {
    if (!STATE.gun) {
      uniCombo.setOptions([{ value: '', label: '먼저 군을 선택하세요' }]);
      uniCombo.disable();
      return;
    }
    const filtered = STATE.schools.filter(s => s.gun === STATE.gun);
    const seen = new Set();
    const opts = [];
    filtered.forEach(s => {
      if (!seen.has(s.university)) {
        seen.add(s.university);
        opts.push({ value: s.university, label: s.university });
      }
    });
    if (opts.length === 0) {
      uniCombo.setOptions([{ value: '', label: '해당 군에 대학이 없습니다' }]);
      uniCombo.disable();
      return;
    }
    uniCombo.setOptions(opts);
    uniCombo.enable();
  }

  function applyDepartmentOptions() {
    if (!STATE.gun || !STATE.university) {
      deptCombo.setOptions([{ value: '', label: '먼저 대학을 선택하세요' }]);
      deptCombo.disable();
      return;
    }
    const filtered = STATE.schools.filter(s => s.gun === STATE.gun && s.university === STATE.university);
    if (filtered.length === 0) {
      deptCombo.setOptions([{ value: '', label: '학과가 없습니다' }]);
      deptCombo.disable();
      return;
    }
    const opts = filtered.map(s => ({ value: String(s.U_ID), label: s.department }));
    deptCombo.setOptions(opts);
    deptCombo.enable();
  }

  // ── 지원자 로드 ──
  async function loadApplicants() {
    if (!STATE.U_ID) return;
    setLoading();
    try {
      const r = await window.api(`/jungsi/university-applicants/${STATE.U_ID}/${STATE.year}`);
      loadingState.hidden = true;
      if (!r || !r.success) throw new Error((r && r.message) || '지원자 로딩 실패');
      STATE.applicants = r.applicants || [];
      STATE.stats = r.stats || {};
      STATE.quota = (r.university && r.university.quota) || 0;
      displayApplicants();
    } catch (e) {
      loadingState.hidden = true;
      if (e.message === 'auth' || e.message === 'no-token') return;
      console.error('[loadApplicants]', e);
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon"><i class="ph-light ph-warning"></i></div>
          <div class="empty-title">지원자 로드 실패</div>
          <div class="empty-sub">${window.escapeHtml ? window.escapeHtml(e.message) : e.message}</div>
        </div>
      `;
      statsStrip.hidden = true;
      legendEl.hidden = true;
    }
  }

  function displayApplicants() {
    const apps = STATE.applicants;
    if (!apps || apps.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon"><i class="ph-light ph-tray"></i></div>
          <div class="empty-title">지원자가 없습니다</div>
          <div class="empty-sub">해당 학과에 상담 저장된 학생이 없습니다.</div>
        </div>
      `;
      statsStrip.hidden = true;
      legendEl.hidden = true;
      hintEl.textContent = `${STATE.year}학년도 · 0명`;
      return;
    }

    // 통계 계산 (클라이언트 사이드)
    const suneungVals = apps.map(a => Number(a.suneung_score) || 0).filter(s => s > 0);
    const totalVals   = apps.map(a => Number(a.total_score) || 0).filter(s => s > 0);
    const avg = arr => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

    statsStrip.hidden = false;
    legendEl.hidden = false;
    statQuota.textContent = STATE.quota ? `${STATE.quota}명` : '—';
    const totalCount = apps.length;
    statTotal.textContent = `${totalCount}명`;

    // 경쟁률 색상
    statTotal.classList.remove('competition-low', 'competition-normal', 'competition-high', 'competition-extreme');
    if (STATE.quota > 0) {
      const ratio = totalCount / STATE.quota;
      if (ratio < 1) statTotal.classList.add('competition-low');
      else if (ratio < 2) statTotal.classList.add('competition-normal');
      else if (ratio < 3) statTotal.classList.add('competition-high');
      else statTotal.classList.add('competition-extreme');
    }

    statAvgSuneung.textContent = avg(suneungVals).toFixed(2);
    statMaxSuneung.textContent = (suneungVals.length ? Math.max(...suneungVals) : 0).toFixed(2);
    statMinSuneung.textContent = (suneungVals.length ? Math.min(...suneungVals) : 0).toFixed(2);
    statAvgTotal.textContent   = avg(totalVals).toFixed(2);
    statMaxTotal.textContent   = (totalVals.length ? Math.max(...totalVals) : 0).toFixed(2);
    statMinTotal.textContent   = (totalVals.length ? Math.min(...totalVals) : 0).toFixed(2);

    hintEl.textContent = `${STATE.year}학년도 · ${totalCount}명`;
    renderTable();
  }


  function sortApplicants() {
    const sorted = [...STATE.applicants];
    switch (STATE.sortBy) {
      case 'total_score':
        sorted.sort((a, b) => (Number(b.total_score) || 0) - (Number(a.total_score) || 0));
        break;
      case 'suneung_score':
        sorted.sort((a, b) => (Number(b.suneung_score) || 0) - (Number(a.suneung_score) || 0));
        break;
      case 'naeshin_score':
        sorted.sort((a, b) => (Number(b.naeshin_score) || 0) - (Number(a.naeshin_score) || 0));
        break;
      case 'practical_score':
        sorted.sort((a, b) => (Number(b.practical_score) || 0) - (Number(a.practical_score) || 0));
        break;
      case 'name':
        sorted.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'));
        break;
    }
    return sorted;
  }

  function renderTable() {
    const sorted = sortApplicants();
    const myBranch = STATE.myBranch;
    const esc = window.escapeHtml || (s => s);
    const num = (v) => (v == null || v === '' ? '-' : Number(v).toFixed(2));
    const showNaeshin = sorted.some(a => Number(a.naeshin_score) > 0);

    const subjCell = (std, pct, grade) =>
      `<span class="sm">표${std || '-'}·백${pct || '-'}</span> <span class="grade-text grade-${grade || '9'}">${grade || '-'}</span>`;

    const cols = showNaeshin
      ? '36px 70px 64px minmax(120px,0.7fr) 92px 92px 46px 92px 92px 58px minmax(260px,1.5fr) 64px 64px 76px'
      : '36px 70px 64px minmax(120px,0.7fr) 92px 92px 46px 92px 92px minmax(260px,1.5fr) 64px 64px 76px';

    const head = `
      <div class="applicants-list-head" style="grid-template-columns: ${cols};">
        <div>#</div>
        <div>이름</div>
        <div>지점</div>
        <div>학교</div>
        <div>국어</div>
        <div>수학</div>
        <div>영어</div>
        <div>탐구1</div>
        <div>탐구2</div>
        ${showNaeshin ? '<div>내신</div>' : ''}
        <div>실기기록</div>
        <div>수능</div>
        <div>실기</div>
        <div>총점</div>
      </div>
    `;

    const rows = sorted.map((a, idx) => {
      const rank = idx + 1;
      const isMine = myBranch && a.branch === myBranch;

      let practicalText = '-';
      if (a.practical_records && typeof a.practical_records === 'object' && Object.keys(a.practical_records).length) {
        practicalText = Object.entries(a.practical_records)
          .map(([종목, 기록]) => `${esc(종목)} ${esc(String(기록))}`)
          .join(' · ');
      }

      return `
        <div class="applicant-card ${isMine ? 'is-mine' : ''}" style="grid-template-columns: ${cols};">
          <div class="col-rank">${rank}</div>
          <div class="col-name">${esc(a.name || '-')}</div>
          <div>${esc(a.branch || '-')}</div>
          <div class="col-school">${esc(a.school_name || '-')}</div>
          <div>${subjCell(a.korean_standard, a.korean_percentile, a.korean_grade)}</div>
          <div>${subjCell(a.math_standard, a.math_percentile, a.math_grade)}</div>
          <div><span class="grade-text grade-${a.english_grade || '9'}">${a.english_grade || '-'}</span></div>
          <div>${subjCell(a.inquiry1_standard, a.inquiry1_percentile, a.inquiry1_grade)}</div>
          <div>${subjCell(a.inquiry2_standard, a.inquiry2_percentile, a.inquiry2_grade)}</div>
          ${showNaeshin ? `<div>${num(a.naeshin_score)}</div>` : ''}
          <div class="col-practical" title="${practicalText}">${practicalText}</div>
          <div>${num(a.suneung_score)}</div>
          <div>${num(a.practical_score)}</div>
          <div class="col-total">${num(a.total_score)}</div>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div class="applicants-list-wrap">
        ${head}
        <div class="applicants-list">${rows}</div>
      </div>
    `;
  }

  // ── Combobox 초기화 ──
  const yearCombo = window.createCombobox(yearEl, {
    options: [
      { value: '2027', label: '2027학년도' },
      { value: '2026', label: '2026학년도' },
      { value: '2025', label: '2025학년도' },
    ],
    value: '2027',
    searchable: false,
    onChange: (v) => {
      STATE.year = v;
      STATE.U_ID = '';
      uniCombo.setValue('');
      if (typeof deptCombo !== 'undefined') deptCombo.setValue('');
      emptyHint('군/대학을 선택하세요', '학년도가 변경되어 대학 목록을 다시 불러옵니다.');
      loadSchools();
    },
  });
  STATE.year = yearCombo.value || '2027';

  const gunCombo = window.createCombobox(gunEl, {
    options: [
      { value: '', label: '군 선택' },
      { value: '가', label: '가군' },
      { value: '나', label: '나군' },
      { value: '다', label: '다군' },
    ],
    value: '',
    searchable: false,
    onChange: (v) => {
      STATE.gun = v;
      STATE.university = '';
      STATE.U_ID = '';
      const step2 = document.querySelector('.cascade-step[data-step="2"]');
      const step3 = document.querySelector('.cascade-step[data-step="3"]');
      if (step2) step2.classList.toggle('is-disabled', !v);
      if (step3) step3.classList.add('is-disabled');
      applyUniversityOptions();
      uniCombo.setValue('');
      applyDepartmentOptions();
      deptCombo.setValue('');
      emptyHint('대학을 선택하세요', '선택한 군의 대학 목록에서 고르세요.');
    },
  });

  const uniCombo = window.createCombobox(uniEl, {
    options: [{ value: '', label: '먼저 군을 선택하세요' }],
    value: '',
    searchable: true,
    placeholder: '대학 검색…',
    onChange: (v) => {
      STATE.university = v;
      STATE.U_ID = '';
      const step3 = document.querySelector('.cascade-step[data-step="3"]');
      if (step3) step3.classList.toggle('is-disabled', !v);
      applyDepartmentOptions();
      deptCombo.setValue('');
      emptyHint('학과를 선택하세요', '선택한 대학의 학과를 고르세요.');
    },
  });
  uniCombo.disable();

  const deptCombo = window.createCombobox(deptEl, {
    options: [{ value: '', label: '먼저 대학을 선택하세요' }],
    value: '',
    searchable: true,
    placeholder: '학과 검색…',
    onChange: (v) => {
      STATE.U_ID = v;
      if (v) loadApplicants();
    },
  });
  deptCombo.disable();

  const sortCombo = window.createCombobox(sortEl, {
    options: [
      { value: 'total_score', label: '총점 높은 순' },
      { value: 'suneung_score', label: '수능점수 높은 순' },
      { value: 'naeshin_score', label: '내신점수 높은 순' },
      { value: 'practical_score', label: '실기점수 높은 순' },
      { value: 'name', label: '이름 순' },
    ],
    value: 'total_score',
    searchable: false,
    onChange: (v) => {
      STATE.sortBy = v;
      if (STATE.applicants.length) renderTable();
    },
  });

  // 초기 로드
  emptyHint('상단에서 군 / 대학을 선택하세요', '선택한 학과에 상담 저장된 전지점 학생들의 수능·실기·총점이 실시간으로 집계됩니다.');
  loadSchools();
})();
