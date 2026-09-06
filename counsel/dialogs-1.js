

  /* ====== MODALS ====== */
  function openModal(id) {
    const map = { silgi: 'modalSilgi', crossGun: 'modalCrossGun' };
    const el = document.getElementById(map[id]);
    if (el) el.classList.add('open');
  }
  function closeModal(id) {
    const map = { silgi: 'modalSilgi', crossGun: 'modalCrossGun' };
    const el = document.getElementById(map[id]);
    if (el) el.classList.remove('open');
  }
  /* 하드코딩 배점표 HTML 생성 (선형 환산식 등 DB에 못 담는 케이스) */
  function renderHardcodedSilgiHtml(hc) {
    const rowsOf = g => (hc.events[g] || []).map(e =>
      `<tr><td>${e.종목}</td><td>${e.max}</td><td>100점</td><td>${e.min}</td></tr>`).join('');
    return `
      <div style="display:flex; justify-content:flex-end; margin-bottom:10px;">
        <div style="display:flex; gap:2px; padding:2px; background:var(--surface-2); border-radius:8px;">
          <button data-hc-gender="남" class="active" style="border:0; background:var(--surface); color:var(--text); padding:4px 14px; font-size:11.5px; font-weight:600; border-radius:6px; cursor:pointer; font-family:inherit;">남</button>
          <button data-hc-gender="여" style="border:0; background:transparent; color:var(--text-2); padding:4px 14px; font-size:11.5px; font-weight:500; border-radius:6px; cursor:pointer; font-family:inherit;">여</button>
        </div>
      </div>
      <table style="width:100%; border-collapse:collapse; font-size:12.5px;">
        <thead>
          <tr style="background:var(--surface-2);">
            <th style="padding:8px; text-align:left; font-size:11px; color:var(--text-3); font-weight:500; letter-spacing:0.04em; text-transform:uppercase;">종목</th>
            <th style="padding:8px; font-size:11px; color:var(--text-3); font-weight:500; letter-spacing:0.04em; text-transform:uppercase;">만점 기준</th>
            <th style="padding:8px; font-size:11px; color:var(--text-3); font-weight:500; letter-spacing:0.04em; text-transform:uppercase;">만점 점수</th>
            <th style="padding:8px; font-size:11px; color:var(--text-3); font-weight:500; letter-spacing:0.04em; text-transform:uppercase;">0점 기준</th>
          </tr>
        </thead>
        <tbody id="hcSilgiTbody">${rowsOf('남')}</tbody>
      </table>
      <div style="margin-top:12px; padding:8px 10px; background:var(--warn-soft); color:var(--warn); font-size:11.5px; border-radius:6px;">
        <i class="ph-light ph-info" style="margin-right:4px"></i>${hc.note}
      </div>
    `;
  }

  async function openSilgiModal(uid) {
    const year = document.getElementById('yearSel').value;
    const body = document.getElementById('silgiModalBody');
    const titleEl = document.getElementById('silgiModalTitle');
    // 이름 즉시 표시
    const card = document.querySelector(`[data-uid="${uid}"] .uni-name`);
    const dept = document.querySelector(`[data-uid="${uid}"] .uni-dept`);
    const uniName = card?.textContent || '';
    const deptName = dept?.textContent?.split('·')[0].trim() || '';
    titleEl.textContent = `${uniName} - ${deptName} (실기)`;
    body.innerHTML = '<div class="empty-state"><i class="ph-light ph-circle-notch spin"></i><p>로딩 중...</p></div>';
    openModal('silgi');

    // ── 하드코딩 배점표 우선 (DB 누락 or 선형 환산식) ──
    const hc = (window.SILGI_HARDCODED || {})[String(uid)];
    if (hc) {
      body.innerHTML = renderHardcodedSilgiHtml(hc);
      // 성별 토글 바인딩
      body.querySelectorAll('[data-hc-gender]').forEach(b => b.addEventListener('click', () => {
        body.querySelectorAll('[data-hc-gender]').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        const g = b.dataset.hcGender;
        body.querySelector('#hcSilgiTbody').innerHTML = hc.events[g].map(e =>
          `<tr><td>${e.종목}</td><td>${e.max}</td><td>100점</td><td>${e.min}</td></tr>`).join('');
      }));
      return;
    }

    const formula = await fetchFormulaDetails(uid);
    if (!formula) {
      body.innerHTML = '<div class="empty-state"><i class="ph-light ph-warning"></i><p>요강 정보를 불러오지 못했어요</p></div>';
      return;
    }
    const silgiList = formula.실기배점 || [];
    if (!silgiList.length) {
      body.innerHTML = '<div class="empty-state"><i class="ph-light ph-info"></i><p>이 학과는 실기 배점표가 없습니다</p></div>';
      return;
    }

    // 종목명 기준 그룹핑
    const eventMap = {};
    silgiList.forEach(r => {
      const ev = r.종목명 || '기타';
      if (!eventMap[ev]) eventMap[ev] = [];
      eventMap[ev].push(r);
    });
    const eventNames = Object.keys(eventMap).sort((a, b) => {
      const aMin = Math.min(...eventMap[a].map(r => Number(r.id) || 999999));
      const bMin = Math.min(...eventMap[b].map(r => Number(r.id) || 999999));
      return aMin - bMin;
    });
    SILGI_EVENT_MAP = eventMap;

    const firstEv = eventNames[0];
    body.innerHTML = `
      <div class="event-select-wrap">
        <label>종목 선택</label>
        <select id="silgiEventSelect">
          ${eventNames.map(ev => `<option value="${ev}">${ev}</option>`).join('')}
        </select>
      </div>
      <div id="silgiEventTableWrap"></div>
    `;
    renderSilgiEventTable(firstEv, year);
    document.getElementById('silgiEventSelect').addEventListener('change', (e) => {
      renderSilgiEventTable(e.target.value, year);
    });
  }

  /* 타군 인기 지원 모달 */
  async function openCrossGunModal(uid) {
    const year = document.getElementById('yearSel').value;
    const title = document.getElementById('crossGunModalTitle');
    const body = document.getElementById('crossGunModalBody');

    // 제목 즉시 + 로딩
    const shell = document.querySelector(`[data-uid="${uid}"]`);
    const uniName = shell?.querySelector('.uni-name')?.textContent || '';
    const deptName = shell?.querySelector('.uni-dept')?.textContent?.split('·')[0].trim() || '';
    const column = shell?.closest('.gun-column');
    const colId = column?.id || '';
    const baseGun = colId === 'col-ga' ? '가' : colId === 'col-na' ? '나' : colId === 'col-da' ? '다' : '';
    title.textContent = `${uniName} ${deptName} (${baseGun ? baseGun + '군' : ''}) 지원자 타군 분포`;
    body.innerHTML = '<div class="empty-state"><i class="ph-light ph-circle-notch spin"></i><p>로딩...</p></div>';
    openModal('crossGun');

    try {
      const d = await api(`/jungsi/counseling/cross-gun-stats/${uid}/${year}`);
      if (!d.success) {
        body.innerHTML = `<div class="empty-state"><i class="ph-light ph-info"></i><p>${d.message || '조회 실패'}</p></div>`;
        return;
      }
      const studentCount = d.studentCount || 0;
      const otherGuns = ['가', '나', '다'].filter(g => g !== baseGun);
      if (!otherGuns.length) {
        otherGuns.push('가', '나', '다'); // baseGun 없을 때 다 표시
      }

      body.innerHTML = `
        <p style="font-size:12px;color:var(--text-3);margin-top:0;margin-bottom:14px;font-family:'Geist Mono',monospace;">
          (${studentCount}명 기준)
        </p>
        <div class="cross-gun-grid">
          ${otherGuns.map(g => {
            const arr = d[`${g}_gun_top3`] || [];
            if (!arr.length) {
              return `<div class="cross-gun-card">
                <div class="label">${g}군 상위 지원</div>
                <p style="font-size:12px;color:var(--text-3);margin:0;">데이터 없음</p>
              </div>`;
            }
            return `<div class="cross-gun-card">
              <div class="label">${g}군 상위 지원 Top ${arr.length}</div>
              <ol>
                ${arr.map(it => `<li><strong>${it.university || '-'}</strong> ${it.department || ''} <span>— ${it.count || 0}명</span></li>`).join('')}
              </ol>
            </div>`;
          }).join('')}
        </div>`;
    } catch (e) {
      body.innerHTML = `<div class="empty-state"><i class="ph-light ph-warning"></i><p>조회 오류: ${e.message || ''}</p></div>`;
    }
  }
  function renderSilgiEventTable(eventName, year) {
    const wrap = document.getElementById('silgiEventTableWrap');
    if (!wrap || !SILGI_EVENT_MAP) return;
    const rows = SILGI_EVENT_MAP[eventName] || [];

    // 점수(배점) 필드 있는지 확인
    const hasScore = rows.some(r =>
      (r.점수 != null && r.점수 !== '') || (r.배점 != null && r.배점 !== '')
    );

    let html;
    if (hasScore) {
      // 점수별 남/여 그룹화
      const scoreMap = {};
      rows.forEach(r => {
        const scoreVal = (r.점수 != null && r.점수 !== '') ? Number(r.점수) : Number(r.배점);
        if (!Number.isFinite(scoreVal)) return;
        if (!scoreMap[scoreVal]) scoreMap[scoreVal] = { 남: '-', 여: '-' };
        if (r.성별 === '남' || r.성별 === '남자') scoreMap[scoreVal].남 = r.기록 ?? r.남 ?? '-';
        else if (r.성별 === '여' || r.성별 === '여자') scoreMap[scoreVal].여 = r.기록 ?? r.여 ?? '-';
      });
      const sortedScores = Object.keys(scoreMap).map(Number).sort((a, b) => b - a);
      html = `
        <table class="score-table">
          <caption>${eventName} · ${year}학년도</caption>
          <thead><tr><th style="width:80px">배점</th><th>남</th><th>여</th></tr></thead>
          <tbody>
            ${sortedScores.map(sc => {
              const it = scoreMap[sc];
              return `<tr><td class="num">${sc}</td><td>${it.남 ?? '-'}</td><td>${it.여 ?? '-'}</td></tr>`;
            }).join('')}
          </tbody>
        </table>`;
    } else {
      // 점수 없는 유형 — 기록만 매핑
      const recMap = {};
      rows.forEach(r => {
        const key = r.기록 ?? r.남 ?? r.여 ?? `k-${Math.random()}`;
        if (!recMap[key]) recMap[key] = { 남: '-', 여: '-' };
        if (r.성별 === '남' || r.성별 === '남자') recMap[key].남 = r.기록 ?? r.남 ?? '-';
        else if (r.성별 === '여' || r.성별 === '여자') recMap[key].여 = r.기록 ?? r.여 ?? '-';
        else recMap[key].남 = r.기록 ?? '-';
      });
      const keys = Object.keys(recMap).sort((a, b) => {
        const na = Number(a), nb = Number(b);
        if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
        return 0;
      });
      html = `
        <table class="score-table">
          <caption>${eventName} · ${year}학년도</caption>
          <thead><tr><th style="width:80px">배점</th><th>남</th><th>여</th></tr></thead>
          <tbody>
            ${keys.map(k => {
              const it = recMap[k];
              return `<tr><td class="num">-</td><td>${it.남 ?? '-'}</td><td>${it.여 ?? '-'}</td></tr>`;
            }).join('')}
          </tbody>
        </table>`;
    }
    wrap.innerHTML = html;
  }
