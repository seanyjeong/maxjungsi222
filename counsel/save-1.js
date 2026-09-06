

  /* 저장 인디케이터 상태 */
  function setSaving() {
    const saveInd = document.querySelector('.save-indicator');
    if (!saveInd) return;
    saveInd.innerHTML = '<i class="ph-light ph-circle-notch spin"></i> 저장 중...';
  }
  function markSaved() {
    _lastSavedAt = Date.now();
    renderSaveRelative();
  }
  function renderSaveRelative() {
    if (!_lastSavedAt) return;
    const saveInd = document.querySelector('.save-indicator');
    if (!saveInd) return;
    const sec = Math.max(1, Math.floor((Date.now() - _lastSavedAt) / 1000));
    const ago = sec < 60 ? `${sec}초 전` : sec < 3600 ? `${Math.floor(sec/60)}분 전` : `${Math.floor(sec/3600)}시간 전`;
    saveInd.innerHTML = `<i class="ph-light ph-cloud-check"></i> 저장됨 · ${ago}`;
  }
  function markSaveError(msg) {
    const saveInd = document.querySelector('.save-indicator');
    if (!saveInd) return;
    saveInd.innerHTML = `<i class="ph-light ph-warning-circle" style="color:var(--danger)"></i> 저장 실패`;
    showToast('저장 실패: ' + humanizeSaveError(msg), 'error');
  }

  function humanizeSaveError(msg) {
    const fallback = '상담 목록을 저장하지 못했습니다. 잠시 후 다시 시도해주세요.';
    if (!msg) return fallback;
    const text = String(msg).trim();
    if (!text || /^(DB|SQL|HTTP|ER_|TypeError|SyntaxError|Failed to load resource)/i.test(text)) {
      return fallback;
    }
    return text;
  }

  async function fakeSave() {
    // 호환용 stub — 실제 저장은 saveWishlistNow 사용
    return saveWishlistNow();
  }

  async function saveWishlistNow() {
    if (!STATE.selectedStudent) return;
    const pending = [...document.querySelectorAll('#gunBoard .uni-card')].some(card =>
      card.dataset.practicalStatus && card.dataset.practicalStatus !== 'ready');
    if (pending) {
      const indicator = document.querySelector('.save-indicator');
      if (indicator) indicator.textContent = '저장 대기 · 실기 기록과 계산 상태를 확인해 주세요.';
      return;
    }
    if (_savingInFlight) { _pendingSave = true; return; }
    _savingInFlight = true;
    setSaving();

    const studentId = STATE.selectedStudent.student_id;
    const year = document.getElementById('yearSel').value;
    const exam = document.getElementById('examSel').value;
    const items = [];

    document.querySelectorAll('#gunBoard .uni-card-shell').forEach(card => {
      const uid = card.dataset.uid;
      const col = card.closest('.gun-column');
      const colId = col?.id || '';
      const 모집군 = colId === 'col-ga' ? '가' : colId === 'col-na' ? '나' : colId === 'col-da' ? '다' : '';
      if (!모집군 || !uid) return;

      const naInput = card.querySelector('[data-field="naeshin"]');
      const naVal = (naInput && naInput.value.trim() !== '') ? Number(naInput.value) : null;

      const silgiObj = {};
      card.querySelectorAll('[data-event]').forEach(inp => {
        if (inp.value && inp.value.trim() !== '') silgiObj[inp.dataset.event] = inp.value.trim();
      });

      const suText = card.querySelector('.score-suneung')?.textContent || '0';
      const su = Number(suText) || 0;
      const silgiText = card.querySelector('.score-silgi')?.textContent || '0';
      const m = silgiText.match(/[\d\.]+/);
      const silgiNum = m ? Number(m[0]) : 0;
      const totalText = card.querySelector('.score-total')?.textContent || '0';
      const total = Number(totalText) || 0;
      const memoVal = card.querySelector('.uni-memo')?.value?.trim() || null;

      items.push({
        모집군,
        대학학과_ID: uid,
        상담_수능점수: su,
        상담_내신점수: naVal,
        상담_실기기록: Object.keys(silgiObj).length ? silgiObj : null,
        상담_실기반영점수: silgiNum,
        상담_계산총점: total,
        메모: memoVal,
      });
    });

    try {
      const d = await api('/jungsi/counseling/wishlist/bulk-save', {
        method: 'POST',
        body: JSON.stringify({ 학생_ID: studentId, 학년도: year, 모형: exam, wishlistItems: items }),
      });
      if (d.success) {
        markSaved();
      } else {
        markSaveError(d.message || '');
      }
    } catch (e) {
      if (e.message !== 'auth') {
        console.error('[save]', e);
        markSaveError(e.message || '');
      }
    } finally {
      _savingInFlight = false;
      if (_pendingSave) {
        _pendingSave = false;
        saveWishlistNow();
      }
    }
  }
  function triggerAutoSave() {
    clearTimeout(_saveTimer);
    setSaving();
    _saveTimer = setTimeout(saveWishlistNow, 1500);
  }
