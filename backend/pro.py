"""Pro fighters: verified alias profiles, the merch shop and its money rules.

Goal: pull professional fighters (and their fans) into the app.
Psychology: identity expression and status: a pro's alias ("The Reaper") is their brand, and a
  verified home for it is worth showing off; fans follow people, not features (liking tendency).
Design: a verified Fighter Card with alias, record and belts, a merch shop, the alias as a training
  partner fans can pick, and a badge when that fighter is on a fantasy card.

Money, Vinted-style: sellers list for free and keep 100% of the item price and their shipping. The
buyer pays a small, clearly shown Buyer Protection fee, which is our revenue and pays for holding
the money until the buyer confirms the item arrived. Pros can also pay to Bump an item or put their
shop in the Spotlight. Physical merch can be bought anywhere (App Store rule 3.1.5 allows outside
payment for physical goods); bumps and spotlights are digital, so they are web-only.
"""
import re
from typing import List, Optional, Tuple

BUYER_FEE_FIXED_GBP = 0.70
BUYER_FEE_PERCENT = 5.0
BUMP_PRICE_GBP = 1.49
BUMP_DAYS = 3
SPOTLIGHT_PRICE_GBP = 5.99
SPOTLIGHT_DAYS = 7
AUTO_RELEASE_DAYS = 14          # after "shipped", if the buyer neither confirms nor reports a problem
MAX_LISTINGS = 30
MAX_PRICE_GBP = 500.0
MAX_SHIPPING_GBP = 30.0
SHIP_COUNTRIES = ["GB", "IE", "US", "CA", "AU", "FR", "DE", "ES", "IT", "NL"]

DIVISIONS = [
    "Minimumweight", "Light flyweight", "Flyweight", "Super flyweight", "Bantamweight",
    "Super bantamweight", "Featherweight", "Super featherweight", "Lightweight", "Super lightweight",
    "Welterweight", "Super welterweight", "Middleweight", "Super middleweight", "Light heavyweight",
    "Cruiserweight", "Heavyweight",
]

CLIP_MOMENTS = {
    "round_start": "Round starts",
    "halfway": "Halfway through a round",
    "last_10": "Last 10 seconds",
    "round_end": "Bell at the end of a round",
    "session_done": "Session finished",
}

# Order life: paid → shipped → received (money released) | issue → refunded / released
ORDER_FLOW = {
    "paid": {"shipped", "issue", "refunded"},
    "shipped": {"received", "issue", "released"},
    "issue": {"refunded", "released"},
    "received": set(),
    "released": set(),
    "refunded": set(),
}


def pence(gbp: float) -> int:
    return int(round(gbp * 100))


def buyer_protection_fee(price_gbp: float) -> float:
    return round(BUYER_FEE_FIXED_GBP + price_gbp * BUYER_FEE_PERCENT / 100, 2)


def order_totals(price_gbp: float, shipping_gbp: float, quantity: int = 1) -> dict:
    item = round(price_gbp * quantity, 2)
    fee = buyer_protection_fee(item)
    return {"item": item, "shipping": round(shipping_gbp, 2), "buyer_protection": fee,
            "total": round(item + shipping_gbp + fee, 2), "seller_gets": round(item + shipping_gbp, 2)}


def can_move(current: str, new: str) -> bool:
    return new in ORDER_FLOW.get(current, set())


ALIAS_RE = re.compile(r"^[A-Za-z0-9' .\-]{2,30}$")
RECORD_RE = re.compile(r"^\d{1,3}-\d{1,3}-\d{1,3}$")


def application_problem(alias: str, division: str, record: str, boxrec_url: str) -> Optional[str]:
    if not ALIAS_RE.match(alias or ""):
        return "Your alias needs 2-30 letters, numbers or spaces"
    if division not in DIVISIONS:
        return "Pick your division from the list"
    if not RECORD_RE.match(record or ""):
        return "Write your pro record as wins-losses-draws, like 18-1-0"
    if boxrec_url and not re.match(r"^https://(www\.)?boxrec\.com/", boxrec_url):
        return "The BoxRec link must start with https://boxrec.com/"
    return None


def listing_problem(title: str, price_gbp: float, shipping_gbp: float, image_url: str,
                    sizes: List[str], stock: int) -> Optional[str]:
    if not (2 <= len((title or "").strip()) <= 60):
        return "Give it a title of 2-60 characters"
    if not (1 <= price_gbp <= MAX_PRICE_GBP):
        return f"Price must be between £1 and £{MAX_PRICE_GBP:.0f}"
    if not (0 <= shipping_gbp <= MAX_SHIPPING_GBP):
        return f"Shipping must be between £0 and £{MAX_SHIPPING_GBP:.0f}"
    if not (image_url or "").startswith("https://res.cloudinary.com/"):
        return "Add a photo"
    if len(sizes) > 8 or any(not (1 <= len(s) <= 10) for s in sizes):
        return "Up to 8 sizes, each up to 10 characters"
    if not (0 <= stock <= 10000):
        return "Stock must be between 0 and 10,000"
    return None


def name_key(name: str) -> str:
    return re.sub(r"[^a-z]", "", (name or "").lower())


def market_sort_key(item: dict, now_iso: str) -> Tuple[int, int, str]:
    """Bumped items first (Vinted's paid bump), then shops in the Spotlight, then newest."""
    bumped = 0 if (item.get("bumped_until") or "") > now_iso else 1
    spot = 0 if (item.get("spotlight_until") or "") > now_iso else 1
    return (bumped, spot, "".join(chr(255 - ord(c)) for c in (item.get("created_at") or "")))


# ---- Payout accounts (Stripe Connect, Accounts v2) ----
# We hold buyers' money and release it later (separate charges and transfers), so each seller is a
# "recipient" that can only receive transfers from us, with the Express dashboard. With that
# setup Stripe requires the platform to pay Stripe's fees and cover negative balances.

def payout_account_params(email: str, display_name: str, user_id: str) -> dict:
    params = {
        "display_name": display_name[:100] or "Victory AI fighter",
        "dashboard": "express",
        "identity": {"country": "gb", "entity_type": "individual"},
        "defaults": {"responsibilities": {"fees_collector": "application", "losses_collector": "application"}},
        "configuration": {"recipient": {"capabilities": {"stripe_balance": {"stripe_transfers": {"requested": True}}}}},
        "metadata": {"user_id": user_id},
        "include": ["configuration.recipient", "requirements"],
    }
    if email:
        params["contact_email"] = email
    return params


def onboarding_link_params(account_id: str, host: str, path: str = "/pro/dashboard") -> dict:
    return {"account": account_id, "use_case": {"type": "account_onboarding", "account_onboarding": {
        "configurations": ["recipient"],
        "refresh_url": f"{host}{path}?payouts=retry",
        "return_url": f"{host}{path}?payouts=done",
    }}}


def transfers_status(account: dict) -> Optional[str]:
    node = account or {}
    for key in ("configuration", "recipient", "capabilities", "stripe_balance", "stripe_transfers", "status"):
        node = node.get(key) if isinstance(node, dict) else None
    return node
