const { test } = require('node:test');
const assert = require('node:assert/strict');
const service = require('../assets/js/pages/practical-save.js');
const original = { id: 1, 종목명: '실기', 성별: 'F', 기록: 'A', 배점: 'PASS' };

test('updates existing IDs only and preserves fresh strings and gender', async () => {
  let rows = [{ ...original }];
  const calls = [];
  const api = async (path, options) => {
    calls.push([path, options]);
    if (options.method === 'POST') {
      const payload = JSON.parse(options.body);
      assert.deepEqual(payload.additions, []);
      assert.deepEqual(payload.deletions, []);
      assert.equal(payload.U_ID, '3');
      assert.equal(payload.year, '2027');
      rows = payload.updates;
      return { success: true };
    }
    return { success: true, scores: rows };
  };
  assert.deepEqual(await service.saveChanges(api, '3', '2027', [{ id: 1, 종목명: '다른 종목', 배점: '0' }]),
    [{ ...original, 종목명: '다른 종목', 배점: '0' }]);
  assert.equal(calls.length, 3);
  assert.equal(calls[0][1].cache, 'no-store');
  assert.equal(calls[1][0], '/jungsi/admin/practical-table/bulk-update');
});

test('rejects missing IDs, unknown fields, blank edits and DB length overflow', () => {
  for (const change of [{ id: 9, 기록: '12' }, { id: 1, U_ID: 9 },
    { id: 1, 성별: '남' }, { id: 1, 종목명: '   ' }, { id: 1, 기록: '1'.repeat(51) }]) {
    assert.throws(() => service.buildUpdates([change], [original]));
  }
});

test('preserves untouched nullable records', () => {
  const updates = service.buildUpdates([{ id: 1, 종목명: '새 종목' }], [{ ...original, 기록: null }]);
  assert.equal(updates[0].기록, null);
});

test('false success and missing verification rows fail without modifying draft', async () => {
  for (const afterRows of [[original], []]) {
    let reads = 0;
    const draft = [{ id: 1, 기록: 'B' }];
    const api = async (_path, options) => options.method === 'POST'
      ? { success: true } : { success: true, scores: ++reads === 1 ? [original] : afterRows };
    await assert.rejects(service.saveChanges(api, '3', '2027', draft), { message: service.VERIFY_ERROR });
    assert.deepEqual(draft, [{ id: 1, 기록: 'B' }]);
  }
});
