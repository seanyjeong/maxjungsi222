(function () {
  'use strict';

  function toOptions(subjects) {
    return subjects.map((subject) => ({ value: subject, label: subject }));
  }

  function inquiryOptions(profile) {
    const opts = [{ value: '', label: '- 선택 -' }];
    for (const group of profile.inquiryGroups) {
      group.subjects.forEach((subject) => {
        opts.push({ value: subject, label: subject, group: group.label });
      });
    }
    return opts;
  }

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
  const cohortRouter = window.JungsiGachaCohort;

  // ---- Combos (topbar)
  const yearCombo = window.createCombobox('#yearCombo', {
    options: [
      { value: '2027', label: '2027학년도 (2·3학년)' },
      { value: '2026', label: '2026학년도' },
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
    const scoreYear = student.scoreYear || yearCombo.value;
    const profile = window.JungsiExamProfiles.getExamProfileForStudent(student, scoreYear);
    const defaults = profile.defaults;
    const tr = document.createElement('tr');
    tr.dataset.studentId = student.student_id;
    tr.dataset.scoreYear = scoreYear;
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
      options: toOptions(profile.korean), value: scores.국어_선택과목 || defaults.korean, searchable: false,
      onChange: () => markDirty(tr),
    });
    combos.수학_선택과목 = window.createCombobox(tr.querySelector('[data-field="수학_선택과목"]'), {
      options: toOptions(profile.math), value: scores.수학_선택과목 || defaults.math, searchable: false,
      onChange: () => markDirty(tr),
    });
    combos.탐구1_선택과목 = window.createCombobox(tr.querySelector('[data-field="탐구1_선택과목"]'), {
      options: inquiryOptions(profile), value: scores.탐구1_선택과목 || defaults.inquiry1, placeholder: '- 선택 -',
      onChange: () => markDirty(tr),
    });
    combos.탐구2_선택과목 = window.createCombobox(tr.querySelector('[data-field="탐구2_선택과목"]'), {
      options: inquiryOptions(profile), value: scores.탐구2_선택과목 || defaults.inquiry2, placeholder: '- 선택 -',
      onChange: () => markDirty(tr),
    });
    tr._combos = combos;
    tr._defaults = defaults;

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
    const defaults = tr._defaults;
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

    tr._combos.국어_선택과목.setValue(scores.국어_선택과목 || defaults.korean);
    set('국어_원점수', scores.국어_원점수);
    setDisp('국어_표준점수', scores.국어_표준점수);
    setDisp('국어_백분위', scores.국어_백분위);
    setDisp('국어_등급', scores.국어_등급);

    tr._combos.수학_선택과목.setValue(scores.수학_선택과목 || defaults.math);
    set('수학_원점수', scores.수학_원점수);
    setDisp('수학_표준점수', scores.수학_표준점수);
    setDisp('수학_백분위', scores.수학_백분위);
    setDisp('수학_등급', scores.수학_등급);

    set('영어_원점수', scores.영어_원점수);
    setDisp('영어_등급', scores.영어_등급);

    tr._combos.탐구1_선택과목.setValue(scores.탐구1_선택과목 || defaults.inquiry1);
    set('탐구1_원점수', scores.탐구1_원점수);
    setDisp('탐구1_표준점수', scores.탐구1_표준점수);
    setDisp('탐구1_백분위', scores.탐구1_백분위);
    setDisp('탐구1_등급', scores.탐구1_등급);

    tr._combos.탐구2_선택과목.setValue(scores.탐구2_선택과목 || defaults.inquiry2);
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
      tbody.innerHTML = '<tr class="empty-row"><td colspan="27">해당 시험 학생이 없습니다.</td></tr>';
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
    const viewYears = cohortRouter.getViewYears(year, exam);
    const loadingLabel = viewYears.length > 1 ? '고3·고2' : `${year}학년도`;
    tbody.innerHTML = `<tr class="empty-row"><td colspan="27">${loadingLabel} ${exam} 로딩 중…</td></tr>`;
    saveBtn.disabled = true;
    try {
      const cohorts = await Promise.all(viewYears.map(async (scoreYear) => {
        const data = await window.api(`/jungsi/students/list-by-branch?year=${encodeURIComponent(scoreYear)}&exam=${encodeURIComponent(exam)}&cohort=registered`);
        if (!data || !data.success || !Array.isArray(data.students)) throw new Error('학생 목록 조회 실패');
        return { year: scoreYear, students: data.students };
      }));
      renderTable(cohortRouter.mergeStudentCohorts(cohorts, year, exam));
    } catch (err) {
      console.error('[gachaejeom] load error:', err);
      tbody.innerHTML = '<tr class="empty-row"><td colspan="27">학생 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</td></tr>';
      window.showToast?.('학생 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.', 'error');
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
      items.push({
        student_id: parseInt(tr.dataset.studentId, 10),
        scoreYear: tr.dataset.scoreYear || yearCombo.value,
        scores,
      });
    });
    return items;
  };

  const saveDirtyItems = async (showSuccess = true) => {
    const items = collectDirtyItems();
    if (items.length === 0) {
      if (showSuccess) window.showToast?.('변경된 내용이 없습니다.', 'info');
      return true;
    }
    saveBtn.disabled = true;
    const exam = examCombo.value;

    try {
      const batches = cohortRouter.groupItemsByScoreYear(items);
      const responses = await Promise.all(batches.map(async (batch) => {
        const data = await window.api('/jungsi/students/scores/bulk-set-wide', {
          method: 'POST',
          body: JSON.stringify({
            학년도: batch.year,
            모형: exam,
            입력유형: 'raw',
            studentScores: batch.items,
          }),
        });
        if (!data || !data.success) throw new Error('가채점 저장 실패');
        return data;
      }));

      responses.flatMap((data) => data.updatedData || []).forEach(up => {
        const tr = tbody.querySelector(`tr[data-student-id="${up.student_id}"]`);
        if (tr) applyRowData(tr, up);
      });
      tbody.querySelectorAll('tr.dirty').forEach(r => r.classList.remove('dirty'));
      updateStats();
      if (showSuccess) window.showToast?.(`${items.length}명 학년별 저장 및 변환 완료`, 'success');
      return true;
    } catch (err) {
      console.error('[gachaejeom] save error:', err);
      window.showToast?.('가채점 성적을 저장하지 못했습니다. 잠시 후 다시 시도해주세요.', 'error');
      updateStats();
      return false;
    }
  };

  saveBtn.addEventListener('click', async () => {
    await saveDirtyItems();
  });

  // ---- Recompute (latest cutoff)
  recalcBtn.addEventListener('click', async () => {
    const viewYear = yearCombo.value;
    const exam = examCombo.value;

    // 1) save pending first
    if (tbody.querySelectorAll('tr.dirty').length > 0) {
      window.showToast?.('변경분을 먼저 저장합니다…', 'info');
      const saved = await saveDirtyItems(false);
      if (!saved) return;
    }

    const origHtml = recalcBtn.innerHTML;
    recalcBtn.disabled = true;
    recalcBtn.innerHTML = '<i class="ph-light ph-circle-notch ph-spin"></i><span>재계산 중…</span>';

    try {
      const years = cohortRouter.getViewYears(viewYear, exam);
      const results = await Promise.all(years.map(async (year) => {
        const data = await window.api('/jungsi/students/scores/recompute', {
          method: 'POST',
          body: JSON.stringify({ year, exam_type: exam, scope: 'branch' }),
        });
        if (!data || !data.success) throw new Error('가채점 재계산 실패');
        return data;
      }));
      const updated = results.reduce((sum, data) => sum + Number(data.updated || 0), 0);
      window.showToast?.(`${updated}명 학년별 최신 기준 반영 완료`, 'success');
      await loadStudents();
    } catch (err) {
      console.error('[gachaejeom] recompute error:', err);
      window.showToast?.('성적을 다시 계산하지 못했습니다. 잠시 후 다시 시도해주세요.', 'error');
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
