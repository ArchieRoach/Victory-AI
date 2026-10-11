"""Self-check for the fighter journey: style quiz, then vs now, Fight Story, combos and
gym season hours, against an in-memory Mongo:

    MONGO_URL=x DB_NAME=t python3 backend/test_fighter_journey.py
"""
import asyncio

from fastapi.testclient import TestClient
from mongomock_motor import AsyncMongoMockClient

import server

server.db = AsyncMongoMockClient()["test"]


async def no_push(*a, **k):
    return None


async def not_flagged(text):
    return "badword" in text

server._send_push = no_push
server.is_content_flagged = not_flagged
current = {}
server.app.dependency_overrides[server.get_current_user] = lambda: current["user"]
client = TestClient(server.app)
ALI = {"user_id": "u_ali", "name": "Ali Khan", "birth_date": "2000-01-01",
       "training_partner": {"name": "Dee", "partner_id": "p1", "focus_areas": ["Guard Position"]}}


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def setup():
    run(server.db.users.insert_one(dict(ALI)))
    current["user"] = ALI


def test_style_quiz_result_becomes_the_training_focus():
    assert client.put("/api/users/me/style", json={"style": "nonsense"}).status_code == 400
    r = client.put("/api/users/me/style", json={"style": "counter"})
    assert r.status_code == 200 and r.json()["name"] == "Counter Puncher"
    u = run(server.db.users.find_one({"user_id": "u_ali"}))
    assert u["fighter_style"] == "counter" and u["training_partner"]["focus_areas"] == ["Slip", "Parry", "Punch Accuracy"]
    assert server.safe_user(u)["fighter_style"] == "Counter Puncher"
    client.put("/api/users/me/style", json={"style": "power", "train_it": False})
    u = run(server.db.users.find_one({"user_id": "u_ali"}))
    assert u["fighter_style"] == "power" and u["training_partner"]["focus_areas"] == ["Slip", "Parry", "Punch Accuracy"]


def _session(date_, overall, dims, video=None, created=None):
    return {"user_id": "u_ali", "scored": True, "date": date_, "created_at": created or f"{date_}T10:00:00",
            "overall_score": overall,
            "dimension_scores": [{"dimension_name": k, "score": v} for k, v in dims.items()],
            "rounds": [{"video_url": video, "analysis": {"dimension_scores": [{"dimension_name": k, "score": v} for k, v in dims.items()]}}] if video else []}


def test_then_vs_now_waits_for_real_history_then_tells_the_truth():
    assert client.get("/api/users/me/then-vs-now").json() == {"ready": False, "scored_sessions": 0, "needed": 2}
    run(server.db.sessions.insert_one(_session("2026-09-01", 5.0, {"Jab": 5, "Footwork": 6, "Slip": 4}, "https://res.cloudinary.com/x/first.mp4")))
    run(server.db.sessions.insert_one(_session("2026-09-03", 5.5, {"Jab": 6})))
    r = client.get("/api/users/me/then-vs-now").json()
    assert not r["ready"] and r["days_until"] == 5
    run(server.db.sessions.insert_one(_session("2026-10-10", 6.8, {"Jab": 8, "Footwork": 5, "Slip": 6, "Roll": 7}, "https://res.cloudinary.com/x/latest.mp4")))
    r = client.get("/api/users/me/then-vs-now").json()
    assert r["ready"] and r["days"] == 39 and r["overall_change"] == 1.8 and r["sessions_between"] == 1
    assert [g["dimension"] for g in r["biggest_gains"]] == ["Jab", "Slip"]
    assert r["slipped"] == [{"dimension": "Footwork", "then": 6, "now": 5, "change": -1}], "drops are shown, not hidden"
    assert "Roll" not in [c["dimension"] for c in r["changes"]], "only dimensions scored both times"
    assert r["then"]["video"].endswith("first.mp4") and r["now"]["video"].endswith("latest.mp4")


def test_fight_story_and_self_reported_history():
    assert client.put("/api/users/me/history", json={"years_boxing": 99}).status_code == 422
    r = client.put("/api/users/me/history", json={"years_boxing": 4, "sessions_per_week": 3})
    assert r.status_code == 200 and r.json()["self_reported"]
    run(server.db.users.update_one({"user_id": "u_ali"}, {"$set": {"verified_seconds": 12 * 3600, "status_points": 300,
                                                                  "personal_bests": {"Jab": 8}}}))
    story = client.get("/api/users/me/fight-story").json()
    assert story["name"] == "Ali Khan" and story["style"] == "Power Puncher" and story["since"] == "2026-09-01"
    assert story["prior_experience"]["years_boxing"] == 4 and story["prior_experience"]["self_reported"]
    assert story["mastery"]["verified_hours"] == 12.0, "imported years never become verified hours"
    assert story["sessions"]["total"] == 3 and story["level"] == 3 and story["personal_bests"] == {"Jab": 8}
    assert story["history"][0] == {"date": "2026-09-01", "overall": 5.0, "ai_scored": True}


def test_combo_builder_sets_the_weeks_focus_and_the_ai_watches_for_it():
    assert client.post("/api/combos", json={"moves": ["slip", "roll"]}).json()["detail"] == "Add at least one punch"
    assert client.post("/api/combos", json={"moves": ["1"]}).status_code == 400
    assert client.post("/api/combos", json={"moves": ["1", "kick"]}).status_code == 400
    assert client.post("/api/combos", json={"name": "badword", "moves": ["1", "2"]}).status_code == 400
    c = client.post("/api/combos", json={"name": "Bread and butter", "moves": ["1", "2", "slip", "2"]}).json()
    assert c["label"] == "1-2-slip-2" and c["focus"] == ["Jab", "Cross", "Slip", "Combination Flow"]
    r = client.post(f"/api/combos/{c['combo_id']}/focus").json()
    assert "Dee will watch for Bread and butter" in r["line"]
    u = run(server.db.users.find_one({"user_id": "u_ali"}))
    assert u["active_combo"]["label"] == "1-2-slip-2" and u["training_partner"]["focus_areas"] == c["focus"]
    prompt = server.video_analysis_prompt(1, "Dee", "calm", c["focus"], u["active_combo"]["label"])
    assert "drilling their own combination: 1-2-slip-2" in prompt
    assert "drilling" not in server.video_analysis_prompt(1, "Dee", "calm", [])
    listed = client.get("/api/combos").json()
    assert listed["active"]["combo_id"] == c["combo_id"] and listed["moves"]["3"] == "Lead hook"
    client.delete(f"/api/combos/{c['combo_id']}")
    u = run(server.db.users.find_one({"user_id": "u_ali"}))
    assert u["combos"] == [] and "active_combo" not in u


if __name__ == "__main__":
    setup()
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"\n{len(tests)} passed")
