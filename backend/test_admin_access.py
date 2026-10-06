"""Self-check for the admin login check (ADMIN_EMAIL), with Clerk mocked:

    MONGO_URL=x DB_NAME=t python3 backend/test_admin_access.py
"""
import asyncio

from fastapi.testclient import TestClient
from mongomock_motor import AsyncMongoMockClient

import server

server.db = AsyncMongoMockClient()["test"]
server.CLERK_SECRET_KEY = "sk_test"
run = asyncio.get_event_loop().run_until_complete
CURRENT = {}
server.app.dependency_overrides[server.get_current_user] = lambda: CURRENT["user"]
client = TestClient(server.app)
CLERK = {}
lookups = []


class Resp:
    def __init__(self, uid):
        self.status_code = 200 if uid in CLERK else 404
        self._uid = uid

    def json(self):
        return {"email_addresses": CLERK[self._uid]}


class FakeClient:
    def __init__(self, *a, **k):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        pass

    async def get(self, url, headers=None, **k):
        uid = url.rsplit("/", 1)[-1]
        lookups.append(uid)
        return Resp(uid)


server.httpx.AsyncClient = FakeClient
verified = lambda e: {"email_address": e, "verification": {"status": "verified"}}


def admin_status(user):
    CURRENT["user"] = user
    return client.get("/api/admin/fantasy/cards").status_code


def test_saved_email_matches_ignoring_case_and_spaces():
    assert admin_status({"user_id": "user_a", "email": " ArchieRoach2013@Gmail.com "}) == 200


def test_blank_saved_email_is_fixed_from_a_verified_clerk_address():
    CLERK["user_b"] = [verified("relay@privaterelay.appleid.com"), verified("archieroach2013@gmail.com")]
    run(server.db.users.insert_one({"user_id": "user_b", "email": ""}))
    assert admin_status({"user_id": "user_b", "email": ""}) == 200
    saved = run(server.db.users.find_one({"user_id": "user_b"}))
    assert saved["email"] == "archieroach2013@gmail.com", "the saved email is repaired"


def test_unverified_or_other_emails_are_refused():
    CLERK["user_c"] = [{"email_address": "archieroach2013@gmail.com", "verification": {"status": "unverified"}}]
    assert admin_status({"user_id": "user_c", "email": "someone@x.co"}) == 403
    assert admin_status({"user_id": "user_d", "email": "hello@victoryai.co.uk"}) == 403, "the inbox is not a login"


def test_clerk_lookups_are_cached():
    n = len(lookups)
    admin_status({"user_id": "user_c", "email": "someone@x.co"})
    assert len(lookups) == n


if __name__ == "__main__":
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"\n{len(tests)} passed")
