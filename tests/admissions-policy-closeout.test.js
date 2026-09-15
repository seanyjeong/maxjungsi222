'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const information = require('../university-overview/information');
const stage = require('../config/admissions-stage-2027');
const sandbox = {window:{}};
vm.runInNewContext(fs.readFileSync(require.resolve('../university-overview/review-notes'),'utf8'),sandbox);
const catalog = sandbox.window.UniversityReviewNotes;

test('college information reflects the selected operating policies without stale pending units', () => {
  const keimyung = information.getReview(catalog,195,2027);
  const model = information.build({U_ID:195,학년도:2027,총점:100,실기총점:0},null,keimyung);
  assert(model.items.some(row=>row.value==='100점'));
  assert(!model.items.some(row=>/확인 중/.test(row.value)));
  assert.equal(keimyung.withholdTotal,false);
  assert.equal(information.getReview(catalog,114,2027).csatStatus,'legacy-2026-applied');
  const pnu=information.getReview(catalog,174,2027);
  assert.equal(pnu.practicalFollowUp,false);
  assert.match(pnu.followUp,/최저점20점/);
  assert.equal(information.getReview(catalog,195,2026),null);
});

test('SNU is limited to stage one and inquiry notices only schedule publication replacement',()=>{
  assert.match(stage.notice,/1단계.*3배수/);
  assert.doesNotMatch(stage.notice+' '+stage.followUp,/시험 후|최고·최저점/);
  const snu=information.getReview(catalog,96,2027);
  assert.equal(snu.stageOneOnly,true);
  assert.doesNotMatch(snu.followUp,/시험 후/);
  const inquiry=information.getReview(catalog,114,2027).inquiryFollowUp;
  assert.match(inquiry.followUp,/공식 탐구변환표가 발표되면 교체/);
  assert.equal(inquiry.needsReview,false);
});
