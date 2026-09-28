"""Self-check for auto highlights: the hype spike detector, the watermark URL builder, and the
clip → Livepeer → Cloudinary pipeline with every external service faked. No DB or network needed:

    python3 backend/test_highlights.py
"""
import asyncio
from urllib.parse import unquote

import server
from server import (
    HypeTracker, HYPE_COOLDOWN_S, HYPE_MAX_PER_STREAM, HYPE_MIN_SCORE, HYPE_FREE_CAP_PER_USER,
    tip_hype_weight, gift_hype_weight, watermark_handle, highlight_share_urls,
)


def burst(tracker, stream, users, taps_each, at):
    spike = None
    for u in users:
        for i in range(taps_each):
            spike = tracker.record(stream, u, 1, now=at + i * 0.1) or spike
    return spike


def test_quiet_stream_never_fires():
    t = HypeTracker()
    for i in range(200):
        assert t.record("s", f"u{i % 5}", 1, now=i * 3.0) is None


def test_burst_from_several_viewers_fires():
    t = HypeTracker()
    spike = burst(t, "s", ["a", "b", "c"], 4, at=1000)
    assert spike is not None
    assert spike["reactors"] == 3
    assert spike["score"] >= HYPE_MIN_SCORE


def test_one_spammer_cannot_fake_a_spike():
    t = HypeTracker()
    assert burst(t, "s", ["spammer"], 50, at=1000) is None
    assert burst(t, "s2", ["spammer", "friend"], 50, at=1000) is None


def test_free_signals_are_capped_per_user():
    t = HypeTracker()
    spike = burst(t, "s", ["a", "b", "c"], 20, at=1000)
    assert spike["score"] == HYPE_FREE_CAP_PER_USER * 3
    assert burst(HypeTracker(), "s", ["a", "b", "c"], 3, at=1000) is None


def test_paid_reactions_count_in_full():
    t = HypeTracker()
    t.record("s", "a", 1, now=1000)
    t.record("s", "b", 1, now=1000.5)
    spike = t.record("s", "c", tip_hype_weight(500), paid=True, now=1001)
    assert spike is not None and spike["reactors"] == 3


def test_busy_stream_needs_a_real_spike_over_baseline():
    t = HypeTracker()
    regulars = [f"u{i}" for i in range(10)]
    fired = 0
    # Steady chatter: 10 users × 2 msgs every 10s is above the floor, but it's the baseline.
    for w in range(12):
        for i, u in enumerate(regulars):
            for k in range(2):
                if t.record("s", u, 1, now=w * 10 + k * 3 + i * 0.1):
                    fired += 1
    assert fired <= 1
    assert burst(t, "s", regulars + [f"n{i}" for i in range(10)], 4, at=121) is not None


def test_cooldown_and_per_stream_cap():
    t = HypeTracker()
    assert burst(t, "s", ["a", "b", "c"], 4, at=1000)
    assert burst(t, "s", ["d", "e", "f"], 4, at=1005) is None
    at = 1000 + HYPE_COOLDOWN_S + 200
    fired = 1
    for _ in range(HYPE_MAX_PER_STREAM + 5):
        if burst(t, "s", ["a", "b", "c"], 4, at=at):
            fired += 1
        at += HYPE_COOLDOWN_S + 200
    assert fired == HYPE_MAX_PER_STREAM


def test_forget_resets_stream():
    t = HypeTracker()
    assert burst(t, "s", ["a", "b", "c"], 4, at=1000)
    t.forget("s")
    assert burst(t, "s", ["a", "b", "c"], 4, at=1001)


def test_weights():
    assert tip_hype_weight(25) == 5
    assert tip_hype_weight(100_000) == 20
    assert gift_hype_weight(1) == 8
    assert gift_hype_weight(50) == 40


def test_watermark_handle_is_sanitised():
    assert watermark_handle("Big Mike") == "@Big_Mike"
    assert watermark_handle("a/b,c:d") == "@abcd"
    assert watermark_handle("") == "@fighter"
    assert watermark_handle("🔥🔥") == "@fighter"
    assert len(watermark_handle("x" * 100)) == 25


def test_share_url_has_watermark_and_vertical_format():
    server.cloudinary.config(cloud_name="demo")
    urls = highlight_share_urls("victory_highlights/hl_1", "@Big_Mike", peak_reactions=42)
    v = unquote(urls["share_video_url"])
    assert v.startswith("https://res.cloudinary.com/demo/video/upload/")
    assert "c_pad,h_1920,w_1080" in v
    assert "VICTORY AI" in v and "@Big_Mike" in v and "42 REACTIONS AT ONCE" in v
    assert v.endswith("victory_highlights/hl_1.mp4")
    assert urls["thumbnail_url"].endswith(".jpg")
    plain = unquote(highlight_share_urls("p", "@x")["share_video_url"])
    assert "REACTIONS" not in plain


# ── Pipeline with faked services ─────────────────────────────────────────────

class FakeCollection:
    def __init__(self):
        self.docs = []

    async def insert_one(self, doc):
        self.docs.append(dict(doc))

    async def find_one(self, q, proj=None):
        for d in self.docs:
            if all(d.get(k) == v for k, v in q.items()):
                return dict(d)
        return None

    async def update_one(self, q, upd):
        for d in self.docs:
            if all(d.get(k) == v for k, v in q.items()):
                d.update(upd.get("$set", {}))
                return


class FakeDB:
    def __init__(self):
        self.highlights = FakeCollection()
        self.streams = FakeCollection()
        self.users = FakeCollection()
        self.posts = FakeCollection()


class FakeResp:
    def __init__(self, code):
        self.status_code = code


class FakeHttp:
    heads = 0

    def __init__(self, *a, **k):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def head(self, url):
        FakeHttp.heads += 1
        return FakeResp(200 if FakeHttp.heads >= 2 else 423)


def run_pipeline(asset_phases, upload_raises=False):
    db = FakeDB()
    calls = {"clip": [], "upload": [], "broadcast": [], "push": []}
    phases = iter(asset_phases)

    async def fake_livepeer(method, path, payload=None):
        if path == "/clip":
            calls["clip"].append(payload)
            return {"asset": {"id": "asset_1", "playbackId": "pb_clip"}}
        return {"status": {"phase": next(phases)}, "playbackId": "pb_clip", "downloadUrl": "https://lp/dl.mp4"}

    def fake_upload(url, **kw):
        if upload_raises:
            raise RuntimeError("cloudinary down")
        calls["upload"].append((url, kw))
        return {}

    class WS:
        async def broadcast(self, sid, data):
            calls["broadcast"].append(data)

    async def fake_push(uid, **kw):
        calls["push"].append(uid)

    saved = {k: getattr(server, k) for k in ("db", "_livepeer", "ws_manager", "_send_push", "HIGHLIGHT_POLL_S")}
    saved_upload, saved_client = server.cloudinary.uploader.upload, server.httpx.AsyncClient
    server.db, server._livepeer, server.ws_manager, server._send_push = db, fake_livepeer, WS(), fake_push
    server.HIGHLIGHT_POLL_S = 0
    server.cloudinary.uploader.upload = fake_upload
    server.httpx.AsyncClient = FakeHttp
    server.cloudinary.config(cloud_name="demo")
    FakeHttp.heads = 0
    try:
        async def go():
            await db.streams.insert_one({"stream_id": "st", "user_id": "streamer", "status": "live",
                                         "playback_id": "pb_live", "title": "Sparring night", "user_name": "Mike"})
            await db.users.insert_one({"user_id": "streamer", "display_name": "Big Mike"})
            await server._start_auto_highlight("st", {"score": 20, "reaction_count": 42, "reactors": 7,
                                                      "at": server.time.time() - 60})
            await asyncio.gather(*list(server._bg_tasks))
            return db.highlights.docs[0]
        hl = asyncio.run(go())
    finally:
        for k, v in saved.items():
            setattr(server, k, v)
        server.cloudinary.uploader.upload, server.httpx.AsyncClient = saved_upload, saved_client
    return hl, calls


def test_pipeline_happy_path():
    hl, calls = run_pipeline(["processing", "ready"])
    assert hl["status"] == "ready", hl
    assert hl["source"] == "auto" and hl["peak_reactions"] == 42
    clip = calls["clip"][0]
    assert clip["playbackId"] == "pb_live"
    assert 30_000 <= clip["endTime"] - clip["startTime"] <= 45_000
    assert calls["upload"][0][0] == "https://lp/dl.mp4"
    assert calls["upload"][0][1]["public_id"] == f"victory_highlights/{hl['highlight_id']}"
    assert "@Big_Mike" in unquote(hl["share_video_url"])
    types = [b["type"] for b in calls["broadcast"]]
    assert types == ["highlight", "highlight_ready"]
    assert calls["push"] == ["streamer"]


def test_pipeline_marks_failure():
    hl, calls = run_pipeline(["failed"])
    assert hl["status"] == "failed" and "Livepeer" in hl["error"]
    hl, calls = run_pipeline(["ready"], upload_raises=True)
    assert hl["status"] == "failed" and "cloudinary" in hl["error"]
    assert calls["push"] == []


def test_ended_stream_is_not_clipped():
    db = FakeDB()
    saved = server.db
    server.db = db
    try:
        async def go():
            await db.streams.insert_one({"stream_id": "st", "user_id": "u", "status": "ended", "playback_id": "p"})
            await server._start_auto_highlight("st", {"score": 20, "reaction_count": 5, "reactors": 3, "at": 0})
        asyncio.run(go())
    finally:
        server.db = saved
    assert db.highlights.docs == []


if __name__ == "__main__":
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"\n{len(tests)} passed")
