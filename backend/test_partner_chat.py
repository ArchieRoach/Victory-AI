"""Self-check: the training partner answers in their own voice from real numbers only, never opens
with "as an AI", stays honest if asked, and never breaks when the AI is down.

    MONGO_URL=x DB_NAME=t python3 backend/test_partner_chat.py
"""
import asyncio
from types import SimpleNamespace

from fastapi.testclient import TestClient
from mongomock_motor import AsyncMongoMockClient

import partner_chat as pchat
import server

server.db = AsyncMongoMockClient()["test"]
PARTNER = {"name": "Rocco", "personality": "Direct, no-nonsense.", "phrases": ["Again!"], "focus_areas": ["Guard Position"]}
current = {"user": {"user_id": "u1", "name": "Lucas", "experience_level": "beginner", "training_partner": PARTNER}}
server.app.dependency_overrides[server.get_current_user] = lambda: current["user"]
client = TestClient(server.app)
server.GEMINI_API_KEY = "test"


async def not_flagged(text):
    return "kill" in text


server.is_content_flagged = not_flagged
calls = []


class FakeModels:
    def __init__(self, reply):
        self.reply = reply

    async def generate_content(self, model, contents, config):
        calls.append(SimpleNamespace(model=model, contents=contents, config=config))
        if isinstance(self.reply, Exception):
            raise self.reply
        return SimpleNamespace(text=self.reply)


def use(reply):
    server._genai_client = SimpleNamespace(aio=SimpleNamespace(models=FakeModels(reply)))


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def ask(text, deeper=False):
    return client.post("/api/partner/ask", json={"messages": [{"role": "user", "text": text}], "deeper": deeper})


def test_it_answers_in_bubbles_as_the_partner():
    use("As an AI, I think your guard drops late.\n\nKeep your right hand glued to your chin.\n\nAgain!")
    r = ask("How do I stop getting hit?")
    assert r.status_code == 200
    assert r.json() == {"name": "Rocco", "bubbles": ["I think your guard drops late.", "Keep your right hand glued to your chin.", "Again!"]}
    system = calls[-1].config.system_instruction
    assert "You are Rocco" in system and "Direct, no-nonsense." in system and "Guard Position" in system
    assert "not a human" in system and "Never invent" in system


def test_it_only_uses_real_numbers():
    run(server.db.sessions.insert_many([
        {"user_id": "u1", "date": "2026-11-10", "overall_score": 6.0,
         "dimension_scores": [{"dimension_name": "Jab", "score": 8}, {"dimension_name": "Footwork", "score": 4}]},
        {"user_id": "u1", "date": "2026-11-18", "overall_score": None,
         "live_stats": {"rounds": 3, "punches": 240, "best_combo": 5, "guard_drops": 7, "guard_pct": 81}},
        {"user_id": "someone_else", "date": "2026-11-19", "overall_score": 9.9},
    ]))
    use("Footwork first.")
    ask("What should I work on?")
    system = calls[-1].config.system_instruction
    assert "Sessions trained: 2" in system and "Last session: 2026-11-18" in system
    assert "Weakest parts lately: Footwork 4" in system and "Jab 8" in system
    assert "240 punches over 3 rounds" in system and "guard up 81%" in system
    assert "9.9" not in system


def test_with_nothing_filmed_it_says_so():
    lines = pchat.facts({}, [{"date": "2026-11-01", "overall_score": None}])
    assert any("No filmed, scored rounds yet" in l for l in lines)


def test_no_means_dig_deeper():
    use("Do 3 rounds of 2 minutes.")
    ask("I still don't get it", deeper=True)
    assert "Go deeper" in calls[-1].config.system_instruction
    assert calls[-1].config.max_output_tokens > 300


def test_it_never_breaks():
    use(RuntimeError("down"))
    r = ask("Help")
    assert r.status_code == 200 and r.json()["bubbles"] == [server.PARTNER_FALLBACK] and r.json()["offline"]
    assert ask("how do I kill").json()["bubbles"][0].startswith("I can't help")
    assert client.post("/api/partner/ask", json={"messages": []}).status_code == 400


def test_bubbles_are_tidy():
    assert pchat.bubbles("**One.**\n\n- Two\nlines.\n\nThree.\n\nFour.") == ["One.", "Two lines.", "Three. Four."]
    assert pchat.bubbles("I'm an AI language model, but hands up.") == ["But hands up."]


def test_feedback_is_saved():
    assert client.post("/api/partner/feedback", json={"helpful": False}).status_code == 200
    doc = run(server.db.partner_feedback.find_one({"user_id": "u1"}))
    assert doc["helpful"] is False


if __name__ == "__main__":
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"\n{len(tests)} passed")
