/* ============================================================
   gachaejeom.new.js — 정시 가채점
   의존: api.js, toast.js, utils.js, combobox.js, examSchedule.js
   ============================================================ */
(function () {
  'use strict';

  const INQUIRY = {
    '사회탐구': ['생활과윤리','윤리와사상','한국지리','세계지리','동아시아사','세계사','정치와법','경제','사회문화'],
    '과학탐구': ['물리1','화학1','생명과학1','지구과학1','물리2','화학2','생명과학2','지구과학2'],
  };
  const KOR_OPTS = [
    { value: '화법과작문', label: '화법과작문' },
    { value: '언어와매체', label: '언어와매체' },
  ];
  const MATH_OPTS = [
    { value: '확률과통계', label: '확률과통계' },
    { value: '미적분',     label: '미적분' },
    { value: '기하',       label: '기하' },
  ];
  const INQ_OPTS = (() => {
    const opts = [{ value: '', label: '- 선택 -' }];
    for (const group in INQUIRY) {
      INQUIRY[group].forEach(s => opts.push({ value: s, label: s, group }));
    }
    return opts;
  })();

  const $ = (s, root = document) => root.querySelector(s);
  const esc = window.escapeHtml || ((s) => String(s ?? ''));

  // ---- DOM refs
  const tbody    = $('#scoreTbody');
  const saveBtn  = $('#saveBtn');
  const recalcBtn= $('#recalcBtn');
  const reloadBtn= $('#reloadBtn');
  const statTotal  = $('#statTotal');
  const statFilled = $('#statFilled');
  const statEmpty  = $('#statEmpty');
  const statDirty  = $('#statDirty');
  const statPct    = $('#statPct');
  const dirtyCard  = $('#dirtyCard');

  // ---- Combos (topbar)
  const yearCombo = window.createCombobox('#yearCombo', {
    options: [
      { value: '2027', label: '2027학년도' },
      { value: '2026', label: '2026학년도' },
      { value: '2028', label: '2028학년도' },
    ],
    value: '2027',
    searchable: false,
    onChange: (v) => {
      const def = window.getDefaultExam ? window.getDefaultExam(parseInt(v)) : '수능';
      examCombo.setValue(def);
      loadStudents();
    },
  });
  const examCombo = window.createCombobox('#examCombo', {
    options: [
      { value: '3월',   label: '3월 모의' },
      { value: '6월',   label: '6월 모의' },
      { value: '9월',   label: '9월 모의' },
      { value: '수능',  label: '수능' },
    ],
    value: window.getDefaultExam ? window.getDefaultExam(2027) : '수능',
    searchable: false,
    onChange: () => loadStudents(),
  });

  // ---- Helpers
  const parseNum = (v) => {
    if (v === '' || v == null) return null;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  };

  const hasRawValues = (scores) => {
    const keys = ['한국사_원점수','국어_원점수','수학_원점수','영어_원점수','탐구1_원점수','탐구2_원점수'];
    return keys.some(k => scores && scores[k] != null && scores[k] !== '');
  };

  const updateStats = () => {
    const rows = tbody.querySelectorAll('tr[data-student-id]');
    const total = rows.length;
    let filled = 0;
    rows.forEach(tr => { if (tr.dataset.filled === '1') filled++; });
    const dirty = tbody.querySelectorAll('tr.dirty').length;
    statTotal.textContent  = total;
    statFilled.textContent = filled;
    statEmpty.textContent  = Math.max(0, total - filled);
    statDirty.textContent  = dirty;
    statPct.textContent    = total > 0 ? `${Math.round(filled / total * 100)}%` : '';
    dirtyCard.classList.toggle('active', dirty > 0);
    saveBtn.disabled = dirty === 0;
  };

  const markDirty = (tr) => {
    tr.classList.add('dirty');
    updateStats();
  };

  // ---- Row rendering
  const renderRow = (student) => {
    const scores = student.scores || {};
    const tr = document.createElement('tr');
    tr.dataset.studentId = student.student_id;
    if (hasRawValues(scores)) tr.dataset.filled = '1';

    // 공식 성적 입력된 학생은 가채점 잠금 (입력 막음)
    const isOfficial = scores.입력유형 === 'official';
    if (isOfficial) tr.classList.add('locked');

    const nameCellHtml = isOfficial
      ? `<td class="cell-name" title="${esc(student.student_name)} · 공식 성적 입력됨">${esc(student.student_name)} <span class="official-pill" title="공식 성적 이미 입력됨"><i class="ph-fill ph-lock-simple"></i>공식</span></td>`
      : `<td class="cell-name" title="${esc(student.student_name)}">${esc(student.student_name)}</td>`;

    tr.innerHTML = `
      ${nameCellHtml}
      <td class="cell-grade">${esc(student.grade ?? '—')}</td>
      <td class="cell-gender divider">${esc(student.gender ?? '—')}</td>

      <td class="sec-start"><input type="number" class="raw-input" name="한국사_원점수" min="0" max="50" placeholder="—"></td>
      <td class="sec-divider"><span class="score-display is-grade" data-field="한국사_등급"></span></td>

      <td class="cell-subj"><div class="combobox no-search" data-field="국어_선택과목"></div></td>
      <td><input type="number" class="raw-input" name="국어_원점수" min="0" max="100" placeholder="—"></td>
      <td><span class="score-display" data-field="국어_표준점수"></span></td>
      <td><span class="score-display" data-field="국어_백분위"></span></td>
      <td class="sec-divider"><span class="score-display is-grade" data-field="국어_등급"></span></td>

      <td class="cell-subj"><div class="combobox no-search" data-field="수학_선택과목"></div></td>
      <td><input type="number" class="raw-input" name="수학_원점수" min="0" max="100" placeholder="—"></td>
      <td><span class="score-display" data-field="수학_표준점수"></span></td>
      <td><span class="score-display" data-field="수학_백분위"></span></td>
      <td class="sec-divider"><span class="score-display is-grade" data-field="수학_등급"></span></td>

      <td class="sec-start"><input type="number" class="raw-input" name="영어_원점수" min="0" max="100" placeholder="—"></td>
      <td class="sec-divider"><span class="score-display is-grade" data-field="영어_등급"></span></td>

      <td class="cell-subj"><div class="combobox" data-field="탐구1_선택과목"></div></td>
      <td><input type="number" class="raw-input" name="탐구1_원점수" min="0" max="50" placeholder="—"></td>
      <td><span class="score-display" data-field="탐구1_표준점수"></span></td>
      <td><span class="score-display" data-field="탐구1_백분위"></span></td>
      <td class="sec-divider"><span class="score-display is-grade" data-field="탐구1_등급"></span></td>

      <td class="cell-subj"><div class="combobox" data-field="탐구2_선택과목"></div></td>
      <td><input type="number" class="raw-input" name="탐구2_원점수" min="0" max="50" placeholder="—"></td>
      <td><span class="score-display" data-field="탐구2_표준점수"></span></td>
      <td><span class="score-display" data-field="탐구2_백분위"></span></td>
      <td><span class="score-display is-grade" data-field="탐구2_등급"></span></td>
    `;

    // instantiate comboboxes
    const combos = {};
    combos.국어_선택과목 = window.createCombobox(tr.querySelector('[data-field="국어_선택과목"]'), {
      options: KOR_OPTS, value: scores.국어_선택과목 || '화법과작문', searchable: false,
      onChange: () => markDirty(tr),
    });
    combos.수학_선택과목 = window.createCombobox(tr.querySelector('[data-field="수학_선택과목"]'), {
      options: MATH_OPTS, value: scores.수학_선택과목 || '확률과통계', searchable: false,
      onChange: () => markDirty(tr),
    });
    combos.탐구1_선택과목 = window.createCombobox(tr.querySelector('[data-field="탐구1_선택과목"]'), {
      options: INQ_OPTS, value: scores.탐구1_선택과목 || '', placeholder: '- 선택 -',
      onChange: () => markDirty(tr),
    });
    combos.탐구2_선택과목 = window.createCombobox(tr.querySelector('[data-field="탐구2_선택과목"]'), {
      options: INQ_OPTS, value: scores.탐구2_선택과목 || '', placeholder: '- 선택 -',
      onChange: () => markDirty(tr),
    });
    tr._combos = combos;

    applyRowData(tr, scores);

    // 공식 성적 입력 학생: 모든 input/콤보 비활성, dirty 마킹 안 함
    if (isOfficial) {
      tr.querySelectorAll('input.raw-input').forEach(inp => { inp.disabled = true; });
      Object.values(combos).forEach(c => { c.disable && c.disable(); });
    } else {
      tr.querySelectorAll('input.raw-input').forEach(inp => {
        inp.addEventListener('input', () => {
          inp.classList.toggle('has-value', !!inp.value);
          markDirty(tr);
        });
      });
    }

    return tr;
  };

  const applyRowData = (tr, scores) => {
    const set = (name, val) => {
      const el = tr.querySelector(`[name="${name}"]`);
      if (el) {
        el.value = val ?? '';
        el.classList.toggle('has-value', val != null && val !== '');
      }
    };
    const setDisp = (field, val) => {
      const el = tr.querySelector(`[data-field="${field}"]`);
      if (!el) return;
      el.textContent = val ?? '';
      if (el.classList.contains('is-grade')) {
        if (val != null && val !== '') el.dataset.grade = String(val);
        else delete el.dataset.grade;
      }
    };

    set('한국사_원점수', scores.한국사_원점수);
    setDisp('한국사_등급', scores.한국사_등급);

    tr._combos.국어_선택과목.setValue(scores.국어_선택과목 || '화법과작문');
    set('국어_원점수', scores.국어_원점수);
    setDisp('국어_표준점수', scores.국어_표준점수);
    setDisp('국어_백분위', scores.국어_백분위);
    setDisp('국어_등급', scores.국어_등급);

    tr._combos.수학_선택과목.setValue(scores.수학_선택과목 || '확률과통계');
    set('수학_원점수', scores.수학_원점수);
    setDisp('수학_표준점수', scores.수학_표준점수);
    setDisp('수학_백분위', scores.수학_백분위);
    setDisp('수학_등급', scores.수학_등급);

    set('영어_원점수', scores.영어_원점수);
    setDisp('영어_등급', scores.영어_등급);

    tr._combos.탐구1_선택과목.setValue(scores.탐구1_선택과목 || '');
    set('탐구1_원점수', scores.탐구1_원점수);
    setDisp('탐구1_표준점수', scores.탐구1_표준점수);
    setDisp('탐구1_백분위', scores.탐구1_백분위);
    setDisp('탐구1_등급', scores.탐구1_등급);

    tr._combos.탐구2_선택과목.setValue(scores.탐구2_선택과목 || '');
    set('탐구2_원점수', scores.탐구2_원점수);
    setDisp('탐구2_표준점수', scores.탐구2_표준점수);
    setDisp('탐구2_백분위', scores.탐구2_백분위);
    setDisp('탐구2_등급', scores.탐구2_등급);

    tr.classList.remove('dirty');
    tr.dataset.filled = hasRawValues(scores) ? '1' : '0';
  };

  const renderTable = (students) => {
    tbody.innerHTML = '';
    if (!students || students.length === 0) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="27">해당 학년도 학생이 없습니다.</td></tr>`;
      updateStats();
      return;
    }
    const frag = document.createDocumentFragment();
    students.forEach(s => frag.appendChild(renderRow(s)));
    tbody.appendChild(frag);
    updateStats();
  };

  // ---- Loading
  const loadStudents = async () => {
    const year = yearCombo.value;
    const exam = examCombo.value;
    tbody.innerHTML = `<tr class="empty-row"><td colspan="27">${year}학년도 ${exam} 로딩 중…</td></tr>`;
    saveBtn.disabled = true;
    try {
      const data = await window.api(`/jungsi/students/list-by-branch?year=${encodeURIComponent(year)}&exam=${encodeURIComponent(exam)}`);
      if (data && data.success && Array.isArray(data.students)) {
        renderTable(data.students);
      } else {
        tbody.innerHTML = `<tr class="empty-row"><td colspan="27">로딩 실패: ${esc(data?.message || '오류')}</td></tr>`;
        updateStats();
      }
    } catch (err) {
      console.error('[gachaejeom] load error:', err);
      tbody.innerHTML = `<tr class="empty-row"><td colspan="27">오류: ${esc(err.message)}</td></tr>`;
      updateStats();
    }
  };

  // ---- Save
  const collectDirtyItems = () => {
    const items = [];
    tbody.querySelectorAll('tr.dirty[data-student-id]').forEach(tr => {
      const get = (name) => tr.querySelector(`[name="${name}"]`).value;
      const c = tr._combos;
      const scores = {
        한국사_원점수: parseNum(get('한국사_원점수')),
        국어_선택과목: c.국어_선택과목.value,
        국어_원점수:   parseNum(get('국어_원점수')),
        수학_선택과목: c.수학_선택과목.value,
        수학_원점수:   parseNum(get('수학_원점수')),
        영어_원점수:   parseNum(get('영어_원점수')),
        탐구1_선택과목: c.탐구1_선택과목.value || null,
        탐구1_원점수:   parseNum(get('탐구1_원점수')),
        탐구2_선택과목: c.탐구2_선택과목.value || null,
        탐구2_원점수:   parseNum(get('탐구2_원점수')),
      };
      // prevent duplicate inquiry subjects
      if (scores.탐구1_선택과목 && scores.탐구1_선택과목 === scores.탐구2_선택과목) {
        scores.탐구2_선택과목 = null;
        scores.탐구2_원점수 = null;
      }
      items.push({ student_id: parseInt(tr.dataset.studentId, 10), scores });
    });
    return items;
  };

  saveBtn.addEventListener('click', async () => {
    const items = collectDirtyItems();
    if (items.length === 0) {
      window.showToast?.('변경된 내용이 없습니다.', 'info');
      return;
    }
    saveBtn.disabled = true;
    const year = yearCombo.value;
    const exam = examCombo.value;

    try {
      const data = await window.api('/jungsi/students/scores/bulk-set-wide', {
        method: 'POST',
        body: JSON.stringify({
          학년도: year, 모형: exam, 입력유형: 'raw', studentScores: items,
        }),
      });
      if (!data || !data.success) throw new Error(data?.message || '저장 실패');

      (data.updatedData || []).forEach(up => {
        const tr = tbody.querySelector(`tr[data-student-id="${up.student_id}"]`);
        if (tr) applyRowData(tr, up);
      });
      tbody.querySelectorAll('tr.dirty').forEach(r => r.classList.remove('dirty'));
      updateStats();
      window.showToast?.(`${items.length}명 저장 및 변환 완료`, 'success');
    } catch (err) {
      console.error('[gachaejeom] save error:', err);
      window.showToast?.(`저장 오류: ${err.message}`, 'error');
      updateStats();
    }
  });

  // ---- Recompute (latest cutoff)
  recalcBtn.addEventListener('click', async () => {
    const year = yearCombo.value;
    const exam = examCombo.value;

    // 1) save pending first
    if (tbody.querySelectorAll('tr.dirty').length > 0) {
      window.showToast?.('변경분을 먼저 저장합니다…', 'info');
      saveBtn.click();
      await new Promise(r => setTimeout(r, 300));
    }

    const origHtml = recalcBtn.innerHTML;
    recalcBtn.disabled = true;
    recalcBtn.innerHTML = '<i class="ph-light ph-circle-notch ph-spin"></i><span>재계산 중…</span>';

    try {
      const data = await window.api('/jungsi/students/scores/recompute', {
        method: 'POST',
        body: JSON.stringify({ year, exam_type: exam, scope: 'branch' }),
      });
      if (!data || !data.success) throw new Error(data?.message || '재계산 실패');
      window.showToast?.(`${data.updated ?? 0}명 최신 기준 반영 완료`, 'success');
      await loadStudents();
    } catch (err) {
      console.error('[gachaejeom] recompute error:', err);
      window.showToast?.(`재계산 오류: ${err.message}`, 'error');
    } finally {
      recalcBtn.disabled = false;
      recalcBtn.innerHTML = origHtml;
    }
  });

  reloadBtn.addEventListener('click', loadStudents);

  // ---- Init
  document.addEventListener('DOMContentLoaded', loadStudents);
  if (document.readyState === 'interactive' || document.readyState === 'complete') {
    loadStudents();
  }
})();
