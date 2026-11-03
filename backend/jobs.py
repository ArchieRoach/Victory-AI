"""Background jobs: slow work (sending email, scoring a round's video with AI) runs after the
request has answered, so a tap never waits on Resend or Gemini.

Jobs live in the `jobs` collection, so they survive a restart and any Railway instance can pick
them up: a worker claims one atomically (find_one_and_update), runs it, and retries failures with
a growing wait. Handlers are registered by name with @handler("kind").
"""
import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Awaitable, Callable, Dict, Optional

logger = logging.getLogger("jobs")
HANDLERS: Dict[str, Callable[[dict], Awaitable[Any]]] = {}
MAX_ATTEMPTS = 3
RETRY_SECONDS = (10, 60, 300)
STALE_MINUTES = 10  # a job "running" this long belonged to an instance that died: run it again


def handler(kind: str):
    def wrap(fn):
        HANDLERS[kind] = fn
        return fn
    return wrap


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def enqueue(db, kind: str, payload: dict, owner_id: Optional[str] = None) -> str:
    job_id = f"job_{uuid.uuid4().hex[:16]}"
    await db.jobs.insert_one({"job_id": job_id, "kind": kind, "payload": payload, "owner_id": owner_id,
                              "status": "queued", "attempts": 0, "run_after": _now().isoformat(),
                              "created_at": _now().isoformat()})
    return job_id


async def claim(db) -> Optional[dict]:
    now = _now()
    return await db.jobs.find_one_and_update(
        {"$or": [{"status": "queued", "run_after": {"$lte": now.isoformat()}},
                 {"status": "running", "started_at": {"$lte": (now - timedelta(minutes=STALE_MINUTES)).isoformat()}}]},
        {"$set": {"status": "running", "started_at": now.isoformat()}, "$inc": {"attempts": 1}},
        sort=[("run_after", 1)], return_document=True)


async def run_one(db, job: dict) -> None:
    fn = HANDLERS.get(job["kind"])
    try:
        if fn is None:
            raise RuntimeError(f"no handler for {job['kind']}")
        result = await fn(job["payload"])
    except Exception as e:
        attempts = job.get("attempts", 1)
        if attempts >= MAX_ATTEMPTS or fn is None:
            logger.error(f"Job {job['job_id']} ({job['kind']}) failed for good: {type(e).__name__}: {e}")
            await db.jobs.update_one({"job_id": job["job_id"]}, {"$set": {
                "status": "failed", "error": f"{type(e).__name__}", "finished_at": _now().isoformat()}})
        else:
            wait = RETRY_SECONDS[min(attempts - 1, len(RETRY_SECONDS) - 1)]
            logger.warning(f"Job {job['job_id']} ({job['kind']}) failed, retrying in {wait}s: {type(e).__name__}")
            await db.jobs.update_one({"job_id": job["job_id"]}, {"$set": {
                "status": "queued", "run_after": (_now() + timedelta(seconds=wait)).isoformat()}})
        return
    await db.jobs.update_one({"job_id": job["job_id"]}, {"$set": {
        "status": "done", "result": result, "finished_at": _now().isoformat()}})


async def drain(db, limit: int = 100) -> int:
    """Run every job that's due now (used by the worker loop and by tests)."""
    n = 0
    while n < limit:
        job = await claim(db)
        if not job:
            break
        await run_one(db, job)
        n += 1
    return n


async def worker(db, idle_seconds: float = 2.0):
    while True:
        try:
            job = await claim(db)
        except Exception as e:
            logger.warning(f"Job queue unavailable: {type(e).__name__}")
            job = None
        if job is None:
            await asyncio.sleep(idle_seconds)
            continue
        await run_one(db, job)


def start_workers(db, count: int):
    return [asyncio.create_task(worker(db)) for _ in range(count)]


async def prune(db, now: datetime, keep_days: int = 7) -> None:
    await db.jobs.delete_many({"status": {"$in": ["done", "failed"]},
                               "finished_at": {"$lte": (now - timedelta(days=keep_days)).isoformat()}})
