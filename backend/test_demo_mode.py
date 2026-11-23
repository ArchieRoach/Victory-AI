"""Self-check: the promo filming account lives in its own database. Its sample history is built
through the app's real rules, and none of it ever reaches the real database, real boards or caches.

    MONGO_URL=x DB_NAME=t python3 backend/test_demo_mode.py
"""
import asyncio
import os
from types import SimpleNamespace

from fastapi.testclient import TestClient
from mongomock_motor import AsyncMongoMockClient

os.environ["DEMO_ACCOUNT_EMAILS"] = "promo@example.com,fan@example.com"

import demo_mode
import server
from cache import cache

mongo = AsyncMongoMockClient()
REAL, DEMO = mongo["real"], mongo["real_demo"]
server.db = demo_mode.DbRouter(REAL, DEMO)
server.is_content_flagged = lambda text: asyncio.sleep(0, result=False)


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def request(path="/api/auth/me"):
    return SimpleNamespace(url=SimpleNamespace(path=path))


STAR = {"user_id": "user_star", "email": "promo@example.com", "name": "Archie Roach"}
FAN = {"user_id": "user_fan", "email": "fan@example.com", "name": "Nour"}


def in_demo(coro_fn):
    async def go():
        token = demo_mode.enter(True)
        try:
            return await coro_fn()
        finally:
            demo_mode.leave(token)
    return run(go())


def test_the_filming_account_gets_a_full_sample_world_in_its_own_database():
    async def login():
        return await server._enter_demo(request(), STAR)
    user = in_demo(login)
    assert user["user_id"] == "demo_user_star" and user["demo"] is True
    assert user["pro"]["status"] == "verified" and user["pro"]["alias"]

    sessions = run(DEMO.sessions.count_documents({"user_id": "demo_user_star"}))
    assert sessions == 31
    streak, _ = server._compute_streaks(run(DEMO.sessions.find({"user_id": "demo_user_star"}).to_list(100)))
    assert streak >= 30, streak
    squad = run(DEMO.squads.find_one({"squad_id": "squad_demo"}))
    assert len(squad["members"]) == 5
    assert run(DEMO.run_clubs.find_one({"club_id": "rc_demo"}))["gym_id"] == "gym_demo"
    assert run(DEMO.merch_items.count_documents({"seller_id": "demo_user_star", "active": True})) == 3
    assert run(DEMO.weekly_stats.count_documents({})) >= 5, "points come from the real rewards code"
    assert run(DEMO.stream_earnings.count_documents({"user_id": "demo_user_star"})) == 5


def test_nothing_reaches_the_real_database():
    for name in ("users", "sessions", "squads", "gyms", "run_clubs", "merch_items", "weekly_stats",
                 "season_stats", "stream_earnings", "merch_orders", "follows"):
        assert run(REAL[name].count_documents({})) == 0, f"demo data leaked into real {name}"


def test_real_boards_and_market_never_show_demo_people():
    client = TestClient(server.app)
    real_user = {"user_id": "real_1", "name": "Real Person", "email": "real@example.com"}
    run(REAL.users.insert_one(dict(real_user)))
    server.app.dependency_overrides[server.get_current_user] = lambda: real_user
    try:
        ranks = client.get("/api/ranks", params={"scope": "global"}).json()
        names = [r["name"] for r in ranks.get("rows", []) + ranks.get("top", [])]
        assert not any("Jay" in n or "Mia" in n or "Kofi" in n for n in names), names
        market = client.get("/api/merch").json()
        assert not any(i.get("seller_id", "").startswith("demo_") for i in market.get("items", []))
    finally:
        server.app.dependency_overrides.clear()


def test_a_second_filming_phone_is_a_fan_with_tokens_in_the_squad():
    async def login():
        return await server._enter_demo(request(), FAN)
    fan = in_demo(login)
    assert fan["user_id"] == "demo_user_fan" and fan["token_balance"] == 2500
    assert "demo_user_fan" in run(DEMO.squads.find_one({"squad_id": "squad_demo"}))["members"]


def test_payments_are_switched_off_in_demo_mode():
    async def pay():
        return await server._enter_demo(request("/api/payments/checkout"), STAR)
    try:
        in_demo(pay)
        assert False, "should refuse"
    except server.HTTPException as e:
        assert e.status_code == 403


def test_demo_cache_answers_never_reach_real_users():
    async def put():
        await cache.set("leaderboard:test", {"who": "demo"}, 60)
    in_demo(put)
    assert run(cache.get("leaderboard:test")) is None


def test_background_jobs_for_the_demo_account_use_the_demo_database():
    async def queue():
        import jobs
        return await jobs.enqueue(server.db, "noop_test", {"x": 1})
    job_id = in_demo(queue)
    assert run(DEMO.jobs.find_one({"job_id": job_id})) and not run(REAL.jobs.find_one({"job_id": job_id}))


if __name__ == "__main__":
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"\n{len(tests)} passed")
