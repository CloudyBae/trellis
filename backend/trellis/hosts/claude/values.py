def string_or_none(value: object) -> str | None:
    return value if isinstance(value, str) else None


def string_or_empty(value: object) -> str:
    return value if isinstance(value, str) else ""
