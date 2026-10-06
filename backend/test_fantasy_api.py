"""Self-check for the fantasy sync jobs and API, with the Boxing Data API and email mocked:

    MONGO_URL=x DB_NAME=t python3 backend/test_fantasy_api.py
"""
import asyncio

from fastapi.testclient import TestClient
from mongomock_motor import AsyncMongoMockClient

import server

server.db = AsyncMongoMockClient()["test"]
server.BOXING_DATA_API_KEY = "test-key"
server.FANTASY_FEED_SCOPE = "all"
server.RESEND_API_KEY = ""
ME = {"user_id": "u1", "email": "kid@x.co", "name": "Kid"}
ADMIN = {"user_id": "admin", "email": "hello@victoryai.co.uk", "name": "Admin"}
CURRENT = {"user": ME}
server.app.dependency_overrides[server.get_current_user] = lambda: CURRENT["user"]
client = TestClient(server.app)
run = asyncio.get_event_loop().run_until_complete

PRO = {"u1": False}
emails, pushes = [], []


async def fake_sub(user):
    return PRO.get(user["user_id"], False)


async def fake_email(subject, rows, reply_to=None):
    emails.append((subject, rows, reply_to))


async def fake_push(user_id, title, body, url="/live", tag=None):
    pushes.append((user_id, title))


async def no_squad(uid):
    return []


server.check_subscription = fake_sub
server._email_fantasy_admin = fake_email
server._send_push = fake_push
server._squad_mate_ids = no_squad


def fighter(fid, name, winner=False):
    return {"fighter_id": fid, "name": name, "full_name": name, "winner": winner}


def fight(fid, a, b, status="NOT_STARTED", outcome=None, rnd=None, winner=None, scores=None, titles=None):
    return {"id": fid, "status": status, "scheduled_rounds": 12, "division": {"name": "Heavyweight"},
            "titles": titles or [], "scores": scores or [],
            "results": {"outcome": outcome, "round": rnd} if outcome else None,
            "event": {"id": "ev1", "title": "Big Night", "date": "2099-01-01T19:00:00", "location": "London, England"},
            "fighters": {"fighter_1": fighter(a, a.upper(), winner == a), "fighter_2": fighter(b, b.upper(), winner == b)}}


FEED = {"schedule": [fight("b1", "fa", "fb"), fight("b2", "fc", "fd"),
                     {**fight("b9", "fx", "fy"), "event": {"id": "ev2", "location": "Las Vegas, USA"}}],
        "results": []}
STATS = {"fa": {"wins": 30, "losses": 1, "draws": 0, "ko_wins": 25, "total_bouts": 31},
         "fb": {"wins": 10, "losses": 8, "draws": 1, "ko_wins": 2, "total_bouts": 19}}


async def fake_bd_get(url, params=None):
    if "/v2/fighters/" in url:
        fid = url.rsplit("/", 1)[-1]
        return {"data": {"name": fid.upper(), "stats": STATS.get(fid, {"wins": 5, "losses": 5, "draws": 0, "total_bouts": 10})}}
    if "/v2/fights/schedule" in url:
        return {"data": FEED["schedule"], "pagination": {}}
    return {"data": FEED["results"], "pagination": {}}


server._bd_get = fake_bd_get


def test_sync_imports_only_qualifying_cards_with_formula_prices():
    out = run(server.sync_fantasy_cards())
    assert out == {"events_seen": 2, "cards_imported": 1}, "a non-title US card is skipped"
    card = run(server.db.fantasy_cards.find_one({"card_id": "fc_ev1"}))
    fa, fb = card["bouts"][0]["fighters"]
    assert card["reason"] == "uk" and fa["record"] == "30-1-0"
    assert fa["salary"] > fb["salary"] and 10 <= fb["salary"] and fa["salary"] <= 50


def test_save_stable_enforces_cap_and_lock():
    r = client.put("/api/fantasy/cards/fc_ev1/stable", json={"picks": ["fa", "fc"]})
    assert r.status_code == 200, r.text
    listing = client.get("/api/fantasy/cards").json()
    assert listing[0]["card_id"] == "fc_ev1" and listing[0]["entered"]
    bad = client.put("/api/fantasy/cards/fc_ev1/stable", json={"picks": ["fa", "fa", "fc"]})
    assert bad.status_code == 400 and "twice" in bad.json()["detail"]


def test_results_sync_scores_and_flags_unknown_outcomes():
    FEED["results"] = [fight("b1", "fa", "fb", "FINISHED", "KO", 3, winner="fa"),
                       fight("b2", "fc", "fd", "FINISHED", "WEIRD", 5, winner="fc")]
    card = run(server.db.fantasy_cards.find_one({"card_id": "fc_ev1"}, {"_id": 0}))
    assert run(server.sync_fantasy_results(card))
    card = run(server.db.fantasy_cards.find_one({"card_id": "fc_ev1"}, {"_id": 0}))
    assert card["status"] == "live", "the unknown result is held back, not guessed"
    assert emails and emails[-1][0] == "Result needs a check"
    locked = client.put("/api/fantasy/cards/fc_ev1/stable", json={"picks": ["fa", "fc"]})
    assert locked.status_code == 400
    board = client.get("/api/fantasy/cards/fc_ev1/leaderboard").json()
    assert board[0]["total"] == 30 and board[0]["isMe"], "KO win (20) + early finish (10)"


def test_admin_fixes_flagged_result_and_card_completes():
    CURRENT["user"] = ADMIN
    try:
        r = client.post("/api/admin/fantasy/cards/fc_ev1/bouts/b2/result",
                        json={"winner_index": 0, "method": "UD", "round": 12, "clean_sweep": True})
        assert r.json()["card_status"] == "complete"
    finally:
        CURRENT["user"] = ME
    assert ("u1", "Your team scored 55 points") in pushes
    run(server.sync_fantasy_results(run(server.db.fantasy_cards.find_one({"card_id": "fc_ev1"}, {"_id": 0}))))
    board = client.get("/api/fantasy/cards/fc_ev1/leaderboard").json()
    assert board[0]["total"] == 55, "the feed never overwrites an admin's correction"


def test_admin_endpoints_are_admin_only():
    assert client.post("/api/admin/fantasy/sync").status_code == 403


def test_private_leagues_are_a_pro_perk_but_joining_is_free():
    assert client.post("/api/fantasy/leagues", json={"name": "Gym crew"}).status_code == 403
    PRO["u1"] = True
    lg = client.post("/api/fantasy/leagues", json={"name": "Gym crew"}).json()
    CURRENT["user"] = {"user_id": "u2", "email": "f@x.co", "name": "Friend"}
    try:
        assert client.post("/api/fantasy/leagues/join", json={"code": lg["code"]}).status_code == 200
        mine = client.get("/api/fantasy/leagues/mine").json()
        assert mine[0]["code"] is None, "only the owner sees the invite code"
    finally:
        CURRENT["user"] = ME
    season = client.get("/api/fantasy/season", params={"league": lg["league_id"]}).json()
    assert season["standings"][0]["total"] == 55 and season["standings"][0]["cards"] == 1


def test_manual_amateur_card_uses_the_same_price_formula():
    CURRENT["user"] = ADMIN
    try:
        card = client.post("/api/admin/fantasy/cards", json={
            "title": "Club Show", "date": "2099-02-01", "bouts": [
                {"scheduled_rounds": 3, "fighters": [{"name": "A", "wins": 20, "losses": 2, "ko_wins": 5}, {"name": "B", "wins": 2, "losses": 6}]},
                {"scheduled_rounds": 3, "fighters": [{"name": "C"}, {"name": "D"}]}]}).json()
    finally:
        CURRENT["user"] = ME
    a, b = card["bouts"][0]["fighters"]
    assert card["reason"] == "amateur" and a["salary"] > b["salary"]
    c, d = card["bouts"][1]["fighters"]
    assert c["salary"] == d["salary"] == 30, "two debutants are an even fight"


def test_enquiries_email_the_admin_and_sponsors_must_be_halal():
    body = {"kind": "sponsor", "name": "Sam", "company": "Gloves Ltd", "email": "sam@gloves.co"}
    assert client.post("/api/fantasy/enquiries", json=body).status_code == 400
    assert client.post("/api/fantasy/enquiries", json={**body, "halal_confirmed": True}).status_code == 200
    assert emails[-1][2] == "sam@gloves.co" and "Gloves Ltd" in emails[-1][0]
    n = len(emails)
    client.post("/api/fantasy/enquiries", json={**body, "halal_confirmed": True, "website": "spam"})
    assert len(emails) == n, "the honeypot drops bots silently"


def test_cosmetics_are_requested_by_email_then_granted():
    assert client.post("/api/fantasy/cosmetics/gold_gloves/equip", json={}).status_code == 403
    assert client.post("/api/fantasy/cosmetics/gold_gloves/request").status_code == 200
    assert "Gold Gloves" in emails[-1][0]
    run(server.db.users.insert_one({**ME}))
    CURRENT["user"] = ADMIN
    try:
        assert client.post("/api/admin/fantasy/cosmetics/grant", json={"email": ME["email"], "cosmetic_id": "gold_gloves"}).status_code == 200
    finally:
        CURRENT["user"] = ME
    assert client.post("/api/fantasy/cosmetics/gold_gloves/equip", json={}).status_code == 200
    board = client.get("/api/fantasy/cards/fc_ev1/leaderboard").json()
    assert board[0]["cosmetic"] == "gold" and board[0]["total"] == 55, "cosmetics never change points"


if __name__ == "__main__":
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"\n{len(tests)} passed")
