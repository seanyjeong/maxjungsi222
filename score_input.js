/* =========================================================
   score_input.new.js — Claude Design 통합 + 실 API 직결
   ========================================================= */
'use strict';

(function () {
  // 백엔드 정확한 과목명에 맞춤 (디자인 옵션 일부 보정)
  const KOR_OPTS  = ['화법과작문', '언어와매체'];
  const MATH_OPTS = ['확률과통계', '미적분', '기하'];
  const TAM_OPTS  = [
    '생활과윤리', '윤리와사상', '한국지리', '세계지리', '동아시아사', '세계사',
    '경제', '정치와법', '사회문화',
    '물리1', '화학1', '생명과학1', '지구과학1',
    '물리2', '화학2', '생명과학2', '지구과학2',
  ];

  const state = {
    year: '2027',
    exam: '3월',
    students: [],   // [{student_id, student_name, school_name, gender, 한국사_등급, 국어_*, ...}]
    locked: false,
  };

  const SCORE_FIELDS = [
    '한국사_등급',
    '국어_선택과목', '국어_표준점수', '국어_백분위', '국어_등급',
    '수학_선택과목', '수학_표준점수', '수학_백분위', '수학_등급',
    '영어_등급',
    '탐구1_선택과목', '탐구1_표준점수', '탐구1_백분위', '탐구1_등급',
    '탐구2_선택과목', '탐구2_표준점수', '탐구2_백분위', '탐구2_등급',
  ];

  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = window.escapeHtml || (s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const toast = window.showToast || ((m, t) => console.log('[toast]', t, m));

  function scoreValue(row, field) {
    if (!row) return null;
    const value = row[field];
    return value === undefined ? null : value;
  }

  function buildStudentScoreRow(student, scoreRows) {
    const rows = Array.isArray(scoreRows) ? scoreRows : [];
    const official = rows.find(x => x.입력유형 === 'official');
    const raw = rows.find(x => x.입력유형 === 'raw');
    const source = official || {};
    return {
      student_id: student.student_id,
      student_name: student.student_name,
      school_name: student.school_name || '',
      gender: student.gender || '',
      입력유형: official ? 'official' : (raw ? 'raw' : null),
      한국사_등급: scoreValue(source, '한국사_등급'),
      국어_선택과목: scoreValue(source, '국어_선택과목') || null,
      국어_표준점수: scoreValue(source, '국어_표준점수'),
      국어_백분위: scoreValue(source, '국어_백분위'),
      국어_등급: scoreValue(source, '국어_등급'),
      수학_선택과목: scoreValue(source, '수학_선택과목') || null,
      수학_표준점수: scoreValue(source, '수학_표준점수'),
      수학_백분위: scoreValue(source, '수학_백분위'),
      수학_등급: scoreValue(source, '수학_등급'),
      영어_등급: scoreValue(source, '영어_등급'),
      탐구1_선택과목: scoreValue(source, '탐구1_선택과목') || null,
      탐구1_표준점수: scoreValue(source, '탐구1_표준점수'),
      탐구1_백분위: scoreValue(source, '탐구1_백분위'),
      탐구1_등급: scoreValue(source, '탐구1_등급'),
      탐구2_선택과목: scoreValue(source, '탐구2_선택과목') || null,
      탐구2_표준점수: scoreValue(source, '탐구2_표준점수'),
      탐구2_백분위: scoreValue(source, '탐구2_백분위'),
      탐구2_등급: scoreValue(source, '탐구2_등급'),
      _dirty: false,
    };
  }

  function toOfficialSaveItem(row) {
    const item = { student_id: row.student_id, 입력유형: 'official' };
    SCORE_FIELDS.forEach((field) => {
      const value = row[field];
      item[field] = field.endsWith('_선택과목') ? (value || null) : (value ?? null);
    });
    return item;
  }

  function collectOfficialItems(rows) {
    return rows
      .filter(r => r._dirty && hasAnyInput(r))
      .map(toOfficialSaveItem);
  }

  // ---------- Render ----------
  function statusOf(row) {
    if (row.입력유형 === 'official') return { key: 'ok',   icon: 'ph-check-circle',   label: '공식' };
    if (row.입력유형 === 'raw')      return { key: 'raw',  icon: 'ph-warning-circle', label: '가채점' };
    return                                  { key: 'none', icon: 'ph-minus-circle',   label: '미입력' };
  }
  function optionsHtml(opts, selected) {
    const empty = `<option value="" ${!selected ? 'selected' : ''}>—</option>`;
    return empty + opts.map(o => `<option value="${esc(o)}" ${selected === o ? 'selected' : ''}>${esc(o)}</option>`).join('');
  }
  function val(v) { return (v == null || v === '') ? '' : v; }
  function numInput(v, name, rowId, max = 3) {
    return `<input class="cell-in num" type="text" inputmode="numeric" maxlength="${max}" data-row="${rowId}" data-field="${name}" value="${esc(val(v))}" placeholder="—">`;
  }
  function selectCell(opts, v, name, rowId) {
    return `<select class="cell-sel ${v ? '' : 'is-empty'}" data-row="${rowId}" data-field="${name}">${optionsHtml(opts, v)}</select>`;
  }

  function rowHtml(r) {
    const st = statusOf(r);
    const id = r.student_id;
    return `
    <tr data-row-id="${id}" class="${state.locked ? 'locked' : ''}">
      <td class="cell-name" title="${esc(r.student_name)}">${esc(r.student_name)}<span class="name-id">#${id}</span></td>
      <td class="cell-school" title="${esc(r.school_name)}">${esc(r.school_name || '')}</td>
      <td class="cell-gender">${esc(r.gender || '')}</td>

      <td>${numInput(r['한국사_등급'], '한국사_등급', id, 1)}</td>

      <td class="grp-start">${selectCell(KOR_OPTS, r['국어_선택과목'], '국어_선택과목', id)}</td>
      <td>${numInput(r['국어_표준점수'], '국어_표준점수', id, 3)}</td>
      <td>${numInput(r['국어_백분위'], '국어_백분위', id, 3)}</td>
      <td>${numInput(r['국어_등급'], '국어_등급', id, 1)}</td>

      <td class="grp-start">${selectCell(MATH_OPTS, r['수학_선택과목'], '수학_선택과목', id)}</td>
      <td>${numInput(r['수학_표준점수'], '수학_표준점수', id, 3)}</td>
      <td>${numInput(r['수학_백분위'], '수학_백분위', id, 3)}</td>
      <td>${numInput(r['수학_등급'], '수학_등급', id, 1)}</td>

      <td class="grp-start">${numInput(r['영어_등급'], '영어_등급', id, 1)}</td>

      <td class="grp-start">${selectCell(TAM_OPTS, r['탐구1_선택과목'], '탐구1_선택과목', id)}</td>
      <td>${numInput(r['탐구1_표준점수'], '탐구1_표준점수', id, 3)}</td>
      <td>${numInput(r['탐구1_백분위'], '탐구1_백분위', id, 3)}</td>
      <td>${numInput(r['탐구1_등급'], '탐구1_등급', id, 1)}</td>

      <td class="grp-start">${selectCell(TAM_OPTS, r['탐구2_선택과목'], '탐구2_선택과목', id)}</td>
      <td>${numInput(r['탐구2_표준점수'], '탐구2_표준점수', id, 3)}</td>
      <td>${numInput(r['탐구2_백분위'], '탐구2_백분위', id, 3)}</td>
      <td>${numInput(r['탐구2_등급'], '탐구2_등급', id, 1)}</td>

      <td class="cell-status"><span class="status-pill ${st.key}"><i class="ph-fill ${st.icon}"></i>${st.label}</span></td>
    </tr>`;
  }

  function render() {
    const tbody = $('#tbody');
    if (!state.students.length) {
      tbody.innerHTML = `<tr><td colspan="22"><div class="empty-state"><i class="ph-light ph-users"></i><h3>${state.year}학년도 학생이 없습니다</h3></div></td></tr>`;
    } else {
      tbody.innerHTML = state.students.map(rowHtml).join('');
    }
    updateSummary();
  }

  function updateSummary() {
    const tot = state.students.length;
    const ok  = state.students.filter(r => r.입력유형 === 'official').length;
    const raw = state.students.filter(r => r.입력유형 === 'raw').length;
    const none = tot - ok - raw;
    $('#sumTotal').textContent = tot;
    $('#sumOk').textContent = ok;
    $('#sumOkPct').textContent = tot ? `${((ok / tot) * 100).toFixed(0)} %` : '— %';
    $('#sumRaw').textContent = raw;
    $('#sumNone').textContent = none;
    $('#sumYear').textContent = state.year;
    $('#sumExam').textContent = state.exam;
    $('#footerCount').textContent = `${tot}명`;
  }

  // ---------- Interactions ----------
  function bindTableEvents() {
    const tbody = $('#tbody');
    tbody.addEventListener('input', (e) => {
      const el = e.target;
      if (!el.matches('.cell-in, .cell-sel')) return;
      const rowEl = el.closest('tr');
      const row = state.students.find(r => String(r.student_id) === rowEl.dataset.rowId);
      if (!row) return;

      const field = el.dataset.field;
      let v = el.value;

      // numeric guard
      if (el.classList.contains('num')) {
        v = v.replace(/[^\d]/g, '');
        if (field.endsWith('_등급')) v = v.replace(/[^1-9]/g, '').slice(0, 1);
        if (field.endsWith('_백분위')) {
          const n = parseInt(v, 10);
          if (!isNaN(n) && n > 100) v = '100';
        }
        if (field.endsWith('_표준점수')) {
          const n = parseInt(v, 10);
          if (!isNaN(n) && n > 200) v = '200';
        }
        el.value = v;
      }

      // 탐1/탐2 중복 방지
      if (field === '탐구1_선택과목' && v && v === row['탐구2_선택과목']) {
        row['탐구2_선택과목'] = null;
        const sel2 = rowEl.querySelector('select[data-field="탐구2_선택과목"]');
        if (sel2) { sel2.value = ''; sel2.classList.add('is-empty'); }
      }
      if (field === '탐구2_선택과목' && v && v === row['탐구1_선택과목']) {
        row['탐구1_선택과목'] = null;
        const sel1 = rowEl.querySelector('select[data-field="탐구1_선택과목"]');
        if (sel1) { sel1.value = ''; sel1.classList.add('is-empty'); }
      }

      row[field] = v === '' ? null : (el.classList.contains('num') ? Number(v) : v);
      row._dirty = true;

      if (el.classList.contains('cell-sel')) el.classList.toggle('is-empty', !v);
      rowEl.classList.add('dirty');
      $('#saveBtn').disabled = state.locked;
    });

    // 등급 자동 다음 셀
    tbody.addEventListener('input', (e) => {
      const el = e.target;
      if (!el.matches('.cell-in')) return;
      const field = el.dataset.field;
      if (field && field.endsWith('_등급') && el.value.length === 1) {
        focusNextInput(el);
      }
    });
  }

  function focusNextInput(el) {
    const all = $$('#tbody .cell-in, #tbody .cell-sel');
    const i = all.indexOf(el);
    if (i >= 0 && i < all.length - 1) all[i + 1].focus();
  }

  // ---------- Lock (수능 + 12/4 이전) ----------
  function checkLock() {
    const now = new Date();
    const unlock = new Date(`${parseInt(state.year, 10) - 1}-12-04T00:00:00`);
    const shouldLock = state.exam === '수능' && now < unlock;
    state.locked = shouldLock;
    $('#lockBanner').style.display = shouldLock ? 'flex' : 'none';
    if (shouldLock) {
      $('#lockBanner').querySelector('span').textContent =
        `수능 성적표 배부일(${unlock.getFullYear()}-12-04)부터 입력이 가능합니다`;
    }
    $('#saveBtn').disabled = shouldLock;
    document.getElementById('scoreTable').classList.toggle('locked-area', shouldLock);
    return shouldLock;
  }

  // ---------- Load (실 API) ----------
  async function load() {
    const tbody = $('#tbody');
    tbody.innerHTML = `<tr><td colspan="22"><div class="empty-state"><i class="ph-light ph-circle-notch spin"></i><h3>${state.year}학년도 ${state.exam} 불러오는 중…</h3></div></td></tr>`;
    checkLock();
    try {
      const sRes = await window.api(`/jungsi/students/list-by-branch?year=${state.year}&exam=${encodeURIComponent(state.exam)}`);
      if (!sRes || !sRes.success) throw new Error((sRes && sRes.message) || '학생 목록 실패');
      const students = (sRes.students || []).slice().sort((a, b) => (a.student_name || '').localeCompare(b.student_name || '', 'ko'));

      // 점수 병합
      let scoresMap = {};
      if (students.length > 0) {
        const ids = students.map(s => s.student_id);
        const r = await window.api('/jungsi/scores/list', {
          method: 'POST',
          body: JSON.stringify({ year: state.year, exam: state.exam, student_ids: ids }),
        });
        if (r?.success) scoresMap = r.data || {};
      }

      state.students = students.map(s => buildStudentScoreRow(s, scoresMap[s.student_id]));
      render();
    } catch (err) {
      if (err.message === 'auth' || err.message === 'no-token') return;
      console.error('[load]', err);
      tbody.innerHTML = `<tr><td colspan="22"><div class="empty-state"><i class="ph-light ph-warning"></i><h3>로딩 실패</h3><div>${esc(err.message || err)}</div></div></td></tr>`;
      toast('로딩 실패: ' + (err.message || err), 'error');
    }
  }

  // ---------- Save (실 API) ----------
  async function save() {
    if (checkLock()) return;
    const items = collectOfficialItems(state.students);

    if (!items.length) { toast('변경된 내용이 없습니다', 'info'); return; }

    const emptyScores = items.filter(hasSubjectButNoScores);
    if (emptyScores.length) {
      const names = emptyScores.map(it => state.students.find(s => s.student_id === it.student_id)?.student_name || '?').slice(0, 10).join(', ');
      const more = emptyScores.length > 10 ? ` 외 ${emptyScores.length - 10}명` : '';
      if (!confirm(`⚠️ ${emptyScores.length}명의 학생이 선택과목은 있으나 점수가 비어있습니다:\n\n${names}${more}\n\n빈 점수로 저장하면 기존 데이터가 삭제됩니다. 계속할까요?`)) return;
    }

    const btn = $('#saveBtn');
    btn.disabled = true;
    const orig = btn.innerHTML;
    btn.innerHTML = '<i class="ph-light ph-circle-notch spin"></i> 저장 중…';
    try {
      const r = await window.api('/jungsi/scores/officialize-bulk', {
        method: 'POST',
        body: JSON.stringify({ year: state.year, exam: state.exam, items }),
      });
      if (!r || !r.success) throw new Error((r && r.message) || '저장 실패');
      toast(`${items.length}명 저장 완료`, 'success');
      await load();
    } catch (err) {
      if (err.message === 'auth' || err.message === 'no-token') return;
      toast('저장 실패: ' + (err.message || err), 'error');
      btn.disabled = false;
      btn.innerHTML = orig;
    }
  }

  function hasAnyInput(r) {
    return SCORE_FIELDS.some(k => r[k] !== null && r[k] !== undefined && r[k] !== '');
  }
  function hasSubjectButNoScores(r) {
    const pairs = [['국어_선택과목', '국어_표준점수'], ['수학_선택과목', '수학_표준점수'],
      ['탐구1_선택과목', '탐구1_표준점수'], ['탐구2_선택과목', '탐구2_표준점수']];
    return pairs.some(([s, sc]) => r[s] && (r[sc] == null || r[sc] === ''));
  }

  // ---------- Topbar ----------
  let yearCombo, examCombo;

  function applyDefaultExamFor(year) {
    const def = (typeof window.getDefaultExam === 'function') ? window.getDefaultExam(parseInt(year, 10)) : '수능';
    if (examCombo) examCombo.setValue(def);
    state.exam = def;
  }

  function initTopbar() {
    yearCombo = window.createCombobox(document.getElementById('yearSel'), {
      options: [{ value: '2027', label: '2027학년도' }, { value: '2026', label: '2026학년도' }],
      value: state.year,
      searchable: false,
      onChange: (v) => { state.year = v; applyDefaultExamFor(state.year); load(); },
    });
    examCombo = window.createCombobox(document.getElementById('examSel'), {
      options: [
        { value: '3월', label: '3월 학평' },
        { value: '6월', label: '6월 모평' },
        { value: '9월', label: '9월 모평' },
        { value: '수능', label: '수능' },
      ],
      value: state.exam,
      searchable: false,
      onChange: (v) => { state.exam = v; load(); },
    });
    applyDefaultExamFor(state.year);
    $('#reloadBtn').addEventListener('click', load);
    $('#saveBtn').addEventListener('click', save);
  }

  // ---------- Boot ----------
  document.addEventListener('DOMContentLoaded', () => {
    initTopbar();
    bindTableEvents();
    load();
  });

  if (window.__SCORE_INPUT_TEST__) {
    window.__scoreInputInternals = {
      buildStudentScoreRow,
      collectOfficialItems,
      hasAnyInput,
    };
  }
})();
