"""Picks Google's Gemini models from the list Google says is available right now.

Goal: AI features (video scoring, help chat, the training partner) never break because Google
  retired a model name. In November 2026 "gemini-2.5-flash" and "-flash-lite" stopped working for
  new accounts, and every filmed round went unscored.
Design: ask Google for the live model list (cached for a few hours), keep the general-purpose
  "flash" models that can generate content, and prefer the newest stable one. A name set in the
  environment still wins when it's on the list. If the list can't be read, fall back to the
  "latest" alias, which Google keeps pointing at a current model.
"""
import re
from typing import Iterable, List, Optional

EXCLUDE = ("image", "tts", "audio", "live", "embedding", "native", "robotics", "computer", "8b", "thinking")
FALLBACK = ["gemini-flash-latest", "gemini-flash-lite-latest"]


def _version(name: str) -> float:
    m = re.search(r"gemini-(\d+(?:\.\d+)?)", name)
    return float(m.group(1)) if m else 0.0


def _short(name: str) -> str:
    return name.split("/", 1)[1] if name.startswith("models/") else name


def rank(models: Iterable) -> dict:
    """{"full": [...], "lite": [...]}, newest stable first. `models` are objects or dicts with
    `name` and (optionally) `supported_actions`."""
    full, lite = [], []
    for m in models:
        name = _short(str(getattr(m, "name", None) or (m.get("name") if isinstance(m, dict) else "") or ""))
        actions = getattr(m, "supported_actions", None) or (m.get("supported_actions") if isinstance(m, dict) else None)
        low = name.lower()
        if "gemini" not in low or "flash" not in low or any(x in low for x in EXCLUDE):
            continue
        if actions and "generateContent" not in actions:
            continue
        (lite if "lite" in low else full).append(name)

    def key(n):
        low = n.lower()
        return (-_version(n), "preview" in low or "exp" in low, "latest" in low, len(n), n)
    return {"full": sorted(set(full), key=key), "lite": sorted(set(lite), key=key)}


def video_plan(ranked: dict, preferred: Optional[str] = None) -> List[tuple]:
    """Models to try for a filmed round, with a short wait before each retry (busy moments)."""
    names: List[str] = []
    if preferred and preferred in ranked["full"] + ranked["lite"]:
        names.append(preferred)
    names += ranked["full"][:2] + ["gemini-flash-latest"] + ranked["lite"][:1]
    seen, out = set(), []
    for n in names:
        if n not in seen:
            seen.add(n)
            out.append(n)
    if not out:
        out = list(FALLBACK)
    waits = [0, 3, 4, 6, 6]
    plan = [(out[0], 0), (out[0], 3)] + [(n, waits[min(i + 2, len(waits) - 1)]) for i, n in enumerate(out[1:])]
    return plan[:5]


def chat_model(ranked: dict, preferred: Optional[str] = None) -> str:
    if preferred and preferred in ranked["full"] + ranked["lite"]:
        return preferred
    return (ranked["full"] or ["gemini-flash-latest"])[0]
