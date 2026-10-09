import json
import os

import pytest

from tests.scenario_data import case_names
from tests.support.otlp_replay import (
    PAYLOAD_DIRECTORY,
    payload_session,
    play,
)

CASES = case_names("otlp")


@pytest.mark.parametrize("case", CASES)
def test_committed_payload_equals_current_output(case: str):
    scenario, outputs = play(case)
    payload = [
        {
            "returned": step["returned"],
            "logged": step["logged"],
            "sessions": {
                session_id: payload_session(scenario, session)
                for session_id, session in step["sessions"].items()
            },
        }
        for step in outputs
    ]
    payload_path = PAYLOAD_DIRECTORY / f"{case}.json"
    if os.environ.get("TRELLIS_WRITE_PAYLOADS"):
        PAYLOAD_DIRECTORY.mkdir(parents=True, exist_ok=True)
        payload_path.write_text(json.dumps(payload, indent=2) + "\n", "utf-8")
    assert json.loads(payload_path.read_text("utf-8")) == payload
