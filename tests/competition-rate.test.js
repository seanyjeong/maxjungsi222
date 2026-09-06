const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function loadUtils() {
  const window = {};
  vm.runInNewContext(
    fs.readFileSync(path.join(ROOT, 'assets/js/utils.js'), 'utf8'),
    { window, navigator: { platform: 'Win32' }, Date, Intl, Number, String, JSON, isNaN }
  );
  return window;
}

function competitionTag(overrides = {}) {
  return {
    type: '전년도경쟁률',
    catalogYear: 2027,
    year: 2026,
    rate: '5.58',
    quota: 24,
    applicants: 134,
    scope: null,
    ...overrides,
  };
}

function loadObserver(apiImpl) {
  const target = {
    hidden: true,
    innerHTML: '',
    replaceChildren() { this.innerHTML = ''; },
  };
  const window = {
    api: apiImpl,
    location: { href: 'https://example.test/calculator.html' },
  };
  const context = {
    window,
    document: { querySelectorAll: () => [target] },
    navigator: { platform: 'Win32' },
    console,
    Date,
    Intl,
    Number,
    String,
    JSON,
    URL,
    decodeURIComponent,
    isNaN,
  };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'assets/js/utils.js'), 'utf8'), context);
  vm.runInNewContext(
    fs.readFileSync(path.join(ROOT, 'assets/js/competition-rate-observer.js'), 'utf8'),
    context
  );
  return { target, window };
}

test('competition tag is shown only for the matching admission year', () => {
  const utils = loadUtils();
  const tags = [competitionTag()];

  assert.deepEqual(
    JSON.parse(JSON.stringify(utils.getPreviousCompetitionTag(tags, 2027))),
    competitionTag()
  );
  assert.equal(utils.getPreviousCompetitionTag(tags, 2026), null);
  assert.equal(utils.getPreviousCompetitionTag(tags), null);
  assert.equal(utils.getPreviousCompetitionTag([competitionTag({ year: 2025 })], 2027), null);
});

test('common school tags preserve old labels and render a compact competition badge', () => {
  const utils = loadUtils();
  const html = utils.renderSchoolTags([
    '군이동',
    { type: '신규' },
    competitionTag(),
  ], 2027);

  assert.match(html, /군이동/);
  assert.match(html, /신규/);
  assert.match(html, /26 경쟁률 5\.58:1/);
  assert.match(html, /모집 24명 · 지원 134명/);
  assert.equal((html.match(/전년도경쟁률/g) || []).length, 0);
});

test('detailed renderer uses Korean plain-language empty and value states', () => {
  const utils = loadUtils();
  const value = utils.renderPreviousCompetitionDetails([competitionTag()], 2027);
  const empty = utils.renderPreviousCompetitionDetails([], 2027);

  assert.match(value, /2026학년도 경쟁률/);
  assert.match(value, /5\.58:1/);
  assert.match(value, /모집 24명 · 지원 134명/);
  assert.match(empty, /전년도 경쟁률 자료 없음/);
  assert.doesNotMatch(empty, /400|401|CORS|stack|Error/);
});

test('all Jungsi school-information surfaces use the common or detailed renderer', () => {
  for (const file of ['school_app.html', 'school_app_final.html']) {
    const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.match(html, /data-competition-rate/);
  }
  for (const file of ['calculator.html', 'university_overview.html', 'counseling_by_university.html']) {
    const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.match(html, /assets\/js\/competition-rate-observer\.js/);
    assert.match(html, /data-competition-rate/);
  }
  assert.match(fs.readFileSync(path.join(ROOT, 'counsel.html'), 'utf8'), /counsel\/cards-1\.js/);
  for (const file of ['counsel/cards-1.js', 'final_apply_list.js', 'cut_editor.js', 'university_overview.js']) {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.match(source, /renderSchoolTags/);
  }

  const backend = fs.readFileSync(path.join(ROOT, '_vultr_backend/jungsi.js'), 'utf8');
  assert.match(backend, /app\.get\('\/jungsi\/schools\/:year'[\s\S]*?b\.tags/);
});

test('formula observer renders the matching year and masks technical fetch errors', async () => {
  const success = loadObserver(async () => ({
    success: true,
    formula: { tags: [competitionTag()] },
  }));

  await success.window.api('/jungsi/formula-details?U_ID=3&year=2027');

  assert.equal(success.target.hidden, false);
  assert.match(success.target.innerHTML, /2026학년도 경쟁률/);
  assert.match(success.target.innerHTML, /5\.58:1/);

  const failure = loadObserver(async () => { throw new Error('HTTP 500 CORS stack'); });
  await assert.rejects(
    failure.window.api('/jungsi/formula-details?U_ID=3&year=2027')
  );
  assert.match(failure.target.innerHTML, /불러오지 못했습니다/);
  assert.doesNotMatch(failure.target.innerHTML, /500|CORS|stack|Error/);
});
