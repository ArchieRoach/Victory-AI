"""Self-check for habit measurement: push link tagging, session trigger attribution and
the weekly summary. No DB or network needed:

    python3 backend/test_habit.py
"""
from server import push_kind, tag_push_url, session_trigger, summarise_habit_week, TRIGGER_ATTRIBUTION_MINUTES


def test_push_kind_comes_from_the_tag():
    assert push_kind("booking-book_123") == "booking"
    assert push_kind("weekly-reminder") == "weekly"
    assert push_kind("film-digest") == "film"
    assert push_kind(None) == "push"
    assert push_kind("") == "push"


def test_push_links_are_tagged_once_and_keep_their_params():
    assert tag_push_url("/train?focus=Jab", "booking-x") == "/train?focus=Jab&src=booking"
    assert tag_push_url("/callouts", "callout-x") == "/callouts?src=callout"
    assert tag_push_url("/train?src=weekly", "booking-x") == "/train?src=weekly"
    assert tag_push_url("https://evil.example/x", "booking-x") == "https://evil.example/x"


def test_session_trigger_attribution():
    assert session_trigger(None, None) == "direct"
    assert session_trigger("direct", 0) == "direct"
    assert session_trigger("booking", 5) == "booking"
    assert session_trigger("booking", TRIGGER_ATTRIBUTION_MINUTES) == "booking"
    assert session_trigger("booking", TRIGGER_ATTRIBUTION_MINUTES + 1) == "direct"  # chose to train later
    assert session_trigger("<b>weekly</b>", 1) == "bweeklyb"


def test_weekly_summary():
    sessions = (
        [{"user_id": "a", "trigger": "direct", "record_video": True}] * 3
        + [{"user_id": "b", "trigger": "booking", "record_video": False}]
        + [{"user_id": "c", "trigger": "direct", "record_video": True}] * 6
        + [{"user_id": "d"}]  # saved before tagging existed
    )
    s = summarise_habit_week(sessions)
    assert s["sessions"] == 11 and s["active_users"] == 4
    assert s["by_trigger"] == {"direct": 9, "booking": 1, "untagged": 1}
    assert s["pct_direct"] == 90                       # 9 of 10 tagged
    assert s["users_in_habit_zone"] == 1               # a: 3
    assert s["users_over_zone"] == 1                   # c: 6
    assert s["pct_recorded"] == 82
    empty = summarise_habit_week([])
    assert empty["pct_direct"] is None and empty["median_sessions_per_user"] == 0


def test_metrics_token_needs_a_long_configured_secret():
    import server
    saved = server.METRICS_API_TOKEN
    try:
        server.METRICS_API_TOKEN = ""
        assert server.metrics_token_ok("") is False and server.metrics_token_ok("anything") is False
        server.METRICS_API_TOKEN = "short"
        assert server.metrics_token_ok("short") is False
        server.METRICS_API_TOKEN = "x" * 40
        assert server.metrics_token_ok("x" * 40) is True
        assert server.metrics_token_ok("x" * 39) is False and server.metrics_token_ok(None) is False
    finally:
        server.METRICS_API_TOKEN = saved


if __name__ == "__main__":
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"\n{len(tests)} passed")
