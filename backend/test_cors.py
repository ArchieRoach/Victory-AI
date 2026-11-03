"""Self-check: the waitlist site can always post sign-ups, whatever CORS_ORIGINS says in Railway.

    MONGO_URL=x DB_NAME=t python3 backend/test_cors.py
"""
import os

os.environ["CORS_ORIGINS"] = "https://app.victoryai.co.uk"

from fastapi.testclient import TestClient

import server

client = TestClient(server.app)


def preflight(origin):
    return client.options("/api/waitlist/signup", headers={
        "Origin": origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type"})


def test_the_waitlist_site_can_send_sign_ups():
    for origin in ("https://victoryai.co.uk", "https://www.victoryai.co.uk", "https://app.victoryai.co.uk"):
        r = preflight(origin)
        assert r.status_code == 200 and r.headers["access-control-allow-origin"] == origin, origin


def test_strangers_still_cant():
    assert preflight("https://evil.example").status_code == 400


def test_checkout_still_returns_to_the_app_by_default():
    assert server._safe_checkout_origin("https://evil.example") == "https://app.victoryai.co.uk"


if __name__ == "__main__":
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"\n{len(tests)} passed")
