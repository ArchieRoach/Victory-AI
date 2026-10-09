"""Self-check for Cache-Control on public, identical-for-everyone endpoints:

    MONGO_URL=x DB_NAME=t python3 backend/test_public_cache.py
"""
from fastapi.testclient import TestClient
from mongomock_motor import AsyncMongoMockClient

import server

server.db = AsyncMongoMockClient()["test"]
client = TestClient(server.app)


def test_static_public_endpoints_are_cacheable():
    r = client.get("/api/onboarding/partner-styles")
    assert r.status_code == 200 and r.headers["cache-control"] == "public, max-age=3600"
    assert r.json()["styles"], "body still parses"


def test_counter_gets_a_short_cache():
    r = client.get("/api/waitlist/stats")
    assert r.headers.get("cache-control") == "public, max-age=30"


def test_personal_and_error_responses_are_never_cached():
    assert "cache-control" not in client.get("/api/auth/me").headers, "401 for a signed-out caller"
    assert "cache-control" not in client.get("/api/fantasy/cards").headers


if __name__ == "__main__":
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"\n{len(tests)} passed")
