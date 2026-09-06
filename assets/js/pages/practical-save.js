(function (root, factory) {
  const service = factory();
  if (typeof module === 'object' && module.exports) module.exports = service;
  if (root) root.PracticalSave = service;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const LIMITS = { 종목명: 100, 기록: 50, 배점: 50 };
  const SAVE_ERROR = '배점표를 저장하지 못했습니다. 입력값은 유지되어 있으니 잠시 후 다시 저장해 주세요.';
  const VERIFY_ERROR = '저장한 배점표를 확인하지 못했습니다. 입력값을 확인한 뒤 다시 저장해 주세요.';
  const text = value => value == null ? '' : String(value);

  function buildUpdates(changes, rows) {
    return changes.map(change => {
      const current = rows.find(row => Number(row.id) === Number(change.id));
      if (!current || Object.keys(change).some(key => key !== 'id' && !Object.hasOwn(LIMITS, key))) {
        throw new Error(VERIFY_ERROR);
      }
      const update = { id: Number(current.id), 성별: current.성별 };
      for (const [field, limit] of Object.entries(LIMITS)) {
        if (Object.hasOwn(change, field)) {
          const value = text(change[field]).trim();
          if (!value || [...value].length > limit) throw new Error(`${field}을(를) ${limit}자 이내로 입력해 주세요.`);
          update[field] = value;
        } else update[field] = current[field];
      }
      return update;
    });
  }

  async function readRows(api, uid, year) {
    const result = await api(`/jungsi/practical-scores/${encodeURIComponent(uid)}/${encodeURIComponent(year)}`, { cache: 'no-store' });
    if (result?.success !== true || !Array.isArray(result.scores)) throw new Error(VERIFY_ERROR);
    return result.scores;
  }

  async function saveChanges(api, uid, year, changes) {
    // 선택 학교·학년도의 최신 행에서만 수정 대상을 찾고, 다른 값은 보존한다.
    const updates = buildUpdates(changes, await readRows(api, uid, year));
    const result = await api('/jungsi/admin/practical-table/bulk-update', {
      method: 'POST', body: JSON.stringify({ U_ID: uid, year, updates, additions: [], deletions: [] }),
    });
    if (result?.success !== true) throw new Error(SAVE_ERROR);
    const rows = await readRows(api, uid, year);
    if (!updates.every(update => {
      const saved = rows.find(row => Number(row.id) === update.id);
      return saved && ['종목명', '성별', '기록', '배점'].every(field =>
        Object.hasOwn(saved, field) && text(saved[field]) === text(update[field]));
    })) throw new Error(VERIFY_ERROR);
    return rows;
  }
  return { buildUpdates, saveChanges, SAVE_ERROR, VERIFY_ERROR };
});
