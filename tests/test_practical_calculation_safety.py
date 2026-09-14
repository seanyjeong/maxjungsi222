"""실제 페이지 계산 함수를 격리하여 검사한다. 학생 데이터/운영 쓰기는 사용하지 않는다."""
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).parents[1]
RECORDS = {'10m왕복달리기': '8.64', '제자리멀리뛰기': '284', '메디신볼던지기': '12.4'}
INCOMPLETE_RECORDS = {'10m왕복달리기': '8.64', '제자리멀리뛰기': '284'}


@pytest.fixture(params=['calculator', 'counsel'])
def page(request):
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page()
        page.route('**/*', lambda route: route.abort())
        inputs = ''.join(f'<label><input class="practical-input" data-event="{event}" value="{value}">'
                         '<span class="score-out"></span></label>' for event, value in
                         RECORDS.items())
        page.set_content('<select id="yearSel"><option>2027</option></select>'
                         '<select id="examSel"><option>9월</option></select><span class="save-indicator"></span>'
                         '<main id="gunBoard"><div id="col-ga" class="gun-column">'
                         '<section class="uni-card-shell" data-uid="43"><article class="uni-card">'
                         + (inputs if request.param == 'counsel' else '') +
                         '<span class="score-suneung">400.00</span><span class="score-silgi">250.00</span>'
                         '<span class="score-total">650.00</span></article></section></div></main>'
                         '<table><tbody><tr data-student-id="synthetic"><td>'
                         + (inputs if request.param == 'calculator' else '') +
                         '</td><td class="score-suneung">400.00</td><td class="total-silgi">250.00</td>'
                         '<td class="score-total">650.00</td></tr></tbody></table>')
        for script in ['utils/practical-requirements.js', 'utils/practical-input.js',
                       'config/admissions-score-format.js', 'utils/admissions-score-format.js']:
            page.add_script_tag(content=(ROOT / script).read_text())
        page.add_script_tag(content='''
          const F = {U_ID:43, 학년도:2027, 수능:75, 실기:25, 실기총점:250, 총점:1000};
          const STATE = {formulaCache:{'43-2027':F},selectedStudent:{student_id:'synthetic',gender:'남'},allFilterData:[]};
          let _saveTimer, _savingInFlight=false, _pendingSave=false, _lastSavedAt=0;
          function showToast(){}
          window.requests = []; window.savedRequests = [];
          window.practicalResponse = async () => ({success:true,result:{totalScore:'239.04',breakdown:{events:[]}}});
          window.api = async (url, opts) => {
            const body=JSON.parse(opts.body);
            if (url === '/silgi/calculate') {requests.push(body); return practicalResponse(body);}
            if (url === '/jungsi/counseling/wishlist/bulk-save') {savedRequests.push(body); return {success:true};}
            throw new Error('Unexpected test API: '+url);
          };

        ''')
        if request.param == 'calculator':
            page.add_script_tag(content=(ROOT / 'calculator/scoring.js').read_text())
            page.add_script_tag(content='''
              const scoring = createCalculatorScoring({resultsTbody:document.querySelector('tbody'),
                getFormula:()=>F,getStudents:()=>[{student_id:'synthetic',gender:'남'}],getMaximum:()=>1000,getSort:()=> 'desc'});
              window.runCase = () => scoring.recalculateSilgiAndTotal(document.querySelector('tr'));
            ''')
        else:
            page.add_script_tag(content=(ROOT / 'counsel/save-1.js').read_text())
            page.add_script_tag(content=(ROOT / 'counsel/scoring-1.js').read_text())
            page.add_script_tag(content='window.runCase = () => recalcCard(document.querySelector("article"));')
        page.kind = request.param
        yield page
        browser.close()


def score(page):
    return page.locator('.total-silgi' if page.kind == 'calculator' else 'article .score-silgi')


def assert_saved_scores(page, practical, total, expected_records=RECORDS):
    total_selector = 'tr .score-total' if page.kind == 'calculator' else 'article .score-total'
    assert page.locator(total_selector).inner_text() == ('—' if total is None else f'{total:.2f}')
    if page.kind == 'calculator':
        assert page.evaluate('savedRequests') == []
        return
    record = page.evaluate('''async () => {
      clearTimeout(_saveTimer);
      await saveWishlistNow();
      return savedRequests.at(-1).wishlistItems[0];
    }''')
    assert record['대학학과_ID'] == '43'
    assert record['상담_실기기록'] == expected_records
    assert record['상담_수능점수'] == 400
    assert record['상담_실기반영점수'] == practical
    assert record['상담_계산총점'] == total


def test_complete_records_show_official_rounding(page):
    page.evaluate('runCase()')
    assert score(page).inner_text().startswith('239.04')
    assert len(page.evaluate('requests[0].S_data.practicals')) == 3
    assert_saved_scores(page, 239.04, 639.04)


def test_missing_record_neither_requests_full_marks_nor_saves_zero(page):
    page.locator('[data-event="메디신볼던지기"]').fill('')
    page.evaluate('runCase()')
    assert '모두 입력' in score(page).inner_text()
    assert page.evaluate('requests.length') == 0
    assert_saved_scores(page, None, None, INCOMPLETE_RECORDS)


@pytest.mark.parametrize('failure', ['HTTP 400', 'HTTP 401', 'CORS TypeError: Failed to fetch'])
def test_failure_has_plain_korean_notice_not_zero_or_technical_details(page, failure):
    page.evaluate('message => {window.practicalResponse=async()=>{throw new Error(message);};}', failure)
    page.evaluate('runCase()')
    text = score(page).inner_text()
    assert '계산하지 못했습니다' in text
    assert '0.00' not in text
    assert not any(term in text for term in ['400', '401', 'CORS', 'TypeError', 'fetch'])
    assert_saved_scores(page, None, None)


@pytest.mark.parametrize('value', [None, '', 'NaN', 'Infinity'])
def test_invalid_success_response_is_not_a_real_zero(page, value):
    page.evaluate('value => {window.practicalResponse=async()=>({success:true,result:{totalScore:value}});}', value)
    page.evaluate('runCase()')
    assert '계산하지 못했습니다' in score(page).inner_text()
    assert_saved_scores(page, None, None)


def test_late_response_cannot_overwrite_new_incomplete_input(page):
    page.evaluate('() => {window.practicalResponse=()=>new Promise(resolve=>window.finishOld=resolve); window.oldRun=runCase();}')
    page.locator('[data-event="메디신볼던지기"]').fill('')
    page.evaluate('runCase()')
    page.evaluate('finishOld({success:true,result:{totalScore:"250.000"}});')
    page.evaluate('oldRun')
    assert '모두 입력' in score(page).inner_text()
    assert_saved_scores(page, None, None, INCOMPLETE_RECORDS)
