import time

import pytest

from tests.scenario_data import load_cases
from trellis.sessions import text
from trellis.sessions.models import Returned
from trellis.util import javascript, targets, timestamps


def dumped(returned: Returned) -> dict:
    return returned.model_dump(by_alias=True, exclude_unset=True)


def ids(cases: list[dict]) -> list[str]:
    return [str(index) for index in range(len(cases))]


def parametrize(name: str):
    cases = load_cases(name)
    return pytest.mark.parametrize("case", cases, ids=ids(cases))


@parametrize("clip")
def test_clip_cases(case):
    assert javascript.clip(*case["input"]) == case["output"]


@parametrize("tilde")
def test_tilde_cases(case, synthetic_home):
    assert targets.tilde(*case["input"]) == case["output"]


@parametrize("cleanUserText")
def test_clean_user_text_cases(case):
    assert text.clean_user_text(*case["input"]) == case["output"]


@parametrize("contentText")
def test_content_text_cases(case):
    assert text.content_text(*case["input"]) == case["output"]


@parametrize("targetOf")
def test_target_of_cases(case, synthetic_home):
    assert targets.target_of(*case["input"]) == case["output"]


@parametrize("summarize")
def test_summarize_cases(case):
    assert dumped(text.summarize(*case["input"])) == case["output"]


@parametrize("prettyName")
def test_pretty_name_cases(case):
    assert text.pretty_name(*case["input"]) == case["output"]


@parametrize("mentionedPaths")
def test_mentioned_paths_cases(case, synthetic_home):
    assert targets.mentioned_paths(*case["input"]) == case["output"]


@parametrize("secs")
def test_secs_cases(case):
    assert timestamps.secs(*case["input"]) == case["output"]


@pytest.mark.parametrize(
    ("case_name", "zone"),
    [("parse_timestamp_utc", "UTC"), ("parse_timestamp_new_york", "America/New_York")],
)
def test_parse_timestamp_in_each_zone(case_name, zone, use_time_zone):
    use_time_zone(zone)
    assert time.tzname[0] in ("UTC", "EST")
    for case in load_cases(case_name):
        assert timestamps.parse_timestamp_ms(*case["input"]) == case["output"], case


def test_parse_timestamp_reads_zone_less_forms_by_zone(use_time_zone):
    use_time_zone("America/New_York")
    local = timestamps.parse_timestamp_ms("2026-09-28T10:00:00")
    date_only = timestamps.parse_timestamp_ms("2026-09-28")
    assert local == 1790604000000
    assert date_only == 1790553600000


def test_parse_timestamp_reports_invalid_text_as_none():
    assert timestamps.parse_timestamp_ms("") is None
    assert timestamps.parse_timestamp_ms("not a date") is None
    assert timestamps.parse_timestamp_ms("1790000000000") is None


def test_secs_rounds_half_up():
    assert timestamps.secs(500, 0) == 1
    assert timestamps.secs(2500, 0) == 3
    assert timestamps.secs(1500, 0) == 2
    assert timestamps.secs(-500, 0) == 0


def test_clip_counts_utf16_code_units():
    text = "\U0001f600" * 5
    assert javascript.clip(text, 9) != text
    assert javascript.clip(text, 10) == text


def test_clip_leaves_a_lone_surrogate_at_the_cut_without_raising():
    clipped = javascript.clip("a" * 10 + "\U0001f600" + "b" * 4, 11)
    assert clipped == "a" * 10 + "\ud83d" + "\u2026"


def test_clip_strips_javascript_whitespace_before_the_ellipsis():
    assert javascript.clip("abc\ufeff\ufeff defgh", 5) == "abc\u2026"
    assert javascript.clip("abc\u3000\u3000 defgh", 6) == "abc\u2026"


def test_clip_finds_a_space_after_a_code_point_that_shifts_byte_alignment():
    assert javascript.clip("ab\u20ac\u0100" + "x" * 30, 3) == "ab\u20ac\u2026"


def test_mentioned_paths_word_characters_are_ascii_only():
    assert targets.mentioned_paths("src/caf\u00e9/b.ts") == []
    assert targets.mentioned_paths("src/\u0663/b.ts") == []
    assert targets.mentioned_paths("src/a/b.ts") == ["src/a/b.ts"]


def test_mentioned_paths_whitespace_matches_javascript():
    assert targets.mentioned_paths("\ufeffsrc/a/b.ts") == ["src/a/b.ts"]
    assert targets.mentioned_paths("\u00a0src/a/b.ts") == ["src/a/b.ts"]
    assert targets.mentioned_paths("\x85src/a/b.ts") == []


def test_mentioned_paths_end_of_input_is_not_before_a_trailing_newline_only():
    assert targets.mentioned_paths("see src/a/b.ts") == ["src/a/b.ts"]
    assert targets.mentioned_paths("nothing to see here /") == []


def test_summarize_line_anchors_split_on_cr_and_unicode_separators():
    assert text.summarize("agentId: abc\u2028Real sentence here ok.").summary == (
        "Real sentence here ok."
    )
    assert text.summarize("agentId: abc\rReal sentence here ok.").summary == (
        "Real sentence here ok."
    )
    assert text.summarize("agentId: abc\r\nReal sentence here ok.").summary == (
        "Real sentence here ok."
    )
    assert text.summarize("x agentId: inside").summary == "x agentId: inside"


def test_summarize_list_markers_use_ascii_digits_only():
    arabic = text.summarize("\u0663. arabic digit line\nReal prose line here now.")
    assert arabic.items == []
    ascii_digits = text.summarize("Lead sentence here ok.\n3. real item")
    assert ascii_digits.items == ["real item"]


def test_summarize_sentence_length_counts_utf16_code_units():
    emoji = "\U0001f600" * 6
    assert text.summarize(f"{emoji}. And more words follow.").summary == f"{emoji}."
    assert text.summarize("\U0001f600. And more words follow.").summary == (
        "\U0001f600. And more words follow."
    )


def test_summarize_keeps_unmatched_markdown_markers():
    assert text.summarize("**unclosed bold text here").summary == (
        "**unclosed bold text here"
    )
    assert text.summarize("`open tick text here").summary == "`open tick text here"
    assert text.summarize("**a\u2028b** split text follows.").summary == (
        "**a\u2028b** split text follows."
    )


def test_summarize_adds_text_only_when_the_full_text_is_longer():
    assert text.summarize("Short one.").model_fields_set == {"summary", "items"}
    longer = text.summarize("Short one.\nAnd the rest of it.")
    assert longer.text == "Short one.\nAnd the rest of it."


def test_clean_user_text_keeps_unclosed_and_mismatched_blocks():
    unclosed = "<system-reminder>never closed and then text"
    assert text.clean_user_text(unclosed) == unclosed
    mismatched = "<system-reminder>a</ide_selection>text"
    assert text.clean_user_text(mismatched) == mismatched
    assert text.clean_user_text("<system-reminder>x</system-reminder>kept") == "kept"


def test_clean_user_text_command_name_must_close_before_another_angle_bracket():
    assert text.clean_user_text("<command-name>/a<b</command-name>") == (
        "<command-name>/a<b</command-name>"
    )
    assert (
        text.clean_user_text(
            "<command-name>/a<b</command-name><command-name>/second</command-name>"
        )
        == "/second"
    )


def test_target_of_orders_integer_like_keys_first_like_javascript():
    assert targets.target_of({"b": "two", "1": "one"}) == "one"


def test_pretty_name_leaves_non_bmp_first_letters_alone():
    assert text.pretty_name("\U00010428name") == "\U00010428name"
    assert text.pretty_name("abc") == "Abc"


def test_js_trim_matches_javascript_whitespace():
    assert javascript.js_trim("\ufeff\u00a0x\u2029") == "x"
    assert javascript.js_trim("\x85x") == "\x85x"
    assert javascript.js_trim("\x1cx") == "\x1cx"


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (None, "Agent"),
        ("", "Agent"),
        (0, "Agent"),
        (0.0, "Agent"),
        (False, "Agent"),
        (float("nan"), "Agent"),
        ([], ""),
        ({}, "[object object]"),
        (True, "True"),
        (7, "7"),
    ],
)
def test_pretty_name_truthiness_for_empty_and_numeric_values(value, expected):
    assert text.pretty_name(value) == expected


@pytest.mark.parametrize(
    ("file_value", "expected"),
    [
        ("", "pattern"),
        (0, "pattern"),
        (False, "pattern"),
        (float("nan"), "pattern"),
        ([], "pattern  "),
        ({}, "pattern  [object Object]"),
        (3, "pattern  3"),
    ],
)
def test_target_of_pattern_shows_the_file_only_when_it_has_content(
    file_value, expected
):
    assert (
        targets.target_of({"pattern": "pattern", "file_path": file_value}) == expected
    )


def test_target_of_uses_the_first_file_key_that_is_not_null():
    properties = {"file_path": None, "filePath": "", "path": "/other"}
    assert targets.target_of(properties) == ""
    assert targets.target_of({"file_path": None, "path": "other"}) == "other"
    assert targets.target_of({"cmd": "echo hi", "command": None}) == "echo hi"
    assert targets.target_of({"cmd": "echo hi", "command": ""}) == ""


def test_content_text_drops_pieces_without_content_but_keeps_empty_containers():
    items = [
        {"type": "other", "text": []},
        {"type": "other", "text": float("nan")},
        {"type": "other", "text": 0},
        {"type": "other"},
        {"type": "other", "text": None, "value": "from value"},
        {"type": "other", "text": "", "value": "ignored"},
        {"type": "text", "text": "kept"},
    ]
    assert text.content_text(items) == "\nfrom value\nkept"


def test_content_text_dict_prefers_text_then_value_when_not_null():
    assert text.content_text({"text": None, "value": 5}) == "5"
    assert text.content_text({"text": "", "value": 5}) == ""
    assert text.content_text({"text": None, "value": None}) == (
        '{"text":null,"value":null}'
    )
