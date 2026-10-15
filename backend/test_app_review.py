"""Self-check for the App Review demo account:

    MONGO_URL=x DB_NAME=t python3 backend/test_app_review.py
"""
import asyncio

from fastapi.testclient import TestClient
from mongomock_motor import AsyncMongoMockClient

import server

server.db = AsyncMongoMockClient()["test"]
server.APP_REVIEW_EMAILS = {"review@victory.ai"}
current = {}
server.app.dependency_overrides[server.get_current_user] = lambda: current["user"]
client = TestClient(server.app)


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def test_review_account_gets_pro_and_into_the_ios_app():
    current["user"] = {"user_id": "u_rev", "email": "Review@Victory.ai "}
    run(server.db.users.insert_one(dict(current["user"])))
    assert client.post("/api/auth/validate").json() == {"access_granted": True, "subscription_active": True}
    assert client.get("/api/subscription/status").json()["has_subscription"] is True
    client.post("/api/auth/validate")
    assert run(server.db.subscriptions.count_documents({"user_id": "u_rev"})) == 1, "no duplicates on every launch"


def test_review_account_is_pro_on_the_website_too():
    current["user"] = {"user_id": "u_web", "email": "review@victory.ai"}
    run(server.db.users.insert_one(dict(current["user"])))
    assert client.get("/api/usage").json()["plan"] == "pro", "no free-credit bar or Go Pro button"
    assert run(server.has_active_subscription({"user_id": "u_web", "email": "review@victory.ai"}))


def test_paying_members_are_never_metered_like_free_users():
    run(server.db.subscriptions.insert_one({"user_id": "u_paid", "status": "active", "subscription_id": "sub_x"}))
    current["user"] = {"user_id": "u_paid", "email": "paid@x.com"}
    run(server.db.users.insert_one(dict(current["user"])))
    assert client.get("/api/usage").json()["plan"] == "pro"
    assert run(server.check_and_consume_ai_tokens({"user_id": "u_paid"}, "analyze_video"))["allowed"]
    assert "ai_tokens_used" not in run(server.db.users.find_one({"user_id": "u_paid"})), "nothing deducted"


def test_everyone_else_still_needs_a_real_subscription():
    current["user"] = {"user_id": "u_x", "email": "someone@else.com"}
    run(server.db.users.insert_one(dict(current["user"])))
    assert client.post("/api/auth/validate").json()["access_granted"] is False
    assert client.get("/api/subscription/status").json()["has_subscription"] is False


if __name__ == "__main__":
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"\n{len(tests)} passed")
