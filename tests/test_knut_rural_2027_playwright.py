from __future__ import annotations

import json
import subprocess
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import expect

from test_counsel_previous_results_playwright import ROOT, base_url, browser, jwt_token


def test_rural_catalog_and_details(browser, base_url: str) -> None:
    script = """
    const {buildPlan} = require('./scripts/knut-rural-plan');
    const snapshot = require('./tests/fixtures/knut-rural-2027/source-rows.json');
    console.log(JSON.stringify(buildPlan(snapshot, [205,206])));
    """
    plan = json.loads(subprocess.check_output(["node", "-e", script], cwd=ROOT))
    page = browser.new_page(viewport={"width": 1600, "height": 1000})
    page.add_init_script(f"localStorage.setItem('jwt_token', {json.dumps(jwt_token())})")
    errors: list[str] = []
    page.on("pageerror", lambda error: errors.append(str(error)))

    def handle(route) -> None:
        url = urlparse(route.request.url)
        if url.hostname == "127.0.0.1":
            route.continue_()
            return
        payload: dict = {"success": True}
        if url.path == "/jungsi/schools/2027":
            payload["list"] = [
                dict(unit["base"], university=unit["base"]["대학명"],
                     department=unit["base"]["학과명"], gun="가") for unit in plan
            ]
        elif url.path == "/jungsi/cutoffs/2027":
            payload["cutoffs"] = [
                dict(unit["base"], 모집인원=None, 수능비율=unit["ratios"]["수능"],
                     내신비율=unit["ratios"]["내신"], 실기비율=unit["ratios"]["실기"])
                for unit in plan
            ]
        elif url.path == "/jungsi/filter-data/2027":
            payload["data"] = [unit["base"] for unit in plan]
        elif url.path == "/jungsi/formula-details":
            uid = int(parse_qs(url.query)["U_ID"][0])
            unit = next(item for item in plan if item["base"]["U_ID"] == uid)
            payload["formula"] = dict(unit["base"], **unit["ratios"], 실기배점=unit["practical"])
        else:
            route.abort()
            return
        route.fulfill(json=payload)

    page.route("**/*", handle)
    try:
        page.goto(f"{base_url}/university_overview.html")
        expect(page.locator("#tbody tr[data-uid]")).to_have_count(2)
        for uid, naeshin, practical in [(205, "60%", "40%"), (206, "30%", "70%")]:
            row = page.locator(f'#tbody tr[data-uid="{uid}"]')
            expect(row).to_contain_text("농어촌")
            expect(row).to_contain_text("수시 이월 시 모집")
            expect(row.locator("td").nth(4)).to_have_text("-")
            expect(row.locator("td").nth(5)).to_have_text("0%")
            expect(row.locator("td").nth(6)).to_have_text(naeshin)
            expect(row.locator("td").nth(7)).to_have_text(practical)
            row.click()
            expect(page.locator("#mdChips")).to_contain_text(f"내신 {naeshin}")
            expect(page.locator("#mdChips")).not_to_contain_text("수능")
            expect(page.locator("#mdSubjGrid")).not_to_contain_text("필수응시")
            expect(page.locator("#mdSilgiTbody tr")).to_have_count(3)
            expect(page.locator("#mdSilgiTbody")).to_contain_text("20m왕복달리기")
            page.locator('#mdGenderToggle [data-gender="여"]').click()
            expect(page.locator("#mdSilgiTbody tr")).to_have_count(3)
            page.locator("#mdClose").click()
        page.screenshot(path=str(ROOT / "node_modules/knut-rural-preview.png"), full_page=True)
        assert not errors
    finally:
        page.close()
