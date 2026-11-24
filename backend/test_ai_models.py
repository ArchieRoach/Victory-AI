"""Self-check: the app picks Google's newest available general model, so a retired model name
(like gemini-2.5-flash in Nov 2026) can't break video scoring, help chat or the training partner.

    python3 backend/test_ai_models.py
"""
from types import SimpleNamespace

import ai_models

LIVE = [
    SimpleNamespace(name="models/gemini-3.5-flash", supported_actions=["generateContent", "countTokens"]),
    SimpleNamespace(name="models/gemini-3.5-flash-lite", supported_actions=["generateContent"]),
    SimpleNamespace(name="models/gemini-3.5-flash-preview-11-2026", supported_actions=["generateContent"]),
    SimpleNamespace(name="models/gemini-3-flash", supported_actions=["generateContent"]),
    SimpleNamespace(name="models/gemini-3.5-flash-image", supported_actions=["generateContent"]),
    SimpleNamespace(name="models/gemini-3.5-flash-tts", supported_actions=["generateContent"]),
    SimpleNamespace(name="models/gemini-3.5-pro", supported_actions=["generateContent"]),
    SimpleNamespace(name="models/text-embedding-005", supported_actions=["embedContent"]),
    SimpleNamespace(name="models/gemini-flash-latest", supported_actions=["generateContent"]),
]


def test_newest_stable_flash_first_and_no_special_models():
    r = ai_models.rank(LIVE)
    assert r["full"][0] == "gemini-3.5-flash"
    assert r["full"][1] == "gemini-3.5-flash-preview-11-2026"
    assert "gemini-3-flash" in r["full"] and "gemini-flash-latest" in r["full"]
    assert r["lite"] == ["gemini-3.5-flash-lite"]
    assert not any(x in " ".join(r["full"]) for x in ("image", "tts", "pro", "embedding"))


def test_video_plan_retries_then_falls_back():
    plan = ai_models.video_plan(ai_models.rank(LIVE))
    models = [m for m, _ in plan]
    assert models[0] == models[1] == "gemini-3.5-flash"
    assert "gemini-3.5-flash-lite" in models and len(plan) <= 5
    assert sum(w for _, w in plan) <= 30


def test_a_set_model_wins_only_if_google_still_has_it():
    r = ai_models.rank(LIVE)
    assert ai_models.chat_model(r, "gemini-3-flash") == "gemini-3-flash"
    assert ai_models.chat_model(r, "gemini-2.5-flash") == "gemini-3.5-flash", "retired name ignored"
    assert ai_models.video_plan(r, "gemini-2.5-flash")[0][0] == "gemini-3.5-flash"


def test_when_the_list_cant_be_read_the_latest_alias_is_used():
    empty = {"full": [], "lite": []}
    assert ai_models.chat_model(empty) == "gemini-flash-latest"
    assert ai_models.video_plan(empty)[0][0] == "gemini-flash-latest"


if __name__ == "__main__":
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"\n{len(tests)} passed")
