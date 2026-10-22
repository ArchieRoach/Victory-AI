"""Self-check: the weekly training streak and its once-a-week nudge.

    MONGO_URL=x DB_NAME=t python3 backend/test_weekly_streak.py
"""
import asyncio
from datetime import date, datetime, timedelta, timezone

from mongomock_motor import AsyncMongoMockClient

import gamification as gx
import server

server.db = AsyncMongoMockClient()["test"]

THU = date(2026, 10, 22)
MON = THU - timedelta(days=THU.weekday())


def week(n, *weekdays):
    return [MON - timedelta(days=7 * n) + timedelta(days=d) for d in weekdays]


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def test_two_days_a_week_keeps_it_going():
    s = gx.weekly_streak(week(1, 0, 3) + week(2, 1, 5) + week(3, 2, 4), THU)
    assert s["current"] == 3 and s["longest"] == 3


def test_one_session_does_not_count_a_week():
    s = gx.weekly_streak(week(1, 0, 3) + week(2, 1), THU)
    assert s["current"] == 1


def test_three_sessions_on_one_day_are_one_day():
    s = gx.weekly_streak(week(1, 0, 0, 0), THU)
    assert s["current"] == 0


def test_this_week_never_breaks_it_early():
    s = gx.weekly_streak(week(1, 0, 3) + week(2, 1, 5), THU)
    assert s["current"] == 2, "still 2 until Sunday ends"
    assert s["at_risk"] and s["needed"] == 2 and s["days_left"] == 3


def test_this_week_adds_once_it_is_done():
    s = gx.weekly_streak(week(0, 0, 1) + week(1, 0, 3), THU)
    assert s["current"] == 2 and s["safe"] and not s["at_risk"]


def test_a_missed_week_resets_but_longest_remembers():
    s = gx.weekly_streak(week(1, 0, 3) + week(3, 0, 1) + week(4, 0, 1) + week(5, 0, 1), THU)
    assert s["current"] == 1 and s["longest"] == 3


def test_a_new_fighter_is_never_at_risk():
    s = gx.weekly_streak([], THU)
    assert s["current"] == 0 and not s["at_risk"]
    assert gx.streak_nudge(s, 5) is None


def test_nudge_only_on_the_right_day():
    two_needed = gx.weekly_streak(week(1, 0, 3) + week(2, 1, 5), THU)
    assert gx.streak_nudge(two_needed, 4)[0] == "Your 2-week streak is on the line"
    assert gx.streak_nudge(two_needed, 5) is None
    one_needed = gx.weekly_streak(week(0, 0) + week(1, 0, 3), THU)
    assert "One more session" in gx.streak_nudge(one_needed, 5)[1]
    assert gx.streak_nudge(one_needed, 4) is None


def test_the_nudge_is_sent_once_a_week():
    sent = []

    async def fake_push(uid, **k):
        sent.append((uid, k["title"]))
    real_push, real_streak = server._send_push, gx.weekly_streak
    server._send_push = fake_push
    today = datetime.now(timezone.utc).date()
    saturday = today + timedelta(days=(5 - today.weekday()) % 7)
    now = datetime(saturday.year, saturday.month, saturday.day, server.LOCAL_SEND_HOUR_REMINDER, tzinfo=timezone.utc)
    gx.weekly_streak = lambda days, today=None: real_streak(days, saturday)
    try:
        last_week = saturday - timedelta(days=7)
        for d in (saturday - timedelta(days=5), last_week - timedelta(days=4), last_week - timedelta(days=2)):
            run(server.db.sessions.insert_one({"user_id": "u1", "date": d.isoformat()}))
        run(server.db.users.insert_one({"user_id": "u1", "tz_offset_minutes": 0}))
        run(server._send_streak_nudges(now))
        run(server._send_streak_nudges(now))
    finally:
        server._send_push, gx.weekly_streak = real_push, real_streak
    assert sent == [("u1", "Your 1-week streak is on the line")]


if __name__ == "__main__":
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"\n{len(tests)} passed")
