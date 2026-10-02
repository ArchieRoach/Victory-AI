"""Self-check for post-win squad invite links, end to end against an in-memory Mongo:

    MONGO_URL=x DB_NAME=t python3 backend/test_invites.py
"""
import asyncio

from fastapi.testclient import TestClient
from mongomock_motor import AsyncMongoMockClient

import server
from server import invite_brag

server.db = AsyncMongoMockClient()["test"]
pushes = []


async def fake_push(user_id, title, body, url="/live", tag=None):
    pushes.append((user_id, title, url))

server._send_push = fake_push
current = {}
server.app.dependency_overrides[server.get_current_user] = lambda: current["user"]
client = TestClient(server.app)

ARCHIE = {"user_id": "u_archie", "display_name": "Archie Roach", "name": "Archie"}
SAM = {"user_id": "u_sam", "display_name": "Sam", "name": "Sam"}


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def as_user(u):
    current["user"] = u


def test_brag_uses_the_verified_win():
    assert invite_brag("Archie", "Jab", 8.0, "Contender") == "Archie just set a Jab personal best of 8. Think you can beat it?"
    assert invite_brag("Archie", None, None, "Contender").startswith("Archie is ranked Contender")
    assert invite_brag("Archie", None, None, None) == "Archie wants you in their squad."


def test_no_invite_before_trying_the_app():
    as_user(ARCHIE)
    r = client.post("/api/squads/invites", json={})
    assert r.status_code == 400 and "scored session" in r.json()["detail"]


def test_invite_flow_creates_squad_and_joins():
    run(server.db.users.insert_many([dict(ARCHIE, personal_bests={"Jab": 8.5}), dict(SAM)]))
    run(server.db.sessions.insert_one({"user_id": "u_archie", "scored": True}))
    as_user(ARCHIE)
    r = client.post("/api/squads/invites", json={"dimension": "Jab"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["squad"]["name"] == "Archie's Squad"
    assert "Jab personal best of 8.5" in body["brag"]
    invite_id = body["invite_id"]
    assert body["path"] == f"/join/{invite_id}"

    preview = client.get(f"/api/invites/{invite_id}").json()
    assert preview["squad_name"] == "Archie's Squad" and preview["member_count"] == 1
    assert preview["inviter_name"] == "Archie Roach" and not preview["full"]
    assert "user_id" not in preview

    as_user(SAM)
    r = client.post(f"/api/invites/{invite_id}/accept")
    assert r.status_code == 200 and r.json()["already_member"] is False
    squad = run(server.db.squads.find_one({"squad_id": body["squad"]["squad_id"]}))
    assert squad["members"] == ["u_archie", "u_sam"]
    assert run(server.db.users.find_one({"user_id": "u_sam"}))["invited_by"] == "u_archie"
    assert pushes and pushes[-1][0] == "u_archie" and pushes[-1][2].startswith(f"/squads/{squad['squad_id']}")

    again = client.post(f"/api/invites/{invite_id}/accept")
    assert again.status_code == 200 and again.json()["already_member"] is True

    as_user(ARCHIE)
    second = client.post("/api/squads/invites", json={"dimension": "Left Hook"}).json()
    assert second["squad"]["squad_id"] == squad["squad_id"], "reuses the existing squad"
    assert "personal best" not in second["brag"], "no brag for a PB that doesn't exist"


def test_unknown_or_expired_invites_404():
    assert client.get("/api/invites/nope").status_code == 404
    run(server.db.squad_invites.insert_one({"invite_id": "old", "squad_id": "x", "inviter_id": "u_archie",
                                            "brag": "", "expires_at": "2000-01-01T00:00:00+00:00"}))
    assert client.get("/api/invites/old").status_code == 404


def test_rejects_unknown_skill():
    as_user(ARCHIE)
    assert client.post("/api/squads/invites", json={"dimension": "Telekinesis"}).status_code == 400


if __name__ == "__main__":
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"\n{len(tests)} passed")
