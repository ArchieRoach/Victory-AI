"""Self-check: coach voice clips are made once, shared, and match the partner.

    MONGO_URL=x DB_NAME=t python3 backend/test_coach_voice.py
"""
import asyncio

from mongomock_motor import AsyncMongoMockClient

import server

server.db = AsyncMongoMockClient()["test"]
made = []


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
    out = clips_for({"user_id": "e"}, ["Something new"])
    assert out["clips"] == {}


if __name__ == "__main__":
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"\n{len(tests)} passed")
