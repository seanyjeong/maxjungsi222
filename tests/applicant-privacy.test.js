const assert = require('node:assert/strict');
const test = require('node:test');

const privacy = require('../applicant-privacy.js');

test('applicant privacy masks name, branch, and school exactly', () => {
  assert.equal(privacy.maskName('김민수'), '김○수');
  assert.equal(privacy.maskName('김민'), '김○');
  assert.equal(privacy.maskBranch('수원'), '○○');
  assert.equal(privacy.maskBranch('서울북부'), '○○');
  assert.equal(privacy.maskSchool('행복고'), '행X고');
  assert.equal(privacy.maskSchool('서라벌고등학교'), '서X벌고등학교');
});

test('maskApplicant preserves the API object and masks English field names', () => {
  const applicant = { name: '김민수', branch: '수원', school_name: '서라벌고등학교', total_score: 100 };
  const masked = privacy.maskApplicant(applicant);
  assert.deepEqual(masked, {
    name: '김○수',
    branch: '○○',
    school_name: '서X벌고등학교',
    total_score: 100,
  });
  assert.equal(applicant.name, '김민수');
});

test('verifyOwnerPassword reauthenticates without replacing the session token', async () => {
  let request;
  const result = await privacy.verifyOwnerPassword({
    apiBase: 'https://supermax.kr',
    fetchFn: async (url, options) => {
      request = { url, options };
      return { status: 200, json: async () => ({ success: true, token: 'new-token' }) };
    },
    userid: 'owner-1',
    password: 'correct-password',
  });

  assert.equal(result, true);
  assert.equal(request.url, 'https://supermax.kr/susi/login');
  assert.deepEqual(JSON.parse(request.options.body), {
    userid: 'owner-1',
    password: 'correct-password',
  });
});

test('verifyOwnerPassword exposes only Korean plain-language failures', async () => {
  await assert.rejects(
    privacy.verifyOwnerPassword({
      apiBase: 'https://supermax.kr',
      fetchFn: async () => ({ status: 401, json: async () => ({ success: false }) }),
      userid: 'owner-1',
      password: 'wrong-password',
    }),
    /비밀번호가 올바르지 않습니다/
  );
});
