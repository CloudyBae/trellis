from trellis.hosts.constants import LIVE_PENDING_MS
from trellis.sessions.constants import LIVE_MS, REFRESH_GRACE_MS
from trellis.hosts.records import BaseTranscriptFile
from trellis.hosts.sessions import final_state, is_live, is_refreshable, trim_turns
from trellis.util.limits import MAX_TURNS


def test_trim_keeps_exactly_the_limit():
    turns = list(range(MAX_TURNS))
    assert trim_turns(turns) == 0
    assert turns == list(range(MAX_TURNS))


def test_trim_drops_from_the_front_in_place():
    turns = list(range(MAX_TURNS + 1))
    same_list = turns
    assert trim_turns(turns) == 1
    assert turns is same_list
    assert turns == list(range(1, MAX_TURNS + 1))


def test_trim_reports_the_full_overflow():
    turns = list(range(MAX_TURNS + 25))
    assert trim_turns(turns) == 25
    assert len(turns) == MAX_TURNS
    assert turns[0] == 25


def test_live_inside_the_plain_window_only_without_pending():
    assert is_live(LIVE_MS - 1, 0, False)
    assert not is_live(LIVE_MS, 0, False)


def test_pending_extends_the_window_to_its_edge():
    assert is_live(LIVE_MS, 0, True)
    assert is_live(LIVE_PENDING_MS - 1, 0, True)
    assert not is_live(LIVE_PENDING_MS, 0, True)


def test_refreshable_until_the_grace_edge():
    window = LIVE_MS
    assert is_refreshable(window + REFRESH_GRACE_MS - 1, 0, window)
    assert not is_refreshable(window + REFRESH_GRACE_MS, 0, window)


def test_final_state_is_complete_without_an_error():
    assert final_state(None, None) == "complete"
    assert final_state(None, 5) == "complete"


def test_final_state_fails_when_the_error_has_no_say():
    assert final_state(5, None) == "failed"


def test_final_state_compares_error_and_say_strictly():
    assert final_state(6, 5) == "failed"
    assert final_state(5, 5) == "complete"
    assert final_state(4, 5) == "complete"


def test_note_timestamp_tracks_first_and_last_and_ignores_zero():
    transcript = BaseTranscriptFile("/tmp/notes.jsonl")
    transcript.note_timestamp(0)
    assert (transcript.first_ts, transcript.last_ts) == (0, 0)
    transcript.note_timestamp(500)
    assert (transcript.first_ts, transcript.last_ts) == (500, 500)
    transcript.note_timestamp(200)
    assert (transcript.first_ts, transcript.last_ts) == (200, 500)
    transcript.note_timestamp(900)
    assert (transcript.first_ts, transcript.last_ts) == (200, 900)
    transcript.note_timestamp(0)
    assert (transcript.first_ts, transcript.last_ts) == (200, 900)
