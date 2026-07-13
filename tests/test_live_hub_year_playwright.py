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
WINDOWS_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36"
)


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


def select_applicant(page, expected_name: str = "김민수") -> None:
    page.locator("#gun-select .combo-display").click()
    page.locator("#gun-select .combo-item[data-value='가']").click()
    page.locator("#university-select .combo-display").click()
    page.locator("#university-select .combo-item[data-value='한국대']").click()
    page.locator("#department-select .combo-display").click()
    page.locator("#department-select .combo-item[data-value='1']").click()
    page.locator("#applicantsContainer").get_by_text(expected_name).wait_for()


@pytest.mark.parametrize("page_name", ["school_app_final.html", "school_app.html"])
def test_live_and_hub_reload_schools_for_2026_and_2027(browser, base_url: str, page_name: str) -> None:
    requested_years: list[str] = []
    authorization_headers: list[str] = []
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.add_init_script(f"localStorage.setItem('jwt_token', {json.dumps(jwt_token())})")

    def handle(route) -> None:
        if "/jungsi/schools/" not in route.request.url:
            route.fulfill(status=404, content_type="application/json", body='{"success":false}')
            return
        requested_years.append(route.request.url.rsplit("/", 1)[-1])
        authorization_headers.append(route.request.headers.get("authorization", ""))
        route.fulfill(
            status=200,
            content_type="application/json",
            body='{"success":true,"list":[]}',
        )

    page.route("https://supermax.kr/jungsi/**", handle)
    page.goto(f"{base_url}/{page_name}", wait_until="domcontentloaded")
    page.wait_for_function("() => document.querySelector('#year-select .label').textContent === '2027학년도'")
    page.locator("#year-select .combo-display").click()
    page.locator("#year-select .combo-item[data-value='2026']").click()
    page.wait_for_function("() => document.querySelector('#year-select .label').textContent === '2026학년도'")
    page.wait_for_timeout(50)

    assert requested_years[:2] == ["2027", "2026"]
    assert authorization_headers == [f"Bearer {jwt_token()}", f"Bearer {jwt_token()}"]
    page.close()


@pytest.mark.parametrize(
    ("page_name", "applicant_path"),
    [
        ("school_app_final.html", "/jungsi/university-final-applicants/"),
        ("school_app.html", "/jungsi/university-applicants/"),
    ],
)
def test_live_and_hub_privacy_reauth_masks_both_years(
    browser,
    base_url: str,
    page_name: str,
    applicant_path: str,
) -> None:
    applicant_years: list[str] = []
    applicant_authorization_headers: list[str] = []
    reauthenticated_userids: list[str] = []
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.add_init_script(f"localStorage.setItem('jwt_token', {json.dumps(jwt_token())})")

    def handle(route) -> None:
        url = route.request.url
        if "/jungsi/schools/" in url:
            body = {
                "success": True,
                "list": [{
                    "U_ID": 1,
                    "gun": "가",
                    "university": "한국대",
                    "department": "체육학과",
                    "quota": 10,
                }],
            }
        elif applicant_path in url:
            applicant_years.append(url.split("?")[0].rsplit("/", 1)[-1])
            applicant_authorization_headers.append(
                route.request.headers.get("authorization", "")
            )
            body = {
                "success": True,
                "university": {"quota": 10},
                "applicants": [{
                    "name": "김민수",
                    "branch": "수원",
                    "school_name": "서라벌고등학교",
                    "suneung_score": 90,
                    "practical_score": 80,
                    "total_score": 170,
                }],
            }
        elif url.endswith("/susi/login"):
            request = json.loads(route.request.post_data or "{}")
            reauthenticated_userids.append(request.get("userid", ""))
            body = {"success": request.get("password") == "correct-password"}
            if body["success"]:
                body["token"] = "reauth-token-not-stored"
        else:
            route.fulfill(status=404, content_type="application/json", body='{"success":false}')
            return
        route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps(body, ensure_ascii=False),
        )

    page.route("https://supermax.kr/**", handle)
    page.goto(f"{base_url}/{page_name}", wait_until="domcontentloaded")
    page.wait_for_function("() => document.querySelector('#year-select .label').textContent === '2027학년도'")
    select_applicant(page)

    page.locator("#btnPrivacy").click()
    page.locator("#privacyPassword").fill("wrong-password")
    page.locator("#privacyPasswordSubmit").click()
    page.get_by_text("비밀번호가 올바르지 않습니다.").wait_for()
    assert "김민수" in page.locator("#applicantsContainer").inner_text()

    page.locator("#privacyPassword").fill("correct-password")
    page.locator("#privacyPasswordSubmit").click()
    page.get_by_text("개인정보 가리기가 활성화되었습니다.").wait_for()

    masked = page.locator("#applicantsContainer").inner_text()
    assert "김○수" in masked
    assert "○○" in masked
    assert "서X벌고등학교" in masked
    assert "김민수" not in page.locator("body").text_content()
    assert "서라벌고등학교" not in page.locator("body").text_content()
    assert page.locator("#applicantsLegend").is_hidden()
    assert page.locator("#btnPrivacy").get_attribute("aria-pressed") == "true"

    page.locator("#year-select .combo-display").click()
    page.locator("#year-select .combo-item[data-value='2026']").click()
    page.wait_for_function("() => document.querySelector('#year-select .label').textContent === '2026학년도'")
    select_applicant(page, "김○수")
    assert "김○수" in page.locator("#applicantsContainer").inner_text()
    assert applicant_years == ["2027", "2026"]
    assert applicant_authorization_headers == [
        f"Bearer {jwt_token()}",
        f"Bearer {jwt_token()}",
    ]

    page.locator("#btnPrivacy").click()
    page.locator("#privacyPassword").fill("correct-password")
    page.locator("#privacyPasswordSubmit").click()
    page.get_by_text("개인정보 원문 보기가 활성화되었습니다.").wait_for()
    assert "김민수" in page.locator("#applicantsContainer").inner_text()
    assert page.locator("#btnPrivacy").get_attribute("aria-pressed") == "false"
    assert page.evaluate("localStorage.getItem('jwt_token')") == jwt_token()
    assert reauthenticated_userids == ["owner-1", "owner-1", "owner-1"]

    message = page.locator("#privacyPasswordMessage").text_content()
    assert not any(term in message for term in ("HTTP", "401", "SQL", "stack", "CORS"))
    page.close()


def test_windows_typography_uses_clear_rendering_and_aa_text_token(browser, base_url: str) -> None:
    context = browser.new_context(
        user_agent=WINDOWS_USER_AGENT,
        viewport={"width": 1440, "height": 900},
    )
    page = context.new_page()
    page.add_init_script(f"localStorage.setItem('jwt_token', {json.dumps(jwt_token())})")

    def handle(route) -> None:
        route.fulfill(
            status=200,
            content_type="application/json",
            body='{"success":true,"list":[]}',
        )

    page.route("https://supermax.kr/jungsi/**", handle)
    page.goto(f"{base_url}/school_app_final.html", wait_until="domcontentloaded")
    values = page.evaluate(
        """() => {
          const body = getComputedStyle(document.body);
          const root = getComputedStyle(document.documentElement);
          return {
            isWindows: document.documentElement.classList.contains('os-win'),
            family: body.fontFamily,
            rendering: body.textRendering,
            text3: root.getPropertyValue('--text-3').trim(),
          };
        }"""
    )
    assert values["isWindows"] is True
    assert "Pretendard" in values["family"]
    assert values["rendering"] == "auto"
    assert values["text3"] == "#78716c"
    context.close()
