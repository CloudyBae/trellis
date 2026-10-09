import json
import math


def _plain(value: object) -> object:
    if isinstance(value, dict):
        return {key: _plain(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_plain(item) for item in value]
    if isinstance(value, float):
        if not math.isfinite(value):
            return None
        if value.is_integer():
            return int(value)
    return value


def _escape_lone_surrogates(text: str) -> str:
    return "".join(
        f"\\u{ord(char):04x}" if 0xD800 <= ord(char) <= 0xDFFF else char
        for char in text
    )


def js_json(value: object) -> str:
    text = json.dumps(_plain(value), ensure_ascii=False, separators=(",", ":"))
    return _escape_lone_surrogates(text)
