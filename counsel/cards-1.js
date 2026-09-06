

  /* ====== 카드 DOM 생성 ====== */
  function createCardEl(formula, suneungScore = 0, savedItem = null) {
    const shell = document.createElement('div');
    shell.className = 'uni-card-shell';
    shell.dataset.uid = formula.U_ID;

    const reflectsNaeshin = Number(formula.내신 || 0) > 0;
    const reflectsSilgi = Number(formula.실기 || 0) > 0;
    const reflectsExtra = Number(formula.기타 || 0) > 0;

    let silgiEvents = [];
    if (reflectsSilgi && STATE.selectedStudent?.gender && Array.isArray(formula.실기배점)) {
      const g = STATE.selectedStudent.gender;
      silgiEvents = [...new Set(formula.실기배점.filter(r => r.성별 === g).map(r => r.종목명))].sort();
    }

    const pctBadges = [];
    if (Number(formula.수능 || 0) > 0) pctBadges.push(`수능 ${formula.수능}%`);
    if (reflectsNaeshin) pctBadges.push(`내신 ${formula.내신}%`);
    if (reflectsSilgi) pctBadges.push(`실기 ${formula.실기}%`);
    if (reflectsExtra) pctBadges.push(`기타 ${formula.기타}%`);
    const quotaVal = (window.formatQuotaValue && window.formatQuotaValue(formula.모집정원)) || (formula.모집정원 || '-');
    const quotaDiff = (window.formatQuotaDiff && window.formatQuotaDiff(formula.모집정원, formula.모집정원_prev)) || '';
    const badgeHtml = pctBadges.map(b => `<span class="badge info">${b}</span>`).join('') + `<span class="badge">모집 ${quotaVal}명${quotaDiff}</span>`;

    let inputRowsHtml = '';
    if (reflectsNaeshin) {
      inputRowsHtml += `
        <div class="input-row">
          <span class="label">내신</span>
          <input type="number" placeholder="진학사 점수" data-field="naeshin">
          <span class="score-out empty">-</span>
        </div>`;
    }
    if (reflectsSilgi) {
      if (silgiEvents.length) {
        silgiEvents.forEach(ev => {
          inputRowsHtml += `
            <div class="input-row">
              <span class="label">${ev}</span>
              <input type="text" placeholder="기록" data-event="${ev}">
              <span class="score-out empty">-</span>
            </div>`;
        });
      } else if (STATE.selectedStudent?.gender) {
        inputRowsHtml += `<div style="padding:6px 10px;font-size:11px;color:var(--text-3);text-align:center;">${STATE.selectedStudent.gender}학생 실기 종목 없음</div>`;
      }
    }

    const breakdownRows = [
      `<div class="uni-breakdown-row"><span class="label">수능 점수</span><span class="value score-suneung">${suneungScore.toFixed(2)}</span></div>`,
    ];
    if (reflectsNaeshin) breakdownRows.push(`<div class="uni-breakdown-row"><span class="label">내신 점수</span><span class="value score-naeshin">0.00</span></div>`);
    if (reflectsSilgi) breakdownRows.push(`<div class="uni-breakdown-row"><span class="label">실기 점수</span><span class="value score-silgi">0.00<span class="deduct">(0감)</span></span></div>`);
    breakdownRows.push(`<div class="uni-breakdown-row total"><span class="label">총점</span><span class="value score-total">${suneungScore.toFixed(2)}</span></div>`);

    shell.innerHTML = `
      <article class="uni-card">
        <div class="uni-head">
          <div class="uni-title-wrap">
            <div class="uni-name">${formula.대학명 || '-'}${(window.renderSchoolTags && window.renderSchoolTags(formula.tags)) || ''}</div>
            <div class="uni-dept">${formula.학과명 || '-'}</div>
            <div class="uni-badges">${badgeHtml}</div>
          </div>
          <button class="uni-delete" title="삭제"><i class="ph-light ph-x"></i></button>
        </div>
        <div class="uni-metrics">
          <div class="uni-metric top10"><span class="label">상위 10%</span><span class="value">…</span></div>
          <div class="uni-metric"><span class="label">지점 총점컷</span><span class="value">-</span></div>
          <div class="uni-metric max"><span class="label">MAX 총점컷</span><span class="value">-</span></div>
        </div>
        <div class="uni-breakdown">${breakdownRows.join('')}</div>
        <div class="uni-diff-row">
          <span class="label">MAX컷 대비</span>
          <span class="uni-diff" style="visibility:hidden">-</span>
        </div>
        ${inputRowsHtml ? `<div class="uni-inputs">${inputRowsHtml}</div>` : ''}
        <textarea class="uni-memo" placeholder="상담 메모..."></textarea>
        <div class="uni-actions">
          ${reflectsSilgi ? `<button class="mini-btn" onclick="openSilgiModal('${formula.U_ID}')"><i class="ph-light ph-list-magnifying-glass"></i>실기 배점표</button>` : ''}
          <button class="mini-btn" onclick="openCrossGunModal('${formula.U_ID}')"><i class="ph-light ph-users-three"></i>타군 인기</button>
        </div>
      </article>
    `;

    if (savedItem) {
      const naInput = shell.querySelector('[data-field="naeshin"]');
      if (naInput && savedItem.상담_내신점수 != null) naInput.value = savedItem.상담_내신점수;
      const savedSilgi = safeParse(savedItem.상담_실기기록, {});
      if (savedSilgi && typeof savedSilgi === 'object') {
        Object.entries(savedSilgi).forEach(([ev, v]) => {
          const inp = shell.querySelector(`[data-event="${ev}"]`);
          if (inp) inp.value = v;
        });
      }
      const memoEl = shell.querySelector('.uni-memo');
      if (memoEl && savedItem.메모) memoEl.value = savedItem.메모;
      // 저장값 있으면 즉시 재계산 (실기 점수 · 총점 · diff 반영)
      setTimeout(() => recalcCard(shell.querySelector('.uni-card')), 50);
    }

    shell.querySelector('.uni-delete').addEventListener('click', () => {
      const column = shell.closest('.gun-column');
      shell.style.transition = 'opacity 260ms, transform 280ms cubic-bezier(0.32,0.72,0,1)';
      shell.style.opacity = '0';
      shell.style.transform = 'translateY(-8px) scale(0.98)';
      setTimeout(() => {
        shell.remove();
        if (column) {
          updateGunCount(column);
          if (!column.querySelector('.uni-card-shell') && !column.querySelector('.gun-empty')) {
            const empty = document.createElement('div');
            empty.className = 'gun-empty';
            empty.innerHTML = `<i class="ph-light ph-plus-circle"></i>대학 검색에서 담아주세요`;
            column.appendChild(empty);
          }
        }
        if (typeof syncDrawerWithBoard === 'function') syncDrawerWithBoard();
        showToast(`${formula.대학명} 제거`, 'info');
        triggerAutoSave();
      }, 300);
    });

    if (typeof bindInputAutosave === 'function') bindInputAutosave(shell.querySelector('.uni-card'));

    return shell;
  }

  /* 카드를 군 컬럼에 추가 */
  function appendCardToColumn(gun, cardEl) {
    const colId = gun === '가' ? 'col-ga' : gun === '나' ? 'col-na' : gun === '다' ? 'col-da' : null;
    if (!colId) return;
    const col = document.getElementById(colId);
    if (!col) return;
    const empty = col.querySelector('.gun-empty');
    if (empty) empty.remove();
    col.appendChild(cardEl);
    updateGunCount(col);
  }

  function clearCounselBoard() {
    ['col-ga', 'col-na', 'col-da'].forEach(id => {
      const col = document.getElementById(id);
      if (!col) return;
      col.querySelectorAll('.uni-card-shell').forEach(c => c.remove());
      if (!col.querySelector('.gun-empty')) {
        const empty = document.createElement('div');
        empty.className = 'gun-empty';
        empty.innerHTML = `<i class="ph-light ph-plus-circle"></i>대학 검색에서 담아주세요`;
        col.appendChild(empty);
      }
      updateGunCount(col);
    });
    if (typeof syncDrawerWithBoard === 'function') syncDrawerWithBoard();
  }

  /* 저장된 상담 복원 */
  async function loadWishlist() {
    const student = STATE.selectedStudent;
    if (!student) return;
    const year = document.getElementById('yearSel').value;
    clearCounselBoard();

    try {
      const exam = document.getElementById('examSel').value;
      const d = await api(`/jungsi/counseling/wishlist/${student.student_id}/${year}?exam=${encodeURIComponent(exam)}`);
      if (!d.success) { console.log('[loadWishlist] 저장된 상담 없음'); return; }
      const items = d.wishlist || [];
      console.log('[loadWishlist]', items.length + '개 복원');

      for (const item of items) {
        const formula = await fetchFormulaDetails(item.대학학과_ID);
        if (!formula) continue;
        const suneungScore = await calculateSuneung(item.대학학과_ID) || 0;
        const card = createCardEl(formula, suneungScore, item);
        appendCardToColumn(item.모집군, card);
        fetchAndDisplayDeptStats(card, item.대학학과_ID);
      }
      if (typeof syncDrawerWithBoard === 'function') syncDrawerWithBoard();
    } catch (e) {
      if (e.message !== 'auth') console.error('[loadWishlist]', e);
    }
  }

  /* ====== DRAWER ↔ BOARD SYNC ======
     보드에 이미 담긴 U_ID는 드로어에서 'already' 표시
     드로어 열기 / 카드 추가 / 카드 삭제 시 호출 */
  function getBoardUids() {
    return new Set(
      Array.from(document.querySelectorAll('#gunBoard .uni-card-shell[data-uid]'))
        .map(el => el.dataset.uid)
    );
  }
  function syncDrawerWithBoard() {
    const boardUids = getBoardUids();
    document.querySelectorAll('#drawerBody .cand-row').forEach(row => {
      const uid = row.dataset.uid;
      const isOnBoard = boardUids.has(uid);
      row.classList.toggle('already', isOnBoard);
      const btn = row.querySelector('.cand-add-btn');
      if (!btn) return;
      if (isOnBoard) {
        btn.disabled = true;
        btn.classList.add('done');
        // 해당 대학 카드의 군 찾아서 "{군}군 담김"
        const card = document.querySelector(`#gunBoard .uni-card-shell[data-uid="${uid}"]`);
        const column = card?.closest('.gun-column');
        const gunId = column?.id || ''; // col-ga / col-na / col-da
        const gunName = gunId === 'col-ga' ? '가' : gunId === 'col-na' ? '나' : gunId === 'col-da' ? '다' : '';
        btn.innerHTML = `<i class="ph-fill ph-check-circle"></i> ${gunName}군 담김`;
      } else {
        btn.disabled = false;
        btn.classList.remove('done');
        btn.innerHTML = `<i class="ph-light ph-bookmark-simple"></i>관심학교 담기`;
      }
    });
  }

  function updateGunCount(column) {
    const cards = column.querySelectorAll('.uni-card-shell').length;
    const countEl = column.querySelector('.gun-count');
    if (!countEl) return;
    countEl.textContent = `${cards} / 3`;
    countEl.classList.toggle('full', cards === 3);
    countEl.classList.toggle('over', cards > 3);
  }
