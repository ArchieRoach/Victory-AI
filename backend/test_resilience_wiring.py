"""Self-check that the circuit breakers are wired into the server's outside calls:

    MONGO_URL=x DB_NAME=t python3 backend/test_resilience_wiring.py
"""
import asyncio
import time
from types import SimpleNamespace

from fastapi.testclient import TestClient
from mongomock_motor import AsyncMongoMockClient

import pywebpush
import server
from resilience import CircuitBreaker

server.db = AsyncMongoMockClient()["test"]
run = asyncio.get_event_loop().run_until_complete
calls = {"openai": 0, "jwks": 0}


class DownClient:
    def __init__(self, *a, **k):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        pass

    async def post(self, url, **k):
        calls["openai"] += 1
        raise server.httpx.ConnectError("down")

    async def get(self, url, **k):
        calls["jwks"] += 1
        raise server.httpx.ConnectError("down")


def test_moderation_outage_fails_open_and_stops_calling():
    server.OPENAI_API_KEY = "sk"
    server.MODERATION_BREAKER = CircuitBreaker("m", failure_threshold=3, timeout_seconds=1)
    real, server.httpx.AsyncClient = server.httpx.AsyncClient, DownClient
    try:
        results = [run(server.is_content_flagged("hello")) for _ in range(10)]
    finally:
        server.httpx.AsyncClient = real
    assert results == [False] * 10, "posting keeps working (fail open)"
    assert calls["openai"] == 3, "after 3 failures the breaker stops calling OpenAI"


def test_clerk_key_refresh_failure_keeps_the_cached_keys():
    server._clerk_jwks_cache = {"keys": [{"kid": "k1"}], "fetched_at": time.time() - 7200}
    server.CLERK_API_BREAKER = CircuitBreaker("c", timeout_seconds=1)
    real, server.httpx.AsyncClient = server.httpx.AsyncClient, DownClient
    try:
        run(server.verify_clerk_token("not.a.token"))
    finally:
        server.httpx.AsyncClient = real
    assert calls["jwks"] == 1
    assert server._clerk_jwks_cache["keys"] == [{"kid": "k1"}], "keys kept"
    next_try_in = 3600 - (time.time() - server._clerk_jwks_cache["fetched_at"])
    assert 0 < next_try_in <= 300, "retries in about 5 minutes, not on every request"


class Gone(pywebpush.WebPushException):
    def __init__(self, code):
        super().__init__("push failed", response=SimpleNamespace(status_code=code))


def test_web_push_cleans_gone_subscriptions_in_one_batch_without_tripping():
    server.VAPID_PRIVATE_KEY = server.VAPID_PUBLIC_KEY = "x"
    server.WEBPUSH_BREAKER = CircuitBreaker("w", failure_threshold=2, timeout_seconds=2)

    async def no_apns(*a, **k):
        return None
    server._send_apns = no_apns
    run(server.db.push_subscriptions.insert_many([
        {"user_id": "u1", "endpoint": f"https://push/{i}", "keys": {}} for i in range(5)]))
    sent = []

    def fake_webpush(subscription_info, **kw):
        assert kw["timeout"] == 10, "every push has a timeout"
        if subscription_info["endpoint"].endswith(("/0", "/1", "/2")):
            raise Gone(410)
        sent.append(subscription_info["endpoint"])

    real, pywebpush.webpush = pywebpush.webpush, fake_webpush
    try:
        run(server._send_push("u1", "t", "b"))
    finally:
        pywebpush.webpush = real
    left = [d["endpoint"] for d in run(server.db.push_subscriptions.find({"user_id": "u1"}).to_list(10))]
    assert sorted(left) == ["https://push/3", "https://push/4"] and len(sent) == 2
    assert server.WEBPUSH_BREAKER.state == "closed", "expired subscriptions aren't service failures"


def test_web_push_outage_opens_the_breaker_and_skips_the_rest():
    server.WEBPUSH_BREAKER = CircuitBreaker("w", failure_threshold=2, timeout_seconds=2)
    run(server.db.push_subscriptions.insert_many([
        {"user_id": "u2", "endpoint": f"https://down/{i}", "keys": {}} for i in range(6)]))
    attempts = []

    def failing(subscription_info, **kw):
        attempts.append(1)
        raise Gone(503)

    real, pywebpush.webpush = pywebpush.webpush, failing
    try:
        run(server._send_push("u2", "t", "b"))
    finally:
        pywebpush.webpush = real
    assert len(attempts) == 2 and server.WEBPUSH_BREAKER.state == "open"
    assert run(server.db.push_subscriptions.count_documents({"user_id": "u2"})) == 6, "real failures delete nothing"


def test_deleting_a_gym_clears_every_member_in_one_write():
    server.app.dependency_overrides[server.get_current_user] = lambda: {"user_id": "owner"}
    client = TestClient(server.app)
    run(server.db.users.insert_many([{"user_id": u, "gym_id": "gym_x"} for u in ("owner", "m1", "m2")]
                                    + [{"user_id": "other", "gym_id": "gym_y"}]))
    run(server.db.gyms.insert_one({"gym_id": "gym_x", "owner_id": "owner", "members": ["owner", "m1", "m2"]}))
    assert client.delete("/api/gyms/gym_x").status_code == 200
    users = {u["user_id"]: u.get("gym_id") for u in run(server.db.users.find({}).to_list(10))}
    assert users == {"owner": None, "m1": None, "m2": None, "other": "gym_y"}


if __name__ == "__main__":
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"\n{len(tests)} passed")
