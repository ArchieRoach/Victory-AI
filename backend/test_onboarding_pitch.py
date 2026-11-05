"""Self-check: onboarding social proof is real, and the goal answer is saved:

    MONGO_URL=x DB_NAME=t python3 backend/test_onboarding_pitch.py
"""
import asyncio

from fastapi.testclient import TestClient
from mongomock_motor import AsyncMongoMockClient

import server

server.db = AsyncMongoMockClient()["test"]
current = {}
server.app.dependency_overrides[server.get_current_user] = lambda: current["user"]
client = TestClient(server.app)


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def test_no_invented_numbers_or_testimonials_before_launch():
    proof = client.get("/api/onboarding/social-proof").json()
    assert proof == {"stats": {}, "testimonials": []}, "small numbers are hidden, never padded"


def test_real_counts_show_once_they_mean_something():
    run(server.db.users.insert_many([{"user_id": f"u{i}", "onboarding_completed": True} for i in range(120)]))
    run(server.db.sessions.insert_many([{"session_id": f"s{i}", "user_id": "u1", "rounds": [{}] * 3} for i in range(400)]))
    assert client.get("/api/onboarding/social-proof").json()["stats"] == {}, "counts are shared for 5 minutes"
    run(server.cache.delete("social_proof"))
    stats = client.get("/api/onboarding/social-proof").json()["stats"]
    assert stats == {"rounds_recorded": "1,200", "fighters": "120"}


def test_the_goal_they_pick_becomes_their_profile_goal():
    current["user"] = {"user_id": "u_goal"}
    run(server.db.users.insert_one({"user_id": "u_goal"}))
    r = client.post("/api/onboarding/submit", json={"birth_date": "2000-01-01", "biggest_frustration": "footwork",
                                                    "experience_level": "1_3_years", "primary_goal": "Get fitter",
                                                    "favorite_fighter": "Usyk"})
    assert r.status_code == 200
    assert run(server.db.users.find_one({"user_id": "u_goal"}))["primary_goal"] == "Get fitter"


def test_an_account_with_no_birth_date_can_add_it_once():
    current["user"] = {"user_id": "u_old"}
    run(server.db.users.insert_one({"user_id": "u_old"}))
    r = client.post("/api/pro/apply", json={"alias": "Test Fighter", "ring_name": "Archie", "division": "Lightweight", "record": "0-0-0"})
    assert r.status_code == 403 and "date of birth" in r.json()["detail"], "says what's missing, not 'you're under 18'"
    assert client.post("/api/users/me/birth-date", json={"birth_date": "2099-01-01"}).status_code == 400
    assert client.post("/api/users/me/birth-date", json={"birth_date": "2015-01-01"}).status_code == 403, "under 13"
    ok = client.post("/api/users/me/birth-date", json={"birth_date": "2000-05-01"})
    assert ok.status_code == 200 and ok.json()["adult"] is True
    assert client.post("/api/users/me/birth-date", json={"birth_date": "1990-01-01"}).status_code == 409, "only once"
    assert run(server.db.users.find_one({"user_id": "u_old"}))["birth_date"] == "2000-05-01"


def test_a_typed_in_coach_name_is_kept_short():
    current["user"] = {"user_id": "u_goal"}
    long = client.post("/api/onboarding/submit", json={"birth_date": "2000-01-01", "biggest_frustration": "footwork",
                                                       "experience_level": "1_3_years", "favorite_fighter": "x" * 41})
    assert long.status_code == 422


if __name__ == "__main__":
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"\n{len(tests)} passed")
