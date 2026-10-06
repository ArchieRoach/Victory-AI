# Fantasy Boxing engine — pure functions shared by the sync jobs and the API.
#
# Goal: a free fantasy game on real fight cards that runs itself: real fighters, prices
#   that reflect real records, and points from official results, with nobody keying in data.
# Psychology: a price people trust ("the favourite costs more because of his record") makes
#   picking an underdog a real decision, and a believable game is one people come back to.
# Design: prices come from each boxer's record with a published formula. Results come from
#   the data feed's official outcome, round and judges' scores. Scoring mirrors
#   frontend/src/lib/fantasyScoring.js exactly.
#
# Data source: Boxing Data API (boxing-data.com, via RapidAPI). Its records are pro records;
# amateur cards are added manually by an admin (see the admin endpoints in server.py).
import math
import re
from typing import Optional

SALARY_CAP = 100
STABLE_SIZE = 3
PRICE_MIN, PRICE_MAX = 10, 50

POINTS = {
    "WIN_STOPPAGE": 20, "WIN_UD": 15, "WIN_SD_MD": 10, "TD_NC": 5, "LOSS": 0,
    "EARLY_FINISH": 10, "MID_FINISH": 5, "LATE_FINISH": 2, "CLEAN_SWEEP": 10,
}
STOPPAGES = {"KO", "TKO", "DQ"}
KNOCKOUTS = {"KO", "TKO"}
KNOWN_WIN_METHODS = {"KO", "TKO", "DQ", "UD", "MD", "SD"}
NO_DECISION = {"TD", "NC", "D"}

UK_PLACES = ("united kingdom", "england", "scotland", "wales", "northern ireland")
WORLD_TITLE = re.compile(r"\b(WBC|WBA|IBF|WBO)\b.*\bworld\b|\bworld\b.*\b(WBC|WBA|IBF|WBO)\b|\bundisputed\b|\bring magazine\b", re.I)


# ── Prices ──────────────────────────────────────────────────────────────────

def fighter_rating(stats: Optional[dict]) -> float:
    """A single number for how good a record is.

    • Win rate is smoothed towards 50% with 4 imaginary bouts, so a 3-0 prospect isn't
      rated above a 30-2 champion.
    • Knockout power and experience add a little; being stopped takes a little off.
    """
    s = stats or {}
    wins, losses, draws = s.get("wins") or 0, s.get("losses") or 0, s.get("draws") or 0
    bouts = s.get("total_bouts") or (wins + losses + draws)
    kos, stopped = s.get("ko_wins") or 0, s.get("stopped") or 0
    win_rate = (wins + 2) / (bouts + 4)
    ko_rate = kos / wins if wins else 0
    stopped_rate = stopped / bouts if bouts else 0
    return 100 * win_rate + 15 * ko_rate + 8 * math.log1p(bouts) - 10 * stopped_rate


def win_probability(rating_a: float, rating_b: float) -> float:
    """Chance A beats B. Every 25 rating points is roughly 10-to-1."""
    return 1 / (1 + 10 ** (-(rating_a - rating_b) / 25))


def bout_prices(stats_a: Optional[dict], stats_b: Optional[dict]) -> tuple:
    """Coin prices for both boxers in a bout: 10 for a no-hoper, 50 for a near-certainty.

    Prices are from records only — never betting odds — so the game has no link to
    gambling markets.
    """
    p = win_probability(fighter_rating(stats_a), fighter_rating(stats_b))
    price = lambda prob: int(round(PRICE_MIN + (PRICE_MAX - PRICE_MIN) * prob))
    return price(p), price(1 - p)


# ── Which cards become games ────────────────────────────────────────────────

def is_uk(location: Optional[str]) -> bool:
    loc = (location or "").lower()
    return any(place in loc for place in UK_PLACES)


def is_world_title(titles: list) -> bool:
    return any(WORLD_TITLE.search(t.get("name") or "") for t in titles or [])


def card_qualifies(event_location: Optional[str], fights: list) -> Optional[str]:
    """Why a card is in the game ("uk" or "world_title"), or None to skip it."""
    if is_uk(event_location):
        return "uk"
    if any(is_world_title(f.get("titles")) for f in fights):
        return "world_title"
    return None


# ── Results ─────────────────────────────────────────────────────────────────

def _score_pair(score: str) -> Optional[tuple]:
    m = re.match(r"\s*(\d+)\s*[-–]\s*(\d+)\s*$", score or "")
    return (int(m.group(1)), int(m.group(2))) if m else None


def clean_sweep(scores: Optional[list], scheduled_rounds: int, winner_is_first: Optional[bool] = None) -> bool:
    """Won every round on at least one official card.

    Winning every round means scoring 10 in every round, so the winner's total on that
    card is exactly 10 × rounds (e.g. 120-108 over 12). A round lost or drawn makes it
    less, so this needs no round-by-round data. Scores are written winner-first by the
    feed; `winner_is_first` can override that if a source lists them by fighter order.
    """
    target = 10 * (scheduled_rounds or 0)
    for raw in scores or []:
        pair = _score_pair(raw)
        if not pair or not target:
            continue
        winner_score = pair[0] if winner_is_first is not False else pair[1]
        loser_score = pair[1] if winner_is_first is not False else pair[0]
        if winner_score == target and loser_score < winner_score:
            return True
    return False


def map_result(fight: dict) -> Optional[dict]:
    """Boxing Data API fight → our result, or None until the fight is finished.

    Outcomes: KO, TKO, UD, MD, SD, PTS. "PTS" is a single referee's points decision
    (common on UK small-hall shows) and scores like a unanimous decision — one official
    verdict, nobody dissenting. A finished fight with no winner is a draw or no contest.
    """
    if (fight.get("status") or "").upper() != "FINISHED":
        return None
    fighters = fight.get("fighters") or {}
    f1, f2 = fighters.get("fighter_1") or {}, fighters.get("fighter_2") or {}
    winner = f1 if f1.get("winner") else f2 if f2.get("winner") else None
    results = fight.get("results") or {}
    outcome = (results.get("outcome") or "").upper()
    try:
        rnd = int(results.get("round")) if results.get("round") not in (None, "") else None
    except (TypeError, ValueError):
        rnd = None
    rounds = fight.get("scheduled_rounds") or 0
    if winner is None:
        return {"winner_id": None, "method": "NC" if outcome in ("NC", "ND") else "D",
                "round": rnd or rounds, "clean_sweep": False}
    # Retirements in the corner are stoppages (TKO); a referee's points decision scores as UD.
    method = {"PTS": "UD", "RTD": "TKO", "TD": "TKO"}.get(outcome, outcome)
    if method not in KNOWN_WIN_METHODS:
        # Never guess a result: the sync job flags it for an admin instead.
        return {"needs_review": True, "raw_outcome": outcome, "winner_id": winner.get("fighter_id")}
    return {
        "winner_id": winner.get("fighter_id"),
        "method": method,
        "round": rnd or rounds,
        "clean_sweep": method in ("UD", "MD", "SD") and clean_sweep(fight.get("scores"), rounds),
    }


def map_status(fight: dict) -> str:
    return {"NOT_STARTED": "upcoming", "LIVE": "live", "FINISHED": "complete"}.get(
        (fight.get("status") or "").upper(), "upcoming")


# ── Scoring (mirror of frontend/src/lib/fantasyScoring.js) ──────────────────

def score_fighter(fighter_id: str, bout: dict) -> Optional[int]:
    if bout.get("status") != "complete" or not bout.get("result"):
        return None
    r = bout["result"]
    method, rnd = r.get("method"), r.get("round")
    if method in NO_DECISION:
        return POINTS["TD_NC"]
    if r.get("winner_id") != fighter_id:
        return 0
    if method in STOPPAGES:
        pts = POINTS["WIN_STOPPAGE"]
    elif method == "UD":
        pts = POINTS["WIN_UD"]
    else:
        pts = POINTS["WIN_SD_MD"]
    if method in KNOCKOUTS and isinstance(rnd, int):
        pts += POINTS["EARLY_FINISH"] if rnd <= 4 else POINTS["MID_FINISH"] if rnd <= 8 else POINTS["LATE_FINISH"] if rnd <= 12 else 0
    if r.get("clean_sweep"):
        pts += POINTS["CLEAN_SWEEP"]
    return pts


def index_card(card: dict) -> dict:
    return {f["fighter_id"]: (f, b) for b in card.get("bouts", []) for f in b.get("fighters", [])}


def check_stable(picks: list, card: dict) -> Optional[str]:
    """None if the stable is legal, else a plain-English reason (shown to players)."""
    index = index_card(card)
    if len(set(picks)) != len(picks):
        return "You picked the same boxer twice."
    if len(picks) != STABLE_SIZE:
        return f"Pick {STABLE_SIZE} boxers."
    if any(p not in index for p in picks):
        return "One of your boxers isn't fighting any more. Pick another."
    spent = sum(index[p][0]["salary"] for p in picks)
    if spent > SALARY_CAP:
        return f"Too many coins! You're {spent - SALARY_CAP} over. Swap a boxer for a cheaper one."
    return None


def stable_score(picks: list, card: dict) -> int:
    index = index_card(card)
    return sum(score_fighter(p, index[p][1]) or 0 for p in picks if p in index)


def card_status(bouts: list) -> str:
    statuses = [b.get("status") for b in bouts] or ["upcoming"]
    if all(s == "complete" for s in statuses):
        return "complete"
    if any(s != "upcoming" for s in statuses):
        return "live"
    return "upcoming"


def rank_entries(entries: list) -> list:
    """[{user_id, name, total, ...}] → same, sorted, with shared ranks on ties (1, 1, 3)."""
    entries = sorted(entries, key=lambda e: (-e["total"], (e.get("name") or "").lower()))
    rank = 0
    for i, e in enumerate(entries):
        if i == 0 or e["total"] != entries[i - 1]["total"]:
            rank = i + 1
        e["rank"] = rank
    return entries
