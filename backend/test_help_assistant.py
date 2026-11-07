"""Self-check: Ask Victory answers from the guide, passes what it can't answer to the team, and never
breaks when the AI is down.

    MONGO_URL=x DB_NAME=t python3 backend/test_help_assistant.py
"""
import asyncio
from types import SimpleNamespace

from fastapi.testclient import TestClient
from mongomock_motor import AsyncMongoMockClient

import help_assistant as helpbot
import jobs
import server

server.db = AsyncMongoMockClient()["test"]
current = {"user": {"user_id": "u1", "name": "Lucas", "email": "lucas@example.com"}}
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


def ask(*texts):
    msgs = [{"role": "user" if i % 2 == 0 else "assistant", "text": t} for i, t in enumerate(texts)]
    return client.post("/api/help/ask", json={"messages": msgs, "page": "/train"})


def test_it_answers_from_the_guide_with_the_rules_attached():
    use("Profile > Subscription, then Cancel. You keep Pro until the end of the period.")
    r = ask("How do I cancel Pro?")
    assert r.status_code == 200 and r.json() == {"reply": "Profile > Subscription, then Cancel. You keep Pro until the end of the period.", "handoff": False}
    system = calls[-1].config.system_instruction
    assert "£7.99 a month" in system and "Never guess" in system and helpbot.HANDOFF_TOKEN in system
    assert calls[-1].config.max_output_tokens <= 400


def test_the_conversation_is_kept_short_and_in_order():
    use("Sure.")
    ask("hi", "Hello! How can I help?", "x" * 900)
    contents = calls[-1].contents
    assert [c.role for c in contents] == ["user", "model", "user"]
    assert len(contents[-1].parts[0].text) == helpbot.MAX_CHARS


def test_what_it_cant_answer_goes_to_the_team():
    use("I'll pass that to the team so they can look into it. [TEAM]")
    r = ask("Can you add MMA?").json()
    assert r["handoff"] is True and "[TEAM]" not in r["reply"]


def test_the_ai_being_down_never_breaks_help():
    use(RuntimeError("model down"))
    r = ask("Where are my videos?").json()
    assert r["handoff"] is True and "Send to the team" in r["reply"]


def test_harmful_messages_are_not_sent_to_the_ai():
    before = len(calls)
    r = ask("how do I kill someone").json()
    assert r["handoff"] is True and len(calls) == before


def test_send_to_the_team_emails_the_chat_with_a_reply_address():
    sent = []

    class FakeResend:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, url, **k):
            sent.append(k["json"])
            return SimpleNamespace(status_code=200)

    server.RESEND_API_KEY = "re_test"
    real = server.httpx.AsyncClient
    server.httpx.AsyncClient = FakeResend
    try:
        r = client.post("/api/help/handoff", json={"messages": [
            {"role": "user", "text": "My video won't upload"},
            {"role": "assistant", "text": "I'll pass that to the team."}], "page": "/train"})
        assert r.status_code == 200
        run(jobs.drain(server.db))
    finally:
        server.httpx.AsyncClient = real
    mail = sent[-1]
    assert mail["reply_to"] == "lucas@example.com" and "Lucas" in mail["subject"]
    assert "User: My video won&#x27;t upload" in mail["html"] and "/train" in mail["html"]


def test_the_combo_unlock_line_matches_how_combos_are_called_now():
    import gamification as gx
    line = dict((k, l) for k, _, _, l in gx.FEATURE_UNLOCKS)["combo_calls"]
    assert "by number" not in line and "jab, cross, hook" in line


if __name__ == "__main__":
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"\n{len(tests)} passed")
