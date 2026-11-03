"""Short-lived shared cache for answers that are the same for everyone and costly to work out
(leaderboards, real social-proof counts).

Uses Redis when REDIS_URL is set, so every Railway instance shares one copy; otherwise a small
in-process dict. A cache problem must never break a request: on any Redis error we log once and
work the answer out directly.
"""
import asyncio
import json
import logging
import os
import time
from typing import Any, Awaitable, Callable, Dict, Optional, Tuple

logger = logging.getLogger("cache")
PREFIX = "vai:"


class Cache:
    def __init__(self, url: Optional[str] = None):
        self.url = url
        self._redis = None
        self._local: Dict[str, Tuple[float, str]] = {}
        self._locks: Dict[str, asyncio.Lock] = {}
        self._warned = False

    def _client(self):
        if self.url and self._redis is None:
            import redis.asyncio as aioredis
            self._redis = aioredis.from_url(self.url, socket_timeout=0.5, socket_connect_timeout=0.5)
        return self._redis

    def _warn(self, e: Exception):
        if not self._warned:
            logger.warning(f"Redis unavailable, working answers out directly: {type(e).__name__}")
            self._warned = True

    async def get(self, key: str) -> Any:
        try:
            r = self._client()
            if r is not None:
                raw = await r.get(PREFIX + key)
            else:
                hit = self._local.get(key)
                raw = hit[1] if hit and hit[0] > time.monotonic() else None
            return None if raw is None else json.loads(raw)
        except Exception as e:
            self._warn(e)
            return None

    async def set(self, key: str, value: Any, ttl: int):
        raw = json.dumps(value, default=str)
        try:
            r = self._client()
            if r is not None:
                await r.set(PREFIX + key, raw, ex=ttl)
            else:
                if len(self._local) > 5000:
                    self._local.clear()
                self._local[key] = (time.monotonic() + ttl, raw)
        except Exception as e:
            self._warn(e)

    async def delete(self, key: str):
        self._local.pop(key, None)
        try:
            r = self._client()
            if r is not None:
                await r.delete(PREFIX + key)
        except Exception as e:
            self._warn(e)

    async def remember(self, key: str, ttl: int, compute: Callable[[], Awaitable[Any]]) -> Any:
        """Cached answer, or compute it once (concurrent callers on this instance wait for the
        first one instead of all hitting the database at the same moment)."""
        hit = await self.get(key)
        if hit is not None:
            return hit
        lock = self._locks.setdefault(key, asyncio.Lock())
        async with lock:
            hit = await self.get(key)
            if hit is not None:
                return hit
            value = await compute()
            await self.set(key, value, ttl)
            return value


cache = Cache(os.environ.get("REDIS_URL") or None)
