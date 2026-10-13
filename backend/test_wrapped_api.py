"""Self-check for the coming-up strip, Season Wrapped, the Oracle, Coach's Eye, beginner's luck
and the crew feed against an in-memory Mongo:

    MONGO_URL=x DB_NAME=t python3 backend/test_wrapped_api.py
"""
import asyncio
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from mongomock_motor import AsyncMongoMockClient

import gamification as gx
import server

server.db = AsyncMongoMockClient()["test"]


async def fake_push(*a, **k):
    return None

server._send_push = fake_push
current = {}
server.app.dependency_overrides[server.get_current_user] = lambda: current["user"]
client = TestClient(server.app)

ANA = {"user_id": "u_ana", "name": "Ana Lopez", "birth_date": "2000-01-01", "created_at": "2026-09-01T00:00:00",
       "training_partner": {"name": "Dee"}}
BEN = {"user_id": "u_ben", "name": "Ben Ode", "birth_date": "2001-01-01"}
OUT = {"user_id": "u_out", "name": "Out Sider", "birth_date": "2001-01-01"}


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def as_user(u):
    current["user"] = u


def setup():
    run(server.db.users.insert_many([dict(u) for u in (ANA, BEN, OUT)]))
    run(server.db.squads.insert_one({"squad_id": "sq1", "name": "Night Crew", "owner_id": "u_ana", "members": ["u_ana", "u_ben"]}))


def scored(dims, **kw):
    return {"scored": True, "dimension_scores": [{"dimension_name": k, "score": v} for k, v in dims.items()], **kw}


def test_coming_up_lists_real_next_things():
    as_user(ANA)
    items = client.get("/api/coming-up").json()["items"]
    assert items and items[0]["kind"] == "unlock" and len(items) <= gx.PARADE_MAX
    assert all(i["title"] and i["when"] for i in items)


def test_beginners_luck_names_the_strongest_scored_area_only():
    as_user(BEN)
    run(server.db.sessions.insert_one({"user_id": "u_ben", "session_id": "b1", "date": "2026-10-01"}))
    out = run(server.after_session_extras(BEN, scored({"Jab": 7, "Footwork": 5}, session_id="b1"), []))
    assert out["strongest"] == {"dimension": "Jab", "score": 7}
    manual = run(server.after_session_extras(BEN, scored({"Jab": 9}, source="manual"), []))
    assert "strongest" not in manual, "self-scored rounds don't count as the AI's praise"


def test_oracle_predicts_from_a_rising_trend_and_pays_when_proved():
    base = datetime(2026, 9, 1, tzinfo=timezone.utc)
    run(server.db.sessions.insert_many([{**scored({"Jab": v}), "user_id": "u_ana", "session_id": f"o{i}",
                                         "date": (base + timedelta(days=i)).date().isoformat(),
                                         "created_at": (base + timedelta(days=i)).isoformat()}
                                        for i, v in enumerate([7.4, 7.6, 7.8, 7.95])]))
    as_user(ANA)
    p = client.get("/api/oracle").json()["prediction"]
    assert p["dimension"] == "Jab" and p["target"] == 8 and p["status"] == "open" and p["line"].startswith("Dee:")
    assert client.get("/api/oracle").json()["prediction"]["made_at"] == p["made_at"], "one prediction at a time"
    miss = run(server.after_session_extras(ANA, scored({"Jab": 7.9}), []))
    assert miss["oracle"] is None
    before = run(server.db.users.find_one({"user_id": "u_ana"})).get("status_points", 0)
    hit = run(server.after_session_extras(ANA, scored({"Jab": 8.2}), []))
    assert hit["oracle"]["line"] == "Dee: called it. Your jab hit 8.2. You proved me right."
    assert run(server.db.users.find_one({"user_id": "u_ana"}))["status_points"] - before == gx.ORACLE_STATUS
    assert run(server.after_session_extras(ANA, scored({"Jab": 8.5}), []))["oracle"] is None, "paid once"


def test_coach_eye_booster_gives_one_full_report():
    run(server.db.users.update_one({"user_id": "u_ana"}, {"$set": {"booster_picks": 1}}))
    as_user(ANA)
    assert client.post("/api/boosters/pick", json={"choice": "coach_eye"}).json()["picked"] == "coach_eye"
    first = run(server.after_session_extras(ANA, scored({"Jab": 8, "Footwork": 6}), []))
    assert [r["dimension"] for r in first["coach_eye"]] == ["Footwork", "Jab"]
    assert "coach_eye" not in run(server.after_session_extras(ANA, scored({"Jab": 8}), []))


def test_crew_feed_is_real_moments_with_stamps_only():
    run(server.post_crew_moments(ANA, {"boss": {"beaten": True, "name": "The Wall"}}))
    run(server.post_crew_moments(ANA, {}))
    run(server.post_crew_moments(ANA, {}))
    as_user(BEN)
    feed = client.get("/api/squads/sq1/feed").json()
    texts = [e["text"] for e in feed["events"]]
    assert "Ana beat The Wall" in texts and texts.count("Ana trained today") == 1
    ev = feed["events"][0]["event_id"]
    assert client.post(f"/api/squads/feed/{ev}/stamp", json={"stamp": "lol"}).status_code == 400
    client.post(f"/api/squads/feed/{ev}/stamp", json={"stamp": "fire"})
    e = next(x for x in client.get("/api/squads/sq1/feed").json()["events"] if x["event_id"] == ev)
    assert e["stamps"]["fire"] == 1 and e["mine"] == "fire"
    client.post(f"/api/squads/feed/{ev}/stamp", json={"stamp": None})
    assert next(x for x in client.get("/api/squads/sq1/feed").json()["events"] if x["event_id"] == ev)["mine"] is None
    as_user(OUT)
    assert client.get("/api/squads/sq1/feed").status_code == 404
    assert client.post(f"/api/squads/feed/{ev}/stamp", json={"stamp": "fire"}).status_code == 404


def test_season_wrapped_tells_last_seasons_story():
    as_user(ANA)
    assert client.get("/api/users/me/season-wrapped").json()["ready"] is False
    s1 = server.season_by_number(1)
    start = datetime.fromisoformat(s1["starts"])
    run(server.db.sessions.insert_many([
        {**scored({"Jab": 6}), "user_id": "u_ana", "session_id": "w1", "date": (start + timedelta(days=1)).isoformat(),
         "created_at": (start + timedelta(days=1)).isoformat(), "overall_score": 5.5,
         "reflection": {"enjoyment": 5, "tags": ["sharp"]}},
        {**scored({"Jab": 8}), "user_id": "u_ana", "session_id": "w2", "date": (start + timedelta(days=20)).isoformat(),
         "created_at": (start + timedelta(days=20)).isoformat(), "overall_score": 7.0},
    ]))
    run(server.db.users.update_one({"user_id": "u_ana"}, {"$set": {"identity_traits": {"iron_guard": 4}, "season_verified.S1": 7200}}))
    real = server.current_season
    server.current_season = lambda today=None: {**real(today), "preseason": False, "number": 2, "season_id": "S2"}
    try:
        w = client.get("/api/users/me/season-wrapped").json()
        assert client.get("/api/users/me/season-wrapped", params={"season": 2}).status_code == 400
    finally:
        server.current_season = real
    kinds = [c["kind"] for c in w["cards"]]
    assert w["ready"] and w["name"] == "Season 1" and kinds[0] == "showed_up" and kinds[-1] == "became"
    assert "growth" in kinds and "loved" in kinds
    assert next(c for c in w["cards"] if c["kind"] == "loved")["line"].endswith("made you feel sharp.")
    assert w["cards"][-1]["big"] == "Iron Guard"


if __name__ == "__main__":
    setup()
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"\n{len(tests)} passed")
