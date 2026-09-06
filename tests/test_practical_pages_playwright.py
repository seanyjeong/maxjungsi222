"""Whole static pages, synthetic records and intercepted API only."""
import json
import os
from pathlib import Path

from playwright.sync_api import expect
from test_counsel_previous_results_playwright import base_url, browser, jwt_token

ROOT = Path(__file__).parents[1]
EVENTS = ['10m왕복달리기', '제자리멀리뛰기', '메디신볼던지기']
FORMULA = {'U_ID': 43, '학년도': 2027, '대학명': '검증대학교', '학과명': '검증학과',
           '군': '가', '총점': 1000, '수능': 65, '내신': 10, '실기': 25, '실기총점': 250,
           '실기배점': [{'종목명': event, '성별': '남', '기록': '1', '배점': '38'} for event in EVENTS]}
STUDENT = {'student_id': 'synthetic', 'student_name': '검증학생', 'gender': '남',
           'school_name': '검증학교', 'scores': {'국어_백분위': 80}}


def setup(page):
    errors, requests, failure = [], [], [False]
    if os.environ.get('PRACTICAL_DEBUG'):
        page.on('framenavigated', lambda frame: print('NAV', frame.url))
        page.on('console', lambda message: print('CONSOLE', message.type, message.text))
        page.on('response', lambda response: print('RESPONSE', response.status, response.url)
                if 'supermax.kr' in response.url else None)
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.add_init_script(f"localStorage.setItem('jwt_token', {json.dumps(jwt_token())})")

    def handle(route):
        url = route.request.url
        if '/silgi/calculate' in url:
            requests.append({'url': url, 'headers': route.request.headers, 'body': route.request.post_data_json})
            if failure[0]:
                route.fulfill(status=400, content_type='application/json', body='{"success":false,"message":"HTTP 400 CORS stack"}')
                return
            payload = {'success': True, 'result': {'totalScore': '239.04', 'breakdown': {'events': []}}}
        elif '/university-list' in url:
            payload = {'success': True, 'list': [{'U_ID': 43, 'gun': '가', 'university': '검증대학교', 'department': '검증학과'}]}
        elif '/formula-details' in url:
            payload = {'success': True, 'formula': FORMULA}
        elif '/students/list-by-branch' in url:
            payload = {'success': True, 'students': [STUDENT]}
        elif '/jungsi/calculate' in url:
            payload = {'success': True, 'result': {'totalScore': '200.00'}}
        elif '/filter-data/' in url:
            payload = {'success': True, 'data': []}
        elif '/wishlist/bulk-save' in url:
            requests.append({'url': url, 'body': route.request.post_data_json})
            payload = {'success': True}
        else:
            payload = {'success': True, 'data': [], 'stats': {}}
        route.fulfill(status=200, content_type='application/json', body=json.dumps(payload))

    page.route('https://supermax.kr/**', handle)
    return errors, requests, failure


def test_calculator_full_picker_input_flow(browser, base_url, tmp_path):
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    errors, requests, failure = setup(page)
    page.goto(base_url + '/calculator.html', wait_until='domcontentloaded')
    expect(page.locator('#metaStudentCount')).to_have_text('1')
    for selector, value in [('#gun-select', '가'), ('#universityCombo', '검증대학교'), ('#department-select', '43')]:
        page.locator(selector + ' .combo-display').click()
        page.locator(selector + f' .combo-item[data-value="{value}"]').click()
    expect(page.locator('#results-tbody .student-name-cell')).to_contain_text('검증학생')
    inputs = page.locator('#results-tbody .practical-input')
    inputs.nth(0).fill('8.64')
    inputs.nth(0).dispatch_event('change')
    expect(page.locator('.total-silgi')).to_contain_text('모두 입력')
    assert not requests
    for index, value in enumerate(['8.64', '284', '12.4']):
        inputs.nth(index).fill(value)
    inputs.nth(2).dispatch_event('change')
    expect(page.locator('.total-silgi')).to_contain_text('239.04')
    expect(page.locator('#results-tbody .score-total')).to_have_text('439.04')
    assert requests[-1]['headers']['authorization'].startswith('Bearer ')
    assert requests[-1]['headers']['content-type'].startswith('application/json')
    assert len(requests[-1]['body']['S_data']['practicals']) == 3
    page.locator('#sort-by-total').click()
    page.locator('.student-name-cell').click()
    page.locator('[data-close-modal="studentScoresModal"]').click()
    failure[0] = True
    inputs.nth(0).fill('8.65')
    inputs.nth(0).dispatch_event('change')
    expect(page.locator('.total-silgi')).to_contain_text('계산하지 못했습니다')
    expect(page.locator('#results-tbody .score-total')).to_have_text('—')
    assert not errors
    output = Path(os.environ.get('PRACTICAL_EVIDENCE_DIR', tmp_path))
    output.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(output / 'calculator-error.png'), full_page=True)
    page.close()


def test_counsel_partial_cannot_save_false_score_and_complete_can_save(browser, base_url, tmp_path):
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    errors, requests, _failure = setup(page)
    page.goto(base_url + '/counsel.html', wait_until='domcontentloaded')
    page.wait_for_function('typeof createCardEl === "function" && typeof STATE !== "undefined" && STATE.allStudents.length === 1')
    page.evaluate('''({formula, student}) => {
      STATE.selectedStudent=student; STATE.formulaCache['43-2027']=formula;
      document.querySelector('#yearSel').value='2027';
      const shell=createCardEl(formula,200); appendCardToColumn('가', shell);
    }''', {'formula': FORMULA, 'student': STUDENT})
    page.locator('[data-event="10m왕복달리기"]').fill('8.64')
    page.evaluate('recalcCard(document.querySelector(".uni-card"))')
    expect(page.locator('.score-silgi')).to_contain_text('모두 입력')
    page.evaluate('saveWishlistNow()')
    assert not any('/wishlist/bulk-save' in item['url'] for item in requests)
    for event, value in zip(EVENTS, ['8.64', '284', '12.4']):
        page.locator(f'[data-event="{event}"]').fill(value)
    page.evaluate('recalcCard(document.querySelector(".uni-card"))')
    expect(page.locator('.score-silgi')).to_contain_text('239.04')
    assert page.evaluate('!_authErrorFired'), page.evaluate('({url:location.href, tokenPresent:!!getToken()})')
    page.evaluate('saveWishlistNow()')
    saved = next(item['body'] for item in requests if '/wishlist/bulk-save' in item['url'])
    assert saved['wishlistItems'][0]['상담_실기반영점수'] == 239.04
    assert saved['wishlistItems'][0]['상담_계산총점'] == 439.04
    assert not errors
    output = Path(os.environ.get('PRACTICAL_EVIDENCE_DIR', tmp_path))
    output.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(output / 'counsel-success.png'), full_page=True)
    page.close()
