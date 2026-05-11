/* ============================================================ */
/* cut_editor.new.js — 정시컷 편집                                */
/* 권한: 지점 원장 = 지점컷, admin = 맥스컷                       */
/* API: GET /jungsi/cutoffs/{year}, POST /jungsi/cutoffs/set      */
/* ============================================================ */
'use strict';

(function () {
  const sumYear = document.getElementById('sumYear');
  const sumTotal = document.getElementById('sumTotal');
  const sumGun = document.getElementById('sumGun');
  const sumDone = document.getElementById('sumDone');
  const sumDoneSub = document.getElementById('sumDoneSub');
  const sumPending = document.getElementById('sumPending');
  const sumPendingSub = document.getElementById('sumPendingSub');

  const gunButtons = document.getElementById('gunButtons');
  const searchInput = document.getElementById('searchInput');
  const resultCount = document.getElementById('resultCount');
  const tbody = document.getElementById('tbody');
  const saveBtn = document.getElementById('saveBtn');
  const dirtyCountEl = document.getElementById('dirtyCount');
  const roleBadge = document.getElementById('roleBadge');
  const roleLabel = document.getElementById('roleLabel');
  const hintText = document.getElementById('hintText');

  const thPastCut = document.getElementById('thPastCut');

  const STATE = {
    year: '2027',
    rows: [],
    filterGun: 'all',
    searchTerm: '',
    isAdmin: false,
    pastCutField: '25년총점컷', // '25년총점컷' | '26년총점컷'
  };

  // U_ID -> { 지점_수능컷, 지점_총점컷, 맥스_수능컷, 맥스_총점컷, '25년총점컷', '26년총점컷' }
  const dirty = new Map();

  function detectAdmin() {
    try {
      const token = window.getToken && window.getToken();
      if (!token) return false;
      const seg = token.split('.')[1];
      const padded = seg.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - seg.length % 4) % 4);
      const json = decodeURIComponent(Array.prototype.map.call(atob(padded), c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
      const payload = JSON.parse(json);
      return payload?.userid === 'admin';
    } catch (e) { return false; }
  }

  function setRoleBadge() {
    if (STATE.isAdmin) {
      roleBadge.classList.add('is-admin');
      roleLabel.textContent = '본원 관리자';
      hintText.innerHTML = '<b>본원 관리자</b>입니다. 맥스 수능컷·총점컷·과거 총점컷(25·26년)을 수정할 수 있습니다.';
    } else {
      roleBadge.classList.remove('is-admin');
      const branch = (window.getCounselorFromToken && window.getCounselorFromToken().branch) || '지점';
      roleLabel.textContent = branch + ' 원장';
      hintText.innerHTML = '<b>지점 원장</b>은 지점 수능컷·총점컷만 수정 가능합니다. 맥스컷은 본원 관리자만 수정.';
    }
  }

  async function load() {
    const year = STATE.year;
    sumYear.textContent = year;
    tbody.innerHTML = `<tr><td colspan="11"><div class="empty-state"><i class="ph-light ph-circle-notch spin"></i><h3>${year}학년도 컷 불러오는 중…</h3></div></td></tr>`;
    dirty.clear();
    updateDirtyBadge();
    try {
      const r = await window.api(`/jungsi/cutoffs/${year}`);
      if (!r || !r.success) throw new Error((r && r.message) || '컷 로딩 실패');
      STATE.rows = (r.cutoffs || []).map(it => ({
        U_ID: it.U_ID,
        univ: it.대학명 || '',
        dept: it.학과명 || '',
        gun: (it.군 || '').replace(/군$/, ''),
        tags: it.tags || null,
        모집인원: it.모집인원,
        모집인원_prev: it.모집인원_prev,
        수능비율: it.수능비율,
        내신비율: it.내신비율,
        실기비율: it.실기비율,
        지점_수능컷: it.지점_수능컷,
        지점_총점컷: it.지점_총점컷,
        맥스_수능컷: it.맥스_수능컷,
        맥스_총점컷: it.맥스_총점컷,
        '25년총점컷': it['25년총점컷'],
        '26년총점컷': it['26년총점컷'],
      }));
      updateSummary();
      render();
    } catch (e) {
      if (e.message === 'auth' || e.message === 'no-token') return;
      console.error('[load]', e);
      tbody.innerHTML = `<tr><td colspan="11"><div class="empty-state"><i class="ph-light ph-warning"></i><h3>로딩 실패</h3><p>${window.escapeHtml(e.message)}</p></div></td></tr>`;
      window.showToast && window.showToast('컷 로드 실패: ' + e.message, 'error');
    }
  }

  function updateSummary() {
    const n = STATE.rows.length;
    sumTotal.textContent = n;
    const gunCount = { '가': 0, '나': 0, '다': 0 };
    let done = 0;
    STATE.rows.forEach(r => {
      if (gunCount[r.gun] != null) gunCount[r.gun]++;
      if (STATE.isAdmin) {
        if (r.맥스_수능컷 != null && r.맥스_수능컷 !== '') done++;
      } else {
        if (r.지점_수능컷 != null && r.지점_수능컷 !== '') done++;
      }
    });
    sumGun.textContent = `${gunCount['가']} · ${gunCount['나']} · ${gunCount['다']}`;
    sumDone.textContent = done;
    sumDoneSub.textContent = n > 0 ? `${Math.round((done / n) * 100)} %` : '— %';
    sumPending.textContent = n - done;
    sumPendingSub.textContent = STATE.isAdmin ? '맥스 수능컷 비어있음' : '지점 수능컷 비어있음';
  }

  function getFiltered() {
    const term = STATE.searchTerm.trim().toLowerCase();
    const gunOrder = { '가': 0, '나': 1, '다': 2, '': 3 };
    return STATE.rows
      .filter(r => {
        if (STATE.filterGun !== 'all' && r.gun !== STATE.filterGun) return false;
        if (term) {
          const hay = `${r.univ} ${r.dept}`.toLowerCase();
          if (!hay.includes(term)) return false;
        }
        return true;
      })
      .sort((a, b) => (gunOrder[a.gun] - gunOrder[b.gun]) || a.univ.localeCompare(b.univ, 'ko') || a.dept.localeCompare(b.dept, 'ko'));
  }

  function pct(v) { return (v != null && v !== '') ? `${v}%` : '<span class="dim">—</span>'; }
  function num(v) { return (v != null && v !== '') ? v : '<span class="dim">—</span>'; }

  function inputCell(field, value) {
    return `<input type="number" step="0.01" class="cut-input" data-field="${field}" value="${value != null && value !== '' ? value : ''}" placeholder="—">`;
  }
  function readonlyCell(value) {
    return `<span class="cut-readonly">${value != null && value !== '' ? value : '—'}</span>`;
  }

  function render() {
    const list = getFiltered();
    resultCount.textContent = `${list.length} / 총 ${STATE.rows.length}`;
    if (STATE.rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="11"><div class="empty-state"><i class="ph-light ph-table"></i><h3>${STATE.year}학년도 컷 데이터가 없습니다</h3></div></td></tr>`;
      return;
    }
    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="11"><div class="empty-state"><i class="ph-light ph-funnel"></i><h3>조건에 맞는 학과가 없습니다</h3></div></td></tr>`;
      return;
    }
    const isAdmin = STATE.isAdmin;
    tbody.innerHTML = list.map(r => `
      <tr data-uid="${r.U_ID}">
        <td class="uni-dept">
          <div class="univ-name">${window.escapeHtml(r.univ)}${(window.renderSchoolTags && window.renderSchoolTags(r.tags)) || ''}</div>
          <div class="dept-name">${window.escapeHtml(r.dept)}</div>
        </td>
        <td><span class="gun-chip gun-${r.gun}">${window.escapeHtml(r.gun || '—')}</span></td>
        <td style="white-space:nowrap">${(window.formatQuotaValue && window.formatQuotaValue(r.모집인원)) || num(r.모집인원)}${(window.formatQuotaDiff && window.formatQuotaDiff(r.모집인원, r.모집인원_prev)) || ''}</td>
        <td class="pct">${pct(r.수능비율)}</td>
        <td class="pct">${pct(r.내신비율)}</td>
        <td class="pct">${pct(r.실기비율)}</td>
        <td>${isAdmin ? readonlyCell(r.지점_수능컷) : inputCell('지점_수능컷', r.지점_수능컷)}</td>
        <td>${isAdmin ? readonlyCell(r.지점_총점컷) : inputCell('지점_총점컷', r.지점_총점컷)}</td>
        <td>${isAdmin ? inputCell('맥스_수능컷', r.맥스_수능컷) : readonlyCell(r.맥스_수능컷)}</td>
        <td>${isAdmin ? inputCell('맥스_총점컷', r.맥스_총점컷) : readonlyCell(r.맥스_총점컷)}</td>
        <td>${isAdmin ? inputCell(STATE.pastCutField, r[STATE.pastCutField]) : readonlyCell(r[STATE.pastCutField])}</td>
      </tr>
    `).join('');
  }

  function markDirty(uid, field, value) {
    const cur = dirty.get(uid) || { U_ID: uid };
    cur[field] = value;
    dirty.set(uid, cur);
    const tr = tbody.querySelector(`tr[data-uid="${uid}"]`);
    if (tr) tr.classList.add('dirty');
    updateDirtyBadge();
  }

  function updateDirtyBadge() {
    const n = dirty.size;
    if (n > 0) {
      saveBtn.disabled = false;
      dirtyCountEl.textContent = n;
      dirtyCountEl.style.display = '';
    } else {
      saveBtn.disabled = true;
      dirtyCountEl.style.display = 'none';
    }
  }

  tbody.addEventListener('input', e => {
    if (!e.target.classList.contains('cut-input')) return;
    const tr = e.target.closest('tr[data-uid]');
    if (!tr) return;
    const uid = parseInt(tr.dataset.uid, 10);
    const field = e.target.dataset.field;
    markDirty(uid, field, e.target.value);
  });
  tbody.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || !e.target.classList.contains('cut-input')) return;
    e.preventDefault();
    const inputs = Array.from(tbody.querySelectorAll('.cut-input'));
    const i = inputs.indexOf(e.target);
    const next = inputs[i + 1];
    if (next) { next.focus(); next.select(); }
  });
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

  saveBtn.addEventListener('click', async () => {
    if (dirty.size === 0) return;
    const updates = [...dirty.values()];
    saveBtn.disabled = true;
    const orig = saveBtn.innerHTML;
    saveBtn.innerHTML = '<i class="ph-light ph-circle-notch spin"></i> 저장 중…';
    try {
      const r = await window.api('/jungsi/cutoffs/set', {
        method: 'POST',
        body: JSON.stringify({ year: STATE.year, updates }),
      });
      if (!r || !r.success) throw new Error((r && r.message) || '저장 실패');
      updates.forEach(u => {
        const item = STATE.rows.find(r => r.U_ID === u.U_ID);
        if (item) Object.entries(u).forEach(([k, v]) => {
          if (k === 'U_ID') return;
          item[k] = v === '' ? null : Number(v);
        });
      });
      tbody.querySelectorAll('tr.dirty').forEach(tr => tr.classList.remove('dirty'));
      dirty.clear();
      updateDirtyBadge();
      updateSummary();
      window.showToast && window.showToast(`${updates.length}건 저장 완료`, 'success');
      saveBtn.innerHTML = orig;
    } catch (e) {
      if (e.message === 'auth' || e.message === 'no-token') return;
      window.showToast && window.showToast('저장 실패: ' + e.message, 'error');
      saveBtn.disabled = false;
      saveBtn.innerHTML = orig;
    }
  });

  window.addEventListener('beforeunload', e => {
    if (dirty.size > 0) { e.preventDefault(); e.returnValue = ''; }
  });

  STATE.isAdmin = detectAdmin();
  setRoleBadge();

  const pastCutCombo = window.createCombobox(document.getElementById('pastCutSel'), {
    options: [
      { value: '26년총점컷', label: '26년 총점컷' },
      { value: '25년총점컷', label: '25년 총점컷' },
    ],
    value: '26년총점컷', searchable: false,
    onChange: (v) => {
      STATE.pastCutField = v;
      thPastCut.textContent = v === '26년총점컷' ? '26년 총점컷' : '25년 총점컷';
      render();
    },
  });
  STATE.pastCutField = pastCutCombo.value || '26년총점컷';
  thPastCut.textContent = STATE.pastCutField === '26년총점컷' ? '26년 총점컷' : '25년 총점컷';

  const yearCombo = window.createCombobox(document.getElementById('yearSel'), {
    options: [{ value: '2027', label: '2027학년도' }, { value: '2026', label: '2026학년도' }],
    value: '2027', searchable: false,
    onChange: (v) => {
      if (dirty.size > 0 && !confirm(`저장하지 않은 변경 ${dirty.size}건이 있습니다. 학년도 변경 시 사라집니다. 계속할까요?`)) {
        yearCombo.setValue(STATE.year);
        return;
      }
      STATE.year = v;
      load();
    },
  });
  STATE.year = yearCombo.value || '2027';
  load();
})();
