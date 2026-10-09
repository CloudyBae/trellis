import math


def field(value: object, key: str) -> object:
    return value.get(key) if isinstance(value, dict) else None


def number(value: object) -> int | float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return value if math.isfinite(value) else None
    if isinstance(value, str):
        try:
            return int(value)
        except ValueError:
            pass
        try:
            parsed = float(value)
        except ValueError:
            return None
        return parsed if math.isfinite(parsed) else None
    return None


def first_text(*values: object) -> str:
    for value in values:
        if isinstance(value, str) and value:
            return value
    return ""
