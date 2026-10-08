"""Self-check for App Store Pro through RevenueCat, with RevenueCat's API mocked:

    MONGO_URL=x DB_NAME=t python3 backend/test_revenuecat.py
"""
import asyncio
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from mongomock_motor import AsyncMongoMockClient

import server

server.db = AsyncMongoMockClient()["test"]
server.REVENUECAT_SECRET_API_KEY = "sk_test"
server.REVENUECAT_WEBHOOK_AUTH = "Bearer hook-secret"
run = asyncio.get_event_loop().run_until_complete
USER = {"user_id": "user_ios", "email": "i@x.co", "name": "Ivy"}
CURRENT = {"user": USER}
server.app.dependency_overrides[server.get_current_user] = lambda: CURRENT["user"]
client = TestClient(server.app)
SUBSCRIBERS, calls = {}, []
iso = lambda d: d.strftime("%Y-%m-%dT%H:%M:%SZ")
NOW = datetime.now(timezone.utc)


class Resp:
    def __init__(self, uid):
        self.uid = uid
        self.status_code = 200

    def raise_for_status(self):
        pass

    def json(self):
        return {"subscriber": SUBSCRIBERS.get(self.uid, {"entitlements": {}, "subscriptions": {}})}


class FakeClient:
    def __init__(self, *a, **k):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        pass

    async def get(self, url, headers=None, **k):
        calls.append((url, headers))
        return Resp(url.rsplit("/", 1)[-1])


server.httpx.AsyncClient = FakeClient
run(server.db.users.insert_one(dict(USER)))


def subscribe(expires, trial=False, cancelled=False):
    SUBSCRIBERS["user_ios"] = {
        "entitlements": {"victory_ai_pro": {"expires_date": iso(expires), "product_identifier": "victory_pro_annual"}},
        "subscriptions": {"victory_pro_annual": {"period_type": "trial" if trial else "normal",
                                                 "unsubscribe_detected_at": iso(NOW) if cancelled else None}}}


def webhook(auth="Bearer hook-secret", uid="user_ios"):
    return client.post("/api/webhooks/revenuecat", headers={"Authorization": auth},
                       json={"event": {"type": "INITIAL_PURCHASE", "app_user_id": uid, "environment": "SANDBOX"}})


def test_no_purchase_means_no_access():
    assert client.post("/api/auth/validate").json() == {"access_granted": False, "reason": "no_subscription"}


def test_webhook_needs_the_shared_secret():
    assert webhook(auth="Bearer wrong").status_code == 401
    assert webhook(auth="").status_code == 401


def test_purchase_webhook_unlocks_pro_from_revenuecats_answer():
    subscribe(NOW + timedelta(days=7), trial=True)
    assert webhook().status_code == 200, "sandbox purchases count: App Review buys in sandbox"
    assert calls[-1][1]["Authorization"] == "Bearer sk_test"
    doc = run(server.db.subscriptions.find_one({"subscription_id": "rc_user_ios"}))
    assert doc["status"] == "trialing" and doc["source"] == "app_store" and doc["plan_id"] == "annual"
    assert run(server.check_subscription(USER))
    assert client.post("/api/auth/validate").json()["access_granted"]


def test_billing_page_says_apple_manages_it():
    subscribe(NOW + timedelta(days=30), cancelled=True)
    client.post("/api/subscription/revenuecat/sync")
    b = client.get("/api/subscription/billing").json()
    assert b["managed_by"] == "app_store" and not b["manageable"] and b["cancel_at_period_end"]


def test_expiry_locks_the_app_again():
    subscribe(NOW - timedelta(minutes=1))
    r = client.post("/api/auth/validate").json()
    assert r == {"access_granted": False, "reason": "subscription_lapsed"}, "validate re-checks RevenueCat"
    assert not run(server.check_subscription(USER))


def test_unknown_or_anonymous_users_are_ignored():
    n = len(calls)
    assert client.post("/api/webhooks/revenuecat", headers={"Authorization": "Bearer hook-secret"},
                       json={"event": {"app_user_id": "$RCAnonymousID:abc"}}).status_code == 200
    assert webhook(uid="someone_else").status_code == 200
    assert len(calls) == n, "no RevenueCat lookups for ids that aren't our users"



def test_lifetime_purchase_never_expires():
    SUBSCRIBERS["user_ios"] = {"entitlements": {"victory_ai_pro": {"expires_date": None, "product_identifier": "lifetime"}},
                               "subscriptions": {}}
    client.post("/api/subscription/revenuecat/sync")
    doc = run(server.db.subscriptions.find_one({"subscription_id": "rc_user_ios"}))
    assert doc["status"] == "active" and doc["plan_id"] == "lifetime" and doc["current_period_end"] is None
    assert client.post("/api/auth/validate").json()["access_granted"]
    assert client.get("/api/subscription/billing").json()["plan_id"] == "lifetime"


def test_other_entitlements_dont_unlock_pro():
    SUBSCRIBERS["user_ios"] = {"entitlements": {"something_else": {"expires_date": None}}, "subscriptions": {}}
    client.post("/api/subscription/revenuecat/sync")
    assert not run(server.check_subscription(USER))


if __name__ == "__main__":
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"\n{len(tests)} passed")
