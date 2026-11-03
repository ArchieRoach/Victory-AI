"""Self-check: slow work runs in background jobs that retry, and shared answers are cached
without a cache problem ever breaking a request.

    MONGO_URL=x DB_NAME=t python3 backend/test_jobs_and_cache.py
"""
import asyncio
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from fastapi.testclient import TestClient
from mongomock_motor import AsyncMongoMockClient

import jobs
import server
from cache import Cache

server.db = AsyncMongoMockClient()["test"]
db = server.db
current = {"user": {"user_id": "fan", "name": "Fan", "email": "fan@example.com"}}
server.app.dependency_overrides[server.get_current_user] = lambda: current["user"]
client = TestClient(server.app)


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


calls = []


@jobs.handler("flaky")
async def flaky(payload):
    calls.append(payload)
    if len(calls) < payload["fail_times"] + 1:
        raise RuntimeError("down")
    return {"ok": True}


def make_due():
    run(db.jobs.update_many({"status": "queued"}, {"$set": {"run_after": "2000-01-01T00:00:00+00:00"}}))


def test_a_failing_job_is_retried_then_succeeds():
    calls.clear()
    jid = run(jobs.enqueue(db, "flaky", {"fail_times": 1}))
    run(jobs.drain(db))
    job = run(db.jobs.find_one({"job_id": jid}))
    assert job["status"] == "queued" and job["run_after"] > datetime.now(timezone.utc).isoformat(), "waits before retrying"
    make_due()
    run(jobs.drain(db))
    assert run(db.jobs.find_one({"job_id": jid}))["status"] == "done"


def test_a_job_that_keeps_failing_stops_after_three_tries():
    calls.clear()
    jid = run(jobs.enqueue(db, "flaky", {"fail_times": 99}))
    for _ in range(5):
        run(jobs.drain(db))
        make_due()
    job = run(db.jobs.find_one({"job_id": jid}))
    assert job["status"] == "failed" and job["attempts"] == 3 and len(calls) == 3


def test_a_job_left_running_by_a_crashed_server_runs_again():
    calls.clear()
    old = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
    run(db.jobs.insert_one({"job_id": "stuck", "kind": "flaky", "payload": {"fail_times": 0}, "status": "running",
                            "attempts": 1, "run_after": old, "started_at": old}))
    run(jobs.drain(db))
    assert run(db.jobs.find_one({"job_id": "stuck"}))["status"] == "done"


def test_feedback_answers_at_once_and_the_email_goes_out_in_the_background():
    sent = []

    class FakeResend:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, url, **k):
            sent.append(k["json"]["subject"])
            return SimpleNamespace(status_code=200)

    server.RESEND_API_KEY = "re_test"
    real_client = server.httpx.AsyncClient
    server.httpx.AsyncClient = FakeResend
    try:
        r = client.post("/api/feedback", json={"type": "idea", "message": "More combos please", "rating": 5})
        assert r.status_code == 200, r.text
        assert sent == [], "the request doesn't wait for the email"
        run(jobs.drain(db))
        assert len(sent) == 1 and "Fan" in sent[0]
    finally:
        server.httpx.AsyncClient = real_client


def test_the_cache_works_answers_out_once():
    c = Cache()
    n = []

    async def compute():
        n.append(1)
        return {"top": [1, 2, 3]}
    assert run(c.remember("k", 60, compute)) == {"top": [1, 2, 3]}
    assert run(c.remember("k", 60, compute)) == {"top": [1, 2, 3]}
    assert len(n) == 1
    run(c.delete("k"))
    run(c.remember("k", 60, compute))
    assert len(n) == 2


def test_redis_being_down_never_breaks_a_request():
    c = Cache("redis://127.0.0.1:1/0")

    async def compute():
        return {"fresh": True}
    assert run(c.remember("k", 60, compute)) == {"fresh": True}


def test_the_leaderboard_is_shared_but_still_marks_you():
    run(db.users.insert_many([{"user_id": "a", "name": "Amir Khan"}, {"user_id": "b", "name": "Bea"}]))
    run(db.sessions.insert_many([{"user_id": "a", "overall_score": 8}, {"user_id": "b", "overall_score": 6}]))
    current["user"] = {"user_id": "b", "name": "Bea"}
    first = client.get("/api/leaderboard").json()
    run(db.sessions.insert_one({"user_id": "b", "overall_score": 10}))
    current["user"] = {"user_id": "a", "name": "Amir Khan"}
    second = client.get("/api/leaderboard").json()
    rows = second["leaderboard"] if isinstance(second, dict) else second
    assert [r["display_name"] for r in rows][:2] == ["Amir K.", "Bea"], "same table for a minute"
    assert rows[0]["is_current_user"] and not rows[1]["is_current_user"]
    assert first != second


def test_a_down_rates_site_is_not_asked_on_every_price_request():
    tries = []

    class DownFx:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def get(self, url):
            tries.append(url)
            raise ConnectionError("down")

    real_client = server.httpx.AsyncClient
    server.httpx.AsyncClient = DownFx
    server._fx_cache.update(at=0.0, data=None, failed_at=0)
    try:
        run(server.gbp_rates())
        run(server.gbp_rates())
    finally:
        server.httpx.AsyncClient = real_client
    assert len(tries) == 1


if __name__ == "__main__":
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"\n{len(tests)} passed")
