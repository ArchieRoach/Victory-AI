"""Self-check for the progression rules (no DB):

    python3 backend/test_gamification.py
"""
from datetime import date, datetime, timedelta, timezone

import gamification as gx


def test_levels_only_climb_and_name_the_next_unlock():
    assert gx.level_for(0) == 1 and gx.level_for(79) == 1 and gx.level_for(80) == 2
    assert gx.level_for(-5) == 1
    p = gx.progression(100)
    assert p["level"] == 2 and p["next_level_at"] == 240 and p["to_next_level"] == 140
    assert p["unlocked"][0]["name"] == "The 1-2"
    assert p["next_milestone"]["level"] == 3 and p["next_milestone"]["to_go"] == 140
    assert gx.progression(gx.level_floor(5))["title"] == "Contender"
    assert gx.progression(10**7)["next_milestone"] is None


def test_newly_unlocked_lists_every_level_crossed():
    names = [m["name"] for m in gx.newly_unlocked(0, gx.level_floor(4))]
    assert names == ["The 1-2", "Slip and Counter", "Double Jab"]
    assert gx.newly_unlocked(100, 120) == []


def test_booster_doubles_once_then_runs_out():
    now = datetime(2026, 10, 10, tzinfo=timezone.utc)
    b = gx.make_booster("double_status", "Squad quest booster", now=now)
    pts, left, used = gx.apply_booster(40, [b], now=now)
    assert pts == 80 and used["label"] == "Squad quest booster" and left == []
    pts, left, used = gx.apply_booster(40, left, now=now)
    assert pts == 40 and used is None


def test_expired_boosters_do_nothing():
    now = datetime(2026, 10, 10, tzinfo=timezone.utc)
    b = gx.make_booster("double_status", "Old", now=now - timedelta(days=8))
    assert gx.apply_booster(40, [b], now=now)[0] == 40


def test_weeks_reset_on_monday():
    sat = date(2026, 10, 10)
    assert gx.week_id(sat) == "2026-W41" and gx.previous_week_id(sat) == "2026-W40"
    assert gx.week_resets_at(sat).startswith("2026-10-12")
    assert gx.recent_week_ids(3, sat) == ["2026-W39", "2026-W40", "2026-W41"]


def rows(*pairs):
    return [{"id": i, "points": p} for i, p in pairs]


def test_window_puts_me_in_the_middle():
    ranked = gx.rank_rows(rows(*[(f"u{i}", 100 - i * 10) for i in range(9)]))
    w = gx.centred_window(ranked, "u4")
    assert [r["id"] for r in w["rows"]] == ["u2", "u3", "u4", "u5", "u6"]
    assert w["gap_up"] == 11 and w["next_up_id"] == "u3" and w["within_reach"]


def test_window_clamps_at_the_edges():
    ranked = gx.rank_rows(rows(*[(f"u{i}", 100 - i) for i in range(6)]))
    assert [r["id"] for r in gx.centred_window(ranked, "u0")["rows"]] == ["u0", "u1", "u2", "u3", "u4"]
    assert [r["id"] for r in gx.centred_window(ranked, "u5")["rows"]] == ["u1", "u2", "u3", "u4", "u5"]
    assert gx.centred_window(ranked, "u0")["gap_up"] is None


def test_ties_share_a_rank_and_far_gaps_are_not_within_reach():
    ranked = gx.rank_rows(rows(("a", 500), ("b", 50), ("c", 50)))
    assert [r["rank"] for r in ranked] == [1, 2, 2]
    w = gx.centred_window(ranked, "c")
    assert w["gap_up"] == 451 and not w["within_reach"]


def test_learning_mode_for_newcomers_and_by_choice():
    assert gx.learning_mode(None, 0) and not gx.learning_mode(None, 3)
    assert gx.learning_mode({"learning_mode": True}, 50)
    assert not gx.learning_mode({"learning_mode": False}, 0)
    assert gx.default_scope(5) == "friends" and gx.default_scope(1) == "similar"


def test_quest_scales_with_the_squad():
    assert gx.quest_target(1) == 4 and gx.quest_target(3) == 9 and gx.quest_target(8) == 20
    v = gx.quest_view({"target": 6, "progress": 8, "completed": True, "contributions": {"a": 5, "b": 3}},
                      {"a": "You", "b": "Sam", "c": "Lee"}, "a")
    assert v["progress"] == 6 and v["pct"] == 100 and v["my_part"] == 5
    assert [m["name"] for m in v["members"]] == ["You", "Sam", "Lee"]


def test_shelf_titles_are_earned():
    assert gx.shelf_titles(status_points=0, created_at="2027-05-01", invited_count=0) == []
    items = gx.shelf_titles(status_points=gx.level_floor(10), created_at="2026-10-01T00:00:00", invited_count=12)
    assert [i["name"] for i in items] == ["Ring General", "Founding Fighter", "Squad Builder"]


def test_peer_insight_needs_a_real_sample():
    assert gx.peer_insight([3.0] * 9, 1, "Beginner") is None
    p = gx.peer_insight([2, 3, 3, 4, 3, 3, 2, 5, 3, 3], 1.5, "Beginner")
    assert p["typical_per_week"] == 3 and not p["on_track"] and "Beginner fighters" in p["text"]


def scored_round(*scores, seconds=None):
    return {"seconds": seconds,
            "analysis": {"dimension_scores": [{"dimension_name": f"d{i}", "score": v} for i, v in enumerate(scores)]}}


def test_only_rounds_the_ai_watched_count_for_their_real_length():
    rounds = [scored_round(8, 7, 9, seconds=181.4), scored_round(5, None, None, seconds=180), {"analysis": None},
              scored_round(6, 6, 6), scored_round(7, 7, 7, seconds=3600)]
    assert gx.verified_round_seconds(rounds) == [181, gx.ROUND_SECONDS_FALLBACK, gx.ROUND_SECONDS_CAP]


def test_daily_cap_stops_grinding():
    got = gx.count_verified([180] * 5, gx.VERIFIED_SECONDS_PER_DAY - 400)
    assert got == {"seconds": 400, "rounds": 3, "capped_seconds": 500}
    assert gx.count_verified([180], gx.VERIFIED_SECONDS_PER_DAY)["seconds"] == 0


def test_road_to_ten_thousand_hours():
    assert gx.mastery(0)["tier"] is None and gx.mastery(0)["next_tier"] == "First Hour"
    m = gx.mastery(120 * 3600)
    assert m["tier"] == "Seasoned" and m["next_tier"] == "Veteran" and m["next_at_hours"] == 500
    assert m["expert_pct"] == 1.2
    assert gx.mastery(10000 * 3600)["tier"] == "10,000-Hour Master"


def test_pledge_window_is_the_first_two_weeks_only():
    season = {"starts": "2026-10-05", "ends": "2026-11-16", "number": 7, "season_id": "S7", "days_left": 37}
    assert gx.pledge_window(season, date(2026, 10, 10))["open"]
    assert gx.pledge_window(season, date(2026, 10, 10))["days_to_close"] == 9
    assert not gx.pledge_window(season, date(2026, 10, 19))["open"]
    v = gx.gloves_view({"pledged_at": "x", "seconds": 5 * 3600}, season, pledged=40, earned=2, today=date(2026, 10, 10))
    assert v["name"] == "Season 7 Golden Gloves" and v["pct"] == 25 and v["hours_to_go"] == 15
    assert v["pledged"] and not v["earned"] and v["holders"] == 2 and v["chasers"] == 40


def test_only_acclaimed_fighters_can_be_gifted_gloves():
    assert not gx.is_acclaimed(record_verified=False, record_bouts=5, comp_wins=0, verified_seconds=0)
    assert gx.is_acclaimed(record_verified=True, record_bouts=1, comp_wins=0, verified_seconds=0)
    assert gx.is_acclaimed(record_verified=False, record_bouts=0, comp_wins=1, verified_seconds=0)
    assert gx.is_acclaimed(record_verified=False, record_bouts=0, comp_wins=0, verified_seconds=50 * 3600)


def _dates(today, offsets):
    return [(today - timedelta(days=d)).isoformat() for d in offsets]


def test_partner_stays_in_peak_shape_on_three_sessions_a_week():
    t = date(2026, 10, 11)
    c = gx.partner_condition(_dates(t, [d for d in range(60) if d % 7 in (0, 2, 4)]), t)
    assert c["state"] == "peak" and c["overall"] >= 70 and not c["drops"]


def test_partner_slides_to_the_bench_then_the_couch():
    t = date(2026, 10, 11)
    history = [d for d in range(60) if d % 7 in (0, 2, 4)]
    bench = gx.partner_condition(_dates(t, [d + 4 for d in history]), t)
    couch = gx.partner_condition(_dates(t, [d + 9 for d in history]), t)
    assert bench["state"] == "waiting" and couch["state"] == "rusty"
    assert couch["change_7d"] < 0 and couch["drops"]["sharpness"] < 0
    assert couch["stats"]["conditioning"] > couch["stats"]["sharpness"], "base fitness fades slower than sharpness"
    assert "couch" in gx.condition_line("Dee", couch) and "One session" in gx.condition_line("Dee", couch)


def test_one_session_ends_the_slide():
    t = date(2026, 10, 11)
    history = [d + 9 for d in range(60) if d % 7 in (0, 2, 4)]
    back = gx.partner_condition(_dates(t, [0] + history), t)
    assert back["state"] in ("ready", "peak") and back["days_since"] == 0


def test_new_fighters_start_fresh():
    assert gx.partner_condition([], date(2026, 10, 11))["state"] == "new"


if __name__ == "__main__":
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"\n{len(tests)} passed")
