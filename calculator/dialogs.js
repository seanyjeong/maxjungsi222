'use strict';
window.createCalculatorDialogs = function ({ esc, examSelect, yearSelect, gunSelect, convertScoresToSuneungFormat, getFormula, getStudents }) {
function openStudentScoresModal(student) {
    const currentFormula = getFormula(), currentStudents = getStudents();
    const modal = document.getElementById('studentScoresModal');
    if (!modal) return;
    const nameEl = document.getElementById('scoresModalName');
    const metaEl = document.getElementById('scoresModalMeta');
    const bodyEl = document.getElementById('scoresModalBody');
    const gender = student.gender || '';
    const genderClass = gender === '여' ? 'f' : 'm';
    const initial = student.student_name ? student.student_name.charAt(0) : '·';
    nameEl.innerHTML = `
      <span class="sc-avatar sc-avatar-${genderClass}">${esc(initial)}</span>
      <span class="sc-name-text">${esc(student.student_name || '—')}</span>
      <span class="sc-gender-chip sc-gender-${genderClass}">${esc(gender || '-')}</span>
    `;
    const examText = examSelect.value ? examSelect.value : '수능';
    const s = student.scores;
    const inputTypeLabel = s && s['입력유형'] === 'official' ? '성적표' : s && s['입력유형'] === 'raw' ? '가채점' : '';
    const inputTypeClass = s && s['입력유형'] === 'official' ? 'official' : 'raw';
    const chips = [
      student.school_name ? `<span class="sc-chip"><i class="ph-light ph-graduation-cap"></i>${esc(student.school_name)}</span>` : '',
      `<span class="sc-chip"><i class="ph-light ph-calendar-dot"></i>${esc(yearSelect.value)}학년도</span>`,
      `<span class="sc-chip"><i class="ph-light ph-exam"></i>${esc(examText)}</span>`,
      inputTypeLabel ? `<span class="sc-chip sc-input-${inputTypeClass}"><i class="ph-light ph-clipboard-text"></i>${esc(inputTypeLabel)}</span>` : '',
    ].filter(Boolean).join('');
    metaEl.innerHTML = chips;

    if (!s) {
      bodyEl.innerHTML = `<div class="modal-empty"><i class="ph-light ph-file-dashed"></i><p>해당 학년도·모형 성적이 없습니다.</p></div>`;
    } else {
      const fmtCell = (v) => (v === null || v === undefined || v === '') ? '<span class="sc-dash">—</span>' : esc(String(v));
      const gradeCell = (v) => {
        if (v === null || v === undefined || v === '') return '<span class="sc-dash">—</span>';
        const n = Number(v);
        const tier = isFinite(n) ? (n <= 2 ? 'top' : n <= 4 ? 'mid' : 'low') : '';
        return `<span class="sc-grade-pill sc-grade-${tier}">${esc(String(v))}</span>`;
      };
      const row = (icon, label, sub, raw, std, pct, grade) => `
        <tr>
          <th class="sc-label">
            <i class="ph-light ${icon}"></i>
            <div>
              <div class="sc-label-name">${esc(label)}</div>
              ${sub ? `<div class="sc-sub">${esc(sub)}</div>` : ''}
            </div>
          </th>
          <td>${fmtCell(raw)}</td>
          <td>${fmtCell(std)}</td>
          <td>${fmtCell(pct)}</td>
          <td class="sc-grade-cell">${gradeCell(grade)}</td>
        </tr>`;
      bodyEl.innerHTML = `
        <div class="scores-wrap">
          <div class="scores-table-wrap">
            <table class="scores-table">
              <thead>
                <tr><th>영역</th><th>원점수</th><th>표준</th><th>백분위</th><th>등급</th></tr>
              </thead>
              <tbody>
                ${row('ph-book-open-text', '국어',   s['국어_선택과목'],   s['국어_원점수'],   s['국어_표준점수'],   s['국어_백분위'],   s['국어_등급'])}
                ${row('ph-function',       '수학',   s['수학_선택과목'],   s['수학_원점수'],   s['수학_표준점수'],   s['수학_백분위'],   s['수학_등급'])}
                ${row('ph-globe-hemisphere-west', '영어', '',           s['영어_원점수'],   null,                null,                s['영어_등급'])}
                ${row('ph-flask',          '탐구1', s['탐구1_선택과목'], s['탐구1_원점수'], s['탐구1_표준점수'], s['탐구1_백분위'], s['탐구1_등급'])}
                ${row('ph-flask',          '탐구2', s['탐구2_선택과목'], s['탐구2_원점수'], s['탐구2_표준점수'], s['탐구2_백분위'], s['탐구2_등급'])}
                ${row('ph-scroll',         '한국사', '',                 s['한국사_원점수'], null,                null,                s['한국사_등급'])}
              </tbody>
            </table>
          </div>
        </div>`;
    }
    modal.classList.add('show');
  }

async function openConsultationDraftModal(tr) {
    const currentFormula = getFormula(), currentStudents = getStudents();
    if (!currentFormula || !tr) return;
    const sid = tr.dataset.studentId;
    const student = currentStudents.find(s => String(s.student_id) === String(sid));
    if (!student) return;

    const modal = document.getElementById('consultationDraftModal');
    const titleEl = document.getElementById('consultModalTitle');
    const metaEl = document.getElementById('consultModalMeta');
    const tabsEl = document.getElementById('consultModeTabs');
    const textEl = document.getElementById('consultDraftText');
    const safetyEl = document.getElementById('consultSafetyNote');
    if (!modal || !tabsEl || !textEl) return;

    titleEl.textContent = `${student.student_name || '학생'} · ${currentFormula.대학명 || ''} ${currentFormula.학과명 || ''}`.trim();
    metaEl.innerHTML = [
      `<span class="sc-chip"><i class="ph-light ph-calendar-dot"></i>${esc(yearSelect.value)}학년도</span>`,
      `<span class="sc-chip"><i class="ph-light ph-target"></i>${esc(gunSelect.value || '')}군</span>`,
      `<span class="sc-chip"><i class="ph-light ph-exam"></i>${esc(examSelect.value || '수능')}</span>`,
    ].join('');
    modal.classList.add('show');

    const renderTabs = (active) => {
      const modes = [
        { id: 'internal', label: '내부용' },
        { id: 'external_parent', label: '외부용' },
        { id: 'student_short', label: '학생용' },
        { id: 'sms', label: '카톡 5줄' },
      ];
      tabsEl.innerHTML = modes.map(m => `<button type="button" class="consult-mode-btn ${m.id === active ? 'is-active' : ''}" data-consult-mode="${m.id}">${m.label}</button>`).join('');
    };

    const buildPracticalInput = () => {
      const practicals = [];
      tr.querySelectorAll('.practical-input').forEach(input => {
        practicals.push({ event: input.dataset.event, value: input.value });
      });
      return { gender: student.gender, practicals };
    };

    const requestDraft = async (mode) => {
      renderTabs(mode);
      textEl.textContent = '상담멘트 생성 중…';
      if (safetyEl) safetyEl.textContent = '';
      if (window.SubjectivePractical?.getPolicy(currentFormula)) {
        textEl.textContent = window.CalculatorSubjectivePractical.draft(tr, currentFormula);
        if (safetyEl) safetyEl.textContent = '주관평가를 제외한 객관점수 안내입니다. 최종총점과 합격 가능성은 산출하지 않습니다.';
        return;
      }
      try {
        const data = await window.api('/jungsi/analysis/consultation-draft', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode,
            U_ID: currentFormula.U_ID,
            year: yearSelect.value,
            basis_exam: examSelect.value,
            student: {
              name: student.student_name,
              gender: student.gender,
              schoolName: student.school_name,
            },
            studentScores: convertScoresToSuneungFormat(student.scores),
            S_data: buildPracticalInput(),
            includeMaxLive: mode === 'internal',
          })
        });
        if (!data || !data.success) throw new Error((data && data.message) || '생성 실패');
        textEl.textContent = data.text || '';
        if (safetyEl) safetyEl.textContent = data.safety?.note || '';
      } catch (err) {
        console.error(err);
        textEl.textContent = `상담멘트 생성 실패: ${err.message || err}`;
        window.showToast && window.showToast('상담멘트 생성 실패', 'error');
      }
    };

    tabsEl.onclick = (ev) => {
      const btn = ev.target.closest('[data-consult-mode]');
      if (!btn) return;
      requestDraft(btn.dataset.consultMode);
    };
    const copyBtn = document.getElementById('consultCopyBtn');
    if (copyBtn) {
      copyBtn.onclick = async () => {
        try {
          await navigator.clipboard.writeText(textEl.textContent || '');
          window.showToast && window.showToast('상담멘트를 복사했습니다', 'success');
        } catch (_err) {
          window.showToast && window.showToast('복사 실패', 'error');
        }
      };
    }
    await requestDraft('external_parent');
  }
return { openStudentScoresModal, openConsultationDraftModal };
};
