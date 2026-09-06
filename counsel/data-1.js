
  function handleAuthError() {
    if (_authErrorFired) return;
    _authErrorFired = true;
    showToast('인증 만료. 다시 로그인하세요', 'error');
    setTimeout(() => { window.location.href = LOGIN_PAGE; }, 1200);
  }
  async function api(path, opts = {}) {
    const token = getToken();
    if (!token) { handleAuthError(); throw new Error('no-token'); }
    const res = await fetch(SVR + path, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
        ...(opts.headers || {}),
      },
    });
    if (res.status === 401 || res.status === 403) { handleAuthError(); throw new Error('auth'); }
    return res.json();
  }

  /* 수능 성적 → /jungsi/calculate 용 포맷 변환 (원본 counsel 로직) */
  function convertScoresToSuneungFormat(s) {
    if (!s) return { subjects: [] };
    const subjects = [];
    if (s.국어_표준점수 != null || s.국어_백분위 != null)
      subjects.push({ name: '국어', subject: s.국어_선택과목, std: s.국어_표준점수, percentile: s.국어_백분위, grade: s.국어_등급 });
    if (s.수학_표준점수 != null || s.수학_백분위 != null)
      subjects.push({ name: '수학', subject: s.수학_선택과목, std: s.수학_표준점수, percentile: s.수학_백분위, grade: s.수학_등급 });
    if (s.영어_등급 != null) subjects.push({ name: '영어', grade: s.영어_등급 });
    if (s.한국사_등급 != null) subjects.push({ name: '한국사', grade: s.한국사_등급 });
    if (s.탐구1_선택과목) subjects.push({ name: '탐구', subject: s.탐구1_선택과목, std: s.탐구1_표준점수, percentile: s.탐구1_백분위, grade: s.탐구1_등급 });
    if (s.탐구2_선택과목) subjects.push({ name: '탐구', subject: s.탐구2_선택과목, std: s.탐구2_표준점수, percentile: s.탐구2_백분위, grade: s.탐구2_등급 });
    return { subjects };
  }
  async function fetchFormulaDetails(U_ID) {
    const year = document.getElementById('yearSel').value;
    const key = `${U_ID}-${year}`;
    if (STATE.formulaCache[key]) return STATE.formulaCache[key];
    try {
      const d = await api(`/jungsi/formula-details?U_ID=${U_ID}&year=${year}`);
      if (!d.success) throw new Error(d.message || '요강 조회 실패');
      STATE.formulaCache[key] = d.formula;
      return d.formula;
    } catch (e) {
      if (e.message !== 'auth') console.warn('[fetchFormulaDetails]', U_ID, e);
      return null;
    }
  }

  /* ====== 학과 통계 (상위10%/총점컷) ====== */
  async function fetchAndDisplayDeptStats(cardEl, U_ID) {
    const year = document.getElementById('yearSel').value;
    const box = cardEl.querySelector('.uni-metrics');
    if (!box) return;
    const dept = STATE.allFilterData.find(d => String(d.U_ID) === String(U_ID));
    const branchTotal = (dept?.branch_total_cut != null && dept.branch_total_cut !== '') ? Number(dept.branch_total_cut).toFixed(2) : '-';
    const maxTotal = (dept?.max_total_cut != null && dept.max_total_cut !== '') ? Number(dept.max_total_cut).toFixed(2) : '-';
    const metrics = box.querySelectorAll('.uni-metric .value');
    if (metrics[1]) metrics[1].textContent = branchTotal;
    if (metrics[2]) metrics[2].textContent = maxTotal;
    try {
      const d = await api(`/jungsi/counseling/stats/${U_ID}/${year}`);
      const payload = d?.data || d?.stats || d || {};
      const top10 = payload.top10Score ?? payload.top10 ?? payload.top_10 ?? payload.top10_total ?? null;
      const bApi = payload.branch_total_cut ?? payload.branchTotal ?? payload.branch_total ?? null;
      const mApi = payload.max_total_cut ?? payload.maxTotal ?? payload.max_total ?? null;
      if (top10 != null && metrics[0]) metrics[0].textContent = Number(top10).toFixed(2);
      if (bApi != null && metrics[1]) metrics[1].textContent = Number(bApi).toFixed(2);
      if (mApi != null && metrics[2]) metrics[2].textContent = Number(mApi).toFixed(2);
    } catch {
      if (metrics[0]) metrics[0].textContent = '-';
    }
  }

  /* ====== 안전 JSON 파싱 ====== */
  function safeParse(v, fb = null) {
    if (v == null) return fb;
    if (typeof v === 'object') return v;
    if (typeof v !== 'string' || !v) return fb;
    try { return JSON.parse(v); } catch { return fb; }
  }

  async function calculateSuneung(U_ID) {
    const student = STATE.selectedStudent;
    const year = document.getElementById('yearSel').value;
    if (!student || !student.scores) return null;
    try {
      const d = await api('/jungsi/calculate', {
        method: 'POST',
        body: JSON.stringify({
          U_ID,
          year,
          studentScores: convertScoresToSuneungFormat(student.scores),
        }),
      });
      if (!d.success) return null;
      return Number(d.result?.totalScore || 0);
    } catch (e) {
      if (e.message !== 'auth') console.warn('[calculateSuneung]', U_ID, e);
      return null;
    }
  }

  /* 드로어 모든 후보의 환산점수를 병렬 계산해서 화면에 반영 */
  async function calculateAllCandidates(deptList) {
    // 각 row에 병렬로 요청 (서버 부담 고려 8개 chunk)
    const chunk = 8;
    const byUid = {};
    deptList.forEach(d => { byUid[d.U_ID] = d; });

    for (let i = 0; i < deptList.length; i += chunk) {
      const slice = deptList.slice(i, i + chunk);
      const results = await Promise.all(slice.map(async d => ({
        uid: d.U_ID,
        score: await calculateSuneung(d.U_ID),
        cut: d.branch_suneung_cut,
      })));
      results.forEach(r => {
        const scoreEl = document.querySelector(`[data-score-out="${r.uid}"]`);
        const diffEl = document.querySelector(`[data-diff-out="${r.uid}"]`);
        if (!scoreEl) return;
        if (r.score == null) {
          scoreEl.innerHTML = '<span style="color:var(--danger);font-size:11px;">계산 오류</span>';
          if (diffEl) diffEl.style.visibility = 'hidden';
          return;
        }
        scoreEl.textContent = r.score.toFixed(2);
        if (diffEl) {
          const cut = parseFloat(r.cut);
          if (!isNaN(cut) && cut > 0) {
            const diff = r.score - cut;
            const sign = diff >= 0 ? '+' : '';
            diffEl.textContent = `${sign}${diff.toFixed(1)}`;
            diffEl.className = 'uni-diff ' + (diff > 3 ? 'above' : diff < -3 ? 'below' : 'near');
            diffEl.style.visibility = 'visible';
          } else {
            diffEl.style.visibility = 'hidden';
          }
        }
      });
    }
  }
