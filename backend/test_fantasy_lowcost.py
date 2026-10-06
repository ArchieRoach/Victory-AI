"""Self-check for the low-cost data mode: request budget, world-title-only feed, clock
locking, fight-night-only result checks, and promoter-submitted cards:

    MONGO_URL=x DB_NAME=t python3 backend/test_fantasy_lowcost.py
"""
import asyncio
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from mongomock_motor import AsyncMongoMockClient

import server

server.db = AsyncMongoMockClient()["test"]
server.BOXING_DATA_API_KEY = "k"
server.BOXING_DATA_MONTHLY_LIMIT = 5
run = asyncio.get_event_loop().run_until_complete
ADMIN = {"user_id": "admin", "email": "archieroach2013@gmail.com", "name": "Admin"}
ME = {"user_id": "u1", "email": "kid@x.co", "name": "Kid"}
CURRENT = {"user": ME}
server.app.dependency_overrides[server.get_current_user] = lambda: CURRENT["user"]
client = TestClient(server.app)
emails, calls = [], []


async def fake_email(subject, rows, reply_to=None):
    emails.append(subject)


async def no_flags(text):
    return False


server._email_fantasy_admin = fake_email
server.is_content_flagged = no_flags


class FakeResp:
    def __init__(self, data):
        self._d = data

    def raise_for_status(self):
        pass

    def json(self):
        return self._d


def fight(fid, event, location, titles=()):
    return {"id": fid, "status": "NOT_STARTED", "scheduled_rounds": 12, "titles": [{"name": t} for t in titles],
            "event": {"id": event, "title": event, "date": "2099-01-01T20:00:00", "location": location},
            "fighters": {"fighter_1": {"fighter_id": f"{fid}a", "name": "A"}, "fighter_2": {"fighter_id": f"{fid}b", "name": "B"}}}


class FakeClient:
    def __init__(self, *a, **k):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        pass

    async def get(self, url, params=None, headers=None):
        calls.append(url)
        if "schedule" in url:
            return FakeResp({"data": [fight("x1", "uk_show", "Bolton, England"),
                                      fight("x2", "title_night", "Riyadh, Saudi Arabia", ["WBC World Heavyweight Title"])]})
        return FakeResp({"data": {"stats": {"wins": 10, "losses": 1}}})


server.httpx.AsyncClient = FakeClient


def test_low_cost_mode_imports_world_titles_only_with_small_card_rules():
    out = run(server.sync_fantasy_cards())
    assert out["cards_imported"] == 1
    card = run(server.db.fantasy_cards.find_one({"card_id": "fc_title_night"}))
    assert card["reason"] == "world_title" and card["stable_size"] == 1 and card["salary_cap"] == 50, \
        "a one-fight card is 'pick the winner'"


def test_request_budget_stops_the_feed_and_warns_the_admin():
    # The import above used 3 of 5 (schedule + 2 fighters; the UK show's fighters aren't fetched).
    assert len(calls) == 3
    try:
        for _ in range(5):
            run(server._bd_get("/v2/fights/schedule"))
        raise AssertionError("budget should have stopped the feed")
    except server.FeedBudgetSpent:
        pass
    assert len(calls) == 5, "no request is made past the limit"
    assert any("5 of 5" in e for e in emails) and any("4 of 5" in e for e in emails)


def test_picks_lock_on_the_clock_without_a_feed_call():
    n = len(calls)
    assert run(server.lock_started_cards(datetime(2099, 1, 1, 20, 1, tzinfo=timezone.utc))) == 1
    card = run(server.db.fantasy_cards.find_one({"card_id": "fc_title_night"}))
    assert card["status"] == "live" and len(calls) == n


def test_results_are_only_checked_on_fight_night_and_the_morning_after():
    card = {"date": "2099-01-01T20:00:00"}
    at = lambda h: datetime(2099, 1, 1, 20, tzinfo=timezone.utc) + timedelta(hours=h)
    assert not server.results_due(card, at(-1)), "not before the first bell"
    assert server.results_due(card, at(1))
    assert not server.results_due({**card, "results_checked_at": at(1).isoformat()}, at(2)), "90 minutes apart"
    assert server.results_due({**card, "results_checked_at": at(1).isoformat()}, at(2.6))
    assert not server.results_due({**card, "results_checked_at": at(11).isoformat()}, at(15)), "quiet overnight"
    assert server.results_due({**card, "results_checked_at": at(11).isoformat()}, at(19)), "one morning-after check"
    assert not server.results_due({**card, "results_checked_at": at(19).isoformat()}, at(30))


def test_promoter_sends_a_card_admin_publishes_promoter_enters_results():
    body = {"kind": "promoter", "name": "Pat", "company": "North Box Promotions", "email": "pat@nb.co",
            "event_name": "Bolton Fight Night", "card": {"date": "2099-02-01", "location": "Bolton, England", "bouts": [
                {"scheduled_rounds": 6, "fighters": [{"name": "Lee", "wins": 8}, {"name": "Kay", "wins": 3, "losses": 5}]},
                {"scheduled_rounds": 4, "fighters": [{"name": "Max", "wins": 1}, {"name": "Rob"}]}]}}
    assert client.post("/api/fantasy/enquiries", json=body).json()["card_submitted"]
    draft = run(server.db.fantasy_cards.find_one({"source": "promoter"}, {"_id": 0}))
    assert draft["hidden"] and draft["stable_size"] == 2
    assert all(c["card_id"] != draft["card_id"] for c in client.get("/api/fantasy/cards").json()), "hidden until checked"
    assert client.post(f"/api/fantasy/promoter/{draft['card_id']}/start", params={"t": "wrong"}).status_code == 404
    CURRENT["user"] = ADMIN
    try:
        link = client.post(f"/api/admin/fantasy/cards/{draft['card_id']}/publish").json()["results_link"]
    finally:
        CURRENT["user"] = ME
    assert draft["results_token"] in link
    assert any(c["card_id"] == draft["card_id"] for c in client.get("/api/fantasy/cards").json())
    lee = draft["bouts"][0]["fighters"][0]["fighter_id"]
    rob = draft["bouts"][1]["fighters"][1]["fighter_id"]
    saved = client.put(f"/api/fantasy/cards/{draft['card_id']}/stable", json={"picks": [lee, rob]})
    assert saved.status_code == 200, saved.text
    t = {"t": draft["results_token"]}
    assert client.post(f"/api/fantasy/promoter/{draft['card_id']}/start", params=t).json()["card_status"] == "live"
    for bout, winner in zip(draft["bouts"], (0, 1)):
        r = client.post(f"/api/fantasy/promoter/{draft['card_id']}/bouts/{bout['bout_id']}/result", params=t,
                        json={"winner_index": winner, "method": "KO", "round": 1})
    assert r.json()["card_status"] == "complete"
    board = client.get(f"/api/fantasy/cards/{draft['card_id']}/leaderboard").json()
    assert board[0]["total"] == 60, "Lee and the underdog Rob both win by round-1 KO: 2 × (20 + 10)"


if __name__ == "__main__":
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"\n{len(tests)} passed")
