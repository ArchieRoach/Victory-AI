"""Self-check: gym run clubs. Staff set them up and invite gym members; members say they're going;
the meeting point stays with people in the club; under-18s only join their own gym's clubs.

    MONGO_URL=x DB_NAME=t python3 backend/test_run_clubs.py
"""
import asyncio
from datetime import datetime

from fastapi.testclient import TestClient
from mongomock_motor import AsyncMongoMockClient

import run_clubs as rc
import server

server.db = AsyncMongoMockClient()["test"]
pushes = []


async def fake_push(user_id, title, body, url="/live", tag=None):
    pushes.append((user_id, title, url))


async def never_flagged(text):
    return "badword" in text


server._send_push = fake_push
server.is_content_flagged = never_flagged
server._rate_limited = lambda *a, **k: False

ADULT = "1990-01-01"
TEEN = "2012-01-01"
USERS = {
    "owner": {"user_id": "owner", "name": "Owner Olly", "birth_date": ADULT, "gym_id": "gym1"},
    "coach": {"user_id": "coach", "name": "Coach Cara", "birth_date": ADULT, "gym_id": "gym1"},
    "member": {"user_id": "member", "name": "Member Max", "birth_date": ADULT, "gym_id": "gym1"},
    "teen": {"user_id": "teen", "name": "Teen Tia", "birth_date": TEEN, "gym_id": "gym1"},
    "outsider": {"user_id": "outsider", "name": "Out Oscar", "birth_date": ADULT, "gym_id": "gym2"},
    "outsider_teen": {"user_id": "outsider_teen", "name": "Out Ollie", "birth_date": TEEN, "gym_id": "gym2"},
}
current = {"id": "owner"}
server.app.dependency_overrides[server.get_current_user] = lambda: USERS[current["id"]]
client = TestClient(server.app)


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def as_(who):
    current["id"] = who
    return client


async def seed():
    await server.db.users.insert_many([dict(u) for u in USERS.values()])
    await server.db.gyms.insert_many([
        {"gym_id": "gym1", "name": "Rays ABC", "owner_id": "owner", "coaches": ["coach"], "is_public": True,
         "members": ["owner", "coach", "member", "teen"]},
        {"gym_id": "gym2", "name": "Other Gym", "owner_id": "x", "coaches": [], "is_public": True,
         "members": ["outsider", "outsider_teen"]},
    ])

run(seed())
CLUB = {"name": "Tuesday Tempo", "description": "Easy 5k then strides", "weekday": 1, "time": "18:30",
        "meeting_point": "Front door of Rays ABC", "distance_km": 5}


def test_next_run_date_rolls_to_next_week_after_the_run():
    tuesday_evening = datetime(2026, 11, 17, 20, 0)
    assert rc.next_run_date(1, "18:30", tuesday_evening).isoformat() == "2026-11-24"
    assert rc.next_run_date(1, "18:30", datetime(2026, 11, 17, 19, 0)).isoformat() == "2026-11-17"
    assert rc.next_run_date(4, "07:00", datetime(2026, 11, 17, 9, 0)).isoformat() == "2026-11-20"


def test_only_owner_or_coach_can_set_one_up():
    assert as_("member").post("/api/gyms/gym1/run-clubs", json=CLUB).status_code == 403
    r = as_("coach").post("/api/gyms/gym1/run-clubs", json=CLUB)
    assert r.status_code == 200, r.text
    club = r.json()
    assert club["day"] == "Tuesday" and club["meeting_point"] == CLUB["meeting_point"] and club["invite_code"]
    assert as_("owner").post("/api/gyms/gym1/run-clubs", json={**CLUB, "time": "6pm"}).status_code == 400
    assert as_("owner").post("/api/gyms/gym1/run-clubs", json={**CLUB, "distance_km": 100}).status_code == 400
    assert as_("owner").post("/api/gyms/gym1/run-clubs", json={**CLUB, "name": "badword club"}).status_code == 400


def club_id():
    return run(server.db.run_clubs.find_one({"name": "Tuesday Tempo"}))["club_id"]


def test_meeting_point_stays_inside_the_club():
    listed = as_("outsider").get("/api/gyms/gym1/run-clubs").json()["clubs"][0]
    assert "meeting_point" not in listed and "invite_code" not in listed
    detail = as_("outsider").get(f"/api/run-clubs/{club_id()}").json()
    assert "members" not in detail and "meeting_point" not in detail


def test_staff_invite_gym_members_and_they_get_told():
    r = as_("coach").post(f"/api/run-clubs/{club_id()}/invites", json={"user_ids": ["member", "teen", "outsider", "member"]})
    assert r.json()["invited"] == 2
    assert {p[0] for p in pushes} == {"member", "teen"}
    note = run(server.db.notifications.find_one({"recipient_id": "member", "type": "run_club_invite"}))
    assert "Tuesday Tempo" in note["message"] and "Tuesdays at 18:30" in note["message"]
    again = as_("coach").post(f"/api/run-clubs/{club_id()}/invites", json={"user_ids": ["member"]})
    assert again.json()["invited"] == 0
    assert as_("member").post(f"/api/run-clubs/{club_id()}/invites", json={"user_ids": ["teen"]}).status_code == 403


def test_an_invite_shows_where_to_meet_and_can_be_accepted():
    invites = as_("member").get("/api/run-clubs/invites/mine").json()["invites"]
    assert invites[0]["meeting_point"] == CLUB["meeting_point"]
    joined = as_("member").post(f"/api/run-clubs/invites/{invites[0]['invite_id']}/accept").json()
    assert joined["is_member"] and joined["member_count"] == 2
    teen_invite = as_("teen").get("/api/run-clubs/invites/mine").json()["invites"][0]
    assert as_("teen").post(f"/api/run-clubs/invites/{teen_invite['invite_id']}/decline").json() == {"declined": True}
    assert as_("teen").get("/api/run-clubs/invites/mine").json()["invites"] == []


def test_going_is_a_real_count_of_members():
    cid = club_id()
    assert as_("outsider").post(f"/api/run-clubs/{cid}/rsvp", json={"going": True}).status_code == 403
    view = as_("member").post(f"/api/run-clubs/{cid}/rsvp", json={"going": True}).json()
    assert view["going_count"] == 1 and view["i_am_going"]
    assert [m["going"] for m in view["members"] if m["user_id"] == "member"] == [True]
    assert as_("member").post(f"/api/run-clubs/{cid}/rsvp", json={"going": False}).json()["going_count"] == 0


def test_invite_link_works_but_under_18s_only_join_their_own_gym():
    code = run(server.db.run_clubs.find_one({"club_id": club_id()}))["invite_code"]
    blocked = as_("outsider_teen").post("/api/run-clubs/join-by-code", json={"code": code})
    assert blocked.status_code == 400 and "own gym" in blocked.json()["detail"]
    ok = as_("outsider").post("/api/run-clubs/join-by-code", json={"code": code.lower()})
    assert ok.status_code == 200 and ok.json()["meeting_point"] == CLUB["meeting_point"]
    assert as_("teen").post("/api/run-clubs/join-by-code", json={"code": code}).status_code == 200
    assert as_("outsider").post("/api/run-clubs/join-by-code", json={"code": "NOPE1234"}).status_code == 404


def test_leave_and_delete():
    cid = club_id()
    assert as_("outsider").post(f"/api/run-clubs/{cid}/leave").json() == {"left": True}
    assert as_("member").delete(f"/api/run-clubs/{cid}").status_code == 403
    assert as_("owner").delete(f"/api/run-clubs/{cid}").json() == {"deleted": True}
    assert as_("owner").get(f"/api/run-clubs/{cid}").status_code == 404
    assert run(server.db.run_club_invites.count_documents({"club_id": cid})) == 0


if __name__ == "__main__":
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"\n{len(tests)} passed")
