# Status, levels, ranks, quests, boosters, treasures and trophies: the pure rules, so they can
# be tested without a database. server.py does the reads and writes.
#
# Two currencies, kept apart on purpose:
# - Status points are earned only by real effort (sessions, PBs, belts, quests), only ever go
#   up, and can't be spent, traded or bought. They say who you've become.
# - Tokens stay purchase-only. Nothing here mints tokens, so they never feel abundant.
from datetime import date, datetime, timedelta, timezone
from statistics import median
from typing import Iterable, List, Optional

# ---- Status points and levels ----
# Goal: visible progress that never goes backwards.
# Psychology: the endowed-progress and goal-gradient effects (people speed up as a goal gets
#   close), and milestones give a natural place to stop that still feels like a win.
# Design: each level needs a bit more than the last; every level unlocks one named skill or
#   title, so the next stop is always something specific, not just a bigger number.

LEVEL_STEP = 40
STATUS_PER_BELT = 50
STATUS_PER_QUEST = 75


def level_floor(level: int) -> int:
    return LEVEL_STEP * (level - 1) * level


def level_for(points: int) -> int:
    level = 1
    while level_floor(level + 1) <= max(0, points):
        level += 1
    return level


MILESTONES = [
    # (level, kind, name, what it unlocks, drill dimension or None)
    (2, "skill", "The 1-2", "Jab-cross, thrown as one shot", "Cross"),
    (3, "skill", "Slip and Counter", "Slip outside the jab, come back with the cross", "Slip"),
    (4, "skill", "Double Jab", "Two jabs to close the distance", "Jab"),
    (5, "title", "Contender", "A title on your profile", None),
    (6, "skill", "Roll Under the Hook", "Roll under, come up with a hook", "Roll"),
    (7, "skill", "Pivot Out", "Pivot off the ropes and reset the centre", "Footwork"),
    (8, "skill", "Body-Head Combo", "Hook to the body, hook to the head", "Left Hook"),
    (10, "title", "Ring General", "A title on your profile", None),
    (12, "skill", "Pull Counter", "Pull back from the jab and fire the cross", "Head Movement"),
    (15, "title", "Main Eventer", "A title on your profile", None),
    (20, "title", "Victory Elite", "A title on your profile", None),
]


def progression(points: int) -> dict:
    points = max(0, int(points or 0))
    level = level_for(points)
    floor, ceil = level_floor(level), level_floor(level + 1)
    unlocked = [_milestone(m) for m in MILESTONES if m[0] <= level]
    upcoming = next((m for m in MILESTONES if m[0] > level), None)
    return {
        "status_points": points,
        "level": level,
        "level_floor": floor,
        "next_level_at": ceil,
        "to_next_level": ceil - points,
        "pct": round(100 * (points - floor) / (ceil - floor)),
        "unlocked": unlocked,
        "next_milestone": {**_milestone(upcoming), "at": level_floor(upcoming[0]),
                           "to_go": level_floor(upcoming[0]) - points} if upcoming else None,
        "title": next((m["name"] for m in reversed(unlocked) if m["kind"] == "title"), None),
    }


def _milestone(m) -> dict:
    level, kind, name, desc, dimension = m
    return {"level": level, "kind": kind, "name": name, "desc": desc, "dimension": dimension}


def newly_unlocked(before: int, after: int) -> List[dict]:
    lo, hi = level_for(before), level_for(after)
    return [_milestone(m) for m in MILESTONES if lo < m[0] <= hi]


# ---- Boosters ----
# Goal: pull a squad back together for the next session after a shared win.
# Psychology: a time-limited bonus creates urgency without punishment (it just expires).
# Design: a booster doubles status points for a set number of sessions within 7 days. It
#   never touches tokens, and it's earned (squad quest), never sold.

BOOSTER_DAYS = 7


def make_booster(kind: str, label: str, sessions: int = 1, now: Optional[datetime] = None) -> dict:
    now = now or datetime.now(timezone.utc)
    return {"kind": kind, "label": label, "multiplier": 2, "sessions_left": sessions,
            "expires_at": (now + timedelta(days=BOOSTER_DAYS)).isoformat()}


def live_boosters(boosters: Iterable[dict], now: Optional[datetime] = None) -> List[dict]:
    now_iso = (now or datetime.now(timezone.utc)).isoformat()
    return [b for b in boosters or [] if b.get("sessions_left", 0) > 0 and b.get("expires_at", "") > now_iso]


def apply_booster(points: int, boosters: Iterable[dict], now: Optional[datetime] = None):
    """Returns (points after booster, boosters left, the booster used or None)."""
    live = live_boosters(boosters, now)
    if not live or points <= 0:
        return points, live, None
    used = live[0]
    rest = [dict(used, sessions_left=used["sessions_left"] - 1)] + live[1:]
    return points * used.get("multiplier", 2), [b for b in rest if b["sessions_left"] > 0], used


# ---- Weekly windows ----
# Goal: a fresh chance every Monday.
# Psychology: a board that never resets locks early leaders in and newcomers out (learned
#   helplessness); a weekly reset is a "fresh start" moment that pulls people back.

def week_id(d: Optional[date] = None) -> str:
    d = d or datetime.now(timezone.utc).date()
    y, w, _ = d.isocalendar()
    return f"{y}-W{w:02d}"


def previous_week_id(d: Optional[date] = None) -> str:
    d = d or datetime.now(timezone.utc).date()
    return week_id(d - timedelta(days=7))


def week_resets_at(d: Optional[date] = None) -> str:
    d = d or datetime.now(timezone.utc).date()
    monday = d + timedelta(days=7 - d.weekday())
    return datetime(monday.year, monday.month, monday.day, tzinfo=timezone.utc).isoformat()


def recent_week_ids(n: int, d: Optional[date] = None) -> List[str]:
    d = d or datetime.now(timezone.utc).date()
    return [week_id(d - timedelta(days=7 * i)) for i in range(n - 1, -1, -1)]


# ---- Ranks centred on you ----
# Goal: a leaderboard that motivates the middle, not just the top 10.
# Psychology: people compare upwards to someone just ahead (a reachable target) and feel the
#   pressure of someone just behind. A distant #1 is demotivating; a close #14 is a goal.
#   Competition only helps when the matchup feels even and against people you care about.
# Design: show the fighters just above and below you, how many points to pass the next one,
#   and whether that's within reach. Friends first, then fighters at your level, strangers last.

WINDOW_RADIUS = 2
REACH_MIN = 20
REACH_SHARE = 0.25


def rank_rows(rows: List[dict], key: str = "points") -> List[dict]:
    """Dense, stable ranking: ties share a rank."""
    ordered = sorted(rows, key=lambda r: (-r.get(key, 0), r.get("name") or "", r.get("id") or ""))
    out, prev, rank = [], None, 0
    for i, r in enumerate(ordered):
        if r.get(key, 0) != prev:
            rank, prev = i + 1, r.get(key, 0)
        out.append({**r, "rank": rank})
    return out


def centred_window(ranked: List[dict], me_id: str, radius: int = WINDOW_RADIUS) -> dict:
    idx = next((i for i, r in enumerate(ranked) if r.get("id") == me_id), None)
    if idx is None:
        return {"rows": ranked[: radius * 2 + 1], "me": None, "gap_up": None, "next_up_id": None, "within_reach": False}
    lo = max(0, min(idx - radius, len(ranked) - (radius * 2 + 1)))
    rows = ranked[lo: lo + radius * 2 + 1]
    me = ranked[idx]
    above = next((r for r in reversed(ranked[:idx]) if r["points"] > me["points"]), None)
    gap = (above["points"] - me["points"] + 1) if above else None
    return {
        "rows": rows,
        "me": me,
        "gap_up": gap,
        "next_up_id": above.get("id") if above else None,
        "within_reach": gap is not None and gap <= max(REACH_MIN, round(me["points"] * REACH_SHARE)),
    }


def default_scope(friend_count: int) -> str:
    return "friends" if friend_count >= 2 else "similar"


# Competition helps mastery, close matchups and rivals you know; it hurts learning, fear of
# losing and lopsided fields. New fighters start in learning mode (their own progress only)
# until they've found their feet, and anyone can switch back to it.
LEARNING_MODE_SESSIONS = 3


def learning_mode(prefs: Optional[dict], sessions: int) -> bool:
    explicit = (prefs or {}).get("learning_mode")
    if explicit is not None:
        return bool(explicit)
    return sessions < LEARNING_MODE_SESSIONS


# ---- Group quests ----
# Goal: squads train together, and new members get pulled in.
# Psychology: relatedness and social influence; nobody wins until the group does, so
#   members chase each other up (the FarmVille co-op pattern), and progress you can see is
#   a nudge in itself.
# Design: each squad gets a weekly target of sessions scaled to its size. Every member's
#   session counts. When it's hit, everyone gets status points and a booster.

QUEST_PER_MEMBER = 3
QUEST_MIN = 4
QUEST_MAX = 20


def quest_target(member_count: int) -> int:
    return max(QUEST_MIN, min(QUEST_MAX, QUEST_PER_MEMBER * max(1, member_count)))


def quest_view(quest: dict, member_names: dict, me_id: str) -> dict:
    target = quest.get("target") or QUEST_MIN
    done = quest.get("progress", 0)
    contributions = quest.get("contributions") or {}
    return {
        "squad_id": quest.get("squad_id"),
        "week_id": quest.get("week_id"),
        "target": target,
        "progress": min(done, target),
        "pct": min(100, round(100 * done / target)),
        "completed": bool(quest.get("completed")),
        "my_part": contributions.get(me_id, 0),
        "members": sorted(
            ({"user_id": uid, "name": name, "sessions": contributions.get(uid, 0)}
             for uid, name in member_names.items()),
            key=lambda m: -m["sessions"]),
    }


# ---- Social treasures ----
# Goal: recognition that can only come from other people.
# Psychology: social treasures (like a vote or a gift) mean more than self-earned rewards
#   because someone chose to give them; reciprocity then pulls the receiver back to give one.
# Design: three kinds, a small daily allowance so each one stays meaningful, only to people
#   you follow or train with, and no free text (nothing to moderate, nothing to misuse).

TREASURES = {
    "respect": "Respect",
    "heart": "Heart of a Fighter",
    "sharp": "Sharp",
}
TREASURES_PER_DAY = 3


# ---- Trophy shelf ----
# Goal: permission to show off, without having to post anything.
# Psychology: a visible display is implicit bragging; it only counts if it was hard to earn.
# Design: titles from levels, crowns from weekly wins, a recruiter badge for real joins,
#   a founder badge for early users, plus belts and treasures received.

FOUNDER_BEFORE = "2027-01-01"
RECRUITER_TIERS = [(1, "Recruiter"), (10, "Squad Builder"), (100, "Movement Starter")]


def shelf_titles(*, status_points: int, created_at: Optional[str], invited_count: int) -> List[dict]:
    items = []
    title = progression(status_points)["title"]
    if title:
        items.append({"kind": "title", "name": title, "desc": f"Reached level {level_for(status_points)}"})
    if created_at and created_at[:10] < FOUNDER_BEFORE:
        items.append({"kind": "founder", "name": "Founding Fighter", "desc": "Trained on Victory AI in its first year"})
    earned = [name for at, name in RECRUITER_TIERS if invited_count >= at]
    if earned:
        items.append({"kind": "recruiter", "name": earned[-1], "desc": f"{invited_count} fighter{'s' if invited_count != 1 else ''} joined from your invites"})
    return items


# ---- Everyone like you ----
# Goal: nudge towards the habit that actually works.
# Psychology: descriptive social norms ("people like you do X") move behaviour more than
#   instructions, as long as they're true and from a similar group.
# Design: from real season data for fighters at the same level, the typical weekly sessions
#   of those who reached Gold or better. Hidden when the sample is too small to be honest.

PEER_MIN_SAMPLE = 10


def peer_insight(peer_weekly_sessions: List[float], mine: float, level_label: str) -> Optional[dict]:
    if len(peer_weekly_sessions) < PEER_MIN_SAMPLE:
        return None
    typical = round(median(peer_weekly_sessions), 1)
    return {
        "typical_per_week": typical,
        "mine_per_week": round(mine, 1),
        "sample": len(peer_weekly_sessions),
        "text": f"{level_label} fighters who reached Gold this season trained about {typical:g} times a week.",
        "on_track": mine >= typical,
    }
