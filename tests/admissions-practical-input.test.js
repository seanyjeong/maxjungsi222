'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const admission = require('../utils/admissions-practical-input');
const subjective = require('../utils/subjective-practical');
const chonnam = {U_ID:115,학년도:2027,기타설정:{remainingPractical2027Reviewed:true},실기배점:[]};
const golf = {U_ID:131,학년도:2027,기타설정:{subjectivePractical2027Reviewed:true},실기배점:[]};

test('Chonnam requires the selected gymnastics result and an explicit goal outcome', () => {
  const records = ['12.5','15.2','핸스or백핸드|B','16.6','성공'].map((value,index) =>
    ({event:admission.eventNames(chonnam)[index],value}));
  assert.equal(subjective.prepare(chonnam,'남',records).ready,true);
  records[4].value='';assert.equal(subjective.prepare(chonnam,'남',records).ready,false);
  records[4].value='실패';assert.equal(subjective.prepare(chonnam,'남',records).ready,true);
  records[2].value='무릎펴앞구르기|A';assert.equal(subjective.prepare(chonnam,'남',records).reason,'invalid');
  assert.equal(subjective.prepare(chonnam,'여',records).ready,true);
  records.push(records[2]);assert.equal(subjective.prepare(chonnam,'여',records).ready,false);
});

test('Historical gymnastics restores without assuming a goal and ambiguous saved choices stay incomplete', () => {
  const restored = admission.restore(chonnam,'남',{'핸스or백핸드':'B',축구:'16.6'});
  assert.equal(restored.체조,'핸스or백핸드|B');assert.equal(restored.축구골인,undefined);
  assert.equal(admission.restore(chonnam,'남',{'핸스or백핸드':'B',백공:'A'}).체조,undefined);
  assert.equal(admission.eventNames({...chonnam,학년도:2026}),null);
  assert.equal(admission.prepare({...chonnam,기타설정:{}},'남',[]),null);
});

test('Golf requires all twelve graded attempts and protects the objective-only storage contract', () => {
  const policy=subjective.getPolicy(golf), names=subjective.eventNames(golf);
  assert.equal(names.length,12);assert.equal(new Set(names).size,12);
  assert.equal(policy.maximum,360);assert.equal(policy.unscoredMaximum,340);
  const records=names.map((event,index)=>({event,value:['A','B','C'][index%3]}));
  assert.equal(subjective.prepare(golf,'여',records).ready,true);
  records.pop();assert.equal(subjective.prepare(golf,'여',records).ready,false);
  records.push({event:names.at(-1),value:'85'});assert.equal(subjective.prepare(golf,'남',records).reason,'invalid');
  const saved=subjective.serializeRecords(golf,[{event:names[0],value:'A'},{event:'주관평가',value:'340'}],'');
  assert.equal(saved.주관평가,undefined);assert.equal(saved[names[0]],'A');
  assert.equal(subjective.getPolicy({...golf,학년도:2026}),null);
});

test('Grade controls retain saved machine values while showing readable choices', () => {
  const options=admission.options(chonnam,'여','체조');
  assert(options.some(option=>option.value==='뒤굴러물구나무|B'));
  assert(!options.some(option=>option.value==='백공|A'));
  const markup=admission.control(golf,'남','드라이버샷 1차','data-event="드라이버샷 1차"','fallback');
  assert(markup.includes('<select '));assert(markup.includes('value="D"'));assert(markup.includes('D · 0점'));
  assert.equal(admission.control(chonnam,'남','100m달리기','','normal-input'),'normal-input');
});

test('Seoul withholds second-stage calculations and Chonnam rejects inconsistent absence',()=>{
 const f={U_ID:96,학년도:2027,기타설정:{remainingPractical2027Reviewed:true}};
 const input=require('../utils/admissions-practical-input');
 assert.equal(input.prepare(f,'남',[]).ready,false);assert.match(input.stageNotice(f),/1단계/);
 assert.equal(input.stageNotice({...f,학년도:2026}),'');
 const jnu={...f,U_ID:115};
 assert.equal(input.prepare(jnu,'남',[{event:'100m달리기',value:'12.5'},{event:'지그재그런',value:'15.2'},{event:'체조',value:'핸스or백핸드|B'},{event:'축구',value:'16.6'},{event:'축구골인',value:'미응시'}]).reason,'invalid');
});
