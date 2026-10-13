"""Self-check for fixes from a real test session (scouting message, partner look, avatars):

    MONGO_URL=x DB_NAME=t python3 backend/test_session_fixes.py
"""
import asyncio

from fastapi.testclient import TestClient
from mongomock_motor import AsyncMongoMockClient

import server

server.db = AsyncMongoMockClient()["test"]
current = {}
server.app.dependency_overrides[server.get_current_user] = lambda: current["user"]
client = TestClient(server.app)
PARTNER = {"partner_id": "partner_x", "name": "Dee", "style": "supportive_mentor"}


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def test_filmed_but_unscored_never_says_turn_on_video():
    filmed = server.build_scouting_report([{"dimension_name": "Jab", "score": None}], "s1", filmed=True)
    assert filmed["locked"] and filmed["reason"] == "unscored" and "video" not in filmed["title"].lower().replace("your video", "")
    plain = server.build_scouting_report([], "s2")
    assert plain["reason"] == "no_video" and "Record a round" in plain["body"]


def test_partner_picture_follows_the_chosen_look_and_hides_the_logo():
    user = {"user_id": "u_look", "training_partner": dict(PARTNER)}
    run(server.db.users.insert_one(dict(user)))
    current["user"] = user
    url = client.post("/api/onboarding/generate-avatar", json={"gender": "male"}).json()["avatar_url"]
    assert "male%20boxer" in url and "female" not in url
    assert "height=640" in url, "4:5 so the logo strip is cropped off"
    saved = run(server.db.users.find_one({"user_id": "u_look"}))["training_partner"]
    assert saved["appearance_gender"] == "male"
    odd = client.post("/api/onboarding/generate-avatar", json={"gender": "robot"}).json()["avatar_url"]
    assert "boxing%20trainer" in odd


def test_old_square_avatars_are_remade_once():
    run(server.db.users.insert_one({"user_id": "u_old", "training_partner": {
        **PARTNER, "avatar_url": "https://image.pollinations.ai/prompt/x?width=512&height=512&nologo=true&seed=1"}}))
    run(server.migrate_square_partner_avatars())
    url = run(server.db.users.find_one({"user_id": "u_old"}))["training_partner"]["avatar_url"]
    assert "height=640" in url and url.endswith("seed=1")
    run(server.db.users.update_one({"user_id": "u_old"}, {"$set": {"training_partner.avatar_url": "height=512&nologo=true"}}))
    run(server.migrate_square_partner_avatars())
    assert run(server.db.users.find_one({"user_id": "u_old"}))["training_partner"]["avatar_url"] == "height=512&nologo=true", "runs once"


if __name__ == "__main__":
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"\n{len(tests)} passed")
