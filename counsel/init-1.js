
  /* ====== 워터마크 로고 로드 ====== */
  fetch('top_logo.txt').then(r => r.text()).then(txt => {
    if (txt && txt.startsWith('data:image')) {
      document.documentElement.style.setProperty('--watermark-url', `url("${txt.trim()}")`);
    }
  }).catch(() => {});

  /* ====== API 유틸 + 인증 ====== */
  const SVR = 'https://supermax.kr';
  const LOGIN_PAGE = 'jungsilogin.html';
  const getToken = () => localStorage.getItem('jwt_token');
  let _authErrorFired = false;

  /* ====== 상태 ====== */
  const STATE = {
    allStudents: [],
    allFilterData: [],
    selectedStudent: null,
    wishlist: [],
  };

  /* ====== 드로어 후보 렌더링 ====== */
  const WOMENS_UNIVERSITIES = ['이화여자대학교', '숙명여자대학교', '성신여자대학교', '덕성여자대학교', '동덕여자대학교', '서울여자대학교'];

  /* ====== 요강 상세 조회 (캐시) ====== */
  STATE.formulaCache = {};

  // 필터 변경 시 뱃지 갱신 + 드로어 재렌더
  document.getElementById('filterPanel').addEventListener('change', () => {
    updateFilterBadge();
    triggerDrawerRerender();
  });
  // 반영 제외 과목 label 클릭도 반영 (for attribute 없어서 수동 트리거)
  document.querySelectorAll('.checkbox-chips input').forEach(cb => cb.addEventListener('change', () => {
    updateFilterBadge();
    triggerDrawerRerender();
  }));

  // combobox 상호작용
  (function setupCombo() {
    const combo = document.getElementById('studentCombo');
    const display = document.getElementById('comboDisplay');
    const search = document.getElementById('comboSearch');
    const list = document.getElementById('comboList');

    display.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = !combo.classList.contains('open');
      document.querySelectorAll('.student-combo.open').forEach(c => c.classList.remove('open'));
      combo.classList.toggle('open');
      if (willOpen) {
        search.value = '';
        renderComboList(STATE.allStudents, '');
        setTimeout(() => search.focus(), 50);
      }
    });
    combo.addEventListener('click', (e) => e.stopPropagation());
    document.addEventListener('click', () => combo.classList.remove('open'));

    search.addEventListener('input', () => {
      renderComboList(STATE.allStudents, search.value);
    });

    list.addEventListener('click', (e) => {
      const item = e.target.closest('.combo-item');
      if (!item) return;
      selectStudent(item.dataset.id);
    });

    // 키보드 네비게이션
    search.addEventListener('keydown', (e) => {
      const items = list.querySelectorAll('.combo-item');
      if (!items.length) return;
      let active = list.querySelector('.combo-item.active');
      let idx = active ? Array.from(items).indexOf(active) : -1;
      if (e.key === 'ArrowDown') {
        e.preventDefault(); idx = Math.min(items.length - 1, idx + 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault(); idx = Math.max(0, idx - 1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (active) selectStudent(active.dataset.id);
        else if (items.length) selectStudent(items[0].dataset.id);
        return;
      } else if (e.key === 'Escape') {
        combo.classList.remove('open');
        return;
      } else return;
      items.forEach(it => it.classList.remove('active'));
      if (items[idx]) {
        items[idx].classList.add('active');
        items[idx].scrollIntoView({ block: 'nearest' });
      }
    });
  })();

  /* ====== SIDEBAR TOGGLE ====== */
  // bootstrap.js 가 sidebar.html 을 async fetch 해 slot 에 주입하므로
  // toggleSidebar 는 이 시점에 아직 없을 수 있다. bootstrap.js 가 자체 바인딩하므로 counsel 쪽은 optional 처리.
  const shell = document.getElementById('appShell');
  document.getElementById('toggleSidebar')?.addEventListener('click', () => {
    shell.classList.toggle('collapsed');
  });

  /* ====== THEME TOGGLE — bootstrap.js 에 위임 (중복 바인딩 방지) ====== */
  // 기존 counsel 자체 테마 로직 제거: bootstrap.js 가 FOUC 방지 + icon 관리 + click 핸들러까지 담당
  const root = document.documentElement;

  /* ====== FILTER PANEL COLLAPSE ====== */
  document.getElementById('filterHead').addEventListener('click', () => {
    document.getElementById('filterPanel').classList.toggle('open');
  });

  /* ====== STUDENT DETAIL TOGGLE ====== */
  document.getElementById('toggleDetailBtn').addEventListener('click', (e) => {
    const detail = document.getElementById('studentDetail');
    detail.classList.toggle('open');
    e.currentTarget.querySelector('i').style.transform = detail.classList.contains('open') ? 'rotate(180deg)' : 'rotate(0deg)';
  });

  document.querySelectorAll('.multi-select').forEach(ms => {
    const display = ms.querySelector('.multi-select-display');
    const placeholder = display.querySelector('.placeholder')?.textContent || '- 선택 -';
    display.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.multi-select.open').forEach(o => { if (o !== ms) o.classList.remove('open'); });
      const willOpen = !ms.classList.contains('open');
      ms.classList.toggle('open');
      if (willOpen) positionDropdown(ms);
    });
    ms.addEventListener('click', (e) => e.stopPropagation());
    ms.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => {
        const checked = ms.querySelectorAll('input:checked');
        const displayText = display.querySelector('.placeholder') || document.createElement('span');
        displayText.className = checked.length ? '' : 'placeholder';
        displayText.textContent = checked.length ? `${checked.length}개 선택` : placeholder;
      });
    });
  });
  document.addEventListener('click', () => {
    document.querySelectorAll('.multi-select.open').forEach(o => o.classList.remove('open'));
  });
  // 창 크기/스크롤 변할 때 열린 드롭다운 위치 재계산
  ['scroll', 'resize'].forEach(ev => {
    window.addEventListener(ev, () => {
      document.querySelectorAll('.multi-select.open').forEach(o => positionDropdown(o));
    }, true);
  });

  /* ====== DRAWER ====== */
  const drawer = document.getElementById('drawer');
  const drawerOverlay = document.getElementById('drawerOverlay');
  document.getElementById('openDrawerBtn').addEventListener('click', openDrawer);
  drawerOverlay.addEventListener('click', closeDrawer);

  /* topbar 검색 버튼 / Ctrl+K (Mac: ⌘K) → 드로어 열고 검색창 포커스 */
  const isMac = /mac|iphone|ipad|ipod/i.test(navigator.platform) || /mac/i.test(navigator.userAgent);
  const shortcutHintEl = document.getElementById('searchShortcutHint');
  if (shortcutHintEl) {
    shortcutHintEl.textContent = isMac ? '⌘ K' : 'Ctrl K';
    document.getElementById('topbarSearchBtn').setAttribute('title', isMac ? '검색 (⌘K)' : '검색 (Ctrl+K)');
  }
  document.getElementById('topbarSearchBtn').addEventListener('click', openDrawerWithSearch);
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openDrawerWithSearch();
    }
  });

  /* 드로어 섹션 아코디언 토글 */
  document.querySelectorAll('#drawerBody .drawer-gun-heading').forEach(head => {
    head.addEventListener('click', () => {
      const section = head.closest('.drawer-gun-section');
      const body = section.querySelector('.drawer-gun-body');
      if (section.classList.contains('collapsed')) {
        // 펼치기
        section.classList.remove('collapsed');
        body.style.maxHeight = body.scrollHeight + 'px';
        setTimeout(() => { body.style.maxHeight = 'none'; }, 400);
      } else {
        // 접기
        body.style.maxHeight = body.scrollHeight + 'px';
        requestAnimationFrame(() => {
          body.style.maxHeight = '0px';
          section.classList.add('collapsed');
        });
      }
    });
  });

  /* 드로어 내 실시간 검색 */
  const drawerSearchInput = document.getElementById('drawerSearch');
  let searchTimer;
  drawerSearchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      const q = drawerSearchInput.value.trim().toLowerCase();
      let totalVisible = 0;
      document.querySelectorAll('#drawerBody .drawer-gun-section').forEach(section => {
        let sectionCount = 0;
        section.querySelectorAll('.cand-row').forEach(row => {
          const hay = [
            row.querySelector('.cand-name')?.textContent,
            row.querySelector('.cand-dept')?.textContent,
            row.querySelector('.cand-meta')?.textContent,
            row.querySelector('.cand-events')?.textContent,
          ].filter(Boolean).join(' ').toLowerCase();
          const visible = !q || hay.includes(q);
          row.style.display = visible ? '' : 'none';
          if (visible) sectionCount++;
        });
        const countLabel = section.querySelector('.drawer-gun-heading .count b');
        if (countLabel) countLabel.textContent = String(sectionCount);
        section.style.display = sectionCount === 0 && q ? 'none' : '';
        // 검색 중이면 강제로 펼침
        if (q && sectionCount > 0 && section.classList.contains('collapsed')) {
          section.classList.remove('collapsed');
          const body = section.querySelector('.drawer-gun-body');
          if (body) body.style.maxHeight = 'none';
        }
        totalVisible += sectionCount;
      });
      const totalEl = document.querySelector('.drawer-count');
      if (totalEl) totalEl.textContent = `${totalVisible} 개${q ? ' 검색됨' : ''}`;
    }, 150);
  });

  /* drawer add button (데모) */
  drawer.addEventListener('click', async (e) => {
    const addBtn = e.target.closest('.cand-add-btn');
    if (!addBtn || addBtn.disabled) return;
    if (!STATE.selectedStudent) { showToast('학생을 먼저 선택하세요', 'error'); return; }

    const gun = addBtn.dataset.gun;
    const row = addBtn.closest('.cand-row');
    const uid = row.dataset.uid;
    const uni = row.querySelector('.cand-name')?.textContent || '대학';

    const gunColumn = document.getElementById(gun === '가' ? 'col-ga' : gun === '나' ? 'col-na' : 'col-da');
    if (!gunColumn) return;
    if (gunColumn.querySelectorAll('.uni-card-shell').length >= 3) {
      showToast(`${gun}군에는 최대 3개까지만`, 'error');
      return;
    }

    // 버튼 로딩 상태
    addBtn.disabled = true;
    const originalHtml = addBtn.innerHTML;
    addBtn.innerHTML = `<i class="ph-light ph-circle-notch spin"></i> 담는 중...`;

    try {
      const formula = await fetchFormulaDetails(uid);
      if (!formula) throw new Error('요강 조회 실패');
      const suneungScore = await calculateSuneung(uid) || 0;
      const card = createCardEl(formula, suneungScore, null);
      appendCardToColumn(gun, card);
      fetchAndDisplayDeptStats(card, uid);
      syncDrawerWithBoard();
      showToast(`${uni} → ${gun}군에 담김`, 'success');
      triggerAutoSave();
    } catch (err) {
      console.error('[담기]', err);
      addBtn.disabled = false;
      addBtn.innerHTML = originalHtml;
      showToast(`담기 실패: ${err.message || '오류'}`, 'error');
    }
  });

  let SILGI_EVENT_MAP = null;
  document.querySelectorAll('.modal-overlay').forEach(ov => {
    ov.addEventListener('click', (e) => {
      if (e.target === ov) ov.classList.remove('open');
    });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
      closeDrawer();
    }
  });

  /* ====== CARD DELETE (demo) ====== */
  document.querySelectorAll('#gunBoard .uni-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const card = e.currentTarget.closest('.uni-card-shell');
      const uni = card.querySelector('.uni-name').textContent;
      const column = card.closest('.gun-column');
      card.style.transition = 'opacity 260ms, transform 280ms cubic-bezier(0.32,0.72,0,1)';
      card.style.opacity = '0';
      card.style.transform = 'translateY(-8px) scale(0.98)';
      setTimeout(() => {
        card.remove();
        if (column) updateGunCount(column);
        syncDrawerWithBoard();
        showToast(`${uni} 제거`, 'info');
      }, 300);
    });
  });

  /* 초기 sync (페이지 로드 시 이미 담긴 카드 반영) */
  syncDrawerWithBoard();

  let recalcTimers = new WeakMap();
  let _lastSavedAt = 0;
  // 10초마다 relative time 갱신
  setInterval(renderSaveRelative, 10000);

  /* ====== 자동 저장 (Step 12) — /counseling/wishlist/bulk-save ====== */
  let _savingInFlight = false;
  let _pendingSave = false;

  // 1.5초 debounce 저장
  let _saveTimer;

  /* 초기 카드들에 바인딩 */
  document.querySelectorAll('#gunBoard .uni-card').forEach(bindInputAutosave);

  const PDF_GUN_META = {
    ga: { label:'가', className:'gun-ga' },
    na: { label:'나', className:'gun-na' },
    da: { label:'다', className:'gun-da' },
  };

  document.getElementById('btnExportPDF').addEventListener('click', generateCounselPDF);
  highlightTopCombo();

  /* ====== TOAST ====== */
  const toastContainer = document.getElementById('toastContainer');

  /* expose for inline onclick */
  window.openModal = openModal;
  window.closeModal = closeModal;
  window.openSilgiModal = openSilgiModal;
  window.openCrossGunModal = openCrossGunModal;
  window.openDrawer = openDrawer;
  window.closeDrawer = closeDrawer;

  /* Auto-open filter panel on load for demo */
  document.getElementById('filterPanel').classList.add('open');
  applyDefaultExam(); // 초기 진입 시 오늘 기준으로 모형 자동 선택

  document.getElementById('yearSel').addEventListener('change', () => {
    applyDefaultExam();
    loadStudents();
    loadFilterData();
  });
  document.getElementById('examSel').addEventListener('change', loadStudents);
  document.getElementById('filterResetBtn').addEventListener('click', resetFilters);

  // 페이지 진입 시 토큰 확인
  if (getToken()) {
    loadStudents();
    loadFilterData();
  } else {
    showToast('로그인이 필요합니다', 'error');
    console.warn('[auth] jwt_token 없음. localStorage.setItem("jwt_token", "...") 로 주입하거나 로그인 페이지로 이동');
  }

  // ── 사이드바 푸터 사용자 정보 + admin 그룹 게이팅 ──
  (function () {
    try {
      const token = getToken();
      if (!token) return;
      const seg = token.split('.')[1];
      const padded = seg.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - seg.length % 4) % 4);
      const json = decodeURIComponent(Array.prototype.map.call(atob(padded), c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
      const p = JSON.parse(json);
      const isAdmin = p.userid === 'admin';
      const displayName = p.name || p.userid || '';
      const nameEl = document.getElementById('sidebarUserName');
      const branchEl = document.getElementById('sidebarUserBranch');
      const avatarEl = document.getElementById('sidebarAvatar');
      if (nameEl) nameEl.textContent = displayName || '—';
      if (branchEl) branchEl.textContent = [p.branch, isAdmin ? '본원 관리자' : '원장'].filter(Boolean).join(' · ') || '—';
      if (avatarEl) {
        const initials = displayName ? (/[가-힣]/.test(displayName) ? displayName.charAt(0) : displayName.slice(0, 2).toUpperCase()) : '?';
        avatarEl.textContent = initials;
      }
      if (!isAdmin) {
        const admin = document.querySelector('[data-group="admin"]');
        if (admin) admin.style.display = 'none';
      }
      // 로그아웃 버튼 바인딩
      const logoutBtn = document.querySelector('[data-action="logout"]');
      if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
          localStorage.removeItem('jwt_token');
          window.location.href = 'jungsilogin.html';
        });
      }
    } catch (e) { console.warn('[sidebar inject]', e); }
  })();
