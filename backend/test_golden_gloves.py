"""Self-check for the Golden Gloves chase, verified hours and gifted gloves against an
in-memory Mongo:

    MONGO_URL=x DB_NAME=t python3 backend/test_golden_gloves.py
"""
import asyncio
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from fastapi.testclient import TestClient
from mongomock_motor import AsyncMongoMockClient

import gamification as gx
import server

server.db = AsyncMongoMockClient()["test"]
pushes, sessions = [], {}


async def fake_push(user_id, title, body, url="/live", tag=None):
    pushes.append((user_id, title))


def fake_create(**kw):
    sid = f"cs_{len(sessions) + 1}"
    sessions[sid] = SimpleNamespace(id=sid, url=f"https://checkout/{sid}", metadata=kw["metadata"], payment_status="paid", kw=kw)
    return sessions[sid]


server._send_push = fake_push
server.stripe_lib.checkout.Session.create = staticmethod(fake_create)
server.stripe_lib.checkout.Session.retrieve = staticmethod(lambda sid: sessions[sid])
current = {}
server.app.dependency_overrides[server.get_current_user] = lambda: current["user"]
client = TestClient(server.app)
ADULT, KID = "1995-01-01", "2012-01-01"
ALI = {"user_id": "u_ali", "name": "Ali", "birth_date": ADULT, "email": "ali@example.com"}
BEA = {"user_id": "u_bea", "name": "Bea", "birth_date": ADULT}
CHAMP = {"user_id": "u_champ", "name": "Champ", "birth_date": ADULT, "competition_wins": 2}
KIDCHAMP = {"user_id": "u_kid", "name": "Kid", "birth_date": KID, "competition_wins": 3, "gym_id": "g1"}
NOBODY = {"user_id": "u_nobody", "name": "New", "birth_date": ADULT}
TODAY = datetime.now(timezone.utc).date()


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def season_starting(days_ago: int):
    start = TODAY - timedelta(days=days_ago)
    end = start + timedelta(days=42)
    return lambda today=None: {"season_id": "S9", "number": 9, "starts": start.isoformat(),
                               "ends": end.isoformat(), "days_left": (end - TODAY).days}


def scored(seconds):
    return {"seconds": seconds, "analysis": {"dimension_scores": [{"dimension_name": f"d{i}", "score": 7} for i in range(3)]}}


def test_lifetime_hours_count_even_before_a_pledge():
    server.current_season = season_starting(3)
    run(server.db.users.insert_many([dict(u) for u in (ALI, BEA, CHAMP, KIDCHAMP, NOBODY)]))
    out = run(server.award_verified_time("u_ali", round_seconds=[180, 180]))
    assert out["seconds"] == 360 and out["gloves"] == "not_pledged"
    assert run(server.db.users.find_one({"user_id": "u_ali"}))["verified_seconds"] == 360


def test_pledge_needs_every_promise_and_an_open_window():
    current["user"] = ALI
    assert client.post("/api/gloves/pledge", json={"promises": [True, False]}).status_code == 400
    r = client.post("/api/gloves/pledge", json={"promises": [True, True]})
    assert r.status_code == 200 and r.json()["pledged"] and r.json()["chasers"] == 1
    assert client.post("/api/gloves/pledge", json={"promises": [True, True]}).status_code == 200
    assert run(server.db.proof_stats.count_documents({"user_id": "u_ali"})) == 1, "pledging twice is harmless"
    server.current_season = season_starting(20)
    current["user"] = BEA
    r = client.post("/api/gloves/pledge", json={"promises": [True, True]})
    assert r.status_code == 400 and "closed" in r.json()["detail"]
    server.current_season = season_starting(3)


def test_the_daily_cap_covers_the_whole_day():
    out = run(server.award_verified_time("u_ali", round_seconds=[300] * 20))
    assert out["seconds"] == gx.VERIFIED_SECONDS_PER_DAY - 360 and out["capped_minutes"] > 0
    out = run(server.award_verified_time("u_ali", round_seconds=[180]))
    assert not out["counted"] and out["reason"] == "daily_cap"
    current["user"] = ALI
    v = client.get("/api/gloves").json()
    assert v["minutes_left_today"] == 0 and v["verified_hours"] == 1.4
    assert v["mastery"]["tier"] == "First Hour"


def test_self_logged_sessions_never_count():
    session = {"session_id": "s1", "overall_score": 9, "dimension_scores": [], "rounds": [scored(180)]}
    rewards = run(server.apply_session_rewards(ALI, session, trusted_scores=False))
    assert rewards["gloves"] == {"counted": False, "reason": "unverified", "seconds": 0}


def test_twenty_proven_hours_win_the_gloves_once():
    target = gx.GLOVES_TARGET_HOURS * 3600
    run(server.db.proof_stats.update_one({"user_id": "u_ali", "season_id": "S9"}, {"$set": {"seconds": target - 600}}))
    closes = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    comp = {"comp_id": "c1", "challenger_id": "u_ali", "status": "open", "voting_closes_at": closes, "vote_count": 3, "avg_score": 8}
    run(server.db.competitions.insert_one(dict(comp)))
    assert run(server._close_competition_if_due(comp)) == "u_ali"
    ali = run(server.db.users.find_one({"user_id": "u_ali"}))
    assert [g["name"] for g in ali["gloves"]] == ["Season 9 Golden Gloves"]
    run(server.award_verified_time("u_ali", comp_win=True))
    assert len(run(server.db.users.find_one({"user_id": "u_ali"}))["gloves"]) == 1


def test_gifts_only_go_to_acclaimed_fighters_and_stay_marked_as_gifted():
    current["user"] = BEA
    r = client.post("/api/gloves/gift/checkout", json={"recipient_id": "u_nobody"})
    assert r.status_code == 400 and "acclaimed" in r.json()["detail"]
    assert client.post("/api/gloves/gift/checkout", json={"recipient_id": "u_bea"}).status_code == 400
    r = client.post("/api/gloves/gift/checkout", json={"recipient_id": "u_ali"})
    assert r.status_code == 400 and "already earned" in r.json()["detail"]
    r = client.post("/api/gloves/gift/checkout", json={"recipient_id": "u_kid"})
    assert r.status_code == 400 and "gym or squad" in r.json()["detail"], "strangers can't buy gifts for under-18s"

    r = client.post("/api/gloves/gift/checkout", json={"recipient_id": "u_champ"})
    assert r.status_code == 200 and r.json()["price_gbp"] == 5.0
    sid = r.json()["checkout_url"].rsplit("/", 1)[1]
    assert sessions[sid].kw["line_items"][0]["price_data"]["unit_amount"] == 500
    assert client.get("/api/gloves/gift/confirm", params={"session_id": sid}).json() == {"paid": True}
    run(server._grant_gloves_gift(sid, sessions[sid].metadata))  # the webhook arriving too
    champ = run(server.db.users.find_one({"user_id": "u_champ"}))
    assert champ["gifted_gloves"] == {"S9": 1} and "gloves" not in champ, "a gift is never an earned pair"
    assert champ.get("verified_seconds", 0) == 0 and champ.get("status_points", 0) == 0
    current["user"] = ALI
    assert client.get("/api/gloves/gift/confirm", params={"session_id": sid}).status_code == 404, "only the buyer can confirm"
    shelf = client.get("/api/users/u_champ/trophy-shelf").json()
    assert shelf["gifted_gloves"] == [{"season_id": "S9", "count": 1, "name": "Season 9 Golden Gloves"}]
    assert shelf["gloves"] == [] and shelf["can_gift_gloves"]

    run(server.db.users.update_one({"user_id": "u_bea"}, {"$set": {"gym_id": "g1"}}))
    current["user"] = dict(BEA, gym_id="g1")
    assert client.post("/api/gloves/gift/checkout", json={"recipient_id": "u_kid"}).status_code == 200


if __name__ == "__main__":
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"\n{len(tests)} passed")
