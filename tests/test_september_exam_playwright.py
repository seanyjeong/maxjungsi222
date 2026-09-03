from __future__ import annotations

import base64
import json
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright


ROOT = Path(__file__).parents[1]


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, _format: str, *_args: object) -> None:
        return


@pytest.fixture(scope="module")
def base_url() -> str:
    handler = partial(QuietHandler, directory=str(ROOT))
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}"
    finally:
        server.shutdown()
        thread.join(timeout=5)


@pytest.fixture(scope="module")
def browser():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        yield browser
        browser.close()


def jwt_token() -> str:
    payload = base64.urlsafe_b64encode(
        json.dumps({"userid": "owner-1", "branch": "수원", "role": "owner"}).encode()
    ).decode().rstrip("=")
    return f"header.{payload}.signature"


def select_combo(page, selector: str, value: str) -> None:
    page.locator(f"{selector} .combo-display").click()
    page.locator(f"{selector} .combo-item[data-value='{value}']").click()


def test_gacha_routes_each_student_by_grade_without_year_selection(browser, base_url: str) -> None:
    loaded_years: list[str] = []
    list_requests: list[str] = []
    save_requests: list[dict] = []
    recompute_years: list[str] = []
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.add_init_script(f"localStorage.setItem('jwt_token', {json.dumps(jwt_token())})")

    def handle(route) -> None:
        url = route.request.url
        if "/jungsi/students/list-by-branch" in url:
            list_requests.append(url)
            year = url.split("year=", 1)[1].split("&", 1)[0]
            loaded_years.append(year)
            students = [
                {
                    "student_id": 901,
                    "student_name": "고2학생",
                    "grade": "2",
                    "gender": "여",
                    "scores": {},
                },
                {
                    "student_id": 902,
                    "student_name": "고3학생",
                    "grade": "3",
                    "gender": "남",
                    "scores": {},
                },
            ]
            body = {"success": True, "students": students}
        elif url.endswith("/jungsi/students/scores/bulk-set-wide"):
            request_body = json.loads(route.request.post_data or "{}")
            save_requests.append({
                "body": request_body,
                "authorization": route.request.headers.get("authorization", ""),
            })
            body = {"success": True, "updatedData": []}
        elif url.endswith("/jungsi/students/scores/recompute"):
            request_body = json.loads(route.request.post_data or "{}")
            recompute_years.append(request_body["year"])
            body = {"success": True, "updated": 0}
        else:
            route.fulfill(status=404, content_type="application/json", body='{"success":false}')
            return
        route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps(body, ensure_ascii=False),
        )

    page.route("https://supermax.kr/jungsi/**", handle)
    page.goto(f"{base_url}/gachaejeom.html", wait_until="domcontentloaded")
    page.get_by_text("고2학생").wait_for()
    page.get_by_text("고3학생").wait_for()

    assert loaded_years == ["2027"]
    assert all("cohort=registered" in url for url in list_requests)
    page.locator("#yearCombo .combo-display").click()
    assert page.locator("#yearCombo .combo-item[data-value='2028']").count() == 0
    page.keyboard.press("Escape")
    high2_row = page.locator("#scoreTbody tr[data-student-id='901']")
    high3_row = page.locator("#scoreTbody tr[data-student-id='902']")
    assert high2_row.locator(".cell-subj .label").all_text_contents() == [
        "국어", "수학", "통합사회", "통합과학",
    ]
    assert high3_row.locator(".cell-subj .label").all_text_contents() == [
        "화법과작문", "확률과통계", "- 선택 -", "- 선택 -",
    ]

    high2_row.locator("input[name='국어_원점수']").fill("90")
    high2_row.locator("input[name='수학_원점수']").fill("84")
    high2_row.locator("input[name='탐구1_원점수']").fill("43")
    high2_row.locator("input[name='탐구2_원점수']").fill("44")
    high3_row.locator("input[name='국어_원점수']").fill("90")
    page.locator("#saveBtn").click()
    page.wait_for_function("() => document.querySelector('#saveBtn').disabled")

    assert len(save_requests) == 1
    assert all(item["authorization"] == f"Bearer {jwt_token()}" for item in save_requests)
    request_body = save_requests[0]["body"]
    assert request_body["학년도"] == "2027"
    assert request_body["모형"] == "9월"
    high2_item = next(
        item for item in request_body["studentScores"] if item["student_id"] == 901
    )
    scores = high2_item["scores"]
    assert scores["국어_선택과목"] == "국어"
    assert scores["수학_선택과목"] == "수학"
    assert scores["탐구1_선택과목"] == "통합사회"
    assert scores["탐구2_선택과목"] == "통합과학"

    page.locator("#recalcBtn").click()
    page.wait_for_function("() => !document.querySelector('#recalcBtn').disabled")
    assert recompute_years == ["2027"]
    page.close()


def test_distribution_error_is_plain_korean_without_technical_terms(browser, base_url: str) -> None:
    authorization_headers: list[str] = []
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.add_init_script(f"localStorage.setItem('jwt_token', {json.dumps(jwt_token())})")

    def handle(route) -> None:
        authorization_headers.append(route.request.headers.get("authorization", ""))
        route.fulfill(
            status=500,
            content_type="application/json",
            body='{"success":false,"message":"SQL stack CORS 401"}',
        )

    page.route("https://supermax.kr/jungsi/grade-distribution-by-exam**", handle)
    page.goto(f"{base_url}/grade_distribution.html", wait_until="domcontentloaded")
    page.get_by_text("성적 분포를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.").wait_for()
    visible_text = page.locator("body").inner_text()
    assert not any(term in visible_text for term in ("HTTP", "400", "401", "CORS", "SQL", "stack"))
    assert authorization_headers == [f"Bearer {jwt_token()}"]
    page.locator("#yearSel .combo-display").click()
    assert page.locator("#yearSel .combo-item[data-value='2028']").count() == 0
    page.close()


def test_gacha_save_error_is_plain_korean_and_keeps_changes(browser, base_url: str) -> None:
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.add_init_script(f"localStorage.setItem('jwt_token', {json.dumps(jwt_token())})")

    def handle(route) -> None:
        url = route.request.url
        if "/jungsi/students/list-by-branch" in url:
            students = [{
                "student_id": 903,
                "student_name": "저장확인",
                "grade": "2",
                "scores": {},
            }]
            route.fulfill(
                status=200,
                content_type="application/json",
                body=json.dumps({"success": True, "students": students}, ensure_ascii=False),
            )
            return
        route.fulfill(
            status=500,
            content_type="application/json",
            body='{"success":false,"message":"SQL stack CORS 401"}',
        )

    page.route("https://supermax.kr/jungsi/**", handle)
    page.goto(f"{base_url}/gachaejeom.html", wait_until="domcontentloaded")
    row = page.locator("#scoreTbody tr[data-student-id='903']")
    row.get_by_text("국어").wait_for()
    row.locator("input[name='국어_원점수']").fill("90")
    page.locator("#saveBtn").click()
    page.get_by_text("가채점 성적을 저장하지 못했습니다. 잠시 후 다시 시도해주세요.").wait_for()

    visible_text = page.locator("body").inner_text()
    assert not any(term in visible_text for term in ("HTTP", "400", "401", "CORS", "SQL", "stack"))
    assert row.get_attribute("class") is not None and "dirty" in row.get_attribute("class")
    page.close()


def test_admin_editors_switch_to_high2_subjects(browser, base_url: str) -> None:
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.add_init_script(f"localStorage.setItem('jwt_token', {json.dumps(jwt_token())})")

    def handle(route) -> None:
        url = route.request.url
        if url.endswith("/jungsi/topmax/subjects"):
            body = {"success": True, "subjects": ["화법과작문", "언어와매체"]}
        elif "/jungsi/topmax/" in url:
            body = {"success": True, "data": {}}
        else:
            route.fulfill(status=404, content_type="application/json", body='{"success":false}')
            return
        route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps(body, ensure_ascii=False),
        )

    page.route("https://supermax.kr/jungsi/**", handle)
    page.goto(f"{base_url}/gradecut_editor.html", wait_until="domcontentloaded")
    gradecut_2027 = page.locator("#subject-select option").all_text_contents()
    assert all(subject in gradecut_2027 for subject in (
        "국어", "수학", "통합사회", "통합과학",
    ))
    page.select_option("#year-select", "2028")
    assert page.locator("#exam-type-select").input_value() == "9월"
    assert page.locator("#subject-select option").all_text_contents() == [
        "-- 과목 선택 --", "국어", "수학", "통합사회", "통합과학",
    ]

    page.goto(f"{base_url}/topmax_editor.html", wait_until="domcontentloaded")
    assert page.locator("#hdr th").all_text_contents() == [
        "과목", "화법과작문", "언어와매체",
        "국어", "수학", "통합사회", "통합과학",
    ]
    page.select_option("#year", "2028")
    page.wait_for_function("() => document.querySelector('#exam').value === '9월'")
    assert page.locator("#hdr th").all_text_contents() == [
        "과목", "국어", "수학", "통합사회", "통합과학",
    ]
    page.close()


def test_grade_two_registration_stays_in_2027(browser, base_url: str) -> None:
    list_requests: list[str] = []
    add_requests: list[dict] = []
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.add_init_script(f"localStorage.setItem('jwt_token', {json.dumps(jwt_token())})")

    def handle(route) -> None:
        url = route.request.url
        if "/jungsi/students/list-by-branch" in url:
            list_requests.append(url)
            body = {"success": True, "students": []}
        elif url.endswith("/jungsi/students/bulk-add-deduplicated"):
            add_requests.append(json.loads(route.request.post_data or "{}"))
            body = {
                "success": True, "insertedCount": 1,
                "duplicateCount": 0, "errors": [],
            }
        else:
            route.fulfill(status=404, content_type="application/json", body='{"success":false}')
            return
        route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps(body, ensure_ascii=False),
        )

    page.route("https://supermax.kr/jungsi/**", handle)
    page.goto(f"{base_url}/add_student.html", wait_until="domcontentloaded")
    page.wait_for_function("() => document.querySelector('#addTbody select[name=grade]') !== null")
    page.locator("#yearSel .combo-display").click()
    year_options = [
        text.strip() for text in page.locator("#yearSel .combo-item").all_text_contents()
    ]
    assert year_options == [
        "2027학년도 (2·3학년)", "2026학년도",
    ]
    page.keyboard.press("Escape")
    assert "year=2027" in list_requests[-1]
    assert "cohort=registered" in list_requests[-1]

    row = page.locator("#addTbody tr").first
    row.locator("input[name='student_name']").fill("고2등록확인")
    row.locator("select[name='grade']").select_option("2")
    page.locator("#bulkAddBtn").click()
    page.get_by_text("1명 추가 완료").wait_for()

    assert add_requests == [{
        "학년도": "2027",
        "students": [{
            "student_name": "고2등록확인",
            "school_name": None,
            "phone_number": None,
            "phone_owner": "학생",
            "grade": "2",
            "gender": "남",
        }],
    }]
    page.close()


def test_student_bulk_add_reports_automatic_duplicate_exclusion(browser, base_url: str) -> None:
    add_requests: list[dict] = []
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.add_init_script(f"localStorage.setItem('jwt_token', {json.dumps(jwt_token())})")

    def handle(route) -> None:
        url = route.request.url
        if "/jungsi/students/list-by-branch" in url:
            body = {"success": True, "students": []}
        elif url.endswith("/jungsi/students/bulk-add-deduplicated"):
            add_requests.append({
                "body": json.loads(route.request.post_data or "{}"),
                "authorization": route.request.headers.get("authorization", ""),
            })
            body = {
                "success": True,
                "insertedCount": 0,
                "duplicateCount": 1,
                "errors": [],
            }
        else:
            route.fulfill(status=404, content_type="application/json", body='{"success":false}')
            return
        route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps(body, ensure_ascii=False),
        )

    page.route("https://supermax.kr/jungsi/**", handle)
    page.goto(f"{base_url}/add_student.html", wait_until="domcontentloaded")
    page.wait_for_function("() => document.querySelector('#addTbody tr') !== null")
    row = page.locator("#addTbody tr").first
    row.locator("input[name='student_name']").fill("김학생")
    row.locator("input[name='school_name']").fill("맥스고")
    row.locator("select[name='grade']").select_option("2")
    row.locator("select[name='gender']").select_option("여")
    page.locator("#bulkAddBtn").click()

    page.get_by_text("0명 추가 · 중복 1명 제외").wait_for()
    assert len(add_requests) == 1
    assert add_requests[0]["authorization"].startswith("Bearer ")
    assert add_requests[0]["body"]["students"][0] == {
        "student_name": "김학생",
        "school_name": "맥스고",
        "phone_number": None,
        "phone_owner": "학생",
        "grade": "2",
        "gender": "여",
    }
    page.close()


def test_student_bulk_add_hides_server_details_from_error_message(browser, base_url: str) -> None:
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.add_init_script(f"localStorage.setItem('jwt_token', {json.dumps(jwt_token())})")

    def handle(route) -> None:
        url = route.request.url
        if "/jungsi/students/list-by-branch" in url:
            route.fulfill(
                status=200,
                content_type="application/json",
                body='{"success":true,"students":[]}',
            )
            return
        if url.endswith("/jungsi/students/bulk-add-deduplicated"):
            route.fulfill(
                status=500,
                content_type="application/json",
                body='{"success":false,"message":"ER_BAD_FIELD_ERROR raw SQL"}',
            )
            return
        route.fulfill(status=404, content_type="application/json", body='{"success":false}')

    page.route("https://supermax.kr/jungsi/**", handle)
    page.goto(f"{base_url}/add_student.html", wait_until="domcontentloaded")
    page.wait_for_function("() => document.querySelector('#addTbody tr') !== null")
    page.locator("#addTbody input[name='student_name']").fill("오류확인")
    page.locator("#bulkAddBtn").click()

    page.get_by_text("학생을 추가하지 못했습니다. 잠시 후 다시 시도해주세요.").wait_for()
    assert page.get_by_text("ER_BAD_FIELD_ERROR raw SQL").count() == 0
    page.close()


def test_student_bulk_paste_normalizes_common_grade_gender_and_owner_labels(
    browser, base_url: str,
) -> None:
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.add_init_script(f"localStorage.setItem('jwt_token', {json.dumps(jwt_token())})")

    def handle(route) -> None:
        if "/jungsi/students/list-by-branch" in route.request.url:
            route.fulfill(
                status=200,
                content_type="application/json",
                body='{"success":true,"students":[]}',
            )
            return
        route.fulfill(status=404, content_type="application/json", body='{"success":false}')

    page.route("https://supermax.kr/jungsi/**", handle)
    page.goto(f"{base_url}/add_student.html", wait_until="domcontentloaded")
    page.wait_for_function("() => document.querySelector('#addTbody tr') !== null")
    page.locator("#addTbody input[name='student_name']").evaluate(
        """(input) => {
          const data = new DataTransfer();
          data.setData('text/plain', '붙여학생\\t맥스고\\t010-0000-0000\\t모\\t고2\\t여자\\n');
          input.dispatchEvent(new ClipboardEvent('paste', {
            clipboardData: data, bubbles: true, cancelable: true,
          }));
        }"""
    )

    row = page.locator("#addTbody tr").first
    assert row.locator("select[name='phone_owner']").input_value() == "학부모"
    assert row.locator("select[name='grade']").input_value() == "2"
    assert row.locator("select[name='gender']").input_value() == "여"
    page.close()


def test_student_bulk_paste_rejects_unknown_identity_label(browser, base_url: str) -> None:
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.add_init_script(f"localStorage.setItem('jwt_token', {json.dumps(jwt_token())})")

    def handle(route) -> None:
        if "/jungsi/students/list-by-branch" in route.request.url:
            route.fulfill(
                status=200,
                content_type="application/json",
                body='{"success":true,"students":[]}',
            )
            return
        route.fulfill(status=404, content_type="application/json", body='{"success":false}')

    page.route("https://supermax.kr/jungsi/**", handle)
    page.goto(f"{base_url}/add_student.html", wait_until="domcontentloaded")
    page.wait_for_function("() => document.querySelector('#addTbody tr') !== null")
    page.locator("#addTbody input[name='student_name']").evaluate(
        """(input) => {
          const data = new DataTransfer();
          data.setData('text/plain', '오류학생\\t맥스고\\t\\t학생\\t고4\\t남\\n');
          input.dispatchEvent(new ClipboardEvent('paste', {
            clipboardData: data, bubbles: true, cancelable: true,
          }));
        }"""
    )

    page.get_by_text("붙여넣은 1번째 줄의 학년을 확인해주세요.").wait_for()
    assert page.locator("#addTbody input[name='student_name']").input_value() == ""
    page.close()
