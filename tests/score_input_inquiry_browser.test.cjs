'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');
const puppeteer = require(process.env.PUPPETEER_MODULE || 'puppeteer');
const root = path.resolve(__dirname, '..');
const fixture = {
  입력유형: 'official', 국어_선택과목: '언어와매체', 국어_표준점수: 117,
  국어_백분위: 77, 국어_등급: 3, 수학_선택과목: '확률과통계', 수학_표준점수: 128,
  수학_백분위: 95, 수학_등급: 1, 영어_등급: 1, 한국사_등급: 4,
  탐구1_선택과목: null, 탐구1_표준점수: 65, 탐구1_백분위: 94, 탐구1_등급: 2,
  탐구2_선택과목: null, 탐구2_표준점수: 56, 탐구2_백분위: 68, 탐구2_등급: 4,
};
const students = [1, 2].map(id => ({ student_id: id, student_name: `검수 학생 ${id}`,
  school_name: '합성 데이터', gender: '남', grade: '3' }));
const inquiry = (index, id = 1) => `#tbody tr[data-row-id="${id}"] select[data-field="탐구${index}_선택과목"]`;

async function main() {
  const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
    '.png': 'image/png', '.svg': 'image/svg+xml' };
  const server = http.createServer((req, res) => {
    const file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://local').pathname));
    if (!file.startsWith(root + path.sep) || req.method !== 'GET') { res.writeHead(403).end(); return; }
    fs.readFile(file, (error, bytes) => {
      if (error) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }).end(bytes);
    });
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  const stored = { 1: { ...fixture }, 2: { ...fixture } };
  const writes = [], errors = [], blocked = [], checks = [];
  await page.setViewport({ width: 1900, height: 1050 });
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('jwt_token', 'test.' + btoa(JSON.stringify({ name: 'Audit', userid: 'audit' })) + '.test');
  });
  await page.setRequestInterception(true);
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', async request => {
    const url = new URL(request.url());
    if (url.origin !== 'https://supermax.kr') return request.continue();
    const respond = body => request.respond({ status: 200, contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,content-type' },
      body: JSON.stringify(body) });
    if (request.method() === 'OPTIONS') return respond({});
    if (url.pathname === '/jungsi/students/list-by-branch') return respond({ success: true, students });
    if (url.pathname === '/jungsi/scores/list') return respond({ success: true,
      data: Object.fromEntries(Object.entries(stored).map(([id, score]) => [id, [score]])) });
    if (url.pathname === '/jungsi/scores/officialize-bulk') {
      const body = JSON.parse(request.postData());
      writes.push(body);
      for (const item of body.items) stored[item.student_id] = { ...item };
      return respond({ success: true });
    }
    blocked.push(url.pathname); return request.abort();
  });
  const value = selector => page.$eval(selector, el => el.value);
  const choices = selector => page.$$eval(selector + ' option', options =>
    options.filter(option => !option.hidden && !option.disabled).map(option => option.value));
  const save = async () => {
    const reloaded = page.waitForResponse(response => response.url().includes('/jungsi/scores/list') && response.request().method() === 'POST');
    await page.click('#saveBtn'); await reloaded;
    await page.waitForSelector(inquiry(1));
  };
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/score_input.html`, { waitUntil: 'networkidle2' });
    await page.waitForSelector(inquiry(1));
    assert((await choices(inquiry(2))).includes('생활과윤리'));
    await page.select(inquiry(1), '생활과윤리');
    assert(!(await choices(inquiry(2))).includes('생활과윤리'));
    assert((await choices(inquiry(2, 2))).includes('생활과윤리'));
    checks.push('Selected inquiry1 is absent only from the same student inquiry2 list');

    await page.select(inquiry(2), '윤리와사상');
    assert.equal(await value(inquiry(1)), '생활과윤리');
    assert(!(await choices(inquiry(1))).includes('윤리와사상'));
    await page.select(inquiry(1), '한국지리');
    assert((await choices(inquiry(2))).includes('생활과윤리'));
    assert(!(await choices(inquiry(2))).includes('한국지리'));
    assert.equal(await value(inquiry(2)), '윤리와사상');
    await page.select(inquiry(1), '');
    assert((await choices(inquiry(2))).includes('한국지리'));
    assert.equal(await value(inquiry(2)), '윤리와사상');
    await page.select(inquiry(1), '생활과윤리');
    checks.push('Changing or clearing inquiry1 restores prior options and preserves inquiry2');

    // A stale option must not clear either stored subject, even if an input event reaches the handler.
    await page.$eval(inquiry(2), select => select.add(new Option('생활과윤리', '생활과윤리')));
    await page.select(inquiry(2), '생활과윤리');
    assert.equal(await value(inquiry(1)), '생활과윤리');
    assert.equal(await value(inquiry(2)), '윤리와사상');
    assert(!(await choices(inquiry(2))).includes('생활과윤리'));
    checks.push('Stale duplicate selection is rejected without clearing either subject');

    await save();
    assert.equal(writes.length, 1); assert.equal(writes[0].items.length, 1);
    const saved = writes[0].items[0];
    assert.equal(saved.탐구1_선택과목, '생활과윤리');
    assert.equal(saved.탐구2_선택과목, '윤리와사상');
    for (const field of ['탐구1_표준점수', '탐구1_백분위', '탐구1_등급', '탐구2_표준점수', '탐구2_백분위', '탐구2_등급'])
      assert.equal(saved[field], fixture[field]);
    assert.equal(await value(inquiry(1)), '생활과윤리');
    assert.equal(await value(inquiry(2)), '윤리와사상');
    assert(!(await choices(inquiry(2))).includes('생활과윤리'));
    checks.push('Save payload and reload preserve both subjects and all inquiry scores');

    const artifacts = process.env.SCORE_INPUT_ARTIFACT_DIR;
    if (artifacts) {
      fs.mkdirSync(artifacts, { recursive: true });
      await page.screenshot({ path: path.join(artifacts, 'inquiry-selection.png'), fullPage: true });
    }
    stored[1].탐구2_선택과목 = '생활과윤리';
    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForSelector(inquiry(1));
    assert.equal(await value(inquiry(1)), '생활과윤리');
    assert.equal(await value(inquiry(2)), '생활과윤리');
    assert(!(await choices(inquiry(2))).includes('생활과윤리'));
    const grade = '#tbody tr[data-row-id="1"] input[data-field="영어_등급"]';
    await page.click(grade, { clickCount: 3 }); await page.type(grade, '2');
    await page.click('#saveBtn');
    await page.waitForFunction(() => document.body.innerText.includes('탐구1과 탐구2는 서로 다른 과목을 선택해 주세요.'));
    assert.equal(writes.length, 1);
    await page.select(inquiry(2), '윤리와사상');
    await save(); assert.equal(writes.length, 2);
    checks.push('Legacy duplicate is preserved visibly until corrected and cannot be saved again');
    assert.deepEqual(errors, []); assert.deepEqual(blocked, []);
    const report = { status: 'passed', checks, actualProductionWrites: 0, errors, blocked,
      savedNormalCase: writes[0].items[0] };
    if (artifacts) fs.writeFileSync(path.join(artifacts, 'browser-result.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close(); server.close(); await once(server, 'close');
  }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
