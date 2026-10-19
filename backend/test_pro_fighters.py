"""Self-check for pro Fighter Cards, the Vinted-style merch shop, alias partners and clips:

    MONGO_URL=x DB_NAME=t python3 backend/test_pro_fighters.py
"""
import asyncio
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from fastapi.testclient import TestClient
from mongomock_motor import AsyncMongoMockClient

import pro as px
import server

server.db = AsyncMongoMockClient()["test"]
current = {}
server.app.dependency_overrides[server.get_current_user] = lambda: current["user"]
client = TestClient(server.app)
stripe_calls = []


async def no_push(*a, **k):
    return None


async def no_email(*a, **k):
    return None


async def not_flagged(*a, **k):
    return False


async def admin_check(user):
    return user.get("user_id") == "u_admin"

server._send_push = no_push
server._email_fantasy_admin = no_email
server.is_content_flagged = not_flagged
server.is_admin = admin_check


class FakeStripe:
    class checkout:
        class Session:
            @staticmethod
            def create(**k):
                stripe_calls.append(("session", k))
                return SimpleNamespace(id=f"cs_{len(stripe_calls)}", url="https://checkout.stripe.test/x")

    class Refund:
        @staticmethod
        def create(**k):
            stripe_calls.append(("refund", k))

    class PaymentIntent:
        @staticmethod
        def retrieve(pi):
            return {"latest_charge": "ch_1"}

    class Transfer:
        @staticmethod
        def create(**k):
            stripe_calls.append(("transfer", k))
            return SimpleNamespace(id="tr_1")

server.stripe_lib = FakeStripe

REAPER = {"user_id": "u_reaper", "email": "reaper@x.com", "birth_date": "1995-01-01"}
FAN = {"user_id": "u_fan", "email": "fan@x.com", "birth_date": "2000-01-01"}


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def as_user(u):
    current["user"] = dict(u)  # a fresh copy per request, as in production


def setup():
    run(server.db.users.insert_many([dict(REAPER), dict(FAN), {"user_id": "u_admin"}]))


def test_fees_are_vinted_style_and_sellers_keep_everything():
    t = px.order_totals(25.00, 4.00)
    assert t == {"item": 25.0, "shipping": 4.0, "buyer_protection": 1.95, "total": 30.95, "seller_gets": 29.0}
    assert px.can_move("paid", "shipped") and not px.can_move("received", "refunded")


def test_apply_then_admin_verifies_and_the_card_goes_public():
    as_user(REAPER)
    bad = client.post("/api/pro/apply", json={"alias": "The Reaper", "ring_name": "Lamont Roche Jr", "division": "Lightweight",
                                              "record": "eighteen"})
    assert bad.status_code == 400
    r = client.post("/api/pro/apply", json={"alias": "The Reaper", "ring_name": "Lamont Roche Jr", "division": "Lightweight",
                                            "record": "25-4-1", "titles": ["Former Super Featherweight Champion"],
                                            "boxrec_url": "https://boxrec.com/en/box-pro/1"})
    assert r.json() == {"status": "pending"}
    assert client.get("/api/pros/u_reaper").status_code == 404, "not public until verified"
    as_user(FAN)
    assert client.post("/api/admin/pro/u_reaper/verify", json={"approve": True}).status_code == 403
    as_user({"user_id": "u_admin"})
    client.post("/api/admin/pro/u_reaper/verify", json={"approve": True, "fantasy_fighter_id": "bd_123"})
    card = client.get("/api/pros/u_reaper").json()["fighter"]
    assert card["alias"] == "The Reaper" and card["verified"] and card["titles"] == ["Former Super Featherweight Champion"]
    assert [p["alias"] for p in client.get("/api/pros").json()["pros"]] == ["The Reaper"]


def test_under_18s_cant_apply():
    as_user({"user_id": "u_kid"})
    run(server.db.users.insert_one({"user_id": "u_kid", "birth_date": "2014-01-01"}))
    r = client.post("/api/pro/apply", json={"alias": "Kid", "ring_name": "Kid Boxer", "division": "Flyweight", "record": "1-0-0"})
    assert r.status_code == 403


def test_listing_buying_shipping_and_payout_with_buyer_protection():
    as_user(REAPER)
    item = client.post("/api/pro/merch", json={"title": "Reaper Hoodie", "price_gbp": 45, "shipping_gbp": 5,
                                               "image_url": "https://res.cloudinary.com/x/hoodie.jpg", "sizes": ["S", "M", "L"],
                                               "stock": 1}).json()
    assert item["buyer_protection_gbp"] == 2.95
    as_user(FAN)
    assert client.post(f"/api/merch/{item['item_id']}/checkout", json={"size": "M"}).status_code == 400, "seller payouts not set up"
    run(server.db.users.update_one({"user_id": "u_reaper"}, {"$set": {"pro.payouts_ready": True, "pro.stripe_account_id": "acct_1"}}))
    assert client.post(f"/api/merch/{item['item_id']}/checkout", json={"size": "XXL"}).status_code == 400
    r = client.post(f"/api/merch/{item['item_id']}/checkout", json={"size": "M"}).json()
    assert r["totals"]["total"] == 52.95
    session_args = [k for kind, k in stripe_calls if kind == "session"][-1]
    assert [l["price_data"]["product_data"]["name"] for l in session_args["line_items"]] == ["The Reaper: Reaper Hoodie (M)", "Buyer Protection", "Shipping"]
    order = run(server.db.merch_orders.find_one({"buyer_id": "u_fan"}))
    run(server._merch_paid({"metadata": {"order_id": order["order_id"]}, "payment_intent": "pi_1",
                            "shipping_details": {"name": "Fan", "address": {"line1": "1 Ring St", "city": "London", "postal_code": "E1",
                                                                            "country": "GB"}}}))
    assert run(server.db.merch_items.find_one({"item_id": item["item_id"]}))["stock"] == 0
    as_user(REAPER)
    seller_view = client.get("/api/pro/orders").json()["orders"][0]
    assert seller_view["status"] == "paid" and seller_view["shipping"]["city"] == "London"
    client.post(f"/api/pro/orders/{order['order_id']}/shipped", json={"tracking": "RM123"})
    as_user(FAN)
    assert "shipping" not in client.get("/api/orders/mine").json()["orders"][0]
    client.post(f"/api/orders/{order['order_id']}/received")
    transfer = [k for kind, k in stripe_calls if kind == "transfer"][-1]
    assert transfer["amount"] == 5000 and transfer["destination"] == "acct_1", "item + shipping to the seller; the fee stays with us"
    assert client.post(f"/api/orders/{order['order_id']}/issue", json={"reason": "never came"}).status_code == 400


def test_sold_out_after_payment_is_refunded_straight_away():
    run(server.db.merch_items.insert_one({"item_id": "m_gone", "seller_id": "u_reaper", "active": True, "stock": 0, "title": "Cap"}))
    run(server.db.merch_orders.insert_one({"order_id": "o_gone", "item_id": "m_gone", "seller_id": "u_reaper", "buyer_id": "u_fan",
                                           "quantity": 1, "title": "Cap", "status": "pending_payment"}))
    run(server._merch_paid({"metadata": {"order_id": "o_gone"}, "payment_intent": "pi_gone"}))
    assert run(server.db.merch_orders.find_one({"order_id": "o_gone"}))["status"] == "refunded"
    assert ("refund", {"payment_intent": "pi_gone"}) in stripe_calls


def test_unconfirmed_orders_pay_out_after_14_days_and_issues_go_to_admin():
    old = (datetime.now(timezone.utc) - timedelta(days=15)).isoformat()
    run(server.db.merch_orders.insert_one({"order_id": "o_old", "seller_id": "u_reaper", "buyer_id": "u_fan", "title": "Gloves",
                                           "status": "shipped", "shipped_at": old, "payment_intent": "pi_o", "seller_gets_gbp": 20.0}))
    assert run(server.release_due_orders()) == 1
    run(server.db.merch_orders.insert_one({"order_id": "o_bad", "seller_id": "u_reaper", "buyer_id": "u_fan", "title": "Shorts",
                                           "status": "shipped", "payment_intent": "pi_b", "seller_gets_gbp": 10.0}))
    as_user(FAN)
    client.post("/api/orders/o_bad/issue", json={"reason": "Wrong size sent"})
    as_user({"user_id": "u_admin"})
    assert client.post("/api/admin/orders/o_bad/resolve", json={"action": "refund"}).json()["ok"]
    assert run(server.db.merch_orders.find_one({"order_id": "o_bad"}))["status"] == "refunded"


def test_bumps_and_spotlight_put_a_shop_first():
    run(server._apply_promo({"purchase_type": "pro_spotlight", "user_id": "u_reaper"}))
    run(server.db.merch_items.insert_one({"item_id": "m_other", "seller_id": "u_other", "active": True, "stock": 3,
                                          "title": "Other tee", "price_gbp": 10, "created_at": "2099-01-01"}))
    run(server.db.merch_items.insert_one({"item_id": "m_bumped", "seller_id": "u_reaper", "active": True, "stock": 3,
                                          "title": "Reaper tee", "price_gbp": 20, "created_at": "2000-01-01"}))
    run(server._apply_promo({"purchase_type": "merch_bump", "item_id": "m_bumped", "user_id": "u_reaper"}))
    items = client.get("/api/merch").json()["items"]
    assert items[0]["item_id"] == "m_bumped" and items[0]["bumped"]


def test_fans_on_pro_can_train_with_the_alias_only_with_consent():
    as_user(REAPER)
    assert client.put("/api/pro/alias-partner", json={"enabled": True, "consent": False}).status_code == 400
    r = client.put("/api/pro/alias-partner", json={"enabled": True, "consent": True, "style": "tough_love",
                                                   "look": "hooded reaper in lime gloves", "catchphrases": ["Reap what you sow"]}).json()
    assert r["avatar_url"].startswith("https://image.pollinations.ai/")
    as_user(FAN)
    assert client.post("/api/pro/u_reaper/train-with").status_code == 402, "a Pro feature"
    run(server.db.subscriptions.insert_one({"user_id": "u_fan", "status": "active", "subscription_id": "sub_fan"}))
    as_user(FAN)
    partner = client.post("/api/pro/u_reaper/train-with").json()["training_partner"]
    assert partner["name"] == "The Reaper" and partner["phrases"] == ["Reap what you sow"] and partner["alias_pro_id"] == "u_reaper"
    client.post("/api/pro/u_reaper/train-with")
    assert run(server.db.users.find_one({"user_id": "u_reaper"}))["pro"]["alias_partner"]["fans"] == 1


def test_clips_need_approval_and_fantasy_cards_show_the_pro():
    as_user(REAPER)
    client.put("/api/pro/clips", json={"moment": "round_start", "url": "https://res.cloudinary.com/x/start.mp4"})
    assert client.get("/api/pros/u_reaper").json()["clips"] == {}, "fans only see approved clips"
    as_user({"user_id": "u_admin"})
    client.post("/api/admin/pro/u_reaper/clips/round_start/approve")
    assert client.get("/api/pros/u_reaper").json()["clips"] == {"round_start": "https://res.cloudinary.com/x/start.mp4"}
    card = run(server.tag_victory_pros({"bouts": [{"fighters": [{"fighter_id": "bd_123", "name": "Lamont Roche"},
                                                                 {"fighter_id": "bd_9", "name": "Someone Else"}]}]}))
    fighters = card["bouts"][0]["fighters"]
    assert fighters[0]["victory_pro"] == {"user_id": "u_reaper", "alias": "The Reaper"} and "victory_pro" not in fighters[1]


if __name__ == "__main__":
    setup()
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"\n{len(tests)} passed")
