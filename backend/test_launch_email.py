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
    import importlib, os
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
