"""Self-check: personal invite links credit a new fighter to their friend, and both get tokens
once (and only once) after the friend's first session.

    MONGO_URL=x DB_NAME=t python3 backend/test_referrals.py
"""
import asyncio
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from mongomock_motor import AsyncMongoMockClient

import referrals as rf
import server

server.db = AsyncMongoMockClient()["test"]
pushes = []


async def fake_push(user_id, title, body, url="/live", tag=None):
    pushes.append((user_id, title))

server._send_push = fake_push
current = {}
server.app.dependency_overrides[server.get_current_user] = lambda: current["user"]
client = TestClient(server.app)
now = datetime.now(timezone.utc)


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def user(uid, **extra):
    doc = {"user_id": uid, "name": uid.title(), "token_balance": 0, "created_at": now.isoformat(), **extra}
    run(server.db.users.insert_one(dict(doc)))
    return doc


def balance(uid):
    return run(server.db.users.find_one({"user_id": uid}))["token_balance"]


def test_codes_are_easy_to_read_out():
    code = rf.new_code()
    assert len(code) == 6 and not set(code) & set("01OIL")
    assert rf.clean_code(code.lower()) == code
    assert rf.clean_code("../x") is None and rf.clean_code("ABC") is None


def test_a_friend_joins_and_both_get_tokens_once():
    current["user"] = user("archie")
    me = client.get("/api/referrals/me").json()
    assert me["url"].endswith(f"/r/{me['code']}") and me["joined"] == 0
    assert client.get("/api/referrals/me").json()["code"] == me["code"], "the code never changes"

    assert client.get(f"/api/referrals/code/{me['code']}").json()["inviter_name"] == "Archie"
    assert client.get("/api/referrals/code/ZZZZZZ").status_code == 404

    current["user"] = user("lucas")
    r = client.post(f"/api/referrals/code/{me['code']}/claim")
    assert r.status_code == 200 and r.json()["claimed"] is True
    assert pushes[-1] == ("archie", "Lucas joined from your invite")
    assert client.post(f"/api/referrals/code/{me['code']}/claim").json()["already"] is True

    assert run(server.pay_referral(current["user"])) == {"tokens": rf.REFERRAL_TOKENS}
    assert run(server.pay_referral(current["user"])) is None, "a second session pays nothing"
    assert balance("lucas") == rf.REFERRAL_TOKENS and balance("archie") == rf.REFERRAL_TOKENS

    current["user"] = {"user_id": "archie", "name": "Archie"}
    me = client.get("/api/referrals/me").json()
    assert me["joined"] == 1 and me["trained"] == 1 and me["tokens_earned"] == rf.REFERRAL_TOKENS


def test_own_link_and_old_accounts_dont_count():
    current["user"] = {"user_id": "archie", "name": "Archie"}
    code = client.get("/api/referrals/me").json()["code"]
    assert client.post(f"/api/referrals/code/{code}/claim").status_code == 400
    current["user"] = user("oldtimer", created_at=(now - timedelta(days=30)).isoformat())
    assert client.post(f"/api/referrals/code/{code}/claim").status_code == 400


def test_the_inviter_is_capped_each_month_but_the_friend_still_gets_theirs():
    user("busy")
    month = rf.month_key()
    run(server.db.users.update_one({"user_id": "busy"}, {"$set": {f"referral_payouts.{month}": rf.REFERRAL_PAID_PER_MONTH}}))
    friend = user("late", invited_by="busy")
    run(server.pay_referral(friend))
    assert balance("busy") == 0 and balance("late") == rf.REFERRAL_TOKENS


if __name__ == "__main__":
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"\n{len(tests)} passed")
