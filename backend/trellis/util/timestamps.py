import math
import time
from datetime import datetime, timezone


def secs(ms: float, t0: float) -> int:
    return max(0, math.floor((ms - t0) / 1000 + 0.5))


def _has_expected_shape(text: str) -> bool:
    if not text.isascii() or len(text) < 10 or text[4] != "-" or text[7] != "-":
        return False
    if len(text) == 10:
        return True
    if text[10] != "T" or len(text) < 14 or text[13] != ":":
        return False
    if "," in text:
        return False
    whole, dot, fraction = text.partition(".")
    if dot and (len(whole) != 19 or not fraction[:1].isdigit()):
        return False
    if text.endswith("Z") or "+" not in text[11:] and "-" not in text[11:]:
        return True
    return text[-6] in "+-" and text[-3] == ":"


def parse_timestamp_ms(text: str) -> float | None:
    if not _has_expected_shape(text):
        return None
    try:
        moment = datetime.fromisoformat(text)
        if len(text) == 10 or moment.tzinfo is not None:
            if len(text) == 10:
                moment = moment.replace(tzinfo=timezone.utc)
            seconds = int(moment.replace(microsecond=0).timestamp())
        else:
            seconds = int(time.mktime(moment.replace(microsecond=0).timetuple()))
    except (ValueError, OverflowError):
        return None
    return float(seconds * 1000 + moment.microsecond // 1000)


def timestamp_ms(value: object) -> float:
    if not isinstance(value, str):
        return 0.0
    return parse_timestamp_ms(value) or 0.0
