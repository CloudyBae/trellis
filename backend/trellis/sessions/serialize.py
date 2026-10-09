from ..util.json_text import js_json
from .models import Session


def dump_session(session: Session) -> str:
    return js_json(session.model_dump(by_alias=True, exclude_unset=True))
