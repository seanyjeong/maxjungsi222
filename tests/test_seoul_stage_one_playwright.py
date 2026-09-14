"""서울대 1단계 화면·순위·PDF·저장 격리: 합성 API만 사용한다."""
import json
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import expect
from test_counsel_previous_results_playwright import base_url, browser, jwt_token

FORMULA = {'U_ID': 96, '학년도': 2027, '대학명': '서울대학교', '학과명': '체육교육과',
           '군': '나', '모집정원': 32, '총점': 100, '수능': 80, '실기': 20, '실기총점': 20,
           '기타설정': {'remainingPractical2027Reviewed': True, 'seoulStageOne2027Reviewed': True},
           '국어': 100, '수학': 120, '탐구': 80,
           'english_scores': {'1': 0, '2': 0.5, '9': 14}, 'history_scores': {'1': 0, '4': 0.4, '9': 2.4},
           '실기배점': [{'종목명': '제자리멀리뛰기', '성별': '남', '기록': '280', '배점': '30'}]}
STUDENTS = [{'student_id': str(i), 'student_name': name, 'gender': '남', 'school_name': '합성학교',
             'scores': {'국어_표준점수': score}} for i, (name, score) in enumerate(
                 [('합성 가', 384.4), ('합성 나', 408.8), ('합성 다', 384.4), ('합성 라', 368)])]


def setup(page):
    state = {'errors': [], 'writes': [], 'practical': [], 'wishlist': []}
    page.add_init_script(f"localStorage.setItem('jwt_token', {json.dumps(jwt_token())})")
    page.on('pageerror', lambda error: state['errors'].append(str(error)))

    def handle(route):
        url = urlparse(route.request.url)
        query = parse_qs(url.query)
        year = int(query.get('year', [url.path.rsplit('/', 1)[-1] if url.path.rsplit('/', 1)[-1].isdigit() else '2027'])[0])
        if '/silgi/calculate' in url.path:
            state['practical'].append(route.request.post_data_json)
            payload = {'success': True, 'result': {'totalScore': '120'}}
        elif '/formula-details' in url.path:
            payload = {'success': True, 'formula': {**FORMULA, '학년도': year}}
        elif '/university-list' in url.path or '/schools/' in url.path:
            payload = {'success': True, 'list': [{'U_ID': 96, 'gun': '나', 'university': '서울대학교', 'department': '체육교육과', '광역': '서울'}]}
        elif '/cutoffs/' in url.path:
            payload = {'success': True, 'cutoffs': [{'U_ID': 96, '군': '나', '모집인원': 32, '수능비율': 80, '실기비율': 20, '단계별': '3배수',
                                                     '지점_수능컷': 850, '맥스_수능컷': 860, '25년총점컷': 800, '26년총점컷': 810}]}
        elif '/filter-data/' in url.path:
            payload = {'success': True, 'data': [{'U_ID': 96, '대학명': '서울대학교', '학과명': '체육교육과',
                                                  '국어_raw': '33', '수학_raw': '40', '탐구_raw': '27', '영어_raw': '감점', '한국사_raw': '감점', '실기종목_display': '제자리멀리뛰기'}]}
        elif '/students/list-by-branch' in url.path:
            payload = {'success': True, 'students': STUDENTS}
        elif '/jungsi/calculate' in url.path:
            scores = route.request.post_data_json['studentScores']
            value = next((subject.get('std', 384.4) for subject in scores.get('subjects', []) if subject.get('name') == '국어'), 384.4)
            payload = {'success': True, 'result': {'totalScore': str(value)}}
        elif '/wishlist/bulk-save' in url.path:
            state['writes'].append(route.request.post_data_json)
            state['wishlist'] = route.request.post_data_json['wishlistItems']
            payload = {'success': True}
        elif '/counseling/wishlist/' in url.path:
            payload = {'success': True, 'wishlist': state['wishlist']}
        else:
            payload = {'success': True, 'data': [], 'stats': {'top10': 850}}
        route.fulfill(content_type='application/json', body=json.dumps(payload))

    page.route('https://supermax.kr/**', handle)
    return state


def pick_calculator(page):
    for selector, value in [('#gun-select', '나'), ('#universityCombo', '서울대학교'), ('#department-select', '96')]:
        page.locator(selector + ' .combo-display').click()
        page.locator(selector + f' .combo-item[data-value="{value}"]').click()


def test_stage_one_calculator_sort_and_restore_2026(browser, base_url):
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    state = setup(page)
    page.goto(base_url + '/calculator.html', wait_until='domcontentloaded')
    expect(page.locator('#metaStudentCount')).to_have_text('4')
    pick_calculator(page)
    expect(page.locator('#results-tbody tr')).to_have_count(4)
    expect(page.locator('#results-thead th')).to_have_count(3)
    expect(page.locator('#sort-by-total')).to_contain_text('1단계 수능 점수')
    expect(page.locator('#resultCountHint')).to_have_text('4명 · 1단계 수능 점수 내림차순')
    expect(page.locator('#statSuneung')).to_have_text('100%')
    expect(page.locator('#statSilgiWrap')).to_be_hidden()
    expect(page.locator('#statTotal')).to_be_hidden()
    expect(page.locator('#formulaCuts')).to_be_hidden()
    expect(page.locator('.practical-input, .score-total')).to_have_count(0)
    expect(page.locator('#subjectiveCalculationNote')).to_contain_text('3배수 선발')
    assert page.locator('#results-tbody .score-suneung').all_text_contents() == ['408.80', '384.40', '384.40', '368.00']
    page.locator('#sort-by-total').click()  # ascending
    expect(page.locator('#resultCountHint')).to_have_text('4명 · 1단계 수능 점수 오름차순')
    assert page.locator('#results-tbody .rank-badge').all_text_contents() == ['04', '02', '02', '01']
    page.locator('#sort-by-total').click()  # descending
    expect(page.locator('#resultCountHint')).to_have_text('4명 · 1단계 수능 점수 내림차순')
    assert page.locator('#results-tbody .rank-badge').all_text_contents() == ['01', '02', '02', '04']
    expect(page.locator('#results-tbody .student-name-cell').first).to_contain_text('합성 나')
    # Reuse the same page to verify hidden panels restore for the prior year.
    page.locator('#year-select .combo-display').click()
    page.locator('#year-select .combo-item[data-value="2026"]').click()
    pick_calculator(page)
    expect(page.locator('#results-tbody .score-total')).to_have_count(4)
    expect(page.locator('#resultCountHint')).to_have_text('4명 · 총점 내림차순')
    page.locator('#sort-by-total').click()
    expect(page.locator('#resultCountHint')).to_have_text('4명 · 총점 오름차순')
    expect(page.locator('#statSilgiWrap')).to_be_visible()
    expect(page.locator('#statTotal')).to_be_visible()
    expect(page.locator('#subjectiveCalculationNote')).to_be_hidden()
    assert state['errors'] == state['practical'] == state['writes'] == []
    page.close()


def test_stage_one_counsel_pdf_and_existing_records_preserved(browser, base_url):
    page = browser.new_page()
    state = setup(page)
    page.goto(base_url + '/counsel.html', wait_until='domcontentloaded')
    page.wait_for_function('typeof createCardEl === "function" && STATE.allStudents.length === 4')
    saved = {'상담_내신점수': None, '상담_실기기록': {'제자리멀리뛰기': '270'}, '상담_실기반영점수': 120, '상담_계산총점': 850, '메모': '기존 합성 상담'}
    page.evaluate('''({formula, student, saved}) => {
      STATE.selectedStudent=student; document.querySelector('#yearSel').value='2027';
      STATE.formulaCache['96-2027']=formula;
      appendCardToColumn('나', createCardEl(formula,384.4,saved));
    }''', {'formula': FORMULA, 'student': STUDENTS[0], 'saved': saved})
    card = page.locator('.uni-card-shell[data-uid="96"]')
    expect(card.locator('.uni-breakdown')).to_contain_text('1단계 수능 점수')
    expect(card.locator('.score-total, .score-silgi, [data-event], .uni-metrics, .uni-diff-row')).to_have_count(0)
    expect(card).to_contain_text('수능 100% · 3배수 선발')
    page.evaluate('''() => {
      STATE.allFilterData=[{U_ID:96, 대학명:'서울대학교', 학과명:'체육교육과', 군:'나', 수능:80, 실기:20,
        국어_raw:'33', 수학_raw:'40', 탐구_raw:'27', branch_suneung_cut:850, max_suneung_cut:860}];
      renderDrawer();
    }''')
    drawer = page.locator('.cand-row[data-uid="96"]')
    expect(drawer).to_contain_text('1단계 수능 점수')
    expect(drawer).to_contain_text('수능 100% · 3배수 선발')
    expect(drawer.locator('.cand-cuts, .cand-events, [data-diff-out]')).to_have_count(0)
    page.evaluate('recalcCard(document.querySelector(".uni-card"))')
    pdf = page.evaluate('''() => {
      const data=extractPdfCardData(document.querySelector('.uni-card-shell'),2027);
      return {data, html:pdfRenderCard(data,0)};
    }''')
    assert pdf['data']['total'] is None and pdf['data']['practical'] is None
    assert pdf['data']['records'] == []
    assert '1단계 수능 점수' in pdf['html'] and '총점' not in pdf['html']
    assert '384.40' in pdf['html'] and '3배수 선발' in pdf['html']
    card.locator('.uni-memo').fill('메모만 수정')
    page.evaluate('saveWishlistNow()')
    expect(page.locator('.save-indicator')).to_contain_text('저장됨')
    expect(page.locator('.save-indicator')).not_to_contain_text('실기 계산 대기')
    record = state['writes'][-1]['wishlistItems'][0]
    for key in ['상담_내신점수', '상담_실기기록', '상담_실기반영점수', '상담_계산총점']:
        assert record[key] == saved[key]
    assert record['상담_수능점수'] == 384.4 and record['메모'] == '메모만 수정'
    page.evaluate('''() => { clearCounselBoard(); appendCardToColumn('나', createCardEl(STATE.formulaCache['96-2027'],408.8)); }''')
    page.evaluate('saveWishlistNow()')
    fresh = state['writes'][-1]['wishlistItems'][0]
    assert fresh['상담_실기기록'] is None and fresh['상담_실기반영점수'] is None and fresh['상담_계산총점'] is None
    assert state['errors'] == state['practical'] == []
    page.close()


def test_stage_one_overview_coefficients_and_legacy_isolation(browser, base_url):
    page = browser.new_page()
    state = setup(page)
    page.goto(base_url + '/university_overview.html', wait_until='domcontentloaded')
    row = page.locator('#tbody tr[data-uid="96"]')
    expect(row).to_contain_text('1단계 100%')
    expect(row).to_contain_text('표준점수 × 1.2')
    row.click()
    expect(page.locator('#mdScoreInfo')).to_contain_text('1단계 수능 점수')
    expect(page.locator('#mdScoreInfo')).not_to_contain_text('전형 총점')
    expect(page.locator('#mdChips')).to_have_text('수능 100% · 3배수 선발')
    expect(page.locator('#mdCuts')).to_be_hidden()
    expect(page.locator('#mdGenderToggle')).to_be_hidden()
    expect(page.locator('#mdSilgiTbody')).to_be_empty()
    expect(page.locator('#mdPracticalLevels')).to_be_empty()
    page.locator('#mdPracticalNotice summary').click()
    expect(page.locator('#mdPracticalNotice')).to_contain_text('각15점')
    expect(page.locator('#mdPracticalNotice')).to_contain_text('각20점')
    page.locator('#mdClose').click()
    page.locator('#yearSel .combo-display').click()
    page.locator('#yearSel [data-value="2026"]').click()
    expect(row).to_contain_text('80%')
    expect(row).not_to_contain_text('1단계 100%')
    row.click()
    expect(page.locator('#mdScoreInfo')).to_contain_text('전형 총점')
    expect(page.locator('#mdCuts')).to_be_visible()
    expect(page.locator('#mdGenderToggle')).to_be_visible()
    expect(page.locator('#mdSilgiTbody')).to_contain_text('280')
    assert state['errors'] == state['writes'] == []
    page.close()
