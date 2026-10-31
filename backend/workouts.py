"""Workout timer: saved round and circuit workouts, and logging them as training.

Goal: Victory AI is the one app open while you train, whatever the session (bag, pads,
  shadowboxing, circuits, HIIT), so every session counts towards the weekly streak.
Psychology: friction kills habits. Switching between a round timer and the camera means missed
  bells and lost footage, so people stop filming or stop timing. Setting a workout up once
  (investment) and starting it with one tap removes the friction (Fogg: make it easy).
Design: workouts are saved presets like a boxing round timer (warm-up, rounds, round and rest
  time, warnings, interval alerts), with optional named stations for circuits. The timer, bells,
  voice and camera recording all run on one screen. A finished workout of a minute or more is
  logged as a session (no AI score), so it counts towards the week.
"""
import re
from typing import List, Optional

WORKOUT_TYPES = {
    "bag": "Bag work",
    "shadowboxing": "Shadowboxing",
    "pads": "Pad work",
    "sparring": "Sparring",
    "circuit": "Circuit",
    "hiit": "HIIT",
    "skipping": "Skipping",
    "strength": "Strength",
}

MAX_PRESETS = 20
MAX_STATIONS = 20
MIN_LOGGED_SECONDS = 60
LIMITS = {
    "warmup_s": (0, 600),
    "rounds": (1, 50),
    "round_s": (5, 3600),
    "rest_s": (0, 1800),
    "station_rest_s": (0, 600),
    "round_warning_s": (0, 60),
    "rest_warning_s": (0, 60),
    "inner_alert_s": (0, 600),
}


def _preset(pid, name, type_, rounds, round_s, rest_s, stations=None, station_rest_s=0, warmup_s=10, inner_alert_s=0):
    return {"id": pid, "name": name, "type": type_, "warmup_s": warmup_s, "rounds": rounds, "round_s": round_s,
            "rest_s": rest_s, "round_warning_s": 10, "rest_warning_s": 10, "inner_alert_s": inner_alert_s,
            "stations": stations or [], "station_rest_s": station_rest_s, "builtin": True}


DEFAULT_PRESETS = [
    _preset("bag_3x3", "Bag work", "bag", 3, 180, 60),
    _preset("pads_6x2", "Pad work", "pads", 6, 120, 60),
    _preset("shadow_3x3", "Shadowboxing", "shadowboxing", 3, 180, 60),
    _preset("sparring_4x2", "Sparring", "sparring", 4, 120, 60),
    _preset("tabata", "Tabata HIIT", "hiit", 8, 20, 10, warmup_s=10),
    _preset("boxing_circuit", "Boxing circuit", "circuit", 3, 40, 60, station_rest_s=20, stations=[
        {"name": "Burpees", "seconds": 40}, {"name": "Shadowboxing", "seconds": 40},
        {"name": "Squat jumps", "seconds": 40}, {"name": "Push-ups", "seconds": 40},
        {"name": "Plank", "seconds": 40},
    ]),
    _preset("skipping_3x3", "Skipping", "skipping", 3, 180, 60),
]

NAME_RE = re.compile(r"^[\w' .,&()\-]{1,40}$", re.UNICODE)


def preset_problem(p: dict) -> Optional[str]:
    if not NAME_RE.match(str(p.get("name") or "").strip()):
        return "Give it a name of up to 40 characters"
    if p.get("type") not in WORKOUT_TYPES:
        return "Pick a workout type"
    for field, (lo, hi) in LIMITS.items():
        v = p.get(field, 0)
        if not isinstance(v, int) or isinstance(v, bool) or not lo <= v <= hi:
            return f"{field.replace('_s', '').replace('_', ' ').capitalize()} must be between {lo} and {hi}"
    stations = p.get("stations") or []
    if len(stations) > MAX_STATIONS:
        return f"Up to {MAX_STATIONS} exercises"
    for s in stations:
        if not NAME_RE.match(str(s.get("name") or "").strip()):
            return "Each exercise needs a name of up to 40 characters"
        if not isinstance(s.get("seconds"), int) or not 5 <= s["seconds"] <= 3600:
            return "Each exercise needs 5 seconds to an hour"
    return None


def clean_preset(p: dict, pid: str) -> dict:
    out = {"id": pid, "name": str(p["name"]).strip(), "type": p["type"], "builtin": False,
           "stations": [{"name": str(s["name"]).strip(), "seconds": s["seconds"]} for s in p.get("stations") or []]}
    for field in LIMITS:
        out[field] = p.get(field, 0)
    return out


def total_seconds(p: dict) -> int:
    stations = p.get("stations") or []
    if stations:
        per_round = sum(s["seconds"] for s in stations) + p.get("station_rest_s", 0) * (len(stations) - 1)
    else:
        per_round = p["round_s"]
    return p.get("warmup_s", 0) + per_round * p["rounds"] + p.get("rest_s", 0) * (p["rounds"] - 1)


def merged_presets(saved: List[dict]) -> List[dict]:
    return list(saved or []) + DEFAULT_PRESETS
