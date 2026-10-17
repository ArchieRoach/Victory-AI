"""Self-check for the database indexes and the health check:

    MONGO_URL=x DB_NAME=t python3 backend/test_infra.py
"""
import asyncio

from fastapi.testclient import TestClient
from mongomock_motor import AsyncMongoMockClient

import server

server.db = AsyncMongoMockClient()["test"]
client = TestClient(server.app)


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def test_indexes_are_created_and_can_run_again():
    run(server.ensure_indexes())
    run(server.ensure_indexes())
    names = run(server.db.sessions.index_information())
    assert any("user_id" in n and "date" in n for n in names), names
    assert "user_id_1" in run(server.db.users.index_information())


def test_health_reports_a_database_outage():
    assert client.get("/api/health").json()["database"] == "ok"

    class Down:
        async def command(self, *a, **k):
            raise RuntimeError("down")
    real, server.db = server.db, Down()
    try:
        r = client.get("/api/health")
    finally:
        server.db = real
    assert r.status_code == 503 and r.json()["status"] == "unhealthy"


if __name__ == "__main__":
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"\n{len(tests)} passed")
