/* ============================================================ */
/* counseling_by_university_render.js — 학교별 상담 렌더러        */
/* ============================================================ */
'use strict';

(function () {
  function createUniversityCounselRenderer(options) {
    const state = options.state;
    const elements = options.elements;
    const fmtNum = options.formatNumber;
    const getDraft = options.getDraft;
    const esc = () => window.escapeHtml || (value => String(value == null ? '' : value));

    function setCutField(field, value) {
      const el = elements.cutBar.querySelector(`[data-field="${field}"]`);
      if (el) el.textContent = fmtNum(value);
    }

    function renderCutBar(cuts) {
      const { mine, max } = cuts || {};
      if (!mine && !max) {
        elements.cutBar.hidden = true;
        return;
      }
      elements.cutBar.hidden = false;
      setCutField('max-suneung', max && max['수능컷']);
      setCutField('max-total', max && max['총점컷']);
      setCutField('max-25', max && max['25년총점컷']);
      setCutField('max-26', max && max['26년총점컷']);
      setCutField('mine-suneung', mine && mine['수능컷']);
      setCutField('mine-total', mine && mine['총점컷']);
      setCutField('mine-25', mine && mine['25년총점컷']);
      setCutField('mine-26', mine && mine['26년총점컷']);
      const info = (window.getCounselorFromToken && window.getCounselorFromToken()) || {};
      if (info.branch) elements.cutMineLabel.textContent = `${info.branch}컷`;
    }

    function displayApplicants() {
      const apps = state.applicants;
      if (!apps || apps.length === 0) {
        elements.container.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon"><i class="ph-light ph-tray"></i></div>
            <div class="empty-title">상담 학생이 없습니다</div>
            <div class="empty-sub">해당 학과에 우리 지점의 상담 저장 내역이 없습니다.</div>
          </div>
        `;
        elements.statsStrip.hidden = true;
        elements.hintEl.textContent = `${state.year}학년도 · ${state.exam} · 0명`;
        return;
      }

      const suneungVals = apps.map(a => Number(a.suneung_score) || 0).filter(v => v > 0);
      const totalVals = apps.map(a => Number(a.total_score) || 0).filter(v => v > 0);
      const avg = arr => arr.length ? arr.reduce((sum, value) => sum + value, 0) / arr.length : 0;

      elements.statsStrip.hidden = false;
      elements.statTotal.textContent = `${apps.length}명`;
      elements.statAvgSuneung.textContent = suneungVals.length ? avg(suneungVals).toFixed(2) : '—';
      elements.statMaxSuneung.textContent = suneungVals.length ? Math.max(...suneungVals).toFixed(2) : '—';
      elements.statAvgTotal.textContent = totalVals.length ? avg(totalVals).toFixed(2) : '—';
      elements.statMaxTotal.textContent = totalVals.length ? Math.max(...totalVals).toFixed(2) : '—';

      elements.hintEl.textContent = `${state.year}학년도 · ${state.exam} · ${apps.length}명`;
      renderList();
    }

    function sortApplicants() {
      const sorted = [...state.applicants];
      if (state.sortBy === 'total_score') {
        sorted.sort((a, b) => (Number(b.total_score) || 0) - (Number(a.total_score) || 0));
      } else if (state.sortBy === 'suneung_score') {
        sorted.sort((a, b) => (Number(b.suneung_score) || 0) - (Number(a.suneung_score) || 0));
      } else if (state.sortBy === 'created_at') {
        sorted.sort((a, b) => {
          const ta = a.생성일시 ? new Date(a.생성일시).getTime() : 0;
          const tb = b.생성일시 ? new Date(b.생성일시).getTime() : 0;
          return tb - ta;
        });
      }
      return sorted;
    }

    function sumHtml(draft) {
      const score = draft.silgi_score || '0';
      const deduct = Number(draft.deduct) || 0;
      return deduct > 0 ? `${score} <em class="deduct-tag">(${deduct}감)</em>` : `${score}`;
    }

    function renderList() {
      const escapeHtml = esc();
      const events = state.eventList;
      const eventCols = events.map(() => '<col class="col-event-grp">').join('');
      const eventHeaders = events.map(ev => `<th class="th-event" title="${escapeHtml(ev)}">${escapeHtml(ev)}</th>`).join('');

      const rowsHtml = sortApplicants().map((applicant, index) => {
        const genderLabel = applicant.gender === 'M' || applicant.gender === '남' ? '남'
          : applicant.gender === 'F' || applicant.gender === '여' ? '여'
            : (applicant.gender || '');
        const id = String(applicant.counsel_id);
        const draft = getDraft(id, applicant);
        const eventCells = draft.entries.map((entry, i) => `
          <td class="td-event">
            <input type="text" class="tiny-input rec-input" data-cid="${escapeHtml(id)}" data-idx="${i}" value="${escapeHtml(entry.record)}" placeholder="기록">
            <input type="text" class="tiny-input score-input" data-cid="${escapeHtml(id)}" data-idx="${i}" value="${escapeHtml(entry.score)}" placeholder="점수">
          </td>`).join('');

        return `
          <tr class="applicant-row" data-cid="${escapeHtml(id)}">
            <td class="col-rank">${index + 1}</td>
            <td class="col-name">
              <div class="name-cell">
                <span class="n">${escapeHtml(applicant.name || '-')}</span>
                ${genderLabel ? `<span class="g-chip g-${genderLabel === '여' ? 'F' : 'M'}">${escapeHtml(genderLabel)}</span>` : ''}
              </div>
              <div class="sub-school">${escapeHtml(applicant.school || '')}</div>
            </td>
            <td class="col-gun"><span class="gun-badge">${escapeHtml(applicant.gun || '-')}</span></td>
            <td class="col-num">${fmtNum(applicant.suneung_score)}</td>
            <td class="col-num">${fmtNum(applicant.naesin_score)}</td>
            ${eventCells}
            <td class="col-num"><span data-sum="${escapeHtml(id)}">${sumHtml(draft)}</span></td>
            <td class="col-num col-total">${fmtNum(applicant.total_score)}</td>
            <td class="col-memo">
              <input type="text" class="tiny-input memo-input" data-cid="${escapeHtml(id)}" value="${escapeHtml(draft.memo || '')}" placeholder="메모">
            </td>
            <td class="col-save">
              <button type="button" class="save-icon-btn" data-cid="${escapeHtml(id)}" data-dirty="${escapeHtml(id)}" aria-label="저장" ${draft.dirty ? '' : 'disabled'}>
                <i class="ph-light ph-floppy-disk"></i>
              </button>
            </td>
          </tr>`;
      }).join('');

      const emptyEventsMsg = events.length === 0
        ? '<div class="no-events-hint"><i class="ph-light ph-info"></i> 이 대학은 실기 배점표가 등록되지 않았습니다.</div>'
        : '';

      elements.container.innerHTML = `
        ${emptyEventsMsg}
        <div class="list-wrap">
          <table class="applicants-table compact">
            <colgroup>
              <col style="width:38px"><col style="width:160px"><col style="width:44px">
              <col style="width:72px"><col style="width:72px">${eventCols}
              <col style="width:70px"><col style="width:84px"><col style="width:auto"><col style="width:36px">
            </colgroup>
            <thead>
              <tr>
                <th>#</th><th class="th-left">학생·학교</th><th>군</th><th>수능</th><th>내신</th>
                ${eventHeaders}<th>실기합</th><th>총점</th><th class="th-left">메모</th><th></th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>`;
    }

    return { displayApplicants, renderCutBar, renderList, sumHtml };
  }

  window.createUniversityCounselRenderer = createUniversityCounselRenderer;
})();
