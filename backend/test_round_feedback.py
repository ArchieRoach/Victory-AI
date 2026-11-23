"""Self-check: round feedback works even when an account has no training partner saved
(the App Review demo account hit this: "Couldn't generate feedback for this round").

    MONGO_URL=x DB_NAME=t python3 backend/test_round_feedback.py
"""
from fastapi.testclient import TestClient
from mongomock_motor import AsyncMongoMockClient

import server

server.db = AsyncMongoMockClient()["test"]
current = {"user": {"user_id": "u1", "name": "Reviewer", "training_partner": None}}
server.app.dependency_overrides[server.get_current_user] = lambda: current["user"]
client = TestClient(server.app)


def test_feedback_without_a_partner():
    r = client.post("/api/ai/generate-feedback", json={"round_number": 1, "total_rounds": 1})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["partner_name"] == "Coach"
    assert body["what_you_did_well"] and body["what_to_tighten"]
    assert body["dimension_scores"] == []


def test_feedback_with_a_partner():
    current["user"] = {"user_id": "u2", "training_partner": {"name": "Rocco", "phrases": ["Again!"], "accountability_level": "high"}}
    r = client.post("/api/ai/generate-feedback", json={"round_number": 1, "total_rounds": 3})
    assert r.status_code == 200 and r.json()["partner_name"] == "Rocco"
    assert r.json()["accountability_check"].startswith("Round 1 of 3")


def test_services_say_yes_or_no_and_never_show_a_key():
    import os
    server.ELEVENLABS_API_KEY, server.OPENAI_API_KEY, server.GEMINI_API_KEY = "", "sk-secret", "g-secret"
    for k in ("CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"):
        os.environ[k] = "x"
    r = client.get("/api/health/services")
    assert r.status_code == 200 and "secret" not in r.text
    assert r.json()["coach_voice"] == {"elevenlabs": False, "openai": True, "storage": True, "ready": True}
    assert r.json()["video_scoring"]["ready"] is True
    del os.environ["CLOUDINARY_API_SECRET"]
    assert client.get("/api/health/services").json()["coach_voice"]["ready"] is False


def test_a_video_problem_is_recorded():
    current["user"] = {"user_id": "u3"}
    import asyncio
    asyncio.get_event_loop().run_until_complete(server.db.training_sessions.insert_one({"session_id": "s1", "user_id": "u3"}))
    r = client.post("/api/training/s1/video-problem", json={"round_number": 1, "stage": "upload", "detail": "413"})
    assert r.status_code == 200
    doc = asyncio.get_event_loop().run_until_complete(server.db.training_sessions.find_one({"session_id": "s1"}))
    assert doc["video_problems"][0]["stage"] == "upload"


if __name__ == "__main__":
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"\n{len(tests)} passed")
