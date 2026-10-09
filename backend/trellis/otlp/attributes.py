from ..sessions.models import Usage
from ..sessions.text import content_text
from ..util.javascript import ascii_lower, js_string, js_text
from ..util.tokens import token_count
from .bodies import parse_otlp_body

SESSION_KEY_ATTRIBUTES = (
    "gen_ai.conversation.id",
    "session.id",
    "conversation.id",
    "thread.id",
)


def is_blank(value: object) -> bool:
    return value is None or value == "" or value == 0


def attr_text(attributes: dict[str, object], name: str) -> str:
    value = attributes.get(name)
    return "" if is_blank(value) else js_text(value)


def model_of(attributes: dict[str, object]) -> str:
    return (
        attr_text(attributes, "gen_ai.response.model")
        or attr_text(attributes, "gen_ai.request.model")
        or attr_text(attributes, "model")
    )


def usage_of(attributes: dict[str, object]) -> Usage | None:
    input_tokens = token_count(attributes.get("gen_ai.usage.input_tokens"))
    output_tokens = token_count(attributes.get("gen_ai.usage.output_tokens"))
    cache_read = token_count(attributes.get("gen_ai.usage.cache_read.input_tokens"))
    cache_write = token_count(
        attributes.get("gen_ai.usage.cache_creation.input_tokens")
    )
    if not (input_tokens or output_tokens or cache_read or cache_write):
        return None
    return Usage(
        input=input_tokens,
        output=output_tokens,
        cache_read=cache_read,
        cache_write=cache_write,
    )


def source_of(service_name: str) -> str:
    lowered = ascii_lower(service_name)
    if "claude" in lowered:
        return "Claude Code"
    if "codex" in lowered:
        return "Codex"
    if "copilot" in lowered or "vscode" in lowered:
        return "GitHub Copilot"
    return service_name or "OpenTelemetry"


def session_key(attributes: dict[str, object], fallback: str) -> str:
    for name in SESSION_KEY_ATTRIBUTES:
        text = attr_text(attributes, name)
        if text:
            return text
    return fallback


def text_of(value: object) -> str:
    if isinstance(value, dict):
        found = next(
            (
                value
                for value in (value.get("text"), value.get("value"))
                if value is not None
            ),
            None,
        )
        if found is not None:
            return "" if is_blank(found) else js_string(found)
    return content_text(value)


def message_role(message: object) -> object:
    return message.get("role") if isinstance(message, dict) else None


def message_content(message: object) -> object:
    if not isinstance(message, dict):
        return message
    parts = message.get("parts")
    if isinstance(parts, list):
        return [
            {
                "type": "text",
                "text": next(
                    (
                        value
                        for value in (part.get("content"), part.get("text"), "")
                        if value is not None
                    ),
                    None,
                )
                if isinstance(part, dict)
                else "",
            }
            for part in parts
        ]
    return next(
        (value for value in (message.get("content"), message) if value is not None),
        None,
    )


def messages_text(value: object, role: str) -> str:
    if value is None:
        return ""
    listing = value
    if isinstance(value, str):
        try:
            listing = parse_otlp_body(value)
        except ValueError:
            return value
    if not isinstance(listing, list):
        listing = [listing]
    picked = [
        item
        for item in listing
        if is_blank(message_role(item)) or message_role(item) == role
    ]
    if not picked or is_blank(picked[-1]):
        return ""
    return text_of(message_content(picked[-1]))
