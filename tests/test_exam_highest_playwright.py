"""모형 선택부터 요청·표시·저장까지 가상 학생으로 검증한다."""
import json

import pytest
from playwright.sync_api import expect
from test_practical_pages_playwright import setup, FORMULA, STUDENT, EVENTS
from test_counsel_previous_results_playwright import base_url, browser

SCORES = {'3월': '555.65', '6월': '600.75', '9월': '574.78', '수능': '571.54'}


def open_page(browser, base_url, kind):
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    errors, saves, _ = setup(page)
    requests = []

    def calculate(route):
        body = route.request.post_data_json
        requests.append({'body': body, 'headers': route.request.headers})
        score = SCORES.get(body.get('basis_exam'), '-999')
        route.fulfill(content_type='application/json', body=json.dumps({'success': True, 'result': {'totalScore': score}}))

    page.route('**/jungsi/calculate', calculate)
    page.goto(base_url + '/' + kind + '.html', wait_until='domcontentloaded')
    if kind == 'calculator':
        expect(page.locator('#metaStudentCount')).to_have_text('1')
    else:
        page.wait_for_function('typeof STATE !== "undefined" && STATE.allStudents.length === 1')
    return page, requests, errors, saves


def pick_department(page):
    for selector, value in [('#gun-select', '가'), ('#universityCombo', '검증대학교'), ('#department-select', '43')]:
        page.locator(selector + ' .combo-display').click()
        page.locator(selector + f' .combo-item[data-value="{value}"]').click()


@pytest.mark.parametrize('kind', ['calculator', 'counsel'])
def test_each_selected_exam_is_sent_to_calculator_and_displayed(browser, base_url, kind):
    page, requests, errors, _ = open_page(browser, base_url, kind)
    for exam in SCORES:
        selector = '#exam-select' if kind == 'calculator' else '#examSelCombo'
        page.locator(selector + ' .combo-display').click()
        page.locator(selector + f' .combo-item[data-value="{exam}"]').click()
        if kind == 'calculator':
            page.wait_for_function('document.querySelector("#results-tbody").children.length === 0')
            with page.expect_response('**/jungsi/calculate'):
                pick_department(page)
            expect(page.locator('.score-suneung')).to_have_text(SCORES[exam])
        else:
            page.wait_for_function('STATE.allStudents.length === 1')
            score = page.evaluate('''async ({student}) => {
              STATE.selectedStudent=student;
              return await calculateSuneung(43);
            }''', {'student': STUDENT})
            assert score == float(SCORES[exam])
        assert requests[-1]['body']['basis_exam'] == exam
        assert str(requests[-1]['body']['year']) == '2027'
        assert requests[-1]['headers']['authorization'].startswith('Bearer ')
        assert requests[-1]['headers']['content-type'].startswith('application/json')
    assert not errors
    page.close()


@pytest.mark.parametrize('kind', ['calculator', 'counsel'])
@pytest.mark.parametrize('failure', ['HTTP 400', 'HTTP 401', 'CORS TypeError: Failed to fetch'])
def test_suneung_failure_has_korean_notice_and_never_displays_or_saves_zero(browser, base_url, kind, failure):
    page, _, errors, saves = open_page(browser, base_url, kind)
    page.evaluate('''message => {
      const original=window.api;
      window.api=async (path,opts)=>{if(path==='/jungsi/calculate')throw new Error(message);return original(path,opts);};
    }''', failure)
    if kind == 'calculator':
        pick_department(page)
        expect(page.locator('#emptyState')).to_contain_text('점수를 계산하지 못했습니다')
        assert page.locator('.score-suneung').count() == 0
        notice = page.locator('#emptyState').inner_text()
    else:
        page.evaluate('''student => {
          STATE.selectedStudent=student;
          document.querySelector('#drawerBody').innerHTML='<div class="cand-row" data-uid="43"><span class="cand-name">검증대</span><button class="cand-add-btn" data-gun="가">담기</button></div>';
          document.querySelector('.cand-add-btn').click();
        }''', STUDENT)
        expect(page.locator('#toastContainer')).to_contain_text('상담 점수를 계산하지 못했습니다')
        assert page.locator('.uni-card-shell').count() == 0
        assert not any('/wishlist/bulk-save' in item['url'] for item in saves)
        notice = page.locator('#toastContainer').inner_text()
    assert not any(term in notice for term in ['400', '401', 'CORS', 'TypeError', 'fetch'])
    assert not errors
    page.close()


def test_old_exam_result_cannot_restore_card_or_save_after_exam_changes(browser, base_url):
    page, _, errors, saves = open_page(browser, base_url, 'counsel')
    page.evaluate('''({student,formula}) => {
      STATE.selectedStudent=student; STATE.formulaCache['43-2027']=formula;
      const original=window.api;
      window.api=async(path,opts)=>{
        if(path.includes('/counseling/wishlist/'))return {success:true,wishlist:[{대학학과_ID:43,모집군:'가'}]};
        if(path==='/jungsi/calculate')return new Promise(resolve=>window.finishOld=resolve);
        return original(path,opts);
      };
      window.oldWishlist=loadWishlist();
    }''', {'student': STUDENT, 'formula': FORMULA})
    page.wait_for_function('typeof finishOld === "function"')
    page.evaluate('''() => {
      document.querySelector('#examSel').value='6월';
      STATE.selectedStudent=null;
      finishOld({success:true,result:{totalScore:'999.00'}});
    }''')
    page.evaluate('oldWishlist')
    assert page.locator('.uni-card-shell').count() == 0
    assert not saves
    assert not errors
    page.close()


def test_calculator_discards_previous_exam_response(browser, base_url):
    page, _, errors, _ = open_page(browser, base_url, 'calculator')
    page.evaluate('''() => {
      const original=window.api;
      window.api=(path,opts)=>path==='/jungsi/calculate' ?
        new Promise(resolve=>window.finishOld=resolve) : original(path,opts);
    }''')
    pick_department(page)
    page.wait_for_function('typeof finishOld === "function"')
    page.locator('#exam-select .combo-display').click()
    page.locator('#exam-select .combo-item[data-value="6월"]').click()
    page.evaluate('finishOld({success:true,result:{totalScore:"999.00"}})')
    expect(page.locator('#emptyState')).to_be_visible()
    assert page.locator('.score-suneung').count() == 0
    assert not errors
    page.close()


@pytest.mark.parametrize('kind', ['calculator', 'counsel'])
@pytest.mark.parametrize('status,score,notice', [('partial', '166.67', '미응시 종목 0점 반영'), ('all', '0.00', '전 종목 미응시 · 불합격 대상')])
def test_absence_zero_and_explanation_are_visible(browser, base_url, kind, status, score, notice):
    page, _, errors, _ = open_page(browser, base_url, kind)
    payload = {'success': True, 'result': {'totalScore': score, 'breakdown': {
        'events': [{'event': EVENTS[0], 'record': '미응시', 'score': 0, 'absent': True}], 'absence_status': status}}}
    page.route('**/silgi/calculate', lambda route: route.fulfill(content_type='application/json', body=json.dumps(payload)))
    if kind == 'calculator':
        pick_department(page)
        expect(page.locator('#results-tbody .student-name-cell')).to_contain_text('검증학생')
        selector = '.practical-input'
    else:
        page.evaluate('''({student,formula}) => {
          STATE.selectedStudent=student;STATE.formulaCache['43-2027']=formula;
          appendCardToColumn('가',createCardEl(formula,574.78));
        }''', {'student': STUDENT, 'formula': FORMULA})
        selector = '[data-event]'
    values = ['미응시'] * 3 if status == 'all' else ['미응시', '284', '12.4']
    for event, value in zip(EVENTS, values):
        page.locator(f'{selector}[data-event="{event}"]').fill(value)
    if kind == 'calculator':
        page.locator(selector).last.dispatch_event('change')
        target = page.locator('.total-silgi')
    else:
        page.evaluate('recalcCard(document.querySelector(".uni-card"))')
        target = page.locator('.score-silgi')
    expect(target).to_contain_text(score)
    expect(target).to_contain_text(notice)
    assert not errors
    page.close()
