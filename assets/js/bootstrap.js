/* ============================================================ */
/* bootstrap.js — 테마 복원 + 사이드바 include + 토스트 컨테이너 + 글로벌 Esc */
/* ============================================================ */

// FOUC 방지: 모듈 초기 실행 시 즉시 테마 적용 (DOMContentLoaded 기다리지 않음)
try {
  if (localStorage.getItem('theme') === 'dark') {
    document.documentElement.classList.add('dark');
  }
} catch (_) { /* localStorage 접근 실패 무시 */ }

// OS 감지 → html class (Windows 는 렌더링 품질 다르므로 별도 폰트 스택)
try {
  var _ua = navigator.userAgent || '';
  if (/Windows|Win64|Win32|WOW64/i.test(_ua)) document.documentElement.classList.add('os-win');
  else if (/Macintosh|Mac OS X/i.test(_ua)) document.documentElement.classList.add('os-mac');
} catch (_) {}

(function () {
  'use strict';

  async function loadSidebar() {
    var host = document.getElementById('sidebar-slot');
    if (!host) return;
    try {
      var res = await fetch('assets/sidebar.html', { cache: 'no-cache' });
      if (!res.ok) {
        // 절대경로 실패 시 상대경로 fallback (정적 호스팅 루트가 다를 수 있음)
        res = await fetch('assets/sidebar.html', { cache: 'no-cache' });
      }
      if (!res.ok) throw new Error('sidebar fetch ' + res.status);
      host.innerHTML = await res.text();
    } catch (e) {
      console.warn('[loadSidebar]', e);
      return;
    }

    // 현재 페이지 active 부여
    var page = document.body.dataset.page;
    if (page) {
      var active = host.querySelector('[data-page="' + page + '"]');
      if (active) active.classList.add('active');
    }

    // 사이드바 접기/펼치기 바인딩 — CSS가 .app-shell.collapsed 기준
    var toggle = host.querySelector('#toggleSidebar');
    if (toggle) {
      var shell = document.getElementById('appShell') || host.closest('.app-shell');
      toggle.addEventListener('click', function () {
        if (shell) shell.classList.toggle('collapsed');
      });
    }

    // 로그아웃 바인딩
    var logoutBtn = host.querySelector('[data-action="logout"]');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', function () {
        if (window.clearToken) window.clearToken();
        location.href = 'jungsilogin.html';
      });
    }

    // 푸터 사용자 정보 주입 (JWT payload 기반)
    try {
      var info = (window.getCounselorFromToken && window.getCounselorFromToken()) || {};
      var displayName = info.name || info.userid || '';
      var isAdmin = info.userid === 'admin';

      // 비-admin 은 관리자 편집 그룹 전체 숨김
      if (!isAdmin) {
        var adminGroup = host.querySelector('[data-group="admin"]');
        if (adminGroup) adminGroup.style.display = 'none';
      }
      var nameEl = host.querySelector('#sidebarUserName');
      var branchEl = host.querySelector('#sidebarUserBranch');
      var avatarEl = host.querySelector('#sidebarAvatar');
      if (nameEl) nameEl.textContent = displayName || '—';
      if (branchEl) {
        var roleText = info.userid === 'admin' ? '본원 관리자' : '원장';
        branchEl.textContent = [info.branch, roleText].filter(Boolean).join(' · ') || '—';
      }
      if (avatarEl) {
        var initials = '';
        if (displayName) {
          // 한글 이름 첫 글자, 영문이면 앞 2자
          initials = /[가-힣]/.test(displayName) ? displayName.charAt(0) : displayName.slice(0, 2).toUpperCase();
        }
        avatarEl.textContent = initials || '?';
      }
    } catch (e) { console.warn('[sidebar user inject]', e); }
  }

  function applyThemeIcon(icon, isDark) {
    if (!icon) return;
    // Phosphor 아이콘은 웨이트 클래스(ph-light 등) + 이름 클래스 둘 다 필요
    icon.className = isDark ? 'ph-light ph-sun' : 'ph-light ph-moon';
  }

  function ensureThemeToggle() {
    // 모든 페이지 .topbar-actions 에 테마 토글 버튼 자동 주입 (이미 있으면 이벤트만 바인딩)
    var slot = document.querySelector('.topbar-actions');
    if (!slot) return;
    var btn = document.getElementById('themeToggle');
    if (!btn) {
      btn = document.createElement('button');
      btn.className = 'icon-btn';
      btn.id = 'themeToggle';
      btn.setAttribute('title', '테마 전환');
      btn.setAttribute('aria-label', '테마 전환');
      var icon = document.createElement('i');
      icon.id = 'themeIcon';
      btn.appendChild(icon);
      slot.insertBefore(btn, slot.firstChild); // topbar-actions 맨 앞
    }
    var icon = btn.querySelector('i');
    applyThemeIcon(icon, document.documentElement.classList.contains('dark'));
    if (btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', function () {
      var isDark = document.documentElement.classList.toggle('dark');
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
      applyThemeIcon(btn.querySelector('i'), isDark);
    });
  }

  function ensureWatermark() {
    // 이미 페이지에 .watermark-bg 가 있으면(구 counsel 등) 건드리지 않음
    if (document.querySelector('.watermark-bg')) return;
    document.documentElement.style.setProperty('--watermark-url', "url('assets/img/max-logo.png')");
    var wm = document.createElement('div');
    wm.className = 'watermark-bg';
    wm.setAttribute('aria-hidden', 'true');
    document.body.appendChild(wm);
  }

  function ensureToastContainer() {
    if (document.getElementById('toastContainer')) return;
    var c = document.createElement('div');
    c.id = 'toastContainer';
    c.className = 'toast-container';
    document.body.appendChild(c);
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[data-et-page-asset="' + src + '"]');
      if (existing) {
        if (existing.dataset.loaded === '1') resolve();
        else existing.addEventListener('load', resolve, { once: true });
        return;
      }
      var script = document.createElement('script');
      script.src = src;
      script.dataset.etPageAsset = src;
      script.addEventListener('load', function () {
        script.dataset.loaded = '1';
        resolve();
      }, { once: true });
      script.addEventListener('error', reject, { once: true });
      document.head.appendChild(script);
    });
  }

  function loadStylesheet(href) {
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('link[data-et-page-asset="' + href + '"]');
      if (existing) {
        resolve();
        return;
      }
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.dataset.etPageAsset = href;
      link.addEventListener('load', resolve, { once: true });
      link.addEventListener('error', reject, { once: true });
      document.head.appendChild(link);
    });
  }

  async function loadPageAssets() {
    var page = document.body.dataset.page;
    if (!page) return;
    try {
      await loadScript('assets/js/page-modules.js');
      var config = window.ET_PAGE_MODULES && window.ET_PAGE_MODULES[page];
      if (!config) return;
      await Promise.all((config.styles || []).map(loadStylesheet));
      for (var i = 0; i < (config.scripts || []).length; i += 1) {
        await loadScript(config.scripts[i]);
      }
    } catch (error) {
      console.warn('[loadPageAssets]', page, error);
    }
  }

  function bindGlobalEsc() {
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      document.querySelectorAll('.modal-backdrop.show').forEach(function (m) {
        m.classList.remove('show');
      });
    });
  }

  document.addEventListener('DOMContentLoaded', async function () {
    // 1. 테마 복원
    if (localStorage.getItem('theme') === 'dark') {
      document.documentElement.classList.add('dark');
    }
    // 2. 사이드바 include
    await loadSidebar();
    // 2.5. 워터마크 주입
    ensureWatermark();
    // 3. 토스트 컨테이너
    ensureToastContainer();
    // 3.5. 테마 토글 (topbar)
    ensureThemeToggle();
    // 4. 글로벌 Esc
    bindGlobalEsc();
    // 5. topbar 제목/카테고리 주입 (.page-path 우선, fallback .topbar-title)
    var title = document.body.dataset.title;
    if (title) {
      var curEl = document.querySelector('.page-path .current');
      if (curEl && !curEl.textContent.trim()) curEl.textContent = title;
      var tEl = document.querySelector('.topbar-title');
      if (tEl && !tEl.textContent.trim()) tEl.textContent = title;
    }
    var category = document.body.dataset.category;
    if (category) {
      var pathEl = document.querySelector('.page-path');
      if (pathEl) {
        var catSpan = pathEl.querySelector('span:first-child');
        if (catSpan && !catSpan.textContent.trim()) catSpan.textContent = category;
      }
    }
    // 6. 페이지별 기능은 공통 bootstrap과 분리된 모듈로 로드
    await loadPageAssets();
  });
})();
