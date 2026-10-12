"""Self-check for the framework rules (your week, Boss Round, Epic Win, reminders):

    python3 backend/test_frameworks.py
"""
from datetime import date, timedelta

import gamification as gx


def test_partner_bench_comes_later_for_a_lighter_chosen_week():
    assert gx.condition_thresholds(3) == (4, 7)
    assert gx.condition_thresholds(2) == (5, 8)
    assert gx.condition_thresholds(4) == (4, 7)
    today = date(2026, 10, 12)
    dates = [(today - timedelta(days=4 + 3 * i)).isoformat() for i in range(10)]
    assert gx.partner_condition(dates, today=today, target=3)["state"] == "waiting"
    two = gx.partner_condition(dates, today=today, target=2)
    assert two["state"] in ("ready", "peak") and two["target"] == 2 and two["waiting_after"] == 5


def test_lighter_target_fills_the_stats_sooner():
    today = date(2026, 10, 12)
    dates = [(today - timedelta(days=d)).isoformat() for d in range(0, 42, 4)]
    assert gx.partner_condition(dates, today=today, target=2)["overall"] > gx.partner_condition(dates, today=today, target=4)["overall"]


def test_week_plan_view_counts_only_this_weeks_choice():
    v = gx.week_plan_view({"week_id": "2026-W42", "target": 2, "focus": "Jab"}, 2, "2026-W42")
    assert v["chosen"] and v["complete"] and v["left"] == 0 and v["focus"] == "Jab"
    stale = gx.week_plan_view({"week_id": "2026-W41", "target": 4}, 1, "2026-W42")
    assert not stale["chosen"] and stale["target"] == 4 and stale["left"] == 3 and not stale["complete"]
    assert gx.week_plan_view(None, 0, "2026-W42")["target"] == 3


def test_boss_is_the_same_for_everyone_each_week_and_scales_to_you():
    assert gx.boss_for_week("2026-W42") == gx.boss_for_week("2026-W42")
    assert {gx.boss_for_week(f"2026-W{n:02d}") for n in range(1, 53)} == set(gx.BOSSES)
    assert gx.boss_target("machine", best_punches=100, round_seconds=180)["punches"] == 110
    assert gx.boss_target("machine", best_punches=0, round_seconds=120)["punches"] == 88
    wall = gx.boss_target("wall", best_punches=0, round_seconds=180)
    assert wall["guard_pct"] == 85 and wall["punches"] == 90


def test_boss_needs_every_condition_and_a_real_count():
    wall = {"guard_pct": 85, "punches": 90, "line": "x"}
    assert gx.boss_result(wall, {"guard_pct": 90, "punches": 95})["beaten"]
    assert not gx.boss_result(wall, {"guard_pct": 90, "punches": 50})["beaten"]
    assert not gx.boss_result(wall, None)["beaten"]
    assert gx.boss_result({"best_combo": 6}, {"best_combo": 6})["got"] == {"best_combo": 6}


def test_epic_line_uses_their_words():
    assert gx.epic_line({"goal": "first_bout"}) == "That's one step closer to your big win: have my first bout."
    assert gx.epic_line({"custom": "Make the county team"}) == "That's one step closer to your big win: make the county team."
    assert gx.epic_line(None) is None


def test_reminders_respect_age_and_stop_when_the_week_is_done():
    assert gx.reminder_hour_allowed(20, minor=True) and not gx.reminder_hour_allowed(21, minor=True)
    assert gx.reminder_hour_allowed(21, minor=False) and not gx.reminder_hour_allowed(5, minor=False)
    assert gx.reminder_message(partner="Dee", state="ready", week_left=0) is None
    assert gx.reminder_message(partner="Dee", state="rusty", week_left=2)[0] == "Dee is waiting for you"
    assert "Tired" in gx.reminder_message(partner="Dee", state="ready", week_left=1, bad_guys=["tired"])[1]
    title, body, url = gx.reminder_message(partner="Dee", state="ready", week_left=2)
    assert title == "Just one round" and "2 to go" in body and url == "/train?quick=1"


if __name__ == "__main__":
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"\n{len(tests)} passed")
