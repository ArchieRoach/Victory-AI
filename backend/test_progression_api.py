"""Self-check for status, ranks, quests, treasures, trophy shelf and mentors against an
in-memory Mongo:

    MONGO_URL=x DB_NAME=t python3 backend/test_progression_api.py
"""
import asyncio

from fastapi.testclient import TestClient
from mongomock_motor import AsyncMongoMockClient

import gamification as gx
import server

server.db = AsyncMongoMockClient()["test"]
pushes = []


async def fake_push(user_id, title, body, url="/live", tag=None):
    pushes.append((user_id, title))


async def not_flagged(text):
    return "badword" in text

server._send_push = fake_push
server.is_content_flagged = not_flagged
current = {}
server.app.dependency_overrides[server.get_current_user] = lambda: current["user"]
client = TestClient(server.app)

ADULT = "1995-01-01"
KID = "2012-01-01"
ARCHIE = {"user_id": "u_archie", "name": "Archie Roach", "birth_date": ADULT, "experience_level": "beginner",
          "gym_id": "gym_1", "created_at": "2026-09-01T00:00:00"}
SAM = {"user_id": "u_sam", "name": "Sam Lee", "birth_date": ADULT, "experience_level": "beginner", "gym_id": "gym_1"}
KAI = {"user_id": "u_kai", "name": "Kai Young", "birth_date": KID, "experience_level": "beginner"}
COACH = {"user_id": "u_coach", "name": "Coach Dee", "birth_date": ADULT, "gym_id": "gym_1"}
STRANGER = {"user_id": "u_str", "name": "Zed Stranger", "birth_date": ADULT, "experience_level": "advanced"}


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def as_user(u):
    current["user"] = u


def setup():
    run(server.db.users.insert_many([dict(u) for u in (ARCHIE, SAM, KAI, COACH, STRANGER)]))
    run(server.db.squads.insert_one({"squad_id": "sq_1", "name": "Archie's Squad", "owner_id": "u_archie",
                                     "members": ["u_archie", "u_sam"]}))
    run(server.db.squads.insert_one({"squad_id": "sq_2", "name": "Kai's Crew", "owner_id": "u_kai", "members": ["u_kai"]}))
    run(server.db.gyms.insert_one({"gym_id": "gym_1", "name": "Iron Gym", "owner_id": "u_coach", "is_public": True,
                                   "members": ["u_coach", "u_archie", "u_sam"]}))


def test_status_only_goes_up_and_feeds_the_weekly_board():
    r = run(server.award_status("u_archie", 60, session=True))
    assert r["earned"] == 60 and r["level"] == 1 and not r["leveled_up"]
    r = run(server.award_status("u_archie", 30, session=True))
    assert r["total"] == 90 and r["leveled_up"] and r["unlocked"][0]["name"] == "The 1-2"
    wk = run(server.db.weekly_stats.find_one({"user_id": "u_archie", "week_id": gx.week_id()}))
    assert wk["points"] == 90 and wk["sessions"] == 2
    assert run(server.award_status("u_archie", 0)) == {}


def test_squad_quest_rewards_everyone_once_with_a_booster():
    pushes.clear()
    target = gx.quest_target(2)
    for i in range(target):
        out = run(server.advance_squad_quests("u_archie" if i % 2 else "u_sam"))
    sq1 = next(q for q in out if q["squad_id"] == "sq_1")
    assert sq1["completed"] and sq1["just_completed"]
    again = run(server.advance_squad_quests("u_sam"))
    assert not next(q for q in again if q["squad_id"] == "sq_1")["just_completed"]
    sam = run(server.db.users.find_one({"user_id": "u_sam"}))
    assert sam["status_points"] == gx.STATUS_PER_QUEST and len(sam["boosters"]) == 1
    assert sum(1 for u, t in pushes if "weekly quest" in t) == 2
    r = run(server.award_status("u_sam", 40, session=True))
    assert r["earned"] == 80 and r["booster"] == "Squad quest booster"
    wk = run(server.db.weekly_stats.find_one({"user_id": "u_sam", "week_id": gx.week_id()}))
    assert wk["points"] == 40, "boosters never inflate the weekly board"
    assert run(server.award_status("u_sam", 40))["earned"] == 40

    as_user(SAM)
    q = client.get("/api/quests/mine").json()["quests"][0]
    assert q["completed"] and q["progress"] == target and {m["name"] for m in q["members"]} == {"You", "Archie"}


def test_ranks_centre_on_me_with_friends_named():
    run(server.db.follows.insert_one({"follower_id": "u_archie", "following_id": "u_kai"}))
    for uid in ("u_kai", "u_str"):
        run(server.db.sessions.insert_many([{"user_id": uid} for _ in range(3)]))
    run(server.db.sessions.insert_many([{"user_id": "u_archie"} for _ in range(3)]))
    run(server.award_status("u_kai", 500, session=True))
    run(server.award_status("u_str", 1000, session=True))
    as_user(ARCHIE)
    r = client.get("/api/ranks").json()
    assert r["scope"] == "friends" and r["friend_count"] == 2 and not r["learning_mode"]
    assert [x["name"] for x in r["rows"]] == ["Kai Y.", "You", "Sam L."]
    assert r["me"]["rank"] == 2 and r["next_up"] == "Kai Y." and r["gap_up"] == 411 and not r["within_reach"]

    g = client.get("/api/ranks", params={"scope": "global"}).json()
    names = [x["name"] for x in g["rows"]]
    assert names[0] == "Zed S." and "Kai Y." in names, "friends keep their names on any board"
    assert all(x["user_id"] is None for x in g["rows"] if x["name"] == "Zed S."), "strangers aren't linkable"

    as_user(SAM)
    s = client.get("/api/ranks", params={"scope": "global"}).json()
    assert "A fighter" in [x["name"] for x in s["rows"]], "a stranger's under-18 is never named"


def test_new_fighters_start_in_learning_mode_and_can_switch():
    as_user(KAI)
    run(server.db.users.update_one({"user_id": "u_kai"}, {"$set": {"competition_prefs.learning_mode": True}}))
    assert client.get("/api/ranks").json()["learning_mode"]
    assert client.put("/api/progression/competition", json={"learning_mode": False}).status_code == 200
    assert not client.get("/api/ranks").json()["learning_mode"]


def test_group_board_hides_other_squads_names():
    as_user(KAI)
    r = client.get("/api/ranks/groups", params={"kind": "squad"}).json()
    names = [x["name"] for x in r["rows"]]
    assert "Kai's Crew" in names and "Squad of 2" in names and "Archie's Squad" not in names
    as_user(STRANGER)
    assert client.get("/api/ranks/groups", params={"kind": "gym"}).json()["rows"] == []
    as_user(ARCHIE)
    gym = client.get("/api/ranks/groups", params={"kind": "gym"}).json()
    assert gym["me"]["name"] == "Iron Gym" and gym["me"]["points"] > 0


def test_treasures_only_from_people_you_know_and_scarce():
    as_user(ARCHIE)
    assert client.post("/api/treasures", json={"recipient_id": "u_archie", "kind": "respect"}).status_code == 400
    assert client.post("/api/treasures", json={"recipient_id": "u_str", "kind": "respect"}).status_code == 403
    assert client.post("/api/treasures", json={"recipient_id": "u_sam", "kind": "gold"}).status_code == 400
    r = client.post("/api/treasures", json={"recipient_id": "u_sam", "kind": "respect"})
    assert r.status_code == 200 and r.json()["left_today"] == 2
    assert client.post("/api/treasures", json={"recipient_id": "u_sam", "kind": "heart"}).status_code == 400
    assert client.post("/api/treasures", json={"recipient_id": "u_kai", "kind": "heart"}).status_code == 200
    assert client.post("/api/treasures", json={"recipient_id": "u_coach", "kind": "sharp"}).status_code == 200
    r = client.post("/api/treasures", json={"recipient_id": "u_str", "kind": "sharp"})
    assert r.status_code in (403, 429)
    assert client.get("/api/treasures/mine").json()["left_today"] == 0


def test_trophy_shelf_shows_crowns_titles_and_treasures():
    prev = gx.previous_week_id()
    run(server.db.weekly_closings.delete_many({}))  # an earlier test already closed the (empty) week
    run(server.db.weekly_stats.insert_many([
        {"user_id": "u_sam", "week_id": prev, "points": 300},
        {"user_id": "u_archie", "week_id": prev, "points": 200},
    ]))
    run(server.db.users.update_one({"user_id": "u_kai"}, {"$set": {"invited_by": "u_archie"}}))
    as_user(ARCHIE)
    client.get("/api/ranks")
    client.get("/api/ranks")
    sam = run(server.db.users.find_one({"user_id": "u_sam"}))
    assert [c["name"] for c in sam["crowns"]] == ["Weekly No. 1", "Squad Crown"], "crowned once, not per request"
    shelf = client.get("/api/users/u_sam/trophy-shelf").json()
    assert shelf["crown_count"] == 2 and shelf["can_give"]
    assert shelf["treasures"] == [{"kind": "respect", "name": "Respect", "count": 1}]
    mine = client.get("/api/users/u_archie/trophy-shelf").json()
    assert {"Founding Fighter", "Recruiter"} <= {t["name"] for t in mine["titles"]}
    run(server.db.users.update_one({"user_id": "u_str"}, {"$set": {"is_public": False}}))
    assert client.get("/api/users/u_str/trophy-shelf").status_code == 403


def test_belts_add_status():
    run(server.db.sessions.insert_one({"user_id": "u_coach", "date": "2026-10-01"}))
    before = run(server.db.users.find_one({"user_id": "u_coach"})).get("status_points", 0)
    run(server.check_and_award_belts("u_coach"))
    after = run(server.db.users.find_one({"user_id": "u_coach"}))["status_points"]
    assert after - before == gx.STATUS_PER_BELT * 3  # first jab, team player, gym captain


def test_mentors_come_from_the_gym_and_notes_are_one_way():
    as_user(KAI)
    assert client.post("/api/mentors/requests", json={"mentor_id": "u_coach"}).status_code == 403
    as_user(ARCHIE)
    opts = client.get("/api/mentors").json()["options"]
    assert [o["user_id"] for o in opts] == ["u_coach"] and opts[0]["role"] == "Gym owner"
    assert client.post("/api/mentors/requests", json={"mentor_id": "u_sam"}).status_code == 403
    as_user(COACH)
    assert client.put("/api/gyms/gym_1/coaches/u_sam", json={"coach": True}).status_code == 200
    as_user(SAM)
    assert client.put("/api/gyms/gym_1/coaches/u_archie", json={"coach": True}).status_code == 403
    as_user(ARCHIE)
    link = client.post("/api/mentors/requests", json={"mentor_id": "u_coach"}).json()
    assert client.post("/api/mentors/requests", json={"mentor_id": "u_coach"}).status_code == 400
    assert client.post(f"/api/mentors/{link['link_id']}/accept").status_code == 404, "mentee can't accept for the mentor"
    as_user(COACH)
    assert client.post(f"/api/mentors/{link['link_id']}/notes", json={"text": "Hands up"}).status_code == 400
    assert client.post(f"/api/mentors/{link['link_id']}/accept").status_code == 200
    assert client.post(f"/api/mentors/{link['link_id']}/notes", json={"text": "badword"}).status_code == 400
    assert client.post(f"/api/mentors/{link['link_id']}/notes", json={"text": "Hands up on the exit"}).status_code == 200
    mentee = client.get("/api/mentors").json()["mentees"][0]
    assert mentee["mentee"]["user_id"] == "u_archie" and "level" in mentee["progress"]
    as_user(ARCHIE)
    me = client.get("/api/mentors").json()
    assert me["mentors"][0]["notes"][0]["text"] == "Hands up on the exit"
    assert client.post(f"/api/mentors/{link['link_id']}/notes", json={"text": "hi coach"}).status_code == 404
    prog = client.get("/api/progression/me").json()
    assert prog["for_you"]["mentor_note"]["text"] == "Hands up on the exit"
    assert client.delete(f"/api/mentors/{link['link_id']}").status_code == 200
    assert client.get("/api/mentors").json()["mentors"] == []


def test_progression_me_shape():
    run(server.db.users.update_one({"user_id": "u_archie"}, {"$set": {"personal_bests": {"Jab": 8, "Footwork": 5, "Overall": 7}}}))
    as_user(ARCHIE)
    p = client.get("/api/progression/me").json()
    assert p["level"] >= 2 and len(p["weekly"]) == 8 and p["weekly"][-1]["points"] > 0
    assert p["for_you"]["focus"] == "Footwork" and "Box Step" in p["for_you"]["line"]
    assert p["peers"] is None, "too few peers to say anything honest"


def test_partner_condition_mirrors_training():
    from datetime import datetime, timedelta, timezone
    today = datetime.now(timezone.utc).date()
    run(server.db.users.update_one({"user_id": "u_sam"}, {"$set": {"training_partner": {
        "name": "Dee", "partner_id": "p1", "appearance_gender": "female", "appearance_skin_tone": "dark"}}}))
    run(server.db.sessions.delete_many({"user_id": "u_sam"}))
    run(server.db.sessions.insert_many([{"user_id": "u_sam", "date": (today - timedelta(days=10 + d)).isoformat()} for d in range(0, 30, 2)]))
    as_user(SAM)
    c = client.get("/api/partner/condition").json()
    assert c["state"] == "rusty" and c["comeback"] and c["partner_name"] == "Dee"
    assert c["avatar_url"] is None
    assert "not a measurement" in c["note"]
    title, body = run(server._build_winback_message(run(server.db.users.find_one({"user_id": "u_sam"}))))
    assert title == "Dee is on the couch" and "One session" in body
    run(server.db.sessions.insert_one({"user_id": "u_sam", "date": today.isoformat()}))
    assert client.get("/api/partner/condition").json()["state"] in ("ready", "peak")


if __name__ == "__main__":
    setup()
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"\n{len(tests)} passed")
