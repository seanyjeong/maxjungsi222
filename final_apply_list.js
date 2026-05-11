/* ============================================================ */
/* final_apply_list.new.js — 지점 최종 지원 현황 + 실기 일정 입력  */
/* 공통 유틸 (window.api / toast / utils) 의존                    */
/* ============================================================ */
'use strict';

(function () {
  const yearSel = window.createCombobox(document.getElementById('yearSel'), {
    options: [{ value: '2027', label: '2027학년도' }, { value: '2026', label: '2026학년도' }],
    value: '2027',
    searchable: false,
    onChange: (v) => {
      if (dirty.size > 0 && !confirm(`저장하지 않은 변경 ${dirty.size}건이 있습니다. 학년도를 바꾸면 사라집니다. 진행할까요?`)) {
        yearSel.setValue(STATE.year);
        return;
      }
      STATE.year = v;
      loadList();
    },
  });
  const sumYear = document.getElementById('sumYear');
  const sumTotal = document.getElementById('sumTotal');
  const sumGun = document.getElementById('sumGun');
  const sumDone = document.getElementById('sumDone');
  const sumDoneSub = document.getElementById('sumDoneSub');
  const sumPending = document.getElementById('sumPending');

  const gunButtons = document.getElementById('gunButtons');
  const searchInput = document.getElementById('searchInput');
  const sortSel = window.createCombobox(document.getElementById('sortSel'), {
    options: [
      { value: 'student', label: '학생명 가나다' },
      { value: 'gun', label: '군 · 대학' },
      { value: 'date', label: '실기 날짜 빠른 순' },
      { value: 'pending', label: '미입력 먼저' },
    ],
    value: 'student',
    searchable: false,
    onChange: (v) => { STATE.sort = v; render(); },
  });
  const resultCount = document.getElementById('resultCount');
  const tbody = document.getElementById('tbody');

  const saveAllBtn = document.getElementById('saveAllBtn');
  const dirtyCountEl = document.getElementById('dirtyCount');

  const STATE = {
    year: '2027',
    rows: [],
    filterGun: 'all',
    searchTerm: '',
    sort: 'student',
  };

  const dirty = new Set();          // applyId set
  const pending = new Map();        // applyId → { 실기날짜, 실기시간 }

  // ── 날짜 포맷 (DB 가 ISO UTC 또는 "YYYY-MM-DD" 로 보낼 수 있음) ──
  function formatDate(value) {
    if (!value) return '';
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const d = new Date(value);
    if (isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function gunClass(gun) {
    if (gun === '가') return 'ga';
    if (gun === '나') return 'na';
    if (gun === '다') return 'da';
    return '';
  }

  // ── 데이터 로딩 ──
  async function loadList() {
    const year = STATE.year;
    sumYear.textContent = year;
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><i class="ph-light ph-circle-notch spin"></i><h3>${year}학년도 지원 목록 불러오는 중…</h3></div></td></tr>`;
    dirty.clear();
    pending.clear();
    updateDirtyBadge();

    try {
      const res = await window.api(`/jungsi/branch-final-applies/${year}`);
      if (!res || !res.success) throw new Error((res && res.message) || '목록 로딩 실패');
      STATE.rows = (res.list || []).map(it => ({
        id: it.최종지원_ID,
        student: it.student_name || '',
        univ: it.대학명 || '',
        dept: it.학과명 || '',
        tags: it.tags || null,
        gun: (it.모집군 || '').replace(/군$/, ''),
        date: formatDate(it.실기날짜),
        time: it.실기시간 || '',
      }));
      updateSummary();
      render();
    } catch (e) {
      if (e.message === 'auth' || e.message === 'no-token') return;
      console.error('[loadList]', e);
      tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><i class="ph-light ph-warning"></i><h3>로딩 실패</h3><p>${window.escapeHtml(e.message)}</p></div></td></tr>`;
      window.showToast && window.showToast('지원 목록 로드 실패: ' + e.message, 'error');
    }
  }

  // ── 요약 ──
  function updateSummary() {
    const total = STATE.rows.length;
    sumTotal.textContent = total;

    const gunCount = { '가': 0, '나': 0, '다': 0 };
    let done = 0;
    STATE.rows.forEach(r => {
      if (gunCount[r.gun] != null) gunCount[r.gun]++;
      if (r.date) done++;
    });
    sumGun.textContent = `${gunCount['가']} · ${gunCount['나']} · ${gunCount['다']}`;
    sumDone.textContent = done;
    sumDoneSub.textContent = total > 0 ? `${Math.round((done / total) * 100)} %` : '— %';
    sumPending.textContent = total - done;
  }

  // ── 필터 + 정렬 ──
  function getFiltered() {
    const term = STATE.searchTerm.trim().toLowerCase();
    let list = STATE.rows.filter(r => {
      if (STATE.filterGun !== 'all' && r.gun !== STATE.filterGun) return false;
      if (term) {
        const hay = `${r.student} ${r.univ} ${r.dept}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
    const gunOrder = { '가': 0, '나': 1, '다': 2, '': 3 };
    switch (STATE.sort) {
      case 'gun':
        list.sort((a, b) => (gunOrder[a.gun] - gunOrder[b.gun]) || a.univ.localeCompare(b.univ, 'ko') || a.dept.localeCompare(b.dept, 'ko'));
        break;
      case 'date':
        list.sort((a, b) => {
          if (!a.date && !b.date) return a.student.localeCompare(b.student, 'ko');
          if (!a.date) return 1;
          if (!b.date) return -1;
          return (
            a.date.localeCompare(b.date)
            || a.time.localeCompare(b.time)
            || a.univ.localeCompare(b.univ, 'ko')
            || a.dept.localeCompare(b.dept, 'ko')
            || a.student.localeCompare(b.student, 'ko')
          );
        });
        break;
      case 'pending':
        list.sort((a, b) => {
          const ap = a.date ? 1 : 0, bp = b.date ? 1 : 0;
          return ap - bp || a.student.localeCompare(b.student, 'ko');
        });
        break;
      case 'student':
      default:
        list.sort((a, b) => a.student.localeCompare(b.student, 'ko') || (gunOrder[a.gun] - gunOrder[b.gun]));
        break;
    }
    return list;
  }

  // ── 렌더 ──
  function render() {
    const list = getFiltered();
    resultCount.textContent = `${list.length} / 총 ${STATE.rows.length}`;
    if (STATE.rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><i class="ph-light ph-clipboard-text"></i><h3>${STATE.year}학년도 최종 지원 내역이 없습니다</h3><p>상담 페이지에서 학생별 최종 지원을 확정하면 여기에 나타납니다.</p></div></td></tr>`;
      return;
    }
    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><i class="ph-light ph-funnel"></i><h3>조건에 맞는 항목이 없습니다</h3><p>필터/검색을 조정해 주세요.</p></div></td></tr>`;
      return;
    }

    const html = list.map(r => {
      const safeStudent = window.escapeHtml(r.student);
      const safeUniv = window.escapeHtml(r.univ);
      const safeDept = window.escapeHtml(r.dept);
      const isDirty = dirty.has(r.id);
      return `
        <tr data-id="${r.id}" class="${isDirty ? 'dirty' : ''}">
          <td>${safeStudent || '<span style="color:var(--text-3)">—</span>'}</td>
          <td class="uni-dept">
            <div class="univ-name">${safeUniv}${(window.renderSchoolTags && window.renderSchoolTags(r.tags)) || ''}</div>
            <div class="dept-name">${safeDept}</div>
          </td>
          <td>${r.gun ? `<span class="gun-dot ${gunClass(r.gun)}">${r.gun}</span>` : '—'}</td>
          <td><input type="date" class="cell-input cell-date" value="${r.date}"></td>
          <td><input type="text" class="cell-input cell-time" value="${window.escapeHtml(r.time)}" placeholder="HH:MM" maxlength="5"></td>
          <td>
            <button type="button" class="btn-save-row ${isDirty ? 'ready' : ''}" ${isDirty ? '' : 'disabled'}>
              <i class="ph-light ph-floppy-disk"></i> 저장
            </button>
          </td>
        </tr>
      `;
    }).join('');
    tbody.innerHTML = html;
  }

  // ── 행 변경 / 저장 ──
  function markDirty(id, patch) {
    dirty.add(id);
    const prev = pending.get(id) || {};
    pending.set(id, { ...prev, ...patch });
    const tr = tbody.querySelector(`tr[data-id="${id}"]`);
    if (tr) {
      tr.classList.add('dirty');
      const btn = tr.querySelector('.btn-save-row');
      if (btn) {
        btn.classList.add('ready');
        btn.disabled = false;
      }
    }
    updateDirtyBadge();
  }

  function clearDirty(id) {
    dirty.delete(id);
    pending.delete(id);
    const tr = tbody.querySelector(`tr[data-id="${id}"]`);
    if (tr) {
      tr.classList.remove('dirty');
      const btn = tr.querySelector('.btn-save-row');
      if (btn) {
        btn.classList.remove('ready');
        btn.disabled = true;
      }
    }
    updateDirtyBadge();
  }

  function updateDirtyBadge() {
    const n = dirty.size;
    if (n > 0) {
      saveAllBtn.disabled = false;
      saveAllBtn.classList.add('has-active');
      dirtyCountEl.textContent = n;
      dirtyCountEl.style.display = '';
    } else {
      saveAllBtn.disabled = true;
      saveAllBtn.classList.remove('has-active');
      dirtyCountEl.style.display = 'none';
    }
  }

  const TIME_RE = /^\d{2}:\d{2}$/;

  function validateTime(value) {
    if (!value) return true;
    if (!TIME_RE.test(value)) return false;
    const [h, m] = value.split(':').map(Number);
    return h >= 0 && h <= 23 && m >= 0 && m <= 59;
  }

  async function saveOne(id) {
    const row = STATE.rows.find(r => r.id == id);
    if (!row) return false;
    const patch = pending.get(id) || {};
    const date = patch.date != null ? patch.date : row.date;
    const time = patch.time != null ? patch.time : row.time;

    if (time && !validateTime(time)) {
      window.showToast && window.showToast('시간 형식 오류 (HH:MM, 예: 09:30)', 'error');
      return false;
    }

    const tr = tbody.querySelector(`tr[data-id="${id}"]`);
    const btn = tr && tr.querySelector('.btn-save-row');
    if (btn) {
      btn.classList.remove('ready');
      btn.classList.add('saving');
      btn.disabled = true;
      btn.innerHTML = '<i class="ph-light ph-circle-notch spin"></i> 저장중';
    }

    try {
      const res = await window.api('/jungsi/update-apply-schedule', {
        method: 'POST',
        body: JSON.stringify({
          최종지원_ID: id,
          실기날짜: date || null,
          실기시간: time || null,
        }),
      });
      if (!res || !res.success) throw new Error((res && res.message) || '저장 실패');
      row.date = date || '';
      row.time = time || '';
      clearDirty(id);
      if (btn) {
        btn.classList.remove('saving');
        btn.innerHTML = '<i class="ph-light ph-floppy-disk"></i> 저장';
      }
      updateSummary();
      return true;
    } catch (e) {
      if (e.message === 'auth' || e.message === 'no-token') return false;
      console.error('[saveOne]', e);
      window.showToast && window.showToast('저장 실패: ' + e.message, 'error');
      if (btn) {
        btn.classList.remove('saving');
        btn.classList.add('ready');
        btn.disabled = false;
        btn.innerHTML = '<i class="ph-light ph-floppy-disk"></i> 저장';
      }
      return false;
    }
  }

  async function saveAll() {
    const ids = [...dirty];
    if (ids.length === 0) return;
    const origLabel = '변경 전체 저장';
    saveAllBtn.disabled = true;
    setSaveAllLabel('<i class="ph-light ph-circle-notch spin"></i> 저장중…', false);
    let ok = 0, fail = 0;
    for (const id of ids) {
      const r = await saveOne(id);
      r ? ok++ : fail++;
    }
    setSaveAllLabel(`<i class="ph-light ph-floppy-disk"></i> ${origLabel}`, true);
    updateDirtyBadge();
    if (fail === 0) {
      window.showToast && window.showToast(`${ok}건 저장 완료`, 'success');
    } else {
      window.showToast && window.showToast(`저장 ${ok}건 / 실패 ${fail}건`, 'error');
    }
  }

  // dirtyCount span 을 보존한 채 라벨만 갱신
  function setSaveAllLabel(htmlBefore, includeCount) {
    saveAllBtn.innerHTML = htmlBefore;
    if (includeCount) saveAllBtn.appendChild(dirtyCountEl);
  }

  // ── 이벤트 바인딩 ── (year/sort combobox 는 onChange 로 처리)
  gunButtons.addEventListener('click', e => {
    const btn = e.target.closest('.gun-btn');
    if (!btn) return;
    gunButtons.querySelectorAll('.gun-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    STATE.filterGun = btn.dataset.gun;
    render();
  });

  searchInput.addEventListener('input', window.debounce(() => {
    STATE.searchTerm = searchInput.value;
    render();
  }, 200));

  tbody.addEventListener('input', e => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    const id = tr.dataset.id;
    if (e.target.classList.contains('cell-date')) {
      markDirty(id, { date: e.target.value });
    } else if (e.target.classList.contains('cell-time')) {
      const v = e.target.value;
      e.target.classList.toggle('invalid', !!v && !validateTime(v));
      markDirty(id, { time: v });
    }
  });

  tbody.addEventListener('click', e => {
    const btn = e.target.closest('.btn-save-row');
    if (!btn || btn.disabled) return;
    const tr = btn.closest('tr[data-id]');
    if (!tr) return;
    saveOne(tr.dataset.id);
  });

  saveAllBtn.addEventListener('click', saveAll);

  window.addEventListener('beforeunload', e => {
    if (dirty.size > 0) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // ── 초기 ──
  STATE.year = yearSel.value || '2027';
  loadList();
})();
