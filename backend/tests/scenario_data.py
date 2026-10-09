import json
from pathlib import Path

SCENARIOS_DIRECTORY = Path(__file__).parent / "scenarios"
CASES_DIRECTORY = Path(__file__).parent / "cases"


def load_scenario(subdirectory: str, name: str) -> dict:
    return json.loads(
        (SCENARIOS_DIRECTORY / subdirectory / f"{name}.json").read_text("utf-8")
    )


def load_case_table(name: str) -> dict:
    return json.loads((CASES_DIRECTORY / f"{name}.json").read_text("utf-8"))


def load_cases(name: str) -> list[dict]:
    return load_case_table(name)["cases"]


def shape_names() -> list[str]:
    return sorted(path.stem for path in (CASES_DIRECTORY / "shapes").glob("*.json"))


def case_names(scenario_type: str) -> list[str]:
    return sorted(
        path.stem for path in (SCENARIOS_DIRECTORY / scenario_type).glob("*.json")
    )
