import re

from ..util.javascript import (
    JS_WHITESPACE,
    LINE_TERMINATORS,
    WS_CLASS,
    clip,
    has_content,
    js_string,
    js_text,
    js_trim,
    utf16_length,
)
from ..util.json_text import js_json
from .models import Returned

DROP_BLOCKS = re.compile(
    "<(system-reminder|ide_opened_file|ide_selection|ide_diagnostics|"
    "environment_context|user_instructions|local-command-caveat)>"
    ".*?</\\1>",
    re.DOTALL,
)
BOLD = re.compile("\\*\\*([^\\n\\r\\u2028\\u2029]+?)\\*\\*")
CODE = re.compile("`([^`]+)`")
LEADING_HASHES = re.compile(f"^#+[{WS_CLASS}]*")
LEADING_BULLET = re.compile(f"^[{WS_CLASS}]*[-*\u2022][{WS_CLASS}]+")
LEADING_NUMBER = re.compile(f"^[{WS_CLASS}]*[0-9]+[.)][{WS_CLASS}]+")
SEPARATORS = re.compile("[_-]+")
LOWER_UPPER = re.compile("([a-z])([A-Z])")
RENAME = {
    "explore": "Explorer",
    "plan": "Planner",
    "general-purpose": "General agent",
    "general": "General agent",
}


def clean_user_text(value: object) -> str:
    text = js_text(value)
    if (
        "<local-command-stdout>" in text
        or "<task-notification>" in text
        or "<local-command-stderr>" in text
    ):
        return ""
    command = _command_name(text)
    if command is not None:
        arguments = _between(text, "<command-args>", "</command-args>")
        name = js_trim(command)
        prefixed = name if name.startswith("/") else "/" + name
        return js_trim(f"{prefixed} {js_trim(arguments)}")
    return js_trim(DROP_BLOCKS.sub("", text))


def _between(text: str, opening: str, closing: str) -> str:
    start = text.find(opening)
    if start == -1:
        return ""
    end = text.find(closing, start + len(opening))
    if end == -1:
        return ""
    return text[start + len(opening) : end]


def _command_name(text: str) -> str | None:
    opening = "<command-name>"
    search_from = 0
    while True:
        start = text.find(opening, search_from)
        if start == -1:
            return None
        content_start = start + len(opening)
        next_angle = text.find("<", content_start)
        if next_angle != -1 and text.startswith("</command-name>", next_angle):
            return text[content_start:next_angle]
        search_from = start + 1


def content_text(content: object) -> str:
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        pieces: list[object] = []
        for item in content:
            if isinstance(item, str):
                piece: object = item
            elif isinstance(item, dict):
                kind = item.get("type")
                if kind == "text":
                    piece = item.get("text")
                elif kind == "image":
                    piece = "[image]"
                else:
                    piece = item.get("text")
                    if piece is None:
                        piece = item.get("value")
                    if piece is None:
                        piece = ""
            else:
                piece = ""
            if has_content(piece):
                pieces.append(piece)
        return "\n".join(js_string(piece) for piece in pieces)
    if isinstance(content, dict):
        found = content.get("text")
        if found is None:
            found = content.get("value")
        return js_string(found) if found is not None else js_json(content)
    return js_string(content)


def _strip_markdown(text: str) -> str:
    text = LEADING_HASHES.sub("", text)
    text = BOLD.sub("\\1", text)
    text = CODE.sub("\\1", text)
    text = LEADING_BULLET.sub("", text)
    text = LEADING_NUMBER.sub("", text)
    return js_trim(text)


def _list_marker_end(line: str) -> int:
    if line[:1] in ("-", "*", "\u2022"):
        return 1
    digits = 0
    while digits < len(line) and line[digits] in "0123456789":
        digits += 1
    if digits and line[digits : digits + 1] in (".", ")"):
        return digits + 1
    return -1


def _is_list_item(line: str) -> bool:
    end = _list_marker_end(line)
    return end != -1 and end < len(line) and line[end] in JS_WHITESPACE


def _is_structural(line: str) -> bool:
    return line.startswith(("#", "```", "|")) or _is_list_item(line)


def _without_agent_id_lines(text: str) -> str:
    pieces: list[str] = []
    line_start = 0
    for index, char in enumerate(text):
        if char in LINE_TERMINATORS:
            line = text[line_start:index]
            pieces.append("" if line.startswith("agentId:") else line)
            pieces.append(char)
            line_start = index + 1
    tail = text[line_start:]
    pieces.append("" if tail.startswith("agentId:") else tail)
    return "".join(pieces)


def _first_sentence(text: str) -> str:
    units = 0
    for index, char in enumerate(text):
        if char in LINE_TERMINATORS:
            break
        at_end = index + 1 == len(text)
        if (
            units >= 12
            and char in ".!?"
            and (at_end or text[index + 1] in JS_WHITESPACE)
        ):
            return js_trim(text[: index + 1])
        units += 2 if ord(char) > 0xFFFF else 1
    return js_trim(text)


def summarize(value: object) -> Returned:
    full = js_trim(_without_agent_id_lines(js_text(value)))
    if not full:
        return Returned(summary="Returned without a message.", items=[])
    lines = [line for line in (js_trim(part) for part in full.split("\n")) if line]
    prose = next(
        (
            line
            for line in lines
            if not _is_structural(line) and utf16_length(_strip_markdown(line)) > 2
        ),
        lines[0],
    )
    sentence = _first_sentence(_strip_markdown(prose))
    items = [clip(_strip_markdown(line), 160) for line in lines if _is_list_item(line)]
    items = [item for item in items if item][:6]
    summary = clip(sentence, 200)
    if utf16_length(full) > utf16_length(sentence) + 4:
        return Returned(summary=summary, items=items, text=clip(full, 20000))
    return Returned(summary=summary, items=items)


def pretty_name(value: object) -> str:
    if not has_content(value):
        return "Agent"
    name = js_trim(js_string(value))
    renamed = RENAME.get(name.lower())
    if renamed is not None:
        return renamed
    spaced = SEPARATORS.sub(" ", name)
    words = js_trim(LOWER_UPPER.sub("\\1 \\2", spaced)).lower()
    head = words[:1]
    if head and ord(head) <= 0xFFFF:
        head = head.upper()
    return head + words[1:]
