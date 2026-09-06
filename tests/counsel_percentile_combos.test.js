const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'counsel', 'student-1.js'), 'utf8');

function extractFunction(name) {
  const start = html.indexOf(`function ${name}`);
  assert.notStrictEqual(start, -1, `${name} function not found`);

  const paramsOpen = html.indexOf('(', start);
  let paramsDepth = 0;
  let paramsClose = -1;
  for (let i = paramsOpen; i < html.length; i += 1) {
    if (html[i] === '(') paramsDepth += 1;
    if (html[i] === ')') paramsDepth -= 1;
    if (paramsDepth === 0) {
      paramsClose = i;
      break;
    }
  }

  const open = html.indexOf('{', paramsClose);
  let depth = 0;
  for (let i = open; i < html.length; i += 1) {
    if (html[i] === '{') depth += 1;
    if (html[i] === '}') depth -= 1;
    if (depth === 0) return html.slice(start, i + 1);
  }
  throw new Error(`${name} function body not closed`);
}

const context = {};
vm.createContext(context);
vm.runInContext([
  extractFunction('num'),
  extractFunction('averageRequired'),
  extractFunction('buildPercentileCombos'),
].join('\n'), context);

function visibleNames(scores) {
  return Array.from(context.buildPercentileCombos(scores))
    .filter((combo) => combo.visible)
    .map((combo) => combo.name);
}

assert.strictEqual(context.num(''), null);
assert.strictEqual(context.num('미응시'), null);
assert.strictEqual(context.num('87'), 87);

assert.deepStrictEqual(visibleNames({ kor: 90, mat: 80, t1: 70, t2: 60 }), [
  '국+수',
  '국+수+탐1',
  '국+수+탐2',
  '국+탐1',
  '국+탐2',
  '수+탐1',
  '수+탐2',
]);

assert.deepStrictEqual(visibleNames({ kor: 90, mat: null, t1: 70, t2: 60 }), [
  '국+탐1',
  '국+탐2',
]);

assert.deepStrictEqual(visibleNames({ kor: 90, mat: 80, t1: 70, t2: null }), [
  '국+수',
  '국+수+탐1',
  '국+탐1',
  '수+탐1',
]);

assert.deepStrictEqual(visibleNames({ kor: 90, mat: null, t1: 70, t2: null }), [
  '국+탐1',
]);

console.log('counsel percentile combo tests passed');
