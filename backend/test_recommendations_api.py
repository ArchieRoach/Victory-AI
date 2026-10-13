"""Self-check for unlocks, Easter eggs, boss votes, crew cheers, tips, the gym season story
and the Octalysis metrics against an in-memory Mongo:

    MONGO_URL=x DB_NAME=t python3 backend/test_recommendations_api.py
"""
import asyncio
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from mongomock_motor import AsyncMongoMockClient

import gamification as gx
import server

server.db = AsyncMongoMockClient()["test"]
pushes = []


async def fake_push(user_id, title, body, url="/live", tag=None):
    pushes.append((user_id, title))


async def flagged(text):
    return "badword" in text


async def admin_check(user):
    return user.get("user_id") == "u_boss"

server._send_push = fake_push
server.is_content_flagged = flagged
server.is_admin = admin_check
current = {}
server.app.dependency_overrides[server.get_current_user] = lambda: current["user"]
client = TestClient(server.app)
TODAY = datetime.now(timezone.utc).strftime("%Y-%m-%d")

NEW = {"user_id": "u_new", "name": "Nia New", "birth_date": "2011-03-01", "gym_id": "gym_1", "created_at": datetime.now(timezone.utc).isoformat()}
VET = {"user_id": "u_vet", "name": "Vic Veteran", "birth_date": "1999-01-01", "gym_id": "gym_1", "status_points": 900,
       "created_at": "2026-01-01T00:00:00"}
MATE = {"user_id": "u_mate", "name": "Max Mate", "birth_date": "2000-01-01"}
OWNER = {"user_id": "u_boss", "name": "Admin Person", "birth_date": "1990-01-01"}


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def as_user(u):
    current["user"] = u


def setup():
    run(server.db.users.insert_many([dict(u) for u in (NEW, VET, MATE, OWNER)]))
    run(server.db.squads.insert_one({"squad_id": "sq_1", "name": "Crew", "owner_id": "u_vet", "members": ["u_vet", "u_mate", "u_new"]}))
    run(server.db.gyms.insert_one({"gym_id": "gym_1", "name": "Iron Gym", "owner_id": "u_vet", "is_public": True,
                                   "members": ["u_vet", "u_new"]}))
    run(server.db.sessions.insert_many([{"session_id": f"old{i}", "user_id": "u_vet", "date": "2026-09-01"} for i in range(12)]))


def finish_session(user, live=None, rounds=1):
    as_user(user)
    sid = client.post("/api/training/start", json={"total_rounds": rounds, "round_duration": 120}).json()["session_id"]
    if live:
        client.post(f"/api/training/{sid}/live-round", json={"round_number": 1, **live})
    return client.post(f"/api/training/{sid}/complete",
                       json={"calls": {"calls": 10, "checked": 10, "landed": 7, "level": 2, "peak": 2}}).json()


def test_a_new_fighter_unlocks_features_one_session_at_a_time():
    as_user(NEW)
    u = client.get("/api/unlocks").json()
    assert u["unlocked"] == [] and u["newcomer"] and u["next"]["key"] == "week_plan"
    first = finish_session(NEW, live={"punches": 100, "guard_pct": 70})
    r = first["rewards"]
    assert [f["key"] for f in r["unlocked_features"]] == ["week_plan"] and r["newcomer"] and r["sessions_total"] == 1
    assert r["easter_eggs"]["new"][0]["key"] == "century" and r["easter_eggs"]["total"] == 5
    assert first["calls"]["landed"] == 7, "the flow metric is stored with the session"
    second = finish_session(NEW)["rewards"]
    assert {f["key"] for f in second["unlocked_features"]} == {"combo_calls", "crew"}
    assert second["easter_eggs"] is None, "an egg is only found once"
    as_user(NEW)
    shelf = client.get("/api/users/u_new/trophy-shelf").json()
    assert shelf["eggs"]["total"] == 5 and [e["key"] for e in shelf["eggs"]["found"]] == ["century"]


def test_bad_call_summaries_are_ignored():
    as_user(MATE)
    sid = client.post("/api/training/start", json={"total_rounds": 1}).json()["session_id"]
    r = client.post(f"/api/training/{sid}/complete", json={"calls": {"calls": 2, "checked": 5, "landed": 9}}).json()
    assert "calls" not in r
    sid = client.post("/api/training/start", json={"total_rounds": 1}).json()["session_id"]
    assert client.post(f"/api/training/{sid}/complete").status_code == 200, "older apps send no body"


def test_boss_vote_sets_next_weeks_boss():
    as_user(VET)
    v = client.get("/api/boss/vote").json()
    assert v["week_id"] == gx.next_week_id() and len(v["options"]) == 4 and v["my_vote"] is None
    assert client.post("/api/boss/vote", json={"key": "nope"}).status_code == 400
    client.post("/api/boss/vote", json={"key": "storm"})
    v = client.post("/api/boss/vote", json={"key": "ghost"}).json()
    assert v["my_vote"] == "ghost" and v["leading"] == "ghost"
    assert next(o for o in v["options"] if o["key"] == "ghost")["votes"] == 1
    assert run(server.boss_key_for(gx.next_week_id())) == "ghost"


def test_crew_cheer_is_one_tap_for_crew_mates_who_trained_today():
    pushes.clear()
    as_user(VET)
    mates = client.get("/api/crew/today").json()["mates"]
    assert {m["user_id"] for m in mates} == {"u_new", "u_mate"} and not any(m["cheered"] for m in mates)
    assert client.post("/api/crew/cheer/u_boss").status_code == 403
    assert client.post("/api/crew/cheer/u_new").json()["ok"]
    assert client.post("/api/crew/cheer/u_new").status_code == 400
    assert pushes == [("u_new", "Vic cheered your session")]
    assert next(m for m in client.get("/api/crew/today").json()["mates"] if m["user_id"] == "u_new")["cheered"]
    as_user(MATE)
    assert client.post("/api/crew/cheer/u_vet").status_code == 400, "only people who trained today"


def test_tips_need_experience_are_moderated_anonymous_and_hidable():
    as_user(NEW)
    assert client.post("/api/tips", json={"text": "Keep your hands up always"}).status_code == 403
    as_user(VET)
    assert client.post("/api/tips", json={"text": "badword badword badword"}).status_code == 400
    assert client.post("/api/tips", json={"text": "Message me on www.example.com"}).status_code == 400
    tip = client.post("/api/tips", json={"text": "Breathe out   on every punch, it keeps you relaxed."}).json()
    assert tip["text"] == "Breathe out on every punch, it keeps you relaxed."
    assert client.post("/api/tips", json={"text": "Another tip so soon after"}).status_code == 400
    as_user(NEW)
    got = client.get("/api/tips/for-me").json()["tip"]
    assert got["from"] == f"A level {gx.level_for(900)} fighter at your gym" and "Vic" not in str(got)
    client.post(f"/api/tips/{got['tip_id']}/helpful")
    client.post(f"/api/tips/{got['tip_id']}/helpful")
    as_user(VET)
    mine = client.get("/api/tips/mine").json()
    assert mine["helped"] == 1 and mine["can_give"]
    for u in (NEW, MATE):
        as_user(u)
        client.post(f"/api/tips/{got['tip_id']}/report")
        client.post(f"/api/tips/{got['tip_id']}/report")
    as_user(NEW)
    assert client.get("/api/tips/for-me").json()["tip"] is None


def test_gym_season_story_after_a_season_ends():
    as_user(VET)
    assert client.get("/api/gyms/gym_1/season-story").json() == {"ready": False}
    run(server.db.users.update_one({"user_id": "u_vet"}, {"$set": {"season_verified.S1": 7200, "season_gym_bonus.S1": 3600}}))
    run(server.db.users.update_one({"user_id": "u_new"}, {"$set": {"season_verified.S1": 1800}}))
    real = server.current_season
    server.current_season = lambda today=None: {**real(today), "number": 2, "season_id": "S2"}
    try:
        story = client.get("/api/gyms/gym_1/season-story").json()
    finally:
        server.current_season = real
    assert story["ready"] and story["season"] == 1 and story["hours"] == gx.hours(12600) and story["rank"] == 1
    assert story["rounds"] == 70 and story["fighters"] == 2 and story["carried_by"][0]["name"] == "Vic"
    as_user(MATE)
    assert client.get("/api/gyms/gym_1/season-story").status_code == 404


def test_octalysis_metrics_are_admin_only_and_include_the_flow_zone():
    async def signed_in(request):
        return current["user"]
    server.get_current_user = signed_in  # the endpoint also accepts a metrics token, so it checks sign-in itself
    as_user(VET)
    assert client.get("/api/admin/octalysis-metrics").status_code == 403
    as_user(OWNER)
    m = client.get("/api/admin/octalysis-metrics").json()
    assert m["wat"]["this_week"] >= 2 and m["experience"]["flow_zone_pct"] == 100.0
    assert m["social"]["crew_cheers_7d"] == 1 and "guardrails" in m


def test_onboarding_no_longer_needs_a_favourite_counter():
    as_user(MATE)
    r = client.post("/api/onboarding/submit", json={"birth_date": "2000-01-01", "biggest_frustration": "footwork",
                                                     "experience_level": "complete_beginner"})
    assert r.status_code == 200


if __name__ == "__main__":
    setup()
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"\n{len(tests)} passed")
