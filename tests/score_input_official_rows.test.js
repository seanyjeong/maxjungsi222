const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'score_input.js'), 'utf8');

const context = {
  console,
  window: {
    __SCORE_INPUT_TEST__: true,
    escapeHtml: (value) => String(value == null ? '' : value),
  },
  document: {
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
  },
};

vm.createContext(context);
vm.runInContext(source, context);

const {
  buildStudentScoreRow,
  collectOfficialItems,
  hasAnyInput,
  optionsHtml,
  hasDuplicateInquiry,
} = context.window.__scoreInputInternals;

function student(id) {
  return {
    student_id: id,
    student_name: `학생${id}`,
    school_name: '맥스고',
    gender: '남',
  };
}

const rawOnly = buildStudentScoreRow(student(1), [{
  입력유형: 'raw',
  국어_선택과목: '화법과작문',
  국어_표준점수: 131,
  국어_백분위: 96,
  국어_등급: 1,
  영어_등급: 2,
}]);

assert.strictEqual(rawOnly.입력유형, 'raw');
assert.strictEqual(rawOnly.국어_선택과목, null);
assert.strictEqual(rawOnly.국어_표준점수, null);
assert.strictEqual(rawOnly.영어_등급, null);
assert.strictEqual(hasAnyInput(rawOnly), false);

const officialPreferred = buildStudentScoreRow(student(2), [
  {
    입력유형: 'raw',
    국어_표준점수: 130,
    영어_등급: 3,
  },
  {
    입력유형: 'official',
    국어_표준점수: 125,
    영어_등급: 2,
  },
]);

assert.strictEqual(officialPreferred.입력유형, 'official');
assert.strictEqual(officialPreferred.국어_표준점수, 125);
assert.strictEqual(officialPreferred.영어_등급, 2);

rawOnly._dirty = true;
rawOnly.한국사_등급 = 3;

const unchangedOfficial = buildStudentScoreRow(student(3), [{
  입력유형: 'official',
  국어_표준점수: 120,
  영어_등급: 2,
}]);

const items = collectOfficialItems([rawOnly, officialPreferred, unchangedOfficial]);

assert.strictEqual(items.length, 1);
assert.strictEqual(items[0].student_id, 1);
assert.strictEqual(items[0].입력유형, 'official');
assert.strictEqual(items[0].한국사_등급, 3);
assert.strictEqual(items[0].국어_표준점수, null);

const subjects = ['생활과윤리', '윤리와사상', '한국지리'];
const filtered = optionsHtml(subjects, '윤리와사상', '생활과윤리');
assert(!filtered.includes('value="생활과윤리"'));
assert(filtered.includes('value="윤리와사상" selected'));
assert(optionsHtml(subjects, '윤리와사상', null).includes('value="생활과윤리"'));
assert.deepStrictEqual(subjects, ['생활과윤리', '윤리와사상', '한국지리']);

const duplicate = { 탐구1_선택과목: '생활과윤리', 탐구2_선택과목: '생활과윤리', 탐구1_백분위: 94 };
assert.strictEqual(hasDuplicateInquiry(duplicate), true);
assert.strictEqual(hasDuplicateInquiry({ ...duplicate, 탐구2_선택과목: '윤리와사상' }), false);
assert.strictEqual(hasDuplicateInquiry({ 탐구1_선택과목: null, 탐구2_선택과목: null }), false);
const legacyOptions = optionsHtml(subjects, duplicate.탐구2_선택과목, duplicate.탐구1_선택과목);
assert(legacyOptions.includes('value="생활과윤리" selected disabled hidden'));
assert.strictEqual(duplicate.탐구1_백분위, 94);

console.log('score_input official row tests passed');
