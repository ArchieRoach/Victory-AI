"""Demo mode: a filming account that lives in its own database.

Goal: a promo video can show months of streaks, belts, ranks, a full squad, a run club and a
  Pro Fighter Card without waiting months, and without a single fake number reaching real users.
Psychology: honesty is the brand. Social proof inside the app is only ever real
  (see real_social_proof), so demo data must never mix with real data, not even by accident.
Design: signing in with an email listed in DEMO_ACCOUNT_EMAILS switches that request to a
  separate database (DB_NAME + "_demo"). Every read and write in that request goes there, so real
  leaderboards, counts, feeds and the Fighter Market physically can't contain demo data. Demo users
  have ids starting "demo_", so background jobs for them find the demo database too.
  Payments are switched off in demo mode, so no real money is ever taken or owed.
"""
import contextvars
import os
from typing import Optional

DEMO_ID_PREFIX = "demo_"
_active = contextvars.ContextVar("victory_demo_mode", default=False)

# Paths that take or pay out real money. Blocked in demo mode.
MONEY_PATHS = ("checkout", "/subscribe", "/purchase", "payouts/onboard", "/buy-tokens", "/tokens/buy", "/bump", "/spotlight")


def demo_emails() -> list:
    """In the order written. The first one is the star (the fighter with the history and the Pro
    card); any others are fans on other filming phones."""
    out = []
    for e in os.environ.get("DEMO_ACCOUNT_EMAILS", "").split(","):
        e = e.strip().lower()
        if e and e not in out:
            out.append(e)
    return out


def is_demo_email(email: Optional[str]) -> bool:
    return bool(email) and email.strip().lower() in demo_emails()


def active() -> bool:
    return _active.get()


def enter(on: bool = True):
    return _active.set(on)


def leave(token) -> None:
    _active.reset(token)


def demo_id(real_user_id: str) -> str:
    return real_user_id if real_user_id.startswith(DEMO_ID_PREFIX) else f"{DEMO_ID_PREFIX}{real_user_id}"


def is_demo_id(user_id: Optional[str]) -> bool:
    return bool(user_id) and str(user_id).startswith(DEMO_ID_PREFIX)


def blocks_money(path: str) -> bool:
    return any(p in (path or "") for p in MONEY_PATHS)


class DbRouter:
    """Looks like a Motor database; sends each call to the demo database while demo mode is on."""

    def __init__(self, real, demo):
        object.__setattr__(self, "_real", real)
        object.__setattr__(self, "_demo", demo)

    def _target(self):
        return self._demo if _active.get() else self._real

    def __getattr__(self, name):
        return getattr(self._target(), name)

    def __getitem__(self, name):
        return self._target()[name]

    @property
    def real(self):
        return self._real

    @property
    def demo(self):
        return self._demo
