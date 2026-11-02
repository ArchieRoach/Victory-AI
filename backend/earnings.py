"""Streamer earnings: what streamers keep from what fans spend on their streams.

Goal: win streamers from Twitch and Kick; streamers bring their audiences with them.
Psychology: creators compare the headline share first (it anchors the choice), and they stay where
  they can see their money adding up (visible progress). Fairness matters more than size: a share
  that is clear and reliably paid beats a bigger one with small print.
Design: streamers 18+ keep 80% of what fans spend on their streams (tips, gift subs, their emotes),
  worked out after VAT and payment fees, so we never pay out more than came in. Tokens are valued at
  the cheapest price any fan pays for them. Money is held 14 days for refunds, then paid monthly once
  it reaches £20. Under-18s get their share as tokens and can't cash out.
"""
import math
from datetime import datetime
from typing import Dict, Iterable, List

STREAMER_SHARE = 0.80
HOLD_DAYS = 14
PAYOUT_MIN_PENCE = 2000
VAT_RATE = 0.20
CARD_FEE_RATE = 0.015
CARD_FEE_FIXED_PENCE = 20
GIFT_PRO_DAYS = 30
SOURCES = {"tip": "Tips", "gift_sub": "Gift subs", "emote": "Emote sales"}


def net_pence(gross_pence: int) -> int:
    """What reaches us from a card payment, after UK VAT and an estimate of card fees."""
    if gross_pence <= 0:
        return 0
    ex_vat = gross_pence / (1 + VAT_RATE)
    return max(0, math.floor(ex_vat - gross_pence * CARD_FEE_RATE - CARD_FEE_FIXED_PENCE))


def token_value_pence(packages: Dict[str, dict]) -> float:
    """The least a token ever brings in (the best-value pack), so token earnings are never overpaid."""
    return min(net_pence(round(p["price"] * 100)) / p["tokens"] for p in packages.values())


def share_pence(value_pence: float) -> int:
    return max(0, math.floor(value_pence * STREAMER_SHARE))


def minor_token_share(tokens: int) -> int:
    return int(tokens * STREAMER_SHARE)


def summarise(rows: Iterable[dict], now: datetime) -> dict:
    now_iso = now.isoformat()
    month = now.strftime("%Y-%m")
    out = {"this_month_pence": 0, "on_hold_pence": 0, "ready_pence": 0, "paid_pence": 0,
           "by_source": {k: 0 for k in SOURCES}}
    for r in rows:
        amount = r.get("share_pence", 0)
        if (r.get("created_at") or "").startswith(month):
            out["this_month_pence"] += amount
            out["by_source"][r.get("source")] = out["by_source"].get(r.get("source"), 0) + amount
        if r.get("status") == "paid":
            out["paid_pence"] += amount
        elif (r.get("available_at") or "") > now_iso:
            out["on_hold_pence"] += amount
        else:
            out["ready_pence"] += amount
    out["payout_due"] = out["ready_pence"] >= PAYOUT_MIN_PENCE
    return out


def pick_gift_recipients(candidates: List[str], count: int, shuffle) -> List[str]:
    pool = list(dict.fromkeys(c for c in candidates if c))
    shuffle(pool)
    return pool[:count]
