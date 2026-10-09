import json
import os
import subprocess
import sys
from pathlib import Path

BACKEND_DIRECTORY = Path(__file__).resolve().parents[2]


def run_dump(working_directory: Path) -> str:
    environment = {**os.environ, "PYTHONPATH": str(BACKEND_DIRECTORY)}
    result = subprocess.run(
        [sys.executable, "-m", "trellis.cli.dump_schema"],
        cwd=working_directory,
        env=environment,
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout


def test_dump_schema_prints_the_openapi_schema_and_writes_nothing(
    tmp_path: Path,
) -> None:
    before = sorted(path.name for path in tmp_path.iterdir())
    first = run_dump(tmp_path)
    second = run_dump(tmp_path)
    schemas = json.loads(first)["components"]["schemas"]
    for name in ("Session", "HelloEvent", "SessionEvent", "RemoveEvent"):
        assert name in schemas
    assert second == first
    assert sorted(path.name for path in tmp_path.iterdir()) == before
