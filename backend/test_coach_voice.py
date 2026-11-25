"""Self-check: coach voice clips are made once, shared, and match the partner.

    MONGO_URL=x DB_NAME=t python3 backend/test_coach_voice.py
"""
import asyncio

from mongomock_motor import AsyncMongoMockClient

import server

server.db = AsyncMongoMockClient()["test"]
made = []
real_make = server._make_voice_clip


async def fake_make(voice_id, text, key):
    made.append((voice_id, text))
    return f"https://res.cloudinary.com/x/coach_voice/{key}.mp3"


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def clips_for(user, texts):
    return run(server.voice_clips(server.VoiceClipsIn(texts=texts), user=user))


def setup():
    server.ELEVENLABS_API_KEY = "k"
    server._make_voice_clip = fake_make


def test_a_clip_is_made_once_and_shared():
    setup()
    a = clips_for({"user_id": "a"}, ["Jab, Cross", "Hands up"])
    b = clips_for({"user_id": "b"}, ["Jab, Cross"])
    assert set(a["clips"]) == {"Jab, Cross", "Hands up"}
    assert b["clips"]["Jab, Cross"] == a["clips"]["Jab, Cross"]
    assert len(made) == 2, "the second fighter reuses the first fighter's clip"


def test_the_voice_matches_the_partner():
    setup()
    made.clear()
    her = clips_for({"user_id": "c", "training_partner": {"appearance_gender": "female"}}, ["Jab, Cross"])
    assert her["voice"] == "female"
    assert made == [(server.COACH_VOICES["female"], "Jab, Cross")], "a different voice is a different clip"
    assert clips_for({"user_id": "d"}, ["Breathe"])["voice"] == "male"


def test_lines_are_tidied_and_capped():
    lines = server.clean_voice_lines(["  Jab,   Cross ", "Jab, Cross", "", "x" * 500] + [f"line {i}" for i in range(100)])
    assert lines[0] == "Jab, Cross"
    assert "x" * 500 not in lines
    assert len(lines) == server.VOICE_CLIPS_PER_REQUEST


def test_no_key_means_no_clips_and_no_error():
    setup()
    server.ELEVENLABS_API_KEY = ""
    server.OPENAI_API_KEY = ""
    out = clips_for({"user_id": "e"}, ["Something new"])
    assert out["clips"] == {}


def test_without_elevenlabs_the_openai_voice_is_used():
    setup()
    made.clear()
    server.ELEVENLABS_API_KEY = ""
    server.OPENAI_API_KEY = "sk-test"
    out = clips_for({"user_id": "f"}, ["Jab, Jab, Cross"])
    assert out["clips"] and made == [("openai:onyx", "Jab, Jab, Cross")]
    her = clips_for({"user_id": "g", "training_partner": {"appearance_gender": "female"}}, ["Jab, Jab, Cross"])
    assert made[-1] == ("openai:nova", "Jab, Jab, Cross"), "a different voice is a different clip"
    assert her["clips"]["Jab, Jab, Cross"] != out["clips"]["Jab, Jab, Cross"]
    server.OPENAI_API_KEY = ""


def test_out_of_credit_elevenlabs_hands_over_to_the_backup_voice():
    import time
    server.ELEVENLABS_API_KEY, server.OPENAI_API_KEY = "el-test", "sk-test"
    assert not server.coach_voice_id("male").startswith("openai:")
    server._elevenlabs_out_until = time.time() + 60
    assert server.coach_voice_id("male") == "openai:onyx"
    server.OPENAI_API_KEY = ""
    assert not server.coach_voice_id("male").startswith("openai:"), "with no backup, keep trying ElevenLabs"
    server._elevenlabs_out_until = 0.0
    server.ELEVENLABS_API_KEY = ""


def test_google_free_voice_comes_first_and_stops_at_the_free_limit():
    import types
    server._make_voice_clip = real_make
    server.GOOGLE_TTS_API_KEY, server.ELEVENLABS_API_KEY, server.OPENAI_API_KEY = "g-test", "el-test", ""
    server._google_full_month = ""
    assert server.coach_voice_id("male") == "google:en-GB-Chirp3-HD-Charon"
    assert server.coach_voice_id("female") == "google:en-GB-Chirp3-HD-Aoede"
    sent = []

    async def fake_tts(name, text):
        sent.append((name, text))
        return b"mp3", 200, ""
    real_tts, real_upload = server._google_tts, server.cloudinary.uploader.upload
    server._google_tts = fake_tts
    server.cloudinary.uploader.upload = lambda *a, **k: {"secure_url": "https://res.cloudinary.com/x/coach_voice/k.mp3"}
    server.GOOGLE_TTS_FREE_CHARS = 20
    try:
        assert run(server._make_voice_clip("google:en-GB-Chirp3-HD-Charon", "Jab, Cross", "k1"))
        assert run(server._make_voice_clip("google:en-GB-Chirp3-HD-Charon", "One more long line here", "k2")) is None
        assert len(sent) == 1, "nothing is sent to Google past the free limit"
        assert server.coach_voice_id("male") == server.COACH_VOICES["male"], "the next provider takes over this month"
    finally:
        server._google_tts, server.cloudinary.uploader.upload = real_tts, real_upload
        server.GOOGLE_TTS_FREE_CHARS = 900000
        server.GOOGLE_TTS_API_KEY = server.ELEVENLABS_API_KEY = ""
        server._google_full_month = ""


if __name__ == "__main__":
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"\n{len(tests)} passed")
