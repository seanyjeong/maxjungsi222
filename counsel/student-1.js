

  /* ====== 학생 목록 로드 ====== */
  async function loadStudents() {
    const previousStudentId = STATE.selectedStudent?.student_id || null;
    const year = document.getElementById('yearSel').value;
    const exam = document.getElementById('examSel').value;
    const label = document.getElementById('comboLabel');
    label.textContent = '- 로딩 중... -';
    label.classList.add('placeholder');
    renderComboList([], '');
    try {
      const d = await api(`/jungsi/students/list-by-branch?year=${year}&exam=${encodeURIComponent(exam)}`);
      if (!d.success || !Array.isArray(d.students)) {
        label.textContent = '- 학생 없음 -';
        return;
      }
      STATE.allStudents = d.students.sort((a, b) => (a.student_name || '').localeCompare(b.student_name || '', 'ko'));
      STATE.selectedStudent = null;
      label.textContent = `- 학생 선택 (${STATE.allStudents.length}명) -`;
      renderComboList(STATE.allStudents, '');
      console.log('[loadStudents]', STATE.allStudents.length + '명 로드');
      if (previousStudentId && STATE.allStudents.some(s => String(s.student_id) === String(previousStudentId))) {
        selectStudent(previousStudentId);
      } else if (previousStudentId) {
        clearScoreUI();
        clearCounselBoard();
        triggerDrawerRerender();
      }
    } catch (e) {
      if (e.message !== 'auth') console.error(e);
      label.textContent = '- 로딩 오류 -';
    }
  }

  /* ====== 학생 combobox 렌더/제어 ====== */
  function renderComboList(students, query) {
    const list = document.getElementById('comboList');
    const q = (query || '').trim().toLowerCase();
    const filtered = q
      ? students.filter(s => {
          const hay = `${s.student_name || ''} ${s.school_name || ''}`.toLowerCase();
          return hay.includes(q);
        })
      : students;
    if (!filtered.length) {
      list.innerHTML = '<div class="combo-empty">결과가 없어요</div>';
      return;
    }
    list.innerHTML = filtered.map((s, i) => {
      const sel = STATE.selectedStudent && STATE.selectedStudent.student_id === s.student_id;
      return `<div class="combo-item${sel ? ' selected' : ''}" data-id="${s.student_id}" data-idx="${i}">
        <span>${s.student_name}</span>
        <span class="meta">${s.school_name || '-'} · ${s.grade || '-'}학년 · ${s.gender || '-'}</span>
      </div>`;
    }).join('');
  }

  function selectStudent(studentId) {
    const s = STATE.allStudents.find(x => String(x.student_id) === String(studentId));
    if (!s) return;
    STATE.selectedStudent = s;
    const label = document.getElementById('comboLabel');
    label.textContent = `${s.student_name} · ${s.school_name || '-'} · ${s.grade || '-'}학년`;
    label.classList.remove('placeholder');
    document.getElementById('studentCombo').classList.remove('open');
    renderStudentInfo(s);
    triggerDrawerRerender(); // 성별 필터 적용
    loadWishlist();          // 저장된 상담 복원
  }

  /* ====== 학생 정보 → 화면 전체 업데이트 ====== */
  function renderStudentInfo(s) {
    const sc = s.scores || null;

    // 1) student-strip 이름 + 메타
    const nameTextEl = document.getElementById('studentNameText');
    if (nameTextEl) {
      nameTextEl.textContent = s.student_name || '-';
      nameTextEl.style.color = '';
      nameTextEl.style.fontWeight = '';
    }
    const metaEl = document.querySelector('.student-meta');
    if (metaEl) {
      metaEl.innerHTML = `
        <span>${s.school_name || '학교미상'}</span><span class="dot"></span>
        <span>${s.grade || '-'}학년</span><span class="dot"></span>
        <span>${s.gender || '-'}</span>
      `;
    }

    // 성적 없을 때 처리
    if (!sc) {
      showToast('이 학생은 해당 모형 성적이 없어요', 'info');
      clearScoreUI();
      return;
    }

    // 2) 평균 백분위 조합 8개 (영어 등급 + 7개 조합)
    const kor = num(sc.국어_백분위), mat = num(sc.수학_백분위);
    const t1 = num(sc.탐구1_백분위), t2 = num(sc.탐구2_백분위);
    const engGrade = sc.영어_등급;
    const combos = buildPercentileCombos({ kor, mat, t1, t2 });

    const pctPills = document.querySelectorAll('.pct-combos .combo-pill');
    if (pctPills.length >= 8) {
      // 첫 번째 = 영어
      const engPill = pctPills[0];
      engPill.querySelector('.name').textContent = '영어';
      const gradeHtml = engGrade != null ? `${engGrade}<small>등급</small>` : '-';
      engPill.querySelector('.pct').innerHTML = gradeHtml;

      // 나머지 7개 = 조합
      combos.forEach((c, i) => {
        const pill = pctPills[i + 1];
        if (!pill) return;
        pill.querySelector('.name').textContent = c.name;
        pill.hidden = !c.visible;
        pill.querySelector('.pct').textContent = c.visible ? c.val.toFixed(1) : '-';
      });
    }

    // 최고값 자동 primary 강조
    if (typeof highlightTopCombo === 'function') highlightTopCombo();

    // 3) 6과목 상세 pill (student-detail)
    const subjects = [
      { name: '국어', subj: sc.국어_선택과목, std: sc.국어_표준점수, pct: sc.국어_백분위, grade: sc.국어_등급 },
      { name: '수학', subj: sc.수학_선택과목, std: sc.수학_표준점수, pct: sc.수학_백분위, grade: sc.수학_등급 },
      { name: '영어', subj: null, std: null, pct: null, grade: sc.영어_등급 },
      { name: '탐구1', subj: sc.탐구1_선택과목, std: sc.탐구1_표준점수, pct: sc.탐구1_백분위, grade: sc.탐구1_등급 },
      { name: '탐구2', subj: sc.탐구2_선택과목, std: sc.탐구2_표준점수, pct: sc.탐구2_백분위, grade: sc.탐구2_등급 },
      { name: '한국사', subj: null, std: null, pct: null, grade: sc.한국사_등급 },
    ];
    const detailEl = document.getElementById('studentDetail');
    if (detailEl) {
      detailEl.innerHTML = subjects.map(sub => {
        const nameLabel = sub.subj ? `${sub.name} (${sub.subj})` : sub.name;
        const metaLine = (sub.std != null || sub.pct != null)
          ? `표 ${sub.std ?? '-'} / 백 ${sub.pct ?? '-'}`
          : '-';
        const gradeLine = sub.grade != null ? `${sub.grade}등급` : '-';
        return `
          <div class="subject-pill">
            <span class="name">${nameLabel}</span>
            <span class="meta">${metaLine}</span>
            <span class="meta grade">${gradeLine}</span>
          </div>`;
      }).join('');
    }

    // 4) 드로어 성적표 (drawer-context 전체를 동적 생성)
    const ctx = document.getElementById('drawerContext');
    if (ctx) {
      const korSubj = sc.국어_선택과목 ? `<small>${sc.국어_선택과목}</small>` : '';
      const matSubj = sc.수학_선택과목 ? `<small>${sc.수학_선택과목}</small>` : '';
      ctx.innerHTML = `
        <div class="drawer-context-head">
          <strong>${s.student_name || '-'}</strong>
          <span class="meta">${s.school_name || '-'} · ${s.grade || '-'}학년 · ${s.gender || '-'}</span>
        </div>
        <table class="mini-score-table">
          <thead>
            <tr>
              <th></th>
              <th>국${korSubj}</th>
              <th>수${matSubj}</th>
              <th>영</th>
              <th>탐1<small>${sc.탐구1_선택과목 || ''}</small></th>
              <th>탐2<small>${sc.탐구2_선택과목 || ''}</small></th>
              <th>한</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>표준</th>
              <td class="${sc.국어_표준점수 == null ? 'empty' : ''}">${sc.국어_표준점수 ?? '—'}</td>
              <td class="${sc.수학_표준점수 == null ? 'empty' : ''}">${sc.수학_표준점수 ?? '—'}</td>
              <td class="empty">—</td>
              <td class="${sc.탐구1_표준점수 == null ? 'empty' : ''}">${sc.탐구1_표준점수 ?? '—'}</td>
              <td class="${sc.탐구2_표준점수 == null ? 'empty' : ''}">${sc.탐구2_표준점수 ?? '—'}</td>
              <td class="empty">—</td>
            </tr>
            <tr>
              <th>백분</th>
              <td class="${sc.국어_백분위 == null ? 'empty' : ''}">${sc.국어_백분위 ?? '—'}</td>
              <td class="${sc.수학_백분위 == null ? 'empty' : ''}">${sc.수학_백분위 ?? '—'}</td>
              <td class="empty">—</td>
              <td class="${sc.탐구1_백분위 == null ? 'empty' : ''}">${sc.탐구1_백분위 ?? '—'}</td>
              <td class="${sc.탐구2_백분위 == null ? 'empty' : ''}">${sc.탐구2_백분위 ?? '—'}</td>
              <td class="empty">—</td>
            </tr>
            <tr>
              <th>등급</th>
              <td class="grade"><b>${sc.국어_등급 ?? '-'}</b></td>
              <td class="grade"><b>${sc.수학_등급 ?? '-'}</b></td>
              <td class="grade"><b>${sc.영어_등급 ?? '-'}</b></td>
              <td class="grade"><b>${sc.탐구1_등급 ?? '-'}</b></td>
              <td class="grade"><b>${sc.탐구2_등급 ?? '-'}</b></td>
              <td class="grade"><b>${sc.한국사_등급 ?? '-'}</b></td>
            </tr>
          </tbody>
        </table>
      `;
    }

    // 5) 트렌드 chip — 직전 모형 대비 평균 백분위 변화
    updateTrendChip();
  }

  async function updateTrendChip() {
    const trend = document.querySelector('.trend-chip');
    if (!trend) return;
    const s = STATE.selectedStudent;
    const year = document.getElementById('yearSel').value;
    const exam = document.getElementById('examSel').value;
    if (!s || !year || !exam) { trend.style.display = 'none'; return; }

    try {
      const d = await api(`/jungsi/counseling/trend/${s.student_id}/${year}/${encodeURIComponent(exam)}`);
      if (!d.success || !d.hasPrev || !d.current || !d.prev) {
        trend.style.display = 'none';
        return;
      }
      // 국수탐 평균 백분위 (영어 제외 — 체대 관행)
      const avg = r => {
        const vs = [r.국어_백분위, r.수학_백분위, r.탐구1_백분위, r.탐구2_백분위]
          .filter(v => v != null).map(Number);
        if (!vs.length) return null;
        return vs.reduce((a, b) => a + b, 0) / vs.length;
      };
      const curAvg = avg(d.current);
      const prevAvg = avg(d.prev);
      if (curAvg == null || prevAvg == null) { trend.style.display = 'none'; return; }
      const diff = curAvg - prevAvg;

      trend.classList.remove('up', 'down', 'flat');
      let cls, icon, sign;
      if (diff > 0.5) { cls = 'up'; icon = 'ph-arrow-up'; sign = '+'; }
      else if (diff < -0.5) { cls = 'down'; icon = 'ph-arrow-down'; sign = ''; }
      else { cls = 'flat'; icon = 'ph-arrows-horizontal'; sign = diff >= 0 ? '+' : ''; }
      trend.classList.add(cls);
      trend.innerHTML = `<i class="ph-fill ${icon}"></i><span>${d.prev.모형} 대비</span><span class="val">${sign}${diff.toFixed(1)}%p</span>`;
      trend.style.display = 'inline-flex';
    } catch (e) {
      if (e.message !== 'auth') console.warn('[trend]', e);
      trend.style.display = 'none';
    }
  }

  function num(v) {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function averageRequired(values) {
    if (!values.length || values.some(v => !Number.isFinite(v))) return null;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  function buildPercentileCombos({ kor, mat, t1, t2 }) {
    return [
      { name: '국+수', val: averageRequired([kor, mat]) },
      { name: '국+수+탐1', val: averageRequired([kor, mat, t1]) },
      { name: '국+수+탐2', val: averageRequired([kor, mat, t2]) },
      { name: '국+탐1', val: averageRequired([kor, t1]) },
      { name: '국+탐2', val: averageRequired([kor, t2]) },
      { name: '수+탐1', val: averageRequired([mat, t1]) },
      { name: '수+탐2', val: averageRequired([mat, t2]) },
    ].map(c => ({ ...c, visible: c.val != null }));
  }

  function clearScoreUI() {
    document.querySelectorAll('.pct-combos .combo-pill').forEach(pill => {
      pill.hidden = false;
      pill.classList.remove('primary');
      const pct = pill.querySelector('.pct');
      if (pct) pct.textContent = '-';
    });
    const table = document.querySelector('.mini-score-table');
    if (table) {
      table.querySelectorAll('thead th small').forEach(s => { s.textContent = ''; });
      table.querySelectorAll('tbody td').forEach(td => { td.textContent = '—'; td.classList.add('empty'); });
    }
    const detailEl = document.getElementById('studentDetail');
    if (detailEl) {
      const names = ['국어', '수학', '영어', '탐구1', '탐구2', '한국사'];
      detailEl.querySelectorAll('.subject-pill').forEach((pill, idx) => {
        const name = pill.querySelector('.name');
        if (name && names[idx]) name.textContent = names[idx];
        pill.querySelectorAll('.meta').forEach(m => { m.textContent = '-'; });
      });
    }
  }
