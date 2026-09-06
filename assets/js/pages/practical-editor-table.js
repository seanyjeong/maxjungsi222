(function () {
  'use strict';
  window.createPracticalTableEditor = function ({ element, meta, api, toast }) {
    const saveButton = document.getElementById('savePracticalEdits');
    const status = document.getElementById('practicalEditStatus');
    const isAdmin = window.getCounselorFromToken?.().userid === 'admin';
    const esc = window.escapeHtml;
    let rows = [], context = null, saving = false;
    const drafts = new Map();

    function updateStatus() {
      saveButton.disabled = !isAdmin || !drafts.size || saving;
      status.textContent = !isAdmin ? '기존 배점표 수정은 본원 관리자만 가능합니다.'
        : saving ? '저장한 값을 확인하고 있습니다…'
          : drafts.size ? `${drafts.size}건 수정됨 · 아직 저장하지 않았습니다` : '변경사항 없음';
    }

    function cell(row, field) {
      const value = esc(row[field] == null ? '' : String(row[field]));
      return isAdmin ? `<input class="practical-edit-input" data-field="${field}" value="${value}"
        aria-label="${esc(row.종목명)} ${esc(row.성별)} ${row.id} ${field}" maxlength="50" required>` : value;
    }

    function render() {
      const groups = new Map();
      rows.forEach(row => {
        const name = row.종목명 || '';
        if (!groups.has(name)) groups.set(name, { 남: [], 여: [] });
        groups.get(name)[['여', 'F'].includes(row.성별) ? '여' : '남'].push(row);
      });
      const female = rows.filter(row => ['여', 'F'].includes(row.성별)).length;
      meta.textContent = `${groups.size} 종목 · ${rows.length} 건 (남 ${rows.length - female} · 여 ${female})`;
      const miniTable = (items, gender) => `<div class="mini-card">
        <div class="mini-head"><span>${gender}</span><em>${items.length}</em></div>
        <div class="mini-wrap"><table class="silgi-table">
          <colgroup><col style="width:60px"><col><col><col style="width:48px"></colgroup>
          <thead><tr><th>ID</th><th>기록</th><th>배점</th><th>삭제</th></tr></thead>
          <tbody>${items.length ? items.map(row => `<tr data-id="${row.id}">
            <td class="col-id">${row.id}</td><td>${cell(row, '기록')}</td><td>${cell(row, '배점')}</td>
            <td><button type="button" class="btn-row-del" data-action="delete" data-id="${row.id}"
              aria-label="${esc(row.종목명)} ${esc(row.성별)} ${row.id} 삭제"><i class="ph-light ph-trash"></i></button></td>
          </tr>`).join('') : '<tr><td colspan="4" class="empty-mini">—</td></tr>'}</tbody>
        </table></div></div>`;
      element.innerHTML = rows.length ? [...groups].map(([name, group]) => `
        <section class="score-section" data-event="${esc(name)}">
          <header class="section-head"><div class="section-title"><i class="ph-light ph-barbell"></i>
            ${isAdmin ? `<input class="practical-event-input" aria-label="종목명 수정" data-field="종목명"
              value="${esc(name)}" maxlength="100" required>` : esc(name || '(미지정)')}
          </div><div class="section-meta">남 ${group.남.length} · 여 ${group.여.length}</div></header>
          <div class="section-grid">${miniTable(group.남, '남')}${miniTable(group.여, '여')}</div>
        </section>`).join('') : '<div class="empty-state-big"><h3>데이터가 없습니다. 아래에서 추가하세요.</h3></div>';
      updateStatus();
    }

    element.addEventListener('input', event => {
      const input = event.target.closest('input[data-field]');
      if (!input || !isAdmin || saving) return;
      const field = input.dataset.field;
      const targets = field === '종목명'
        ? rows.filter(row => (row.종목명 || '') === input.closest('[data-event]').dataset.event)
        : rows.filter(row => Number(row.id) === Number(input.closest('[data-id]').dataset.id));
      targets.forEach(row => {
        const draft = drafts.get(Number(row.id)) || { id: Number(row.id) };
        if (String(row[field] ?? '') === input.value) delete draft[field];
        else draft[field] = input.value;
        if (Object.keys(draft).length > 1) drafts.set(draft.id, draft);
        else drafts.delete(draft.id);
      });
      updateStatus();
    });

    saveButton.addEventListener('click', async () => {
      if (saving || !isAdmin || !context || !drafts.size) return;
      const invalid = [...element.querySelectorAll('input')].find(input => {
        const id = Number(input.closest('[data-id]')?.dataset.id);
        const changed = input.dataset.field === '종목명'
          ? [...drafts.values()].some(draft => Object.hasOwn(draft, '종목명'))
          : Object.hasOwn(drafts.get(id) || {}, input.dataset.field);
        return changed && (!input.value.trim() || !input.checkValidity());
      });
      if (invalid) {
        invalid.focus();
        toast('종목명·기록·배점을 빠짐없이 입력해 주세요.', 'error');
        return;
      }
      saving = true;
      const controls = [...element.querySelectorAll('input,button')];
      controls.forEach(control => { control.disabled = true; });
      saveButton.setAttribute('aria-busy', 'true');
      updateStatus();
      try {
        const count = drafts.size;
        rows = await window.PracticalSave.saveChanges(api, context.uid, context.year, [...drafts.values()]);
        drafts.clear();
        render();
        toast(`${count}건 수정 저장 완료`, 'success');
      } catch (error) {
        if (!['auth', 'no-token'].includes(error.message)) {
          toast(error.message === window.PracticalSave.VERIFY_ERROR
            ? window.PracticalSave.VERIFY_ERROR : window.PracticalSave.SAVE_ERROR, 'error');
        }
      } finally {
        saving = false;
        controls.forEach(control => { control.disabled = false; });
        saveButton.removeAttribute('aria-busy');
        updateStatus();
      }
    });

    window.addEventListener('beforeunload', event => {
      if (drafts.size) { event.preventDefault(); event.returnValue = ''; }
    });
    updateStatus();
    return {
      mount(nextRows, nextContext) { rows = nextRows; context = nextContext; drafts.clear(); render(); },
      reset() { rows = []; context = null; drafts.clear(); updateStatus(); },
      canLeave() {
        if (saving) { toast('저장이 끝난 뒤 이동해 주세요.', 'info'); return false; }
        return !drafts.size || confirm('저장하지 않은 수정사항이 있습니다. 변경을 버리고 계속할까요?');
      },
    };
  };
})();
