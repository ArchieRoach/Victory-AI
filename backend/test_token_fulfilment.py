"""Self-check that token purchases are credited exactly once, whichever arrives first:
the Stripe webhook or the buyer's success page. Stripe is mocked:

    MONGO_URL=x DB_NAME=t python3 backend/test_token_fulfilment.py
"""
import asyncio
import json
from types import SimpleNamespace

from fastapi.testclient import TestClient
from mongomock_motor import AsyncMongoMockClient

import server

server.db = AsyncMongoMockClient()["test"]
run = asyncio.get_event_loop().run_until_complete
BUYER = {"user_id": "u1", "email": "a@x.co", "name": "Adam"}
OTHER = {"user_id": "u2", "email": "b@x.co", "name": "Bea"}
CURRENT = {"user": BUYER}
server.app.dependency_overrides[server.get_current_user] = lambda: CURRENT["user"]
client = TestClient(server.app)
SESSIONS = {}


def session(sid, paid=True, uid="u1", tokens="500"):
    SESSIONS[sid] = SimpleNamespace(
        id=sid, status="complete" if paid else "open", payment_status="paid" if paid else "unpaid", mode="payment",
        subscription=None, amount_total=499, currency="gbp",
        metadata={"user_id": uid, "purchase_type": "tokens", "token_package": "fighter", "tokens": tokens})


server.stripe_lib = SimpleNamespace(
    checkout=SimpleNamespace(Session=SimpleNamespace(retrieve=lambda sid: SESSIONS[sid])),
    Webhook=SimpleNamespace(construct_event=lambda body, sig, secret: json.loads(body)))
server.STRIPE_WEBHOOK_SECRET = "whsec_test"
run(server.db.users.insert_many([{**BUYER, "token_balance": 0}, {**OTHER, "token_balance": 0}]))


def balance(uid="u1"):
    return run(server.db.users.find_one({"user_id": uid}))["token_balance"]


def webhook(sid):
    s = SESSIONS[sid]
    event = {"type": "checkout.session.completed", "data": {"object": {"id": sid, "payment_status": s.payment_status, "metadata": s.metadata}}}
    return client.post("/api/webhook/stripe", content=json.dumps(event), headers={"stripe-signature": "x"})


def status(sid):
    return client.get(f"/api/payments/status/{sid}")


def test_webhook_first_then_success_page_credits_once():
    session("cs_a")
    assert webhook("cs_a").status_code == 200 and balance() == 500
    assert status("cs_a").json()["payment_status"] == "paid"
    assert balance() == 500


def test_success_page_first_covers_a_missing_webhook():
    session("cs_b")
    status("cs_b")
    status("cs_b")
    assert balance() == 1000, "polling twice still credits once"
    webhook("cs_b")
    assert balance() == 1000, "a late webhook is a no-op"


def test_unpaid_or_someone_elses_session_credits_nothing():
    session("cs_c", paid=False)
    status("cs_c")
    assert balance() == 1000
    session("cs_d", uid="u2")
    assert status("cs_d").status_code == 403
    assert balance("u2") == 0 and balance() == 1000


if __name__ == "__main__":
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"\n{len(tests)} passed")
