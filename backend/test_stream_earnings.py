"""Self-check: gift subs really give Pro, and streamers keep 80% of what fans spend on their streams.

    MONGO_URL=x DB_NAME=t python3 backend/test_stream_earnings.py
"""
import asyncio
from datetime import datetime, timedelta, timezone

from mongomock_motor import AsyncMongoMockClient

import earnings as ern
import server

server.db = AsyncMongoMockClient()["test"]
pushes = []


async def fake_push(uid, **k):
    pushes.append((uid, k.get("title")))


async def not_flagged(text):
    return False

server._send_push = fake_push
server.is_content_flagged = not_flagged


class FakeWS:
    def __init__(self):
        self.sent = []

    async def send_text(self, msg):
        self.sent.append(msg)


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def watching(stream_id, *user_ids):
    for uid in user_ids:
        ws = FakeWS()
        server.ws_manager._conns.setdefault(stream_id, []).append(ws)
        server.ws_manager.mark_user(ws, stream_id, uid)


def setup():
    run(server.db.users.insert_many([
        {"user_id": "streamer", "birth_date": "1995-01-01", "token_balance": 0},
        {"user_id": "teen_streamer", "birth_date": "2011-01-01", "token_balance": 0},
        {"user_id": "fan", "birth_date": "2000-01-01", "token_balance": 5000, "name": "Fan"},
        {"user_id": "viewer_a", "birth_date": "2001-01-01"},
        {"user_id": "viewer_pro", "birth_date": "2001-01-01"},
        {"user_id": "late_viewer", "birth_date": "2002-01-01"},
    ]))
    run(server.db.streams.insert_many([{"stream_id": "s1", "user_id": "streamer"},
                                       {"stream_id": "s_teen", "user_id": "teen_streamer"}]))
    run(server.db.subscriptions.insert_one({"user_id": "viewer_pro", "status": "active", "source": "stripe"}))


def test_a_token_is_never_valued_above_what_it_brings_in():
    v = server.TOKEN_VALUE_PENCE
    for p in server.TOKEN_PACKAGES.values():
        assert v * p["tokens"] <= p["price"] * 100 / (1 + ern.VAT_RATE)
    assert ern.net_pence(499) == 388, "£4.99 less VAT (£0.83) and card fees (£0.27)"


def test_adult_streamers_earn_money_and_teens_earn_tokens():
    run(server.send_tip("s1", server.TipRequest(amount=100, message=""), user={"user_id": "fan", "token_balance": 5000}))
    row = run(server.db.stream_earnings.find_one({"user_id": "streamer"}))
    assert row["source"] == "tip" and row["share_pence"] == int(100 * server.TOKEN_VALUE_PENCE * 0.8)
    assert run(server.db.users.find_one({"user_id": "streamer"}))["token_balance"] == 0, "money, not tokens"
    run(server.send_tip("s_teen", server.TipRequest(amount=100, message=""), user={"user_id": "fan", "token_balance": 5000}))
    assert run(server.db.users.find_one({"user_id": "teen_streamer"}))["token_balance"] == 80
    assert run(server.db.stream_earnings.count_documents({"user_id": "teen_streamer"})) == 0, "under-18s can't cash out"


def test_gift_subs_give_a_month_of_pro_to_people_watching():
    watching("s1", "viewer_a", "viewer_pro", "fan", "streamer")
    assert run(server._gift_subs_paid("cs_gift", "fan", "s1", 3, "community", 1999)) is True
    sub = run(server.db.subscriptions.find_one({"user_id": "viewer_a", "source": "gift"}))
    assert sub["status"] == "active" and sub["expires_at"] > datetime.now(timezone.utc).isoformat()
    assert run(server.db.subscriptions.count_documents({"user_id": {"$in": ["fan", "streamer"]}, "source": "gift"})) == 0
    assert run(server.db.subscriptions.count_documents({"user_id": "viewer_pro", "source": "gift"})) == 0, "already Pro"
    assert run(server.db.gift_pools.find_one({"owner_id": "streamer"}))["remaining"] == 2, "the rest wait for the next viewer"
    earning = run(server.db.stream_earnings.find_one({"ref": "cs_gift"}))
    assert earning["share_pence"] == int(ern.net_pence(1999) * 0.8)
    assert ("viewer_a", "You've been gifted Pro") in pushes


def test_stripe_sending_the_same_payment_twice_changes_nothing():
    assert run(server._gift_subs_paid("cs_gift", "fan", "s1", 3, "community", 1999)) is False
    assert run(server.db.stream_earnings.count_documents({"ref": "cs_gift"})) == 1
    assert run(server.db.gift_pools.find_one({"owner_id": "streamer"}))["remaining"] == 2


def test_a_pooled_gift_goes_to_the_next_viewer_without_pro():
    run(server._claim_pooled_gift({"stream_id": "s1", "user_id": "streamer"}, {"user_id": "late_viewer"}))
    assert run(server.db.subscriptions.find_one({"user_id": "late_viewer", "source": "gift"}))
    run(server._claim_pooled_gift({"stream_id": "s1", "user_id": "streamer"}, {"user_id": "late_viewer"}))
    assert run(server.db.gift_pools.find_one({"owner_id": "streamer"}))["remaining"] == 1, "one gift each"


def test_gifted_pro_ends_after_a_month():
    run(server._expire_gift_pro(datetime.now(timezone.utc) + timedelta(days=ern.GIFT_PRO_DAYS + 1)))
    assert run(server.db.subscriptions.find_one({"user_id": "viewer_a", "source": "gift"}))["status"] == "expired"
    assert run(server.db.subscriptions.find_one({"user_id": "viewer_pro"}))["status"] == "active", "real subscriptions untouched"


def test_the_dashboard_splits_on_hold_ready_and_paid():
    now = datetime(2026, 11, 20, tzinfo=timezone.utc)
    rows = [
        {"source": "tip", "share_pence": 1500, "created_at": "2026-11-15T10:00:00+00:00", "available_at": "2026-11-29T10:00:00+00:00", "status": "on_hold"},
        {"source": "gift_sub", "share_pence": 900, "created_at": "2026-11-01T10:00:00+00:00", "available_at": "2026-11-15T10:00:00+00:00", "status": "on_hold"},
        {"source": "emote", "share_pence": 1200, "created_at": "2026-10-01T10:00:00+00:00", "available_at": "2026-10-15T10:00:00+00:00", "status": "on_hold"},
        {"source": "tip", "share_pence": 3000, "created_at": "2026-09-01T10:00:00+00:00", "available_at": "2026-09-15T10:00:00+00:00", "status": "paid"},
    ]
    s = ern.summarise(rows, now)
    assert s["this_month_pence"] == 2400 and s["by_source"]["tip"] == 1500
    assert s["on_hold_pence"] == 1500 and s["ready_pence"] == 2100 and s["paid_pence"] == 3000
    assert s["payout_due"] is True


def test_the_earnings_endpoint_tells_teens_they_cant_cash_out():
    out = run(server.my_earnings(user={"user_id": "teen_streamer", "birth_date": "2011-01-01"}))
    assert out["cash_out"] is False and out["share_pct"] == 80
    adult = run(server.my_earnings(user={"user_id": "streamer", "birth_date": "1995-01-01"}))
    assert adult["cash_out"] is True and adult["on_hold_pence"] > 0


class FakeTransfers:
    def __init__(self):
        self.calls, self.fail = [], False

    def create(self, **k):
        if self.fail:
            raise RuntimeError("insufficient funds")
        self.calls.append(k)
        return type("T", (), {"id": f"tr_{len(self.calls)}"})()


def test_streamers_with_20_pounds_ready_get_paid_once_a_month():
    transfers = FakeTransfers()
    server.stripe_lib.Transfer = transfers

    async def active(acct):
        return acct.get("stripe_account_id") == "acct_ok"
    server._payouts_active = active
    run(server.db.users.insert_many([
        {"user_id": "payee", "birth_date": "1990-01-01", "payout": {"stripe_account_id": "acct_ok", "ready": True}},
        {"user_id": "small", "birth_date": "1990-01-01", "payout": {"stripe_account_id": "acct_ok", "ready": True}},
        {"user_id": "no_bank", "birth_date": "1990-01-01"},
    ]))
    old = "2026-10-01T00:00:00+00:00"
    run(server.db.stream_earnings.insert_many([
        {"earning_id": "e1", "user_id": "payee", "share_pence": 1500, "status": "on_hold", "available_at": old},
        {"earning_id": "e2", "user_id": "payee", "share_pence": 900, "status": "on_hold", "available_at": old},
        {"earning_id": "e3", "user_id": "payee", "share_pence": 5000, "status": "on_hold", "available_at": "2026-12-30T00:00:00+00:00"},
        {"earning_id": "e4", "user_id": "small", "share_pence": 1999, "status": "on_hold", "available_at": old},
        {"earning_id": "e5", "user_id": "no_bank", "share_pence": 9000, "status": "on_hold", "available_at": old},
    ]))
    now = datetime(2026, 11, 5, tzinfo=timezone.utc)
    assert run(server.pay_streamers(now)) == 1
    assert [(c["amount"], c["destination"]) for c in transfers.calls] == [(2400, "acct_ok")], "only money past the hold"
    assert transfers.calls[0]["idempotency_key"] == "spo_payee_202611"
    assert run(server.db.stream_earnings.find_one({"earning_id": "e3"}))["status"] == "on_hold"
    assert run(server.db.stream_earnings.find_one({"earning_id": "e4"}))["status"] == "on_hold", "under £20 waits"
    assert run(server.db.stream_earnings.find_one({"earning_id": "e5"}))["status"] == "on_hold", "no bank set up yet"
    assert ("payee", "You've been paid") in pushes
    run(server.db.stream_earnings.update_one({"earning_id": "e3"}, {"$set": {"available_at": old}}))
    assert run(server.pay_streamers(now)) == 0, "one payout a month"
    assert run(server.pay_streamers(datetime(2026, 12, 1, tzinfo=timezone.utc))) == 1
    assert transfers.calls[-1]["amount"] == 5000


def test_a_failed_payout_is_retried_with_the_same_amount_and_key():
    transfers = FakeTransfers()
    transfers.fail = True
    server.stripe_lib.Transfer = transfers
    run(server.db.users.insert_one({"user_id": "retry", "birth_date": "1990-01-01", "payout": {"stripe_account_id": "acct_ok"}}))
    run(server.db.stream_earnings.insert_one({"earning_id": "r1", "user_id": "retry", "share_pence": 3000, "status": "on_hold",
                                             "available_at": "2026-10-01T00:00:00+00:00"}))
    now = datetime(2026, 11, 5, tzinfo=timezone.utc)
    assert run(server.pay_streamers(now)) == 0
    assert run(server.db.stream_payouts.find_one({"payout_id": "spo_retry_202611"}))["status"] == "pending"
    run(server.db.stream_earnings.insert_one({"earning_id": "r2", "user_id": "retry", "share_pence": 700, "status": "on_hold",
                                             "available_at": "2026-10-02T00:00:00+00:00"}))
    transfers.fail = False
    assert run(server.pay_streamers(now)) == 1
    assert transfers.calls == [{**transfers.calls[0], "amount": 3000, "idempotency_key": "spo_retry_202611"}]
    assert run(server.db.stream_earnings.find_one({"earning_id": "r1"}))["status"] == "paid"
    assert run(server.db.stream_earnings.find_one({"earning_id": "r2"}))["status"] == "on_hold", "waits for next month"


def test_a_pro_who_streams_is_paid_into_their_fighter_account():
    acct = server._payout_account({"pro": {"stripe_account_id": "acct_pro", "stripe_account_v2": True, "payouts_ready": True},
                                   "payout": {"stripe_account_id": "acct_other"}})
    assert acct["stripe_account_id"] == "acct_pro" and acct["ready"] and acct["field"] == "pro.payouts_ready"


if __name__ == "__main__":
    setup()
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"\n{len(tests)} passed")
