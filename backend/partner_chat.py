"""Talk to your training partner: ask a boxing question, they think, answer in a few short bubbles,
check it helped, and dig deeper if it didn't.

Goal: people feel they have a coach in their corner between sessions (retention), and every answer
  points back to the next real session.
Psychology: a character that reacts (thinks, answers, asks "did that help?") feels like a
  relationship, not a tool (parasocial bond, the same thing that makes people talk to Duo). Using
  their own numbers makes the advice feel personal (the self-reference effect). Asking "did that
  help?" and acting on "no" makes people feel heard.
Design: the partner speaks in first person, in their own style, by their own name, and never opens
  with "As an AI". Honesty still wins: they only use the real numbers given below, never claim to be
  a person or to have seen a round that wasn't filmed, and if someone sincerely asks, they say
  they're Victory's built-in coach, not a human.
"""
import re
from typing import List, Optional

MAX_TURNS = 8
MAX_CHARS = 400
MAX_BUBBLES = 3

# Phrases that announce the machine instead of the coach. Removed from the start of a reply.
_ROBOT_OPENERS = re.compile(
    r"^\s*(as an? (ai|artificial intelligence|language model|ai (language )?model|virtual (assistant|coach))"
    r"[^,.!]*[,.!]\s*|i'?m (just )?an? (ai|language model)[^,.!]*[,.!]\s*)",
    re.IGNORECASE,
)


def clean_history(messages: List[dict]) -> List[dict]:
    out = []
    for m in (messages or [])[-MAX_TURNS:]:
        role = "assistant" if m.get("role") == "assistant" else "user"
        text = str(m.get("text") or "").strip()[:MAX_CHARS]
        if text:
            out.append({"role": role, "text": text})
    while out and out[-1]["role"] != "user":
        out.pop()
    return out


def facts(user: dict, sessions: List[dict]) -> List[str]:
    """Real numbers only. Anything we don't have is simply left out."""
    lines = []
    sessions = sorted(sessions or [], key=lambda s: str(s.get("date") or ""), reverse=True)
    lines.append(f"Sessions trained: {len(sessions)}")
    if user.get("experience_level"):
        lines.append(f"Experience: {user['experience_level']}")
    if user.get("primary_goal"):
        lines.append(f"Their goal: {user['primary_goal']}")
    if user.get("stance"):
        lines.append(f"Stance: {user['stance']}")
    if sessions and sessions[0].get("date"):
        lines.append(f"Last session: {sessions[0]['date']}")

    scored = [s for s in sessions if isinstance(s.get("overall_score"), (int, float))]
    if scored:
        lines.append("Last scored rounds (newest first, out of 10): "
                     + ", ".join(f"{s['overall_score']}" for s in scored[:5]))
        totals = {}
        for s in scored[:5]:
            for d in s.get("dimension_scores") or []:
                if isinstance(d.get("score"), (int, float)):
                    totals.setdefault(d["dimension_name"], []).append(d["score"])
        if totals:
            avg = sorted(((round(sum(v) / len(v), 1), k) for k, v in totals.items()))
            lines.append("Weakest parts lately: " + ", ".join(f"{k} {v}" for v, k in avg[:3]))
            lines.append("Strongest parts lately: " + ", ".join(f"{k} {v}" for v, k in avg[-2:][::-1]))
    else:
        lines.append("No filmed, scored rounds yet (so nobody has seen their technique).")

    live = next((s["live_stats"] for s in sessions if s.get("live_stats")), None)
    if live:
        bits = [f"{live.get('punches', 0)} punches over {live.get('rounds', 0)} rounds",
                f"best combo {live.get('best_combo', 0)}", f"guard drops {live.get('guard_drops', 0)}"]
        if live.get("guard_pct") is not None:
            bits.append(f"guard up {live['guard_pct']}% of the time")
        lines.append("Last live-counted session: " + ", ".join(bits))
    return lines


def system_prompt(partner: dict, fact_lines: List[str], deeper: bool = False) -> str:
    name = (partner or {}).get("name") or "Coach"
    personality = (partner or {}).get("personality") or "Encouraging, patient and clear."
    phrases = ", ".join((partner or {}).get("phrases") or [])
    focus = ", ".join((partner or {}).get("focus_areas") or [])
    depth = ("They said your last answer didn't help. Go deeper: be more specific, use their numbers, "
             "and give one concrete drill with rounds and seconds." if deeper else
             "Keep it short.")
    return f"""You are {name}, a boxing training partner inside a training app. Speak in first person as {name}.
Personality: {personality}
Phrases you like to use (sometimes, not every time): {phrases}
{f'They asked you to help with: {focus}.' if focus else ''}

What you actually know about this fighter (real numbers, nothing else):
- """ + "\n- ".join(fact_lines) + f"""

How to answer:
- {depth}
- Reply in 1 to {MAX_BUBBLES} short chat bubbles separated by a blank line. Each bubble is 1-2 plain sentences a 12-year-old could follow.
- Talk like a coach in the gym. Don't describe yourself, don't say "as an AI", "language model" or "assistant".
- Only use the numbers above. Never invent scores, rounds, or things you "saw". If nothing was filmed, don't comment on their technique as if you watched it.
- If they sincerely ask whether you're a real person or an AI, say honestly that you're Victory's built-in coach, not a human.
- Boxing, fitness, motivation and training plans only. For pain or injury: stop, and see a doctor or physio. No diet or weight-cut advice for anyone who might be under 18.
- Where it fits, end by pointing to their next session in the app.
"""


def bubbles(reply: str) -> List[str]:
    text = _ROBOT_OPENERS.sub("", (reply or "").strip())
    parts = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    if len(parts) > MAX_BUBBLES:
        parts = parts[:MAX_BUBBLES - 1] + [" ".join(parts[MAX_BUBBLES - 1:])]
    out = []
    for p in parts:
        p = re.sub(r"\s*\n\s*", " ", p)
        p = p.replace("**", "")
        p = re.sub(r"^\s*[-*•]\s*", "", p)
        if p:
            out.append(p[0].upper() + p[1:])
    return out


def sincere_identity_question(text: Optional[str]) -> bool:
    t = (text or "").lower()
    return bool(re.search(r"\b(are|r) (you|u) (a |an )?(real|human|person|bot|ai|robot)\b", t))
