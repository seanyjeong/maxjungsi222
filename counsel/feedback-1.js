

  /* ====== MULTISELECT ====== */
  function positionDropdown(ms) {
    const display = ms.querySelector('.multi-select-display');
    const dropdown = ms.querySelector('.multi-select-dropdown');
    if (!display || !dropdown) return;
    const rect = display.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const dropdownMaxHeight = 260;
    const needAbove = spaceBelow < dropdownMaxHeight + 20 && rect.top > dropdownMaxHeight + 20;

    dropdown.style.width = rect.width + 'px';
    dropdown.style.left = rect.left + 'px';
    if (needAbove) {
      dropdown.style.top = 'auto';
      dropdown.style.bottom = (window.innerHeight - rect.top + 4) + 'px';
    } else {
      dropdown.style.bottom = 'auto';
      dropdown.style.top = (rect.bottom + 4) + 'px';
    }
  }

  /* 평균 백분위 조합 중 최고값에 primary 강조 (영어 제외) */
  function highlightTopCombo() {
    const pills = document.querySelectorAll('.pct-combos .combo-pill:not(.english)');
    let maxVal = -Infinity, maxEl = null;
    pills.forEach(p => {
      p.classList.remove('primary');
      if (p.hidden) return;
      const val = parseFloat(p.querySelector('.pct')?.textContent || '0');
      if (!isNaN(val) && val > maxVal) { maxVal = val; maxEl = p; }
    });
    if (maxEl) maxEl.classList.add('primary');
  }
  function showToast(message, type = 'success') {
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    const icon = type === 'success' ? 'ph-fill ph-check-circle'
               : type === 'error'   ? 'ph-fill ph-warning-circle'
               : 'ph-fill ph-info';
    t.innerHTML = `<div class="toast-inner"><i class="${icon}"></i><span>${message}</span></div>`;
    toastContainer.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => t.remove(), 360);
    }, 2600);
  }

  /* ====== 초기 로드 + 이벤트 ====== */
  // 년도 변경 시 해당 년도의 최신 시행된 모형으로 자동 변경 (utils/examSchedule.js)
  function applyDefaultExam() {
    const year = parseInt(document.getElementById('yearSel').value);
    if (typeof getDefaultExam === 'function') {
      const defExam = getDefaultExam(year);
      document.getElementById('examSel').value = defExam;
    }
  }
