/* ============================================================ */
/* add_student.new.js — 학생 추가 + 명단 관리                     */
/* API: list-by-branch / bulk-add / update/:id / delete/:id       */
/* ============================================================ */
'use strict';

(function () {
  const yearSel = window.createCombobox(document.getElementById('yearSel'), {
    options: [{ value: '2027', label: '2027학년도' }, { value: '2026', label: '2026학년도' }],
    value: '2027',
    searchable: false,
    onChange: (v) => { STATE.year = v; loadList(); },
  });
  const sumYear = document.getElementById('sumYear');
  const sumBranch = document.getElementById('sumBranch');
  const sumTotal = document.getElementById('sumTotal');
  const sumG3 = document.getElementById('sumG3');
  const sumGN = document.getElementById('sumGN');
  const sumG2 = document.getElementById('sumG2');

  const addTbody = document.getElementById('addTbody');
  const addRowBtn = document.getElementById('addRowBtn');
  const bulkAddBtn = document.getElementById('bulkAddBtn');

  const listTbody = document.getElementById('listTbody');
  const searchInput = document.getElementById('searchInput');
  const gradeFilter = window.createCombobox(document.getElementById('gradeFilter'), {
    options: [
      { value: 'all', label: '전체 학년' },
      { value: '3', label: '3학년' },
      { value: 'N', label: 'N수생' },
      { value: '2', label: '2학년' },
    ],
    value: 'all',
    searchable: false,
    onChange: (v) => { STATE.gradeFilter = v; renderList(); },
  });
  const resultCount = document.getElementById('resultCount');

  const STATE = {
    year: '2027',
    students: [],
    searchTerm: '',
    gradeFilter: 'all',
  };

  // 사용자 지점 표시
  function setBranchLabel() {
    try {
      const info = window.getCounselorFromToken && window.getCounselorFromToken();
      if (info?.branch) sumBranch.textContent = info.branch;
    } catch (e) { /* noop */ }
  }

  function gradeBadge(g) {
    if (g === '3') return `<span class="grade-badge g3">3학년</span>`;
    if (g === 'N') return `<span class="grade-badge gn">N수생</span>`;
    if (g === '2') return `<span class="grade-badge g2">2학년</span>`;
    return `<span class="grade-badge">${window.escapeHtml(g || '')}</span>`;
  }

  // ────────────────────────────────────────────────
  // 학생 목록 로드
  // ────────────────────────────────────────────────
  async function loadList() {
    const year = STATE.year;
    sumYear.textContent = year;
    listTbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><i class="ph-light ph-circle-notch spin"></i><h3>${year}학년도 학생 불러오는 중…</h3></div></td></tr>`;
    try {
      const r = await window.api(`/jungsi/students/list-by-branch?year=${year}`);
      if (!r || !r.success) throw new Error((r && r.message) || '목록 로딩 실패');
      STATE.students = r.students || [];
      updateSummary();
      renderList();
    } catch (e) {
      if (e.message === 'auth' || e.message === 'no-token') return;
      console.error('[loadList]', e);
      window.showToast && window.showToast('목록 로드 실패: ' + e.message, 'error');
      listTbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><i class="ph-light ph-warning"></i><h3>로딩 실패</h3><p>${window.escapeHtml(e.message)}</p></div></td></tr>`;
    }
  }

  function updateSummary() {
    const ss = STATE.students;
    sumTotal.textContent = ss.length;
    sumG3.textContent = ss.filter(s => s.grade === '3').length;
    sumGN.textContent = ss.filter(s => s.grade === 'N').length;
    sumG2.textContent = ss.filter(s => s.grade === '2').length;
  }

  // ────────────────────────────────────────────────
  // 등록 목록 렌더 (필터·검색)
  // ────────────────────────────────────────────────
  function getFiltered() {
    const term = STATE.searchTerm.trim().toLowerCase();
    return STATE.students.filter(s => {
      if (STATE.gradeFilter !== 'all' && s.grade !== STATE.gradeFilter) return false;
      if (term) {
        const hay = `${s.student_name || ''} ${s.school_name || ''}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    }).sort((a, b) => (a.student_name || '').localeCompare(b.student_name || '', 'ko'));
  }

  function renderList() {
    const list = getFiltered();
    resultCount.textContent = `${list.length} / 총 ${STATE.students.length}`;
    if (STATE.students.length === 0) {
      listTbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><i class="ph-light ph-users"></i><h3>${STATE.year}학년도 등록된 학생이 없습니다</h3><p>위에서 학생을 추가해주세요.</p></div></td></tr>`;
      return;
    }
    if (list.length === 0) {
      listTbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><i class="ph-light ph-funnel"></i><h3>조건에 맞는 학생이 없습니다</h3></div></td></tr>`;
      return;
    }
    listTbody.innerHTML = list.map(s => `
      <tr data-id="${s.student_id}">
        <td><span class="student-name" data-field="student_name">${window.escapeHtml(s.student_name || '')}</span></td>
        <td data-field="school_name">${window.escapeHtml(s.school_name || '')}</td>
        <td data-field="phone_number">${window.escapeHtml(s.phone_number || '')}</td>
        <td class="center" data-field="phone_owner">${window.escapeHtml(s.phone_owner || '학생')}</td>
        <td class="center" data-field="grade">${gradeBadge(s.grade)}</td>
        <td class="center" data-field="gender"><span class="gender-chip">${window.escapeHtml(s.gender || '')}</span></td>
        <td>
          <div class="actions-cell">
            <button type="button" class="btn btn-ghost btn-sm btn-icon edit-btn" aria-label="수정"><i class="ph-light ph-pencil-simple"></i></button>
            <button type="button" class="btn btn-danger btn-sm btn-icon delete-btn" aria-label="삭제"><i class="ph-light ph-trash"></i></button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  // 인라인 수정
  function startEdit(tr) {
    const editing = listTbody.querySelector('tr.editing');
    if (editing && editing !== tr) {
      window.showToast && window.showToast('먼저 다른 학생의 수정을 완료/취소하세요', 'error');
      return;
    }
    tr.classList.add('editing');
    const id = tr.dataset.id;
    const cur = STATE.students.find(s => s.student_id == id);
    if (!cur) return;
    tr.innerHTML = `
      <td><input type="text" data-field="student_name" value="${window.escapeHtml(cur.student_name || '')}" autocomplete="off" required></td>
      <td><input type="text" data-field="school_name" value="${window.escapeHtml(cur.school_name || '')}" autocomplete="off"></td>
      <td><input type="text" data-field="phone_number" value="${window.escapeHtml(cur.phone_number || '')}" autocomplete="off"></td>
      <td><select data-field="phone_owner">
        <option value="학생" ${cur.phone_owner === '학부모' ? '' : 'selected'}>학생</option>
        <option value="학부모" ${cur.phone_owner === '학부모' ? 'selected' : ''}>학부모</option>
      </select></td>
      <td><select data-field="grade">
        <option value="3" ${cur.grade === '3' ? 'selected' : ''}>3</option>
        <option value="N" ${cur.grade === 'N' ? 'selected' : ''}>N</option>
        <option value="2" ${cur.grade === '2' ? 'selected' : ''}>2</option>
      </select></td>
      <td><select data-field="gender">
        <option value="남" ${cur.gender === '여' ? '' : 'selected'}>남</option>
        <option value="여" ${cur.gender === '여' ? 'selected' : ''}>여</option>
      </select></td>
      <td>
        <div class="actions-cell">
          <button type="button" class="btn btn-success btn-sm btn-icon save-btn" aria-label="저장"><i class="ph-light ph-check"></i></button>
          <button type="button" class="btn btn-ghost btn-sm btn-icon cancel-btn" aria-label="취소"><i class="ph-light ph-x"></i></button>
        </div>
      </td>
    `;
    tr.dataset.id = id;
  }

  async function saveEdit(tr) {
    const id = tr.dataset.id;
    const get = (f) => tr.querySelector(`[data-field="${f}"]`).value.trim();
    const data = {
      student_name: get('student_name'),
      school_name: get('school_name') || null,
      phone_number: get('phone_number') || null,
      phone_owner: get('phone_owner'),
      grade: get('grade'),
      gender: get('gender'),
    };
    if (!data.student_name) {
      window.showToast && window.showToast('학생 이름은 필수입니다', 'error');
      return;
    }
    try {
      const r = await window.api(`/jungsi/students/update/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      if (!r || !r.success) throw new Error((r && r.message) || '수정 실패');
      // 캐시 갱신
      const idx = STATE.students.findIndex(s => s.student_id == id);
      if (idx >= 0) STATE.students[idx] = { ...STATE.students[idx], ...data };
      window.showToast && window.showToast('수정되었습니다', 'success');
      updateSummary();
      renderList();
    } catch (e) {
      if (e.message === 'auth' || e.message === 'no-token') return;
      window.showToast && window.showToast('수정 실패: ' + e.message, 'error');
    }
  }

  async function deleteRow(tr) {
    const id = tr.dataset.id;
    const cur = STATE.students.find(s => s.student_id == id);
    const name = cur?.student_name || '';
    if (!confirm(`'${name}' 학생을 삭제할까요?\n관련된 모든 데이터(성적, 상담 등)가 함께 삭제됩니다.`)) return;
    try {
      const r = await window.api(`/jungsi/students/delete/${id}`, { method: 'DELETE' });
      if (!r || !r.success) throw new Error((r && r.message) || '삭제 실패');
      STATE.students = STATE.students.filter(s => s.student_id != id);
      window.showToast && window.showToast('삭제되었습니다', 'success');
      updateSummary();
      renderList();
    } catch (e) {
      if (e.message === 'auth' || e.message === 'no-token') return;
      window.showToast && window.showToast('삭제 실패: ' + e.message, 'error');
    }
  }

  listTbody.addEventListener('click', e => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    if (e.target.closest('.edit-btn')) startEdit(tr);
    else if (e.target.closest('.delete-btn')) deleteRow(tr);
    else if (e.target.closest('.save-btn')) saveEdit(tr);
    else if (e.target.closest('.cancel-btn')) renderList();
  });

  // ────────────────────────────────────────────────
  // 학생 추가 — 입력 행
  // ────────────────────────────────────────────────
  function addInputRow(preset = {}) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="text" name="student_name" placeholder="홍길동" value="${window.escapeHtml(preset.student_name || '')}" autocomplete="off" required></td>
      <td><input type="text" name="school_name" placeholder="맥스고" value="${window.escapeHtml(preset.school_name || '')}" autocomplete="off"></td>
      <td><input type="text" name="phone_number" placeholder="010-1234-5678" value="${window.escapeHtml(preset.phone_number || '')}" autocomplete="off"></td>
      <td><select name="phone_owner">
        <option value="학생" ${preset.phone_owner === '학부모' ? '' : 'selected'}>학생</option>
        <option value="학부모" ${preset.phone_owner === '학부모' ? 'selected' : ''}>학부모</option>
      </select></td>
      <td><select name="grade">
        <option value="3" ${preset.grade === '3' || !preset.grade ? 'selected' : ''}>3</option>
        <option value="N" ${preset.grade === 'N' ? 'selected' : ''}>N</option>
        <option value="2" ${preset.grade === '2' ? 'selected' : ''}>2</option>
      </select></td>
      <td><select name="gender">
        <option value="남" ${preset.gender === '여' ? '' : 'selected'}>남</option>
        <option value="여" ${preset.gender === '여' ? 'selected' : ''}>여</option>
      </select></td>
      <td>
        <button type="button" class="btn btn-ghost btn-sm btn-icon row-del" aria-label="행 삭제"><i class="ph-light ph-x"></i></button>
      </td>
    `;
    tr.querySelector('.row-del').addEventListener('click', () => tr.remove());
    // ⭐ 이름 칸 paste — 멀티라인 → 자동 분리
    const nameInput = tr.querySelector('input[name="student_name"]');
    nameInput.addEventListener('paste', e => {
      const txt = e.clipboardData.getData('text');
      if (/[\r\n]/.test(txt)) {
        e.preventDefault();
        handleBulkPaste(txt, tr);
      }
    });
    addTbody.appendChild(tr);
    return tr;
  }

  function handleBulkPaste(rawText, firstTr) {
    const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (!lines.length) return;
    const rows = lines.map(line => {
      let cols = line.split('\t');
      if (cols.length === 1) cols = line.split(',');
      cols = cols.map(v => v.trim());
      return {
        student_name: cols[0] || '',
        school_name: cols[1] || '',
        phone_number: cols[2] || '',
        phone_owner: cols[3] || '학생',
        grade: cols[4] || '3',
        gender: cols[5] || '남',
      };
    }).filter(r => r.student_name);
    if (!rows.length) return;
    fillRow(firstTr, rows[0]);
    for (let i = 1; i < rows.length; i++) addInputRow(rows[i]);
    window.showToast && window.showToast(`${rows.length}명 입력 완료. "명단 추가"를 눌러주세요`, 'info');
  }

  function fillRow(tr, p) {
    const set = (n, v) => { const el = tr.querySelector(`[name="${n}"]`); if (el) el.value = v; };
    set('student_name', p.student_name || '');
    set('school_name', p.school_name || '');
    set('phone_number', p.phone_number || '');
    set('phone_owner', p.phone_owner || '학생');
    set('grade', p.grade || '3');
    set('gender', p.gender || '남');
  }

  // 명단 일괄 추가
  async function bulkAdd() {
    const rows = addTbody.querySelectorAll('tr');
    if (!rows.length) {
      window.showToast && window.showToast('추가할 학생을 입력해주세요', 'error');
      return;
    }
    const studentsToAdd = [];
    let invalidName = false;
    rows.forEach(tr => {
      const get = (n) => tr.querySelector(`[name="${n}"]`)?.value.trim() || '';
      const name = get('student_name');
      const nameInput = tr.querySelector('[name="student_name"]');
      if (!name) {
        invalidName = true;
        if (nameInput) nameInput.classList.add('invalid');
        return;
      }
      if (nameInput) nameInput.classList.remove('invalid');
      studentsToAdd.push({
        student_name: name,
        school_name: get('school_name') || null,
        phone_number: get('phone_number') || null,
        phone_owner: get('phone_owner') || '학생',
        grade: get('grade') || '3',
        gender: get('gender') || '남',
      });
    });
    if (invalidName) {
      window.showToast && window.showToast('학생 이름은 필수입니다', 'error');
      return;
    }
    if (!studentsToAdd.length) {
      window.showToast && window.showToast('추가할 유효한 학생이 없습니다', 'error');
      return;
    }
    // 중복 이름 confirm
    const dups = studentsToAdd
      .map(s => s.student_name)
      .filter(n => STATE.students.some(e => e.student_name === n));
    if (dups.length) {
      const uniq = [...new Set(dups)];
      if (!confirm(`이미 등록된 이름이 있습니다:\n[ ${uniq.join(', ')} ]\n그래도 추가할까요? (동명이인 가능)`)) return;
    }

    bulkAddBtn.disabled = true;
    const origLabel = bulkAddBtn.innerHTML;
    bulkAddBtn.innerHTML = '<i class="ph-light ph-circle-notch spin"></i> 추가 중…';
    try {
      const r = await window.api('/jungsi/students/bulk-add', {
        method: 'POST',
        body: JSON.stringify({ 학년도: STATE.year, students: studentsToAdd }),
      });
      if (!r || !r.success) throw new Error((r && r.message) || '추가 실패');
      const inserted = r.insertedCount || 0;
      const errs = r.errors?.length || 0;
      const msg = errs > 0 ? `${inserted}명 추가 (${errs}명 오류)` : `${inserted}명 추가 완료`;
      window.showToast && window.showToast(msg, errs > 0 ? 'error' : 'success');
      addTbody.innerHTML = '';
      addInputRow();
      loadList();
    } catch (e) {
      if (e.message === 'auth' || e.message === 'no-token') return;
      window.showToast && window.showToast('추가 실패: ' + e.message, 'error');
    } finally {
      bulkAddBtn.disabled = false;
      bulkAddBtn.innerHTML = origLabel;
    }
  }

  // ────────────────────────────────────────────────
  // 이벤트 + 초기화
  // ────────────────────────────────────────────────
  // year/gradeFilter combobox 는 onChange 로 처리
  searchInput.addEventListener('input', window.debounce(() => {
    STATE.searchTerm = searchInput.value;
    renderList();
  }, 200));
  addRowBtn.addEventListener('click', () => addInputRow());
  bulkAddBtn.addEventListener('click', bulkAdd);

  STATE.year = yearSel.value || '2027';
  setBranchLabel();
  // OS별 paste 키 표기 (utils.isMac)
  const pasteKeyEl = document.getElementById('pasteKey');
  if (pasteKeyEl) pasteKeyEl.textContent = (window.isMac && window.isMac()) ? '⌘V' : 'Ctrl+V';
  addInputRow();
  loadList();
})();
