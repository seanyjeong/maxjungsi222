from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import pytest
from playwright.sync_api import Browser, Page, Route, expect

from test_counsel_previous_results_playwright import base_url, browser, jwt_token


def test_counsel_keeps_registered_high2_and_selected_exam_scores(browser: Browser, base_url: str, tmp_path: Path) -> None:
    requests: list[dict] = []
    page: Page = browser.new_page(viewport={"width": 1440, "height": 960})
    page.add_init_script(f"localStorage.setItem('jwt_token', {json.dumps(jwt_token())})")

    def handle(route: Route) -> None:
        url = urlparse(route.request.url)
        payload: dict = {"success": True}
        if url.path == "/jungsi/students/list-by-branch":
            query = parse_qs(url.query)
            requests.append({"query": query, "authorization": route.request.headers.get("authorization")})
            students = [{"student_id": 3, "student_name": "고삼학생", "grade": "3", "scores": None}]
            if query.get("cohort") == ["registered"]:
                percentile = 91 if query.get("exam") == ["9월"] else 81
                students.extend([
                    {
                        "student_id": 2, "student_name": "고이학생", "school_name": "테스트고",
                        "grade": "2", "gender": "남",
                        "scores": {
                            "입력유형": "가채점", "국어_선택과목": "국어", "국어_백분위": percentile,
                            "수학_선택과목": "수학", "수학_백분위": 80, "영어_등급": 2,
                            "탐구1_선택과목": "통합사회", "탐구1_백분위": 85,
                            "탐구2_선택과목": "통합과학", "탐구2_백분위": 75,
                        },
                    },
                    {"student_id": 4, "student_name": "미입력학생", "grade": "2", "scores": None},
                ])
            payload["students"] = students
        elif url.path.startswith("/jungsi/filter-data/"):
            payload["data"] = []
        elif "/counseling/wishlist/" in url.path:
            payload["wishlist"] = []
        elif "/counseling/trend/" in url.path:
            payload["hasPrev"] = False
        route.fulfill(status=200, content_type="application/json", body=json.dumps(payload))

    page.route("https://supermax.kr/**", handle)
    try:
        page.goto(f"{base_url}/counsel.html", wait_until="domcontentloaded")
        page.locator("#examSelCombo .combo-display").click()
        page.locator('#examSelCombo [data-value="9월"]').click()
        expect(page.locator("#comboLabel")).to_contain_text("3명")
        page.locator("#comboDisplay").click()
        expect(page.locator("#comboList")).to_contain_text("고삼학생")
        expect(page.locator("#comboList")).to_contain_text("미입력학생")
        page.locator('#comboList [data-id="2"]').click()
        expect(page.locator("#comboLabel")).to_contain_text("2학년")
        page.locator("#toggleDetailBtn").click()
        expect(page.locator("#studentDetail")).to_contain_text("백 91")
        expect(page.locator("#studentDetail")).to_contain_text("통합사회")
        expect(page.locator("#studentDetail")).to_contain_text("통합과학")
        page.screenshot(path=str(tmp_path / "counsel-high2-september.png"), full_page=True)

        page.locator("#examSelCombo .combo-display").click()
        page.locator('#examSelCombo [data-value="6월"]').click()
        expect(page.locator("#comboLabel")).to_contain_text("고이학생")
        expect(page.locator("#studentDetail")).to_contain_text("백 81")

        assert all(item["query"]["year"] == ["2027"] for item in requests)
        assert all(item["query"].get("cohort") == ["registered"] for item in requests)
        assert all(item["authorization"] == f"Bearer {jwt_token()}" for item in requests)
        assert requests[-1]["query"]["exam"] == ["6월"]
    finally:
        page.close()


@pytest.mark.parametrize("kind", ["counsel", "calculator"])
def test_high2_uses_2027_calculation_and_counsel_save(browser: Browser, base_url: str, kind: str) -> None:
    from test_practical_pages_playwright import setup, FORMULA, STUDENT
    from test_exam_highest_playwright import pick_department

    page = browser.new_page()
    errors, saves, _ = setup(page)
    student = {**STUDENT, "grade": "2", "scores": {
        "국어_선택과목": "국어", "국어_표준점수": 125, "국어_백분위": 91,
        "수학_선택과목": "수학", "수학_표준점수": 120, "수학_백분위": 80,
        "영어_등급": 2, "한국사_등급": 3,
        "탐구1_선택과목": "통합사회", "탐구1_표준점수": 65, "탐구1_백분위": 85,
        "탐구2_선택과목": "통합과학", "탐구2_표준점수": 60, "탐구2_백분위": 75,
    }}
    queries, calculations = [], []

    def students(route: Route) -> None:
        query = parse_qs(urlparse(route.request.url).query)
        queries.append(query)
        included = [student] if query.get("cohort") == ["registered"] else []
        route.fulfill(json={"success": True, "students": included})

    def calculate(route: Route) -> None:
        body = route.request.post_data_json
        calculations.append(body)
        assert route.request.headers["authorization"] == f"Bearer {jwt_token()}"
        route.fulfill(json={"success": True, "result": {"totalScore": "512.34"}})

    page.route("**/jungsi/students/list-by-branch?*", students)
    page.route("**/jungsi/calculate", calculate)
    try:
        page.goto(f"{base_url}/{kind}.html", wait_until="domcontentloaded")
        if kind == "calculator":
            expect(page.locator("#metaStudentCount")).to_have_text("1")
            pick_department(page)
            expect(page.locator(".student-name-cell")).to_contain_text("검증학생")
            expect(page.locator(".score-suneung")).to_have_text("512.34")
        else:
            expect(page.locator("#comboLabel")).to_contain_text("1명")
            page.locator("#comboDisplay").click()
            page.locator('#comboList [data-id="synthetic"]').click()
            expect(page.locator("#comboLabel")).to_contain_text("2학년")
            page.evaluate("""formula => {
              STATE.formulaCache['43-2027'] = formula;
              document.querySelector('#drawerBody').innerHTML =
                '<div class="cand-row" data-uid="43"><span class="cand-name">검증대</span><button class="cand-add-btn" data-gun="가">담기</button></div>';
              document.querySelector('.cand-add-btn').click();
            }""", {**FORMULA, "실기": 0, "내신": 0, "수능": 100})
            expect(page.locator(".score-suneung")).to_have_text("512.34")
            page.evaluate("() => { void saveWishlistNow(); }")
            expect(page.locator(".save-indicator")).to_contain_text("저장됨")
            saved = next(item["body"] for item in saves if "/wishlist/bulk-save" in item["url"])
            assert saved["학생_ID"] == "synthetic"
            assert saved["학년도"] == "2027"
            assert saved["모형"] == queries[-1]["exam"][0]
            assert saved["wishlistItems"][0]["상담_수능점수"] == 512.34
        assert calculations
        for body in calculations:
            assert str(body["year"]) == "2027"
            assert body["basis_exam"] == queries[-1]["exam"][0]
            subjects = body["studentScores"]["subjects"]
            assert [s["subject"] for s in subjects if s["name"] == "탐구"] == ["통합사회", "통합과학"]
        assert all(q["year"] == ["2027"] and q["cohort"] == ["registered"] for q in queries)
        assert not errors
    finally:
        page.close()
