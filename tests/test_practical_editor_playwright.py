from __future__ import annotations

import base64
import json
from urllib.parse import urlparse

import pytest
from playwright.sync_api import expect

from tests.test_counsel_previous_results_playwright import base_url, browser


def setup_editor(browser, base_url, *, admin=True, failure=None):
    page = browser.new_page(viewport={"width": 1440, "height": 1000})
    body = base64.urlsafe_b64encode(json.dumps({
        "userid": "admin" if admin else "owner-1", "branch": "검증교육원",
    }).encode()).decode().rstrip("=")
    token = f"header.{body}.signature"
    page.add_init_script(f"localStorage.setItem('jwt_token', {json.dumps(token)})")
    rows = [{"id": 1, "U_ID": 3, "학년도": "2027", "종목명": "제자리멀리뛰기",
             "성별": "남", "기록": "270", "배점": "100"},
            {"id": 2, "U_ID": 3, "학년도": "2027", "종목명": "제자리멀리뛰기",
             "성별": "여", "기록": "230", "배점": "100"}]
    writes = []

    def handle(route):
        request = route.request
        assert request.headers.get("authorization") == f"Bearer {token}"
        path = urlparse(request.url).path
        if "/schools/" in path:
            route.fulfill(json={"success": True, "schools": [
                {"U_ID": 3, "대학명": "검증대학교", "학과명": "체육학과"},
                {"U_ID": 4, "대학명": "다른대학교", "학과명": "체육학과"}]})
        elif request.method == "POST":
            writes.append((path, request.post_data_json))
            if failure == "network":
                route.abort("failed")
                return
            if failure == "server":
                route.fulfill(status=400, json={"success": False, "message": "400 SQL stack trace"})
                return
            assert path == "/jungsi/admin/practical-table/bulk-update"
            payload = request.post_data_json
            assert payload["U_ID"] == "3" and payload["year"] == "2027"
            assert payload["additions"] == [] and payload["deletions"] == []
            if failure != "skipped":
                for change in payload["updates"]:
                    next(row for row in rows if row["id"] == change["id"]).update(change)
            route.fulfill(json={"success": True, "totalAffected": len(payload["updates"])})
        else:
            route.fulfill(json={"success": True, "scores": rows})

    page.route("**/jungsi/**", handle)
    page.goto(f"{base_url}/silgi-editor.html", wait_until="domcontentloaded")
    select_school(page, "검증대학교")
    page.locator("#loadButton").click()
    expect(page.locator('.score-section')).to_have_count(1)
    return page, rows, writes


def select_school(page, name):
    page.locator("#schoolSearch .combo-display").click()
    page.locator("#schoolSearch .combo-item").filter(has_text=name).click()


def test_existing_event_records_and_scores_save_without_insert(browser, base_url):
    page, rows, writes = setup_editor(browser, base_url)
    page.get_by_label("종목명 수정").fill("제자리멀리뛰기(수정)")
    page.locator('tr[data-id="1"] [data-field="기록"]').fill("275.5")
    page.locator('tr[data-id="1"] [data-field="배점"]').fill("0")
    page.get_by_role("button", name="수정사항 저장").click()
    expect(page.locator("#practicalEditStatus")).to_have_text("변경사항 없음")
    page.locator("#loadButton").click()
    expect(page.get_by_label("종목명 수정")).to_have_value("제자리멀리뛰기(수정)")
    expect(page.locator('tr[data-id="1"] [data-field="기록"]')).to_have_value("275.5")
    expect(page.locator('tr[data-id="1"] [data-field="배점"]')).to_have_value("0")
    assert len(rows) == 2 and len(writes) == 1
    assert rows[1]["기록"] == "230" and rows[1]["종목명"] == "제자리멀리뛰기(수정)"
    page.close()


@pytest.mark.parametrize("failure", ["network", "server", "skipped"])
def test_save_failure_preserves_input_and_plain_korean_retry(browser, base_url, failure):
    page, rows, writes = setup_editor(browser, base_url, failure=failure)
    field = page.locator('tr[data-id="1"] [data-field="기록"]')
    field.fill("275")
    page.get_by_role("button", name="수정사항 저장").click()
    error = page.locator(".toast.error")
    expect(error).to_be_visible()
    assert not any(term in error.inner_text() for term in ["400", "401", "CORS", "SQL", "stack", "fetch"])
    expect(field).to_have_value("275")
    expect(page.get_by_role("button", name="수정사항 저장")).to_be_enabled()
    assert rows[0]["기록"] == "270"
    page.close()


def test_school_change_does_not_apply_old_table_to_new_school(browser, base_url):
    page, rows, writes = setup_editor(browser, base_url)
    page.locator('tr[data-id="1"] [data-field="기록"]').fill("275")
    page.once("dialog", lambda dialog: dialog.dismiss())
    select_school(page, "다른대학교")
    expect(page.locator("#schoolSearch .combo-display")).to_contain_text("검증대학교")
    expect(page.locator('tr[data-id="1"] [data-field="기록"]')).to_have_value("275")
    assert writes == []
    page.once("dialog", lambda dialog: dialog.accept())
    select_school(page, "다른대학교")
    expect(page.locator(".score-section")).to_have_count(0)
    expect(page.get_by_role("button", name="수정사항 저장")).to_be_disabled()
    page.close()


def test_non_admin_cannot_edit_shared_table(browser, base_url):
    page, rows, writes = setup_editor(browser, base_url, admin=False)
    expect(page.get_by_label("종목명 수정")).to_have_count(0)
    expect(page.locator("#practicalEditStatus")).to_contain_text("본원 관리자")
    assert writes == []
    page.close()


def test_mobile_edit_controls_fit_and_remain_usable(browser, base_url):
    page, rows, writes = setup_editor(browser, base_url)
    page.set_viewport_size({"width": 390, "height": 844})
    page.wait_for_function("document.documentElement.scrollWidth <= innerWidth")
    field = page.locator('tr[data-id="1"] [data-field="기록"]')
    field.fill("275")
    page.get_by_role("button", name="수정사항 저장").click()
    expect(page.locator("#practicalEditStatus")).to_have_text("변경사항 없음")
    assert rows[0]["기록"] == "275"
    page.close()
