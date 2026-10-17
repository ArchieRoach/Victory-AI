"""Self-check for the Welcome back card:

    MONGO_URL=x DB_NAME=t python3 backend/test_welcome_back.py
"""
import asyncio
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from mongomock_motor import AsyncMongoMockClient

import server

server.db = AsyncMongoMockClient()["test"]
current = {}
server.app.dependency_overrides[server.get_current_user] = lambda: current["user"]
client = TestClient(server.app)


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def ago(n):
    return (datetime.now(timezone.utc).date() - timedelta(days=n)).strftime("%Y-%m-%d")


def test_back_after_a_week_sees_what_they_built_and_what_the_squad_did():
    run(server.db.users.insert_one({"user_id": "u_back", "personal_bests": {"Overall": 7.8}, "verified_seconds": 4000}))
    run(server.db.sessions.insert_many([{"session_id": f"b{i}", "user_id": "u_back", "date": ago(10 + i)} for i in range(3)]))
    run(server.db.squads.insert_one({"squad_id": "sq", "members": ["u_back", "u_mate"]}))
    run(server.db.sessions.insert_many([{"session_id": "m1", "user_id": "u_mate", "date": ago(5)},
                                         {"session_id": "m2", "user_id": "u_mate", "date": ago(20)}]))
    current["user"] = {"user_id": "u_back"}
    w = client.get("/api/home/welcome-back").json()
    assert w == {"show": True, "days_away": 10, "sessions": 3, "best_overall": 7.8, "badge": "First Hour",
                 "squad_sessions": 1}, w


def test_regulars_and_brand_new_people_see_nothing():
    run(server.db.sessions.insert_one({"session_id": "r1", "user_id": "u_regular", "date": ago(2)}))
    current["user"] = {"user_id": "u_regular"}
    assert client.get("/api/home/welcome-back").json() == {"show": False}
    current["user"] = {"user_id": "u_new"}
    assert client.get("/api/home/welcome-back").json() == {"show": False}


if __name__ == "__main__":
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"\n{len(tests)} passed")
