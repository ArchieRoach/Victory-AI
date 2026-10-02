"""Self-check for Live Coach rounds, records and the ghost, against an in-memory Mongo:

    MONGO_URL=x DB_NAME=t python3 backend/test_live_coach.py
"""
import asyncio

from fastapi.testclient import TestClient
from mongomock_motor import AsyncMongoMockClient

import server
from server import summarize_live_rounds

server.db = AsyncMongoMockClient()["test"]
USER = {"user_id": "u1", "name": "Archie"}
server.app.dependency_overrides[server.get_current_user] = lambda: USER
client = TestClient(server.app)


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def start(round_duration=180):
    run(server.db.users.update_one({"user_id": "u1"}, {"$setOnInsert": {"user_id": "u1"}}, upsert=True))
    r = client.post("/api/training/start", json={"round_duration": round_duration, "rest_duration": 30,
                                                 "total_rounds": 2, "record_video": False})
    return r.json()["session_id"]


def test_summary_of_rounds():
    s = summarize_live_rounds([{"punches": 40, "best_combo": 3, "guard_drops": 2, "head_moves": 5, "guard_pct": 80},
                               {"punches": 55, "best_combo": 5, "guard_drops": 1, "head_moves": 9, "guard_pct": 70, "airpods": True}])
    assert s == {"rounds": 2, "punches": 95, "best_round_punches": 55, "best_combo": 5, "guard_drops": 3,
                 "head_moves": 14, "guard_pct": 75, "airpods": True}
    assert summarize_live_rounds([]) is None


def test_live_rounds_flow_records_and_ghost():
    sid = start()
    r = client.post(f"/api/training/{sid}/live-round", json={"round_number": 1, "punches": 3, "best_combo": 2,
                                                              "timeline": [5.0, 1.2, 999, 2.5]})
    assert r.status_code == 200
    client.post(f"/api/training/{sid}/live-round", json={"round_number": 1, "punches": 4, "best_combo": 3,
                                                          "timeline": [1.0, 2.0, 3.0, 4.0]})
    client.post(f"/api/training/{sid}/live-round", json={"round_number": 2, "punches": 2, "best_combo": 1, "timeline": [1, 2]})
    done = client.post(f"/api/training/{sid}/complete").json()
    assert done["live_stats"]["punches"] == 6, "re-sending a round replaces it"
    assert done["overall_score"] is None, "live counts never become a score"
    names = {r["name"] for r in done["live_records"]}
    assert names == {"Most punches in a round", "Longest combo"}
    ghost = client.get("/api/training/ghost?round_duration=180").json()
    assert ghost["punches"] == 4 and ghost["timeline"] == [1.0, 2.0, 3.0, 4.0]

    sid2 = start()
    client.post(f"/api/training/{sid2}/live-round", json={"round_number": 1, "punches": 2, "timeline": [1, 2]})
    done2 = client.post(f"/api/training/{sid2}/complete").json()
    assert done2["live_records"] == []
    assert client.get("/api/training/ghost?round_duration=180").json()["punches"] == 4, "weaker round doesn't replace the ghost"
    assert client.get("/api/training/ghost?round_duration=120").json() == {}


def test_timeline_is_clipped_to_the_round():
    sid = start(round_duration=60)
    client.post(f"/api/training/{sid}/live-round", json={"round_number": 1, "punches": 2, "timeline": [70, 3.33, -1, 10]})
    rounds = run(server.db.training_sessions.find_one({"session_id": sid}))["live_rounds"]
    assert rounds[0]["timeline"] == [3.3, 10.0]


def test_rejects_other_users_sessions_and_silly_numbers():
    assert client.post("/api/training/nope/live-round", json={"round_number": 1}).status_code == 404
    sid = start()
    assert client.post(f"/api/training/{sid}/live-round", json={"round_number": 1, "punches": 999999}).status_code == 422


def test_live_activity_payload_uses_swift_date_epoch():
    from datetime import datetime, timezone
    from server import live_activity_payload
    ends = datetime(2026, 10, 3, 18, 0, tzinfo=timezone.utc)
    now = datetime(2026, 10, 3, 17, 30, tzinfo=timezone.utc)
    p = live_activity_payload("booking", "Footwork round", "PB to beat: 6", ends, "t", "b", now=now)["aps"]
    assert p["event"] == "start" and p["attributes-type"] == "VictoryActivityAttributes"
    assert p["content-state"]["endsAt"] == ends.timestamp() - 978307200
    assert p["stale-date"] == int(ends.timestamp()) and p["timestamp"] == int(now.timestamp())
    assert p["alert"] == {"title": "t", "body": "b"}


def test_countdowns_start_once_for_the_right_people():
    from datetime import datetime, timedelta, timezone
    sent = []

    async def fake_la(user_id, payload):
        sent.append((user_id, payload["aps"]["attributes"]["kind"]))

    server._send_live_activity = fake_la
    now = datetime(2026, 10, 3, 12, 0, tzinfo=timezone.utc)
    run(server.db.bookings.insert_many([
        {"booking_id": "b1", "user_id": "u1", "status": "pending", "focus": "Jab", "focus_pb": 7,
         "at": (now + timedelta(minutes=20)).isoformat()},
        {"booking_id": "b2", "user_id": "u1", "status": "pending", "at": (now + timedelta(hours=3)).isoformat()},
    ]))
    run(server.db.users.insert_one({"user_id": "u2", "tz_offset_minutes": 0}))
    run(server.db.callouts.insert_many([
        {"callout_id": "c1", "status": "open", "challenger_name": "Sam", "dimension": "Jab", "score": 8,
         "accepted_ids": ["u2"], "expires_at": (now + timedelta(hours=5)).isoformat()},
        {"callout_id": "c2", "status": "open", "challenger_name": "Sam", "dimension": "Cross", "score": 8,
         "accepted_ids": ["u2"], "expires_at": (now + timedelta(days=3)).isoformat()},
    ]))
    run(server._start_booking_countdowns(now))
    run(server._start_callout_countdowns(now))
    run(server._start_booking_countdowns(now))
    run(server._start_callout_countdowns(now))
    assert sent == [("u1", "booking"), ("u2", "callout")]


if __name__ == "__main__":
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"\n{len(tests)} passed")
