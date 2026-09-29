"""Self-check for investment loops: quiet hours, booking reminders, callout settling and
the weekly-reminder preference. No DB or network needed:

    python3 backend/test_investment.py
"""
from datetime import datetime, timezone

from server import (
    local_hour, in_quiet_hours, booking_push, callout_beaten_by, weekly_reminder_prefs_on, joined_before,
)

UTC = timezone.utc


def test_local_hour_uses_js_offset_convention():
    at = datetime(2026, 9, 29, 16, 0, tzinfo=UTC)
    assert local_hour(at, -60) == 17      # BST: local = UTC + 1
    assert local_hour(at, 300) == 11      # US Eastern (EST): local = UTC - 5
    assert local_hour(at, 0) == 16


def test_quiet_hours_are_10pm_to_7am_local():
    assert in_quiet_hours(datetime(2026, 9, 29, 21, 30, tzinfo=UTC), -60) is True   # 22:30 BST
    assert in_quiet_hours(datetime(2026, 9, 29, 5, 30, tzinfo=UTC), -60) is True    # 06:30 BST
    assert in_quiet_hours(datetime(2026, 9, 29, 5, 30, tzinfo=UTC), 0) is True      # 05:30 UTC
    assert in_quiet_hours(datetime(2026, 9, 29, 6, 0, tzinfo=UTC), -60) is False    # 07:00 BST
    assert in_quiet_hours(datetime(2026, 9, 29, 20, 59, tzinfo=UTC), -60) is False  # 21:59 BST


def test_booking_push_names_the_focus_and_pb():
    title, body, url = booking_push({"focus": "Footwork", "focus_pb": 6})
    assert title == "Your footwork round is booked" and body == "PB to beat: 6"
    assert url == "/train?focus=Footwork"
    _, body, url = booking_push({"focus": "Left Hook", "focus_pb": None})
    assert body == "Set your first score" and url == "/train?focus=Left%20Hook"
    title, _, url = booking_push({"focus": None})
    assert title == "Your round is booked" and url == "/train"


def test_callouts_need_a_strictly_better_real_score():
    c = {"dimension": "Jab", "score": 9}
    assert callout_beaten_by(c, 8.0, [{"dimension_name": "Jab", "score": 10}]) == 10
    assert callout_beaten_by(c, 8.0, [{"dimension_name": "Jab", "score": 9}]) is None
    assert callout_beaten_by(c, 8.0, [{"dimension_name": "Jab", "score": None}]) is None
    assert callout_beaten_by(c, 8.0, [{"dimension_name": "Cross", "score": 10}]) is None
    overall = {"dimension": "Overall", "score": 7.5}
    assert callout_beaten_by(overall, 7.6, []) == 7.6
    assert callout_beaten_by(overall, None, []) is None


def test_weekly_reminder_defaults_on_and_respects_opt_out():
    assert weekly_reminder_prefs_on({}) is True
    assert weekly_reminder_prefs_on({"notification_prefs": {"weekly_reminder": False}}) is False


def test_joined_before_handles_both_date_formats():
    cutoff = datetime(2026, 9, 22, tzinfo=UTC)
    assert joined_before({"created_at": "2026-09-01T10:00:00+00:00"}, cutoff) is True
    assert joined_before({"created_at": datetime(2026, 9, 1)}, cutoff) is True
    assert joined_before({"created_at": "2026-09-28T10:00:00+00:00"}, cutoff) is False
    assert joined_before({}, cutoff) is False
    assert joined_before({"created_at": "garbage"}, cutoff) is False


if __name__ == "__main__":
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"\n{len(tests)} passed")
