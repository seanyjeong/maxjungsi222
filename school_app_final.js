/* ============================================================ */
/* school_app_final.new.js — 맥스라이브 (실제 지원자 실시간)      */
/* API:                                                            */
/*   GET /jungsi/schools/{year}  → 대학/학과 목록                   */
/*   GET /jungsi/university-final-applicants/{U_ID}/{year}          */
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
      const r = await window.api(`/jungsi/university-final-applicants/${STATE.U_ID}/${STATE.year}`);
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
      const psEl = document.getElementById('passStats');
      if (psEl) psEl.hidden = true;
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

    // 합격 통계 (최초합 OR 최종합 — 둘 중 하나라도 PASS면 1명, 중복 X)
    const PASS = /^(합격|합|OK|최초합|최종합|PASS|Y)$/i;
    const isFirstPass = (a) => PASS.test(String(a.result_first || '').trim());
    const isFinalPass = (a) => PASS.test(String(a.result_final || '').trim());
    const isStage1Pass = (a) => PASS.test(String(a.result_1st || '').trim());
    const isPassed = (a) => isFirstPass(a) || isFinalPass(a);

    const passedApps = apps.filter(isPassed);
    const cntPass = passedApps.length;
    const minOf = (arr) => arr.length ? Math.min(...arr) : null;
    const fmt = (v) => v == null ? null : v.toFixed(2);

    // 대학·학과별 특수 룰
    const u = STATE.university || '';
    const found = STATE.schools.find(s => String(s.U_ID) === STATE.U_ID);
    const dept = found ? (found.department || '') : '';
    const useSuneungAsCut = u.includes('숙명') || (u.includes('건국') && dept.includes('체육교육'));
    const isEwha = u.includes('이화');

    const passStatsEl = document.getElementById('passStats');
    if (passStatsEl) {
      const parts = [];
      if (cntPass > 0) parts.push(`<span class="ps-chip ps-pass">합격 ${cntPass}</span>`);

      if (isEwha) {
        // 이화여대: 1단계 최하 수능 + 최종합 최하 수능 (둘 다 수능점수 기준)
        const minStage1Sun = minOf(apps.filter(isStage1Pass).map(a => Number(a.suneung_score) || 0).filter(s => s > 0));
        const minFinalSun  = minOf(apps.filter(isFinalPass).map(a => Number(a.suneung_score) || 0).filter(s => s > 0));
        if (minStage1Sun != null) parts.push(`<span class="ps-chip ps-cut">1단계 최하 수능 ${fmt(minStage1Sun)}</span>`);
        if (minFinalSun  != null) parts.push(`<span class="ps-chip ps-cut">최종합 최하 수능 ${fmt(minFinalSun)}</span>`);
      } else if (useSuneungAsCut) {
        // 숙명/건국 체육교육: 합격 최하점을 수능점수로
        const minSun = minOf(passedApps.map(a => Number(a.suneung_score) || 0).filter(s => s > 0));
        if (minSun != null) parts.push(`<span class="ps-chip ps-cut">합격 최하 수능 ${fmt(minSun)}</span>`);
      } else {
        // 기본: 합격 최하 총점
        const minTot = minOf(passedApps.map(a => Number(a.total_score) || 0).filter(s => s > 0));
        if (minTot != null) parts.push(`<span class="ps-chip ps-cut">합격 최하 ${fmt(minTot)}</span>`);
      }

      if (parts.length) {
        passStatsEl.innerHTML = parts.join('');
        passStatsEl.hidden = false;
      } else {
        passStatsEl.hidden = true;
      }
    }

    renderCards();
  }

  // ── 결과 라벨 (맥스라이브 전용) ──
  function resultBadge(label, value) {
    if (value == null || value === '') return '';
    const str = String(value).trim();
    if (!str || str === '-' || str === '0') return '';
    let cls = 'result-badge';
    if (/합격|합|OK|최초합/i.test(str)) cls += ' result-pass';
    else if (/예비/i.test(str)) cls += ' result-wait';
    else if (/불합격|불합|탈락/i.test(str)) cls += ' result-fail';
    return `<span class="${cls}"><span class="r-lbl">${label}</span><span class="r-val">${window.escapeHtml ? window.escapeHtml(str) : str}</span></span>`;
  }

  // ── 결과 기반 tier (작을수록 좋은 결과) ──
  //   1    : 합격 (최초합 / 최종합 — 둘 다 같은 tier)
  //   1.5  : 1단계 합격만 (최초/최종 미정)
  //   2+n  : 예비 N번 (번호 작을수록 좋음)
  //   3    : 불합격 / 탈락
  //   99   : 결과 미정 / 해당없음
  function resultTier(a) {
    const final = String(a.result_final || '').trim();
    const first = String(a.result_first || '').trim();
    const p1    = String(a.result_1st   || '').trim();
    const PASS = /^(합격|합|OK|최초합|최종합|PASS|Y)$/i;
    const FAIL = /불합|불$|탈락|실패|N$/i;
    const WAIT = /예비|대기/;
    const waitNum = s => parseInt((String(s).match(/\d+/) || ['9999'])[0], 10);

    // 최종에서 이미 결과가 있으면 그게 최우선
    if (PASS.test(final)) return 1;
    if (FAIL.test(final)) return 3;

    // 최초 단계
    if (PASS.test(first)) return 1;      // 최초합 = 최종합과 동일 tier
    if (FAIL.test(first)) return 3;
    if (WAIT.test(first)) return 2 + waitNum(first) / 10000;

    // 1단계만 결과 있는 경우
    if (PASS.test(p1)) return 1.5;
    if (FAIL.test(p1)) return 3;
    if (WAIT.test(p1)) return 2 + waitNum(p1) / 10000;

    return 99; // 미정 / 해당없음
  }

  // ── 순위 역전 감지 ──
  // 합격자(tier 1) 인데, 나보다 점수 높은 학생 중 불합/예비(tier > 1) 가 있으면 이상
  // 즉 "점수가 낮은데 합격한" 쪽을 flag
  function detectAnomalySet(apps) {
    const entries = apps.map((a, i) => ({
      i, tier: resultTier(a), total: Number(a.total_score) || 0,
    }));
    const set = new Set();
    for (const me of entries) {
      if (me.tier !== 1) continue;     // 확정 합격자만 판정 대상 (최초합/최종합)
      if (me.total <= 0) continue;
      for (const other of entries) {
        if (other.i === me.i) continue;
        if (other.tier === 99) continue; // 결과 미정은 제외
        if (other.total > me.total && other.tier > 1) {
          set.add(me.i);
          break;
        }
      }
    }
    return set;
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

  function renderCards() {
    const sorted = sortApplicants();
    const myBranch = STATE.myBranch;
    const anomalySet = detectAnomalySet(sorted);

    const html = sorted.map((a, idx) => {
      const rank = idx + 1;
      const isMine = myBranch && a.branch === myBranch;
      const isAnomaly = anomalySet.has(idx);
      const anomaly = isAnomaly ? { level: 'warn', text: '결과 순위 역전' } : null;
      const resultChips = [
        resultBadge('1단계', a.result_1st),
        resultBadge('최초', a.result_first),
        resultBadge('최종', a.result_final),
        a.registered === 'Y' || a.registered === 1 ? '<span class="result-badge result-registered"><span class="r-val">등록</span></span>' : '',
      ].filter(Boolean).join('');

      const suneungBits = [
        `국 표${a.korean_standard || '-'} 백${a.korean_percentile || '-'} <span class="grade-text grade-${a.korean_grade || '9'}">${a.korean_grade || '-'}</span>`,
        `수 표${a.math_standard || '-'} 백${a.math_percentile || '-'} <span class="grade-text grade-${a.math_grade || '9'}">${a.math_grade || '-'}</span>`,
        `영 <span class="grade-text grade-${a.english_grade || '9'}">${a.english_grade || '-'}</span>`,
        `탐1 표${a.inquiry1_standard || '-'} 백${a.inquiry1_percentile || '-'} <span class="grade-text grade-${a.inquiry1_grade || '9'}">${a.inquiry1_grade || '-'}</span>`,
        `탐2 표${a.inquiry2_standard || '-'} 백${a.inquiry2_percentile || '-'} <span class="grade-text grade-${a.inquiry2_grade || '9'}">${a.inquiry2_grade || '-'}</span>`,
      ].map(s => `<span class="score-item">${s}</span>`).join('');

      let practicalText = '';
      if (a.practical_records && typeof a.practical_records === 'object' && Object.keys(a.practical_records).length) {
        practicalText = Object.entries(a.practical_records)
          .map(([종목, 기록]) => `<span class="score-item">${window.escapeHtml ? window.escapeHtml(종목) : 종목} ${window.escapeHtml ? window.escapeHtml(String(기록)) : 기록}</span>`)
          .join('');
      }

      const naeshinHtml = a.naeshin_score ? `
        <div class="item">
          <span class="label">내신</span>
          <span class="value">${Number(a.naeshin_score).toFixed(2)}</span>
        </div>
      ` : '';
      const practicalScoreHtml = a.practical_score ? `
        <div class="item">
          <span class="label">실기</span>
          <span class="value">${Number(a.practical_score).toFixed(2)}</span>
        </div>
      ` : '';

      const esc = window.escapeHtml || (s => s);

      return `
        <div class="applicant-card ${isMine ? 'is-mine' : ''} ${anomaly ? 'has-anomaly anomaly-' + anomaly.level : ''}">
          <div class="card-header">
            <span class="rank">#${rank}</span>
            <span class="name">${esc(a.name || '-')}</span>
            <span class="branch">${esc(a.branch || '-')}</span>
            ${anomaly ? `<span class="anomaly-chip anomaly-${anomaly.level}" title="${esc(anomaly.text)}"><i class="ph-fill ph-warning"></i>${esc(anomaly.text)}</span>` : ''}
            <span class="school">${esc(a.school_name || '')}</span>
          </div>
          ${resultChips ? `<div class="result-row">${resultChips}</div>` : ''}
          <div class="compact-row">
            <span class="label">수능</span>
            <span class="content">${suneungBits}</span>
          </div>
          ${practicalText ? `
          <div class="compact-row">
            <span class="label">실기</span>
            <span class="content">${practicalText}</span>
          </div>
          ` : ''}
          <div class="total-row">
            <div class="item">
              <span class="label">수능점수</span>
              <span class="value">${a.suneung_score != null ? Number(a.suneung_score).toFixed(2) : '-'}</span>
            </div>
            ${naeshinHtml}
            ${practicalScoreHtml}
            <div class="item">
              <span class="label">총점</span>
              <span class="value highlight">${a.total_score != null ? Number(a.total_score).toFixed(2) : '-'}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = `<div class="applicants-grid">${html}</div>`;
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
      STATE.university = '';
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
      if (STATE.applicants.length) renderCards();
    },
  });

  // 초기 로드
  emptyHint('상단에서 군 / 대학을 선택하세요', '선택한 학과에 상담 저장된 전지점 학생들의 수능·실기·총점이 실시간으로 집계됩니다.');
  loadSchools();
})();
