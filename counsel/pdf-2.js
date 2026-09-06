

  async function generateCounselPDF() {
    if (!STATE.selectedStudent) {
      showToast('학생을 먼저 선택하세요', 'error');
      return;
    }
    const allCards = document.querySelectorAll('#gunBoard .uni-card-shell');
    if (!allCards.length) {
      showToast('담긴 학교가 없어요', 'error');
      return;
    }
    const btn = document.getElementById('btnExportPDF');
    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span>생성 중...</span><span class="nest"><i class="ph-light ph-circle-notch spin"></i></span>';

    try {
      /* ─── 데이터 수집 + 파라미터 준비 (서버/로컬 공통) ─── */
      const s = STATE.selectedStudent;
      const year = document.getElementById('yearSel').value;
      const exam = document.getElementById('examSel').value;
      const examLabel = exam === '수능' ? '수능' : exam === '9월' ? '9월 모의평가' : exam === '6월' ? '6월 모의평가' : exam === '3월' ? '3월 학력평가' : exam;

      const student = {
        name: s.student_name || '-',
        school: s.school_name || '-',
        grade: (s.grade || '-') + '학년',
        gender: s.gender || '-',
        year: year + '학년도',
        exam: examLabel,
      };

      const sc = s.scores || {};
      const score = {
        korean:   { subject:'국어',   choice:sc.국어_선택과목   || null, std:sc.국어_표준점수 ?? null, pct:sc.국어_백분위 ?? null, grade:sc.국어_등급 ?? null },
        math:     { subject:'수학',   choice:sc.수학_선택과목   || null, std:sc.수학_표준점수 ?? null, pct:sc.수학_백분위 ?? null, grade:sc.수학_등급 ?? null },
        english:  { subject:'영어',   choice:null,                        std:null,                    pct:null,                    grade:sc.영어_등급 ?? null },
        inquiry1: { subject:'탐구1',  choice:sc.탐구1_선택과목  || null, std:sc.탐구1_표준점수 ?? null, pct:sc.탐구1_백분위 ?? null, grade:sc.탐구1_등급 ?? null },
        inquiry2: { subject:'탐구2',  choice:sc.탐구2_선택과목  || null, std:sc.탐구2_표준점수 ?? null, pct:sc.탐구2_백분위 ?? null, grade:sc.탐구2_등급 ?? null },
        history:  { subject:'한국사', choice:null,                        std:null,                    pct:null,                    grade:sc.한국사_등급 ?? null },
      };
      window._PDF_SCORE_CACHE = score;

      const univs = { ga: [null, null, null], na: [null, null, null], da: [null, null, null] };
      ['col-ga', 'col-na', 'col-da'].forEach((colId, idx) => {
        const key = ['ga', 'na', 'da'][idx];
        const cardsInGun = document.querySelectorAll(`#${colId} .uni-card-shell`);
        cardsInGun.forEach((card, i) => {
          if (i >= 3) return;
          univs[key][i] = extractPdfCardData(card, year);
        });
      });
      const gunsWithCards = ['ga', 'na', 'da'].filter(g => univs[g].some(Boolean));
      const totalPages = gunsWithCards.length;

      let logoData = null;
      try {
        const txt = await fetch('top_logo.txt').then(r => r.text());
        if (txt && txt.trim().startsWith('data:image')) logoData = txt.trim();
      } catch {}

      const counselor = getCounselorFromToken();
      const todayStr = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\s/g, '').replace(/\./g, ' . ').replace(/ . $/, '');
      const stats = {
        ga: univs.ga.filter(Boolean).length,
        na: univs.na.filter(Boolean).length,
        da: univs.da.filter(Boolean).length,
      };
      stats.total = stats.ga + stats.na + stats.da;

      const pagesHtml = pdfRenderCoverPage(student, counselor, stats, logoData, todayStr) +
        gunsWithCards.map((g, i) =>
          pdfRenderGunPage(g, univs[g], student, i + 1, totalPages, logoData)
        ).join('');
      const fileBase = `맥스정시_상담지_${s.student_name || 'student'}_${year}${exam}`;

      /* ─── 1) 서버 사이드 Puppeteer 렌더 시도 (고품질) ─── */
      try {
        const fullHtml = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.css">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap">
<style>${PDF_CSS}</style>
<style>html,body{margin:0;padding:0;background:#fff;}
.pdf-stage{display:block;}
.pdf-stage .page{page-break-after:always;break-after:page;}
.pdf-stage .page:last-child{page-break-after:auto;break-after:auto;}
@page{size:A4 landscape;margin:0;}</style>
</head><body><div class="pdf-stage">${pagesHtml}</div></body></html>`;

        const token = getToken();
        const resp = await fetch(SVR + '/jungsi/counseling/render-pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ html: fullHtml, filename: fileBase }),
        });
        if (resp.ok && (resp.headers.get('content-type') || '').includes('pdf')) {
          const blob = await resp.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = fileBase + '.pdf';
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          showToast(`PDF 저장 완료 (${totalPages + 1}페이지)`, 'success');
          return;
        }
        throw new Error('서버 응답 ' + resp.status);
      } catch (serverErr) {
        console.warn('[PDF] 서버 렌더 실패, 로컬 폴백:', serverErr.message);
        showToast('서버 렌더 실패, 로컬 생성 중…', 'info');
      }

      /* ─── 2) Fallback: 로컬 html2canvas + jsPDF (서버 장애 대비) ─── */
      const stage = document.createElement('div');
      stage.className = 'pdf-stage';
      stage.style.cssText = 'position:absolute; left:-99999px; top:0; background:#ffffff; overflow:visible;';
      stage.innerHTML = `<style>${PDF_CSS}</style>` + pagesHtml;
      document.body.appendChild(stage);

      await document.fonts.ready.catch(() => {});
      await Promise.all([
        document.fonts.load('700 20px Pretendard').catch(() => null),
        document.fonts.load('600 13px Geist').catch(() => null),
        document.fonts.load('500 12px "Geist Mono"').catch(() => null),
      ]);

      const imgs = stage.querySelectorAll('img');
      await Promise.all([...imgs].map(img => new Promise(r => {
        if (img.complete && img.naturalWidth > 0) r();
        else { img.onload = r; img.onerror = r; setTimeout(r, 3000); }
      })));
      await new Promise(r => setTimeout(r, 200));

      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pages = stage.querySelectorAll('.page');
      for (let i = 0; i < pages.length; i++) {
        const el = pages[i];
        const w = el.offsetWidth;
        const h = el.offsetHeight;
        const canvas = await html2canvas(el, {
          scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false,
          width: w, height: h, windowWidth: w, windowHeight: h,
          scrollX: 0, scrollY: 0, x: 0, y: 0,
        });
        const imgData = canvas.toDataURL('image/png');
        if (i > 0) pdf.addPage('a4', 'landscape');
        pdf.addImage(imgData, 'PNG', 0, 0, 297, 210, undefined, 'FAST');
      }
      stage.remove();
      pdf.save(fileBase + '.pdf');
      showToast(`PDF 저장 완료 (${totalPages}페이지, 로컬)`, 'success');
    } catch (e) {
      console.error('[PDF]', e);
      showToast('PDF 생성 실패: ' + e.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  }
