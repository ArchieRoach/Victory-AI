"""Self-check for founder pricing and the cancel/resume flow, with Stripe mocked:

    MONGO_URL=x DB_NAME=t python3 backend/test_billing.py
"""
from types import SimpleNamespace

from fastapi.testclient import TestClient
from mongomock_motor import AsyncMongoMockClient

import server
from server import coupon_ids_on, founder_pricing

server.db = AsyncMongoMockClient()["test"]
server.STRIPE_API_KEY = "sk_test"
server.STRIPE_FOUNDERS_COUPON_ID = "FOUNDERS"
USER = {"user_id": "u1", "email": "a@b.co"}
server.app.dependency_overrides[server.get_current_user] = lambda: USER
client = TestClient(server.app)

STATE = {"cancel_at_period_end": False, "discounts": [{"source": {"coupon": "FOUNDERS", "type": "coupon"}}]}
calls = []


class FakeSubscription:
    @staticmethod
    def retrieve(sub_id, expand=None):
        return {"id": sub_id, "status": "active", "current_period_end": 1790000000, **STATE}

    @staticmethod
    def modify(sub_id, cancel_at_period_end):
        calls.append(("modify", sub_id, cancel_at_period_end))
        STATE["cancel_at_period_end"] = cancel_at_period_end


class FakeCoupon:
    @staticmethod
    def retrieve(cid):
        return {"id": cid, "percent_off": 40, "amount_off": None, "duration": "forever", "duration_in_months": None}


server.stripe_lib = SimpleNamespace(Subscription=FakeSubscription, Coupon=FakeCoupon)


def run(coro):
    import asyncio
    return asyncio.get_event_loop().run_until_complete(coro)


def test_founder_pricing_maths_and_honest_lifetime_flag():
    p = founder_pricing(5.0, {"percent_off": 40, "duration": "forever"})
    assert p == {"price": 3.0, "regular_price": 5.0, "saving": 2.0, "percent_off": 40,
                 "lifetime": True, "duration_in_months": None}
    assert founder_pricing(25.0, {"amount_off": 1000, "duration": "repeating", "duration_in_months": 12})["lifetime"] is False
    assert founder_pricing(5.0, {}) is None


def test_coupon_ids_across_stripe_shapes():
    assert coupon_ids_on({"discounts": [{"source": {"coupon": "A"}}]}) == {"A"}
    assert coupon_ids_on({"discounts": [{"coupon": {"id": "B"}}], "discount": {"coupon": {"id": "C"}}}) == {"B", "C"}
    assert coupon_ids_on({"discounts": ["di_123"]}) == set()
    assert coupon_ids_on({}) == set()


def test_billing_cancel_and_resume_keep_founder_price_visible():
    run(server.db.subscriptions.insert_one({"user_id": "u1", "subscription_id": "sub_123", "plan_id": "monthly", "status": "active"}))
    b = client.get("/api/subscription/billing").json()
    assert b["founder"]["lifetime"] is True and b["price"] == 3.0 and b["regular_price"] == 5.0
    assert b["manageable"] is True and b["cancel_at_period_end"] is False

    b = client.post("/api/subscription/cancel").json()
    assert calls[-1] == ("modify", "sub_123", True)
    assert b["cancel_at_period_end"] is True and b["founder"]["price"] == 3.0, "still a founder until the period ends"

    b = client.post("/api/subscription/resume").json()
    assert calls[-1] == ("modify", "sub_123", False) and b["cancel_at_period_end"] is False


def test_non_founder_gets_no_lifetime_claim():
    STATE["discounts"] = []
    b = client.get("/api/subscription/billing").json()
    assert b["founder"] is None and b["price"] == 5.0


def test_no_subscription():
    server.app.dependency_overrides[server.get_current_user] = lambda: {"user_id": "nobody"}
    assert client.get("/api/subscription/billing").json() == {"has_subscription": False}
    assert client.post("/api/subscription/cancel").status_code == 404
    server.app.dependency_overrides[server.get_current_user] = lambda: USER


if __name__ == "__main__":
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"\n{len(tests)} passed")
