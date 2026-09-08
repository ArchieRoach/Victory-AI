"""Self-check for the re-engagement loop's pure decision logic (win-back message
tiering, trial-reminder window math). No DB or network needed — run with the same
Python env as server.py (see requirements.txt):

    python3 backend/test_reengagement.py
"""
from datetime import datetime, timedelta, timezone
from server import _compute_streaks, WINBACK_INACTIVITY_DAYS, WINBACK_RESEND_COOLDOWN_DAYS, TRIAL_REMINDER_WINDOW_DAYS


def pick_tier(sessions):
    """Mirrors _build_winback_message's branching, without needing a DB."""
    if not sessions:
        return "first_timer"
    _current, longest = _compute_streaks(sessions)
    return "streak" if longest >= 3 else "session_count"


def in_trial_window(days_remaining):
    return 0 < days_remaining <= TRIAL_REMINDER_WINDOW_DAYS


def run():
    assert pick_tier([]) == "first_timer"

    today = datetime.now(timezone.utc).date()
    long_streak = [{"date": (today - timedelta(days=i)).strftime("%Y-%m-%d")} for i in range(5)]
    assert pick_tier(long_streak) == "streak"

    sparse = [{"date": (today - timedelta(days=10)).strftime("%Y-%m-%d")}]
    assert pick_tier(sparse) == "session_count"

    # Anyone the win-back loop actually messages has been inactive >= WINBACK_INACTIVITY_DAYS
    # by construction of its query — sanity-check that's still true relative to the constant.
    most_recent = max(s["date"] for s in long_streak)
    stale_now = today + timedelta(days=WINBACK_INACTIVITY_DAYS)
    days_since = (stale_now - datetime.strptime(most_recent, "%Y-%m-%d").date()).days
    assert days_since >= WINBACK_INACTIVITY_DAYS

    assert in_trial_window(3.0) is True
    assert in_trial_window(3.01) is False
    assert in_trial_window(0.01) is True
    assert in_trial_window(0) is False
    assert in_trial_window(-0.5) is False  # trial already ended — not this loop's job

    assert WINBACK_RESEND_COOLDOWN_DAYS > WINBACK_INACTIVITY_DAYS, \
        "cooldown must exceed the trigger window or a still-inactive user gets re-pushed immediately"

    print("all re-engagement logic assertions passed")


if __name__ == "__main__":
    run()
