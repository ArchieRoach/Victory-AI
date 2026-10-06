"""Self-check for fight camp, the buddy timetable, amateur records and amateur fantasy cards:

    MONGO_URL=x DB_NAME=t python3 backend/test_amateur_camp.py
"""
import asyncio
from datetime import date, timedelta

from fastapi.testclient import TestClient
from mongomock_motor import AsyncMongoMockClient

import server

server.db = AsyncMongoMockClient()["test"]
run = asyncio.get_event_loop().run_until_complete
TODAY = {"d": date(2026, 10, 6)}
server._uk_today = lambda: TODAY["d"]

ADULT = {"user_id": "a1", "email": "a@x.co", "name": "Adam", "birth_date": "2000-01-01", "gym_id": "gym_1",
         "amateur_wins": 4, "amateur_losses": 1, "amateur_draws": 0, "training_partner": {"name": "Coach Ray"}}
TEEN = {"user_id": "t1", "email": "t@x.co", "name": "Tia", "birth_date": "2011-05-05", "gym_id": "gym_1"}
OWNER = {"user_id": "o1", "email": "o@x.co", "name": "Owner", "birth_date": "1980-01-01", "gym_id": "gym_1"}
STRANGER = {"user_id": "s1", "email": "s@x.co", "name": "Sam", "birth_date": "1995-01-01", "gym_id": "gym_2"}
CURRENT = {"user": ADULT}
server.app.dependency_overrides[server.get_current_user] = lambda: CURRENT["user"]
client = TestClient(server.app)
pushes = []


async def fake_push(user_id, title, body, url="/live", tag=None):
    pushes.append((user_id, title, body))


async def no_flags(text):
    return False


async def no_squad(uid):
    return []


server._send_push = fake_push
server.is_content_flagged = no_flags
server._squad_mate_ids = no_squad
run(server.db.users.insert_many([dict(ADULT), dict(TEEN), dict(OWNER), dict(STRANGER)]))
run(server.db.gyms.insert_one({"gym_id": "gym_1", "name": "Rays ABC", "owner_id": "o1", "members": ["a1", "t1", "o1"], "city": "Leeds"}))


def as_user(u):
    CURRENT["user"] = run(server.db.users.find_one({"user_id": u["user_id"]}, {"_id": 0}))


def fight_body(days, **kw):
    return {"date": (TODAY["d"] + timedelta(days=days)).isoformat(), "event_name": "Club Show", "opponent_name": "Ben Jones",
            "opponent_record": {"wins": 2, "losses": 3}, "target_weight_kg": 64, "camp_goals": ["sharper jab"], **kw}


def test_booking_a_fight_makes_a_fantasy_card_priced_from_records():
    as_user(ADULT)
    f = client.post("/api/amateur/fights", json=fight_body(30)).json()
    assert f["prompts_sent"] == [42], "checkpoints already passed never fire late"
    card = run(server.db.fantasy_cards.find_one({"card_id": f["card_id"]}, {"_id": 0}))
    me, them = card["bouts"][0]["fighters"]
    assert card["title"] == "Rays ABC fight week" and card["stable_size"] == 1 and card["salary_cap"] == 50
    assert me["salary"] > them["salary"] and "private_to" not in card, "an adult with a public profile is public"
    assert client.put(f"/api/fantasy/cards/{card['card_id']}/stable", json={"picks": [me["fighter_id"]]}).status_code == 200


def test_under_18_cards_are_private_to_gym_and_squad():
    as_user(TEEN)
    f = client.post("/api/amateur/fights", json=fight_body(10)).json()
    card = run(server.db.fantasy_cards.find_one({"card_id": f["card_id"]}, {"_id": 0}))
    assert "private_to" in card and "t1" in card["private_to"] and "a1" in card["private_to"]
    as_user(STRANGER)
    assert client.get(f"/api/fantasy/cards/{card['card_id']}").status_code == 404
    assert all(c["card_id"] != card["card_id"] for c in client.get("/api/fantasy/cards").json())


def test_buddy_checks_in_on_the_camp_timetable_once():
    pushes.clear()
    TODAY["d"] += timedelta(days=2)  # 28 days out: the first camp checkpoint
    run(server.run_buddy_timetable())
    run(server.run_buddy_timetable())
    adult_msgs = [p for p in pushes if p[0] == "a1"]
    assert len(adult_msgs) == 1 and adult_msgs[0][1] == "Coach Ray" and "sharper jab" in adult_msgs[0][2]


def test_checkin_reply_uses_only_real_numbers_and_never_coaches_cutting():
    as_user(ADULT)
    fid = client.get("/api/amateur/me").json()["next_fight"]["fight_id"]
    client.post(f"/api/amateur/fights/{fid}/checkin", json={"sessions": 3, "sparring_rounds": 6, "weight_kg": 66.5})
    r = client.post(f"/api/amateur/fights/{fid}/checkin", json={"sessions": 4, "sparring_rounds": 8, "weight_kg": 65.0, "energy": 2}).json()
    text = r["reply"]["text"]
    assert "up from 3" in text and "14 sparring rounds" in text and "1.0 kg above" in text
    assert "never by drying out" in text and "Rest is training too" in text
    me = client.get("/api/amateur/me").json()
    assert not any(m["action"] == "checkin" and not m["done"] for m in me["messages"]), "answering clears the prompt"


def test_result_updates_record_once_and_scores_the_fantasy_card():
    as_user(ADULT)
    fid = client.get("/api/amateur/me").json()["next_fight"]["fight_id"]
    assert client.post(f"/api/amateur/fights/{fid}/result", json={"outcome": "win", "method": "UD"}).status_code == 400, "not before fight day"
    TODAY["d"] = date(2026, 10, 6) + timedelta(days=31)
    pushes.clear()
    run(server.run_buddy_timetable())
    assert any(p[0] == "a1" and "How did it go" in p[2] for p in pushes)
    r = client.post(f"/api/amateur/fights/{fid}/result", json={"outcome": "win", "method": "TKO", "round": 2}).json()
    assert r["record"]["wins"] == 5 and "5-1-0" in r["reply"]["text"]
    assert client.post(f"/api/amateur/fights/{fid}/result", json={"outcome": "win", "method": "TKO"}).status_code == 400
    assert client.get("/api/amateur/me").json()["record"]["wins"] == 5, "a double-tap never counts twice"
    card = run(server.db.fantasy_cards.find_one({"bouts.bout_id": fid}, {"_id": 0}))
    board = client.get(f"/api/fantasy/cards/{card['card_id']}/leaderboard").json()
    assert card["status"] == "complete" and board[0]["total"] == 30, "TKO win in round 2: 20 + 10"


def test_gym_owner_verifies_and_a_changed_record_shows_unverified():
    as_user(OWNER)
    queue = client.get("/api/amateur/verify-queue").json()
    assert [q["user_id"] for q in queue] == ["a1"]
    assert client.post("/api/amateur/verify/a1").json()["record"]["verified_by"] == "Rays ABC"
    assert client.post("/api/amateur/verify/s1").status_code == 404
    as_user(ADULT)
    assert client.get("/api/amateur/me").json()["record"]["verified"]
    rec = client.put("/api/amateur/record", json={"wins": 9, "losses": 1}).json()
    assert not rec["verified"] and rec["last_verified"]["wins"] == 5
    as_user(STRANGER)
    assert client.get("/api/amateur/verify-queue").status_code == 403


def test_partner_finder_hides_under_18s_outside_their_gym():
    for u in (ADULT, TEEN):
        as_user(u)
        client.put("/api/amateur/open-to", json={"open_to": ["sparring"]})
    as_user(STRANGER)
    assert [p["user_id"] for p in client.get("/api/amateur/partners").json()] == ["a1"]
    as_user(OWNER)
    found = client.get("/api/amateur/partners").json()
    assert {p["user_id"] for p in found} == {"a1", "t1"} and all(p["same_gym"] for p in found)


if __name__ == "__main__":
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"\n{len(tests)} passed")
