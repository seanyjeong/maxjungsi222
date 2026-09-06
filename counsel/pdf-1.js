

  function pdfFmt(n, digits = 1) {
    if (n == null || isNaN(n)) return '—';
    return Number(n).toFixed(digits);
  }

  function getCounselorFromToken() {
    const token = getToken();
    if (!token) return { name: '', branch: '' };
    try {
      let payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      while (payload.length % 4) payload += '=';
      // UTF-8 디코딩 (한글 지원)
      const json = decodeURIComponent(
        Array.prototype.map.call(atob(payload), c =>
          '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
        ).join('')
      );
      const p = JSON.parse(json);
      return { name: p.name || '', branch: p.branch || '' };
    } catch (e) { console.warn('[JWT decode]', e); return { name: '', branch: '' }; }
  }

  function pdfRenderCoverPage(student, counselor, stats, logoData, today) {
    const yearNum = (student.year || '').replace('학년도', '').trim();
    const academyName = `맥스체대입시 ${counselor.branch || ''} 교육원`.trim();
    const wmHtml = logoData
      ? `<img class="cover-wm-img" src="${logoData}" alt="">`
      : `<div class="cover-wm-m">맥스</div>`;
    const logoHtml = logoData
      ? `<img class="cover-logo-img" src="${logoData}" alt="맥스체대입시">`
      : `<div class="cover-logo-mark">M</div>`;
    return `
      <div class="page cover-page">
        <div class="cover-wm" aria-hidden="true">${wmHtml}</div>
        <div class="cover-rule-top"></div>
        <div class="cover-rule-bot"></div>
        <div class="cover-header">
          <div class="cover-brand-lock">
            ${logoHtml}
            <div class="cover-brand-wm">${academyName}</div>
          </div>
          <div class="cover-meta">
            <span>정시 상담 보고서</span>
            <span class="sep">/</span>
            <span>CONFIDENTIAL</span>
          </div>
        </div>
        <div class="cover-grid">
          <div class="cover-left">
            <div>
              <div class="cover-eyebrow">정시 상담 보고서 · ${yearNum}</div>
              <div class="cover-title-block">
                <h1 class="cover-doc-title">
                  체대 입시 합격,<br>
                  <span class="stroke">맥스</span>에서<br>
                  시작됩니다.
                </h1>
                <p class="cover-doc-sub">
                  학생 개인의 수능 성적과 체력 실기 기준에 맞춰
                  <span class="q">가 · 나 · 다군</span> 지원 전략을 수립한 1:1 맞춤 상담 자료입니다.
                </p>
              </div>
              <div class="cover-slogan">${academyName}</div>
            </div>
            <div class="cover-left-bottom">
              <div class="cover-lb-item">
                <div class="label">상담일</div>
                <div class="value"><span class="en">${today}</span></div>
              </div>
              <div class="cover-lb-item">
                <div class="label">대상 모형</div>
                <div class="value">${yearNum}학년도 <span class="tag">${student.exam}</span></div>
              </div>
            </div>
          </div>
          <div class="cover-right">
            <div class="cover-cert-eyebrow"><span>상담 대상</span></div>
            <div class="cover-student-name-wrap">
              <div class="cover-student-name">${student.name}</div>
            </div>
            <div class="cover-student-row">
              <div class="cover-chip"><span class="lbl">학교</span>${student.school}</div>
              <div class="cover-divider-dot"></div>
              <div class="cover-chip"><span class="lbl">학년</span>${student.grade}</div>
              <div class="cover-divider-dot"></div>
              <div class="cover-chip"><span class="lbl">성별</span>${student.gender}</div>
              <div class="cover-divider-dot"></div>
              <div class="cover-chip"><span class="lbl">계열</span>정시</div>
            </div>
            <div class="cover-exam">
              <div class="exam-label">수능 기준</div>
              <div class="exam-value">
                <span class="year">${yearNum}</span>
                <span class="year-ko">학년도</span>
                <span class="pipe">│</span>
                <span class="mock">${student.exam}</span>
              </div>
            </div>
            <div class="cover-apps">
              <div class="col"><div class="k">가군</div><div class="n">${stats.ga}</div><div class="u">개 학과</div></div>
              <div class="col"><div class="k">나군</div><div class="n">${stats.na}</div><div class="u">개 학과</div></div>
              <div class="col"><div class="k">다군</div><div class="n">${stats.da}</div><div class="u">개 학과</div></div>
              <div class="col total"><div class="k">합계</div><div class="n">${stats.total}<sub>개</sub></div><div class="u">총 지원</div></div>
            </div>
          </div>
        </div>
        <div class="cover-footer">
          <div>${academyName}</div>
          <div class="page-num">표지 — 01 / 01</div>
        </div>
      </div>
    `;
  }

  function pdfRenderHeader(student, logoData) {
    const logoHtml = logoData
      ? `<img class="logo-img" src="${logoData}" alt="맥스정시">`
      : '';
    return `
      <div class="page-header">
        <div class="brand">
          ${logoHtml}
          <div class="brand-text">
            <div class="title">맥스정시 · 정시 상담 자료</div>
            <div class="subtitle">
              <span>${student.year}</span><span class="dot"></span><span>${student.exam}</span>
            </div>
          </div>
        </div>
        <div class="student">
          <div class="name">${student.name}</div>
          <div class="meta">
            <span>${student.school}</span>
            <span class="sep"></span><span>${student.grade}</span>
            <span class="sep"></span><span>${student.gender}</span>
          </div>
        </div>
      </div>
    `;
  }

  function pdfRenderScore(score) {
    const subjects = ['korean','math','english','inquiry1','inquiry2','history'];
    const headCells = subjects.map(k => {
      const s = score[k];
      return `<th>${s.subject}<span class="sub">${s.choice ? s.choice : '—'}</span></th>`;
    }).join('');
    const stdRow = subjects.map(k => {
      const v = score[k].std;
      return v == null ? '<td class="empty">—</td>' : `<td>${v}</td>`;
    }).join('');
    const pctRow = subjects.map(k => {
      const v = score[k].pct;
      return v == null ? '<td class="empty">—</td>' : `<td>${v}</td>`;
    }).join('');
    const gradeRow = subjects.map(k => {
      const v = score[k].grade;
      return v == null
        ? '<td class="grade empty"><span class="pill">—</span></td>'
        : `<td class="grade"><span class="pill">${v}</span></td>`;
    }).join('');
    return `
      <div class="score-wrap">
        <div class="score-header">
          <div class="label">수능 성적</div>
        </div>
        <table class="score-table">
          <thead><tr><th></th>${headCells}</tr></thead>
          <tbody>
            <tr><th>표준점수</th>${stdRow}</tr>
            <tr><th>백분위</th>${pctRow}</tr>
            <tr><th>등급</th>${gradeRow}</tr>
          </tbody>
        </table>
      </div>
    `;
  }

  function pdfRenderCard(c, slotIdx) {
    if (!c) return `<div class="card empty"><div class="empty-text">빈 슬롯</div></div>`;
    const recordsRows = c.records.map(r => `
      <div class="p-row">
        <div class="p-name">${r.name}</div>
        <div class="p-rec">${r.rec}</div>
        <div class="p-pts">${r.pts != null ? pdfFmt(r.pts, 1) : '—'}${r.deduct > 0 ? `<span class="p-deduct">(${r.deduct}감)</span>` : ''}</div>
      </div>
    `).join('');
    const memo = c.memo ? `<div class="memo">${c.memo.replace(/\n/g, '<br>')}</div>` : '';
    const practicalBlock = c.records && c.records.length ? `
      <div class="sub-block">
        <div class="label">실기 기록</div>
        <div class="practical">${recordsRows}</div>
      </div>` : '';

    const ratiosBlock = (c.ratios && c.ratios.length) ? `
      <div class="reflect-row">
        <div class="reflect-label">반영</div>
        <div class="reflect-items">${
          c.ratios.map(r => `<span class="ratio-pill"><span class="rp-k">${r.k}</span><span class="rp-v">${r.v}<span class="rp-u">%</span></span></span>`).join('')
        }</div>
      </div>` : '';

    const subjectsBlock = (c.subjects && c.subjects.length) ? `
      <div class="reflect-row">
        <div class="reflect-label">수능</div>
        <div class="reflect-items subj-items">${
          c.subjects.map(s => {
            if (s.kind === 'note') return `<span class="subj-item note">${s.label} ${s.raw}</span>`;
            if (s.kind === 'optional') return `<span class="subj-item optional">${s.label} ${s.raw}</span>`;
            return `<span class="subj-item"><b>${s.label}</b> ${s.raw}</span>`;
          }).join('')
        }</div>
      </div>` : '';

    /* 콘텐츠 밀도 기반 자동 축소 — 카드 틀은 고정, 내용만 scale down */
    const recCount = (c.records && c.records.length) || 0;
    const memoScore = c.memo ? Math.min(3, Math.ceil(c.memo.length / 40)) : 0;
    const density = recCount + memoScore;
    const densityClass = density >= 7 ? ' very-dense' : density >= 4 ? ' dense' : '';

    return `
      <div class="card${densityClass}">
        <div class="slot-index">${String(slotIdx + 1).padStart(2, '0')}</div>
        <div class="card-head">
          <div class="card-title">
            <div class="univ">${c.univ}</div>
            <div class="dept">${c.dept}</div>
          </div>
        </div>
        <div class="metrics">
          <div class="metric">
            <div class="k">상위 10%</div>
            <div class="v">${pdfFmt(c.top10, 1)}</div>
          </div>
          <div class="metric">
            <div class="k">지점 총점컷</div>
            <div class="v">${pdfFmt(c.branch, 1)}</div>
          </div>
          <div class="metric highlight">
            <div class="k">MAX 총점컷</div>
            <div class="v">${pdfFmt(c.max, 1)}</div>
          </div>
        </div>
        ${ratiosBlock}
        ${subjectsBlock}
        <div class="breakdown">
          <div class="row"><div class="k">수능 점수</div><div class="v">${pdfFmt(c.suneung, 2)}</div></div>
          ${c.naesin != null && c.naesin > 0 ? `<div class="row"><div class="k">내신 점수</div><div class="v">${pdfFmt(c.naesin, 2)}</div></div>` : ''}
          ${c.practical != null && c.practical > 0 ? `<div class="row"><div class="k">실기 점수</div><div class="v">${pdfFmt(c.practical, 2)}</div></div>` : ''}
          <div class="row total"><div class="k">총점</div><div class="v">${pdfFmt(c.total, 2)}</div></div>
        </div>
        ${practicalBlock}
        ${memo}
      </div>
    `;
  }

  function pdfRenderGunPage(gunKey, cards, student, pageIdx, totalPages, logoData) {
    const meta = PDF_GUN_META[gunKey];
    const filled = cards.filter(Boolean).length;
    const slots = [0, 1, 2].map(i => pdfRenderCard(cards[i], i)).join('');
    const today = new Date();
    const dateStr = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`;
    const watermark = logoData
      ? `<img class="watermark-img" src="${logoData}" alt="">`
      : `<div class="watermark-txt">맥스정시</div>`;
    return `
      <div class="page ${meta.className}">
        ${watermark}
        ${pdfRenderHeader(student, logoData)}
        ${pdfRenderScore(window._PDF_SCORE_CACHE)}
        <div class="group-header">
          <div class="group-title">
            <div class="group-dot"></div>
            <div class="group-name">${meta.label}군</div>
            <div class="group-count">${filled}개 학과</div>
          </div>
        </div>
        <div class="cards">${slots}</div>
        <div class="page-footer">
          <div class="left">맥스정시 · 본 상담 자료는 참고용이며, 실제 합격 여부는 당해 입시 결과에 따라 달라질 수 있습니다.</div>
          <div class="right">${pageIdx}/${totalPages} · 생성일 ${dateStr}</div>
        </div>
      </div>
    `;
  }

  /* 카드 DOM → PDF 데이터 추출 */
  function extractPdfCardData(card, year) {
    const uniName = card.querySelector('.uni-name')?.textContent?.trim() || '-';
    const deptName = card.querySelector('.uni-dept')?.textContent?.trim() || '-';
    const metrics = card.querySelectorAll('.uni-metrics .value');
    const top10 = parseFloat(metrics[0]?.textContent) || null;
    const branch = parseFloat(metrics[1]?.textContent) || null;
    const max = parseFloat(metrics[2]?.textContent) || null;
    const suneung = parseFloat(card.querySelector('.score-suneung')?.textContent) || 0;
    const naesin = parseFloat(card.querySelector('.score-naeshin')?.textContent) || 0;
    const silgiText = card.querySelector('.score-silgi')?.textContent || '0';
    const silgiMatch = silgiText.match(/[\d.]+/);
    const practical = silgiMatch ? parseFloat(silgiMatch[0]) : 0;
    const total = parseFloat(card.querySelector('.score-total')?.textContent) || 0;
    const naesinInput = card.querySelector('[data-field="naeshin"]')?.value?.trim() || null;
    const memo = card.querySelector('.uni-memo')?.value?.trim() || null;

    const records = [];
    card.querySelectorAll('.input-row').forEach(row => {
      const lab = row.querySelector('.label')?.textContent?.trim();
      if (!lab || lab === '내신') return;
      const inp = row.querySelector('input');
      const v = inp?.value?.trim() || '';
      const out = row.querySelector('.score-out');
      const outText = out?.textContent || '';
      const ptsMatch = outText.match(/[\d.]+/);
      const deductMatch = outText.match(/\((\d+)감\)/);
      records.push({
        name: lab,
        rec: v || '—',
        pts: v && ptsMatch ? parseFloat(ptsMatch[0]) : null,
        deduct: deductMatch ? parseInt(deductMatch[1], 10) : 0,
      });
    });

    /* 반영 비율 + 수능 반영 과목 — formula / filter-data에서 가져옴 */
    const uid = card.dataset.uid;
    const formula = uid && year ? STATE.formulaCache[`${uid}-${year}`] : null;
    const dept = uid ? STATE.allFilterData.find(d => String(d.U_ID) === String(uid)) : null;

    const ratios = [];
    if (formula) {
      const add = (k, v) => { const n = Number(v || 0); if (n > 0) ratios.push({ k, v: n }); };
      add('수능', formula.수능); add('내신', formula.내신); add('실기', formula.실기); add('기타', formula.기타);
    }

    const subjects = [];
    if (dept) {
      const list = [
        { label: '국', raw: dept.국어_raw },
        { label: '수', raw: dept.수학_raw },
        { label: '영', raw: dept.영어_raw },
        { label: '탐', raw: dept.탐구_raw },
        { label: '한', raw: dept.한국사_raw },
      ];
      list.forEach(s => {
        const raw = (s.raw == null || s.raw === '') ? '' : String(s.raw);
        if (!raw) return;
        if (/[가-힣]/.test(raw) && !raw.startsWith('(')) {
          subjects.push({ label: s.label, raw, kind: 'note' });
        } else {
          subjects.push({ label: s.label, raw, kind: raw.startsWith('(') ? 'optional' : 'required' });
        }
      });
      if (dept.탐구수_raw) subjects.push({ label: '탐구', raw: `${dept.탐구수_raw}개`, kind: 'note' });
    }

    return {
      univ: uniName, dept: deptName,
      top10, branch, max,
      suneung, naesin, practical, total,
      naesinRaw: naesinInput,
      records,
      memo,
      ratios, subjects,
    };
  }
