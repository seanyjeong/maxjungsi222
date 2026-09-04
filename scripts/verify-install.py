#!/usr/bin/env python3
"""Verify the September score conversion release bundle without mutation."""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path


REQUIRED_FILES = (
    "_vultr_backend/grade_distribution_by_exam.js",
    "_vultr_backend/student_cohort.js",
    "_vultr_backend/student_list_by_branch.js",
    "scripts/apply-september-data.js",
    "scripts/etoos-september-grade-cuts.json",
    "scripts/migrate-high2-september-scores.js",
    "scripts/september-grade-cuts.js",
    "utils/examProfiles.js",
    "utils/gachaCohort.js",
    "utils/examSchedule.js",
)


def build_report(root: Path) -> dict[str, object]:
    missing_files = [item for item in REQUIRED_FILES if not (root / item).is_file()]
    command = subprocess.run(
        ["node", "scripts/september-grade-cuts.js"],
        cwd=root,
        capture_output=True,
        text=True,
        check=False,
    )
    counts = re.search(r"gradeCuts=(\d+), topmax=(\d+)", command.stdout)
    data_valid = (
        command.returncode == 0
        and counts is not None
        and int(counts.group(1)) > 0
        and int(counts.group(2)) == 30
    )
    passed = not missing_files and data_valid
    return {
        "summary": {"passed": passed, "failed": 0 if passed else 1},
        "missing_files": missing_files,
        "data_valid": data_valid,
        "validator_output": command.stdout.strip(),
        "data_modified": False,
    }


def main() -> int:
    root = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path.cwd()
    report = build_report(root)
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    return 0 if report["summary"]["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
