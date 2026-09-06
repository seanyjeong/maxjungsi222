/* ============================================================ */
/* silgi-editor.new.js — 실기 배점표 관리자 편집                  */
/* API:                                                           */
/*   GET    /jungsi/schools/{year}                                */
/*   GET    /jungsi/practical-scores/{U_ID}/{year}                */
/*   POST   /jungsi/practical-scores/save                         */
/*   POST   /jungsi/practical-scores/bulk-save                    */
/*   DELETE /jungsi/practical-scores/delete/{id}                  */
/* ============================================================ */
'use strict';

(function () {
  // ── DOM refs ──
  const tableTitle = document.getElementById('tableTitle');
  const tableMeta  = document.getElementById('tableMeta');
  const sectionsEl = document.getElementById('scoreSections');
  const loadButton = document.getElementById('loadButton');
  const addForm    = document.getElementById('addForm');
  const bulkSaveBtn = document.getElementById('bulkSaveButton');

  const eventNameIn     = document.getElementById('eventName');
  const recordIn        = document.getElementById('record');
  const scoreIn         = document.getElementById('score');
  const bulkEventNameIn = document.getElementById('bulkEventName');
  const bulkRecordEl    = document.getElementById('bulkRecord');
  const bulkScoreEl     = document.getElementById('bulkScore');

  // ── state ──
  const STATE = {
    year: '2027',
    uid: null,
    schools: [],      // [{U_ID, 대학명, 학과명, 군}]
    selectedSchool: null,
    gender: '남',
    bulkGender: '남',
  };

  const _esc = (s) => (window.escapeHtml ? window.escapeHtml(s) : String(s == null ? '' : s));
  const tableEditor = window.createPracticalTableEditor({ element: sectionsEl, meta: tableMeta, api: window.api, toast });

  // ── combobox 생성 ──
  const yearCombo = window.createCombobox(document.getElementById('yearSel'), {
    options: [
      { value: '2027', label: '2027학년도' },
      { value: '2026', label: '2026학년도' },
      { value: '2025', label: '2025학년도' },
    ],
    value: '2027',
    searchable: false,
    onChange: (v) => {
      if (!tableEditor.canLeave()) { yearCombo.setValue(STATE.year); return; }
      STATE.year = v;
      STATE.uid = null;
      STATE.selectedSchool = null;
      resetTable('학교 목록 갱신 중…');
      loadSchools();
    },
  });
  STATE.year = yearCombo.value || '2027';

  const schoolCombo = window.createCombobox(document.getElementById('schoolSearch'), {
    options: [],
    placeholder: '학교/학과를 선택하세요…',
    searchPlaceholder: '대학·학과 검색…',
    onChange: (v, opt) => {
      if (!tableEditor.canLeave()) { schoolCombo.setValue(STATE.uid || ''); return; }
      STATE.uid = v || null;
      STATE.selectedSchool = opt || null;
      resetTable('배점표 불러오기를 눌러 주세요.');
    },
  });

  const genderCombo = window.createCombobox(document.getElementById('genderSel'), {
    options: [
      { value: '남', label: '남' },
      { value: '여', label: '여' },
    ],
    value: '남',
    searchable: false,
    onChange: (v) => { STATE.gender = v; },
  });
  STATE.gender = genderCombo.value || '남';

  const bulkGenderCombo = window.createCombobox(document.getElementById('bulkGenderSel'), {
    options: [
      { value: '남', label: '남' },
      { value: '여', label: '여' },
    ],
    value: '남',
    searchable: false,
    onChange: (v) => { STATE.bulkGender = v; },
  });
  STATE.bulkGender = bulkGenderCombo.value || '남';

  // ── helpers ──
  function toast(msg, kind) {
    if (window.showToast) window.showToast(msg, kind || 'info');
  }

  function _bigEmpty(msg, icon) {
    return `<div class="empty-state-big"><i class="ph-light ${icon || 'ph-table'}"></i><h3>${_esc(msg)}</h3></div>`;
  }

  function resetTable(hintLabel) {
    tableEditor.reset();
    tableTitle.innerHTML = '배점표 <span class="dim">(U_ID: —)</span>';
    tableMeta.textContent = '';
    sectionsEl.innerHTML = _bigEmpty(hintLabel || '—', 'ph-circle-notch spin');
  }

  function emptyTable(msg, icon) {
    sectionsEl.innerHTML = _bigEmpty(msg, icon);
  }

  // ── 학교 목록 로드 ──
  async function loadSchools() {
    const year = STATE.year;
    schoolCombo.disable && schoolCombo.disable();
    schoolCombo.setOptions([]);
    try {
      const r = await window.api(`/jungsi/schools/${encodeURIComponent(year)}`);
      if (year !== STATE.year) return;
      if (!r || !r.success) throw new Error((r && r.message) || '학교 목록 로딩 실패');

      const rows =
        Array.isArray(r.schools) ? r.schools :
        Array.isArray(r.list)    ? r.list    :
        Array.isArray(r)         ? r         : [];
      STATE.schools = rows;

      const opts = rows.map(s => {
        const univ = s.university || s.대학명 || '';
        const dept = s.department || s.학과명 || '';
        const rawGun = (s.gun || s.군 || '').toString().replace(/군$/, '').trim();
        const opt = {
          value: String(s.U_ID),
          label: `${univ} — ${dept}`,
        };
        if (rawGun) opt.meta = `${rawGun}군`;
        return opt;
      });
      schoolCombo.setOptions(opts);
      schoolCombo.enable && schoolCombo.enable();
      emptyTable('학교를 선택하고 배점표 불러오기', 'ph-table');
    } catch (e) {
      if (e.message === 'auth' || e.message === 'no-token') return;
      console.error('[loadSchools]', e);
      emptyTable('학교 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.', 'ph-warning');
      toast('학교 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.', 'error');
    }
  }

  // ── 배점표 로드 ──
  async function loadScores() {
    if (!tableEditor.canLeave()) return;
    if (!STATE.uid || !STATE.year) {
      toast('학년도와 학교를 모두 선택하세요', 'warn');
      return;
    }
    const uid = STATE.uid;
    const year = STATE.year;
    const school = STATE.selectedSchool;
    resetTable(`${year}학년도 배점표 불러오는 중…`);
    try {
      const r = await window.api(`/jungsi/practical-scores/${encodeURIComponent(uid)}/${encodeURIComponent(year)}`);
      if (uid !== STATE.uid || year !== STATE.year) return;
      if (!r || !r.success) throw new Error((r && r.message) || '배점표 불러오기 실패');

      const labelText = school && school.label ? school.label : `U_ID ${uid}`;
      tableTitle.innerHTML = `배점표 <span class="dim">· ${_esc(labelText)} (U_ID: ${_esc(uid)})</span>`;
      tableEditor.mount(r.scores || [], { uid, year });
    } catch (e) {
      if (e.message === 'auth' || e.message === 'no-token') return;
      console.error('[loadScores]', e);
      emptyTable('배점표를 불러오지 못했습니다. 다시 불러오기를 눌러 주세요.', 'ph-warning');
      toast('배점표를 불러오지 못했습니다. 다시 불러오기를 눌러 주세요.', 'error');
    }
  }

  // ── 한 줄 추가 ──
  addForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!tableEditor.canLeave()) return;
    if (!STATE.uid || !STATE.year) {
      toast('먼저 학교를 조회해주세요', 'warn');
      return;
    }
    const payload = {
      U_ID: STATE.uid,
      학년도: STATE.year,
      종목명: eventNameIn.value.trim(),
      성별: STATE.gender,
      기록: recordIn.value.trim(),
      배점: scoreIn.value.trim(),
    };
    if (!payload.종목명 || !payload.기록 || !payload.배점) {
      toast('종목명·기록·배점을 모두 입력하세요', 'warn');
      return;
    }
    try {
      const r = await window.api('/jungsi/practical-scores/save', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!r || !r.success) throw new Error((r && r.message) || '저장 실패');
      toast('저장 완료', 'success');
      addForm.reset();
      loadScores();
    } catch (err) {
      if (err.message === 'auth' || err.message === 'no-token') return;
      toast('저장하지 못했습니다. 입력값을 확인한 뒤 다시 저장해 주세요.', 'error');
    }
  });

  // ── 대량 추가 ──
  bulkSaveBtn.addEventListener('click', async () => {
    if (!tableEditor.canLeave()) return;
    if (!STATE.uid || !STATE.year) {
      toast('먼저 학교를 조회해주세요', 'warn');
      return;
    }
    const eventName = bulkEventNameIn.value.trim();
    const gender = STATE.bulkGender;
    const records = bulkRecordEl.value.split('\n').map(s => s.trim()).filter(Boolean);
    const scores  = bulkScoreEl.value.split('\n').map(s => s.trim()).filter(Boolean);

    if (!eventName) { toast('종목명을 입력해야 합니다', 'warn'); return; }
    if (records.length === 0 || scores.length === 0) {
      toast('붙여넣을 기록과 배점 데이터가 없습니다', 'warn');
      return;
    }
    if (records.length !== scores.length) {
      toast(`줄 수 불일치: 기록 ${records.length}줄 / 배점 ${scores.length}줄`, 'error');
      return;
    }
    if (!confirm(`[${eventName} (${gender})] ${records.length}건을 대량 저장하시겠습니까?`)) return;

    const rows_text = records.map((rec, i) => `${rec}\t${scores[i]}`).join('\n');
    const payload = {
      U_ID: STATE.uid,
      year: STATE.year,
      eventName,
      gender,
      rows_text,
    };
    try {
      const r = await window.api('/jungsi/practical-scores/bulk-save', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!r || !r.success) throw new Error((r && r.message) || '대량 저장 실패');
      toast(r.message || `${records.length}건 저장 완료`, 'success');
      bulkRecordEl.value = '';
      bulkScoreEl.value = '';
      loadScores();
    } catch (err) {
      if (err.message === 'auth' || err.message === 'no-token') return;
      toast('대량 저장하지 못했습니다. 입력값을 확인한 뒤 다시 저장해 주세요.', 'error');
    }
  });

  // ── 삭제 (event delegation) ──
  async function onRowClick(e) {
    const btn = e.target.closest('button[data-action="delete"]');
    if (!btn) return;
    const id = btn.dataset.id;
    if (!id) return;
    if (!tableEditor.canLeave()) return;
    if (!confirm(`정말로 ID ${id} 항목을 삭제하시겠습니까?`)) return;
    btn.disabled = true;
    try {
      const r = await window.api(`/jungsi/practical-scores/delete/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!r || !r.success) throw new Error((r && r.message) || '삭제 실패');
      toast('삭제 완료', 'success');
      loadScores();
    } catch (err) {
      btn.disabled = false;
      if (err.message === 'auth' || err.message === 'no-token') return;
      toast('삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.', 'error');
    }
  }
  sectionsEl.addEventListener('click', onRowClick);

  loadButton.addEventListener('click', loadScores);

  // ── init ──
  if (!window.getToken || !window.getToken()) {
    emptyTable('로그인이 필요합니다', 'ph-lock-key');
    return;
  }
  loadSchools();
})();
