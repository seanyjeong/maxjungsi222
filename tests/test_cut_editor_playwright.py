from __future__ import annotations

import base64
import json

import pytest
from playwright.sync_api import expect

from tests.test_counsel_previous_results_playwright import base_url, browser


def setup_editor(browser, base_url: str, *, admin: bool = False, skip_save: bool = False):
    page = browser.new_page(viewport={"width": 1440, "height": 960})
    token_body = base64.urlsafe_b64encode(json.dumps({
        "userid": "admin" if admin else "owner-test", "branch": "테스트교육원",
    }).encode()).decode().rstrip("=")
    token = f"header.{token_body}.signature"
    page.add_init_script(f"localStorage.setItem('jwt_token', {json.dumps(token)})")
    stored = {"U_ID": 11, "대학명": "검증대학교", "학과명": "체육학과", "군": "가",
              "지점_수능컷": 280, "지점_총점컷": 850,
              "맥스_수능컷": 290, "맥스_총점컷": 860,
              "25년총점컷": 830, "26년총점컷": 840}
    requests = []

    def handle(route):
        assert route.request.headers.get("authorization") == f"Bearer {token}"
        if route.request.method == "POST":
            body = route.request.post_data_json
            requests.append(body)
            # 운영 저장기는 같은 범위의 모든 점수 필드를 요구한다.
            fields = (["맥스_수능컷", "맥스_총점컷", "25년총점컷", "26년총점컷"]
                      if admin else ["지점_수능컷", "지점_총점컷"])
            for update in body["updates"]:
                if not skip_save and all(field in update for field in fields):
                    stored.update({field: update[field] for field in fields})
            route.fulfill(json={"success": True})
        else:
            route.fulfill(json={"success": True, "cutoffs": [stored]})

    page.route("**/jungsi/cutoffs/**", handle)
    page.goto(f"{base_url}/cut_editor.html", wait_until="domcontentloaded")
    page.locator("#tbody tr[data-uid='11']").wait_for()
    return page, stored, requests


def test_single_branch_cut_survives_save_and_reload(browser, base_url: str):
    page, stored, requests = setup_editor(browser, base_url)
    field = page.locator('[data-field="지점_총점컷"]')
    field.fill("865")
    page.locator("#saveBtn").click()
    expect(page.locator("#dirtyCount")).to_be_hidden()
    expect(page.locator("#saveBtn")).to_be_disabled()
    page.reload()
    expect(field).to_have_value("865")
    assert stored["지점_수능컷"] == 280
    assert requests[0]["updates"] == [{"U_ID": 11, "지점_수능컷": 280, "지점_총점컷": 865}]
    page.close()


def test_false_success_keeps_draft_and_offers_retry(browser, base_url: str):
    page, stored, requests = setup_editor(browser, base_url, skip_save=True)
    page.locator('[data-field="지점_총점컷"]').fill("865")
    page.locator("#saveBtn").click()
    expect(page.locator("#saveBtn")).to_be_enabled()
    expect(page.locator("#dirtyCount")).to_have_text("1")
    expect(page.locator('[data-field="지점_총점컷"]')).to_have_value("865")
    expect(page.locator(".toast.error")).to_be_visible()
    assert stored["지점_총점컷"] == 850
    page.once("dialog", lambda dialog: dialog.accept())
    page.close()


def test_filter_keeps_unsaved_cut_and_second_save_count(browser, base_url: str):
    page, stored, requests = setup_editor(browser, base_url)
    page.locator('[data-field="지점_총점컷"]').fill("865")
    page.locator('.gun-btn[data-gun="나"]').click()
    page.locator('.gun-btn[data-gun="all"]').click()
    expect(page.locator('[data-field="지점_총점컷"]')).to_have_value("865")
    expect(page.locator("tr.dirty")).to_have_count(1)
    page.locator("#saveBtn").click()
    expect(page.locator("#dirtyCount")).to_be_hidden()
    expect(page.locator("#saveBtn")).to_be_disabled()
    page.locator('[data-field="지점_수능컷"]').fill("285")
    expect(page.locator("#dirtyCount")).to_have_text("1")
    page.locator("#saveBtn").click()
    expect(page.locator("#dirtyCount")).to_be_hidden()
    expect(page.locator("#saveBtn")).to_be_disabled()
    page.reload()
    expect(page.locator('[data-field="지점_수능컷"]')).to_have_value("285")
    expect(page.locator('[data-field="지점_총점컷"]')).to_have_value("865")
    page.close()


def test_admin_single_cut_preserves_other_max_and_history(browser, base_url: str):
    page, stored, requests = setup_editor(browser, base_url, admin=True)
    page.locator('[data-field="맥스_총점컷"]').fill("875.25")
    page.locator("#saveBtn").click()
    expect(page.locator("#dirtyCount")).to_be_hidden()
    expect(page.locator("#saveBtn")).to_be_disabled()
    page.reload()
    expect(page.locator('[data-field="맥스_총점컷"]')).to_have_value("875.25")
    assert requests[0]["updates"] == [{"U_ID": 11, "맥스_수능컷": 290,
                                      "맥스_총점컷": 875.25, "25년총점컷": 830, "26년총점컷": 840}]
    assert stored["지점_총점컷"] == 850
    page.close()


def test_new_input_during_save_remains_unsaved(browser, base_url: str):
    page, stored, requests = setup_editor(browser, base_url)
    page.evaluate("""() => {
      const api = window.api;
      window.api = async (path, options) => {
        if (options?.method === 'POST') await new Promise(resolve => { window.finishCutSave = resolve; });
        return api(path, options);
      };
    }""")
    field = page.locator('[data-field="지점_총점컷"]')
    field.fill("865")
    page.locator("#saveBtn").click()
    page.wait_for_function("typeof window.finishCutSave === 'function'")
    field.fill("870")
    page.evaluate("window.finishCutSave()")
    expect(page.locator("#saveBtn")).to_be_enabled()
    expect(field).to_have_value("870")
    expect(page.locator("#dirtyCount")).to_have_text("1")
    assert stored["지점_총점컷"] == 865 and len(requests) == 1
    page.close()


@pytest.mark.parametrize("failure", ["network", "server"])
def test_save_errors_use_plain_korean_and_retain_input(browser, base_url, failure):
    page, stored, requests = setup_editor(browser, base_url)

    def fail(route):
        if failure == "network":
            route.abort("failed")
        else:
            route.fulfill(status=400, json={"message": "400 SQL stack trace"})

    page.route("**/jungsi/cutoffs/set", fail)
    page.locator('[data-field="지점_총점컷"]').fill("865")
    page.locator("#saveBtn").click()
    error = page.locator(".toast.error")
    expect(error).to_be_visible()
    assert not any(term in error.inner_text() for term in ["400", "401", "CORS", "SQL", "stack", "fetch"])
    expect(page.locator('[data-field="지점_총점컷"]')).to_have_value("865")
    expect(page.locator("#saveBtn")).to_be_enabled()
    page.close()
