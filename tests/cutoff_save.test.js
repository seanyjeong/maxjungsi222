const { test } = require('node:test');
const assert = require('node:assert/strict');
const service = require('../assets/js/pages/cutoff-save.js');

test('single branch change uses fresh sibling value, including zero and clear', async () => {
  let row = { U_ID: 11, 지점_수능컷: '291.20', 지점_총점컷: '850.00' };
  const calls = [];
  const api = async (path, options) => {
    calls.push([path, options]);
    if (options.method === 'POST') {
      row = JSON.parse(options.body).updates[0];
      return { success: true };
    }
    return { success: true, cutoffs: [row] };
  };
  await service.saveChanges(api, '2027', [{ U_ID: 11, 지점_총점컷: '0' }], false);
  assert.deepEqual(row, { U_ID: 11, 지점_수능컷: 291.2, 지점_총점컷: 0 });
  assert.equal(calls[0][1].cache, 'no-store');
  await service.saveChanges(api, '2027', [{ U_ID: 11, 지점_총점컷: '' }], false);
  assert.equal(row.지점_총점컷, null);
});

test('rejects forbidden fields, missing rows and invalid decimals before saving', () => {
  const rows = [{ U_ID: 11, 지점_수능컷: 280, 지점_총점컷: 850 }];
  for (const change of [{ U_ID: 12, 지점_총점컷: 800 },
    { U_ID: 11, 맥스_총점컷: 800 }, { U_ID: 11, 지점_총점컷: '800oops' },
    { U_ID: 11, 지점_총점컷: '800.123' }]) {
    assert.throws(() => service.buildUpdates([change], rows, false));
  }
});

test('success response without persisted values does not clear the draft', async () => {
  const row = { U_ID: 11, 지점_수능컷: 280, 지점_총점컷: 850 };
  const draft = [{ U_ID: 11, 지점_총점컷: '865' }];
  const api = async (_path, options) => options.method === 'POST'
    ? { success: true } : { success: true, cutoffs: [row] };
  await assert.rejects(service.saveChanges(api, '2027', draft, false), {
    message: service.VERIFY_ERROR,
  });
  assert.equal(draft[0].지점_총점컷, '865');
});
