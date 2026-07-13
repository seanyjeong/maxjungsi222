const assert = require('node:assert/strict');
const test = require('node:test');

const results = require('../school_app_final-results.js');

test('resultTier keeps pass, wait, fail, and undecided ordering', () => {
  assert.equal(results.resultTier({ result_final: '합격' }), 1);
  assert.ok(results.resultTier({ result_first: '예비 3' }) > 2);
  assert.equal(results.resultTier({ result_final: '불합격' }), 3);
  assert.equal(results.resultTier({}), 99);
});

test('detectAnomalySet flags a lower-score pass below a failed applicant', () => {
  const anomalies = results.detectAnomalySet([
    { total_score: 100, result_final: '불합격' },
    { total_score: 90, result_final: '합격' },
  ]);
  assert.deepEqual([...anomalies], [1]);
});
