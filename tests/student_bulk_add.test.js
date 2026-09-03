'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildStudentIdentityKey,
  createStudentBulkAddHandler,
  normalizeIdentityText,
} = require('../_vultr_backend/student_bulk_add.js');

function createResponse() {
  return {
    body: null,
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function createConnection(existingStudents = []) {
  const calls = [];
  const connection = {
    calls,
    committed: false,
    released: false,
    rolledBack: false,
    async beginTransaction() {
      calls.push({ type: 'begin' });
    },
    async commit() {
      this.committed = true;
      calls.push({ type: 'commit' });
    },
    async rollback() {
      this.rolledBack = true;
      calls.push({ type: 'rollback' });
    },
    release() {
      this.released = true;
      calls.push({ type: 'release' });
    },
    async query(sql, params) {
      calls.push({ type: 'query', sql, params });
      if (sql.includes('GET_LOCK')) return [[{ acquired_lock: 1 }]];
      if (sql.includes('RELEASE_LOCK')) return [[{ released_lock: 1 }]];
      if (sql.includes('SELECT student_name')) return [existingStudents];
      if (sql.includes('INSERT INTO')) return [{ affectedRows: 1 }];
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  return connection;
}

function createDb(connection) {
  return { async getConnection() { return connection; } };
}

function student(overrides = {}) {
  return {
    student_name: '김학생',
    school_name: '맥스고',
    phone_number: null,
    phone_owner: '학생',
    grade: '2',
    gender: '여',
    ...overrides,
  };
}

test('학생 식별값은 NFC와 앞뒤·연속 공백을 정규화한다', () => {
  assert.equal(normalizeIdentityText('  김\t 학생  '), '김 학생');
  assert.equal(
    buildStudentIdentityKey(student({ student_name: '김학생', school_name: null })),
    buildStudentIdentityKey(student({ student_name: '김학생', school_name: '' })),
  );
});

test('기존 명단과 요청 내부의 네 항목 동일 학생만 자동 제외한다', async () => {
  const connection = createConnection([
    student({ student_name: ' 김학생 ', school_name: null }),
  ]);
  const handler = createStudentBulkAddHandler(createDb(connection), { error() {} });
  const req = {
    user: { branch: '일산' },
    body: {
      학년도: 2027,
      students: [
        student({ school_name: '' }),
        student({ student_name: '박 학생', school_name: '일산고' }),
        student({ student_name: '박   학생', school_name: '일산고' }),
        student({ school_name: '', grade: '3' }),
        student({ school_name: '', gender: '남' }),
        student({ school_name: '다른고' }),
      ],
    },
  };
  const res = createResponse();

  await handler(req, res);

  assert.equal(res.statusCode, 201);
  assert.deepEqual(res.body, {
    success: true,
    message: '총 4명의 학생을 추가했습니다. (중복 2명 제외)',
    insertedCount: 4,
    duplicateCount: 2,
    errors: [],
  });
  assert.equal(connection.committed, true);
  const select = connection.calls.find(
    (call) => call.type === 'query' && call.sql.includes('SELECT student_name'),
  );
  assert.deepEqual(select.params, ['일산', '2027']);
  const inserts = connection.calls.filter(
    (call) => call.type === 'query' && call.sql.includes('INSERT INTO'),
  );
  assert.equal(inserts.length, 4);
  assert.ok(connection.calls.find(
    (call) => call.type === 'query' && call.sql.includes('RELEASE_LOCK'),
  ));
  const operationOrder = connection.calls.map((call) => {
    if (call.type !== 'query') return call.type;
    if (call.sql.includes('GET_LOCK')) return 'get-lock';
    if (call.sql.includes('RELEASE_LOCK')) return 'release-lock';
    if (call.sql.includes('SELECT student_name')) return 'select-existing';
    if (call.sql.includes('INSERT INTO')) return 'insert';
    return 'other-query';
  });
  assert.deepEqual(operationOrder, [
    'get-lock', 'begin', 'select-existing',
    'insert', 'insert', 'insert', 'insert',
    'commit', 'release-lock', 'release',
  ]);
  assert.equal(connection.released, true);
});

test('필수값 오류는 중복과 분리해 쉬운 한국어로 반환한다', async () => {
  const connection = createConnection();
  const handler = createStudentBulkAddHandler(createDb(connection), { error() {} });
  const req = {
    user: { branch: '일산' },
    body: {
      학년도: '2027',
      students: [student({ student_name: '' }), student()],
    },
  };
  const res = createResponse();

  await handler(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.insertedCount, 1);
  assert.equal(res.body.duplicateCount, 0);
  assert.deepEqual(res.body.errors, [{ name: '이름 없음', reason: '이름을 입력해주세요.' }]);
  assert.doesNotMatch(JSON.stringify(res.body), /DB|SQL|ER_|stack|CORS/i);
});

test('같은 지점·학년도 잠금을 얻지 못하면 삽입 없이 재시도를 안내한다', async () => {
  const connection = createConnection();
  connection.query = async function query(sql, params) {
    this.calls.push({ type: 'query', sql, params });
    if (sql.includes('GET_LOCK')) return [[{ acquired_lock: 0 }]];
    throw new Error(`Unexpected query: ${sql}`);
  };
  const handler = createStudentBulkAddHandler(createDb(connection), { error() {} });
  const res = createResponse();

  await handler({
    user: { branch: '일산' },
    body: { 학년도: '2027', students: [student()] },
  }, res);

  assert.equal(res.statusCode, 409);
  assert.match(res.body.message, /잠시 후 다시/);
  assert.equal(connection.calls.some((call) => call.sql?.includes('INSERT INTO')), false);
  assert.equal(connection.released, true);
});

test('동일 페이로드 두 요청은 잠금 뒤 최신 명단을 다시 읽어 한 번만 삽입한다', async () => {
  const storedStudents = [];
  let locked = false;
  const lockWaiters = [];
  const db = {
    async getConnection() {
      return {
        async beginTransaction() {},
        async commit() {},
        async rollback() {},
        release() {},
        async query(sql, params) {
          if (sql.includes('GET_LOCK')) {
            if (!locked) {
              locked = true;
              return [[{ acquired_lock: 1 }]];
            }
            await new Promise((resolve) => lockWaiters.push(resolve));
            locked = true;
            return [[{ acquired_lock: 1 }]];
          }
          if (sql.includes('RELEASE_LOCK')) {
            locked = false;
            const next = lockWaiters.shift();
            if (next) next();
            return [[{ released_lock: 1 }]];
          }
          if (sql.includes('SELECT student_name')) {
            return [storedStudents.map((item) => ({ ...item }))];
          }
          if (sql.includes('INSERT INTO')) {
            storedStudents.push({
              student_name: params[2],
              school_name: params[3],
              grade: params[6],
              gender: params[7],
            });
            await new Promise((resolve) => setImmediate(resolve));
            return [{ affectedRows: 1 }];
          }
          throw new Error(`Unexpected query: ${sql}`);
        },
      };
    },
  };
  const handler = createStudentBulkAddHandler(db, { error() {} });
  const request = () => ({
    user: { branch: '일산' },
    body: { 학년도: '2027', students: [student()] },
  });
  const firstResponse = createResponse();
  const secondResponse = createResponse();

  await Promise.all([
    handler(request(), firstResponse),
    handler(request(), secondResponse),
  ]);

  assert.equal(storedStudents.length, 1);
  assert.deepEqual(
    [firstResponse.body.insertedCount, secondResponse.body.insertedCount].sort(),
    [0, 1],
  );
  assert.deepEqual(
    [firstResponse.body.duplicateCount, secondResponse.body.duplicateCount].sort(),
    [0, 1],
  );
});

test('예상하지 못한 저장 오류는 롤백하고 기술 내용을 노출하지 않는다', async () => {
  const connection = createConnection();
  const originalQuery = connection.query.bind(connection);
  connection.query = async function query(sql, params) {
    if (sql.includes('INSERT INTO')) {
      this.calls.push({ type: 'query', sql, params });
      const error = new Error('ER_BAD_FIELD_ERROR raw sql details');
      error.code = 'ER_BAD_FIELD_ERROR';
      throw error;
    }
    return originalQuery(sql, params);
  };
  const handler = createStudentBulkAddHandler(createDb(connection), { error() {} });
  const res = createResponse();

  await handler({
    user: { branch: '일산' },
    body: { 학년도: '2027', students: [student()] },
  }, res);

  assert.equal(res.statusCode, 500);
  assert.equal(connection.rolledBack, true);
  assert.equal(connection.committed, false);
  assert.doesNotMatch(JSON.stringify(res.body), /DB|SQL|ER_|stack|CORS/i);
  assert.equal(connection.released, true);
});

test('지점과 입력 형식을 먼저 검사해 다른 지점 자료에 접근하지 않는다', async () => {
  let connectionRequested = false;
  const handler = createStudentBulkAddHandler({
    async getConnection() {
      connectionRequested = true;
      throw new Error('should not connect');
    },
  }, { error() {} });

  const missingBranch = createResponse();
  await handler({ user: {}, body: { 학년도: '2027', students: [student()] } }, missingBranch);
  assert.equal(missingBranch.statusCode, 403);

  const invalidYear = createResponse();
  await handler({
    user: { branch: '일산' },
    body: { 학년도: '27', students: [student()] },
  }, invalidYear);
  assert.equal(invalidYear.statusCode, 400);
  assert.equal(connectionRequested, false);
});
