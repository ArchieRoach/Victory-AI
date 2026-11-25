import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

# Goal: growth through gym word of mouth (fighters train in groups, so one fan brings a room).
# Psychology: reciprocity and fairness. Both sides get the same reward, so sharing feels like a
#   gift, not a sales pitch. Paying out only once the friend trains rewards real fighters, not
#   sign-ups, which keeps it honest and hard to farm.
# Design: one permanent personal link per fighter (QR, share sheet, contacts), and both get
#   REFERRAL_TOKENS when the friend finishes their first session.

REFERRAL_TOKENS = 100
REFERRAL_PAID_PER_MONTH = 10
CLAIM_WINDOW_DAYS = 7
# No 0/O or 1/I/L: the code is read off a phone screen across a gym.
ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
CODE_LEN = 6


def new_code() -> str:
    return "".join(secrets.choice(ALPHABET) for _ in range(CODE_LEN))


def clean_code(code: str) -> Optional[str]:
    c = (code or "").strip().upper()
    return c if len(c) == CODE_LEN and all(ch in ALPHABET for ch in c) else None


def can_claim(friend: dict, inviter_id: str, now: Optional[datetime] = None) -> Optional[str]:
    """Why this friend can't be credited to inviter_id, or None if they can."""
    if friend["user_id"] == inviter_id:
        return "That's your own link"
    if friend.get("invited_by"):
        return "already"
    created = friend.get("created_at")
    if created:
        when = datetime.fromisoformat(str(created).replace("Z", "+00:00"))
        if when.tzinfo is None:
            when = when.replace(tzinfo=timezone.utc)
        if (now or datetime.now(timezone.utc)) - when > timedelta(days=CLAIM_WINDOW_DAYS):
            return "Invite links are for new fighters"
    return None


def month_key(now: Optional[datetime] = None) -> str:
    return (now or datetime.now(timezone.utc)).strftime("%Y-%m")
