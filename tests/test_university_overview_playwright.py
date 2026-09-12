"""대학정보의 학년도 격리·실기 표시·오류 복구를 합성 API 자료로 확인한다."""
from __future__ import annotations

import json
from typing import Any
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import Browser, Page, Route, expect
from test_counsel_previous_results_playwright import base_url, browser, jwt_token


def setup(page: Page) -> dict[str, Any]:
    state: dict[str, Any] = {"fail": False, "errors": [], "writes": [], "catalog_fail": False,
                             "delay_initial": False, "delay_year": None, "pending": []}
    page.add_init_script(f"localStorage.setItem('jwt_token', {json.dumps(jwt_token())})")
    page.on("pageerror", lambda error: state["errors"].append(str(error)))

    def handle(route: Route) -> None:
        path = urlparse(route.request.url).path
        year = int(parse_qs(urlparse(route.request.url).query).get("year", [path.split("/")[-1] if path.split("/")[-1].isdigit() else 2027])[0])
        if (state["delay_initial"] and path.endswith("/2027")) or (state["delay_year"] and path.endswith('/' + str(state["delay_year"]))):
            state["pending"].append(route)
            return
        if state["catalog_fail"] and "/schools/" in path:
            route.fulfill(content_type="application/json", body='{"success":false}')
            return
        if route.request.method != "GET":
            state["writes"].append(path)
            route.abort()
            return
        rows = [{"U_ID": 105, "university": "숙명여자대학교", "department": "체육교육과", "gun": "나", "광역": "서울", "교직": "O"},
                {"U_ID": 150, "university": "순천대학교", "department": "예체능분야", "gun": "다", "광역": "전남", "교직": "X"}]
        rows[0]["department"] = f"체육교육과 {year}"
        if "/schools/" in path:
            payload = {"success": True, "list": rows}
        elif "/cutoffs/" in path:
            payload = {"success": True, "cutoffs": [{"U_ID": 105, "모집인원": "20", "수능비율": "60", "실기비율": "40", "25년총점컷": "850", "26년총점컷": "860"},
                                                      {"U_ID": 150, "모집인원": "수시이월", "수능비율": "100", "실기비율": "0"}]}
        elif "/filter-data/" in path:
            payload = {"success": True, "data": [{"U_ID": 105, "국어_raw": "40", "수학_raw": "-", "영어_raw": "30", "탐구_raw": "30", "탐구수_raw": "1"}]}
        elif path.endswith("/formula-details"):
            if state["fail"]:
                route.fulfill(status=500, content_type="application/json", body='{"message":"검증용 오류"}')
                return
            uid = int(parse_qs(urlparse(route.request.url).query)["U_ID"][0])
            formula: dict[str, Any] = {"U_ID": uid, "학년도": year, "총점": 1000, "실기": 40 if uid == 105 else 0,
                                      "실기총점": 400 if uid == 105 else 0, "english_scores": {"1": 100, "2": 98},
                                      "history_scores": {"1": 0, "5": -2}, "기타설정": {"subjectivePractical2027Reviewed": True}, "실기배점": []}
            if uid == 105:
                formula["실기배점"] = [{"종목명": event, "성별": "여", "기록": record, "배점": score}
                                   for event, record, score in [("높이뛰기", "130", "75"), ("높이뛰기", "125", "70"),
                                                                 ("높이뛰기", "F", "50"), ("체조", None, None)]]
            payload = {"success": True, "formula": formula}
        else:
            route.abort()
            return
        route.fulfill(content_type="application/json", body=json.dumps(payload))

    page.route("https://supermax.kr/**", handle)
    state["handle"] = handle
    return state


def test_partial_information_and_full_intervals_are_visible(browser: Browser, base_url: str) -> None:
    page = browser.new_page(viewport={"width": 1440, "height": 1000})
    state = setup(page)
    page.goto(base_url + "/university_overview.html", wait_until="domcontentloaded")
    page.locator('tr[data-uid="105"]').click()
    expect(page.locator("#mdScoreInfo")).to_contain_text("높이뛰기 75점")
    expect(page.locator("#mdScoreInfo")).to_contain_text("주관평가")
    expect(page.locator("#mdScoreInfo")).to_contain_text("325점")
    expect(page.locator('#mdGenderToggle button[data-gender="여"]')).to_have_attribute("aria-pressed", "true")
    expect(page.locator("#mdSilgiTbody tr")).to_have_count(1)
    expect(page.locator("#mdSilgiTbody")).not_to_contain_text("체조")
    page.locator(".practical-levels summary").click()
    expect(page.locator(".practical-levels tbody")).to_contain_text("50점")
    expect(page.locator("#mdCuts")).to_contain_text("2026학년도 총점컷")
    expect(page.locator("#mdSubjGrid")).to_contain_text("미반영")
    assert state["writes"] == state["errors"] == []
    page.close()


def test_switching_year_clears_review_and_partial_policy(browser: Browser, base_url: str) -> None:
    page = browser.new_page()
    setup(page)
    page.goto(base_url + "/university_overview.html", wait_until="domcontentloaded")
    page.locator('tr[data-uid="105"]').click()
    expect(page.locator("#mdReview")).to_be_visible()
    page.locator("#mdClose").click()
    page.locator("#yearSel .combo-display").click()
    page.locator('#yearSel [data-value="2026"]').click()
    expect(page.locator("#sumYear")).to_have_text("2026")
    page.locator('tr[data-uid="105"]').click()
    expect(page.locator("#mdSub")).to_contain_text("2026학년도")
    expect(page.locator("#mdReview")).to_be_hidden()
    expect(page.locator("#mdScoreInfo")).not_to_contain_text("325점")
    expect(page.locator("#mdSilgiTbody tr")).to_have_count(2)
    expect(page.locator("#mdSilgiTbody")).not_to_contain_text("0점")
    page.close()


def test_failed_formula_can_be_retried_and_nonpractical_is_distinct(browser: Browser, base_url: str) -> None:
    page = browser.new_page()
    state = setup(page)
    state["fail"] = True
    page.goto(base_url + "/university_overview.html", wait_until="domcontentloaded")
    page.locator('tr[data-uid="150"]').click()
    expect(page.locator("#mdScoreInfo")).to_contain_text("다시 열어")
    expect(page.locator("#mdPracticalLevels")).to_be_empty()
    page.locator("#mdClose").click()
    state["fail"] = False
    page.locator('tr[data-uid="150"]').click()
    expect(page.locator("#mdSilgiTbody")).to_have_text("실기 반영 없음")
    expect(page.locator("#mdSub")).to_contain_text("수시이월")
    expect(page.locator("#mdSub")).not_to_contain_text("수시이월명")
    page.close()


def test_catalog_failure_is_retriable_without_poisoning_cache(browser: Browser, base_url: str) -> None:
    page = browser.new_page()
    state = setup(page)
    state["catalog_fail"] = True
    page.goto(base_url + "/university_overview.html", wait_until="domcontentloaded")
    expect(page.locator("#retryCatalog")).to_be_visible()
    page.locator('.gun-btn[data-gun="나"]').click()
    expect(page.locator("#retryCatalog")).to_be_visible()
    page.locator('.gun-btn[data-gun="all"]').click()
    state["catalog_fail"] = False
    page.locator("#retryCatalog").click()
    expect(page.locator("#tbody tr[data-uid]")).to_have_count(2)
    page.locator('tr[data-uid="105"] button').focus()
    page.keyboard.press("Enter")
    expect(page.locator("#mdScoreInfo")).to_contain_text("높이뛰기 75점")
    page.keyboard.press("Escape")
    expect(page.locator('tr[data-uid="105"] button')).to_be_focused()
    page.close()


def test_late_initial_catalog_never_overwrites_selected_year(browser: Browser, base_url: str) -> None:
    page = browser.new_page()
    state = setup(page)
    state["delay_initial"] = True
    page.goto(base_url + "/university_overview.html", wait_until="domcontentloaded")
    page.locator("#yearSel .combo-display").click()
    page.locator('#yearSel [data-value="2026"]').click()
    expect(page.locator("#tbody")).to_contain_text("체육교육과 2026")
    state["delay_initial"] = False
    assert len(state["pending"]) == 3
    for route in state["pending"]:
        state["handle"](route)
    page.wait_for_function("performance.getEntriesByType('resource').filter(r => /\\/2027$/.test(r.name)).length === 3")
    page.evaluate("() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))")
    expect(page.locator("#sumYear")).to_have_text("2026")
    expect(page.locator("#tbody")).to_contain_text("체육교육과 2026")
    expect(page.locator("#tbody")).not_to_contain_text("체육교육과 2027")
    page.close()


def test_filters_during_year_loading_cannot_restore_old_rows(browser: Browser, base_url: str) -> None:
    page = browser.new_page()
    state = setup(page)
    page.goto(base_url + "/university_overview.html", wait_until="domcontentloaded")
    expect(page.locator("#tbody")).to_contain_text("체육교육과 2027")
    state["delay_year"] = 2026
    page.locator("#yearSel .combo-display").click()
    page.locator('#yearSel [data-value="2026"]').click()
    page.locator('.gun-btn[data-gun="나"]').click()
    expect(page.locator("#tbody")).to_contain_text("불러오는 중")
    expect(page.locator("#tbody tr[data-uid]")).to_have_count(0)
    state["delay_year"] = None
    assert len(state["pending"]) == 3
    for route in state["pending"]:
        state["handle"](route)
    expect(page.locator("#tbody")).to_contain_text("체육교육과 2026")
    page.close()
