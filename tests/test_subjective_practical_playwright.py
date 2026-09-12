"""실제 정적 페이지에서 합성 기록만 사용하며 모든 업무 API를 차단한다."""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

import pytest
from playwright.sync_api import Browser, Page, Route, expect
from test_counsel_previous_results_playwright import base_url, browser, jwt_token

STUDENT = {'student_id': 'subjective-synthetic', 'student_name': '검증학생', 'gender': '여',
           'school_name': '검증학교', 'scores': {'국어_백분위': 80}}
EVENTS = {104: ['제자리멀리뛰기', '지그재그런'], 105: ['높이뛰기']}


def formula(uid: int) -> dict[str, Any]:
    names = EVENTS[uid] + (['전공실기'] if uid == 104 else ['허들', '체조', '선택실기'])
    return {'U_ID': uid, '학년도': 2027, '대학명': '수원대학교' if uid == 104 else '숙명여자대학교',
            '학과명': '체육학과', '군': '가', '총점': 1000, '수능': 40, '실기': 60,
            '기타설정': {'subjectivePractical2027Reviewed': True},
            '실기배점': [{'종목명': event, '성별': '여', '기록': '130', '배점': 150} for event in names]}


def setup(page: Page) -> dict[str, Any]:
    state = {'requests': [], 'wishlist': [], 'failure': False, 'invalid': False, 'errors': []}
    if os.environ.get('SUBJECTIVE_DEBUG'):
        page.on('framenavigated', lambda frame: print('NAV', frame.url))
        page.on('console', lambda message: print('CONSOLE', message.type, message.text))
    page.on('pageerror', lambda error: state['errors'].append(str(error)))
    page.add_init_script(f"localStorage.setItem('jwt_token', {json.dumps(jwt_token())})")

    def handle(route: Route) -> None:
        url, request = route.request.url, route.request
        if os.environ.get('SUBJECTIVE_DEBUG'):
            print('API', request.method, url)
        if '/silgi/calculate' in url:
            data = request.post_data_json
            state['requests'].append({'url': url, 'body': data})
            if state['failure']:
                route.fulfill(status=400, content_type='application/json', body='{"success":false}')
                return
            uid = int(data['F_data']['U_ID'])
            records = data['S_data']['practicals']
            assert [record['event'] for record in records] == EVENTS[uid]
            scores = ([0 if record['value'] == '미응시' else 150 for record in records] if uid == 104
                      else [{'130': 75, 'F': 50, '미응시': 0}[records[0]['value'].upper()]])
            invalid = state['invalid']
            payload = {'success': True, 'result': {'totalScore': None, 'breakdown': {
                'partial': True, 'objective_complete': not invalid,
                'objective_score': None if invalid else sum(scores),
                'objective_max_score': 300 if uid == 104 else 75,
                'unscored_max_score': 300 if uid == 104 else 325, 'excluded_inputs': [],
                'ineligible': any(record['value'] == '미응시' for record in records),
                'events': [{'event': event, 'score': score, 'status': 'absent' if record['value'] == '미응시' else 'measured'}
                           for event, score, record in zip(EVENTS[uid], scores, records)],
                'validation_errors': [{'event': EVENTS[uid][0], 'code': 'invalid_score_table',
                                       'message': '공식 배점표를 확인해 주세요.'}] if invalid else []}}}
        elif '/university-list' in url:
            payload = {'success': True, 'list': [{'U_ID': uid, 'gun': '가', 'university': formula(uid)['대학명'],
                                                'department': '체육학과'} for uid in EVENTS]}
        elif '/formula-details' in url:
            uid = int(parse_qs(urlparse(url).query)['U_ID'][0])
            payload = {'success': True, 'formula': formula(uid)}
        elif '/students/list-by-branch' in url:
            payload = {'success': True, 'students': [STUDENT]}
        elif '/jungsi/calculate' in url:
            payload = {'success': True, 'result': {'totalScore': 200}}
        elif '/filter-data/' in url:
            payload = {'success': True, 'data': []}
        elif '/wishlist/bulk-save' in url:
            state['requests'].append({'url': url, 'body': request.post_data_json})
            state['wishlist'] = request.post_data_json['wishlistItems']
            payload = {'success': True}
        elif '/counseling/wishlist/' in url:
            payload = {'success': True, 'wishlist': state['wishlist']}
        elif '/consultation-draft' in url:
            pytest.fail('부분계산에 전체점수 분석 API가 호출됨')
        else:
            payload = {'success': True, 'data': [], 'stats': {'max_total_cut': 999, 'top10': 888}}
        route.fulfill(status=200, content_type='application/json', body=json.dumps(payload))

    page.route('https://supermax.kr/**', handle)
    return state


def counsel(page: Page, base_url: str, uid: int) -> dict[str, Any]:
    state = setup(page)
    page.goto(base_url + '/counsel.html', wait_until='domcontentloaded')
    page.wait_for_function('typeof createCardEl === "function" && STATE.allStudents.length === 1')
    page.evaluate('''({formula, student}) => {
      STATE.selectedStudent=student; document.querySelector('#yearSel').value='2027';
      STATE.formulaCache[`${formula.U_ID}-2027`]=formula;
      appendCardToColumn('가', createCardEl(formula,200));
    }''', {'formula': formula(uid), 'student': STUDENT})
    return state


def recalc(page: Page) -> None:
    page.evaluate('recalcCard(document.querySelector(".uni-card"))')


def saved(page: Page, state: dict[str, Any]) -> dict[str, Any]:
    page.evaluate('() => { saveWishlistNow(); }')
    page.wait_for_function('!_savingInFlight')
    expect(page.locator('.save-indicator')).to_contain_text('저장됨')
    return state['wishlist'][0]


def pdf_data(page: Page) -> dict[str, Any]:
    return page.evaluate('''() => {
      const data=extractPdfCardData(document.querySelector('.uni-card-shell'),'2027');
      return {data, html:pdfRenderCard(data,0)};
    }''')


def test_suwon_selection_partial_save_restore_and_pdf(browser: Browser, base_url: str, tmp_path: Path) -> None:
    page = browser.new_page(viewport={'width': 1440, 'height': 1100})
    state = counsel(page, base_url, 104)
    expect(page.locator('[data-event]')).to_have_count(2)
    expect(page.locator('.score-total')).to_have_text('—')
    expect(page.locator('.uni-metrics')).to_be_hidden()
    page.get_by_label('전공실기 종목', exact=True).select_option('체조')
    page.get_by_label('제자리멀리뛰기', exact=True).fill('280')
    recalc(page)
    assert not [request for request in state['requests'] if '/silgi/' in request['url']]
    page.get_by_label('지그재그런', exact=True).fill('13.6')
    recalc(page)
    expect(page.locator('.score-objective')).to_have_text('300.00')
    expect(page.locator('.score-objective-subtotal')).to_have_text('500.00')
    expect(page.locator('.score-total')).to_have_text('—')
    record = saved(page, state)
    assert record['상담_실기반영점수'] is None and record['상담_계산총점'] is None
    assert record['상담_실기기록'] == {'제자리멀리뛰기': '280', '지그재그런': '13.6', '_subjectiveSelection': '체조'}
    page.evaluate('loadWishlist()')
    expect(page.get_by_label('전공실기 종목', exact=True)).to_have_value('체조')
    expect(page.locator('.score-objective')).to_have_text('300.00')
    exported = pdf_data(page)
    assert exported['data']['total'] is None and exported['data']['practical'] is None
    assert exported['data']['partial']['selection'] == '체조'
    assert exported['data']['partial']['subtotal'] == 500
    assert 'MAX 총점컷' not in exported['html'] and '500.00' in exported['html']
    assert '최종총점</div><div class="v">—' in exported['html']
    page.set_viewport_size({'width': 390, 'height': 844})
    page.evaluate('closeDrawer()')
    expect(page.get_by_label('전공실기 종목', exact=True)).to_be_visible()
    assert page.get_by_label('전공실기 종목', exact=True).bounding_box()['height'] >= 44
    output = Path(os.environ.get('SUBJECTIVE_EVIDENCE_DIR', tmp_path)); output.mkdir(parents=True, exist_ok=True)
    page.locator('.uni-card-shell').screenshot(path=str(output / 'suwon-partial-mobile.png'))
    assert not state['errors']
    page.close()


def test_sookmyung_f50_zero_blank_invalid_and_failure_never_make_final_total(browser: Browser, base_url: str) -> None:
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    state = counsel(page, base_url, 105)
    expect(page.locator('[data-event]')).to_have_count(1)
    page.get_by_label('선택실기 종목', exact=True).select_option('핸드볼')
    record = page.get_by_label('높이뛰기', exact=True)
    for value, score in [('F', 50), ('미응시', 0), ('130', 75)]:
        record.fill(value); recalc(page)
        expect(page.locator('.score-objective')).to_have_text(f'{score:.2f}')
        expect(page.locator('.score-objective-subtotal')).to_have_text(f'{200 + score:.2f}')
        assert saved(page, state)['상담_계산총점'] is None
        exported = pdf_data(page)
        assert exported['data']['partial']['score'] == score
        assert exported['data']['total'] is None
    for value in ['', '112', 'F50']:
        record.fill(value); recalc(page)
        expect(page.locator('.score-objective')).to_have_text('—')
        assert pdf_data(page)['data']['partial']['score'] is None
        assert saved(page, state)['상담_계산총점'] is None
    record.fill('130'); state['invalid'] = True; recalc(page)
    expect(page.locator('.objective-status')).to_contain_text('배점표')
    expect(page.locator('.score-objective-subtotal')).to_have_text('—')
    state['invalid'] = False; state['failure'] = True; recalc(page)
    expect(page.locator('.objective-status')).to_contain_text('계산하지 못했습니다')
    assert saved(page, state)['상담_실기반영점수'] is None
    assert not state['errors']
    page.close()


@pytest.mark.parametrize('uid,score', [(104, 150), (105, 0)])
def test_absence_warning_survives_calculation_save_restore_and_pdf(browser: Browser, base_url: str, uid: int, score: int) -> None:
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    state = counsel(page, base_url, uid)
    for event in EVENTS[uid]:
        page.locator(f'[data-event="{event}"]').fill('13.6' if event == '지그재그런' else '미응시')
    recalc(page)
    expect(page.locator('.score-objective')).to_have_text(f'{score:.2f}')
    expect(page.locator('.objective-status')).to_contain_text('불합격 대상')
    assert saved(page, state)['상담_계산총점'] is None
    page.evaluate('loadWishlist()')
    expect(page.locator('.objective-status')).to_contain_text('불합격 대상')
    expect(page.locator('.score-objective')).to_have_text(f'{score:.2f}')
    assert pdf_data(page)['data']['partial']['ineligible'] is True
    assert '불합격 대상' in pdf_data(page)['html']
    if uid == 104:
        page.locator('[data-event="지그재그런"]').fill('12.01'); recalc(page)
        expect(page.locator('.score-objective')).to_have_text('—')
        expect(page.locator('.objective-status')).to_contain_text('0.1초')
        expect(page.locator('.objective-status')).to_contain_text('불합격 대상')
        page.locator('[data-event="지그재그런"]').fill('12.0')
        page.locator('[data-event="제자리멀리뛰기"]').fill('294.5'); recalc(page)
        expect(page.locator('.objective-status')).to_contain_text('정수 cm')
        expect(page.locator('.score-objective')).to_have_text('—')
    assert not state['errors']
    page.close()


@pytest.mark.parametrize('uid,value,score,choice', [(104, '280', 300, '농구'), (105, 'F', 50, '배구'), (105, '미응시', 0, '축구')])
def test_calculator_picker_objective_score_without_total_ranking_or_full_score_draft(
    browser: Browser, base_url: str, uid: int, value: str, score: int, choice: str,
) -> None:
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    state = setup(page)
    page.goto(base_url + '/calculator.html', wait_until='domcontentloaded')
    expect(page.locator('#metaStudentCount')).to_have_text('1')
    for selector, selected in [('#gun-select', '가'), ('#universityCombo', formula(uid)['대학명']), ('#department-select', str(uid))]:
        page.locator(selector + ' .combo-display').click()
        page.locator(selector + f' .combo-item[data-value="{selected}"]').click()
    expect(page.locator('.practical-input')).to_have_count(len(EVENTS[uid]))
    page.locator('[data-subjective-selection]').select_option(choice)
    for event in EVENTS[uid]:
        page.locator(f'[data-event="{event}"]').fill(value if event != '지그재그런' else '13.6')
    page.locator('.practical-input').last.dispatch_event('change')
    expect(page.locator('.score-objective')).to_have_text(f'{score:.2f}')
    expect(page.locator('.score-objective-subtotal')).to_have_text(f'{200 + score:.2f}')
    expect(page.locator('.score-total')).to_have_text('—')
    expect(page.locator('.rank-badge')).to_have_text('—')
    if value == '미응시':
        expect(page.locator('.objective-status')).to_contain_text('불합격 대상')
    expect(page.locator('#formulaCuts')).to_be_hidden()
    expect(page.locator('#sort-by-total')).to_have_count(0)
    expect(page.locator('#resultCountHint')).to_contain_text('순위 없음')
    page.locator('[data-consult-open]').click()
    expect(page.locator('#consultDraftText')).to_contain_text(choice)
    expect(page.locator('#consultDraftText')).to_contain_text(f'{200 + score:.2f}점')
    expect(page.locator('#consultSafetyNote')).to_contain_text('최종총점')
    if value == '미응시':
        expect(page.locator('#consultDraftText')).to_contain_text('불합격 대상')
    page.locator('[data-close-modal="consultationDraftModal"]').click()
    page.locator('.practical-input').first.fill('')
    page.locator('.practical-input').first.dispatch_event('change')
    expect(page.locator('.score-objective-subtotal')).to_have_text('—')
    assert not state['errors']
    page.close()
