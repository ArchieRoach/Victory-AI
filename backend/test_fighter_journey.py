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


if __name__ == "__main__":
    setup()
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"\n{len(tests)} passed")
