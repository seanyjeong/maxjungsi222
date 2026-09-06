"""Expose all JavaScript regression tests to the project's pytest quality gate."""
from pathlib import Path
import subprocess


def test_javascript_regressions():
    root = Path(__file__).parents[1]
    tests = sorted(str(path.relative_to(root)) for path in (root / "tests").glob("*.test.js"))
    assert tests
    result = subprocess.run(
        ["node", "--test", *tests], cwd=root, text=True, capture_output=True, timeout=120,
    )
    assert result.returncode == 0, result.stdout + result.stderr
