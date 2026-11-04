"""Self-check: the waitlist's early-access email goes out once, on time, to everyone who wants it.

    MONGO_URL=x DB_NAME=t python3 backend/test_launch_email.py
"""
import asyncio
from datetime import datetime, timezone
from types import SimpleNamespace

from fastapi.testclient import TestClient
from mongomock_motor import AsyncMongoMockClient

import jobs
import launch_email
import server

server.db = AsyncMongoMockClient()["test"]
db = server.db
server.RESEND_API_KEY = "re_test"
server.LAUNCH_EMAIL_AT = "2026-11-30T08:00:00+00:00"
client = TestClient(server.app)
sent = []


class FakeResend:
    def __init__(self, *a, **k):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def post(self, url, **k):
        sent.append((url, k["json"]))
        return SimpleNamespace(status_code=200, text="")


server.httpx.AsyncClient = FakeResend


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


BEFORE = datetime(2026, 11, 30, 7, 0, tzinfo=timezone.utc)
AFTER = datetime(2026, 11, 30, 8, 0, tzinfo=timezone.utc)


def setup():
    run(db.waitlist.insert_many(
        [{"email": f"fan{i}@example.com", "name": f"Fan {i}", "promo_code": None} for i in range(150)]
        + [{"email": "founder@example.com", "name": "Amir Khan", "promo_code": "FOUNDERAB12"},
           {"email": "gone@example.com", "name": "Gone", "unsubscribed": True}]))


def test_it_is_off_until_switched_on_in_railway():
    import os
    assert os.environ.get("LAUNCH_EMAIL_AT") is None and "off" in open(server.__file__).read().split("LAUNCH_EMAIL_AT = ")[1][:60]


def test_nothing_goes_out_before_launch_morning():
    assert run(server.send_launch_emails(BEFORE)) == 0


def test_everyone_gets_it_once_in_batches_of_100():
    assert run(server.send_launch_emails(AFTER)) == 151
    run(jobs.drain(db))
    batches = [body for url, body in sent if url.endswith("/emails/batch")]
    assert [len(b) for b in batches] == [100, 51]
    to = [m["to"][0] for b in batches for m in b]
    assert len(set(to)) == 151 and "gone@example.com" not in to, "unsubscribed people are skipped"
    assert run(server.send_launch_emails(AFTER)) == 0, "a second run sends nothing"


def test_founders_hear_about_their_perk_and_everyone_gets_one_button():
    founder = next(m for url, b in sent for m in b if m["to"] == ["founder@example.com"])
    assert "You're in, Amir." in founder["html"] and "founding member" in founder["html"]
    assert "Sign up with <b>founder@example.com</b>" in founder["html"]
    assert founder["html"].count("Start training") == 1
    assert founder["headers"]["List-Unsubscribe-Post"] == "List-Unsubscribe=One-Click"
    fan = next(m for url, b in sent for m in b if m["to"] == ["fan1@example.com"])
    assert "founding member" not in fan["html"] and "14 days" in fan["html"]


def test_founders_see_their_code_and_discount():
    founder = next(m for url, b in sent for m in b if m["to"] == ["founder@example.com"])
    assert "FOUNDERAB12" in founder["html"] and "added for you at checkout" in founder["html"]


def test_joining_sends_the_welcome_email_and_no_longer_calls_n8n():
    before = len(sent)
    server.LAUNCH_EMAIL_AT = "2099-01-01T00:00:00+00:00"
    server._founder_coupon_cache["coupon"] = {"percent_off": 40}
    server.STRIPE_FOUNDERS_COUPON_ID = ""
    r = client.post("/api/waitlist/signup", json={"name": "Nia Bell", "email": "nia@example.com"})
    assert r.status_code == 200, r.text
    run(jobs.drain(db))
    new = sent[before:]
    assert all("n8n" not in url for url, _ in new)
    welcome = [body for url, body in new if url.endswith("/emails")]
    assert len(welcome) == 1 and welcome[0]["subject"] == launch_email.WELCOME_SUBJECT
    assert "You're on the list, Nia." in welcome[0]["html"] and "nia@example.com" in welcome[0]["html"]
    server.LAUNCH_EMAIL_AT = "2026-11-30T08:00:00+00:00"


def test_people_who_join_after_launch_get_the_youre_in_email_straight_away():
    before = len(sent)
    server.LAUNCH_EMAIL_AT = "2026-01-01T00:00:00+00:00"
    r = client.post("/api/waitlist/signup", json={"name": "Late", "email": "late2@example.com"})
    assert r.status_code == 200
    run(jobs.drain(db))
    subjects = [body["subject"] for url, body in sent[before:] if url.endswith("/emails")]
    assert subjects == [launch_email.SUBJECT]
    assert run(server.send_launch_emails(AFTER)) == 1, "only Nia (who joined before launch) is still owed one"
    assert run(db.waitlist.find_one({"email": "late2@example.com"}))["launch_email_at"]
    server.LAUNCH_EMAIL_AT = "2026-11-30T08:00:00+00:00"


def test_founder_wording_with_a_discount():
    line = launch_email.founder_perk(True, "FOUNDERX", 40, 14, 30)
    assert line == "You're a founding member: 30 days of Pro free, then 40% off Pro for as long as you stay subscribed. Your code is FOUNDERX; it's added for you at checkout."


def test_people_who_joined_while_the_discount_was_missing_get_their_founder_code():
    made = []
    server.STRIPE_API_KEY = "sk_test"
    server.STRIPE_FOUNDERS_COUPON_ID = "FOUNDERS40"
    real = getattr(server.stripe_lib, "PromotionCode", None)
    server.stripe_lib.PromotionCode = SimpleNamespace(create=lambda **k: made.append(k) or SimpleNamespace(code=k["code"]))
    server.db = fresh = AsyncMongoMockClient()["backfill"]
    try:
        run(fresh.waitlist.insert_many([{"email": "first@x.com", "created_at": "2026-11-01"},
                                     {"email": "second@x.com", "created_at": "2026-11-02"},
                                     {"email": "had@x.com", "promo_code": "FOUNDEROLD1", "created_at": "2026-10-01"}]))
        assert run(server.backfill_founder_codes()) == 2
        assert run(server.backfill_founder_codes()) == 0, "only once"
        assert all(k["promotion"] == {"type": "coupon", "coupon": "FOUNDERS40"} and "coupon" not in k
                   and k["max_redemptions"] == 1 for k in made), "the shape Stripe's current API accepts"
        assert run(fresh.waitlist.find_one({"email": "first@x.com"}))["promo_code"].startswith("FOUNDER")
        assert run(fresh.waitlist.find_one({"email": "had@x.com"}))["promo_code"] == "FOUNDEROLD1"
    finally:
        server.db = db
        server.stripe_lib.PromotionCode = real
        server.STRIPE_FOUNDERS_COUPON_ID = ""


def test_the_unsubscribe_link_works_and_cant_be_forged():
    url = launch_email.unsubscribe_url("", "fan2@example.com", server.JWT_SECRET)
    assert client.get("/api/waitlist/unsubscribe?e=fan2@example.com&t=wrong").status_code == 400
    assert client.get(url).status_code == 200
    assert run(db.waitlist.find_one({"email": "fan2@example.com"}))["unsubscribed"] is True


def test_it_can_be_held_back():
    server.LAUNCH_EMAIL_AT = "off"
    run(db.waitlist.insert_one({"email": "late@example.com"}))
    assert run(server.send_launch_emails(AFTER)) == 0


if __name__ == "__main__":
    setup()
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"\n{len(tests)} passed")
