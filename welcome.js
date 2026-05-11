/* ============================================================ */
/* welcome.new.js — 정시엔진 메인 대시보드                       */
/* Claude Design 핸드오프 기반. DEMO_MODE 제거, 실 API 직결.      */
/* admin 게이팅: JWT payload userid === 'admin' (백엔드와 동일)   */
/* ============================================================ */
'use strict';

(function () {

  // ── Endpoints (백엔드 검증 path) ──
  const SVR = window.API_BASE || 'https://supermax.kr';
  const API = {
    announcements:        SVR + '/jungsi/announcements',                  // GET (글로벌, 학년도 무관)
    announcementsAdd:     SVR + '/jungsi/announcements/add',              // POST (admin)
    announcementsUpdate:  (id) => SVR + '/jungsi/announcements/update/' + id,
    announcementsDelete:  (id) => SVR + '/jungsi/announcements/delete/' + id,

    counselingMonth:      (y, m) => SVR + '/jungsi/counseling-schedules/' + y + '/' + m,
    counselingAdd:        SVR + '/jungsi/counseling-schedules/add',
    counselingUpdate:     (id) => SVR + '/jungsi/counseling-schedules/update/' + id,
    counselingDelete:     (id) => SVR + '/jungsi/counseling-schedules/delete/' + id,

    practiceYear:         (y) => SVR + '/jungsi/branch-final-applies/' + y,

    memos:                SVR + '/jungsi/branch-memos',
    memosAdd:             SVR + '/jungsi/branch-memos/add',
    memosUpdate:          (id) => SVR + '/jungsi/branch-memos/update/' + id,
    memosDelete:          (id) => SVR + '/jungsi/branch-memos/delete/' + id,

    students:             (y) => SVR + '/jungsi/students/list-by-branch?year=' + encodeURIComponent(y),
  };

  // ── State ──
  const state = {
    isAdmin: false,
    userName: '',
    userBranch: '',
    branchStudents: [],
    announcements: [],
    memos: [],
    counselingSchedules: [],   // 현재 캘린더 월
    practiceSchedules:  [],    // 현재 학년도
    practiceYear: '2027',
    counselingYear: '2027',
  };

  const calendarInstances = { counseling: null, practice: null };

  // ── DOM refs ──
  const $ = (id) => document.getElementById(id);
  const noticeList     = $('notice-list');
  const memoList       = $('memo-list');
  // 콤보 인스턴스들 — init() 에서 초기화
  let practiceYearSel = null;
  let counselingYearSel = null;
  let studentCombo = null;
  let hourCombo = null;
  let minuteCombo = null;

  // ═════════ HELPERS ═════════
  const escapeHtml = (s) => (window.escapeHtml ? window.escapeHtml(s) : String(s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c])));

  const formatDate = (dateString) => {
    if (!dateString) return '';
    try {
      if (typeof dateString === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateString)) {
        return dateString.slice(0, 10);
      }
      const d = new Date(dateString);
      if (isNaN(d.getTime())) return '';
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    } catch (_) { return ''; }
  };
  const todayStr = () => formatDate(new Date());

  // 디자인 자체 toast 사용 (공통 toast 와 별개 — 디자인 톤 유지)
  function showToast(msg, isError = false) {
    document.querySelectorAll('.toast-popup-local').forEach(el => el.remove());
    const t = document.createElement('div');
    t.className = 'toast-popup-local' + (isError ? ' error' : ' success');
    t.innerHTML = `<i class="ph-fill ${isError ? 'ph-warning-circle' : 'ph-check-circle'}"></i>${escapeHtml(msg)}`;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 2600);
  }

  // ── apiCall: window.api 를 직접 못 쓰는 이유: 디자인 코드는 url 전체 를 받고 method/body 처리. ──
  // window.api 와 동일한 JWT 헤더 + 401 처리, 단 url을 직접 받음.
  async function apiCall(url, method = 'GET', body = null) {
    const token = window.getToken && window.getToken();
    if (!token) {
      window.handleAuthError && window.handleAuthError();
      return { success: false, isAuthError: true };
    }
    try {
      const opts = {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token,
        },
      };
      if (body && (method === 'POST' || method === 'PUT' || method === 'DELETE')) {
        opts.body = JSON.stringify(body);
      }
      const res = await fetch(url, opts);
      if (res.status === 401 || res.status === 403) {
        window.handleAuthError && window.handleAuthError();
        return { success: false, isAuthError: true };
      }
      if (res.status === 204) return { success: true };
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) {
        return { success: false, message: 'Non-JSON response' };
      }
      const data = await res.json();
      if (!res.ok) return { success: false, message: data?.message || `HTTP ${res.status}` };
      return data;
    } catch (e) {
      return { success: false, message: e.message };
    }
  }

  // ── JWT 에서 사용자 정보 + admin 판정 ──
  function readTokenUser() {
    try {
      if (window.getCounselorFromToken) {
        const info = window.getCounselorFromToken();
        if (info?.name) state.userName = info.name;
        if (info?.branch) state.userBranch = info.branch;
      }
      const token = window.getToken && window.getToken();
      if (!token) return;
      const seg = token.split('.')[1];
      if (!seg) return;
      const b64 = seg.replace(/-/g, '+').replace(/_/g, '/');
      const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
      const json = decodeURIComponent(
        Array.prototype.map.call(atob(padded), c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
      );
      const payload = JSON.parse(json);
      if (payload?.userid === 'admin') state.isAdmin = true;
    } catch (e) { /* noop */ }
  }

  // ═════════ HERO ═════════
  function timeMoodKey(h) {
    if (h >= 6  && h < 12) return 'morning';
    if (h >= 12 && h < 18) return 'afternoon';
    if (h >= 18 && h < 24) return 'evening';
    return 'night';
  }
  const MOODS = {
    morning:   { line: '좋은 아침이에요', emoji: '☀️' },
    afternoon: { line: '좋은 오후에요',   emoji: '🌤' },
    evening:   { line: '좋은 저녁이에요', emoji: '🌙' },
    night:     { line: '늦은 밤이네요',   emoji: '🌌' },
  };

  function renderHero() {
    const now = new Date();
    const mood = MOODS[timeMoodKey(now.getHours())];
    $('greeting-line').textContent = mood.line;
    $('greeting-emoji').textContent = mood.emoji;
    $('user-name').textContent = state.userName || '—';
    $('user-branch').textContent = state.userBranch || '—';

    const wk = ['일','월','화','수','목','금','토'][now.getDay()];
    $('hero-date').textContent = `${now.getFullYear()}년 ${now.getMonth()+1}월 ${now.getDate()}일 ${wk}요일`;

    const hh = String(now.getHours()).padStart(2,'0');
    const mm = String(now.getMinutes()).padStart(2,'0');
    $('hero-clock').textContent = `${hh}:${mm}`;
  }
  function tickClock() {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2,'0');
    const mm = String(now.getMinutes()).padStart(2,'0');
    const el = $('hero-clock'); if (el) el.textContent = `${hh}:${mm}`;
  }

  function renderHeroStats() {
    const t = todayStr();

    const todayC = (state.counselingSchedules || []).filter(s => formatDate(s.counseling_date) === t);
    $('today-counseling-count').textContent = todayC.length;
    const nextC = todayC.slice().sort((a,b)=>(a.counseling_time||'99:99').localeCompare(b.counseling_time||'99:99'))[0];
    $('today-counseling-hint').textContent = nextC
      ? `다음 ${nextC.counseling_time} · ${studentName(nextC.student_id)}`
      : '일정 없음';
    $('stat-counseling').classList.toggle('has-data', todayC.length > 0);

    const todayP = (state.practiceSchedules || []).filter(s => formatDate(s.실기날짜) === t);
    $('today-practice-count').textContent = todayP.length;
    const firstP = todayP.slice().sort((a,b)=>(a.실기시간||'99:99').localeCompare(b.실기시간||'99:99'))[0];
    $('today-practice-hint').textContent = firstP
      ? `${firstP.실기시간 || '미정'} · ${firstP.대학명 || ''}`
      : '일정 없음';
    $('stat-practice').classList.toggle('has-data', todayP.length > 0);

    const latest = (state.announcements || [])[0];
    if (latest) {
      $('today-notice-title').textContent = latest.title || '(제목 없음)';
      const when = new Date(latest.created_at);
      const dd = `${when.getMonth()+1}/${when.getDate()}`;
      $('today-notice-meta').textContent = `${dd} · ${latest.created_by || ''}`;
      $('stat-notice').classList.add('has-data');
    } else {
      $('today-notice-title').textContent = '최신 공지 없음';
      $('today-notice-meta').textContent = '\u00A0';
      $('stat-notice').classList.remove('has-data');
    }
  }

  function studentName(id) {
    const s = (state.branchStudents || []).find(x => x.student_id == id);
    return s?.student_name || `학생#${id}`;
  }

  // ═════════ STUDENTS ═════════
  async function loadStudents(year) {
    const y = year || state.counselingYear || state.practiceYear;
    const r = await apiCall(API.students(y));
    if (r?.success && Array.isArray(r.students)) {
      state.branchStudents = r.students.slice().sort((a,b)=> (a.student_name||'').localeCompare(b.student_name||'', 'ko'));
    } else {
      state.branchStudents = [];
    }
    populateStudentSelect();
  }
  function populateStudentSelect() {
    if (!studentCombo) return;
    const keep = studentCombo.value;
    studentCombo.setOptions(state.branchStudents.map(s => ({
      value: String(s.student_id),
      label: s.student_name,
    })));
    if (state.branchStudents.some(s => String(s.student_id) === String(keep))) {
      studentCombo.setValue(keep);
    }
  }

  // ═════════ ANNOUNCEMENTS ═════════
  async function loadAnnouncements() {
    noticeList.innerHTML = `<li class="loading"><span class="spin"><i class="ph-light ph-circle-notch"></i></span>공지 불러오는 중…</li>`;
    const r = await apiCall(API.announcements);
    let list = (r?.success && Array.isArray(r.announcements)) ? r.announcements : [];
    state.announcements = list.slice().sort((a,b)=> new Date(b.created_at) - new Date(a.created_at));
    renderAnnouncements();
    renderHeroStats();
  }
  function renderAnnouncements() {
    if (!state.announcements.length) {
      noticeList.innerHTML = `<li class="empty"><i class="ph-light ph-megaphone"></i>공지가 없습니다</li>`;
      return;
    }
    noticeList.innerHTML = state.announcements.map(n => {
      const when = new Date(n.created_at);
      const dd = `${when.getFullYear()}.${String(when.getMonth()+1).padStart(2,'0')}.${String(when.getDate()).padStart(2,'0')}`;
      return `
        <li data-notice-id="${n.notice_id}">
          <div class="notice-bullet"></div>
          <div class="notice-main" data-title="${escapeHtml(n.title)}" data-content="${escapeHtml(n.content || '')}">
            <span class="notice-title">${escapeHtml(n.title)}</span>
            <div class="notice-meta">
              <span>${dd}</span>
              ${n.created_by ? `<span class="meta-dot"></span><span>${escapeHtml(n.created_by)}</span>` : ''}
            </div>
          </div>
          <div class="notice-actions admin-only">
            <button class="btn btn-ghost btn-sm edit-notice-btn" aria-label="수정"><i class="ph-light ph-pencil-simple"></i></button>
            <button class="btn btn-ghost btn-sm delete-notice-btn" aria-label="삭제"><i class="ph-light ph-trash"></i></button>
          </div>
        </li>`;
    }).join('');

    noticeList.querySelectorAll('.notice-main').forEach(el => {
      el.addEventListener('click', () => openTextEditModal('notice-view', null, el.dataset.title, el.dataset.content));
    });
    noticeList.querySelectorAll('.edit-notice-btn').forEach(btn => btn.addEventListener('click', e => {
      const li = e.currentTarget.closest('li');
      const m = li.querySelector('.notice-main');
      openTextEditModal('notice', li.dataset.noticeId, m.dataset.title, m.dataset.content);
    }));
    noticeList.querySelectorAll('.delete-notice-btn').forEach(btn => btn.addEventListener('click', async e => {
      const li = e.currentTarget.closest('li');
      if (!confirm('공지를 삭제할까요?')) return;
      const id = li.dataset.noticeId;
      const r = await apiCall(API.announcementsDelete(id), 'DELETE');
      if (r?.success) { showToast('공지 삭제됨'); loadAnnouncements(); }
      else { showToast('삭제 실패: ' + (r?.message || ''), true); }
    }));
  }

  // ═════════ MEMOS ═════════
  async function loadMemos() {
    memoList.innerHTML = `<li class="loading"><span class="spin"><i class="ph-light ph-circle-notch"></i></span>메모 불러오는 중…</li>`;
    const r = await apiCall(API.memos);
    let list = (r?.success && Array.isArray(r.memos)) ? r.memos : [];
    state.memos = list.slice().sort((a,b)=> new Date(b.created_at) - new Date(a.created_at));
    renderMemos();
  }
  function renderMemos() {
    if (!state.memos.length) {
      memoList.innerHTML = `<li class="empty" style="grid-column: 1/-1;"><i class="ph-light ph-note"></i>지점 메모가 없습니다</li>`;
      return;
    }
    memoList.innerHTML = state.memos.map(m => {
      const when = new Date(m.created_at);
      const dd = `${when.getMonth()+1}/${when.getDate()} ${String(when.getHours()).padStart(2,'0')}:${String(when.getMinutes()).padStart(2,'0')}`;
      const content = m.memo_content || m.content || '';
      return `
        <li data-memo-id="${m.memo_id}">
          <div class="memo-actions">
            <button class="btn btn-ghost btn-sm edit-memo-btn" aria-label="수정"><i class="ph-light ph-pencil-simple"></i></button>
            <button class="btn btn-ghost btn-sm delete-memo-btn" aria-label="삭제"><i class="ph-light ph-trash"></i></button>
          </div>
          <div class="memo-content" data-content="${escapeHtml(content)}">${escapeHtml(content).replace(/\n/g, '<br>')}</div>
          <div class="memo-meta">
            <span>${dd}</span>
            <span>${escapeHtml(m.created_by || '')}</span>
          </div>
        </li>`;
    }).join('');
    memoList.querySelectorAll('.edit-memo-btn').forEach(btn => btn.addEventListener('click', e => {
      const li = e.currentTarget.closest('li');
      const content = li.querySelector('.memo-content').dataset.content;
      openTextEditModal('memo', li.dataset.memoId, '', content);
    }));
    memoList.querySelectorAll('.delete-memo-btn').forEach(btn => btn.addEventListener('click', async e => {
      const li = e.currentTarget.closest('li');
      if (!confirm('메모를 삭제할까요?')) return;
      const id = li.dataset.memoId;
      const r = await apiCall(API.memosDelete(id), 'DELETE');
      if (r?.success) { showToast('메모 삭제됨'); loadMemos(); }
      else { showToast('삭제 실패: ' + (r?.message || ''), true); }
    }));
  }

  // ═════════ CALENDAR ═════════
  function createCalendar(cardSelector, type) {
    const card = document.querySelector(cardSelector);
    if (!card) return null;
    const monthLabel = card.querySelector('.current-month-year');
    const grid       = card.querySelector('.calendar-grid');
    const prevBtn    = card.querySelector('.prev-month-btn');
    const nextBtn    = card.querySelector('.next-month-btn');
    let cursor = new Date();
    let data = [];

    const render = async (date) => {
      const y = date.getFullYear(), m = date.getMonth();
      monthLabel.textContent = `${y}년 ${String(m+1).padStart(2,'0')}월`;
      grid.querySelectorAll('.day-cell, .other-month').forEach(c => c.remove());

      let r;
      if (type === 'counseling') {
        r = await apiCall(API.counselingMonth(y, m + 1));
      } else {
        r = await apiCall(API.practiceYear(state.practiceYear));
      }
      let raw = [];
      if (r?.success) raw = r.schedules || r.list || [];

      data = raw.filter(item => {
        const ds = type === 'counseling' ? item.counseling_date : item.실기날짜;
        const f = formatDate(ds);
        if (!f) return false;
        const d = new Date(f + 'T00:00:00');
        return d.getFullYear() === y && d.getMonth() === m;
      });

      // Hero stat 용 캐시
      if (type === 'counseling') state.counselingSchedules = data;
      else state.practiceSchedules = data;
      renderHeroStats();

      const eventsByDay = {};
      for (const it of data) {
        const f = formatDate(type === 'counseling' ? it.counseling_date : it.실기날짜);
        const d = parseInt(f.slice(8, 10), 10);
        eventsByDay[d] = (eventsByDay[d] || 0) + 1;
      }

      const firstDow = new Date(y, m, 1).getDay();
      const lastDate = new Date(y, m+1, 0).getDate();
      const prevLast = new Date(y, m, 0).getDate();
      const today = new Date();

      for (let i = firstDow - 1; i >= 0; i--) {
        const div = document.createElement('div');
        div.className = 'other-month';
        div.textContent = prevLast - i;
        grid.appendChild(div);
      }

      for (let d = 1; d <= lastDate; d++) {
        const div = document.createElement('div');
        div.className = 'day-cell';
        const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        div.dataset.date = dateStr;
        div.innerHTML = `<span class="day-num">${d}</span>`;
        if (d === today.getDate() && m === today.getMonth() && y === today.getFullYear()) {
          div.classList.add('today');
        }
        const n = eventsByDay[d];
        if (n > 0) {
          div.classList.add('has-event');
          const badge = document.createElement('span');
          badge.className = 'event-count';
          badge.innerHTML = `<i class="ph-fill ph-circle" style="font-size:6px"></i>${n}`;
          div.appendChild(badge);
          div.addEventListener('click', () => openDayDetail(type, dateStr, data));
        }
        grid.appendChild(div);
      }

      const total = firstDow + lastDate;
      const need = total <= 35 ? 35 - total : 42 - total;
      for (let i = 1; i <= need; i++) {
        const div = document.createElement('div');
        div.className = 'other-month';
        div.textContent = i;
        grid.appendChild(div);
      }
    };

    prevBtn.addEventListener('click', () => { cursor.setMonth(cursor.getMonth() - 1); render(cursor); });
    nextBtn.addEventListener('click', () => { cursor.setMonth(cursor.getMonth() + 1); render(cursor); });
    render(cursor);
    return {
      refresh: () => render(cursor),
      gotoToday: () => { cursor = new Date(); render(cursor); },
      getData: () => data,
    };
  }

  function openDayDetail(type, dateStr, data) {
    const modalId = type === 'counseling' ? 'counseling-modal' : 'practice-modal';
    const modal = $(modalId);
    const dateEl = modal.querySelector('.modal-date');
    const body = modal.querySelector('.modal-details');
    const label = type === 'counseling' ? '상담' : '실기';
    dateEl.textContent = dateStr;
    const events = data.filter(s => formatDate(type === 'counseling' ? s.counseling_date : s.실기날짜) === dateStr);
    if (!events.length) {
      body.innerHTML = `<p class="no-schedule"><i class="ph-light ph-calendar-x"></i>${label} 일정 없음</p>`;
    } else {
      events.sort((a,b)=> ((type==='counseling'?a.counseling_time:a.실기시간) || '99:99').localeCompare(((type==='counseling'?b.counseling_time:b.실기시간) || '99:99')));
      if (type === 'counseling') {
        body.innerHTML = '<ul>' + events.map(ev => {
          const s = state.branchStudents.find(x => x.student_id == ev.student_id);
          const name = s ? s.student_name : `학생#${ev.student_id}`;
          const phone = s?.phone_number ? `<div class="detail-phone"><i class="ph-light ph-phone"></i>${s.phone_number} · ${s.phone_owner || '학생'}</div>` : '';
          return `<li>
            <div class="detail-row">
              <span class="student-name">${escapeHtml(name)}</span>
              <span class="time-slug">${ev.counseling_time || '미정'}</span>
            </div>
            ${phone}
            ${ev.counseling_type ? `<div class="detail-note">${escapeHtml(ev.counseling_type)}</div>` : ''}
            <div class="detail-actions">
              <button class="btn btn-ghost btn-sm" data-edit="${ev.schedule_id}"><i class="ph-light ph-pencil-simple"></i>수정</button>
              <button class="btn btn-danger btn-sm" data-del="${ev.schedule_id}"><i class="ph-light ph-trash"></i>삭제</button>
            </div>
          </li>`;
        }).join('') + '</ul>';
        body.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => {
          closeModal('counseling-modal');
          const ev = events.find(e => e.schedule_id == b.dataset.edit);
          if (ev) openCounselingForm(ev);
        }));
        body.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
          if (!confirm('상담 일정을 삭제할까요?')) return;
          const id = b.dataset.del;
          const r = await apiCall(API.counselingDelete(id), 'DELETE');
          if (r?.success) { showToast('삭제됨'); closeModal('counseling-modal'); calendarInstances.counseling.refresh(); }
          else { showToast('삭제 실패: ' + (r?.message || ''), true); }
        }));
      } else {
        const grouped = events.reduce((acc, ev) => {
          const k = `${ev.대학명}|${ev.학과명}|${ev.실기시간||'미정'}`;
          if (!acc[k]) acc[k] = { school: ev.대학명, dept: ev.학과명, time: ev.실기시간||'미정', names: [] };
          acc[k].names.push(ev.student_name || `학생#${ev.학생_ID || ev.student_id}`);
          return acc;
        }, {});
        body.innerHTML = '<ul>' + Object.values(grouped).map(g => `
          <li>
            <div class="detail-row">
              <span class="student-name">${escapeHtml(g.school || '')} <span style="color:var(--text-2); font-weight:500;">${escapeHtml(g.dept || '')}</span></span>
              <span class="time-slug">${escapeHtml(g.time)}</span>
            </div>
            <div class="detail-note">참여: ${escapeHtml(g.names.join(', '))}</div>
          </li>`).join('') + '</ul>';
      }
    }
    openModal(modalId);
  }

  // ═════════ COUNSELING FORM ═════════
  function populateTimeSelects() {
    if (!hourCombo || !minuteCombo) return;
    const hours = [];
    for (let i = 0; i < 24; i++) {
      const v = String(i).padStart(2, '0');
      hours.push({ value: v, label: v + '시' });
    }
    const mins = [];
    for (let m = 0; m < 60; m += 5) {
      const v = String(m).padStart(2, '0');
      mins.push({ value: v, label: v + '분' });
    }
    hourCombo.setOptions(hours);
    minuteCombo.setOptions(mins);
  }

  function openCounselingForm(existing = null) {
    $('counseling-form-title').textContent = existing ? '상담 일정 수정' : '상담 일정 추가';
    $('counseling-schedule-id').value = existing?.schedule_id || '';
    studentCombo && studentCombo.setValue(existing?.student_id || '');
    $('counseling-date').value = existing ? formatDate(existing.counseling_date) : todayStr();
    if (existing?.counseling_time) {
      const [hh, mm] = existing.counseling_time.split(':');
      hourCombo && hourCombo.setValue(hh);
      minuteCombo && minuteCombo.setValue(mm);
    } else {
      hourCombo && hourCombo.setValue('');
      minuteCombo && minuteCombo.setValue('');
    }
    $('counseling-type').value = existing?.counseling_type || '';
    $('delete-counseling-btn').style.display = existing ? 'inline-flex' : 'none';
    $('time-conflict-warning').classList.remove('show');
    openModal('add-counseling-modal');
    if (!state.branchStudents.length) loadStudents();
  }

  function checkConflictUI() {
    const warn = $('time-conflict-warning');
    const sid = studentCombo ? studentCombo.value : '';
    const date = $('counseling-date').value;
    const hh = hourCombo ? hourCombo.value : '';
    const mm = minuteCombo ? minuteCombo.value : '';
    const editId = $('counseling-schedule-id').value;
    if (!sid || !date || !hh || !mm) { warn.classList.remove('show'); return; }
    const target = new Date(`${date}T${hh}:${mm}:00`).getTime();
    const conflict = (state.counselingSchedules || []).some(s => {
      if (editId && s.schedule_id == editId) return false;
      if (s.student_id != sid) return false;
      if (formatDate(s.counseling_date) !== date) return false;
      if (!s.counseling_time) return false;
      const t2 = new Date(`${date}T${s.counseling_time}:00`).getTime();
      return Math.abs(t2 - target) < 30 * 60 * 1000;
    });
    warn.classList.toggle('show', conflict);
  }

  async function saveCounseling() {
    const editId = $('counseling-schedule-id').value;
    const student_id = studentCombo ? studentCombo.value : '';
    const date = $('counseling-date').value;
    const hh = hourCombo ? hourCombo.value : '';
    const mm = minuteCombo ? minuteCombo.value : '';
    const type = $('counseling-type').value.trim();
    if (!student_id || !date || !hh || !mm) { showToast('학생, 날짜, 시간을 모두 선택해주세요', true); return; }
    const payload = { student_id, counseling_date: date, counseling_time: `${hh}:${mm}`, counseling_type: type || null };
    const r = editId
      ? await apiCall(API.counselingUpdate(editId), 'PUT', payload)
      : await apiCall(API.counselingAdd, 'POST', payload);
    if (r?.success) {
      showToast(editId ? '수정되었습니다' : '추가되었습니다');
      closeModal('add-counseling-modal');
      calendarInstances.counseling.refresh();
    } else if (r?.message?.includes('겹치는') || r?.message?.includes('충돌')) {
      $('time-conflict-warning').classList.add('show');
      showToast(r.message, true);
    } else {
      showToast('저장 실패: ' + (r?.message || '오류'), true);
    }
  }

  async function deleteCounselingFromForm() {
    const editId = $('counseling-schedule-id').value;
    if (!editId) return;
    if (!confirm('상담 일정을 삭제할까요?')) return;
    const r = await apiCall(API.counselingDelete(editId), 'DELETE');
    if (r?.success) { showToast('삭제됨'); closeModal('add-counseling-modal'); calendarInstances.counseling.refresh(); }
    else { showToast('삭제 실패: ' + (r?.message || ''), true); }
  }

  // ═════════ TEXT EDIT (notice / memo) ═════════
  function openTextEditModal(type, id = null, title = '', content = '') {
    $('edit-type').value = type;
    $('edit-id').value = id || '';
    $('edit-title').value = title;
    $('edit-content').value = content;
    const titleField = $('edit-title-field');
    if (type === 'notice') {
      $('text-edit-modal-title').textContent = id ? '공지 수정' : '공지 추가';
      $('text-edit-modal-sub').textContent = '제목 · 본문';
      titleField.style.display = 'block';
    } else if (type === 'notice-view') {
      $('text-edit-modal-title').textContent = title || '공지';
      $('text-edit-modal-sub').textContent = '읽기 전용';
      titleField.style.display = 'none';
      $('edit-content').value = content;
      $('edit-content').setAttribute('readonly', 'readonly');
      $('save-text-btn').style.display = 'none';
      openModal('text-edit-modal');
      return;
    } else {
      $('text-edit-modal-title').textContent = id ? '메모 수정' : '메모 추가';
      $('text-edit-modal-sub').textContent = '본문';
      titleField.style.display = 'none';
    }
    $('edit-content').removeAttribute('readonly');
    $('save-text-btn').style.display = 'inline-flex';
    openModal('text-edit-modal');
  }

  async function saveTextEdit() {
    const type = $('edit-type').value;
    const id = $('edit-id').value;
    const title = $('edit-title').value.trim();
    const content = $('edit-content').value.trim();
    if (!content) { showToast('내용을 입력해주세요', true); return; }
    if (type === 'notice' && !title) { showToast('제목을 입력해주세요', true); return; }

    let r;
    if (type === 'notice') {
      const payload = { title, content };
      r = id
        ? await apiCall(API.announcementsUpdate(id), 'PUT', payload)
        : await apiCall(API.announcementsAdd, 'POST', payload);
    } else {
      const payload = { memo_content: content };
      r = id
        ? await apiCall(API.memosUpdate(id), 'PUT', payload)
        : await apiCall(API.memosAdd, 'POST', payload);
    }
    if (r?.success) {
      showToast(id ? '수정됨' : '추가됨');
      closeModal('text-edit-modal');
      if (type === 'notice') loadAnnouncements(); else loadMemos();
    } else {
      showToast('저장 실패: ' + (r?.message || ''), true);
    }
  }

  // ═════════ MODAL plumbing ═════════
  function openModal(id) {
    const m = $(id); if (!m) return;
    m.classList.add('open'); m.style.display = 'block';
  }
  function closeModal(id) {
    const m = $(id); if (!m) return;
    m.classList.remove('open'); m.style.display = 'none';
  }

  // ═════════ INIT ═════════
  async function init() {
    readTokenUser();
    if (state.isAdmin) document.body.classList.add('is-admin');

    renderHero();
    setInterval(tickClock, 1000 * 30);

    practiceYearSel = window.createCombobox(document.getElementById('practice-year-select'), {
      options: [{ value: '2027', label: '2027학년도' }, { value: '2026', label: '2026학년도' }],
      value: '2027',
      searchable: false,
      onChange: (v) => {
        state.practiceYear = v;
        calendarInstances.practice?.refresh();
      },
    });
    // Flatpickr 날짜 선택 (한국어 + 오늘 기준)
    if (window.flatpickr) {
      window.flatpickr('#counseling-date', {
        locale: (window.flatpickr.l10ns && window.flatpickr.l10ns.ko) || 'default',
        dateFormat: 'Y-m-d',
        allowInput: true,
        disableMobile: false,
        onChange: () => checkConflictUI(),
      });
    }

    counselingYearSel = window.createCombobox(document.getElementById('counseling-year'), {
      options: [{ value: '2027', label: '2027학년도' }, { value: '2026', label: '2026학년도' }],
      value: '2027',
      searchable: false,
      onChange: (v) => {
        state.counselingYear = v;
        loadStudents(v);
      },
    });
    state.counselingYear = counselingYearSel.value || '2027';
    studentCombo = window.createCombobox(document.getElementById('counseling-student'), {
      options: [],
      value: '',
      placeholder: '- 학생 선택 -',
      searchable: true,
      searchPlaceholder: '학생 이름 검색…',
      onChange: () => checkConflictUI(),
    });
    hourCombo = window.createCombobox(document.getElementById('counseling-hour'), {
      options: [],
      value: '',
      placeholder: '-- 시 --',
      searchable: false,
      onChange: () => checkConflictUI(),
    });
    minuteCombo = window.createCombobox(document.getElementById('counseling-minute'), {
      options: [],
      value: '',
      placeholder: '-- 분 --',
      searchable: false,
      onChange: () => checkConflictUI(),
    });
    state.practiceYear = practiceYearSel.value || '2027';
    populateTimeSelects();

    $('add-notice-btn').addEventListener('click', () => openTextEditModal('notice'));
    $('add-memo-btn').addEventListener('click', () => openTextEditModal('memo'));
    $('add-counseling-btn').addEventListener('click', () => openCounselingForm());
    $('save-counseling-btn').addEventListener('click', saveCounseling);
    $('delete-counseling-btn').addEventListener('click', deleteCounselingFromForm);
    $('save-text-btn').addEventListener('click', saveTextEdit);

    // 학생/시/분 콤보 onChange 에서 checkConflictUI 호출. 날짜만 별도 리스너.
    $('counseling-date').addEventListener('change', checkConflictUI);

    $('goto-today-counseling').addEventListener('click', () => calendarInstances.counseling?.gotoToday());
    $('goto-today-practice').addEventListener('click', () => calendarInstances.practice?.gotoToday());

    document.querySelectorAll('[data-close-modal]').forEach(btn => {
      btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
    });
    document.querySelectorAll('.modal').forEach(m => {
      m.addEventListener('click', e => { if (e.target === m) closeModal(m.id); });
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') document.querySelectorAll('.modal.open').forEach(m => closeModal(m.id));
    });

    await loadStudents();
    await Promise.allSettled([loadAnnouncements(), loadMemos()]);
    calendarInstances.counseling = createCalendar('#counseling-card', 'counseling');
    calendarInstances.practice   = createCalendar('#practice-card',   'practice');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
