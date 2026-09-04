from __future__ import annotations

import subprocess
from pathlib import Path


ROOT = Path(__file__).parents[1]


def test_counsel_previous_results_node_contract() -> None:
    completed = subprocess.run(
        ["node", "--test", "tests/counsel_previous_results.test.js"],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )
    assert completed.returncode == 0, completed.stdout + completed.stderr
