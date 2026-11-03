"""Load test: many pretend people opening the app at once. Prints speed and errors per screen.

    VICTORY_API_URL=https://<staging-backend> VICTORY_TEST_TOKEN=<a test account's Clerk token> \
        python3 tools/load_test.py [people] [seconds]

Run it against a staging copy of the backend, not the live one: the live server rate-limits one
address, so a test from one laptop mostly measures the rate limiter. Without a token only the public
endpoints are tested. Pass: no 5xx errors and p95 (the slowest 1 in 20) under 800ms.
"""
import asyncio
import os
import random
import statistics
import sys
import time

import httpx

PUBLIC = ["/api/health", "/api/pricing", "/api/waitlist/stats", "/api/onboarding/social-proof"]
SIGNED_IN = ["/api/leaderboard", "/api/users/stats", "/api/week-plan", "/api/earnings/me", "/api/schools/leaderboard"]


async def person(client, paths, until, results):
    while time.monotonic() < until:
        path = random.choice(paths)
        start = time.monotonic()
        try:
            r = await client.get(path)
            code = r.status_code
        except Exception as e:
            code = type(e).__name__
        results.setdefault(path, []).append(((time.monotonic() - start) * 1000, code))
        await asyncio.sleep(random.uniform(0.5, 2.0))  # people read the screen before tapping again


def pct(xs, p):
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(len(xs) * p))]


async def main():
    base = os.environ.get("VICTORY_API_URL", "http://127.0.0.1:8000").rstrip("/")
    token = os.environ.get("VICTORY_TEST_TOKEN", "")
    people = int(sys.argv[1]) if len(sys.argv) > 1 else 100
    seconds = int(sys.argv[2]) if len(sys.argv) > 2 else 60
    paths = PUBLIC + (SIGNED_IN if token else [])
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    results = {}
    limits = httpx.Limits(max_connections=people, max_keepalive_connections=people)
    async with httpx.AsyncClient(base_url=base, headers=headers, timeout=30, limits=limits) as client:
        until = time.monotonic() + seconds
        await asyncio.gather(*(person(client, paths, until, results) for _ in range(people)))

    print(f"{people} people for {seconds}s against {base}\n")
    print(f"{'endpoint':<34}{'requests':>9}{'p50 ms':>9}{'p95 ms':>9}{'errors':>8}")
    worst, failed = 0.0, 0
    for path, rows in sorted(results.items()):
        ms = [m for m, _ in rows]
        errors = [c for _, c in rows if not (isinstance(c, int) and c < 500)]
        limited = sum(1 for _, c in rows if c == 429)
        p95 = pct(ms, 0.95)
        worst, failed = max(worst, p95), failed + len(errors)
        note = f"  ({limited} rate-limited)" if limited else ""
        print(f"{path:<34}{len(rows):>9}{statistics.median(ms):>9.0f}{p95:>9.0f}{len(errors):>8}{note}")
    verdict = "PASS" if failed == 0 and worst < 800 else "FAIL"
    print(f"\n{verdict}: worst p95 {worst:.0f}ms, {failed} errors")
    sys.exit(0 if verdict == "PASS" else 1)


if __name__ == "__main__":
    asyncio.run(main())
