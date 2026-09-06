"""실제 페이지 계산 함수를 격리하여 검사한다. 학생 데이터/운영 쓰기는 사용하지 않는다."""
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).parents[1]


@pytest.fixture(params=['calculator', 'counsel'])
def page(request):
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page()
        page.route('**/*', lambda route: route.abort())
        inputs = ''.join(f'<label><input class="practical-input" data-event="{event}" value="{value}">'
                         '<span class="score-out"></span></label>' for event, value in
                         [('10m왕복달리기', '8.64'), ('제자리멀리뛰기', '284'), ('메디신볼던지기', '12.4')])
        page.set_content('<select id="yearSel"><option>2027</option></select>'
                         '<section class="uni-card-shell" data-uid="43"><article class="uni-card">'
                         + (inputs if request.param == 'counsel' else '') +
                         '<span class="score-silgi"></span><span class="score-total"></span></article></section>'
                         '<table><tbody><tr data-student-id="synthetic"><td>'
                         + (inputs if request.param == 'calculator' else '') +
                         '</td><td class="total-silgi"></td><td class="score-total"></td></tr></tbody></table>')
        for script in ['utils/practical-requirements.js', 'utils/practical-input.js']:
            page.add_script_tag(content=(ROOT / script).read_text())
        page.add_script_tag(content='''
          const F = {U_ID:43, 학년도:2027, 실기총점:250, 총점:1000};
          const STATE = {formulaCache:{'43-2027':F},selectedStudent:{student_id:'synthetic',gender:'남'},allFilterData:[]};
          function triggerAutoSave(){window.saved=true;}
          function setSaving(){} function showToast(){}
          window.requests = [];
          window.api = async (url, opts) => {requests.push(JSON.parse(opts.body));
            return {success:true,result:{totalScore:'239.04',breakdown:{events:[]}}};};
        ''')
        if request.param == 'calculator':
            page.add_script_tag(content=(ROOT / 'calculator/scoring.js').read_text())
            page.add_script_tag(content='''
              const scoring = createCalculatorScoring({resultsTbody:document.querySelector('tbody'),
                getFormula:()=>F,getStudents:()=>[{student_id:'synthetic',gender:'남'}],getMaximum:()=>1000,getSort:()=> 'desc'});
              window.runCase = () => scoring.recalculateSilgiAndTotal(document.querySelector('tr'));
            ''')
        else:
            page.add_script_tag(content=(ROOT / 'counsel/scoring-1.js').read_text())
            page.add_script_tag(content='window.runCase = () => recalcCard(document.querySelector("article"));')
        page.kind = request.param
        yield page
        browser.close()


def score(page):
    return page.locator('.total-silgi' if page.kind == 'calculator' else 'article .score-silgi')


def test_complete_records_show_official_rounding(page):
    page.evaluate('runCase()')
    assert score(page).inner_text().startswith('239.04')
    assert len(page.evaluate('requests[0].S_data.practicals')) == 3


def test_missing_record_neither_requests_full_marks_nor_saves_zero(page):
    page.locator('[data-event="메디신볼던지기"]').fill('')
    page.evaluate('runCase()')
    assert '모두 입력' in score(page).inner_text()
    assert page.evaluate('requests.length') == 0
    assert not page.evaluate('Boolean(window.saved)')


@pytest.mark.parametrize('failure', ['HTTP 400', 'HTTP 401', 'CORS TypeError: Failed to fetch'])
def test_failure_has_plain_korean_notice_not_zero_or_technical_details(page, failure):
    page.evaluate('message => {window.api=async()=>{throw new Error(message);};}', failure)
    page.evaluate('runCase()')
    text = score(page).inner_text()
    assert '계산하지 못했습니다' in text
    assert '0.00' not in text
    assert not any(term in text for term in ['400', '401', 'CORS', 'TypeError', 'fetch'])
    assert not page.evaluate('Boolean(window.saved)')


@pytest.mark.parametrize('value', [None, '', 'NaN', 'Infinity'])
def test_invalid_success_response_is_not_a_real_zero(page, value):
    page.evaluate('value => {window.api=async()=>({success:true,result:{totalScore:value}});}', value)
    page.evaluate('runCase()')
    assert '계산하지 못했습니다' in score(page).inner_text()


def test_late_response_cannot_overwrite_new_incomplete_input(page):
    page.evaluate('() => {window.api=()=>new Promise(resolve=>window.finishOld=resolve); window.oldRun=runCase();}')
    page.locator('[data-event="메디신볼던지기"]').fill('')
    page.evaluate('runCase()')
    page.evaluate('finishOld({success:true,result:{totalScore:"250.000"}});')
    page.evaluate('oldRun')
    assert '모두 입력' in score(page).inner_text()
    assert not page.evaluate('Boolean(window.saved)')
