/* ============================================================ */
/* grade_distribution.new.js — 성적 분포 · 등급 통계               */
/* GET /jungsi/grade-distribution?year=YYYY → 9등급 막대 + 분포표 */
/* ============================================================ */
'use strict';

(function () {
  const yearSel = window.createCombobox(document.getElementById('yearSel'), {
    options: [
      { value: '2027', label: '2027학년도 (2·3학년)' },
      { value: '2026', label: '2026학년도' },
    ],
    value: '2027',
    searchable: false,
    onChange: (v) => {
      STATE.year = v;
      applyDefaultExamFor(STATE.year);
      load();
    },
  });
  const examSel = window.createCombobox(document.getElementById('examSel'), {
    options: [
      { value: '3월', label: '3월 학평' },
      { value: '6월', label: '6월 모평' },
      { value: '9월', label: '9월 모평' },
      { value: '수능', label: '수능' },
    ],
    value: '수능',
    searchable: false,
    onChange: (v) => { STATE.exam = v; load(); },
  });
  const sumYear = document.getElementById('sumYear');
  const sumExam = document.getElementById('sumExam');
  const sumTotal = document.getElementById('sumTotal');
  const sumCurrent = document.getElementById('sumCurrent');
  const sumCurrentSub = document.getElementById('sumCurrentSub');
  const sumTop = document.getElementById('sumTop');
  const sumTopSub = document.getElementById('sumTopSub');
  const sumAvg = document.getElementById('sumAvg');

  const catTabs = document.getElementById('catTabs');
  const subjChips = document.getElementById('subjChips');
  const chartTitle = document.getElementById('chartTitle');
  const chartEmpty = document.getElementById('chartEmpty');
  const distTbody = document.querySelector('#distTable tbody');
  const distFootCount = document.getElementById('distFootCount');

  const STATE = {
    year: '2027',
    exam: '수능',
    cat: '국어',
    subject: null,
    data: null,    // { totalStudents, distribution }
  };

  let chart = null;
  const GRADES = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  // 1~9등급 hue 그라디언트 (good → bad)
  function gradeColor(g, alpha = 0.85) {
    // teal → cyan → amber → red 톤. CSS 토큰 그대로 못 쓰므로 hex.
    const palette = {
      '1': '#0f766e',
      '2': '#14b8a6',
      '3': '#22c55e',
      '4': '#f59e0b',
      '5': '#f97316',
      '6': '#ef4444',
      '7': '#dc2626',
      '8': '#b91c1c',
      '9': '#7f1d1d',
    };
    return palette[String(g)] || '#a8a29e';
  }

  // ── 데이터 로딩 ──
  async function load() {
    const year = STATE.year;
    const exam = STATE.exam;
    sumYear.textContent = year;
    sumExam.textContent = exam;
    sumTotal.textContent = '…';
    sumCurrent.textContent = '…';
    sumCurrentSub.textContent = '데이터 로딩 중';

    try {
      const url = `/jungsi/grade-distribution-by-exam?year=${year}&exam=${encodeURIComponent(exam)}`;
      const data = await window.api(url);
      if (!data || !data.success) throw new Error((data && data.message) || '데이터 로딩 실패');
      STATE.data = data;
      sumTotal.textContent = (data.totalStudents || 0).toLocaleString();
      renderCat(STATE.cat);
    } catch (e) {
      console.error('[load]', e);
      window.showToast && window.showToast('성적 분포를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.', 'error');
      STATE.data = null;
      sumTotal.textContent = '—';
      renderCat(STATE.cat);
    }
  }

  // 학년도 변경 시 해당 학년도의 디폴트 모형으로 자동 전환
  function applyDefaultExamFor(year) {
    const def = (typeof window.getDefaultExam === 'function')
      ? window.getDefaultExam(parseInt(year, 10))
      : '수능';
    examSel.setValue(def);
    STATE.exam = def;
  }

  // ── 카테고리 변경 ──
  function renderCat(cat) {
    STATE.cat = cat;
    catTabs.querySelectorAll('.cat-tab').forEach(b => b.classList.toggle('active', b.dataset.cat === cat));

    const dist = (STATE.data && STATE.data.distribution) || {};
    const subjMap = dist[cat] || {};
    const subjects = Object.keys(subjMap);

    if (subjects.length === 0) {
      subjChips.innerHTML = '<div class="subj-chip-empty">선택한 학년도에 ' + cat + ' 데이터가 없습니다.</div>';
      STATE.subject = null;
      renderChart();
      return;
    }

    // 과목 chip 생성 (총 응시자 수도 표시)
    subjChips.innerHTML = subjects.map(s => {
      const total = Object.values(subjMap[s]).reduce((a, b) => a + (Number(b) || 0), 0);
      return `<button class="subj-chip" data-subj="${window.escapeHtml(s)}">
        <span>${window.escapeHtml(s)}</span><span class="count">${total.toLocaleString()}</span>
      </button>`;
    }).join('');

    // 첫 chip 자동 선택 (이전 선택이 새 카테고리에 없으면)
    if (!subjects.includes(STATE.subject)) {
      STATE.subject = subjects[0];
    }
    selectSubject(STATE.subject);
  }

  function selectSubject(subj) {
    STATE.subject = subj;
    subjChips.querySelectorAll('.subj-chip').forEach(c => c.classList.toggle('on', c.dataset.subj === subj));
    renderChart();
  }

  // ── 차트 + 분포표 렌더 ──
  function renderChart() {
    const cat = STATE.cat;
    const subj = STATE.subject;
    const dist = STATE.data && STATE.data.distribution && STATE.data.distribution[cat];
    const grades = (dist && subj && dist[subj]) || null;

    if (!grades) {
      chartTitle.textContent = `${cat}${subj ? ' — ' + subj : ''}`;
      sumCurrent.textContent = '—';
      sumCurrentSub.textContent = '데이터 없음';
      sumTop.textContent = '—'; sumTopSub.textContent = '— %';
      sumAvg.textContent = '—';
      distTbody.innerHTML = '';
      distFootCount.textContent = '—';
      if (chart) { chart.destroy(); chart = null; }
      chartEmpty.classList.add('show');
      return;
    }

    const counts = GRADES.map(g => Number(grades[g] || 0));
    const total = counts.reduce((a, b) => a + b, 0);
    const top3 = counts[0] + counts[1] + counts[2];
    const weighted = counts.reduce((a, c, i) => a + c * (i + 1), 0);
    const avg = total > 0 ? (weighted / total) : 0;

    chartTitle.textContent = `${cat} — ${subj}`;
    sumCurrent.textContent = total.toLocaleString();
    sumCurrentSub.textContent = `${subj} 응시자`;
    sumTop.textContent = top3.toLocaleString();
    sumTopSub.textContent = total > 0 ? `${((top3 / total) * 100).toFixed(1)} %` : '— %';
    sumAvg.textContent = total > 0 ? avg.toFixed(2) : '—';

    // 분포표
    distFootCount.textContent = total.toLocaleString();
    distTbody.innerHTML = GRADES.map((g, i) => {
      const c = counts[i];
      const pct = total > 0 ? (c / total) * 100 : 0;
      const zero = c === 0 ? ' zero' : '';
      return `<tr class="grade-${g}${zero}">
        <td>${g}등급</td>
        <td>${c.toLocaleString()}</td>
        <td>${pct.toFixed(1)}%<div class="bar"><i style="width:${pct.toFixed(2)}%"></i></div></td>
      </tr>`;
    }).join('');

    // Chart.js
    chartEmpty.classList.remove('show');
    if (chart) chart.destroy();
    const ctx = document.getElementById('gradeChart').getContext('2d');
    const bg = GRADES.map(g => gradeColor(g, 0.85));
    const border = GRADES.map(g => gradeColor(g, 1));
    chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: GRADES.map(g => `${g}등급`),
        datasets: [{
          data: counts,
          backgroundColor: bg,
          borderColor: border,
          borderWidth: 0,
          borderRadius: 6,
          maxBarThickness: 56,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 350, easing: 'easeOutQuart' },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(28,25,23,0.92)',
            padding: 10,
            titleFont: { size: 12, weight: '600' },
            bodyFont: { size: 12 },
            callbacks: {
              label: ctx => {
                const c = counts[ctx.dataIndex];
                const pct = total > 0 ? ((c / total) * 100).toFixed(1) : '0.0';
                return `${c.toLocaleString()}명 (${pct}%)`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: { size: 11.5, family: 'Pretendard' }, color: '#57534e' },
          },
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(0,0,0,0.05)' },
            ticks: {
              precision: 0,
              font: { size: 11, family: 'Geist Mono' },
              color: '#a8a29e',
            },
          },
        },
      },
      plugins: [{
        id: 'value-labels',
        afterDatasetsDraw(chart) {
          const ctx = chart.ctx;
          const meta = chart.getDatasetMeta(0);
          ctx.save();
          ctx.fillStyle = '#1c1917';
          ctx.font = '600 11px Geist Mono';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          meta.data.forEach((bar, i) => {
            const c = counts[i];
            if (c > 0) {
              ctx.fillText(`${c}`, bar.x, bar.y - 4);
            }
          });
          ctx.restore();
        },
      }],
    });
  }

  // ── 이벤트 ──
  // year/exam combobox 는 onChange 로 처리

  catTabs.addEventListener('click', e => {
    const btn = e.target.closest('.cat-tab');
    if (!btn) return;
    renderCat(btn.dataset.cat);
  });

  subjChips.addEventListener('click', e => {
    const chip = e.target.closest('.subj-chip');
    if (!chip) return;
    selectSubject(chip.dataset.subj);
  });

  // ── 초기: 학년도 디폴트 + 시행 완료된 가장 최근 모형 ──
  STATE.year = yearSel.value || '2027';
  applyDefaultExamFor(STATE.year);
  load();
})();
