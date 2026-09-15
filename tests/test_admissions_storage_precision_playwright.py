from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import pytest

from test_live_hub_year_playwright import base_url, browser, jwt_token


FEATURES = {165: 'hufsCsat2027Reviewed', 173: 'pknuCsat2027Reviewed',
            174: 'pnuCsat2027Reviewed', 71: 'relativeCsat2027Reviewed'}


def install_fixtures(page, uid=165, year=2027, enabled=True, score='538.123456', prefill=True, alternate_uid=None, practical=False):
    writes = []
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.add_init_script(f"localStorage.setItem('jwt_token', {json.dumps(jwt_token())})")
    school = {'U_ID': uid, 'gun': '가', 'university': '가상대학교', 'department': '가상학과'}
    formula = {'U_ID': uid, '학년도': year, '기타설정': {FEATURES.get(uid, 'unused'): enabled},
               '총점': 1000, '수능': 100, '실기': 0, '내신': 0, '실기배점': [],
               '대학명': '가상대학교', '학과명': '가상학과'}
    student = {'student_id': 'synthetic-precision', 'student_name': '가상 학생', 'gender': '남',
               'scores': {'입력유형': 'official', '국어_표준점수': 100, '영어_등급': 2}}
    if practical:
        formula.update(수능=80, 실기=20, 실기배점=[{'종목명': '가상 종목'}])
    applicants = [{'name': '가상 A', 'counsel_id': 'synthetic-a', 'gender': '남', 'branch': '가상지점',
                   'suneung_score': '538.123456', 'total_score': '638.123456', 'practical_score': '100.12',
                   'silgi_score': '100.12', 'result_final': '최종합'},
                  {'name': '가상 B', 'counsel_id': 'synthetic-b', 'gender': '여', 'branch': '가상지점',
                   'suneung_score': '538.123458', 'total_score': '638.123458', 'practical_score': '100.12',
                   'silgi_score': '100.12', 'result_final': '최종합'}]

    def handle(route):
        request = route.request
        url = urlparse(request.url)
        path = url.path
        body = {'success': True}
        if request.method not in ('GET', 'HEAD'):
            writes.append({'method': request.method, 'path': path, 'body': request.post_data_json if request.post_data else None})
        if path == '/silgi/calculate':
            body['result'] = {'totalScore': '100.12', 'breakdown': {'total_deduction_level': 1, 'events': [{'event': '가상 종목', 'score': 100.12, 'deduction_level': 1}]}}
        elif path.endswith('/calculate'):
            body['result'] = {'totalScore': score}
        elif '/students/list-by-branch' in path:
            body['students'] = [student]
        elif '/university-list' in path or '/schools/' in path or '/saved-universes/' in path:
            body['list'] = [school] + ([{**school, 'U_ID': alternate_uid, 'department': '전환학과'}] if alternate_uid else [])
        elif '/formula-details' in path:
            query = parse_qs(url.query)
            selected = int(query.get('U_ID', [uid])[0])
            body['formula'] = {**formula, 'U_ID': selected, '학년도': int(query.get('year', [year])[0]),
                               '기타설정': {FEATURES.get(selected, 'unused'): enabled}}
        elif '/final-apply/' in path and request.method == 'GET':
            body['applications'] = ([{'모집군': '가', '대학학과_ID': uid, '대학명': '가상대학교'}] if prefill else [])
        elif '/university-applicants/' in path or '/university-final-applicants/' in path or '/by-university/' in path:
            body.update(applicants=applicants, university={'quota': 22}, scoreTable=[])
        route.fulfill(status=200, content_type='application/json', body=json.dumps(body, ensure_ascii=False))

    page.route('https://supermax.kr/**', handle)
    return writes, errors


def choose(page, selector, value):
    page.locator(f'{selector} .combo-display').click()
    page.locator(f'{selector} .combo-item[data-value="{value}"]').click()


@pytest.mark.parametrize(('uid', 'year', 'enabled', 'expected'), [
    (165, 2027, True, '538.123456'), (173, 2027, True, '538.1235'),
    (174, 2027, True, '538.1235'), (71, 2027, True, '538.123'),
    (165, 2026, True, '538.12'), (165, 2027, False, '538.12'),
])
def test_final_application_saves_precise_calculation_not_dom(browser, base_url, uid, year, enabled, expected):
    page = browser.new_page(viewport={'width': 1440, 'height': 1100})
    writes, errors = install_fixtures(page, uid, year, enabled)
    page.goto(f'{base_url}/final_apply.html', wait_until='domcontentloaded')
    if year != 2027:
        choose(page, '#year-cb', str(year))
    choose(page, '#student-cb', 'synthetic-precision')
    card = page.locator('.gun-card[data-gun="가"]')
    page.wait_for_function('(value) => document.querySelector(".gun-card[data-gun=가] .suneung-v")?.textContent === value', arg=expected)
    assert card.locator('.total-v').inner_text().startswith(expected)
    # Deliberately corrupt display text; a real save must recompute and use its exact state.
    card.locator('.suneung-v').evaluate('(node) => node.textContent = "1.00"')
    card.locator('.total-v').evaluate('(node) => node.textContent = "2.00"')
    page.locator('#save-btn').click()
    page.wait_for_function('() => !document.querySelector("#save-btn").disabled')
    saved = [item['body'] for item in writes if item['path'] == '/jungsi/final-apply/set']
    assert len(saved) == 1
    assert saved[0]['지원_수능점수'] == 538.123456
    assert saved[0]['지원_총점'] == 538.123456
    if uid == 165 and year == 2027 and enabled:
        screenshot(page, 'final_apply')
    assert not errors
    page.close()


@pytest.mark.parametrize('page_name', ['school_app.html', 'school_app_final.html', 'counseling_by_university.html'])
@pytest.mark.parametrize(('uid', 'year', 'expected', 'average'), [
    (165, 2027, '538.123458', '538.123457'),
    (173, 2027, '538.1235', '538.1235'),
    (165, 2026, '538.12', '538.12'),
])
def test_saved_score_lists_and_statistics_preserve_scoped_precision(browser, base_url, page_name, uid, year, expected, average):
    page = browser.new_page(viewport={'width': 1550, 'height': 1100})
    writes, errors = install_fixtures(page, uid, year)
    page.goto(f'{base_url}/{page_name}', wait_until='domcontentloaded')
    if year != 2027:
        choose(page, '#year-select', str(year))
    if page_name == 'counseling_by_university.html':
        choose(page, '#university-select', str(uid))
    else:
        choose(page, '#gun-select', '가')
        choose(page, '#university-select', '가상대학교')
        choose(page, '#department-select', str(uid))
    page.wait_for_function('(value) => document.querySelector("#statMaxSuneung")?.textContent === value', arg=expected)
    assert page.locator('#statAvgSuneung').inner_text() == average
    text = page.locator('#applicantsContainer').inner_text()
    assert expected in text
    assert expected.replace('538.', '638.') in text
    assert '100.12' in text
    if uid == 165 and year == 2027:
        rows = page.locator('tr.applicant-row' if page_name == 'counseling_by_university.html' else '.applicant-card')
        assert '538.123458' in rows.nth(0).inner_text()
        assert '538.123456' in rows.nth(1).inner_text()
        if page_name == 'school_app.html':
            assert rows.nth(0).locator('.col-suneung').evaluate('(node) => node.scrollWidth <= node.clientWidth')
            assert rows.nth(0).locator('.col-total').evaluate('(node) => node.scrollWidth <= node.clientWidth')
    if page_name != 'counseling_by_university.html':
        assert page.locator('#statMinSuneung').inner_text() == ('538.123456' if uid == 165 and year == 2027 else expected)
    assert not [item for item in writes if item['method'] in ('POST', 'PUT', 'DELETE') and not item['path'].endswith('/calculate')]
    if uid == 165 and year == 2027:
        screenshot(page, page_name.replace('.html', ''))
    assert not errors
    page.close()


def screenshot(page, name):
    directory = Path(__file__).parent / 'precision-artifacts'
    directory.mkdir(exist_ok=True)
    page.screenshot(path=str(directory / f'{name}.png'), full_page=True)


def test_final_school_switch_and_practical_payload_use_current_exact_state(browser, base_url):
    page = browser.new_page(viewport={'width': 1440, 'height': 1100})
    writes, errors = install_fixtures(page, prefill=False, alternate_uid=173, practical=True)
    page.goto(f'{base_url}/final_apply.html', wait_until='domcontentloaded')
    choose(page, '#student-cb', 'synthetic-precision')
    card = '.gun-card[data-gun="가"]'
    choose(page, card + ' .uni-cb', '가상대학교')
    choose(page, card + ' .dept-cb', '165')
    page.wait_for_function('() => document.querySelector(".gun-card[data-gun=가] .suneung-v")?.textContent === "538.123456"')
    choose(page, card + ' .dept-cb', '173')
    page.wait_for_function('() => document.querySelector(".gun-card[data-gun=가] .suneung-v")?.textContent === "538.1235"')
    page.locator(card + ' .silgi-input').fill('12.34')
    page.locator(card + ' .memo-input').fill('가상 검수 메모')
    choose(page, card + ' .initial-cb', '예비')
    page.locator(card + ' .reserve-number-input').fill('3')
    page.locator('#save-btn').click()
    page.wait_for_function('() => !document.querySelector("#save-btn").disabled')
    saved = [item['body'] for item in writes if item['path'] == '/jungsi/final-apply/set']
    assert len(saved) == 1
    assert saved[0]['대학학과_ID'] == 173
    assert saved[0]['지원_수능점수'] == 538.123456
    assert abs(saved[0]['지원_총점'] - 638.243456) < 1e-9
    assert saved[0]['지원_실기총점'] == '100.12'
    assert saved[0]['지원_실기기록'] == {'가상 종목': '12.34'}
    assert saved[0]['결과_최초'] == '예비 3번'
    assert saved[0]['메모'] == '가상 검수 메모'
    assert not errors
    page.close()
