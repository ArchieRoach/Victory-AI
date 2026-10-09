# Circuit breakers for third-party services (moderation, email, web push, Clerk).
#
# Why: when a dependency is slow, every request that touches it waits for its timeout, and
# work that runs in threads (web push) can fill the shared thread pool that Stripe calls also
# use, so one bad dependency drags down unrelated features. A breaker notices repeated
# failures, then fails fast (or serves a fallback) for a cool-down period instead of waiting,
# lets one trial call through ("half-open") to check recovery, and caps how many calls can be
# in flight to that dependency at once.
import asyncio
import logging
import time
from typing import Any, Awaitable, Callable, Optional

logger = logging.getLogger(__name__)


class CircuitOpen(Exception):
    """Raised instead of calling a dependency whose breaker is open (or saturated)."""


class CircuitBreaker:
    def __init__(self, name: str, *, failure_threshold: int = 5, window_seconds: float = 60.0,
                 cooldown_seconds: float = 30.0, timeout_seconds: float = 5.0, max_concurrency: int = 10,
                 clock: Callable[[], float] = time.monotonic):
        self.name = name
        self.failure_threshold = failure_threshold
        self.window_seconds = window_seconds
        self.cooldown_seconds = cooldown_seconds
        self.timeout_seconds = timeout_seconds
        self.max_concurrency = max_concurrency
        self._clock = clock
        self._failures: list = []
        self._opened_at: Optional[float] = None
        self._trial_running = False
        self._in_flight = 0

    @property
    def state(self) -> str:
        if self._opened_at is None:
            return "closed"
        if self._clock() - self._opened_at >= self.cooldown_seconds:
            return "half_open"
        return "open"

    def _record_failure(self):
        now = self._clock()
        self._failures = [t for t in self._failures if now - t < self.window_seconds] + [now]
        if self.state == "half_open" or len(self._failures) >= self.failure_threshold:
            if self._opened_at is None or self.state == "half_open":
                logger.warning(f"[breaker] {self.name} opened after {len(self._failures)} failures")
            self._opened_at = now

    def _record_success(self):
        if self._opened_at is not None:
            logger.info(f"[breaker] {self.name} recovered")
        self._failures.clear()
        self._opened_at = None

    async def call(self, fn: Callable[[], Awaitable[Any]], *, fallback: Any = CircuitOpen) -> Any:
        """Runs fn() under a timeout. If the breaker is open, at its concurrency cap, or the call
        fails, returns `fallback` (or raises CircuitOpen / the error when no fallback is given)."""
        state = self.state
        trial = False
        if state == "open" or self._in_flight >= self.max_concurrency or (state == "half_open" and self._trial_running):
            if fallback is CircuitOpen:
                raise CircuitOpen(self.name)
            return fallback
        if state == "half_open":
            self._trial_running = trial = True
        self._in_flight += 1
        try:
            result = await asyncio.wait_for(fn(), timeout=self.timeout_seconds)
        except Exception:
            self._record_failure()
            if fallback is CircuitOpen:
                raise
            return fallback
        else:
            self._record_success()
            return result
        finally:
            self._in_flight -= 1
            if trial:
                self._trial_running = False
