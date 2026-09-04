from __future__ import annotations

import base64
import json
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

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
        json.dumps({"userid": "owner-1", "branch": "일산", "role": "owner"}).encode()
    ).decode().rstrip("=")
    return f"header.{payload}.signature"


def inject_school_card(page, uid: str, university: str) -> None:
    page.evaluate(
        """
        ([uid, university]) => {
          const shell = document.createElement('div');
          shell.className = 'uni-card-shell';
          shell.dataset.uid = uid;
          shell.innerHTML = `
            <article class="uni-card">
              <div class="uni-name">${university}</div>
              <div class="uni-dept">체육교육과</div>
              <div class="uni-actions">
                <button class="mini-btn" onclick="openSilgiModal('${uid}')">실기 배점표</button>
                <button class="mini-btn" onclick="openCrossGunModal('${uid}')">타군 인기</button>
              </div>
            </article>`;
          document.querySelector('#col-ga').appendChild(shell);
        }
        """,
        [uid, university],
    )


def result_payload() -> dict:
    base = {
        "branch": "일산",
        "gender": "남",
        "scores": {
            "korean": {"standard": 132, "percentile": 96, "grade": 1},
            "math": {"standard": 128, "percentile": 91, "grade": 2},
            "english": {"grade": 2},
            "history": {"grade": 3},
            "inquiry1": {"standard": 65, "percentile": 93, "grade": 2},
            "inquiry2": {"standard": 62, "percentile": 88, "grade": 3},
            "suneung": 510,
            "naeshin": 0,
            "practical": 330,
            "total": 840,
        },
        "practicalRecords": {"제자리멀리뛰기": "280", "메디신볼던지기": "12"},
        "practicalDetail": {
            "events": [
                {"event": "제자리멀리뛰기", "record": "280", "score": 95, "deduction_level": 1},
                {"event": "메디신볼던지기", "record": "12", "score": 90, "deduction_level": 2},
            ]
        },
    }
    return {
        "success": True,
        "applicants": [
            {**base, "name": "최종합학생", "result": {"final": "최종합"}},
            {**base, "name": "최초합학생", "scores": {**base["scores"], "total": 850}, "result": {"first": "최초합"}},
            {**base, "name": "일단계학생", "result": {"stage1": "합격"}},
            {**base, "name": "예비학생", "result": {"first": "예비 3번"}},
            {**base, "name": "불합격학생", "result": {"final": "불합격"}},
        ],
    }


def test_previous_results_modal_shows_only_accepted_students(browser, base_url: str) -> None:
    requests: list[dict[str, object]] = []
    page = browser.new_page(viewport={"width": 1440, "height": 960})
    page.add_init_script(f"localStorage.setItem('jwt_token', {json.dumps(jwt_token())})")

    def handle(route) -> None:
        url = route.request.url
        if "/jungsi/analysis/max-live-results" in url:
            query = parse_qs(urlparse(url).query)
            requests.append({"query": query, "authorization": route.request.headers.get("authorization")})
            route.fulfill(status=200, content_type="application/json", body=json.dumps(result_payload()))
        elif "/jungsi/students/list-by-branch" in url:
            route.fulfill(status=200, content_type="application/json", body='{"success":true,"students":[]}')
        elif "/jungsi/filter-data/" in url:
            route.fulfill(status=200, content_type="application/json", body='{"success":true,"data":[]}')
        else:
            route.fulfill(status=200, content_type="application/json", body='{"success":true}')

    page.route("https://supermax.kr/**", handle)
    page.goto(f"{base_url}/counsel.html", wait_until="domcontentloaded")
    page.wait_for_function("() => Boolean(window.CounselPreviousResults)")
    inject_school_card(page, "119", "한국대학교")

    trigger = page.get_by_role("button", name="전년도 결과")
    trigger.wait_for()
    actions = page.locator(".uni-card-shell[data-uid='119'] .uni-actions .mini-btn")
    assert actions.all_text_contents() == ["실기 배점표", "전년도 결과", "타군 인기"]

    trigger.click()
    modal = page.locator("#modalPreviousResults")
    page.locator("#modalPreviousResults.open").wait_for()
    assert modal.get_attribute("aria-hidden") == "false"
    assert modal.get_by_role("dialog").get_attribute("aria-labelledby") == "previousResultsModalTitle"
    assert "2026학년도 합격자" in page.locator("#previousResultsModalTitle").inner_text()
    assert modal.get_by_text("합격자 2명").is_visible()
    assert modal.get_by_text("맥스 전체 교육원 합격자").is_visible()
    assert modal.get_by_text("최종합학생").is_visible()
    assert modal.get_by_text("최초합학생").is_visible()
    assert modal.get_by_text("일단계학생").count() == 0
    assert modal.get_by_text("예비학생").count() == 0
    assert modal.get_by_text("불합격학생").count() == 0
    assert "수능 환산" in modal.inner_text()
    assert "제자리멀리뛰기" in modal.inner_text()
    assert "기록 280 · 환산 95점 · 1감" in modal.inner_text()
    expanded = modal.locator(".previous-results-row[open]")
    subject_cells = expanded.locator(".previous-results-subject")
    assert subject_cells.locator(".label").all_text_contents() == [
        "국어", "수학", "영어", "탐구 1", "탐구 2", "한국사",
    ]
    subject_positions = subject_cells.evaluate_all(
        "elements => elements.map(element => Math.round(element.getBoundingClientRect().top))"
    )
    assert len(set(subject_positions)) == 1
    academic_box = expanded.locator(".previous-results-academic").bounding_box()
    practical_box = expanded.locator(".previous-results-practical").bounding_box()
    assert academic_box and practical_box
    assert practical_box["y"] >= academic_box["y"] + academic_box["height"]

    assert requests == [{
        "query": {
            "U_ID": ["119"],
            "year": ["2026"],
            "includeApplicants": ["1"],
            "includeApplicantNames": ["1"],
            "includeAllBranches": ["1"],
        },
        "authorization": f"Bearer {jwt_token()}",
    }]

    page.set_viewport_size({"width": 390, "height": 844})
    dimensions = modal.locator(".modal-shell").evaluate(
        "element => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth })"
    )
    assert dimensions["scrollWidth"] <= dimensions["clientWidth"]

    page.keyboard.press("Escape")
    assert modal.get_attribute("aria-hidden") == "true"
    assert trigger.evaluate("element => document.activeElement === element")
    page.close()


def test_previous_results_modal_masks_technical_failures(browser, base_url: str) -> None:
    page = browser.new_page(viewport={"width": 1280, "height": 800})
    page.add_init_script(f"localStorage.setItem('jwt_token', {json.dumps(jwt_token())})")

    def handle(route) -> None:
        if "/jungsi/analysis/max-live-results" in route.request.url:
            route.fulfill(
                status=500,
                content_type="application/json",
                body='{"success":false,"message":"HTTP 500 CORS stack Error"}',
            )
        elif "/jungsi/students/list-by-branch" in route.request.url:
            route.fulfill(status=200, content_type="application/json", body='{"success":true,"students":[]}')
        elif "/jungsi/filter-data/" in route.request.url:
            route.fulfill(status=200, content_type="application/json", body='{"success":true,"data":[]}')
        else:
            route.fulfill(status=200, content_type="application/json", body='{"success":true}')

    page.route("https://supermax.kr/**", handle)
    page.goto(f"{base_url}/counsel.html", wait_until="domcontentloaded")
    page.wait_for_function("() => Boolean(window.CounselPreviousResults)")
    inject_school_card(page, "120", "오류대학교")
    page.get_by_role("button", name="전년도 결과").click()

    page.get_by_text("전년도 결과를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.").wait_for()
    modal_text = page.locator("#previousResultsModalBody").inner_text()
    assert "전년도 결과를 불러오지 못했습니다" in modal_text
    assert all(term not in modal_text for term in ["HTTP", "500", "CORS", "stack", "Error"])
    page.close()
