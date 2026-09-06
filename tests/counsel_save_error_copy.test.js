const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'counsel', 'save-1.js'), 'utf8');
const match = source.match(/function humanizeSaveError\(msg\) \{[\s\S]*?\n  \}/);

assert(match, 'humanizeSaveError function should exist');

const context = {};
vm.createContext(context);
vm.runInContext(`${match[0]}; this.humanizeSaveError = humanizeSaveError;`, context);

assert.strictEqual(
  context.humanizeSaveError('DB 오류'),
  '상담 목록을 저장하지 못했습니다. 잠시 후 다시 시도해주세요.'
);
assert.strictEqual(
  context.humanizeSaveError('HTTP 500'),
  '상담 목록을 저장하지 못했습니다. 잠시 후 다시 시도해주세요.'
);
assert.strictEqual(context.humanizeSaveError('권한이 없습니다'), '권한이 없습니다');

console.log('counsel save error copy tests passed');
