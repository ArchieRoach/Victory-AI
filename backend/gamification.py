# Status, levels, ranks, quests, boosters, treasures and trophies: the pure rules, so they can
# be tested without a database. server.py does the reads and writes.
#
# Two currencies, kept apart on purpose:
# - Status points are earned only by real effort (sessions, PBs, belts, quests), only ever go
#   up, and can't be spent, traded or bought. They say who you've become.
# - Tokens stay purchase-only. Nothing here mints tokens, so they never feel abundant.
import hashlib
from datetime import date, datetime, timedelta, timezone
from statistics import median
from typing import Dict, Iterable, List, Optional, Tuple

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


def shelf_titles(*, status_points: int, created_at: Optional[str], invited_count: int,
                 founder_before: str = FOUNDER_BEFORE) -> List[dict]:
    items = []
    title = progression(status_points)["title"]
    if title:
        items.append({"kind": "title", "name": title, "desc": f"Reached level {level_for(status_points)}"})
    if created_at and created_at[:10] < founder_before:
        items.append({"kind": "founder", "name": "Founding Fighter", "desc": "Joined Victory AI before Season 2"})
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


# ---- Golden Gloves: a scarce, verified prize ----
# Goal: a prize worth chasing for a whole season, earned only by real, proven training time.
# Psychology: we value what's hard to get and what we can't simply have (scarcity, Core
#   Drive 6); a commitment made up front (BMW's M3 buyers promising to wash the car) makes the
#   thing feel more valuable and makes people follow through (commitment and consistency).
# Design: each season has its own Golden Gloves. You can only enter in the first two weeks,
#   by taking a pledge. Only verified time counts: the real length of rounds the AI scored
#   from video, plus crowd-judged wins. A daily cap means grinding (or a camera left running)
#   gets nothing. When the season ends, that season's gloves are gone for good. Every number
#   shown is real: no fake countdowns, no invented "only 3 left".
#
# The bar: 20 verified hours in a 6-week season. Verified time is time actually boxing on
# camera, roughly half of a real gym session, so it equals about 6-7 gym hours a week:
# serious-amateur territory, well above the average app user, and worthy of respect.

GLOVES_TARGET_HOURS = 20
ROUND_SECONDS_CAP = 360        # one uploaded round counts for at most 6 minutes
ROUND_SECONDS_FALLBACK = 120   # length unknown: count it conservatively
VERIFIED_SECONDS_PER_DAY = 90 * 60
COMP_WIN_SECONDS = 30 * 60
PROOF_MIN_DIMENSIONS = 3
PLEDGE_WINDOW_DAYS = 14
GLOVES_STATUS_BONUS = 150
GLOVES_GIFT_PRICE_GBP = 5.00
PLEDGE_PROMISES = [
    "I'll train at least three times a week this season.",
    "I'll only record my own real rounds. No faking, no idle camera.",
]


def verified_round_seconds(rounds: Iterable[dict]) -> List[int]:
    """Length of every round the AI actually watched (enough scored dimensions)."""
    out = []
    for rnd in rounds or []:
        dims = [d.get("score") for d in ((rnd.get("analysis") or {}).get("dimension_scores") or [])
                if isinstance(d.get("score"), (int, float))]
        if len(dims) >= PROOF_MIN_DIMENSIONS:
            secs = rnd.get("seconds")
            secs = int(secs) if isinstance(secs, (int, float)) and secs > 0 else ROUND_SECONDS_FALLBACK
            out.append(min(secs, ROUND_SECONDS_CAP))
    return out


def count_verified(round_seconds: List[int], counted_today: int) -> dict:
    room = max(0, VERIFIED_SECONDS_PER_DAY - counted_today)
    counted, rounds = 0, 0
    for secs in round_seconds:
        take = min(secs, room - counted)
        if take <= 0:
            break
        counted += take
        rounds += 1
    return {"seconds": counted, "rounds": rounds, "capped_seconds": sum(round_seconds) - counted}


def hours(seconds: int) -> float:
    return round((seconds or 0) / 3600, 1)


# The road to 10,000 hours (the "expert" mark). Most people will never get near the top,
# and that's the point: each tier is a real amount of proven time, so it earns respect.
MASTERY_TIERS = [
    (1, "First Hour"), (10, "Committed"), (50, "Dedicated"), (100, "Seasoned"),
    (500, "Veteran"), (1000, "Elite"), (5000, "Master"), (10000, "10,000-Hour Master"),
]
EXPERT_HOURS = 10000


def mastery(seconds: int) -> dict:
    h = (seconds or 0) / 3600
    reached = [(at, name) for at, name in MASTERY_TIERS if h >= at]
    upcoming = next(((at, name) for at, name in MASTERY_TIERS if h < at), None)
    return {
        "verified_hours": round(h, 1),
        "prev_at_hours": reached[-1][0] if reached else 0,
        "tiers_earned": len(reached),
        "tiers_total": len(MASTERY_TIERS),
        "tier": reached[-1][1] if reached else None,
        "next_tier": upcoming[1] if upcoming else None,
        "next_at_hours": upcoming[0] if upcoming else None,
        "expert_hours": EXPERT_HOURS,
        "expert_pct": round(min(100, 100 * h / EXPERT_HOURS), 2),
    }


def pledge_window(season: dict, today: Optional[date] = None) -> dict:
    today = today or datetime.now(timezone.utc).date()
    if season.get("preseason"):
        return {"open": False, "closes": season["ends"], "days_to_close": 0, "next_opens": season["ends"],
                "opens_in_days": season["days_left"]}
    start = date.fromisoformat(season["starts"])
    closes = start + timedelta(days=PLEDGE_WINDOW_DAYS)
    return {"open": start <= today < closes, "closes": closes.isoformat(),
            "days_to_close": max(0, (closes - today).days), "next_opens": season["ends"]}


def gloves_name(season: dict) -> str:
    return f"Season {max(1, season['number'])} Golden Gloves"


def gloves_view(stats: Optional[dict], season: dict, pledged: int, earned: int,
                today: Optional[date] = None) -> dict:
    stats = stats or {}
    secs = stats.get("seconds", 0)
    target = GLOVES_TARGET_HOURS * 3600
    return {
        "name": gloves_name(season),
        "season_id": season["season_id"],
        "target_hours": GLOVES_TARGET_HOURS,
        "verified_hours": hours(secs),
        "hours_to_go": hours(max(0, target - secs)),
        "pct": min(100, round(100 * secs / target)),
        "pledged": bool(stats.get("pledged_at")),
        "earned": bool(stats.get("earned_at")),
        "verified_rounds": stats.get("rounds", 0),
        "comp_wins": stats.get("comp_wins", 0),
        "window": pledge_window(season, today),
        "days_left": season["days_left"],
        "preseason": bool(season.get("preseason")),
        "holders": earned,
        "chasers": pledged,
        "promises": PLEDGE_PROMISES,
        "gift_price_gbp": GLOVES_GIFT_PRICE_GBP,
        "rules": [
            "Every round the AI scores from your video counts for its real length (up to 6 minutes a round).",
            f"A competition the crowd judges you the winner of counts for {COMP_WIN_SECONDS // 60} minutes.",
            f"Up to {VERIFIED_SECONDS_PER_DAY // 60} verified minutes count a day. Rest is training too.",
            "Rounds you log without video don't count.",
        ],
    }


# ---- Gifted gloves ----
# Goal: fans can honour a fighter they respect, and it earns revenue without selling status.
# Psychology: a gift from someone else is a social treasure; it means "I rate you". But a
#   prize that can be bought stops meaning anything, so a gift must never pass as earned.
# Design: £5 buys a pair of gifted gloves for an acclaimed fighter who hasn't earned this
#   season's. They show as "gifted by N fans", separate from earned gloves, and never count
#   towards hours, levels or ranks.

ACCLAIM_MIN_HOURS = 50


def is_acclaimed(*, record_verified: bool, record_bouts: int, comp_wins: int, verified_seconds: int) -> bool:
    return (record_verified and record_bouts > 0) or comp_wins > 0 or verified_seconds >= ACCLAIM_MIN_HOURS * 3600


# ---- Partner condition: loss avoidance that pulls you back, never pushes you away ----
# Goal: fighters train (and open the app) a few times every week, all year.
# Psychology: loss aversion; we work harder to keep something we have than to gain
#   something new, and "the endowment effect" makes it stronger for something we've built
#   (our partner's form). But a loss that feels permanent makes people quit, so every slide
#   is reversible in a single session, and the comeback is celebrated, not punished.
# Design: the AI partner mirrors your training. Three stats come from a standard training-load
#   model (exponentially weighted sessions, like the "fitness" curve endurance coaches use),
#   so they only fall when you actually stop training. The partner's look moves through
#   four states: peak, ready, waiting on the bench, and rusty on the couch. No smoking,
#   drinking or body-shaming: this app is for 13-24s and the joke must not become the lesson.
#   The numbers are labelled as a training-consistency model, never as a measurement of you.

TARGET_SESSIONS_PER_WEEK = 3
CONDITIONING_DAYS = 42      # slow: base fitness built over weeks
SHARPNESS_DAYS = 10         # fast: timing and reactions fade quickly
CONSISTENCY_WINDOW = 14
CONDITION_STATES = {
    "new": "Hasn't trained with you yet",
    "peak": "In peak shape",
    "ready": "Sharp and ready",
    "waiting": "Waiting on the bench",
    "rusty": "Gone rusty on the couch",
}


def _ewma(days_trained: set, today: date, tau: int, horizon: int = 180) -> float:
    import math
    decay = math.exp(-1 / tau)
    level = 0.0
    for i in range(horizon, -1, -1):
        d = today - timedelta(days=i)
        level = level * decay + (1 - decay) * (1.0 if d in days_trained else 0.0)
    return level


def condition_thresholds(target: int) -> tuple:
    """Days off before the partner sits on the bench, then the couch. A fighter who chose two
    sessions a week has normal gaps longer than one who chose four, so the bench comes later."""
    import math
    waiting = max(4, math.ceil(7 / max(1, target)) + 1)
    return waiting, max(7, waiting + 3)


def partner_condition(session_dates: Iterable[str], today: Optional[date] = None,
                      target: int = TARGET_SESSIONS_PER_WEEK) -> dict:
    today = today or datetime.now(timezone.utc).date()
    trained = set()
    for s in session_dates or []:
        try:
            d = date.fromisoformat(str(s)[:10])
        except ValueError:
            continue
        if d <= today:
            trained.add(d)
    waiting_after, rusty_after = condition_thresholds(target)
    if not trained:
        return {"state": "new", "label": CONDITION_STATES["new"], "days_since": None, "target": target,
                "waiting_after": waiting_after,
                "stats": {"conditioning": 0, "sharpness": 0, "consistency": 0}, "overall": 0, "change_7d": 0}

    full = target / 7

    def stats_on(day: date) -> dict:
        recent = sum(1 for d in trained if 0 <= (day - d).days < CONSISTENCY_WINDOW)
        return {
            "conditioning": round(min(100, 100 * _ewma(trained, day, CONDITIONING_DAYS) / full)),
            "sharpness": round(min(100, 100 * _ewma(trained, day, SHARPNESS_DAYS) / full)),
            "consistency": round(min(100, 100 * recent / (target * CONSISTENCY_WINDOW / 7))),
        }

    def overall(st: dict) -> int:
        return round(0.4 * st["conditioning"] + 0.35 * st["sharpness"] + 0.25 * st["consistency"])

    now = stats_on(today)
    week_ago = stats_on(today - timedelta(days=7))
    days_since = (today - max(trained)).days
    score = overall(now)
    if days_since >= rusty_after:
        state = "rusty"
    elif days_since >= waiting_after:
        state = "waiting"
    elif score >= 70:
        state = "peak"
    else:
        state = "ready"
    return {
        "state": state,
        "label": CONDITION_STATES[state],
        "days_since": days_since,
        "target": target,
        "waiting_after": waiting_after,
        "stats": now,
        "overall": score,
        "change_7d": score - overall(week_ago),
        "drops": {k: now[k] - week_ago[k] for k in now if now[k] < week_ago[k]},
    }


def condition_line(partner: str, cond: dict) -> str:
    state, days = cond["state"], cond.get("days_since")
    drop = -cond.get("change_7d", 0)
    if state == "new":
        return f"{partner}: gloves are on. Let's do the first round together."
    if state == "peak":
        return f"{partner}: I've never felt sharper. Keep this rhythm."
    if state == "ready":
        return f"{partner}: feeling good. One more session this week keeps us sharp."
    if state == "waiting":
        return (f"{partner}: {days} days since we trained. My sharpness is down {drop} points this week. "
                "I'm sat on the bench waiting for you.")
    return (f"{partner}: {days} days off and I've ended up on the couch. Conditioning's slipping. "
            "One session and I'm back up. Come and get me.")


# The comeback is the reward: one session after a slide lifts the partner straight back up.
COMEBACK_STATES = {"waiting", "rusty"}


# ---- Then vs now ----
# Goal: show fighters how far they've come, in their own footage.
# Psychology: progress you can see is the strongest intrinsic motivator (competence, in
#   self-determination theory); comparing yourself to your past self beats comparing to others.
# Design: your first AI-scored session next to your latest, with the score change for every
#   dimension both sessions scored. Drops are shown as drops; nothing is invented.

THEN_NOW_MIN_DAYS = 7


def _dims(session: dict) -> dict:
    return {d["dimension_name"]: d["score"] for d in session.get("dimension_scores") or []
            if isinstance(d.get("score"), (int, float))}


def best_round_video(session: dict) -> Optional[str]:
    scored = []
    for rnd in session.get("rounds") or []:
        vals = [d.get("score") for d in ((rnd.get("analysis") or {}).get("dimension_scores") or [])
                if isinstance(d.get("score"), (int, float))]
        if vals and rnd.get("video_url"):
            scored.append((sum(vals) / len(vals), rnd["video_url"]))
    return max(scored)[1] if scored else None


def then_vs_now(first: dict, latest: dict) -> dict:
    a, b = _dims(first), _dims(latest)
    changes = sorted(({"dimension": k, "then": a[k], "now": b[k], "change": round(b[k] - a[k], 1)} for k in a if k in b),
                     key=lambda c: -c["change"])
    try:
        days = (date.fromisoformat(str(latest.get("date"))[:10]) - date.fromisoformat(str(first.get("date"))[:10])).days
    except ValueError:
        days = None
    overall = None
    if isinstance(first.get("overall_score"), (int, float)) and isinstance(latest.get("overall_score"), (int, float)):
        overall = round(latest["overall_score"] - first["overall_score"], 1)
    return {
        "then": {"date": first.get("date"), "overall": first.get("overall_score"), "video": best_round_video(first)},
        "now": {"date": latest.get("date"), "overall": latest.get("overall_score"), "video": best_round_video(latest)},
        "days": days,
        "overall_change": overall,
        "biggest_gains": [c for c in changes if c["change"] > 0][:3],
        "slipped": [c for c in reversed(changes) if c["change"] < 0][:2],
        "changes": changes,
    }


# ---- Combo builder ----
# Goal: fighters feel in charge of their training, not managed by it.
# Psychology: autonomy and creativity (Core Drive 3): a plan you designed yourself is one you
#   follow; seeing the AI judge *your* combination makes the feedback personal.
# Design: build a combination from boxing's standard numbering plus defence and footwork,
#   save it, and make it this week's focus: the partner's focus areas switch to the skills
#   it uses and the AI watches for it in the next recorded rounds.

COMBO_MOVES = {
    "1": ("Jab", "Jab"), "2": ("Cross", "Cross"), "3": ("Lead hook", "Left Hook"), "4": ("Rear hook", "Right Hook"),
    "5": ("Lead uppercut", "Uppercut"), "6": ("Rear uppercut", "Uppercut"),
    "slip": ("Slip", "Slip"), "roll": ("Roll", "Roll"), "parry": ("Parry", "Parry"),
    "pivot": ("Pivot", "Footwork"), "step_back": ("Step back", "Footwork"),
}
COMBO_MIN, COMBO_MAX = 2, 8
MAX_SAVED_COMBOS = 12


def combo_problem(moves: List[str]) -> Optional[str]:
    if not COMBO_MIN <= len(moves) <= COMBO_MAX:
        return f"A combination has {COMBO_MIN} to {COMBO_MAX} moves"
    if any(m not in COMBO_MOVES for m in moves):
        return "Unknown move"
    if not any(m in "123456" for m in moves):
        return "Add at least one punch"
    return None


def combo_label(moves: List[str]) -> str:
    return "-".join(m if m in "123456" else COMBO_MOVES[m][0].lower() for m in moves)


def combo_focus(moves: List[str]) -> List[str]:
    out = []
    for m in moves:
        dim = COMBO_MOVES[m][1]
        if dim not in out:
            out.append(dim)
    if sum(1 for m in moves if m in "123456") >= 3 and "Combination Flow" not in out:
        out.append("Combination Flow")
    return out[:4]


# ---- The motivation journey: tangible, then social, then the sport itself ----
# Goal: fighters end up training because they love it, not for what they get.
# Psychology: the overjustification effect: big rewards for something people already enjoy
#   crowd out the enjoyment. So tangible rewards are used once, to start the habit; then
#   recognition, status and access take over; and for established fighters the app steps back
#   from points and asks how the training felt, which is what keeps people for years.
# Design: three stages from real activity. Hook: a starter challenge (3 sessions in your first
#   7 days) with a real item as the prize, given once, to Pro members. Belong: crews, mentors, shelves and the
#   Golden Gloves come forward. Mastery: points fold away after sessions and a reflection
#   ("how did that feel?") leads; the app then reflects back what you enjoy most.

STARTER_SESSIONS = 3
STARTER_DAYS = 7
STARTER_CHOICES = ("corner_red", "corner_blue")
STARTER_STATUS = 100
BELONG_FROM_SESSIONS = 5
MASTERY_FROM_SESSIONS = 25
MASTERY_FROM_DAYS = 42

STAGES = {
    "hook": ("Getting started", "Your first week: build the habit, earn your starter kit."),
    "belong": ("Part of it", "Your squad, your shelf, your mentors: this is your gym now."),
    "mastery": ("In it for the craft", "Fewer numbers, more boxing. Tell us how each session felt."),
}


def motivation_stage(total_sessions: int, days_since_join: int) -> dict:
    if total_sessions >= MASTERY_FROM_SESSIONS and days_since_join >= MASTERY_FROM_DAYS:
        key = "mastery"
    elif total_sessions >= BELONG_FROM_SESSIONS or days_since_join > STARTER_DAYS:
        key = "belong"
    else:
        key = "hook"
    name, line = STAGES[key]
    return {"stage": key, "name": name, "line": line}


def starter_progress(session_dates: Iterable[str], joined: Optional[str]) -> dict:
    try:
        start = date.fromisoformat(str(joined)[:10])
    except (TypeError, ValueError):
        return {"done": 0, "target": STARTER_SESSIONS, "complete": False, "open": False, "days_left": 0}
    end = start + timedelta(days=STARTER_DAYS)
    days = {d for d in (str(x)[:10] for x in session_dates or []) if start.isoformat() <= d < end.isoformat()}
    done = min(len(days), STARTER_SESSIONS)
    today = datetime.now(timezone.utc).date()
    return {"done": done, "target": STARTER_SESSIONS, "complete": done >= STARTER_SESSIONS,
            "open": today < end, "days_left": max(0, (end - today).days)}


REFLECTION_TAGS = {
    "sharp": "Felt sharp",
    "learned": "Learned something",
    "hard_good": "Hard but good",
    "fun": "Had fun",
    "flat": "Felt flat",
}


_TAG_PHRASE = {"sharp": "feel sharp", "learned": "learn something new", "hard_good": "push through something hard",
               "fun": "have fun"}


def enjoyment_summary(reflections: List[dict]) -> Optional[dict]:
    rs = [r for r in reflections if isinstance(r.get("enjoyment"), int)]
    if len(rs) < 3:
        return None
    counts: dict = {}
    for r in rs:
        for t in r.get("tags") or []:
            if t in REFLECTION_TAGS and t != "flat":
                counts[t] = counts.get(t, 0) + 1
    top = max(counts, key=counts.get) if counts else None
    best = [r for r in rs if r["enjoyment"] >= 4]
    return {
        "sessions": len(rs),
        "average": round(sum(r["enjoyment"] for r in rs) / len(rs), 1),
        "loved_pct": round(100 * len(best) / len(rs)),
        "top_tag": REFLECTION_TAGS[top] if top else None,
        "line": (f"Your best sessions are the ones where you {_TAG_PHRASE[top]}." if top
                 else "Keep telling us how sessions feel and we'll show you what you love about training."),
    }


# ---- Corner Surprises (Core Drive 7: unpredictability) ----
# Goal: training feels exciting to come back to, not just useful.
# Psychology: variable rewards: not knowing what comes next keeps curiosity alive. Kept healthy:
#   only earned by real actions, never bought (no loot boxes, especially for under-18s), odds
#   shown openly, and a daily cap so it never turns into pulling a lever.
# Design: after a session or a treasure given, a roll from a fixed, published table. Rare
#   enough to stay a surprise: none in your first sessions (Beginner's Luck covers those),
#   none for a token round, and a cooldown so they can't land session after session. Paid
#   team looks are never in the table: a free roll should never give away what others buy.

SURPRISE_TABLE = [
    ("legend_tip", "A legend's tip", 10),
    ("bonus_status", "Bonus status", 6),
    ("deep_scout", "Deep scout of your best moment", 4),
]
SURPRISE_DAILY_CAP = 1
SURPRISE_BONUS_STATUS = 25
SURPRISE_MIN_SESSIONS = 3
SURPRISE_MIN_ROUND_SECONDS = 6 * 60
SURPRISE_COOLDOWN_HOURS = 48


def surprise_rules() -> List[str]:
    return [
        f"Surprises start after your {SURPRISE_MIN_SESSIONS}rd session.",
        f"Only sessions with at least {SURPRISE_MIN_ROUND_SECONDS // 60} minutes of rounds can roll one.",
        f"At most one every {SURPRISE_COOLDOWN_HOURS // 24} days.",
    ]


def surprise_eligible(sessions_done: int, round_seconds: Optional[int], last_at: Optional[str],
                      now: Optional[datetime] = None) -> bool:
    if sessions_done < SURPRISE_MIN_SESSIONS:
        return False
    if round_seconds is not None and round_seconds < SURPRISE_MIN_ROUND_SECONDS:
        return False
    if last_at:
        try:
            last = datetime.fromisoformat(last_at)
        except ValueError:
            return True
        if last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        if (now or datetime.now(timezone.utc)) - last < timedelta(hours=SURPRISE_COOLDOWN_HOURS):
            return False
    return True


def surprise_odds() -> List[dict]:
    rows = [{"kind": k, "label": label, "pct": w} for k, label, w in SURPRISE_TABLE]
    rows.append({"kind": "none", "label": "Nothing this time", "pct": 100 - sum(w for *_, w in SURPRISE_TABLE)})
    return rows


def roll_surprise(seed: str, *, guaranteed: bool = False, scored: bool = True) -> Optional[str]:
    import random
    rng = random.Random(seed)
    total = sum(w for *_, w in SURPRISE_TABLE)
    roll = rng.uniform(0, total if guaranteed else 100)
    kind = None
    for k, _, w in SURPRISE_TABLE:
        if roll < w:
            kind = k
            break
        roll -= w
    if kind == "deep_scout" and not scored:
        kind = "legend_tip"
    return kind


# ---- Team missions: the crew chooses (Core Drives 3 and 5) ----
# Goal: crews own their week instead of being handed a task.
# Psychology: meaningful choice ("plant pickers") and creativity make a goal feel like yours;
#   designing something together (the Signature Combo) bonds a group more than counting sessions.
# Design: each week the crew votes for one of three missions. The vote locks when the first
#   session counts. Signature Combo: members nominate a combo they built, the crew votes, and
#   AI-scored sessions drilling the winner count. Finishing lets each member pick a booster.

QUEST_ROUTES = {
    "engine": ("Engine Room", "Train {target} sessions between you."),
    "sharp": ("Sharp Shooters", "Land {target} AI-scored sessions with a jab of 7 or better between you."),
    "signature": ("Signature Combo", "Pick a squad combo, then drill it in {target} AI-scored sessions between you."),
}
SHARP_JAB = 7


def route_target(route: str, members: int) -> int:
    if route == "engine":
        return quest_target(members)
    return max(3, min(16, 2 * max(1, members)))


def plurality(votes: dict) -> Optional[str]:
    """Most-voted choice; a tie goes to whichever was voted for first."""
    if not votes:
        return None
    counts: dict = {}
    for choice in votes.values():
        counts[choice] = counts.get(choice, 0) + 1
    top = max(counts.values())
    return next(c for c in votes.values() if counts[c] == top)


def session_counts(route: str, *, trusted: bool, jab: Optional[float], combo: Optional[str],
                   signature: Optional[str]) -> bool:
    if route == "engine":
        return True
    if not trusted:
        return False
    if route == "sharp":
        return isinstance(jab, (int, float)) and jab >= SHARP_JAB
    return bool(signature) and combo == signature


BOOSTER_CHOICES = {
    "double_status": "2x status on your next session",
    "guaranteed_surprise": "A guaranteed Corner Surprise next session",
    "coach_eye": "Coach's Eye: a full report on your next AI-scored session",
    "status_now": "+100 status right now",
}


def coach_eye_report(dims: list, drills: dict) -> List[dict]:
    """Every scored dimension, weakest first, each with the drill that fixes it."""
    scored = [d for d in dims or [] if isinstance(d.get("score"), (int, float))]
    return [{"dimension": d["dimension_name"], "score": d["score"],
             "drill": (drills.get(d["dimension_name"]) or {}).get("name")}
            for d in sorted(scored, key=lambda d: (d["score"], d["dimension_name"]))]


# ---- Pick your week (Self-Determination Theory: autonomy) ----
# Goal: fighters keep training week after week.
# Psychology: a goal you chose yourself feels like yours (autonomy), so you keep it; one set
#   for you feels like homework. Last week's choice is offered again (a default you can change).
# Design: every Monday the fighter picks 2, 3 or 4 sessions and one skill to work on. Their
#   partner's condition and the week's progress follow that choice, not a number we set.
WEEK_TARGETS = (2, 3, 4)


def week_plan_view(plan: Optional[dict], sessions_this_week: int, wk: str) -> dict:
    current = bool(plan) and plan.get("week_id") == wk
    target = (plan or {}).get("target") or TARGET_SESSIONS_PER_WEEK
    return {"week_id": wk, "chosen": current, "target": target, "focus": (plan or {}).get("focus"),
            "done": sessions_this_week, "left": max(0, target - sessions_this_week),
            "complete": current and sessions_this_week >= target}


# ---- Weekly streak (boxing weeks, not days) ----
# Goal: a reason to come back every week, and something worth posting (visible progress,
#   permission to show off).
# Psychology: an unbroken chain is worth protecting (loss aversion, endowed progress). But a
#   daily chain punishes the rest days boxers need, and one missed day makes people give up
#   altogether (the what-the-hell effect). Boxers think in weeks: sessions per week is how
#   every coach plans training.
# Design: a week counts when you train on WEEK_STREAK_DAYS different days, Monday to Sunday.
#   Two is the least any boxing coach would call training, and it stays the same whatever
#   weekly target you pick, so aiming higher never puts the streak at risk. This week never
#   breaks the streak before it ends; it only says how many more days keep it going.
WEEK_STREAK_DAYS = 2


def weekly_streak(days: Iterable[date], today: Optional[date] = None) -> dict:
    today = today or datetime.now(timezone.utc).date()
    per_week: Dict[str, int] = {}
    for d in set(days):
        if d <= today:
            per_week[week_id(d)] = per_week.get(week_id(d), 0) + 1
    this_week = per_week.get(week_id(today), 0)

    run, back = 0, today - timedelta(days=7)
    while per_week.get(week_id(back), 0) >= WEEK_STREAK_DAYS:
        run += 1
        back -= timedelta(days=7)
    safe = this_week >= WEEK_STREAK_DAYS
    current = run + (1 if safe else 0)

    longest = streak = 0
    if per_week:
        d = min(date.fromisocalendar(*[int(x) for x in w.replace("W", "").split("-")], 1) for w in per_week)
        while d <= today:
            streak = streak + 1 if per_week.get(week_id(d), 0) >= WEEK_STREAK_DAYS else 0
            longest = max(longest, streak)
            d += timedelta(days=7)
    return {"current": current, "longest": max(longest, current), "this_week_days": this_week,
            "needed": max(0, WEEK_STREAK_DAYS - this_week), "safe": safe, "at_risk": run > 0 and not safe,
            "days_left": 6 - today.weekday(), "per_week": WEEK_STREAK_DAYS}


def streak_nudge(streak: dict, local_weekday: int) -> Optional[Tuple[str, str]]:
    # One nudge a week, only when the streak is really at stake and there are still enough days
    # left: Friday when two sessions are needed, Saturday when one is.
    if not streak["at_risk"] or streak["needed"] not in (1, 2):
        return None
    if local_weekday != (4 if streak["needed"] == 2 else 5):
        return None
    weeks = streak["current"]
    more = "one more session" if streak["needed"] == 1 else "two sessions"
    return (f"Your {weeks}-week streak is on the line",
            f"{more.capitalize()} by Sunday keeps it going.")


# ---- Boss Round (Lazzaro's Hard Fun: fiero) ----
# Goal: a weekly peak moment worth talking about.
# Psychology: fiero, the arms-in-the-air feeling, needs a challenge that really could beat
#   you. Scaling each boss to the fighter's own best keeps it hard for a beginner and a
#   veteran alike, and a few tries a week keeps it special.
# Design: one boss a week for everyone, one round long, judged by the Live Coach counts on
#   the phone. Beat it and you get status and a brag moment. The counts are activity, not
#   technique, so a boss never touches scores, personal bests or seasons.
BOSSES = {
    "machine": ("The Machine", "Out-throw your best round by 10%."),
    "wall": ("The Wall", "Keep your guard up 85% of the round and keep punching."),
    "ghost": ("The Ghost", "Keep your head moving all round."),
    "storm": ("The Storm", "Land one 6-punch combination."),
}
BOSS_ATTEMPTS_PER_WEEK = 3
BOSS_STATUS = 60


def boss_for_week(wk: str) -> str:
    keys = list(BOSSES)
    return keys[int(hashlib.md5(wk.encode()).hexdigest(), 16) % len(keys)]


def boss_target(key: str, *, best_punches: int, round_seconds: int) -> dict:
    minutes = max(30, round_seconds) / 60
    if key == "machine":
        base = best_punches or round(40 * minutes)
        n = -(-base * 11 // 10)
        return {"punches": n, "line": f"Throw {n} punches in one round"}
    if key == "wall":
        n = round(30 * minutes)
        return {"guard_pct": 85, "punches": n, "line": f"Guard up 85% of the round with {n}+ punches"}
    if key == "ghost":
        n = round(12 * minutes)
        return {"head_moves": n, "line": f"{n} head movements in one round"}
    return {"best_combo": 6, "line": "Land a 6-punch combination"}


def boss_result(target: dict, live_round: Optional[dict]) -> dict:
    r = live_round or {}
    checks = {k: (r.get(k) or 0) >= v for k, v in target.items() if k != "line"}
    return {"beaten": bool(checks) and all(checks.values()),
            "got": {k: r.get(k) or 0 for k in checks}}


# ---- My Epic Win (McGonigal: epic meaning, bad guys, power-ups) ----
# Goal: training is tied to something the fighter really cares about.
# Psychology: epic meaning (Core Drive 1) and self-concordant goals (ones that fit who you
#   are) last longer. Naming the "bad guys" that stop you, with a move to beat each one,
#   turns a vague struggle into a fight you know how to win (SuperBetter).
# Design: asked after the first week, never at sign-up. Private to the fighter. The coach
#   only mentions it after a real win, so the reminder always arrives with evidence.
EPIC_WINS = {
    "first_bout": "Have my first bout",
    "sport_fit": "Get fit for my sport",
    "confidence": "Feel more confident",
    "look_after": "Be able to look after myself",
    "sparring": "Stop freezing in sparring",
}
BAD_GUYS = {
    "tired": ("Tired after school or work", "Just one round. Three minutes still counts."),
    "phone": ("My phone", "Start the round timer first. Scroll after the bell."),
    "space": ("No space to train", "A freestyle round needs one step either way."),
    "nerves": ("Nerves about being judged", "Freestyle rounds have no score. Nobody's judging."),
    "forget": ("I forget", "Pick a reminder time that fits your day."),
}
EPIC_FROM_DAYS = 7
EPIC_CUSTOM_MAX = 60


def epic_goal_text(epic: Optional[dict]) -> Optional[str]:
    if not epic:
        return None
    return epic.get("custom") or EPIC_WINS.get(epic.get("goal") or "")


def epic_line(epic: Optional[dict]) -> Optional[str]:
    goal = epic_goal_text(epic)
    return f"That's one step closer to your big win: {goal[0].lower()}{goal[1:]}." if goal else None


# ---- Reminder you choose (Fogg: Behaviour = Motivation x Ability x Prompt) ----
# Goal: more days with at least one session.
# Psychology: a prompt only works when it lands at a moment the fighter can act, so they
#   pick it, anchored to their own routine (Tiny Habits). Tired fighters need it easier
#   (a facilitator), bored ones need a reason (a spark). No prompt once the week is done.
# Design: one reminder a day at the chosen time, never during quiet hours, never after
#   9pm for under-18s, and none once this week's chosen target is met.
REMINDER_ANCHORS = {
    "morning": ("Before school or work", 7),
    "after_school": ("After school or work", 16),
    "after_tea": ("After tea", 18),
    "evening": ("In the evening", 19),
}
REMINDER_FIRST_HOUR = 6
REMINDER_LAST_HOUR_MINOR = 20
REMINDER_LAST_HOUR_ADULT = 21


def reminder_hour_allowed(hour: int, minor: bool) -> bool:
    return REMINDER_FIRST_HOUR <= hour <= (REMINDER_LAST_HOUR_MINOR if minor else REMINDER_LAST_HOUR_ADULT)


def reminder_message(*, partner: str, state: str, week_left: int, bad_guys: Iterable[str] = ()) -> Optional[tuple]:
    if week_left <= 0:
        return None
    if state in COMEBACK_STATES:
        return (f"{partner} is waiting for you", "One session brings them straight back.", "/train?quick=1")
    if "tired" in set(bad_guys or ()):
        return ("Just one round", "Tired? Three minutes still counts.", "/train?quick=1")
    return ("Just one round", f"Three minutes. {week_left} to go this week.", "/train?quick=1")


# ---- Gym check-in (the world is your playground) ----
# Goal: more real gym sessions, and gyms that want to promote the app.
# Psychology: a physical object is a prompt right where training happens, and training
#   seen by others pulls harder (Core Drive 5). Effort for your team counts twice.
# Design: a QR poster on the gym wall. Scanning it marks today as a gym day; verified time
#   that day counts double for the gym's season total only (never for personal hours).
#   No GPS and no location saved: the code only says which gym.
GYM_CHECKIN_MULTIPLIER = 2


# ---- Unlock as you go (onboarding: feel smart, not swamped) ----
# Goal: new fighters finish their first sessions and feel capable, not lost.
# Psychology: cognitive load (a few choices at a time) and competence (Self-Determination
#   Theory): people who succeed at something simple early see themselves as good at it.
#   An unlock earned by training is also a small reward (Core Drive 2) that teaches the app
#   one piece at a time instead of all at once.
# Design: the first session is just "one round" with your partner. Each new feature arrives
#   after a real session, with one line saying what it is. Nothing is locked behind money.
FEATURE_UNLOCKS = [
    ("week_plan", 1, "Pick your week", "Choose how many sessions you'll do each week. Your partner keeps pace."),
    ("combo_calls", 2, "Combo calls", "Your coach calls combos by number: 1 is a jab, 2 a cross, 3 a lead hook."),
    ("crew", 2, "Squads and ranks", "See where you stand this week and train with friends."),
    ("round_types", 3, "Freestyle rounds", "A no-score round for days you just want to move."),
    ("go_live", 3, "Go live", "Stream a session for your friends to watch."),
    ("boss", 5, "Boss Round", "One tough round a week, set by your own best."),
    ("give_tips", 10, "Pass it on", "Leave a tip for someone just starting out."),
]
NEWCOMER_SESSIONS = 3


def unlocked_features(sessions: int) -> List[str]:
    return [k for k, at, _, _ in FEATURE_UNLOCKS if sessions >= at]


def next_unlock(sessions: int) -> Optional[dict]:
    for k, at, name, line in FEATURE_UNLOCKS:
        if sessions < at:
            return {"key": k, "name": name, "line": line, "at": at, "sessions_to_go": at - sessions}
    return None


def newly_unlocked_features(before: int, after: int) -> List[dict]:
    return [{"key": k, "name": name, "line": line} for k, at, name, line in FEATURE_UNLOCKS if before < at <= after]


# ---- Easter eggs (Core Drive 7: sudden rewards) ----
# Goal: a reason to try new things in training.
# Psychology: a surprise for something you did anyway feels like a discovery, not a task.
#   Saying how many exist (but not what they are) keeps it fair and makes people curious.
# Design: five hidden eggs, found from real session evidence only. The shelf shows
#   "2 of 5 found"; the rest stay hidden until earned. Never bought.
EASTER_EGGS = {
    "early_bird": ("Early Bird", "Trained before 7am."),
    "century": ("Century", "Exactly 100 punches in one round."),
    "championship": ("Championship Distance", "A 12-round session."),
    "lucky_seven": ("Lucky Seven", "An AI score of exactly 7.7."),
    "iron_curtain": ("Iron Curtain", "Guard up the whole round, with 30+ punches."),
}


def eggs_in_session(session: dict, live_rounds: Iterable[dict], local_hour: Optional[int]) -> List[str]:
    found = []
    if local_hour is not None and 4 <= local_hour < 7:
        found.append("early_bird")
    rounds = list(live_rounds or [])
    if any(r.get("punches") == 100 for r in rounds):
        found.append("century")
    if ((session.get("training_config") or {}).get("total_rounds") or 0) >= 12 and len(session.get("rounds") or rounds) >= 12:
        found.append("championship")
    if session.get("overall_score") == 7.7:
        found.append("lucky_seven")
    if any(r.get("guard_pct") == 100 and (r.get("punches") or 0) >= 30 for r in rounds):
        found.append("iron_curtain")
    return found


# ---- Boss vote (HEXAD Disruptors and Free Spirits; Core Drive 3) ----
# Goal: fighters who want to change the system get a real, safe way to do it.
# Psychology: a say in the rules builds ownership of them (autonomy, the IKEA effect).
# Design: everyone can vote on next week's boss. Most votes wins; no votes keeps the rotation.
def boss_from_votes(votes: Iterable[str], wk: str) -> str:
    counts: dict = {}
    for v in votes or []:
        if v in BOSSES:
            counts[v] = counts.get(v, 0) + 1
    if not counts:
        return boss_for_week(wk)
    top = max(counts.values())
    return sorted(k for k, c in counts.items() if c == top)[0]


def next_week_id(d: Optional[date] = None) -> str:
    d = d or datetime.now(timezone.utc).date()
    return week_id(d + timedelta(days=7))


# ---- Pass it on (HEXAD Philanthropists; Core Drive 1) ----
# Goal: experienced fighters help newcomers, and newcomers feel welcomed by real people.
# Psychology: helping with no reward is its own reward for some people (purpose); seeing that
#   your tip helped someone closes the loop. Advice from "someone like me" lands better.
# Design: after 10 sessions you can leave one short tip a week. It is moderated, anonymous
#   (level and gym only, never a name) and one-way: no replies, no profiles, no chat.
TIP_FROM_SESSIONS = 10
TIP_MAX = 140
TIP_HIDE_AFTER_REPORTS = 2


def tip_byline(level: int, same_gym: bool) -> str:
    return f"A level {level} fighter{' at your gym' if same_gym else ''}"


# ---- Results that land one at a time (prospect theory: hedonic editing) ----
# Goal: each reward feels like a win, and the screen doesn't swamp a newcomer.
# Psychology: separate gains feel bigger than one lump (segregate gains); too many badges
#   at once make each mean less (and overwhelm someone new).
# Design: newcomers see a short "what you did" screen with the rest folded away; everyone
#   sees rewards arrive one after another.


# ---- Anticipation Parade (Core Drive 2 + 6) ----
# Goal: a reason to come back tomorrow that isn't a nag.
# Psychology: anticipation is part of the reward; a near, specific next thing pulls harder
#   than a vague one (goal gradient). Only real dates and real counts: no invented urgency.
# Design: a short "coming up" strip on Home, soonest first, at most four items.
PARADE_MAX = 4


def anticipation(items: Iterable[Optional[dict]]) -> List[dict]:
    real = [i for i in items or [] if i and i.get("title")]
    return sorted(real, key=lambda i: (i.get("sort", 99), i["title"]))[:PARADE_MAX]


# ---- Season Wrapped (peak-end, identity) ----
# Goal: fighters carry into the next season because of who they became, not what they got.
# Psychology: the peak-end rule (we remember how something ended) and self-perception: a
#   story of your own season, told from your real numbers, becomes part of how you see yourself.
# Design: a few tap-through cards at season end: sessions and hours, then vs now, your crew's
#   best moment, the session you loved most (from your own reflections), and a closing line
#   about the fighter you became. Every line comes from data; a missing fact is left out.
def wrapped_cards(f: dict) -> List[dict]:
    cards = []
    if f.get("sessions"):
        hrs = f.get("hours") or 0
        cards.append({"kind": "showed_up", "big": str(f["sessions"]), "label": "sessions",
                      "line": f"You trained {f['sessions']} times this season" + (f", with {hrs} proven hours." if hrs else ".")})
    tvn = f.get("then_vs_now")
    if tvn and tvn.get("change") is not None and tvn["change"] > 0:
        cards.append({"kind": "growth", "big": f"+{tvn['change']}", "label": "AI score",
                      "line": f"From {tvn['then']} to {tvn['now']} on your AI-scored rounds."})
    if f.get("crew_moment"):
        cards.append({"kind": "crew", "big": f["crew_moment"]["big"], "label": f["crew_moment"]["label"],
                      "line": f["crew_moment"]["line"]})
    if f.get("loved"):
        cards.append({"kind": "loved", "big": f["loved"]["date"], "label": "your favourite session",
                      "line": f"You rated it {f['loved']['enjoyment']}/5" + (f" and said it made you {f['loved']['why']}." if f['loved'].get('why') else ".")})
    if f.get("bosses"):
        cards.append({"kind": "boss", "big": str(f["bosses"]), "label": f"boss{'es' if f['bosses'] != 1 else ''} beaten",
                      "line": "Hard rounds, won."})
    trait = f.get("trait")
    if trait:
        cards.append({"kind": "became", "big": trait["name"], "label": "who you became",
                      "line": f"You showed it {trait['count']} time{'s' if trait['count'] != 1 else ''}. {trait['statement']}"})
    elif cards:
        cards.append({"kind": "became", "big": "A fighter", "label": "who you became",
                      "line": "You kept showing up. That's where every fighter starts."})
    return cards


# ---- Oracle Effect (Core Drive 7 + 2) ----
# Goal: give the next session a clear, personal purpose.
# Psychology: a prediction about you creates curiosity ("will I?") and, when it comes true,
#   competence ("I did that"). It must come from your real trend, or it's a lie.
# Design: from the last six AI-scored sessions, find a skill that's rising and close to the
#   next whole number. The partner predicts how many scored sessions it'll take (1-3). Prove it
#   and earn status; miss it and the prediction quietly retires after 10 days.
ORACLE_DAYS = 10
ORACLE_STATUS = 40
ORACLE_WINDOW = 6
ORACLE_MIN_SLOPE = 0.05


def _slope(vals: List[float]) -> float:
    n = len(vals)
    xs = range(n)
    mx, my = (n - 1) / 2, sum(vals) / n
    den = sum((x - mx) ** 2 for x in xs)
    return sum((x - mx) * (v - my) for x, v in zip(xs, vals)) / den if den else 0.0


def oracle_prediction(history: List[dict]) -> Optional[dict]:
    """history: AI-scored sessions oldest first, each {dimension_name: score}."""
    import math
    best = None
    dims = {k for h in history for k in h}
    for dim in sorted(dims):
        vals = [h[dim] for h in history if isinstance(h.get(dim), (int, float))][-ORACLE_WINDOW:]
        if len(vals) < 3:
            continue
        slope = _slope(vals)
        if slope < ORACLE_MIN_SLOPE:
            continue
        latest = sum(vals[-2:]) / 2
        target = math.floor(latest) + 1
        if target > 10:
            continue
        need = max(1, math.ceil((target - latest) / slope))
        if need > 3:
            continue
        cand = (need, -slope, dim, target)
        if best is None or cand < best:
            best = cand
    if not best:
        return None
    need, neg_slope, dim, target = best
    return {"dimension": dim, "target": target, "sessions": need}


def oracle_line(partner: str, p: dict) -> str:
    n = p["sessions"]
    return (f"{partner}: {'one more' if n == 1 else n} AI-scored session{'s' if n != 1 else ''} at this rate "
            f"and your {p['dimension'].lower()} passes {p['target']}. Prove me right.")


# ---- Crew feed: the water cooler (Core Drive 5) ----
# Goal: crews feel alive between sessions without the risks of open chat.
# Psychology: seeing friends' wins (and being seen) builds belonging; stamps let people
#   react warmly with no room for bullying or contact from strangers (under-18 safety).
# Design: real moments only (trained, PB, boss beaten, mission done, level up), one line each,
#   and a few fixed stamps. No free text anywhere.
FEED_STAMPS = {"fire": "Fire", "respect": "Respect", "strong": "Strong", "wow": "Wow"}
FEED_MAX = 30


def crew_moments(name: str, rewards: dict) -> List[dict]:
    out = []
    status = rewards.get("status") or {}
    if status.get("leveled_up"):
        out.append({"kind": "level", "text": f"{name} hit level {status.get('level')}"})
    for pb in (rewards.get("personal_bests") or {}).get("new") or []:
        out.append({"kind": "pb", "text": f"{name} set a new {pb.get('name')} PB"})
        break
    boss = rewards.get("boss") or {}
    if boss.get("beaten"):
        out.append({"kind": "boss", "text": f"{name} beat {boss.get('name')}"})
    for q in rewards.get("quests") or []:
        if q.get("just_completed"):
            out.append({"kind": "quest", "text": f"{name} finished the squad mission", "squad_id": q.get("squad_id")})
    if not out:
        out.append({"kind": "trained", "text": f"{name} trained today"})
    return out
