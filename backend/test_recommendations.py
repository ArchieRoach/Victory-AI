"""Self-check for unlocks, Easter eggs, the boss vote and tip bylines:

    python3 backend/test_recommendations.py
"""
import gamification as gx


def test_features_unlock_one_at_a_time_after_real_sessions():
    assert gx.unlocked_features(0) == []
    assert gx.unlocked_features(1) == ["week_plan"]
    assert set(gx.unlocked_features(3)) == {"week_plan", "combo_calls", "crew", "round_types", "go_live"}
    assert gx.next_unlock(0)["key"] == "week_plan" and gx.next_unlock(0)["sessions_to_go"] == 1
    assert gx.next_unlock(99) is None
    assert [u["key"] for u in gx.newly_unlocked_features(1, 2)] == ["combo_calls", "crew"]
    assert gx.newly_unlocked_features(5, 5) == []
    assert "1 is a jab" in dict((k, line) for k, _, _, line in gx.FEATURE_UNLOCKS)["combo_calls"]


def test_easter_eggs_come_only_from_real_evidence():
    assert gx.eggs_in_session({}, [], None) == []
    assert gx.eggs_in_session({}, [], 6) == ["early_bird"]
    assert gx.eggs_in_session({}, [], 3) == []
    assert gx.eggs_in_session({}, [{"punches": 100}], 12) == ["century"]
    assert gx.eggs_in_session({"overall_score": 7.7}, [], None) == ["lucky_seven"]
    assert gx.eggs_in_session({}, [{"guard_pct": 100, "punches": 29}], None) == []
    assert gx.eggs_in_session({}, [{"guard_pct": 100, "punches": 30}], None) == ["iron_curtain"]
    twelve = {"training_config": {"total_rounds": 12}, "rounds": [{}] * 12}
    assert gx.eggs_in_session(twelve, [], None) == ["championship"]
    assert gx.eggs_in_session({"training_config": {"total_rounds": 12}, "rounds": [{}] * 3}, [], None) == []


def test_boss_vote_most_votes_wins_and_no_votes_keeps_the_rotation():
    assert gx.boss_from_votes([], "2026-W43") == gx.boss_for_week("2026-W43")
    assert gx.boss_from_votes(["wall", "storm", "wall", "nonsense"], "2026-W43") == "wall"
    assert gx.boss_from_votes(["storm", "ghost"], "2026-W43") == "ghost", "ties break the same way for everyone"
    assert gx.next_week_id() != gx.week_id()


def test_tip_byline_never_names_anyone():
    assert gx.tip_byline(7, True) == "A level 7 fighter at your gym"
    assert gx.tip_byline(3, False) == "A level 3 fighter"


if __name__ == "__main__":
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"\n{len(tests)} passed")
