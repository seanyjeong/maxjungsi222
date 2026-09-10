"""Direct school gymnastics points on both counseling input surfaces."""
import json
from pathlib import Path

import pytest
from playwright.sync_api import expect
from test_counsel_previous_results_playwright import base_url, browser, jwt_token

FORMULA = json.loads((Path(__file__).parent / 'fixtures/chungnam-gymnastics-2027.json').read_text())
STUDENT = {'student_id': 'gymnastics-fixture', 'student_name': '검증학생', 'gender': '남',
           'grade': '3', 'scores': {'국어_백분위': 94}}


@pytest.mark.parametrize('kind', ['counsel', 'calculator'])
def test_numeric_gymnastics_is_direct_and_letters_do_not_confirm_a_score(browser, base_url, kind, tmp_path):
    page = browser.new_page(viewport={'width': 1440, 'height': 1050})
    errors, calculations, saves = [], [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.add_init_script(f"localStorage.setItem('jwt_token',{json.dumps(jwt_token())})")

    def handle(route):
        url = route.request.url
        if '/silgi/calculate' in url:
            body = route.request.post_data_json
            calculations.append(body)
            assert route.request.headers['authorization'].startswith('Bearer ')
            assert route.request.headers['content-type'].startswith('application/json')
            records = {r['event']: r['value'] for r in body['S_data']['practicals']}
            if records['기계체조'] == 'A':
                route.fulfill(status=500, content_type='application/json', body='{"success":false,"message":"HTTP 500 stack"}')
                return
            assert records == {'핸드볼공던지기': '25', '기계체조': '75.25'}
            payload = {'success': True, 'result': {'totalScore': '145.250', 'breakdown': {
                'events': [{'event': '핸드볼공던지기', 'record': '25', 'score': 70, 'deduction_level': 5},
                           {'event': '기계체조', 'record': '75.25', 'score': 75.25, 'direct_score': True, 'deduction_level': None}],
                'total_deduction_level': None, 'direct_score_events': ['기계체조']}}}
        elif '/university-list' in url:
            payload = {'success': True, 'list': [{'U_ID': 36, 'gun': FORMULA['군'], 'university': '충남대학교', 'department': '체육교육과'}]}
        elif '/formula-details' in url:
            payload = {'success': True, 'formula': FORMULA}
        elif '/students/list-by-branch' in url:
            payload = {'success': True, 'students': [STUDENT]}
        elif '/jungsi/calculate' in url:
            payload = {'success': True, 'result': {'totalScore': '193.10'}}
        elif '/wishlist/bulk-save' in url:
            saves[:] = route.request.post_data_json['wishlistItems']
            payload = {'success': True}
        elif '/counseling/wishlist/' in url:
            payload = {'success': True, 'wishlist': saves}
        else:
            payload = {'success': True, 'data': [], 'stats': {}}
        route.fulfill(status=200, content_type='application/json', body=json.dumps(payload))

    page.route('https://supermax.kr/**', handle)
    page.goto(base_url + '/' + kind + '.html', wait_until='domcontentloaded')
    if kind == 'counsel':
        page.wait_for_function('typeof createCardEl === "function" && STATE.allStudents.length === 1')
        page.evaluate('''({formula,student}) => {
          STATE.selectedStudent=student;STATE.formulaCache['36-2027']=formula;
          document.querySelector('#yearSel').value='2027';appendCardToColumn(formula.군,createCardEl(formula,193.1));
        }''', {'formula': FORMULA, 'student': STUDENT})
        parent = page.locator('.uni-card-shell[data-uid="36"]')
        score = parent.locator('.score-silgi')
    else:
        expect(page.locator('#metaStudentCount')).to_have_text('1')
        for selector, value in [('#gun-select', FORMULA['군']), ('#universityCombo', '충남대학교'), ('#department-select', '36')]:
            page.locator(selector + ' .combo-display').click()
            page.locator(selector + f' .combo-item[data-value="{value}"]').click()
        parent = page.locator('#results-tbody tr')
        score = parent.locator('.total-silgi')
    expect(parent.locator('input[data-event]')).to_have_count(2)
    gym = parent.locator('input[data-event="기계체조"]')
    expect(gym).to_have_attribute('placeholder', '학교에서 받은 점수')
    parent.locator('input[data-event="핸드볼공던지기"]').fill('25')
    gym.fill('75.25')
    gym.dispatch_event('change')
    expect(score).to_contain_text('145.25')
    expect(score).to_contain_text('기계체조 입력 점수 반영')
    expect(parent.locator('.score-total')).to_have_text('338.35')
    if kind == 'counsel':
        expect(page.locator('.save-indicator')).to_contain_text('저장됨', timeout=6000)
        assert saves[0]['상담_실기기록'] == {'핸드볼공던지기': '25', '기계체조': '75.25'}
        assert saves[0]['상담_실기반영점수'] == 145.25
        assert saves[0]['상담_계산총점'] == 338.35
        page.evaluate('loadWishlist()')
        expect(gym).to_have_value('75.25')
        expect(score).to_contain_text('145.25')
    page.screenshot(path=str(tmp_path / (kind + '-gymnastics.png')), full_page=True)
    gym.fill('A')
    gym.dispatch_event('change')
    expect(score).to_contain_text('계산하지 못했습니다')
    expect(parent.locator('.score-total')).to_have_text('—')
    assert not any(token in page.locator('body').inner_text() for token in ['HTTP', 'stack'])
    assert not errors
    assert len(calculations) >= 2
    page.close()
