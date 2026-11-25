"""Self-check for video-based scoring: the model is sent the round video itself (not
still frames), nothing it didn't see gets a score, and a failed analysis costs nothing:

    MONGO_URL=x DB_NAME=t python3 backend/test_video_scoring.py
"""
import asyncio
import json
import os
from types import SimpleNamespace

os.environ.setdefault("CLOUDINARY_CLOUD_NAME", "victorycloud")

from fastapi.testclient import TestClient
from mongomock_motor import AsyncMongoMockClient

import server
from server import clean_video_analysis, cloudinary_video_public_id, competition_result, DRILLS

server.db = AsyncMongoMockClient()["test"]
server.cloudinary.config(cloud_name="victorycloud")
server.GEMINI_API_KEY = "test-key"
current = {}
server.app.dependency_overrides[server.get_current_user] = lambda: current["user"]
client = TestClient(server.app)

GOOD = {
    "boxer_visible": True,
    "dimension_scores": [
        {"dimension_name": "Jab", "score": 7, "evidence": "0:12, 0:40 jab snaps back to guard"},
        {"dimension_name": "Guard Position", "score": 4, "evidence": "0:22 right hand drops on every cross"},
        {"dimension_name": "Uppercut", "score": None, "evidence": "none thrown"},
        {"dimension_name": "Jab", "score": 10, "evidence": "duplicate"},
        {"dimension_name": "Telekinesis", "score": 9, "evidence": "made up"},
        {"dimension_name": "Footwork", "score": 14, "evidence": "0:50"},
    ],
    "what_did_well": "Your jab at 0:12 came back fast.",
    "what_to_improve": "Right hand drops when you throw the cross.",
}


class FakeModels:
    def __init__(self, payload):
        self.payload, self.calls = payload, []

    async def generate_content(self, model, contents, config):
        self.calls.append(SimpleNamespace(model=model, contents=contents, config=config))
        if isinstance(self.payload, Exception):
            raise self.payload
        return SimpleNamespace(text=json.dumps(self.payload))


def use_gemini(payload):
    models = FakeModels(payload)
    server._genai_client = SimpleNamespace(aio=SimpleNamespace(models=models))
    return models


class FakeHttp:
    def __init__(self, *a, **k):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def get(self, url):
        FakeHttp.urls.append(url)
        return SimpleNamespace(status_code=200, content=b"\x00\x00\x00\x18ftypmp42" + b"0" * 1000)


FakeHttp.urls = []
server.httpx.AsyncClient = FakeHttp


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def test_cleaning_drops_unseen_invented_and_duplicate_scores():
    a = clean_video_analysis(GOOD)
    by = {d["dimension_name"]: d["score"] for d in a["dimension_scores"]}
    assert by == {"Jab": 7, "Guard Position": 4, "Uppercut": None, "Footwork": 10}
    assert a["drill_recommendation"] == DRILLS["Guard Position"], "drill targets the weakest seen skill"
    assert a["source"] == "video"


def test_nothing_seen_means_unscored():
    assert clean_video_analysis({**GOOD, "boxer_visible": False}) is None
    assert clean_video_analysis({**GOOD, "dimension_scores": [{"dimension_name": "Jab", "score": None, "evidence": ""}]}) is None
    assert clean_video_analysis("nope") is None


def test_round_is_scored_from_the_video_itself():
    run(server.db.users.insert_one({"user_id": "u1", "ai_tokens_used": 0, "ai_tokens_month": "x"}))
    run(server.db.round_videos.insert_one({"user_id": "u1", "public_id": "rounds/r1",
                                           "video_url": "https://res.cloudinary.com/victorycloud/video/upload/rounds/r1.mp4"}))
    current["user"] = {"user_id": "u1", "training_partner": {"name": "Coach K"}}
    models = use_gemini(GOOD)
    r = client.post("/api/ai/analyze-video", json={"video_url": "https://res.cloudinary.com/victorycloud/video/upload/rounds/r1.mp4", "round_number": 2})
    assert r.status_code == 200, r.text
    assert r.json()["analysis"]["dimension_scores"][0] == {"dimension_name": "Jab", "score": 7, "evidence": "0:12, 0:40 jab snaps back to guard"}

    call = models.calls[0]
    video = call.contents[0]
    assert video.inline_data.mime_type == "video/mp4" and video.inline_data.data.startswith(b"\x00\x00\x00\x18ftyp")
    assert video.video_metadata.fps == server.GEMINI_VIDEO_FPS
    assert call.config.temperature == 0
    assert "round 2" in call.contents[1] and "MUST be null" in call.contents[1]
    assert "/video/upload/" in FakeHttp.urls[-1] and FakeHttp.urls[-1].endswith("rounds/r1.mp4")
    assert "so_" not in FakeHttp.urls[-1], "no still-frame sampling"
    stored = run(server.db.round_videos.find_one({"public_id": "rounds/r1"}))
    assert stored["analysis_results"]["source"] == "video"


def test_failed_analysis_is_unscored_and_refunded():
    current["user"] = {"user_id": "u1"}
    before = run(server.db.users.find_one({"user_id": "u1"}))["ai_tokens_used"]
    use_gemini(RuntimeError("model down"))
    r = client.post("/api/ai/analyze-video", json={"video_url": "https://res.cloudinary.com/victorycloud/video/upload/rounds/r1.mp4"})
    assert r.json()["analysis"] is None and r.json()["unavailable"] is True
    assert run(server.db.users.find_one({"user_id": "u1"}))["ai_tokens_used"] == before


def test_scoring_can_run_in_the_background_and_the_app_checks_back():
    current["user"] = {"user_id": "u1", "training_partner": {"name": "Coach K"}}
    use_gemini(GOOD)
    r = client.post("/api/ai/analyze-video", json={"video_url": "https://res.cloudinary.com/victorycloud/video/upload/rounds/r1.mp4",
                                                   "round_number": 3, "background": True})
    job_id = r.json()["job_id"]
    assert r.json()["status"] == "queued"
    assert client.get(f"/api/ai/jobs/{job_id}").json()["status"] == "queued"
    assert run(server.jobs.drain(server.db)) == 1
    done = client.get(f"/api/ai/jobs/{job_id}").json()
    assert done["status"] == "done" and done["result"]["analysis"]["dimension_scores"][0]["score"] == 7
    current["user"] = {"user_id": "someone_else"}
    assert client.get(f"/api/ai/jobs/{job_id}").status_code == 404, "only the owner can read their result"


def test_a_score_that_arrives_after_the_results_page_lands_on_the_saved_session():
    # Doherty threshold: the round is saved straight away (unscored), then the video finishes
    # scoring in the background and the saved session gets the score.
    current["user"] = {"user_id": "u7", "training_partner": {"name": "Coach K"}, "has_subscription": True}
    url = "https://res.cloudinary.com/victorycloud/video/upload/rounds/late.mp4"
    run(server.db.sessions.insert_one({"session_id": "train_late", "user_id": "u7", "scored": False, "overall_score": None,
                                       "record_video": True, "kind": "standard", "dimension_scores": []}))
    client.post("/api/videos/register", json={"session_id": "train_late", "round_number": 1, "video_url": url,
                                              "public_id": "rounds/late"})
    use_gemini(GOOD)
    r = client.post("/api/ai/analyze-video", json={"video_url": url, "round_number": 1, "background": True})
    assert r.status_code == 200, r.text
    run(server.jobs.drain(server.db))
    saved = client.get("/api/sessions/train_late").json()
    assert saved["scored"] is True and saved["overall_score"] is not None
    assert saved["scouting_report"].get("reason") != "unscored" and not saved["scouting_report"].get("locked")
    assert saved["rounds"][0]["analysis"]["dimension_scores"]


def test_competition_judge_reads_our_cloudinary_videos_only():
    assert cloudinary_video_public_id("https://res.cloudinary.com/victorycloud/video/upload/v1712/victory/comp/abc.mp4") == "victory/comp/abc"
    assert cloudinary_video_public_id("https://res.cloudinary.com/someoneelse/video/upload/v1/x.mp4") is None
    assert cloudinary_video_public_id("https://evil.example/video.mp4") is None


def test_competition_result_uses_only_seen_skills():
    res = competition_result(clean_video_analysis(GOOD))
    assert res["scores"] == {"Jab": 7, "Guard Position": 4, "Footwork": 10}
    assert res["overall"] == 7.0
    assert res["highlight"].startswith("Footwork 10/10")


def test_a_busy_model_is_retried_then_the_backup_is_used():
    from google.genai import errors as genai_errors
    busy = genai_errors.ServerError(503, {"error": {"code": 503, "message": "high demand", "status": "UNAVAILABLE"}})

    class Flaky:
        def __init__(self, fails):
            self.fails, self.models = fails, []

        async def generate_content(self, model, contents, config):
            self.models.append(model)
            if len(self.models) <= self.fails:
                raise busy
            return SimpleNamespace(text=json.dumps(GOOD))

    waits = []

    async def no_sleep(s):
        waits.append(s)

    import time as _time
    server._model_list.update(at=_time.time(), ranked={"full": ["gemini-3.5-flash", "gemini-3-flash"], "lite": ["gemini-3.5-flash-lite"]})
    flaky = Flaky(fails=2)
    server._genai_client = SimpleNamespace(aio=SimpleNamespace(models=flaky))
    run(server._score_with_retries(["v"], None, genai_errors, sleep=no_sleep))
    assert flaky.models == ["gemini-3.5-flash", "gemini-3.5-flash", "gemini-3-flash"], flaky.models
    assert sum(waits) <= 30

    always = Flaky(fails=99)
    server._genai_client = SimpleNamespace(aio=SimpleNamespace(models=always))
    try:
        run(server._score_with_retries(["v"], None, genai_errors, sleep=no_sleep))
        assert False, "should give up after the plan"
    except RuntimeError as e:
        assert "gemini-3.5-flash:503" in str(e)
    assert len(always.models) == 5

    gone = genai_errors.ClientError(404, {"error": {"code": 404, "message": "no longer available", "status": "NOT_FOUND"}})

    class Retired:
        models = []
        async def generate_content(self, model, contents, config):
            Retired.models.append(model)
            if model != "gemini-3.5-flash-lite":
                raise gone
            return SimpleNamespace(text=json.dumps(GOOD))
    server._genai_client = SimpleNamespace(aio=SimpleNamespace(models=Retired()))
    run(server._score_with_retries(["v"], None, genai_errors, sleep=no_sleep))
    assert Retired.models.count("gemini-3.5-flash") == 1, "a retired model isn't asked twice"
    assert Retired.models[-1] == "gemini-3.5-flash-lite"
    server._model_list.update(at=0.0, ranked=None)

    bad = genai_errors.ClientError(400, {"error": {"code": 400, "message": "bad request", "status": "INVALID_ARGUMENT"}})

    class Broken:
        models = []
        async def generate_content(self, model, contents, config):
            Broken.models.append(model)
            raise bad
    server._genai_client = SimpleNamespace(aio=SimpleNamespace(models=Broken()))
    try:
        run(server._score_with_retries(["v"], None, genai_errors, sleep=no_sleep))
    except genai_errors.ClientError:
        pass
    assert len(Broken.models) == 1, "a real error isn't retried"


if __name__ == "__main__":
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"\n{len(tests)} passed")
