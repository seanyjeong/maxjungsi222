(function (root, factory) {
  const service = factory();
  if (typeof module === 'object' && module.exports) module.exports = service;
  if (root) root.CutoffSave = service;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const BRANCH_FIELDS = ['지점_수능컷', '지점_총점컷'];
  const MAX_FIELDS = ['맥스_수능컷', '맥스_총점컷', '25년총점컷', '26년총점컷'];
  const SAVE_ERROR = '컷 점수를 저장하지 못했습니다. 입력값은 유지되어 있으니 잠시 후 다시 저장해 주세요.';
  const VERIFY_ERROR = '저장한 점수를 확인하지 못했습니다. 입력값을 확인한 뒤 다시 저장해 주세요.';

  function normalizeScore(value) {
    if (value == null || String(value).trim() === '') return null;
    if (!['number', 'string'].includes(typeof value) || !Number.isFinite(Number(value))) {
      throw new Error('컷 점수를 숫자로 입력해 주세요.');
    }
    const number = Number(value);
    if (Math.abs(number * 100 - Math.round(number * 100)) > 0.000001) {
      throw new Error('컷 점수는 소수점 둘째 자리까지 입력해 주세요.');
    }
    return number;
  }

  function buildUpdates(changes, rows, isAdmin) {
    const fields = isAdmin ? MAX_FIELDS : BRANCH_FIELDS;
    return changes.map(change => {
      const row = rows.find(item => Number(item.U_ID) === Number(change.U_ID));
      if (!row) throw new Error(VERIFY_ERROR);
      if (Object.keys(change).some(key => key !== 'U_ID' && !fields.includes(key))) {
        throw new Error('수정할 수 있는 컷 항목을 확인해 주세요.');
      }
      const update = { U_ID: Number(row.U_ID) };
      // 기존 저장기는 부분 수정 요청을 건너뛰므로 같은 범위의 기존 값도 함께 보낸다.
      fields.forEach(field => {
        if (!Object.hasOwn(row, field)) throw new Error(VERIFY_ERROR);
        update[field] = normalizeScore(Object.hasOwn(change, field) ? change[field] : row[field]);
      });
      return update;
    });
  }

  function verifySaved(updates, rows) {
    return updates.every(update => {
      const saved = rows.find(row => Number(row.U_ID) === update.U_ID);
      return saved && Object.entries(update).every(([key, value]) =>
        key === 'U_ID' || (Object.hasOwn(saved, key) && normalizeScore(saved[key]) === value));
    });
  }

  async function readCuts(api, year) {
    const response = await api('/jungsi/cutoffs/' + year, { cache: 'no-store' });
    if (!response || response.success !== true || !Array.isArray(response.cutoffs)) {
      throw new Error(VERIFY_ERROR);
    }
    return response.cutoffs;
  }

  async function saveChanges(api, year, changes, isAdmin) {
    const current = await readCuts(api, year);
    const updates = buildUpdates(changes, current, isAdmin);
    const response = await api('/jungsi/cutoffs/set', {
      method: 'POST', body: JSON.stringify({ year, updates }),
    });
    if (!response || response.success !== true) throw new Error(SAVE_ERROR);
    const cutoffs = await readCuts(api, year);
    if (!verifySaved(updates, cutoffs)) throw new Error(VERIFY_ERROR);
    return { updates, cutoffs };
  }

  return { buildUpdates, normalizeScore, verifySaved, saveChanges, SAVE_ERROR, VERIFY_ERROR };
});
