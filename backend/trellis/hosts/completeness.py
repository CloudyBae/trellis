from typing import Literal

from ..sessions.models import Completeness

SourceKind = Literal["claude", "codex", "copilot"]


def completeness(
    *,
    source: SourceKind,
    is_subagent: bool,
    meta_only: bool,
    has_real_task: bool,
    has_own_turns: bool,
    has_conversation_turns: bool,
    trimmed: bool,
) -> Completeness:
    if source == "claude" and is_subagent and meta_only:
        return "partial"
    if source == "copilot" and is_subagent and has_real_task and not has_own_turns:
        return "partial"
    if not has_real_task and not has_conversation_turns:
        return "activity_only"
    if not has_real_task or trimmed:
        return "partial"
    return "complete"
