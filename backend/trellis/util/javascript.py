import json
import math

from .json_text import js_json

JS_WHITESPACE = (
    "\t\n\x0b\x0c\r \xa0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007"
    "\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"
)
LINE_TERMINATORS = "\n\r\u2028\u2029"

WS_CLASS = (
    "\\t\\n\\x0b\\x0c\\r \\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f"
    "\\u3000\\ufeff"
)


def ascii_lower(text: str) -> str:
    return "".join(char.lower() if char.isascii() else char for char in text)


def has_content(value: object) -> bool:
    if value is None or value == "":
        return False
    if isinstance(value, (int, float)):
        return value != 0 and not (isinstance(value, float) and math.isnan(value))
    return True


def js_string(value: object) -> str:
    if isinstance(value, str):
        return value
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, float):
        if math.isnan(value):
            return "NaN"
        if math.isinf(value):
            return "Infinity" if value > 0 else "-Infinity"
        return js_json(value)
    if isinstance(value, int):
        return str(value)
    if isinstance(value, list):
        return ",".join("" if item is None else js_string(item) for item in value)
    return "[object Object]"


def js_text(value: object) -> str:
    return "" if value is None else js_string(value)


def _reject_constant(name: str) -> object:
    raise ValueError(name)


def parse_json(text: str) -> object:
    try:
        return json.loads(text, parse_constant=_reject_constant)
    except RecursionError as error:
        raise ValueError("nesting too deep") from error


def js_trim(text: str) -> str:
    return text.strip(JS_WHITESPACE)


def _utf16(text: str) -> bytes:
    return text.encode("utf-16-le", "surrogatepass")


def _from_utf16(data: bytes) -> str:
    return data.decode("utf-16-le", "surrogatepass")


def utf16_length(text: str) -> int:
    return len(_utf16(text)) // 2


def _last_space_index(data: bytes, limit: int) -> int:
    position = data.rfind(b" \x00", 0, 2 * limit + 2)
    while position != -1 and position % 2:
        position = data.rfind(b" \x00", 0, position + 1)
    return -1 if position == -1 else position // 2


def clip(value: object, limit: int) -> str:
    text = js_text(value)
    data = _utf16(text)
    if len(data) // 2 <= limit:
        return text
    cut = _last_space_index(data, limit)
    end = cut if cut > limit * 0.6 else limit
    return _from_utf16(data[: end * 2]).rstrip(JS_WHITESPACE + ",.;:") + "\u2026"
