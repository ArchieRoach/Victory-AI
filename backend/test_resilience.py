"""Self-check for the circuit breaker:

    python3 backend/test_resilience.py
"""
import asyncio

from resilience import CircuitBreaker, CircuitOpen

run = asyncio.get_event_loop().run_until_complete
NOW = {"t": 0.0}
clock = lambda: NOW["t"]


async def ok():
    return "ok"


async def boom():
    raise RuntimeError("down")


async def slow():
    await asyncio.sleep(1)
    return "late"


def test_opens_after_repeated_failures_and_fails_fast():
    b = CircuitBreaker("dep", failure_threshold=3, cooldown_seconds=30, clock=clock)
    for _ in range(3):
        assert run(b.call(boom, fallback="fb")) == "fb"
    assert b.state == "open"
    calls = []

    async def counted():
        calls.append(1)
        return "ok"

    assert run(b.call(counted, fallback="fb")) == "fb" and not calls, "open breaker never calls the dependency"
    try:
        run(b.call(counted))
        raise AssertionError("should raise without a fallback")
    except CircuitOpen:
        pass


def test_half_open_trial_recovers_or_reopens():
    b = CircuitBreaker("dep", failure_threshold=1, cooldown_seconds=10, clock=clock)
    NOW["t"] = 100.0
    run(b.call(boom, fallback=None))
    assert b.state == "open"
    NOW["t"] = 111.0
    assert b.state == "half_open"
    run(b.call(boom, fallback=None))
    assert b.state == "open", "a failed trial re-opens for another cool-down"
    NOW["t"] = 122.0
    assert run(b.call(ok)) == "ok" and b.state == "closed", "a good trial closes it"


def test_slow_calls_time_out_and_count_as_failures():
    b = CircuitBreaker("dep", failure_threshold=2, timeout_seconds=0.05, clock=clock)
    assert run(b.call(slow, fallback="fb")) == "fb"
    assert run(b.call(slow, fallback="fb")) == "fb"
    assert b.state == "open"


def test_concurrency_cap_sheds_extra_calls():
    b = CircuitBreaker("dep", max_concurrency=2, timeout_seconds=1, clock=clock)

    async def burst():
        gate = asyncio.Event()

        async def wait():
            await gate.wait()
            return "done"

        tasks = [asyncio.ensure_future(b.call(wait, fallback="shed")) for _ in range(4)]
        await asyncio.sleep(0)
        gate.set()
        return await asyncio.gather(*tasks)

    results = run(burst())
    assert results.count("done") == 2 and results.count("shed") == 2


def test_old_failures_age_out_of_the_window():
    b = CircuitBreaker("dep", failure_threshold=3, window_seconds=60, clock=clock)
    NOW["t"] = 1000.0
    run(b.call(boom, fallback=None))
    run(b.call(boom, fallback=None))
    NOW["t"] = 1100.0
    run(b.call(boom, fallback=None))
    assert b.state == "closed", "two old failures plus one new one don't trip it"


if __name__ == "__main__":
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"\n{len(tests)} passed")
