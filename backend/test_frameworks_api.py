"""Self-check for your week, freestyle and Boss Rounds, Epic Win, chosen reminders and gym
check-ins against an in-memory Mongo:

    MONGO_URL=x DB_NAME=t python3 backend/test_frameworks_api.py
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
    pushes.append((user_id, title, body, url))


async def flagged(text):
    return "badword" in text

server._send_push = fake_push
server.is_content_flagged = flagged
current = {}
server.app.dependency_overrides[server.get_current_user] = lambda: current["user"]
client = TestClient(server.app)

LONG_AGO = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
ARCHIE = {"user_id": "u_archie", "name": "Archie Roach", "birth_date": "1995-01-01", "created_at": LONG_AGO,
          "gym_id": "gym_1", "training_partner": {"name": "Dee", "focus_areas": ["Footwork", "Guard Position"]}}
KAI = {"user_id": "u_kai", "name": "Kai Young", "birth_date": "2012-01-01",
       "created_at": datetime.now(timezone.utc).isoformat()}
COACH = {"user_id": "u_coach", "name": "Coach Dee", "birth_date": "1980-01-01", "gym_id": "gym_1"}


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def as_user(u):
    current["user"] = u


def setup():
    run(server.db.users.insert_many([dict(u) for u in (ARCHIE, KAI, COACH)]))
    run(server.db.gyms.insert_one({"gym_id": "gym_1", "name": "Iron Gym", "owner_id": "u_coach", "is_public": True,
                                   "members": ["u_coach", "u_archie"]}))


def test_pick_your_week_sets_target_focus_and_the_partner_follows():
    as_user(ARCHIE)
    assert client.get("/api/week-plan").json()["chosen"] is False
    assert client.put("/api/week-plan", json={"target": 5}).status_code == 400
    assert client.put("/api/week-plan", json={"target": 2, "focus": "Nonsense"}).status_code == 400
    w = client.put("/api/week-plan", json={"target": 2, "focus": "Jab"}).json()
    assert w["chosen"] and w["target"] == 2 and w["left"] == 2
    u = run(server.db.users.find_one({"user_id": "u_archie"}))
    assert u["training_partner"]["focus_areas"] == ["Jab", "Footwork", "Guard Position"]
    c = client.get("/api/partner/condition").json()
    assert c["target"] == 2 and c["waiting_after"] == 5


def test_freestyle_counts_as_a_day_but_gives_no_score_or_points():
    as_user(ARCHIE)
    sid = client.post("/api/training/start", json={"kind": "freestyle", "record_video": True, "total_rounds": 2}).json()["session_id"]
    assert run(server.db.training_sessions.find_one({"session_id": sid}))["record_video"] is False
    r = client.post(f"/api/training/{sid}/complete").json()
    assert r["kind"] == "freestyle" and r["overall_score"] is None
    assert r["rewards"]["freestyle"] and "season" not in r["rewards"] and "status" not in r["rewards"]
    assert r["rewards"]["week"]["done"] == 1
    assert not run(server.db.weekly_stats.find_one({"user_id": "u_archie"}))


def test_boss_round_is_one_round_with_limited_tries_and_pays_once():
    as_user(ARCHIE)
    boss = client.get("/api/boss", params={"round_duration": 120}).json()
    assert boss["attempts_left"] == 3 and not boss["beaten"] and boss["key"] in gx.BOSSES
    start = client.post("/api/training/start", json={"kind": "boss", "round_duration": 120, "total_rounds": 3}).json()
    assert start["boss"]["key"] == boss["key"]
    sid = start["session_id"]
    assert run(server.db.training_sessions.find_one({"session_id": sid}))["total_rounds"] == 1
    miss = client.post(f"/api/training/{sid}/complete").json()["rewards"]["boss"]
    assert not miss["beaten"] and "camera" in miss["line"]

    sid = client.post("/api/training/start", json={"kind": "boss", "round_duration": 120}).json()["session_id"]
    big = {"round_number": 1, "punches": 400, "left": 200, "right": 200, "best_combo": 8, "guard_drops": 0,
           "guard_pct": 95, "head_moves": 60}
    client.post(f"/api/training/{sid}/live-round", json=big)
    before = run(server.db.users.find_one({"user_id": "u_archie"})).get("status_points", 0)
    won = client.post(f"/api/training/{sid}/complete").json()["rewards"]
    assert won["boss"]["beaten"] and won["boss"]["status"] == gx.BOSS_STATUS
    after = run(server.db.users.find_one({"user_id": "u_archie"}))["status_points"]
    assert after - before >= gx.BOSS_STATUS
    v = client.get("/api/boss", params={"round_duration": 120}).json()
    assert v["beaten"] and v["attempts_left"] == 1 and v["beaten_total"] == 1
    assert client.post("/api/training/start", json={"kind": "boss", "round_duration": 120}).status_code == 400


def test_epic_win_waits_a_week_is_moderated_and_shows_after_a_real_win():
    as_user(KAI)
    e = client.get("/api/users/me/epic-win").json()
    assert not e["eligible"] and e["days_until"] == 7
    assert client.put("/api/users/me/epic-win", json={"goal": "first_bout"}).status_code == 400
    as_user(ARCHIE)
    assert client.put("/api/users/me/epic-win", json={"custom": "badword stuff"}).status_code == 400
    assert client.put("/api/users/me/epic-win", json={"goal": "nope"}).status_code == 400
    assert client.put("/api/users/me/epic-win", json={"goal": "first_bout", "bad_guys": ["villain"]}).status_code == 400
    e = client.put("/api/users/me/epic-win", json={"goal": "first_bout", "bad_guys": ["tired", "tired", "phone"]}).json()
    assert e["epic"]["text"] == "Have my first bout" and [b["key"] for b in e["epic"]["bad_guys"]] == ["tired", "phone"]
    assert e["epic"]["bad_guys"][0]["move"].startswith("Just one round")

    run(server.db.users.update_one({"user_id": "u_archie"}, {"$set": {"boss_wins": []}}))
    run(server.db.users.update_one({"user_id": "u_archie"}, {"$unset": {"boss_attempts": ""}}))
    sid = client.post("/api/training/start", json={"kind": "boss", "round_duration": 120}).json()["session_id"]
    client.post(f"/api/training/{sid}/live-round", json={"round_number": 1, "punches": 400, "best_combo": 8,
                                                         "guard_pct": 95, "head_moves": 60})
    r = client.post(f"/api/training/{sid}/complete").json()["rewards"]
    assert r["epic_line"] == "That's one step closer to your big win: have my first bout."


def test_reminder_you_choose_is_age_aware_and_sent_once():
    as_user(KAI)
    assert client.put("/api/users/me/reminder", json={"anchor": "custom", "hour": 21}).status_code == 400
    assert client.get("/api/users/me/reminder").json()["last_hour"] == 20
    assert client.put("/api/users/me/reminder", json={"anchor": "custom", "hour": 20}).json()["on"]
    as_user(ARCHIE)
    r = client.put("/api/users/me/reminder", json={"anchor": "after_school", "tz_offset_minutes": 0}).json()
    assert r["on"] and r["hour"] == 16
    run(server.db.sessions.delete_many({"user_id": "u_archie"}))
    pushes.clear()
    tomorrow = datetime.now(timezone.utc).replace(hour=16, minute=0) + timedelta(days=1)
    run(server._send_habit_reminders(tomorrow))
    run(server._send_habit_reminders(tomorrow))
    mine = [p for p in pushes if p[0] == "u_archie"]
    assert len(mine) == 1 and mine[0][3] == "/train?quick=1"
    run(server._send_habit_reminders(tomorrow.replace(hour=17)))
    assert len([p for p in pushes if p[0] == "u_archie"]) == 1
    assert client.put("/api/users/me/reminder", json={"anchor": None}).json()["on"] is False


def test_gym_checkin_poster_is_staff_only_and_doubles_the_team_total_only():
    as_user(ARCHIE)
    assert client.get("/api/gyms/gym_1/checkin-poster").status_code == 403
    as_user(COACH)
    poster = client.get("/api/gyms/gym_1/checkin-poster").json()
    assert poster["url"].endswith(f"/checkin/{poster['code']}")
    assert client.get("/api/gyms/gym_1/checkin-poster").json()["code"] == poster["code"]
    as_user(KAI)
    outsider = client.post("/api/gyms/checkin", json={"code": poster["code"]}).json()
    assert not outsider["checked_in"] and outsider["can_join"]
    as_user(ARCHIE)
    assert client.post("/api/gyms/checkin", json={"code": "wrong-code"}).status_code == 404
    assert client.post("/api/gyms/checkin", json={"code": poster["code"]}).json()["checked_in"]
    run(server.db.users.update_one({"user_id": "u_archie"}, {"$unset": {"verified_today": "", "verified_seconds": "",
                                                                       "season_verified": ""}}))
    out = run(server.award_verified_time("u_archie", round_seconds=[180, 180]))
    assert out["gym_bonus_minutes"] == 6
    u = run(server.db.users.find_one({"user_id": "u_archie"}))
    assert u["verified_seconds"] == 360, "personal hours never get the bonus"
    hours = client.get("/api/gyms/gym_1/season-hours").json()
    assert hours["hours"] == gx.hours(720)
    as_user(COACH)
    fresh = client.post("/api/gyms/gym_1/checkin-poster/new").json()
    assert fresh["code"] != poster["code"]
    as_user(ARCHIE)
    assert client.post("/api/gyms/checkin", json={"code": poster["code"]}).status_code == 404


if __name__ == "__main__":
    setup()
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"\n{len(tests)} passed")
