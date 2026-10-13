"""Self-check for Corner Surprises and crew-chosen team missions against an in-memory Mongo:

    MONGO_URL=x DB_NAME=t python3 backend/test_surprises_missions.py
"""
import asyncio
from collections import Counter
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from mongomock_motor import AsyncMongoMockClient

import gamification as gx
import server

server.db = AsyncMongoMockClient()["test"]


async def no_push(*a, **k):
    return None

server._send_push = no_push
current = {}
server.app.dependency_overrides[server.get_current_user] = lambda: current["user"]
client = TestClient(server.app)
ANA = {"user_id": "u_ana", "name": "Ana"}
BEN = {"user_id": "u_ben", "name": "Ben"}
CAL = {"user_id": "u_cal", "name": "Cal"}


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def as_user(u):
    current["user"] = u


def setup():
    run(server.db.users.insert_many([dict(u) for u in (ANA, BEN, CAL)]))
    run(server.db.squads.insert_one({"squad_id": "sq_x", "name": "Crew X", "owner_id": "u_ana", "members": ["u_ana", "u_ben", "u_cal"]}))


def test_published_odds_match_the_rolls():
    odds = {o["kind"]: o["pct"] for o in gx.surprise_odds()}
    assert sum(odds.values()) == 100 and odds["none"] == 80
    assert "rare_look" not in odds, "a free roll never gives away a paid team look"
    rolls = Counter(gx.roll_surprise(f"s{i}") for i in range(20000))
    assert abs(rolls[None] / 20000 - 0.80) < 0.02 and abs(rolls["legend_tip"] / 20000 - 0.10) < 0.01
    assert all(gx.roll_surprise(f"g{i}", guaranteed=True) for i in range(200)), "guaranteed always gives one"
    assert all(gx.roll_surprise(f"u{i}", guaranteed=True, scored=False) != "deep_scout" for i in range(300))


def test_surprises_wait_for_real_sessions_and_cool_down():
    now = datetime.now(timezone.utc)
    assert not gx.surprise_eligible(1, 60 * 60, None), "never after a first session"
    assert not gx.surprise_eligible(5, 60, None), "one 1-minute round can't roll a surprise"
    assert gx.surprise_eligible(5, 9 * 60, None)
    assert not gx.surprise_eligible(5, 9 * 60, (now - timedelta(hours=10)).isoformat()), "cooldown"
    assert gx.surprise_eligible(5, 9 * 60, (now - timedelta(hours=49)).isoformat())


def test_surprises_are_capped_daily_and_logged():
    run(server.db.sessions.insert_many([{"session_id": f"s_ana{i}", "user_id": "u_ana"} for i in range(4)]))
    got = []
    for i in range(80):
        run(server.db.users.update_one({"user_id": "u_ana"}, {"$set": {"surprise_day": {}}}))
        got.append(run(server.corner_surprise("u_ana", f"seed{i}", round_seconds=9 * 60)))
    real = [g for g in got if g]
    assert len(real) == 1, "the cooldown stops a second surprise straight after the first"
    assert all(g["title"] and g["body"] for g in real)
    as_user(ANA)
    s = client.get("/api/surprises").json()
    assert len(s["recent"]) == 1 and s["daily_cap"] == 1 and s["odds"][0]["kind"] == "legend_tip" and len(s["rules"]) == 3


def test_newcomer_and_short_sessions_get_no_surprise():
    assert all(run(server.corner_surprise("u_cal", f"n{i}", round_seconds=60 * 60)) is None for i in range(60))


def test_guaranteed_surprise_booster():
    run(server.db.users.update_one({"user_id": "u_ben"}, {"$set": {"guaranteed_surprises": 1}}))
    s = run(server.corner_surprise("u_ben", "s0"))  # this seed would normally roll nothing
    assert s is not None and run(server.db.users.find_one({"user_id": "u_ben"}))["guaranteed_surprises"] == 0


def test_crew_votes_a_mission_and_it_locks_on_the_first_counted_session():
    as_user(ANA)
    assert client.post("/api/quests/sq_x/route", json={"route": "nap"}).status_code == 400
    client.post("/api/quests/sq_x/route", json={"route": "sharp"})
    as_user(BEN)
    client.post("/api/quests/sq_x/route", json={"route": "sharp"})
    as_user(CAL)
    client.post("/api/quests/sq_x/route", json={"route": "engine"})
    q = client.get("/api/quests/mine").json()["quests"][0]
    assert q["route"] == "sharp" and not q["locked"] and q["target"] == 6
    assert {r["key"]: r["votes"] for r in q["routes"]} == {"engine": 1, "sharp": 2, "signature": 0}
    out = run(server.advance_squad_quests("u_cal", {"trusted": False, "jab": 9}))
    assert out[0]["counted"] is False, "a self-logged session can't prove a jab"
    out = run(server.advance_squad_quests("u_cal", {"trusted": True, "jab": 6}))
    assert out[0]["counted"] is False
    out = run(server.advance_squad_quests("u_cal", {"trusted": True, "jab": 7.5}))
    assert out[0]["counted"] and out[0]["progress"] == 1
    assert client.post("/api/quests/sq_x/route", json={"route": "engine"}).status_code == 400, "locked once under way"


def test_signature_combo_nominate_vote_and_drill():
    run(server.db.squad_quests.delete_many({}))
    as_user(ANA)
    client.post("/api/quests/sq_x/route", json={"route": "signature"})
    assert client.post("/api/quests/sq_x/signature/drill").status_code == 400
    assert client.post("/api/quests/sq_x/signature/nominate", json={"combo_id": "nope"}).status_code == 404
    c = client.post("/api/combos", json={"name": "Crew special", "moves": ["1", "2", "3"]}).json()
    client.post("/api/quests/sq_x/signature/nominate", json={"combo_id": c["combo_id"]})
    for u in (ANA, BEN):
        as_user(u)
        client.post("/api/quests/sq_x/signature/vote", json={"nominee": "u_ana"})
    q = client.get("/api/quests/mine").json()["quests"][0]
    assert q["signature"] == "1-2-3" and q["nominations"][0]["votes"] == 2 and q["my_signature_vote"] == "u_ana"
    out = run(server.advance_squad_quests("u_ben", {"trusted": True, "combo": None}))
    assert out[0]["counted"] is False, "only sessions drilling the crew combo count"
    assert client.post("/api/quests/sq_x/signature/drill").json()["active"]["label"] == "1-2-3"
    combo = run(server.db.users.find_one({"user_id": "u_ben"}))["active_combo"]["label"]
    out = run(server.advance_squad_quests("u_ben", {"trusted": True, "combo": combo}))
    assert out[0]["counted"] and out[0]["route"] == "signature"


def test_treasure_can_bring_a_surprise():
    run(server.db.follows.insert_one({"follower_id": "u_cal", "following_id": "u_ana"}))
    as_user(CAL)
    r = client.post("/api/treasures", json={"recipient_id": "u_ana", "kind": "respect"}).json()
    assert "surprise" in r


if __name__ == "__main__":
    setup()
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"\n{len(tests)} passed")
