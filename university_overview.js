/* ============================================================ */
/* university_overview.new.js — 대학 정보 · 모집요강 페이지      */
/* 공통 유틸 (window.api / toast / ...) 의존                     */
/* ============================================================ */
'use strict';

(function () {
  const yearSel = window.createCombobox(document.getElementById('yearSel'), {
    options: [{ value: '2027', label: '2027학년도' }, { value: '2026', label: '2026학년도' }],
    value: '2027',
    searchable: false,
    onChange: value => loadYear(value),
  });
  const searchInput = document.getElementById('searchInput');
  const sortSel = window.createCombobox(document.getElementById('sortSel'), {
    options: [
      { value: 'univ', label: '군 · 가나다 순' },
      { value: 'seats', label: '모집 많은 순' },
      { value: 'suneung', label: '수능 비율 높은 순' },
      { value: 'maxcut', label: 'MAX컷 낮은 순' },
    ],
    value: 'univ',
    searchable: false,
    onChange: (v) => { STATE.sort = v; apply(); },
  });
  const advToggle = document.getElementById('advToggle');
  const advPanel = document.getElementById('advPanel');
  const advCount = document.getElementById('advCount');
  const tbody = document.getElementById('tbody');
  const resultCount = document.getElementById('resultCount');

  // 데이터 캐시 — year 별
  const cache = { schools: {}, cutoffs: {}, filter: {}, formula: {} };

  // 현재 상태
  const STATE = {
    year: '2027',
    status: 'idle',
    rows: [],                           // merged (schools + cutoffs)
    filterGun: 'all',
    searchTerm: '',
    filterRegion: new Set(),
    filterExcludeSubj: new Set(),
    filterTeach: new Set(),
    filterNaesin: new Set(),
    sort: 'univ',
  };

  // ── API 로더 (병렬) ──
  async function loadData(year) {
    if (cache.schools[year] && cache.cutoffs[year] && cache.filter[year]) {
      return { schools: cache.schools[year], cutoffs: cache.cutoffs[year], filter: cache.filter[year] };
    }
    const [s, c, f] = await Promise.all([
      window.api(`/jungsi/schools/${year}`),
      window.api(`/jungsi/cutoffs/${year}`),
      window.api(`/jungsi/filter-data/${year}`),
    ]);
    if (!s?.success || !Array.isArray(s.list) || !c?.success || !Array.isArray(c.cutoffs) ||
        !f?.success || !Array.isArray(f.data)) throw new Error('대학정보 응답을 확인할 수 없습니다.');
    cache.schools[year] = s.list;
    cache.cutoffs[year] = c.cutoffs;
    cache.filter[year] = f.data;
    return { schools: s.list, cutoffs: c.cutoffs, filter: f.data };
  }

  let catalogRequest = 0;
  async function loadYear(year) {
    const generation = ++catalogRequest;
    STATE.year = year;
    STATE.status = 'loading';
    STATE.rows = [];
    details.close();
    document.getElementById('sumYear').textContent = year;
    ['sumTotal', 'sumGun', 'sumTeach', 'sumTeachSub', 'sumSeats'].forEach(id => {
      document.getElementById(id).textContent = '—';
    });
    resultCount.textContent = '불러오는 중…';
    tbody.innerHTML = '<tr><td colspan="11"><div class="empty-state">대학정보를 불러오는 중…</div></td></tr>';
    try {
      const { schools, cutoffs, filter } = await loadData(year);
      if (generation !== catalogRequest) return;
      STATE.rows = mergeRows(schools, cutoffs, filter);
      STATE.status = 'ready';
      buildRegionChips(STATE.rows);
      renderSummary(STATE.rows);
      apply();
    } catch (error) {
      if (generation !== catalogRequest) return;
      STATE.rows = [];
      STATE.status = 'error';
      renderSummary([]);
      resultCount.textContent = '불러오기 실패';
      tbody.innerHTML = '<tr><td colspan="11"><div class="empty-state"><p>대학정보를 불러오지 못했습니다.</p><button type="button" id="retryCatalog" class="gun-btn">다시 불러오기</button></div></td></tr>';
      document.getElementById('retryCatalog').addEventListener('click', () => loadYear(STATE.year));
      if (error.message !== 'auth') console.error('[university-catalog]', error);
    }
  }

  // ── schools + cutoffs + filter-data 병합 ──
  function mergeRows(schools, cutoffs, filter) {
    const cutMap = new Map(cutoffs.map(c => [c.U_ID, c]));
    const filMap = new Map(filter.map(f => [f.U_ID, f]));
    return schools.map(s => {
      const c = cutMap.get(s.U_ID) || {};
      const f = filMap.get(s.U_ID) || {};
      const toNum = v => (v != null && v !== '' && !isNaN(Number(v))) ? Number(v) : null;
      return {
        U_ID: s.U_ID,
        univ: f.대학명 || c.대학명 || s.university || '-',
        dept: f.학과명 || c.학과명 || s.department || '-',
        tags: s.tags || c.tags || f.tags || null,
        gun: (c.군 || s.gun || '').replace('군', '') || '-',
        region: s.광역 || '',
        city: s.시구 || '',
        selection_rules: s.selection_rules,
        계산유형: s.계산유형 || '',
        // ── 반영 과목 (counsel 과 동일한 _raw 필드) ──
        raw: {
          국어: f.국어_raw || '',
          수학: f.수학_raw || '',
          영어: f.영어_raw || '',
          탐구: f.탐구_raw || '',
          한국사: f.한국사_raw || '',
          탐구수: f.탐구수_raw || '',
        },
        실기목록: (f.실기종목_display || f.practical_events || ''),
        실기목록_diffNote: f.실기종목_diff_note || f.practical_events_diff_note || '',
        seats: toNum(c.모집인원),
        seats_raw: c.모집인원,
        seats_prev: c.모집인원_prev,
        suneung: toNum(c.수능비율),
        naesin: toNum(c.내신비율),
        silgi: toNum(c.실기비율),
        교직: c.교직 || s.교직 || '-',
        단계별: c.단계별 || s.단계별 || '-',
        branchCut: toNum(c.지점_수능컷),
        maxCut: toNum(c.맥스_수능컷),
        prevYearTotal: toNum(c['25년총점컷']),
        totalsByYear: { 2025: toNum(c['25년총점컷']), 2026: toNum(c['26년총점컷']) },
        branchTotal: toNum(c.지점_총점컷),
        maxTotal: toNum(c.맥스_총점컷),
      };
    });
  }

  // ── 반영 과목 분석 (counsel 과 동일 — filter-data _raw 기반) ──
  // raw 값 패턴:
  //   ''            → 미반영 (null)
  //   '33.3'        → req (필수 반영 %)
  //   '(33.3)'      → opt (선택 반영)
  //   '가산점' 등 한글 → note (텍스트)
  function classifyRaw(raw) {
    if (raw == null || ['', '-', '—', '0', '0%'].includes(String(raw).trim())) return null;
    const s = String(raw);
    if (/[가-힣]/.test(s) && !s.startsWith('(')) return { kind: 'note', text: s };
    if (s.startsWith('(')) return { kind: 'opt', text: s };
    return { kind: 'req', text: s };
  }

  // 단계별 표기 정규화 — "3배수"→"3배", "5"→"5배"
  function formatDangye(v) {
    if (!v || v === '-') return '—';
    const s = String(v).trim();
    if (!s) return '—';
    if (/^\d+$/.test(s)) return s + '배';
    return s.replace(/수$/, '');
  }

  // 실기 종목 표시 — DB(정시기본.실기종목_diff_note)에 미리 계산된 비교 메모 그대로 사용
  function formatSilgiList(curr, diffNote) {
    if (!curr) return '—';
    let html = window.escapeHtml(curr);
    if (diffNote) html += ` <small style="color:var(--text-3)">${window.escapeHtml(diffNote)}</small>`;
    return html;
  }

  function subjectBadgesHtml(raw) {
    if (!raw) return '';
    const items = [
      { k: '국어', lbl: '국' },
      { k: '수학', lbl: '수' },
      { k: '영어', lbl: '영' },
      { k: '탐구', lbl: '탐' },
      { k: '한국사', lbl: '한' },
    ];
    const esc = window.escapeHtml || (s => s);
    const parts = items.map(it => {
      const cls = classifyRaw(raw[it.k]);
      if (!cls) return `<span class="s none" title="${it.k}: 미반영"><span class="lbl">${it.lbl}</span></span>`;
      return `<span class="s ${cls.kind}" title="${it.k}: ${esc(cls.text)}"><span class="lbl">${it.lbl}</span><span class="val">${esc(cls.text)}</span></span>`;
    });
    return `<div class="subj-mini">${parts.join('')}</div>`;
  }

  // ── 교직 상태 ──
  const STATUS_HTML = {
    'O': '<span class="status o">O</span>',
    'X': '<span class="status x">X</span>',
    '△': '<span class="status semo">△</span>',
    '세모': '<span class="status semo">△</span>',
  };

  // ── 지역 chip 동적 생성 ──
  function buildRegionChips(rows) {
    const container = document.getElementById('regionChips');
    if (!container) return;
    const regions = [...new Set(rows.map(r => r.region).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'));
    container.innerHTML = regions.map(r => `<span class="check-chip" data-v="${r}">${r}</span>`).join('');
    container.querySelectorAll('.check-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        chip.classList.toggle('on');
        const v = chip.dataset.v;
        if (STATE.filterRegion.has(v)) STATE.filterRegion.delete(v);
        else STATE.filterRegion.add(v);
        updateAdvCount();
        apply();
      });
    });
  }

  // ── 요약 카운터 ──
  function renderSummary(rows) {
    document.getElementById('sumTotal').textContent = rows.length;
    document.getElementById('sumYear').textContent = STATE.year;
    const gunCount = { 가: 0, 나: 0, 다: 0 };
    let teachOK = 0, teachPart = 0, totalSeats = 0;
    rows.forEach(r => {
      if (r.gun in gunCount) gunCount[r.gun]++;
      if (r.교직 === 'O') teachOK++;
      else if (r.교직 === '△' || r.교직 === '세모') teachPart++;
      if (r.seats) totalSeats += r.seats;
    });
    document.getElementById('sumGun').textContent = `가 ${gunCount.가} · 나 ${gunCount.나} · 다 ${gunCount.다}`;
    document.getElementById('sumTeach').textContent = teachOK;
    const pct = rows.length ? Math.round(teachOK / rows.length * 100) : 0;
    document.getElementById('sumTeachSub').textContent = `전체의 ${pct}%` + (teachPart ? ` · 일부 ${teachPart}` : '');
    document.getElementById('sumSeats').textContent = totalSeats.toLocaleString();
  }

  // ── 필터 + 정렬 적용 ──
  function apply() {
    if (STATE.status !== 'ready') return;
    const q = STATE.searchTerm.toLowerCase();
    const filtered = STATE.rows.filter(r => {
      if (STATE.filterGun !== 'all' && r.gun !== STATE.filterGun) return false;
      if (q) {
        const hay = `${r.univ} ${r.dept} ${r.region} ${r.city}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (STATE.filterRegion.size && !STATE.filterRegion.has(r.region)) return false;
      if (STATE.filterTeach.size && !STATE.filterTeach.has(r.교직)) return false;
      if (STATE.filterNaesin.size) {
        const hasN = r.naesin > 0;
        if (STATE.filterNaesin.has('yes') && !hasN) return false;
        if (STATE.filterNaesin.has('no') && hasN) return false;
      }
      if (STATE.filterExcludeSubj.size) {
        for (const ex of STATE.filterExcludeSubj) {
          const cls = classifyRaw(r.raw ? r.raw[ex] : '');
          if (cls && cls.kind === 'req') return false;  // 해당 과목 필수 반영이면 제외
        }
      }
      return true;
    });

    // 정렬 — 기본은 군(가→나→다) → 대학명 순
    const k = STATE.sort;
    const GUN_ORDER = { '가': 0, '나': 1, '다': 2 };
    const gunKey = g => GUN_ORDER[g] != null ? GUN_ORDER[g] : 99;
    filtered.sort((a, b) => {
      if (k === 'seats') return (b.seats || 0) - (a.seats || 0);
      if (k === 'suneung') return (b.suneung || 0) - (a.suneung || 0);
      if (k === 'maxcut') {
        const av = a.maxCut == null ? Infinity : a.maxCut;
        const bv = b.maxCut == null ? Infinity : b.maxCut;
        return av - bv;
      }
      // 'univ' (기본): 군 우선 → 대학명
      const gd = gunKey(a.gun) - gunKey(b.gun);
      if (gd !== 0) return gd;
      return a.univ.localeCompare(b.univ, 'ko');
    });

    resultCount.textContent = `${filtered.length}개 / 총 ${STATE.rows.length}`;
    render(filtered);
  }

  function render(rows) {
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="13"><div class="empty-state"><i class="ph-light ph-magnifying-glass"></i><h3>조건에 맞는 학과가 없습니다</h3></div></td></tr>`;
      return;
    }
    const GUN_CLS = { '가': 'ga', '나': 'na', '다': 'da' };
    tbody.innerHTML = rows.map(r => `
      <tr data-uid="${r.U_ID}">
        <td class="col-gun"><span class="gun-dot ${GUN_CLS[r.gun] || ''}">${r.gun}군</span></td>
        <td class="col-region">${[r.region, r.city].filter(Boolean).join(' ') || '-'}</td>
        <td class="col-univ uni-dept"><button class="school-detail-link" type="button"><span class="univ-name">${window.escapeHtml ? window.escapeHtml(r.univ) : r.univ}${(window.renderSchoolTags && window.renderSchoolTags(r.tags)) || ''}</span><span class="dept-name">${window.escapeHtml ? window.escapeHtml(r.dept) : r.dept}</span></button></td>
        <td>${STATUS_HTML[r.교직] || '<span class="status x">-</span>'}</td>
        <td class="num" style="white-space:nowrap">${window.escapeHtml(String(r.seats_raw ?? '—'))}${(window.formatQuotaDiff && window.formatQuotaDiff(r.seats_raw, r.seats_prev)) || ''}</td>
        <td class="ratio">${r.suneung != null ? r.suneung + '%' : '—'}</td>
        <td class="ratio">${r.naesin != null && r.naesin > 0 ? r.naesin + '%' : '—'}</td>
        <td class="ratio">${r.silgi != null && r.silgi > 0 ? r.silgi + '%' : '—'}</td>
        <td class="ratio">${formatDangye(r.단계별)}</td>
        <td class="col-subj">${subjectBadgesHtml(r.raw)}</td>
        <td class="col-silgi"><span class="silgi-events" title="${window.escapeHtml(r.실기목록)}">${formatSilgiList(r.실기목록, r.실기목록_diffNote)}</span></td>
      </tr>
    `).join('');
    tbody.querySelectorAll('tr[data-uid]').forEach(tr => {
      tr.addEventListener('click', () => openDetail(Number(tr.dataset.uid)));
    });
  }

  const details = window.UniversityDetails.create({
    api: window.api, getYear: () => STATE.year, getRows: () => STATE.rows,
    formulaCache: cache.formula, classifyRaw, formatDangye,
  });
  function openDetail(uid) { return details.open(uid); }

  // ── 상세 필터 카운트 업데이트 ──
  function updateAdvCount() {
    const n = STATE.filterRegion.size + STATE.filterExcludeSubj.size + STATE.filterTeach.size + STATE.filterNaesin.size;
    if (n > 0) {
      advCount.textContent = n;
      advCount.style.display = 'inline-block';
      advToggle.classList.add('has-active');
    } else {
      advCount.style.display = 'none';
      advToggle.classList.remove('has-active');
    }
  }

  // ── 이벤트 바인딩 ──
  function bindFilters() {
    // 군 버튼
    document.querySelectorAll('.gun-btn').forEach(b => b.addEventListener('click', () => {
      document.querySelectorAll('.gun-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      STATE.filterGun = b.dataset.gun;
      apply();
    }));

    // 검색 (debounce)
    const debouncedSearch = window.debounce ? window.debounce(v => { STATE.searchTerm = v; apply(); }, 220) : null;
    searchInput.addEventListener('input', e => {
      if (debouncedSearch) debouncedSearch(e.target.value.trim());
      else { STATE.searchTerm = e.target.value.trim(); apply(); }
    });

    // 정렬은 combobox onChange 로 처리

    // 상세 필터 토글
    advToggle.addEventListener('click', () => advPanel.classList.toggle('open'));

    // 필터 chip 공용 핸들러 (지역 제외, 지역은 동적 생성 후 별도 바인딩)
    document.querySelectorAll('.check-row').forEach(row => {
      const type = row.dataset.filter;
      if (type === 'region') return;
      row.querySelectorAll('.check-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          chip.classList.toggle('on');
          const v = chip.dataset.v;
          const setName = type === 'excludeSubj' ? 'filterExcludeSubj'
                        : type === 'teach' ? 'filterTeach'
                        : type === 'naesin' ? 'filterNaesin' : null;
          if (!setName) return;
          const set = STATE[setName];
          if (set.has(v)) set.delete(v); else set.add(v);
          updateAdvCount();
          apply();
        });
      });
    });

    // 학년도는 combobox onChange 로 처리


  }

  // ── 초기 로드 ──
  async function init() {
    bindFilters();
    await loadYear(yearSel.value || '2027');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
