"""Self-check for the Golden Gloves chase against an in-memory Mongo:

    MONGO_URL=x DB_NAME=t python3 backend/test_golden_gloves.py
"""
import asyncio
from datetime import date, datetime, timedelta, timezone

from fastapi.testclient import TestClient
from mongomock_motor import AsyncMongoMockClient

import gamification as gx
import server

server.db = AsyncMongoMockClient()["test"]
pushes = []


async def fake_push(user_id, title, body, url="/live", tag=None):
    pushes.append((user_id, title))

server._send_push = fake_push
current = {}
server.app.dependency_overrides[server.get_current_user] = lambda: current["user"]
client = TestClient(server.app)
ALI = {"user_id": "u_ali", "name": "Ali"}
BEA = {"user_id": "u_bea", "name": "Bea"}
TODAY = datetime.now(timezone.utc).date()


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def season_starting(days_ago: int):
    start = TODAY - timedelta(days=days_ago)
    end = start + timedelta(days=42)
    return lambda today=None: {"season_id": "S9", "number": 9, "starts": start.isoformat(),
                               "ends": end.isoformat(), "days_left": (end - TODAY).days}


def scored(*scores):
    return {"analysis": {"dimension_scores": [{"dimension_name": f"d{i}", "score": v} for i, v in enumerate(scores)]}}


def test_no_pledge_no_proof():
    server.current_season = season_starting(3)
    run(server.db.users.insert_many([dict(ALI), dict(BEA)]))
    out = run(server.award_proof("u_ali", round_scores=[8.0, 8.0]))
    assert out == {"counted": False, "reason": "not_pledged", "proof_earned": 0}


def test_pledge_needs_every_promise_and_an_open_window():
    current["user"] = ALI
    assert client.post("/api/gloves/pledge", json={"promises": [True, False]}).status_code == 400
    r = client.post("/api/gloves/pledge", json={"promises": [True, True]})
    assert r.status_code == 200 and r.json()["pledged"] and r.json()["chasers"] == 1
    assert client.post("/api/gloves/pledge", json={"promises": [True, True]}).status_code == 200, "pledging twice is harmless"
    assert run(server.db.proof_stats.count_documents({"user_id": "u_ali"})) == 1
    server.current_season = season_starting(20)
    current["user"] = BEA
    r = client.post("/api/gloves/pledge", json={"promises": [True, True]})
    assert r.status_code == 400 and "closed" in r.json()["detail"]
    server.current_season = season_starting(3)


def test_verified_rounds_earn_up_to_the_daily_cap():
    out = run(server.award_proof("u_ali", round_scores=[8.0] * 10))
    assert out["proof_earned"] == 80 and out["over_cap"] == 0
    out = run(server.award_proof("u_ali", round_scores=[6.0] * 5))
    assert out["proof_earned"] == 10 and out["over_cap"] == 3
    out = run(server.award_proof("u_ali", round_scores=[9.0]))
    assert not out["counted"] and out["reason"] == "daily_cap"
    current["user"] = ALI
    v = client.get("/api/gloves").json()
    assert v["proof"] == 90 and v["verified_rounds"] == 12 and v["rounds_left_today"] == 0


def test_self_logged_sessions_never_count():
    session = {"session_id": "s1", "overall_score": 9, "dimension_scores": [], "rounds": [scored(9, 9, 9)]}
    rewards = run(server.apply_session_rewards(ALI, session, trusted_scores=False))
    assert rewards["gloves"] == {"counted": False, "reason": "unverified", "proof_earned": 0}


def test_crowd_judged_wins_count_and_the_gloves_are_awarded_once():
    run(server.db.proof_stats.update_one({"user_id": "u_ali", "season_id": "S9"}, {"$set": {"proof": gx.GLOVES_TARGET - 30}}))
    closes = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    comp = {"comp_id": "c1", "challenger_id": "u_ali", "status": "open", "voting_closes_at": closes, "vote_count": 3, "avg_score": 8}
    run(server.db.competitions.insert_one(dict(comp)))
    assert run(server._close_competition_if_due(comp)) == "u_ali"
    ali = run(server.db.users.find_one({"user_id": "u_ali"}))
    assert [g["name"] for g in ali["gloves"]] == ["Season 9 Golden Gloves"]
    assert any("Golden Gloves" in t for _, t in pushes)
    run(server.award_proof("u_ali", comp_win=True))
    assert len(run(server.db.users.find_one({"user_id": "u_ali"}))["gloves"]) == 1
    current["user"] = BEA
    v = client.get("/api/gloves").json()
    assert v["holders"] == 1 and v["chasers"] == 1 and not v["pledged"] and v["window"]["open"]
    shelf = client.get("/api/users/u_ali/trophy-shelf").json()
    assert shelf["gloves"][0]["season_id"] == "S9"


if __name__ == "__main__":
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"\n{len(tests)} passed")
