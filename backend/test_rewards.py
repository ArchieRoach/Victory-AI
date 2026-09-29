"""Self-check for variable rewards: honest scoring, personal bests, seasons, scouting
reports and squad stamps. No DB or network needed:

    python3 backend/test_rewards.py
"""
from datetime import date

from server import (
    _avg_score, _best_score, compute_pb_changes, current_season, season_rank, session_points,
    build_scouting_report, stamp_summary, teasers_enabled, generate_simulated_analysis,
    SEASON_RANKS, VERDICT_AT, SQUAD_STAMPS,
)


def test_unscored_sessions_do_not_drag_averages():
    sessions = [{"overall_score": 8.0}, {"overall_score": None}, {}, {"overall_score": 6.0}]
    assert _avg_score(sessions) == 7.0
    assert _best_score(sessions) == 8.0
    assert _avg_score([{"overall_score": None}]) == 0
    assert _best_score([]) == 0


def test_failed_analysis_invents_nothing():
    out = generate_simulated_analysis(1, "Coach", ["Jab"])
    assert out["analysis"] is None and out["unavailable"] is True


def test_first_session_sets_baselines_not_fake_pbs():
    pb = compute_pb_changes({}, 7.5, [{"dimension_name": "Jab", "score": 8}])
    assert pb["new"] == [] and pb["baselines"] == 2


def test_new_pbs_and_near_misses():
    pbs = {"Overall": 8.0, "Jab": 8, "Footwork": 7, "Left Hook": 9}
    dims = [
        {"dimension_name": "Jab", "score": 9},
        {"dimension_name": "Footwork", "score": 6},
        {"dimension_name": "Left Hook", "score": 9},
        {"dimension_name": "Guard Position", "score": None},
    ]
    pb = compute_pb_changes(pbs, 7.8, dims)
    assert pb["new"] == [{"name": "Jab", "score": 9, "prev": 8}]
    names = [n["name"] for n in pb["near"]]
    assert names == ["Overall", "Footwork"]
    assert pb["near"][0]["gap"] == 0.2
    assert "Left Hook" not in names  # matching a PB isn't a near miss
    assert all(name != "Guard Position" for name, _ in pb["entries"])


def test_seasons_roll_every_six_weeks():
    s1 = current_season(date(2026, 1, 5))
    assert s1["season_id"] == "S1" and s1["days_left"] == 42
    assert current_season(date(2026, 2, 15))["season_id"] == "S1"
    s2 = current_season(date(2026, 2, 16))
    assert s2["season_id"] == "S2" and s2["starts"] == "2026-02-16"


def test_rank_ladder():
    assert season_rank(0)["rank"] == "Bronze" and season_rank(0)["next_at"] == 100
    assert season_rank(260)["rank"] == "Gold" and season_rank(260)["next_rank"] == "Platinum"
    top = season_rank(5000)
    assert top["rank"] == SEASON_RANKS[-1][0] and top["next_rank"] is None


def test_points_reward_showing_up_and_only_trusted_scores():
    assert session_points(None, 0, True) == 10
    assert session_points(8.0, 2, True) == 10 + 40 + 30
    assert session_points(10.0, 5, False) == 10  # self-rated scorecards can't farm points


def test_scouting_report_is_locked_without_analysis():
    r = build_scouting_report([{"dimension_name": "Jab", "score": None}], "s1")
    assert r["locked"] is True and r["type"] is None


def test_scouting_report_varies_and_is_stable_per_session():
    dims = [{"dimension_name": "Jab", "score": 9}, {"dimension_name": "Footwork", "score": 5},
            {"dimension_name": "Cross", "score": 7}, {"dimension_name": "Slip", "score": 6}]
    pct = {"Jab": 88}
    kinds = {build_scouting_report(dims, f"sess_{i}", pct)["type"] for i in range(300)}
    assert kinds == {"weakness", "strength", "percentile", "elite"}
    assert build_scouting_report(dims, "same", pct) == build_scouting_report(dims, "same", pct)
    weak = next(build_scouting_report(dims, f"s{i}", pct) for i in range(300)
                if build_scouting_report(dims, f"s{i}", pct)["type"] == "weakness")
    assert "Footwork" in weak["title"]
    rare = next(build_scouting_report(dims, f"s{i}", pct) for i in range(300)
                if build_scouting_report(dims, f"s{i}", pct)["type"] == "percentile")
    assert rare["rarity"] == "rare" and "Top 12% Jab" in rare["title"]


def test_rare_types_need_real_evidence():
    ordinary = [{"dimension_name": "Jab", "score": 6}, {"dimension_name": "Cross", "score": 5}]
    kinds = {build_scouting_report(ordinary, f"s{i}", {"Jab": 40})["type"] for i in range(300)}
    assert kinds == {"weakness", "strength"}


def test_stamp_verdict_stays_locked_until_enough_squad_react():
    stamps = [{"stamp": "clean"}, {"stamp": "heavy_hands"}, {"stamp": "clean"}]
    s = stamp_summary(stamps)
    assert s["count"] == 3 and s["verdict"] is None and s["verdict_in"] == VERDICT_AT - 3
    s = stamp_summary(stamps + [{"stamp": "clean"}, {"stamp": "sharp_jab"}])
    assert s["verdict"] == {"stamp": "clean", "label": SQUAD_STAMPS["clean"], "count": 3}
    assert s["verdict_in"] == 0


def test_teasers_can_be_switched_off():
    assert teasers_enabled({}) is True
    assert teasers_enabled(None) is True
    assert teasers_enabled({"notification_prefs": {"teasers": False}}) is False


if __name__ == "__main__":
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"\n{len(tests)} passed")
