"""Self-check for earned fighter-identity traits: only evidence earns a label, the
least-earned trait is picked, and counts build up across sessions.

    MONGO_URL=x DB_NAME=t python3 backend/test_identity.py
"""
import asyncio
from datetime import datetime, timezone

from mongomock_motor import AsyncMongoMockClient

import server
from server import identity_evidence, pick_identity_trait, top_identity_traits

server.db = AsyncMongoMockClient()["test"]


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def dims(**scores):
    return [{"dimension_name": k.replace("_", " "), "score": v} for k, v in scores.items()]


def test_scores_need_to_be_verified_and_good():
    s = {"dimension_scores": dims(Jab=8, Guard_Position=6, Footwork=None)}
    assert identity_evidence(s, True, 1) == [("sharp_jab", "Jab 8/10")]
    assert identity_evidence(s, False, 1) == [], "manual scorecards earn no skill trait"


def test_live_counts_earn_traits_with_their_evidence():
    s = {"live_stats": {"rounds": 3, "punches": 330, "best_combo": 6, "guard_pct": 84, "head_moves": 50},
         "training_config": {"round_duration": 120}}
    ev = dict(identity_evidence(s, True, 1))
    assert ev == {"iron_guard": "guard up 84% of the time", "slick": "50 head movements",
                  "relentless": "55 punches a minute", "combo_puncher": "a 6-punch combination"}


def test_ai_score_beats_live_count_as_evidence():
    s = {"dimension_scores": dims(Guard_Position=9), "live_stats": {"rounds": 1, "guard_pct": 90}}
    assert dict(identity_evidence(s, True, 1))["iron_guard"] == "Guard Position 9/10"


def test_finisher_and_shows_up():
    rnd = lambda score: {"analysis": {"dimension_scores": [{"dimension_name": "Jab", "score": score}]}}
    s = {"rounds": [rnd(5), rnd(6), rnd(7)]}
    ev = dict(identity_evidence(s, True, 3))
    assert "finisher" in ev and ev["shows_up"] == "3 sessions this week"
    assert "finisher" not in dict(identity_evidence({"rounds": [rnd(7), rnd(5)]}, True, 1))
    assert identity_evidence({}, True, 2) == [], "no evidence, no label"


def test_least_earned_trait_wins():
    ev = [("iron_guard", "a"), ("sharp_jab", "b"), ("shows_up", "c")]
    assert pick_identity_trait(ev, {"iron_guard": 4, "sharp_jab": 1, "shows_up": 2}) == ("sharp_jab", "b")
    assert pick_identity_trait(ev, {}) == ("iron_guard", "a")
    assert pick_identity_trait([], {}) is None


def test_counts_build_and_show_top_traits():
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    run(server.db.users.insert_one({"user_id": "u1"}))
    run(server.db.sessions.insert_many([{"user_id": "u1", "date": today} for _ in range(3)]))
    session = {"dimension_scores": dims(Jab=8)}
    first = run(server.apply_identity("u1", session, True))
    assert first["name"] == "Sharp Jab" and first["count"] == 1 and first["evidence"] == "Jab 8/10"
    second = run(server.apply_identity("u1", session, True))
    assert second["key"] == "shows_up", "a different trait next time keeps the label fresh"
    third = run(server.apply_identity("u1", session, True))
    assert third["key"] == "sharp_jab" and third["count"] == 2
    assert third["traits"] == [{"name": "Sharp Jab", "count": 2}, {"name": "Shows Up", "count": 1}]
    assert top_identity_traits({"bogus": 9, "slick": 0}) == []


if __name__ == "__main__":
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"\n{len(tests)} passed")
