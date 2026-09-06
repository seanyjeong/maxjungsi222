

  /* ====== 필터 데이터 로드 ====== */
  async function loadFilterData() {
    const year = document.getElementById('yearSel').value;
    try {
      const d = await api(`/jungsi/filter-data/${year}`);
      if (!d.success || !Array.isArray(d.data)) {
        console.warn('[loadFilterData] empty');
        STATE.allFilterData = [];
        return;
      }
      STATE.allFilterData = d.data;
      console.log('[loadFilterData]', d.data.length + '개 학과 로드');

      // 지역 unique + 서울/경기/인천 우선
      const regions = [...new Set(d.data.map(x => x.지역).filter(Boolean))];
      const priority = ['서울', '경기', '인천'];
      regions.sort((a, b) => {
        const ap = priority.indexOf(a), bp = priority.indexOf(b);
        if (ap !== -1 && bp !== -1) return ap - bp;
        if (ap !== -1) return -1;
        if (bp !== -1) return 1;
        return a.localeCompare(b, 'ko');
      });

      // 실기 종목 unique
      const events = new Set();
      d.data.forEach(x => {
        if (x.practical_events) {
          x.practical_events.split(',').forEach(ev => {
            const t = ev.trim();
            if (t) events.add(t);
          });
        }
      });
      const eventList = [...events].sort((a, b) => a.localeCompare(b, 'ko'));

      populateMultiselect('region', regions);
      populateMultiselect('events', eventList);
      renderDrawer();
    } catch (e) {
      if (e.message !== 'auth') console.error('[loadFilterData]', e);
    }
  }

  function getFilterCriteria() {
    const regions = Array.from(document.querySelectorAll('.multi-select[data-ms="region"] input:checked')).map(i => i.value);
    const excludeEvents = Array.from(document.querySelectorAll('.multi-select[data-ms="events"] input:checked')).map(i => i.value);
    const selects = document.querySelectorAll('.filter-panel .filter-field select');
    const teaching = selects[0]?.value || '';         // 교직이수
    const inquiryCount = selects[1]?.value || '';     // 탐구 반영 수
    const excludeSubjects = Array.from(document.querySelectorAll('.checkbox-chips input:checked')).map(i => i.value);
    return { regions, excludeEvents, teaching, inquiryCount, excludeSubjects };
  }

  function applyFilters(data) {
    const { regions, excludeEvents, teaching, inquiryCount, excludeSubjects } = getFilterCriteria();
    const gender = STATE.selectedStudent?.gender;

    return data.filter(d => {
      if (regions.length && !regions.includes(d.지역)) return false;
      if (teaching === '가능' && d.교직 !== 'O' && d.교직 !== '△') return false;
      if (teaching === '불가' && (d.교직 === 'O' || d.교직 === '△')) return false;
      if (inquiryCount && String(d.탐구수_raw) !== String(inquiryCount)) return false;

      // 반영 제외 과목: 해당 과목을 실제 반영하는 (선택과목 아닌) 학과 제외
      if (excludeSubjects.length) {
        const startsWithParen = (v) => typeof v === 'string' && v.startsWith('(');
        if (excludeSubjects.includes('국어') && d.국어_raw && !startsWithParen(d.국어_raw)) return false;
        if (excludeSubjects.includes('수학') && d.수학_raw && !startsWithParen(d.수학_raw)) return false;
        if (excludeSubjects.includes('영어') && d.영어_raw && !startsWithParen(d.영어_raw)) return false;
        if (excludeSubjects.includes('탐구') && d.탐구_raw && !startsWithParen(d.탐구_raw)) return false;
      }

      // 실기 제외 종목: 해당 종목 중 하나라도 있는 학과 제외
      if (excludeEvents.length && d.practical_events) {
        const deptEvents = d.practical_events.split(',').map(e => e.trim());
        if (excludeEvents.some(ev => deptEvents.includes(ev))) return false;
      }

      // 여대 차단
      if (gender === '남' && WOMENS_UNIVERSITIES.includes(d.대학명)) return false;

      return true;
    });
  }

  function reflectPctString(d) {
    const parts = [];
    if (d.수능 > 0) parts.push(`수 ${d.수능}%`);
    if (d.내신 > 0) parts.push(`내신 ${d.내신}%`);
    if (d.실기 > 0) parts.push(`실기 ${d.실기}%`);
    if (d.기타 > 0) parts.push(`기타 ${d.기타}%`);
    return parts.join(' · ') || '-';
  }

  /* 수능 반영과목 HTML 만들기 */
  function subjectsHtml(d) {
    const subjects = [
      { label: '국', raw: d.국어_raw },
      { label: '수', raw: d.수학_raw },
      { label: '영', raw: d.영어_raw },
      { label: '탐', raw: d.탐구_raw },
      { label: '한', raw: d.한국사_raw },
    ];
    const items = subjects.map(s => {
      const raw = (s.raw == null || s.raw === '') ? '' : String(s.raw);
      if (!raw) return '';
      // 문자(필수응시, 가산점 등)는 note 스타일
      if (/[가-힣]/.test(raw) && !raw.startsWith('(')) {
        return `<span class="subj note">${s.label} ${raw}</span>`;
      }
      const optional = raw.startsWith('(');
      return `<span class="subj${optional ? ' optional' : ''}">${s.label} <b>${raw}</b></span>`;
    }).filter(Boolean);
    if (!items.length) return '';
    const inqNote = d.탐구수_raw ? `<span class="subj note">탐구 ${d.탐구수_raw}개</span>` : '';
    return `<div class="cand-subjects"><span class="k">수능</span>${items.join('')}${inqNote}</div>`;
  }

  function renderDrawer() {
    // 학생 미선택이면 경고만 보여주고 후보 렌더 skip
    // search-wrap은 drawer-body의 sticky 자식이라 보존, 콘텐츠는 #drawerContent에만 채움
    const body = document.getElementById('drawerContent');
    const totalEl = document.querySelector('.drawer-count');
    if (!STATE.selectedStudent) {
      if (body) body.innerHTML = `
        <div class="drawer-empty-warn">
          <div class="icon-wrap"><i class="ph-light ph-user-focus"></i></div>
          <h3>학생을 먼저 선택해주세요</h3>
          <p>상단 <b>학생 선택</b> 에서 학생을 고르면<br>해당 학생의 환산점수 · 성적표 · 필터 결과가 표시됩니다</p>
          <button class="btn btn-accent" onclick="closeDrawer(); setTimeout(() => document.getElementById('comboDisplay').click(), 360);">
            <span>학생 선택하기</span>
            <span class="nest"><i class="ph-light ph-arrow-right"></i></span>
          </button>
        </div>`;
      if (totalEl) totalEl.textContent = '-';
      const filterCountText = document.getElementById('filterCountText');
      if (filterCountText) filterCountText.textContent = `- / ${STATE.allFilterData.length} 개 학과`;
      return;
    }

    // 학생 선택돼있으면 섹션 구조 복원 (최초 1회 or 경고에서 복귀)
    if (!body.querySelector('.drawer-gun-section')) {
      body.innerHTML = ['가', '나', '다'].map(gun => {
        const cls = gun === '가' ? 'ga' : gun === '나' ? 'na' : 'da';
        return `
          <section class="drawer-gun-section collapsed" data-gun="${gun}">
            <div class="drawer-gun-heading ${cls}">
              <span class="label"><span class="dot"></span>${gun}군</span>
              <span class="right">
                <span class="count"><b>0</b> 개 학과</span>
                <i class="ph-light ph-caret-down accordion-caret"></i>
              </span>
            </div>
            <div class="drawer-gun-body"></div>
          </section>`;
      }).join('');
      // 아코디언 토글 재바인딩
      body.querySelectorAll('.drawer-gun-heading').forEach(head => {
        head.addEventListener('click', () => {
          const section = head.closest('.drawer-gun-section');
          const b = section.querySelector('.drawer-gun-body');
          if (section.classList.contains('collapsed')) {
            section.classList.remove('collapsed');
            b.style.maxHeight = b.scrollHeight + 'px';
            setTimeout(() => { b.style.maxHeight = 'none'; }, 400);
          } else {
            b.style.maxHeight = b.scrollHeight + 'px';
            requestAnimationFrame(() => { b.style.maxHeight = '0px'; section.classList.add('collapsed'); });
          }
        });
      });
    }

    const filtered = applyFilters(STATE.allFilterData);

    const groups = { '가': [], '나': [], '다': [] };
    filtered.forEach(d => {
      const g = (d.군 || '').replace('군', '');
      if (groups[g]) groups[g].push(d);
    });

    ['가', '나', '다'].forEach(gun => {
      const section = document.querySelector(`.drawer-gun-section[data-gun="${gun}"]`);
      if (!section) return;
      const body = section.querySelector('.drawer-gun-body');
      const countEl = section.querySelector('.drawer-gun-heading .count b');

      const list = groups[gun];
      if (countEl) countEl.textContent = list.length;

      if (!list.length) {
        body.innerHTML = `<div class="combo-empty" style="padding:14px;font-size:11.5px;color:var(--text-3);text-align:center;border:1px dashed var(--border);border-radius:10px;margin:4px 0;">조건에 맞는 학과 없음</div>`;
        return;
      }

      body.innerHTML = list.map(d => {
        const regionTxt = [d.지역, d.시구].filter(Boolean).join(' ') || '-';
        const events = d.practical_events ? d.practical_events.replace(/,/g, ', ') : '-';
        const branchCut = (d.branch_suneung_cut != null && d.branch_suneung_cut !== '') ? Number(d.branch_suneung_cut).toFixed(2) : '-';
        const maxCut = (d.max_suneung_cut != null && d.max_suneung_cut !== '') ? Number(d.max_suneung_cut).toFixed(2) : '-';
        return `
          <div class="cand-row" data-uid="${d.U_ID}">
            <div class="cand-head">
              <div>
                <div class="cand-name">${d.대학명 || '-'}${(window.renderSchoolTags && window.renderSchoolTags(d.tags)) || ''}</div>
                <div class="cand-dept">${d.학과명 || '-'}</div>
              </div>
            </div>
            <div class="cand-meta">
              <span class="chip">${regionTxt}</span>
              <span class="chip">${reflectPctString(d)}</span>
              <span class="chip">모집 ${(window.formatQuotaValue && window.formatQuotaValue(d.모집정원)) || (d.모집정원 || '-')}명${(window.formatQuotaDiff && window.formatQuotaDiff(d.모집정원, d.모집정원_prev)) || ''}</span>
              ${d.교직 === 'O' ? '<span class="chip">교직</span>' : d.교직 === '△' ? '<span class="chip">교직 일부</span>' : ''}
            </div>
            <div class="cand-score-bar">
              <span class="label">환산</span>
              <span class="value" data-score-out="${d.U_ID}"><span class="loading-spinner"><i class="ph-light ph-circle-notch"></i> …</span></span>
              <span class="uni-diff" data-diff-out="${d.U_ID}" style="visibility:hidden">-</span>
            </div>
            ${subjectsHtml(d)}
            <div class="cand-events">
              <span class="k">실기종목</span>
              <i class="ph-light ph-barbell"></i>
              ${events}
            </div>
            <div class="cand-cuts">
              <div><span>지점 수능컷</span><span>${branchCut}</span></div>
              <div><span>MAX 수능컷</span><span>${maxCut}</span></div>
            </div>
            <div class="cand-actions">
              <button class="cand-add-btn" data-gun="${gun}"><i class="ph-light ph-bookmark-simple"></i>관심학교 담기</button>
            </div>
          </div>`;
      }).join('');
    });

    // 드로어 총 카운트 + 필터 카운트 텍스트
    if (totalEl) totalEl.textContent = `${filtered.length} 개`;
    const filterCountText2 = document.getElementById('filterCountText');
    if (filterCountText2) filterCountText2.textContent = `${filtered.length} / ${STATE.allFilterData.length} 개 학과`;

    // 보드와 sync (이미 담긴 학교 disabled)
    if (typeof syncDrawerWithBoard === 'function') syncDrawerWithBoard();

    // 환산점수 병렬 계산 (학생 선택됐을 때만)
    if (STATE.selectedStudent && STATE.selectedStudent.scores) {
      calculateAllCandidates(filtered);
    } else {
      // 학생 미선택 시 placeholder
      document.querySelectorAll('[data-score-out]').forEach(el => { el.textContent = '학생 선택'; });
    }
  }

  /* 필터 변경 시 재렌더 + 학생 변경 시에도 (성별 필터용) */
  function triggerDrawerRerender() {
    if (!STATE.allFilterData.length) return;
    renderDrawer();
  }

  /* 필터 적용 개수 계산 + 뱃지 업데이트 */
  function updateFilterBadge() {
    let count = 0;
    // multiselect (region, events) — 그룹당 1씩
    document.querySelectorAll('.filter-panel .multi-select').forEach(ms => {
      if (ms.querySelectorAll('input:checked').length > 0) count++;
    });
    // select (교직, 탐구수) — 기본이 아닌 값이면 1씩
    document.querySelectorAll('.filter-panel .filter-field select').forEach(sel => {
      if (sel.value && sel.value !== '' && sel.selectedIndex !== 0) count++;
    });
    // 반영 제외 과목 체크박스 — 하나라도 있으면 1
    if (document.querySelectorAll('.checkbox-chips input:checked').length > 0) count++;

    const badge = document.getElementById('filterCountBadge');
    if (badge) {
      badge.textContent = count;
      badge.style.display = count > 0 ? '' : 'none';
    }
  }

  /* 필터 초기화 */
  function resetFilters() {
    // multiselect (region, events)
    document.querySelectorAll('.filter-panel .multi-select').forEach(ms => {
      ms.querySelectorAll('input:checked').forEach(cb => { cb.checked = false; });
      const display = ms.querySelector('.multi-select-display');
      const kind = ms.dataset.ms;
      const placeholder = kind === 'region' ? '- 지역 선택 -' : '- 종목 선택 -';
      const existing = display.querySelector('.placeholder, span');
      if (existing) {
        existing.className = 'placeholder';
        existing.textContent = placeholder;
      }
    });
    // select (교직, 탐구수)
    document.querySelectorAll('.filter-panel .filter-field select').forEach(sel => {
      sel.selectedIndex = 0;
    });
    // 반영 제외 과목 체크박스
    document.querySelectorAll('.checkbox-chips input:checked').forEach(cb => { cb.checked = false; });
    updateFilterBadge();
    triggerDrawerRerender();
    showToast('필터 초기화됨', 'info');
  }

  function populateMultiselect(kind, items) {
    const ms = document.querySelector(`.multi-select[data-ms="${kind}"]`);
    if (!ms) return;
    const dropdown = ms.querySelector('.multi-select-dropdown');
    dropdown.innerHTML = items.length
      ? items.map(v => `<label><input type="checkbox" value="${v}"> ${v}</label>`).join('')
      : '<label style="padding:8px;color:var(--text-3);font-size:12px;">목록 없음</label>';

    // 재바인딩 — change 리스너가 새 체크박스에도 동작하게
    const display = ms.querySelector('.multi-select-display');
    const placeholder = kind === 'region' ? '- 지역 선택 -' : '- 종목 선택 -';
    dropdown.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => {
        const checked = ms.querySelectorAll('input:checked');
        const displayText = display.querySelector('.placeholder') || document.createElement('span');
        displayText.className = checked.length ? '' : 'placeholder';
        displayText.textContent = checked.length ? `${checked.length}개 선택` : placeholder;
      });
    });
  }
  function openDrawer() {
    syncDrawerWithBoard();
    drawer.classList.add('open');
    drawerOverlay.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
  }
  function closeDrawer() {
    drawer.classList.remove('open');
    drawerOverlay.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
  }

  function openDrawerWithSearch() {
    openDrawer();
    setTimeout(() => {
      const input = document.getElementById('drawerSearch');
      if (input) { input.focus(); input.select(); }
    }, 260);
  }
