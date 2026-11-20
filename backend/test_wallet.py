"""Self-check: the wallet adds up streaming and merch money honestly (held money is held, paid
money is paid, refunds and unpaid checkouts don't count).

    MONGO_URL=x DB_NAME=t python3 backend/test_wallet.py
"""
import asyncio
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from mongomock_motor import AsyncMongoMockClient

import earnings as ern
import server

server.db = AsyncMongoMockClient()["test"]
current = {"user": {"user_id": "u1", "name": "Lucas", "birth_date": "1995-01-01"}}
server.app.dependency_overrides[server.get_current_user] = lambda: current["user"]
client = TestClient(server.app)


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def test_merch_money_is_held_until_released():
    s = ern.merch_summary([
        {"status": "paid", "seller_gets_gbp": 20.0},
        {"status": "shipped", "seller_gets_gbp": 5.5},
        {"status": "released", "seller_gets_gbp": 10.0, "transfer_id": "tr_1"},
        {"status": "received", "seller_gets_gbp": 3.0},
        {"status": "refunded", "seller_gets_gbp": 99.0},
    ])
    assert s == {"on_hold_pence": 2850, "paid_pence": 1000, "sales": 4}


def test_the_wallet_endpoint_adds_both_up():
    now = datetime.now(timezone.utc)
    run(server.db.stream_earnings.insert_many([
        {"user_id": "u1", "share_pence": 800, "status": "held", "available_at": (now - timedelta(days=1)).isoformat(), "created_at": now.isoformat(), "source": "tip"},
        {"user_id": "u1", "share_pence": 400, "status": "held", "available_at": (now + timedelta(days=5)).isoformat(), "created_at": now.isoformat(), "source": "emote"},
        {"user_id": "u1", "share_pence": 1500, "status": "paid", "available_at": now.isoformat(), "created_at": now.isoformat(), "source": "tip"},
        {"user_id": "u2", "share_pence": 99999, "status": "held", "available_at": now.isoformat(), "created_at": now.isoformat(), "source": "tip"},
    ]))
    run(server.db.merch_orders.insert_many([
        {"seller_id": "u1", "status": "shipped", "seller_gets_gbp": 12.0},
        {"seller_id": "u1", "status": "pending_payment", "seller_gets_gbp": 50.0},
    ]))
    w = client.get("/api/wallet/me").json()
    assert w["ready_pence"] == 800 and w["on_hold_pence"] == 400 + 1200
    assert w["balance_pence"] == 800 + 400 + 1200 and w["paid_pence"] == 1500
    assert {s["key"]: s["pence"] for s in w["sources"]} == {"streams": 1200, "merch": 1200}
    assert w["has_any"] and w["cash_out"] and w["hold_days"] == 14


def test_an_empty_wallet_says_so():
    w = ern.wallet({}, {})
    assert w["balance_pence"] == 0 and not w["has_any"]


if __name__ == "__main__":
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"\n{len(tests)} passed")
