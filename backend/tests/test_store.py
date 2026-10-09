import threading

from tests.builders import make_session
from trellis.runtime.store import Store
from trellis.sessions.serialize import dump_session


class Recorder:
    def __init__(self, store: Store) -> None:
        self.changed: list[str] = []
        self.removed: list[str] = []
        store.on_change(self.changed.append)
        store.on_remove(self.removed.append)


def test_ignores_a_session_without_agents():
    store = Store()
    recorder = Recorder(store)
    store.put(make_session("cc:a", "a", agent_count=0))
    assert store.get("cc:a") is None
    assert store.list() == []
    assert recorder.changed == []


def test_announces_a_change_only_when_the_dumped_json_changes():
    store = Store()
    recorder = Recorder(store)
    store.put(make_session("cc:a", "a", t0=1))
    store.put(make_session("cc:a", "a", t0=1))
    assert recorder.changed == ["cc:a"]
    store.put(make_session("cc:a", "a", t0=2))
    assert recorder.changed == ["cc:a", "cc:a"]


def test_json_of_is_the_dumped_session():
    store = Store()
    session = make_session("cc:a", "a", t0=5)
    store.put(session)
    assert store.json_of("cc:a") == dump_session(session)
    assert store.json_of("cc:missing") is None


def test_lists_sessions_by_start_time_newest_first():
    store = Store()
    store.put(make_session("cc:old", "old", t0=1))
    store.put(make_session("cc:new", "new", t0=3))
    store.put(make_session("cc:mid", "mid", t0=2))
    assert [session.id for session in store.list()] == ["cc:new", "cc:mid", "cc:old"]


def test_an_otel_session_is_hidden_when_a_transcript_shares_its_raw_id():
    store = Store()
    recorder = Recorder(store)
    store.put(make_session("cc:s1", "s1", t0=1))
    store.put(make_session("otel:s1", "s1", t0=2, via="traces"))
    store.put(make_session("otel:s2", "s2", t0=3, via="traces"))
    assert [session.id for session in store.list()] == ["otel:s2", "cc:s1"]
    assert recorder.changed == ["cc:s1", "otel:s2"]
    assert store.get("otel:s1") is not None


def test_a_transcript_arriving_announces_removal_of_the_shown_otel_sessions():
    store = Store()
    recorder = Recorder(store)
    store.put(make_session("otel:s1", "s1", t0=2, via="traces"))
    store.put(make_session("otel-log:s1", "s1", t0=2, via="logs"))
    store.put(make_session("otel:other", "other", t0=2, via="traces"))
    assert recorder.removed == []
    store.put(make_session("cc:s1", "s1", t0=1))
    assert sorted(recorder.removed) == ["otel-log:s1", "otel:s1"]
    assert [session.id for session in store.list()] == ["otel:other", "cc:s1"]


def test_otel_arrivals_never_announce_removals():
    store = Store()
    recorder = Recorder(store)
    store.put(make_session("otel:s1", "s1", via="traces"))
    store.put(make_session("otel-log:s1", "s1", via="logs"))
    assert recorder.removed == []


def test_a_logs_session_is_hidden_when_traces_exist_for_the_same_raw_id():
    store = Store()
    recorder = Recorder(store)
    store.put(make_session("otel-log:s1", "s1", t0=1, via="logs"))
    assert [session.id for session in store.list()] == ["otel-log:s1"]
    store.put(make_session("otel:s1", "s1", t0=2, via="traces"))
    assert [session.id for session in store.list()] == ["otel:s1"]
    store.put(make_session("otel-log:s1", "s1", t0=3, via="logs"))
    assert recorder.changed == ["otel-log:s1", "otel:s1"]
    assert [session.id for session in store.list()] == ["otel:s1"]


def test_callbacks_run_synchronously_in_the_callers_thread():
    store = Store()
    seen: list[int] = []
    store.on_change(lambda _: seen.append(threading.get_ident()))
    store.put(make_session("cc:a", "a"))
    assert seen == [threading.get_ident()]


def test_otel_traces_arriving_announces_removal_of_otel_logs_session():
    store = Store()
    recorder = Recorder(store)
    store.put(make_session("otel-log:s1", "s1", t0=1, via="logs"))
    assert [session.id for session in store.list()] == ["otel-log:s1"]
    assert recorder.removed == []
    store.put(make_session("otel:s1", "s1", t0=2, via="traces"))
    assert [session.id for session in store.list()] == ["otel:s1"]
    assert recorder.removed == ["otel-log:s1"]
