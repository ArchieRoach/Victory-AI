"""Self-check: Clerk signing keys follow the secret key's instance (dev now, production later).

    MONGO_URL=x DB_NAME=t python3 backend/test_clerk_keys.py
"""
import asyncio

from mongomock_motor import AsyncMongoMockClient

import server

server.db = AsyncMongoMockClient()["test"]

seen = {}


class FakeClient:
    def __init__(self, *a, **k):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        pass

    async def get(self, url, headers=None, **k):
        seen["url"], seen["headers"] = url, headers or {}
        return server.httpx.Response(200, json={"keys": []}, request=server.httpx.Request("GET", url))


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def test_backend_api_jwks_is_called_with_the_secret_key():
    server.CLERK_JWKS_URL, server.CLERK_SECRET_KEY = "https://api.clerk.com/v1/jwks", "sk_live_abc"
    server._clerk_jwks_cache = {"keys": [], "fetched_at": 0}
    real, server.httpx.AsyncClient = server.httpx.AsyncClient, FakeClient
    try:
        run(server.verify_clerk_token("not.a.token"))
    finally:
        server.httpx.AsyncClient = real
    assert seen["url"] == "https://api.clerk.com/v1/jwks"
    assert seen["headers"] == {"Authorization": "Bearer sk_live_abc"}


def test_a_public_jwks_url_gets_no_secret():
    server.CLERK_JWKS_URL = "https://clerk.victoryai.co.uk/.well-known/jwks.json"
    server._clerk_jwks_cache = {"keys": [], "fetched_at": 0}
    real, server.httpx.AsyncClient = server.httpx.AsyncClient, FakeClient
    try:
        run(server.verify_clerk_token("not.a.token"))
    finally:
        server.httpx.AsyncClient = real
    assert seen["headers"] == {}, "the secret key never goes to a non-Clerk-API host"


class ClerkUser:
    def __init__(self, emails):
        self.emails = emails

    def __call__(self, *a, **k):
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        pass

    async def get(self, url, **k):
        body = {"first_name": "Archie", "last_name": "", "image_url": "",
                "email_addresses": [{"email_address": e, "verification": {"status": s}} for e, s in self.emails]}
        return server.httpx.Response(200, json=body, request=server.httpx.Request("GET", url))


def sign_in(clerk_id, emails):
    real, server.httpx.AsyncClient = server.httpx.AsyncClient, ClerkUser(emails)
    try:
        return run(server.get_or_create_clerk_user(clerk_id))
    finally:
        server.httpx.AsyncClient = real


def test_production_sign_in_keeps_the_old_account():
    server.CLERK_API_BREAKER = server.CircuitBreaker("clerk-test", timeout_seconds=1)
    run(server.db.users.insert_one({"user_id": "user_dev123", "email": "Archie@Example.com", "name": "Archie"}))
    run(server.db.sessions.insert_one({"session_id": "s1", "user_id": "user_dev123"}))
    me = sign_in("user_prod999", [("archie@example.com", "verified")])
    assert me["user_id"] == "user_dev123", "same account, so sessions, squads and Pro all stay"
    assert me["clerk_id"] == "user_prod999"
    again = sign_in("user_prod999", [])
    assert again["user_id"] == "user_dev123", "next time it's found straight from the new Clerk ID"
    assert run(server.db.users.count_documents({})) == 1


def test_an_unverified_email_never_takes_over_an_account():
    run(server.db.users.insert_one({"user_id": "user_dev777", "email": "victim@example.com"}))
    stranger = sign_in("user_prod666", [("victim@example.com", "unverified")])
    assert stranger["user_id"] == "user_prod666", "a new, empty account instead"
    assert "clerk_id" not in run(server.db.users.find_one({"user_id": "user_dev777"}))


class ClerkDown(ClerkUser):
    async def get(self, url, **k):
        return server.httpx.Response(401, json={}, request=server.httpx.Request("GET", url))


def test_no_empty_account_when_clerk_cannot_be_asked():
    real, server.httpx.AsyncClient = server.httpx.AsyncClient, ClerkDown([])
    try:
        run(server.get_or_create_clerk_user("user_prod555"))
        raise AssertionError("should refuse")
    except server.HTTPException as e:
        assert e.status_code == 503
    finally:
        server.httpx.AsyncClient = real
    assert not run(server.db.users.find_one({"user_id": "user_prod555"})), \
        "an empty account would hide the person's real one from every later sign-in"


def test_revenuecat_is_asked_about_todays_clerk_id():
    asked = []

    async def fake_subscriber(app_user_id):
        asked.append(app_user_id)
        return None
    real, server._revenuecat_subscriber = server._revenuecat_subscriber, fake_subscriber
    try:
        run(server.sync_revenuecat("user_dev123"))
    finally:
        server._revenuecat_subscriber = real
    assert asked == ["user_prod999"]


if __name__ == "__main__":
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"\n{len(tests)} passed")
