"""Self-check: the public pricing and spot-count endpoints are readable from any origin,
while sign-ups and everything else stay limited to our own origins.

    MONGO_URL=x DB_NAME=t python3 backend/test_public_cors.py
"""
from types import SimpleNamespace

from fastapi.testclient import TestClient
from mongomock_motor import AsyncMongoMockClient

import server

server.db = AsyncMongoMockClient()["test"]
server.STRIPE_API_KEY = ""


class NoHttp:
    def __init__(self, *a, **k): pass
    async def __aenter__(self): return self
    async def __aexit__(self, *a): return False
    async def get(self, *a, **k): return SimpleNamespace(json=lambda: {"result": "error"})
    async def post(self, *a, **k): return None


server.httpx.AsyncClient = NoHttp
client = TestClient(server.app)
PREVIEW = "https://id-preview--1234.lovable.app"


def test_public_reads_allow_any_origin():
    for path in ("/api/pricing", "/api/waitlist/stats"):
        r = client.get(path, headers={"Origin": PREVIEW})
        assert r.status_code == 200, (path, r.text)
        assert r.headers["access-control-allow-origin"] == "*"
        assert "access-control-allow-credentials" not in r.headers
        pre = client.options(path, headers={"Origin": PREVIEW, "Access-Control-Request-Method": "GET"})
        assert pre.status_code == 204 and pre.headers["access-control-allow-origin"] == "*"


def test_signup_and_other_endpoints_stay_locked_to_our_origins():
    pre = client.options("/api/waitlist/signup", headers={"Origin": PREVIEW, "Access-Control-Request-Method": "POST"})
    assert pre.headers.get("access-control-allow-origin") != "*"
    r = client.get("/api/subscription/billing", headers={"Origin": PREVIEW})
    assert r.headers.get("access-control-allow-origin") is None


def test_repeat_signup_says_whether_they_are_a_founder():
    import asyncio
    asyncio.get_event_loop().run_until_complete(
        server.db.waitlist.insert_one({"email": "me@example.com", "promo_code": "FOUNDERAAAA1111"}))
    r = client.post("/api/waitlist/signup", json={"email": "me@example.com", "name": "Me"}).json()
    assert r["already_registered"] is True and r["founder"] is True
    assert r["founder_spots"]["limit"] == server.FOUNDER_SPOTS_LIMIT


if __name__ == "__main__":
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"\n{len(tests)} passed")
