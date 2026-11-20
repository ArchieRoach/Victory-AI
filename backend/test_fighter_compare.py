"""Self-check: compare with a fighter. Links from YouTube, TikTok and Instagram become embeds (never
copies), bad or short links get a helpful message, and each fighter only sees their own clips and rounds.

    MONGO_URL=x DB_NAME=t python3 backend/test_fighter_compare.py
"""
import asyncio

from fastapi.testclient import TestClient
from mongomock_motor import AsyncMongoMockClient

import fighter_compare as fc
import server

server.db = AsyncMongoMockClient()["test"]


async def flagged(text):
    return "badword" in text


server.is_content_flagged = flagged
USERS = {"a": {"user_id": "a", "name": "Ana"}, "b": {"user_id": "b", "name": "Ben"}}
current = {"id": "a"}
server.app.dependency_overrides[server.get_current_user] = lambda: USERS[current["id"]]
client = TestClient(server.app)


def as_(who):
    current["id"] = who
    return client


def test_youtube_links_in_every_shape():
    cases = {
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s": ("dQw4w9WgXcQ", 90),
        "youtu.be/dQw4w9WgXcQ?t=42": ("dQw4w9WgXcQ", 42),
        "https://youtube.com/shorts/dQw4w9WgXcQ?feature=share": ("dQw4w9WgXcQ", 0),
        "https://m.youtube.com/watch?v=dQw4w9WgXcQ": ("dQw4w9WgXcQ", 0),
    }
    for url, (vid, start) in cases.items():
        p = fc.parse_clip_url(url)
        assert p == {"provider": "youtube", "clip_id": vid, "start": start}, url
    assert fc.parse_clip_url("https://www.youtube.com/@channel") is None


def test_tiktok_and_instagram_links():
    assert fc.parse_clip_url("https://www.tiktok.com/@boxer/video/7301234567890123456?lang=en") == \
        {"provider": "tiktok", "clip_id": "7301234567890123456", "start": 0}
    assert fc.parse_clip_url("https://www.instagram.com/reel/C1a2B3c4D5e/?igsh=abc")["clip_id"] == "C1a2B3c4D5e"
    assert fc.parse_clip_url("https://instagram.com/p/C1a2B3c4D5e/")["provider"] == "instagram"
    assert fc.parse_clip_url("https://evil.example.com/watch?v=dQw4w9WgXcQ") is None
    assert fc.parse_clip_url("javascript:alert(1)") is None


def test_embeds_use_the_platform_player_and_link_back():
    v = fc.clip_view({"clip_doc_id": "x", "provider": "youtube", "clip_id": "dQw4w9WgXcQ", "start": 90, "fighter_name": "Loma"})
    assert v["embed_url"].startswith("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?") and "start=90" in v["embed_url"]
    assert v["watch_url"] == "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90s"
    assert fc.embed_url("tiktok", "7301234567890123456").startswith("https://www.tiktok.com/player/v1/7301234567890123456")
    assert fc.embed_url("instagram", "C1a2B3c4D5e") == "https://www.instagram.com/reel/C1a2B3c4D5e/embed/"


def test_save_list_and_delete_your_clips():
    r = as_("a").post("/api/compare/fighter-clips", json={"url": "https://youtu.be/dQw4w9WgXcQ?t=30", "fighter_name": "Lomachenko"})
    assert r.status_code == 200, r.text
    clip = r.json()
    assert clip["fighter_name"] == "Lomachenko" and clip["provider"] == "youtube"
    assert clip["watch_url"] == "https://youtu.be/dQw4w9WgXcQ?t=30"
    tt = as_("a").post("/api/compare/fighter-clips", json={"url": "https://www.tiktok.com/@boxer/video/7301234567890123456?is_from_webapp=1&sender_device=pc", "fighter_name": "Inoue"}).json()
    assert tt["watch_url"] == "https://www.tiktok.com/@boxer/video/7301234567890123456"
    as_("a").delete(f"/api/compare/fighter-clips/{tt['clip_id']}")
    again = as_("a").post("/api/compare/fighter-clips", json={"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30", "fighter_name": "Loma"})
    assert again.json()["clip_id"] == clip["clip_id"]
    assert len(as_("a").get("/api/compare/fighter-clips").json()["clips"]) == 1
    assert as_("b").get("/api/compare/fighter-clips").json()["clips"] == []
    assert as_("b").delete(f"/api/compare/fighter-clips/{clip['clip_id']}").status_code == 404
    assert as_("a").delete(f"/api/compare/fighter-clips/{clip['clip_id']}").json() == {"deleted": True}


def test_helpful_messages_for_bad_links():
    short = as_("a").post("/api/compare/fighter-clips", json={"url": "https://vm.tiktok.com/ZMabc123/", "fighter_name": "Canelo"})
    assert short.status_code == 400 and "Copy link" in short.json()["detail"]
    bad = as_("a").post("/api/compare/fighter-clips", json={"url": "https://example.com/x", "fighter_name": "Canelo"})
    assert bad.status_code == 400 and "YouTube, TikTok or Instagram" in bad.json()["detail"]
    rude = as_("a").post("/api/compare/fighter-clips", json={"url": "https://youtu.be/dQw4w9WgXcQ", "fighter_name": "badword"})
    assert rude.status_code == 400


def test_my_rounds_are_only_mine():
    asyncio.get_event_loop().run_until_complete(server.db.round_videos.insert_many([
        {"video_id": "v1", "user_id": "a", "session_id": "s1", "round_number": 2, "video_url": "https://res.cloudinary.com/x/a.mp4", "created_at": "2026-11-18T10:00:00"},
        {"video_id": "v2", "user_id": "b", "session_id": "s2", "round_number": 1, "video_url": "https://res.cloudinary.com/x/b.mp4", "created_at": "2026-11-19T10:00:00"},
        {"video_id": "v3", "user_id": "a", "session_id": "s3", "round_number": 1, "video_url": None, "created_at": "2026-11-19T10:00:00"},
    ]))
    rounds = as_("a").get("/api/compare/my-rounds").json()["rounds"]
    assert [r["video_id"] for r in rounds] == ["v1"] and rounds[0]["date"] == "2026-11-18"


if __name__ == "__main__":
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"\n{len(tests)} passed")
