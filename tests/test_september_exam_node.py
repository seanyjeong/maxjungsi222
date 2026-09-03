from __future__ import annotations

import subprocess
from pathlib import Path

import pytest


ROOT = Path(__file__).parents[1]


def test_node_contract_suite() -> None:
    subprocess.run(
        [
            "node", "--test",
            "tests/september_exam_support.test.js",
            "tests/gacha_cohort.test.js",
            "tests/student_bulk_add.test.js",
        ],
        cwd=ROOT,
        check=True,
    )


@pytest.mark.parametrize(
    "path",
    [
        "gachaejeom.js", "grade_distribution.js", "gradecut_editor.js",
        "topmax_editor.js", "add_student.js", "utils/examProfiles.js",
        "utils/examSchedule.js", "utils/gachaCohort.js",
        "scripts/apply-september-data.js",
        "scripts/september-grade-cuts.js",
        "_vultr_backend/grade_distribution_by_exam.js",
        "_vultr_backend/student_cohort.js",
        "_vultr_backend/student_list_by_branch.js",
        "_vultr_backend/student_bulk_add.js", "_vultr_backend/jungsi.js",
    ],
)
def test_javascript_syntax(path: str) -> None:
    subprocess.run(["node", "--check", path], cwd=ROOT, check=True)
