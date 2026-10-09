def token_count(value: object) -> int:
    if isinstance(value, bool):
        return 0
    if isinstance(value, (int, float)):
        return max(0, int(value))
    if isinstance(value, str) and value.isascii() and value.isdigit():
        return int(value)
    return 0
