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


if __name__ == "__main__":
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"\n{len(tests)} passed")
