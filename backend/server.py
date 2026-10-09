from fastapi import FastAPI, APIRouter, HTTPException, Depends, Response, Request, Query, File, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import asyncio
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional, Dict, Any, Literal
import re
import html
import secrets
import uuid
import hashlib
from datetime import datetime, timezone, timedelta, date
import httpx
import bcrypt
import jwt
import base64
import random
import time
import json
from collections import deque
import cloudinary
import cloudinary.api
import cloudinary.uploader
import cloudinary.utils
import stripe as stripe_lib
from pymongo.errors import DuplicateKeyError

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ.get('MONGO_URL', '')
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'victoryai')]

# JWT Settings
JWT_SECRET = os.environ.get('JWT_SECRET', 'victory-ai-secret-key-change-in-prod')
if JWT_SECRET == 'victory-ai-secret-key-change-in-prod':
    logging.warning("JWT_SECRET is using the insecure default — set JWT_SECRET in Railway environment variables")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_DAYS = 7

# Stripe Settings
STRIPE_API_KEY = os.environ.get('STRIPE_API_KEY', '')
STRIPE_WEBHOOK_SECRET = os.environ.get('STRIPE_WEBHOOK_SECRET', '')
STRIPE_FOUNDERS_COUPON_ID = os.environ.get('STRIPE_FOUNDERS_COUPON_ID', '')
stripe_lib.api_key = STRIPE_API_KEY
# Stripe's default is an 80s timeout per request; these calls run in the shared thread pool,
# so a stalled Stripe would hold threads that unrelated features need.
stripe_lib.default_http_client = stripe_lib.RequestsClient(timeout=20)

from resilience import CircuitBreaker, CircuitOpen
from concurrent.futures import ThreadPoolExecutor
# One breaker per third-party service (see resilience.py for why).
MODERATION_BREAKER = CircuitBreaker("openai_moderation", timeout_seconds=5, max_concurrency=20)
RESEND_BREAKER = CircuitBreaker("resend_email", timeout_seconds=10, max_concurrency=10)
WEBPUSH_BREAKER = CircuitBreaker("web_push", failure_threshold=10, timeout_seconds=12, max_concurrency=8)
CLERK_API_BREAKER = CircuitBreaker("clerk_api", timeout_seconds=5, max_concurrency=10)
# Web push uses blocking requests; its own small pool keeps it from filling the default
# thread pool that Stripe and other asyncio.to_thread work share.
_PUSH_POOL = ThreadPoolExecutor(max_workers=8, thread_name_prefix="webpush")


async def _breaker_post(breaker: CircuitBreaker, client, url: str, **kwargs):
    return await breaker.call(lambda: client.post(url, **kwargs))

# Livepeer webhook signing secret (optional; when set, incoming webhooks are HMAC-verified)
LIVEPEER_WEBHOOK_SECRET = os.environ.get('LIVEPEER_WEBHOOK_SECRET', '')

# ── Web Push (VAPID) ─────────────────────────────────────────────────────────
# Generate keys once with:
#   python -c "from py_vapid import Vapid; v=Vapid(); v.generate_keys(); \
#     print('Private:', v.private_pem().decode()); \
#     print('Public:', v.public_key.public_bytes(__import__('cryptography').hazmat.primitives.serialization.Encoding.X962, __import__('cryptography').hazmat.primitives.serialization.PublicFormat.UncompressedPoint).__import__('base64').urlsafe_b64encode(v.public_key.public_bytes(...)).decode())"
# Easier: run `vapid --gen` from the pywebpush package and paste the outputs below.
VAPID_PRIVATE_KEY = os.environ.get('VAPID_PRIVATE_KEY', '')  # PEM string
VAPID_PUBLIC_KEY  = os.environ.get('VAPID_PUBLIC_KEY',  '')  # URL-safe base64
VAPID_SUBJECT     = os.environ.get('VAPID_SUBJECT', 'mailto:push@victory.ai')

# ── Native iOS push (APNs, token-based auth) ─────────────────────────────────
# APNS_KEY is the contents of the AuthKey_XXXX.p8 file. Railway may store newlines
# as literal "\n", so they're restored here. Push to iOS silently no-ops until all four are set.
APNS_KEY_ID    = os.environ.get('APNS_KEY_ID', '')
APNS_TEAM_ID   = os.environ.get('APNS_TEAM_ID', '')
APNS_KEY       = os.environ.get('APNS_KEY', '').replace('\\n', '\n')
APNS_BUNDLE_ID = os.environ.get('APNS_BUNDLE_ID', '')

# ── Freemium AI token budget ──────────────────────────────────────────────────
# Based on real API costs: GPT-4o ~$0.005/call, ElevenLabs ~$0.02/call.
# 10,000 free tokens/month ≈ 5 video analyses OR 6 TTS sessions OR any mix.
FREE_MONTHLY_AI_TOKENS = 10_000
AI_TOKEN_COSTS = {
    "analyze_video":  2_000,   # Gemini watching one round of video
    "tts_generate":   1_500,   # ElevenLabs TTS: ~100 chars, cost-normalised
    "ai_competition": 2_000,   # Gemini judging one uploaded video
}
# ─────────────────────────────────────────────────────────────────────────────

# Resend (email)
RESEND_API_KEY = os.environ.get('RESEND_API_KEY', '')
RESEND_FROM = os.environ.get('RESEND_FROM', 'Victory AI <onboarding@resend.dev>')

# Featurebase (feedback & support) — identity JWT secret, from that workspace's own
# Settings → Access & Security → Security, per https://help.featurebase.app/articles/5257986.
# Server-side only, never sent to the browser. Unset means /auth/me just omits
# featurebaseJwt and the widget runs anonymous, same graceful-degradation pattern as
# every other optional integration in this file.
FEATUREBASE_JWT_SECRET = os.environ.get('FEATUREBASE_JWT_SECRET', '')

# Clerk Settings
CLERK_SECRET_KEY = os.environ.get('CLERK_SECRET_KEY', '')
CLERK_JWKS_URL = "https://allowing-dragon-5.clerk.accounts.dev/.well-known/jwks.json"
_clerk_jwks_cache: dict = {"keys": [], "fetched_at": 0}

# OpenAI
OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY', '')

# Livepeer
LIVEPEER_API_KEY = os.environ.get('LIVEPEER_API_KEY', '')

# ── Token economy ─────────────────────────────────────────────────────────────
TOKEN_PACKAGES = {
    "starter": {
        "tokens": 200,  "price": 1.99,  "label": "Starter",
        "badge": None,        "highlight": False,
        "tagline": "Get in the ring",
        "perks": ["2–3 tips", "4 emote unlocks", "Try punch alerts"],
        "cents_per_token": round(1.99 / 200 * 100, 2),   # 1.00¢
        "savings_pct": 0,
    },
    "fighter": {
        "tokens": 500,  "price": 4.99,  "label": "Fighter",
        "badge": "Most Popular", "highlight": True,
        "tagline": "Stay in the fight",
        "perks": ["8–10 tips", "10 emote unlocks", "Full punch menu"],
        "cents_per_token": round(4.99 / 500 * 100, 2),   # 1.00¢
        "savings_pct": 0,
    },
    "champion": {
        "tokens": 1200, "price": 9.99,  "label": "Champion",
        "badge": "Best Value", "highlight": False,
        "tagline": "Go hard",
        "perks": ["20+ tips", "24 emote unlocks", "Title Shot alerts"],
        "cents_per_token": round(9.99 / 1200 * 100, 2),  # 0.83¢
        "savings_pct": 17,
    },
    "legend": {
        "tokens": 3000, "price": 19.99, "label": "Legend",
        "badge": "Go All Out", "highlight": False,
        "tagline": "Dominate the feed",
        "perks": ["60+ tips", "60 emote unlocks", "All punch tiers"],
        "cents_per_token": round(19.99 / 3000 * 100, 2), # 0.67¢
        "savings_pct": 33,
    },
}
PUNCH_MENU = [
    # Reactions
    {"key": "ooh",       "tokens": 25,  "action": "Ooh",             "emoji": "😮",  "tier": "bronze",   "category": "reaction"},
    {"key": "heart",     "tokens": 25,  "action": "Heart",           "emoji": "❤️",  "tier": "bronze",   "category": "reaction"},
    {"key": "glass_jaw", "tokens": 50,  "action": "Glass Jaw",       "emoji": "😵",  "tier": "bronze",   "category": "reaction"},
    {"key": "gassed",    "tokens": 50,  "action": "They're Gassed",  "emoji": "💨",  "tier": "bronze",   "category": "reaction"},
    {"key": "got_heart", "tokens": 75,  "action": "They Got Heart",  "emoji": "🫀",  "tier": "silver",   "category": "reaction"},
    # Commands
    {"key": "pop_jab",   "tokens": 100, "action": "Pop the Jab",    "emoji": "👊",  "tier": "silver",   "category": "command"},
    {"key": "hands_up",  "tokens": 100, "action": "Hands Up",        "emoji": "🙌",  "tier": "silver",   "category": "command"},
    {"key": "body",      "tokens": 150, "action": "Work the Body",   "emoji": "🥊",  "tier": "silver",   "category": "command"},
    {"key": "towel",     "tokens": 200, "action": "Throw the Towel", "emoji": "🏳️", "tier": "gold",     "category": "command"},
    # Status
    {"key": "champ",     "tokens": 300, "action": "Champ",           "emoji": "🏆",  "tier": "gold",     "category": "status"},
    {"key": "goat",      "tokens": 500, "action": "GOAT Status",     "emoji": "🐐",  "tier": "platinum", "category": "status"},
    # Combos
    {"key": "combo_11",  "tokens": 75,  "action": "1-1 Combo",       "emoji": "👊",  "tier": "silver",   "category": "combo",
     "combo_sequence": ["👊", "👊"], "combo_label": "1-1"},
    {"key": "combo_12",  "tokens": 100, "action": "1-2 Combo",       "emoji": "👊",  "tier": "silver",   "category": "combo",
     "combo_sequence": ["👊", "🤜"], "combo_label": "1-2"},
    {"key": "combo_123", "tokens": 150, "action": "1-2-3 Combo",     "emoji": "👊",  "tier": "gold",     "category": "combo",
     "combo_sequence": ["👊", "🤜", "👊"], "combo_label": "1-2-3"},
]
GIFT_SUB_TIERS = {1: 4.99, 5: 19.99, 10: 34.99, 50: 149.99}
AD_PACKAGES = {
    "starter":  {"days": 7,  "price": 49.00,  "label": "Starter",  "description": "7-day run · reach up to 2,000 live viewers"},
    "pro":      {"days": 30, "price": 149.00, "label": "Pro",      "description": "30-day run · reach up to 10,000 live viewers"},
    "champion": {"days": 90, "price": 349.00, "label": "Champion", "description": "90-day run · maximum exposure · best value"},
}
LIVEPEER_BASE_URL = "https://livepeer.studio/api"

_rate_buckets: Dict[str, list] = {}

def _rate_limited(key: str, max_calls: int = 10, window: float = 60.0) -> bool:
    now = time.time()
    bucket = _rate_buckets.get(key, [])
    _rate_buckets[key] = [t for t in bucket if now - t < window]
    if len(_rate_buckets[key]) >= max_calls:
        return True
    _rate_buckets[key].append(now)
    return False

async def is_content_flagged(text: str) -> bool:
    """Checks free-text user input (captions, comments, chat, display names, AI
    image prompts) against OpenAI's moderation endpoint before it's stored or
    shown to other users. Fails open (allows content through) if the key is
    missing or the call errors — the report/auto-hide system is the second
    line of defense, so a moderation-API outage doesn't take down posting."""
    if not text or not text.strip() or not OPENAI_API_KEY:
        return False
    async def check() -> bool:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.post(
                "https://api.openai.com/v1/moderations",
                headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},
                json={"input": text},
            )
            resp.raise_for_status()
            return bool(resp.json()["results"][0]["flagged"])
    # During an outage the breaker fails open at once instead of every post waiting 5s.
    try:
        return await MODERATION_BREAKER.call(check)
    except CircuitOpen:
        return False
    except Exception as e:
        logger.error(f"Moderation check failed: {e}")
        return False

# ElevenLabs TTS Settings
ELEVENLABS_API_KEY = os.environ.get('ELEVENLABS_API_KEY', '')
ELEVENLABS_VOICE_ID = os.environ.get('ELEVENLABS_VOICE_ID', 'EXAVITQu4vr4xnSDxMaL')

# Cloudinary Settings
cloudinary.config(
    cloud_name=os.environ.get("CLOUDINARY_CLOUD_NAME", ""),
    api_key=os.environ.get("CLOUDINARY_API_KEY", ""),
    api_secret=os.environ.get("CLOUDINARY_API_SECRET", ""),
    secure=True
)

# Subscription Plans
# Must match the Victory AI Pro prices in the Stripe product catalogue (GBP). When the
# catalogue's Price IDs are set, checkout charges those Prices directly instead.
PLAN_CURRENCY = "gbp"
SUBSCRIPTION_PLANS = {
    "monthly": {"price": 3.99, "name": "Monthly", "interval": "month",
                "stripe_price_id": os.environ.get("STRIPE_PRICE_MONTHLY", "")},
    "annual": {"price": 24.99, "name": "Annual", "interval": "year", "savings": "Save 48%",
               "stripe_price_id": os.environ.get("STRIPE_PRICE_ANNUAL", "")},
}
FOUNDER_SPOTS_LIMIT = int(os.environ.get("FOUNDER_SPOTS_LIMIT", "1000"))

# Create the main app
app = FastAPI(title="Victory AI API")
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ============== MODELS ==============

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserUpdate(BaseModel):
    name: Optional[str] = None
    experience_level: Optional[str] = None
    primary_goal: Optional[str] = None

class OnboardingAnswers(BaseModel):
    birth_date: str  # ISO date "YYYY-MM-DD"
    biggest_frustration: str
    experience_level: str
    favorite_counter: str
    boxing_stance: Optional[str] = None
    training_partner_style: Optional[str] = None
    favorite_fighter: Optional[str] = None

class TrainingPartnerCreate(BaseModel):
    name: str
    style: str
    focus_areas: List[str]
    accountability_level: str

class ContactMatchRequest(BaseModel):
    # Client-side SHA-256 hashes of selected contacts' emails — never raw emails/names.
    # See _email_hash() for why this can't be salted per-user.
    email_hashes: List[str] = Field(..., max_length=500)

class CheckoutRequest(BaseModel):
    plan_id: str
    origin_url: str

class TipRequest(BaseModel):
    amount: int
    message: str = ""
    action_key: str = ""  # frontend sends the selected punch key for exact lookup

class AdCampaignRequest(BaseModel):
    brand_name: str
    tagline: str
    website_url: str
    advertiser_email: str
    package_id: str  # starter | pro | champion
    origin_url: str

class GiftSubRequest(BaseModel):
    count: int = 1
    recipient_user_id: Optional[str] = None
    origin_url: str = ""

class DimensionScoreInput(BaseModel):
    dimension_name: str
    score: Optional[int] = None

class TrainingSessionCreate(BaseModel):
    round_duration: int = 180
    rest_duration: int = 60
    total_rounds: int = 3
    record_video: bool = True
    entry_source: Optional[str] = Field(None, max_length=20)
    entry_age_minutes: Optional[int] = Field(None, ge=0)


# A push only gets credit for a session started within this long of tapping it; after
# that the fighter chose to train on their own.
TRIGGER_ATTRIBUTION_MINUTES = 60


def session_trigger(entry_source: Optional[str], entry_age_minutes: Optional[int]) -> str:
    src = _PUSH_KIND_RE.sub("", (entry_source or "").lower())[:20]
    if not src or src == "direct":
        return "direct"
    if entry_age_minutes is not None and entry_age_minutes > TRIGGER_ATTRIBUTION_MINUTES:
        return "direct"
    return src

class RoundVideoUpload(BaseModel):
    session_id: str
    round_number: int
    video_url: str
    public_id: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

# ============== TRAINING PARTNER STYLES ==============

TRAINING_PARTNER_STYLES = {
    "tough_love": {
        "name": "Tough Love Coach",
        "personality": "Direct, no-nonsense, pushes you hard but celebrates your wins. Won't let you make excuses.",
        # First-person, in-character intro — shown once, at the moment the fighter names
        # their partner. First-person narration is what the experience-taking research
        # this line is designed around actually measures, so it's written as the partner
        # speaking, not a third-person style blurb like `personality` above.
        "intro_line": "I don't do easy — I've turned excuses into podium finishes for a decade, and yours are next.",
        "feedback_tone": "direct",
        "phrases": ["No excuses!", "You've got more in the tank!", "That's the stuff!", "Again!", "I know you've got more in there."]
    },
    "supportive_mentor": {
        "name": "Supportive Mentor",
        "personality": "Encouraging, patient, builds you up. Focuses on progress over perfection.",
        "intro_line": "I remember what it's like to feel behind. I'm here for every rep of your progress, not just your best days.",
        "feedback_tone": "encouraging",
        "phrases": ["You're getting better every day!", "Progress, not perfection!", "I see you improving!", "Keep it up!", "I'm proud of how far you've come."]
    },
    "analytical_technician": {
        "name": "Technical Analyst",
        "personality": "Detailed, precise, loves the science of boxing. Breaks down every movement.",
        "intro_line": "I see boxing as physics in motion — angles, timing, leverage. Show me your jab and I'll show you what it's really doing.",
        "feedback_tone": "analytical",
        "phrases": ["Let's analyze that.", "The data shows...", "Technically speaking...", "Notice the angle here.", "I'm seeing real improvement in your data."]
    },
    "hype_man": {
        "name": "Hype Man",
        "personality": "Energetic, motivational, makes every session feel like fight night.",
        "intro_line": "I bring the energy of fight night to every single round — because that's exactly how hard you're about to work.",
        "feedback_tone": "hype",
        "phrases": ["LET'S GO!", "You're a BEAST!", "THAT'S MY FIGHTER!", "FIRE!", "I love this energy from you!"]
    },
    "old_school_trainer": {
        "name": "Old School Trainer",
        "personality": "Wise, experienced, shares stories from the greats. Classic boxing wisdom.",
        "intro_line": "I've spent my life in gyms that smell like leather and sweat, learning from trainers who learned from the greats. Let me pass some of that down to you.",
        "feedback_tone": "wise",
        "phrases": ["In my day...", "The greats always...", "Boxing is an art.", "Patience, young fighter.", "I've trained a lot of fighters, and you've got something."]
    }
}

# ============== TESTIMONIALS & SOCIAL PROOF ==============

TESTIMONIALS = [
    {
        "name": "Marcus T.",
        "text": "I no longer get beat up in sparring. I can finally roll with punches thanks to the constant reminders my AI training partner gives me.",
        "improvement": "Head movement +40%"
    },
    {
        "name": "Sarah K.",
        "text": "My coach asked what I've been doing differently. It's Victory AI. The accountability is real - my partner won't let me skip technique drills.",
        "improvement": "Consistency up 3x"
    },
    {
        "name": "James L.",
        "text": "Finally fixed my habit of dropping my right hand. My training partner caught it every single round until it stuck.",
        "improvement": "Guard position +55%"
    },
    {
        "name": "Ana M.",
        "text": "The personalized feedback during rest periods changed everything. It's like having a coach in my pocket.",
        "improvement": "Overall score +2.3"
    }
]

SOCIAL_PROOF_STATS = {
    "rounds_recorded": "50,000+",
    "techniques_improved": "127,000+",
    "avg_improvement": "34%",
    "active_fighters": "8,500+"
}

# ============== DIMENSIONS & DRILLS ==============

DIMENSIONS = [
    "Jab", "Cross", "Left Hook", "Right Hook", "Uppercut",
    "Guard Position", "Head Movement", "Footwork", "Slip", "Roll",
    "Parry", "Body Movement", "Combination Flow", "Ring Generalship",
    "Punch Balance", "Punch Accuracy"
]

DRILLS = {
    "Jab": {"name": "The 1-1-1 Drill", "description": "3 jabs in 10 seconds, focusing on full extension and guard return. 4 sets."},
    "Cross": {"name": "Hip Rotation Shadow", "description": "Throw a cross in slow motion focusing only on hip turn. 3 sets of 20 reps."},
    "Left Hook": {"name": "Mirror Elbow Check", "description": "Throw hooks facing a mirror, elbow must stay at 90 degrees. 3 sets."},
    "Right Hook": {"name": "Short Hook Wall Drill", "description": "Stand 6 inches from a wall, throw right hooks without hitting it."},
    "Uppercut": {"name": "Uppercut Dip Drill", "description": "Consciously bend knees before each uppercut. 4 sets of 20."},
    "Guard Position": {"name": "Hands-Up Shadowboxing", "description": "3 rounds resetting guard after every punch."},
    "Head Movement": {"name": "Slip Rope Drill", "description": "Tie a rope at nose height, slip to each side repeatedly."},
    "Slip": {"name": "Partner Jab Slip", "description": "Slip outside every jab. Or use a slip bag."},
    "Roll": {"name": "Roll Under the Hook", "description": "Roll shoulder-to-shoulder under an object. 50 reps."},
    "Parry": {"name": "Soft Jab Parry Drill", "description": "Redirect jabs with open palm only. No blocking."},
    "Body Movement": {"name": "Exit Angle Drill", "description": "Pivot 45 degrees after every combination."},
    "Footwork": {"name": "Box Step Pattern", "description": "Square footwork pattern for 3 minutes without crossing feet."},
    "Combination Flow": {"name": "3-Punch Pause Drill", "description": "1-2-3 with a pause after each punch to check balance."},
    "Ring Generalship": {"name": "Wall Drill", "description": "Cut off the ring against a wall, pivoting to corner opponent."},
    "Punch Balance": {"name": "Combination and Freeze", "description": "4-punch combo then freeze. Check: are you in stance?"},
    "Punch Accuracy": {"name": "Slip Bag Accuracy", "description": "Tape an X on a slip bag and aim every punch at it."}
}

LEGENDS = [
    {"name": "Muhammad Ali", "nickname": "The Greatest", "era": "1960s-1980s", "dimensions": ["Footwork", "Body Movement", "Ring Generalship"], "description": "Ali's perpetual motion created angles his opponents couldn't solve.", "youtube_search": "Muhammad Ali footwork technique breakdown"},
    {"name": "Mike Tyson", "nickname": "Iron Mike", "era": "1980s-2000s", "dimensions": ["Head Movement", "Roll", "Body Movement", "Combination Flow"], "description": "Tyson's peek-a-boo style required constant rolling movement.", "youtube_search": "Mike Tyson peek-a-boo style technique"},
    {"name": "Floyd Mayweather Jr.", "nickname": "Money", "era": "1990s-2010s", "dimensions": ["Parry", "Guard Position", "Slip", "Ring Generalship"], "description": "Mayweather's shoulder roll defence turns opponent power into wasted energy.", "youtube_search": "Floyd Mayweather shoulder roll defense"},
    {"name": "Sugar Ray Leonard", "nickname": "Sugar Ray", "era": "1970s-1990s", "dimensions": ["Combination Flow", "Footwork", "Ring Generalship"], "description": "Leonard combined hand speed with constant lateral movement.", "youtube_search": "Sugar Ray Leonard combinations technique"},
    {"name": "Pernell Whitaker", "nickname": "Sweet Pea", "era": "1980s-2000s", "dimensions": ["Slip", "Head Movement", "Roll", "Body Movement"], "description": "The most elusive defensive master in boxing history.", "youtube_search": "Pernell Whitaker defense technique"},
    {"name": "Manny Pacquiao", "nickname": "Pac-Man", "era": "1990s-2020s", "dimensions": ["Footwork", "Left Hook", "Combination Flow", "Punch Balance"], "description": "Pacquiao's southpaw angles created openings orthodox fighters never saw.", "youtube_search": "Manny Pacquiao southpaw technique"},
    {"name": "Joe Frazier", "nickname": "Smokin' Joe", "era": "1960s-1980s", "dimensions": ["Head Movement", "Roll", "Combination Flow", "Body Movement"], "description": "Frazier's constant forward pressure came from disciplined head movement.", "youtube_search": "Joe Frazier bob and weave technique"},
    {"name": "Roy Jones Jr.", "nickname": "RJJ", "era": "1980s-2010s", "dimensions": ["Punch Accuracy", "Combination Flow", "Footwork", "Guard Position"], "description": "Jones proved unorthodox guard can work if movement and reflexes compensate.", "youtube_search": "Roy Jones Jr technique breakdown"}
]

# ============== AUTH HELPERS ==============

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

async def _is_blocked(user_a: str, user_b: str) -> bool:
    """True if either user has blocked the other — blocking is always mutual in effect."""
    return await db.blocks.find_one({
        "$or": [
            {"blocker_id": user_a, "blocked_id": user_b},
            {"blocker_id": user_b, "blocked_id": user_a},
        ]
    }) is not None

async def _blocked_either_way(user_id: str) -> set:
    """All user_ids blocking or blocked by `user_id` — for filtering someone out of
    another user's search/discover/contact-match results."""
    docs = await db.blocks.find(
        {"$or": [{"blocker_id": user_id}, {"blocked_id": user_id}]},
        {"blocker_id": 1, "blocked_id": 1},
    ).to_list(None)
    return {d["blocked_id"] if d["blocker_id"] == user_id else d["blocker_id"] for d in docs}

def _email_hash(email: str) -> str:
    # Deterministic, unsalted SHA-256 — this MUST match the hash the client computes
    # from a device contact's email before contact-sync matching can work at all, so
    # it can't use bcrypt/a per-user salt. Known, accepted limitation of hashed-contact
    # matching (same approach WhatsApp/Signal use): an attacker who already suspects a
    # specific email belongs to a user can confirm it by hashing that one guess and
    # calling /contacts/find-matches — rate-limited below to make that impractical at
    # scale, not eliminated. This is why raw contacts are never uploaded or stored.
    return hashlib.sha256(email.strip().lower().encode()).hexdigest()

def create_jwt_token(user_id: str) -> str:
    payload = {"user_id": user_id, "exp": datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRATION_DAYS), "iat": datetime.now(timezone.utc)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_jwt_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except Exception:
        return None

async def verify_clerk_token(token: str) -> Optional[str]:
    """Verify a Clerk JWT and return the Clerk user ID (sub claim)."""
    global _clerk_jwks_cache
    try:
        from jose import jwt as jose_jwt
        now = time.time()
        if now - _clerk_jwks_cache.get("fetched_at", 0) > 3600:
            try:
                async with httpx.AsyncClient() as client:
                    resp = await CLERK_API_BREAKER.call(lambda: client.get(CLERK_JWKS_URL, timeout=5))
                    resp.raise_for_status()
                    _clerk_jwks_cache = {**resp.json(), "fetched_at": now}
            except Exception as e:
                if not _clerk_jwks_cache.get("keys"):
                    raise
                # Clerk's signing keys rarely change: a failed refresh keeps the last good set
                # (retry in 5 min) rather than logging every user out.
                logger.warning(f"Clerk JWKS refresh failed, using cached keys: {e}")
                _clerk_jwks_cache["fetched_at"] = now - 3300
        header = jose_jwt.get_unverified_header(token)
        kid = header.get("kid")
        key = next((k for k in _clerk_jwks_cache.get("keys", []) if k.get("kid") == kid), None)
        if not key:
            return None
        payload = jose_jwt.decode(token, key, algorithms=["RS256"], options={"verify_aud": False})
        return payload.get("sub")
    except Exception as e:
        logger.error(f"Clerk token verification error: {e}")
        return None

async def get_or_create_clerk_user(clerk_user_id: str) -> dict:
    """Look up MongoDB user by Clerk ID, creating one on first login."""
    user = await db.users.find_one({"user_id": clerk_user_id}, {"_id": 0, "password": 0})
    if user:
        # Self-healing backfill: contact-sync matching needs email_hash, but it didn't
        # exist before that feature shipped — set it the first time an existing user is
        # ever looked up again, instead of a one-off migration script.
        if user.get("email") and not user.get("email_hash"):
            user["email_hash"] = _email_hash(user["email"])
            await db.users.update_one({"user_id": clerk_user_id}, {"$set": {"email_hash": user["email_hash"]}})
        return user
    email, name, picture = "", "", ""
    try:
        async with httpx.AsyncClient() as client:
            resp = await CLERK_API_BREAKER.call(lambda: client.get(
                f"https://api.clerk.com/v1/users/{clerk_user_id}",
                headers={"Authorization": f"Bearer {CLERK_SECRET_KEY}"},
                timeout=5
            ))
            if resp.status_code == 200:
                data = resp.json()
                emails = data.get("email_addresses", [])
                email = emails[0]["email_address"] if emails else ""
                name = f"{data.get('first_name', '')} {data.get('last_name', '')}".strip() or email
                picture = data.get("image_url", "")
    except Exception as e:
        logger.error(f"Failed to fetch Clerk user details: {e}")
    user_doc = {
        "user_id": clerk_user_id, "email": email, "name": name, "picture": picture,
        "email_hash": _email_hash(email) if email else None,
        "experience_level": "beginner", "primary_goal": "",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "onboarding_completed": False, "training_partner": None, "onboarding_answers": None
    }
    await db.users.insert_one(user_doc)
    return user_doc

async def get_current_user(request: Request) -> dict:
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
        # Try Clerk verification first
        clerk_user_id = await verify_clerk_token(token)
        if clerk_user_id:
            return await get_or_create_clerk_user(clerk_user_id)
        # Fallback: legacy JWT
        payload = decode_jwt_token(token)
        if payload:
            user = await db.users.find_one({"user_id": payload["user_id"]}, {"_id": 0, "password": 0})
            if user:
                return user

    # Fallback: legacy session cookie
    session_token = request.cookies.get("session_token")
    if session_token:
        session_doc = await db.user_sessions.find_one({"session_token": session_token}, {"_id": 0})
        if session_doc:
            expires_at = session_doc.get("expires_at")
            if isinstance(expires_at, str):
                expires_at = datetime.fromisoformat(expires_at)
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            if expires_at >= datetime.now(timezone.utc):
                user = await db.users.find_one({"user_id": session_doc["user_id"]}, {"_id": 0, "password": 0})
                if user:
                    return user
        payload = decode_jwt_token(session_token)
        if payload:
            user = await db.users.find_one({"user_id": payload["user_id"]}, {"_id": 0, "password": 0})
            if user:
                return user

    raise HTTPException(status_code=401, detail="Not authenticated")

async def get_current_user_with_subscription(request: Request) -> dict:
    user = await get_current_user(request)
    subscription = await db.subscriptions.find_one({"user_id": user["user_id"], "status": {"$in": ["active", "trialing"]}}, {"_id": 0})
    user["has_subscription"] = subscription is not None
    user["subscription_status"] = subscription.get("status") if subscription else None
    return user

# ============== AUTH ENDPOINTS ==============

@api_router.post("/auth/register", response_model=TokenResponse)
async def register(request: Request, user_data: UserCreate, response: Response):
    client_ip = request.client.host if request.client else "unknown"
    if _rate_limited(f"register:{client_ip}", 5, 60):
        raise HTTPException(429, "Too many registration attempts — try again in a minute")
    existing = await db.users.find_one({"email": user_data.email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    user_doc = {
        "user_id": user_id, "email": user_data.email, "password": hash_password(user_data.password),
        "name": user_data.name, "experience_level": "beginner", "primary_goal": "",
        "created_at": datetime.now(timezone.utc).isoformat(), "picture": None,
        "onboarding_completed": False, "training_partner": None, "onboarding_answers": None
    }
    await db.users.insert_one(user_doc)
    token = create_jwt_token(user_id)
    response.set_cookie(key="session_token", value=token, httponly=True, secure=True, samesite="none", path="/", max_age=JWT_EXPIRATION_DAYS * 24 * 60 * 60)
    return TokenResponse(access_token=token)

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(request: Request, user_data: UserLogin, response: Response):
    client_ip = request.client.host if request.client else "unknown"
    if _rate_limited(f"login:{client_ip}", 10, 60):
        raise HTTPException(429, "Too many login attempts — try again in a minute")
    user = await db.users.find_one({"email": user_data.email}, {"_id": 0})
    if not user or not verify_password(user_data.password, user.get("password", "")):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_jwt_token(user["user_id"])
    response.set_cookie(key="session_token", value=token, httponly=True, secure=True, samesite="none", path="/", max_age=JWT_EXPIRATION_DAYS * 24 * 60 * 60)
    return TokenResponse(access_token=token)

@api_router.get("/auth/me")
async def get_me(user: dict = Depends(get_current_user_with_subscription)):
    if isinstance(user.get("created_at"), datetime):
        user["created_at"] = user["created_at"].isoformat()
    # Real "the app was actually opened" signal — this endpoint is hit on every app
    # load. The win-back campaign's "3+ days quiet" check reads this field, so it has
    # to reflect genuine usage, not a guess.
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"last_active_at": datetime.now(timezone.utc).isoformat()}})
    if FEATUREBASE_JWT_SECRET:
        # Short-lived proof of identity for the Featurebase widget — minted fresh on
        # every /auth/me call rather than cached, so it can't outlive the session it
        # was issued for by much.
        user["featurebaseJwt"] = jwt.encode(
            {
                "userId": user["user_id"],
                "email": user.get("email", ""),
                "name": user.get("display_name") or user.get("name", "Fighter"),
                "exp": datetime.now(timezone.utc) + timedelta(hours=24),
            },
            FEATUREBASE_JWT_SECRET,
            algorithm="HS256",
        )
    return user

@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    session_token = request.cookies.get("session_token")
    if session_token:
        await db.user_sessions.delete_many({"session_token": session_token})
    response.delete_cookie(key="session_token", path="/")
    return {"message": "Logged out successfully"}

# ============== ONBOARDING ENDPOINTS ==============

@api_router.get("/onboarding/social-proof")
async def get_social_proof():
    return {"stats": SOCIAL_PROOF_STATS, "testimonials": TESTIMONIALS}

@api_router.get("/onboarding/partner-styles")
async def get_partner_styles():
    return {"styles": TRAINING_PARTNER_STYLES}

def _age_years(birth_date: date) -> int:
    today = date.today()
    return today.year - birth_date.year - ((today.month, today.day) < (birth_date.month, birth_date.day))

@api_router.post("/onboarding/submit")
async def submit_onboarding(answers: OnboardingAnswers, user: dict = Depends(get_current_user)):
    try:
        birth_date = date.fromisoformat(answers.birth_date)
    except ValueError:
        raise HTTPException(400, "Invalid birth_date")
    # GDPR Art. 8 minimum digital-consent age floor across all EU/UK member states is 13.
    if _age_years(birth_date) < 13:
        raise HTTPException(403, "You must be at least 13 years old to use Victory AI")

    # Generate personalized affirmation based on answers
    affirmations = {
        "counter_goal": f"Landing double the amount of your favorite {answers.favorite_counter} is a realistic target within 8 weeks.",
        "frustration_solution": f"We hear you on '{answers.biggest_frustration}'. That's exactly what your training partner will focus on.",
        "consistency": "Initial results are slow but momentum builds. Most fighters see real changes after 2-3 weeks of consistent feedback."
    }
    
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {
            "onboarding_answers": answers.model_dump(),
            "birth_date": answers.birth_date,
            "experience_level": answers.experience_level,
            "primary_goal": answers.biggest_frustration,
            "personalized_affirmations": affirmations
        }}
    )
    return {"message": "Onboarding answers saved", "affirmations": affirmations}

@api_router.post("/onboarding/create-partner")
async def create_training_partner(partner_data: TrainingPartnerCreate, user: dict = Depends(get_current_user)):
    if await is_content_flagged(partner_data.name):
        raise HTTPException(400, "Training partner name violates community guidelines")
    style_info = TRAINING_PARTNER_STYLES.get(partner_data.style, TRAINING_PARTNER_STYLES["supportive_mentor"])

    partner_id = f"partner_{uuid.uuid4().hex[:12]}"
    training_partner = {
        "partner_id": partner_id,
        "name": partner_data.name,
        "style": partner_data.style,
        "style_name": style_info["name"],
        "personality": style_info["personality"],
        "intro_line": style_info.get("intro_line", ""),
        "feedback_tone": style_info["feedback_tone"],
        "phrases": style_info["phrases"],
        "focus_areas": partner_data.focus_areas,
        "accountability_level": partner_data.accountability_level,
        "avatar_url": None,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"training_partner": training_partner, "onboarding_completed": True}})
    return training_partner

@api_router.post("/onboarding/generate-avatar")
async def generate_partner_avatar(request: Request, user: dict = Depends(get_current_user)):
    if _rate_limited(f"avatar_generate:{user['user_id']}", 10, 60):
        raise HTTPException(429, "Too many requests — try again in a minute")
    training_partner = user.get("training_partner")
    if not training_partner:
        raise HTTPException(status_code=400, detail="Create a training partner first")

    body = await request.json()
    favorite_fighter = body.get("favorite_fighter", "")
    if await is_content_flagged(favorite_fighter):
        raise HTTPException(400, "That input violates community guidelines")

    style_info = TRAINING_PARTNER_STYLES.get(training_partner["style"], {})

    if favorite_fighter:
        prompt = f"A boxing trainer avatar inspired by {favorite_fighter} fighting style and presence, stylized digital art portrait, athletic confident pose, dark background with electric lime green accents, original character not real person, professional boxing coach aesthetic, high quality"
    else:
        prompt = f"A boxing trainer avatar, {style_info.get('name', 'coach')} personality, stylized digital art, dark background with electric lime accents, professional boxing aesthetic"

    import urllib.parse
    encoded_prompt = urllib.parse.quote(prompt)
    avatar_url = f"https://image.pollinations.ai/prompt/{encoded_prompt}?width=512&height=512&nologo=true&seed={training_partner['partner_id']}"

    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"training_partner.avatar_url": avatar_url}})
    return {"avatar_url": avatar_url}

@api_router.post("/training-partner/regenerate-avatar")
async def regenerate_partner_avatar_appearance(request: Request, user: dict = Depends(get_current_user)):
    if _rate_limited(f"avatar_generate:{user['user_id']}", 10, 60):
        raise HTTPException(429, "Too many requests — try again in a minute")
    training_partner = user.get("training_partner")
    if not training_partner:
        raise HTTPException(status_code=400, detail="No training partner found")

    body = await request.json()
    gender = body.get("gender", "male")
    skin_tone = body.get("skin_tone", "medium")

    gender_desc = {
        "male":       "male boxer",
        "female":     "female boxer",
        "non-binary": "androgynous boxer",
    }.get(gender, "boxer")

    skin_desc = {
        "light":        "fair light skin",
        "medium-light": "light brown skin",
        "medium":       "medium brown skin",
        "medium-dark":  "dark brown skin",
        "dark":         "deep dark skin",
    }.get(skin_tone, "medium brown skin")

    style_info = TRAINING_PARTNER_STYLES.get(training_partner["style"], {})
    style_name = style_info.get("name", "coach")

    prompt = (
        f"A {gender_desc} boxing trainer avatar, {skin_desc}, {style_name} personality, "
        "stylized digital art portrait, athletic confident pose, dark background with "
        "electric lime green accents, original character, professional boxing aesthetic, high quality"
    )

    import urllib.parse
    seed = abs(hash(f"{user['user_id']}{gender}{skin_tone}")) % 99999
    encoded_prompt = urllib.parse.quote(prompt)
    avatar_url = f"https://image.pollinations.ai/prompt/{encoded_prompt}?width=512&height=512&nologo=true&seed={seed}"

    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {
            "training_partner.avatar_url":          avatar_url,
            "training_partner.appearance_gender":   gender,
            "training_partner.appearance_skin_tone": skin_tone,
        }}
    )
    return {"avatar_url": avatar_url}

# ============== CLOUDINARY VIDEO UPLOAD ==============

@api_router.get("/cloudinary/signature")
async def generate_cloudinary_signature(
    resource_type: str = Query("video", enum=["image", "video"]),
    folder: str = Query("victory_rounds"),
    user: dict = Depends(get_current_user)
):
    if _rate_limited(f"cloudinary_sig:{user['user_id']}", 20, 60):
        raise HTTPException(429, "Too many upload requests — slow down")
    if not os.environ.get("CLOUDINARY_API_SECRET"):
        raise HTTPException(status_code=500, detail="Cloudinary not configured")
    
    timestamp = int(time.time())
    # resource_type must NOT be included in the signature per Cloudinary docs
    params = {"timestamp": timestamp, "folder": f"{folder}/{user['user_id']}"}
    signature = cloudinary.utils.api_sign_request(params, os.environ.get("CLOUDINARY_API_SECRET"))
    
    return {
        "signature": signature,
        "timestamp": timestamp,
        "cloud_name": os.environ.get("CLOUDINARY_CLOUD_NAME"),
        "api_key": os.environ.get("CLOUDINARY_API_KEY"),
        "folder": f"{folder}/{user['user_id']}",
        "resource_type": resource_type
    }

@api_router.post("/videos/register")
async def register_uploaded_video(video_data: RoundVideoUpload, user: dict = Depends(get_current_user)):
    if not video_data.video_url.startswith("https://res.cloudinary.com/"):
        raise HTTPException(400, "video_url must be a Cloudinary URL")
    video_doc = {
        "video_id": f"vid_{uuid.uuid4().hex[:12]}",
        "user_id": user["user_id"],
        "session_id": video_data.session_id,
        "round_number": video_data.round_number,
        "video_url": video_data.video_url,
        "public_id": video_data.public_id,
        "analyzed": False,
        "analysis_results": None,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.round_videos.insert_one(video_doc)
    return {"video_id": video_doc["video_id"], "message": "Video registered"}

async def check_and_consume_ai_tokens(user: dict, feature: str) -> dict:
    """Deduct tokens for a free-tier user. Subscribed users are always allowed."""
    if user.get("has_subscription"):
        return {"allowed": True, "tokens_remaining": -1}
    cost = AI_TOKEN_COSTS.get(feature, 1_000)
    current_month = datetime.now(timezone.utc).strftime("%Y-%m")
    user_id = user["user_id"]
    # Reset the counter atomically when the month rolls over.
    if user.get("ai_tokens_month") != current_month:
        await db.users.update_one(
            {"user_id": user_id, "ai_tokens_month": {"$ne": current_month}},
            {"$set": {"ai_tokens_used": 0, "ai_tokens_month": current_month}},
        )
    # Reserve the cost atomically: only succeeds if enough budget remains this month.
    reserved = await db.users.update_one(
        {"user_id": user_id, "ai_tokens_month": current_month,
         "ai_tokens_used": {"$lte": FREE_MONTHLY_AI_TOKENS - cost}},
        {"$inc": {"ai_tokens_used": cost}},
    )
    if reserved.matched_count == 0:
        fresh = await db.users.find_one({"user_id": user_id}, {"ai_tokens_used": 1})
        used = (fresh or {}).get("ai_tokens_used", 0)
        return {"allowed": False, "tokens_remaining": max(0, FREE_MONTHLY_AI_TOKENS - used)}
    fresh = await db.users.find_one({"user_id": user_id}, {"ai_tokens_used": 1})
    used = (fresh or {}).get("ai_tokens_used", cost)
    return {"allowed": True, "tokens_remaining": max(0, FREE_MONTHLY_AI_TOKENS - used)}


async def refund_ai_tokens(user: dict, feature: str):
    if user.get("has_subscription"):
        return
    await db.users.update_one(
        {"user_id": user["user_id"], "ai_tokens_used": {"$gte": AI_TOKEN_COSTS.get(feature, 1_000)}},
        {"$inc": {"ai_tokens_used": -AI_TOKEN_COSTS.get(feature, 1_000)}},
    )


@api_router.get("/usage")
async def get_ai_usage(user: dict = Depends(get_current_user)):
    if user.get("has_subscription"):
        return {"plan": "pro", "unlimited": True, "tokens_used": 0, "tokens_remaining": None, "monthly_limit": None}
    current_month = datetime.now(timezone.utc).strftime("%Y-%m")
    tokens_used = user.get("ai_tokens_used", 0) if user.get("ai_tokens_month") == current_month else 0
    return {
        "plan": "free",
        "unlimited": False,
        "tokens_used": tokens_used,
        "tokens_remaining": max(0, FREE_MONTHLY_AI_TOKENS - tokens_used),
        "monthly_limit": FREE_MONTHLY_AI_TOKENS,
        "costs": AI_TOKEN_COSTS,
    }


# ============== VIDEO ANALYSIS (GEMINI) ==============
# Scores come from the model watching the whole round — motion, rhythm, guard recovery
# between punches — not from a few still frames, which can't show a punch at all.

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_VIDEO_MODEL = os.environ.get("GEMINI_VIDEO_MODEL", "gemini-2.5-flash")
GEMINI_VIDEO_FALLBACK_MODEL = "gemini-flash-latest"
GEMINI_VIDEO_FPS = float(os.environ.get("GEMINI_VIDEO_FPS", "4"))
GEMINI_MEDIA_RESOLUTION = os.environ.get("GEMINI_MEDIA_RESOLUTION", "low").upper()
VIDEO_ANALYSIS_MAX_SECONDS = 300
GEMINI_INLINE_MAX_BYTES = 15 * 1024 * 1024

_genai_client = None


def _gemini():
    global _genai_client
    if _genai_client is None:
        from google import genai
        _genai_client = genai.Client(api_key=GEMINI_API_KEY)
    return _genai_client


class _DimensionScore(BaseModel):
    dimension_name: Literal[tuple(DIMENSIONS)]
    score: Optional[int] = Field(None, description="1-10, or null if not clearly seen at least twice")
    evidence: str = Field(description="Timestamp (m:ss) and what was seen, e.g. '0:42 jab lands, right hand drops'")


class _RoundAnalysis(BaseModel):
    boxer_visible: bool
    dimension_scores: List[_DimensionScore]
    what_did_well: str
    what_to_improve: str


def analysis_video_url(public_id: str) -> str:
    url, _ = cloudinary.utils.cloudinary_url(
        public_id, resource_type="video", format="mp4", secure=True,
        transformation=[{"width": 640, "height": 640, "crop": "limit", "quality": "auto:low",
                         "video_codec": "h264"}],
    )
    return url


def video_analysis_prompt(round_number: int, partner_name: str, tone: str, focus_areas: List[str]) -> str:
    return (
        f"You are {partner_name}, a boxing coach with a {tone} style, watching round {round_number} of a "
        "fighter's solo training (shadowboxing, bag or pads). Watch the whole video.\n"
        "Score each skill 1-10 only from what you actually see:\n"
        "1-3: the technique breaks down on most attempts.\n"
        "4-6: correct shape most of the time, with a fault that keeps recurring.\n"
        "7-8: consistent, small faults only under fatigue or in combinations.\n"
        "9-10: competitive-amateur standard on nearly every attempt. Rare.\n"
        "If a skill isn't clearly shown at least twice (no uppercuts thrown, no partner to slip or parry, "
        "the fighter out of frame), its score MUST be null. A missing score is honest; a guessed one is not.\n"
        "For every skill, evidence names the timestamp(s) you based it on. "
        "Set boxer_visible false if no one is boxing on camera.\n"
        f"Pay extra attention to: {', '.join(focus_areas) or 'overall technique'}.\n"
        "what_did_well: one specific moment, with its timestamp, and what it says about the fighter they're "
        "becoming, e.g. 'At 0:42 you slipped and came straight back with the jab. That's a counter-puncher's "
        "instinct.' Only praise what you actually saw. what_to_improve: one fix, framed as the next step "
        "rather than a flaw. Speak to the fighter directly, one or two sentences each."
    )


def clean_video_analysis(raw: dict) -> Optional[dict]:
    if not isinstance(raw, dict) or not raw.get("boxer_visible"):
        return None
    scores, seen = [], set()
    for d in raw.get("dimension_scores") or []:
        name = d.get("dimension_name")
        if name not in DIMENSIONS or name in seen:
            continue
        seen.add(name)
        score = d.get("score")
        score = max(1, min(10, int(score))) if isinstance(score, (int, float)) else None
        scores.append({"dimension_name": name, "score": score, "evidence": str(d.get("evidence") or "")[:200]})
    scored = [d for d in scores if d["score"] is not None]
    if not scored:
        return None
    weakest = min(scored, key=lambda d: d["score"])["dimension_name"]
    return {
        "dimension_scores": scores,
        "what_did_well": str(raw.get("what_did_well") or "")[:400],
        "what_to_improve": str(raw.get("what_to_improve") or "")[:400],
        "drill_recommendation": DRILLS.get(weakest, {}),
        "source": "video",
    }


async def _gemini_video_part(video_bytes: bytes):
    from google.genai import types
    meta = types.VideoMetadata(fps=GEMINI_VIDEO_FPS, end_offset=f"{VIDEO_ANALYSIS_MAX_SECONDS}s")
    if len(video_bytes) <= GEMINI_INLINE_MAX_BYTES:
        return types.Part(inline_data=types.Blob(data=video_bytes, mime_type="video/mp4"), video_metadata=meta)
    import io
    client = _gemini()
    f = await client.aio.files.upload(file=io.BytesIO(video_bytes), config=types.UploadFileConfig(mime_type="video/mp4"))
    for _ in range(30):
        if f.state and f.state.name == "ACTIVE":
            break
        if f.state and f.state.name == "FAILED":
            raise ValueError("Gemini could not process the video")
        await asyncio.sleep(2)
        f = await client.aio.files.get(name=f.name)
    return types.Part(file_data=types.FileData(file_uri=f.uri, mime_type="video/mp4"), video_metadata=meta)


async def analyze_round_video(public_id: str, round_number: int, partner_name: str, tone: str,
                              focus_areas: List[str]) -> Optional[dict]:
    from google.genai import types, errors as genai_errors
    async with httpx.AsyncClient(timeout=90, follow_redirects=True) as http_client:
        res = await http_client.get(analysis_video_url(public_id))
    if res.status_code != 200 or not res.content:
        raise ValueError(f"Cloudinary video fetch failed ({res.status_code})")
    video = await _gemini_video_part(res.content)
    config = types.GenerateContentConfig(
        temperature=0,
        response_mime_type="application/json",
        response_schema=_RoundAnalysis,
        media_resolution=getattr(types.MediaResolution, f"MEDIA_RESOLUTION_{GEMINI_MEDIA_RESOLUTION}",
                                 types.MediaResolution.MEDIA_RESOLUTION_LOW),
    )
    contents = [video, video_analysis_prompt(round_number, partner_name, tone, focus_areas)]
    try:
        response = await _gemini().aio.models.generate_content(model=GEMINI_VIDEO_MODEL, contents=contents, config=config)
    except genai_errors.ClientError as e:
        if getattr(e, "code", None) != 404:
            raise
        logger.warning(f"{GEMINI_VIDEO_MODEL} not found — falling back to {GEMINI_VIDEO_FALLBACK_MODEL}")
        response = await _gemini().aio.models.generate_content(model=GEMINI_VIDEO_FALLBACK_MODEL, contents=contents, config=config)
    return clean_video_analysis(json.loads(response.text))


_CLOUDINARY_VIDEO_RE = re.compile(r"^https://res\.cloudinary\.com/([^/]+)/video/upload/(?:v\d+/)?([^?#]+?)\.[A-Za-z0-9]+$")


def cloudinary_video_public_id(url: Optional[str]) -> Optional[str]:
    m = _CLOUDINARY_VIDEO_RE.match(url or "")
    if not m or m.group(1) != os.environ.get("CLOUDINARY_CLOUD_NAME", ""):
        return None
    return m.group(2)


def competition_result(analysis: dict) -> dict:
    scored = [d for d in analysis["dimension_scores"] if d["score"] is not None]
    best = max(scored, key=lambda d: d["score"])
    return {
        "scores": {d["dimension_name"]: d["score"] for d in scored},
        "overall": round(sum(d["score"] for d in scored) / len(scored), 1),
        "feedback": analysis["what_did_well"],
        "highlight": f"{best['dimension_name']} {best['score']}/10 — {best['evidence']}".rstrip(" —"),
        "improve": analysis["what_to_improve"],
        "source": "video",
    }


@api_router.post("/ai/analyze-video")
async def analyze_video_with_vision(request: Request, user: dict = Depends(get_current_user)):
    body = await request.json()
    video_url = body.get("video_url")
    round_number = body.get("round_number", 1)

    if not video_url:
        raise HTTPException(status_code=400, detail="video_url required")
    if not video_url.startswith("https://res.cloudinary.com/"):
        raise HTTPException(status_code=400, detail="video_url must be a Cloudinary URL")

    training_partner = user.get("training_partner", {})
    partner_name = training_partner.get("name", "Coach")
    feedback_tone = training_partner.get("feedback_tone", "encouraging")
    focus_areas = training_partner.get("focus_areas", ["Guard Position", "Head Movement"])

    if not GEMINI_API_KEY:
        return generate_simulated_analysis(round_number, partner_name, focus_areas)

    video_doc = await db.round_videos.find_one({"video_url": video_url, "user_id": user["user_id"]})
    public_id = video_doc.get("public_id") if video_doc else None
    if not public_id:
        return generate_simulated_analysis(round_number, partner_name, focus_areas)

    quota = await check_and_consume_ai_tokens(user, "analyze_video")
    if not quota["allowed"]:
        raise HTTPException(status_code=402, detail="ai_quota_exceeded")

    try:
        analysis = await analyze_round_video(public_id, round_number, partner_name, feedback_tone, focus_areas)
    except Exception as e:
        logger.error(f"Video analysis error: {e}")
        analysis = None
    if not analysis:
        # An unscored round shouldn't cost the fighter anything.
        await refund_ai_tokens(user, "analyze_video")
        return generate_simulated_analysis(round_number, partner_name, focus_areas)

    await db.round_videos.update_one(
        {"video_url": video_url, "user_id": user["user_id"]},
        {"$set": {"analyzed": True, "analysis_results": analysis, "analyzed_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"analysis": analysis, "partner_name": partner_name}

def generate_simulated_analysis(round_number: int, partner_name: str, focus_areas: List[str]) -> dict:
    # Analysis failed or isn't configured. Returning no analysis (rather than invented
    # scores) sends the round down the honest generic-coaching path, and keeps it out of
    # the session score, personal bests and scouting reports.
    return {"analysis": None, "partner_name": partner_name, "unavailable": True}

# ============== AI FEEDBACK ENDPOINTS ==============

@api_router.post("/ai/generate-feedback")
async def generate_round_feedback(request: Request, user: dict = Depends(get_current_user)):
    body = await request.json()
    round_number = body.get("round_number", 1)
    total_rounds = body.get("total_rounds", 3)
    video_analysis = body.get("video_analysis")
    
    training_partner = user.get("training_partner", {})
    partner_name = training_partner.get("name", "Coach")
    feedback_tone = training_partner.get("feedback_tone", "encouraging")
    phrases = training_partner.get("phrases", ["Keep it up!"])
    focus_areas = training_partner.get("focus_areas", [])
    
    # Use real video analysis if available. Otherwise — no video was recorded, since
    # camera capture is opt-in and off by default — give honest generic coaching only.
    # Never fabricate a specific technique claim ("great guard position!") about a round
    # nothing actually watched; a random guess landing on real-sounding praise is worse
    # than no praise, especially if the fighter wasn't even training when it fired.
    if video_analysis and "dimension_scores" in video_analysis:
        dimension_scores = video_analysis["dimension_scores"]
        what_did_well = video_analysis.get("what_did_well", "Good work!")
        what_to_improve = video_analysis.get("what_to_improve", "Keep pushing!")
        drill_rec = video_analysis.get("drill_recommendation", {})
    else:
        dimension_scores = []
        what_did_well = random.choice(phrases) if phrases else "Keep pushing — that's real work."
        what_to_improve = random.choice([
            "Keep your hands up and stay sharp through the round.",
            "Keep breathing steady — don't hold your breath between shots.",
            "Keep your feet moving — don't plant and stay still.",
            "Keep your chin tucked and stay ready to move.",
        ])
        drill_rec = random.choice(list(DRILLS.values())) if DRILLS else {"name": "Fundamentals", "description": "Work on the basics."}
    
    # Check if any focus areas need special attention
    focus_feedback = ""
    if focus_areas:
        for fa in focus_areas:
            score = next((d["score"] for d in dimension_scores if d["dimension_name"] == fa), None)
            if score and score < 6:
                focus_feedback = f" Remember, you wanted to focus on {fa} - let's see more of that!"
    
    feedback = {
        "partner_name": partner_name,
        "round_number": round_number,
        "what_you_did_well": what_did_well,
        "what_to_tighten": what_to_improve + focus_feedback,
        "drill_focus": f"Later, try '{drill_rec.get('name', 'Drill')}' - {drill_rec.get('description', '')}",
        "dimension_scores": dimension_scores,
        "accountability_check": f"Round {round_number} of {total_rounds} done. {total_rounds - round_number} to go - no quitting!" if training_partner.get("accountability_level") == "high" else None
    }
    
    return feedback

# ============== TRAINING SESSION ENDPOINTS ==============

@api_router.post("/training/start")
async def start_training_session(session_config: TrainingSessionCreate, user: dict = Depends(get_current_user)):
    session_id = f"train_{uuid.uuid4().hex[:12]}"
    session_doc = {
        "session_id": session_id, "user_id": user["user_id"],
        "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "round_duration": session_config.round_duration, "rest_duration": session_config.rest_duration,
        "total_rounds": session_config.total_rounds, "record_video": session_config.record_video,
        "trigger": session_trigger(session_config.entry_source, session_config.entry_age_minutes),
        "rounds": [], "status": "in_progress", "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.training_sessions.insert_one(session_doc)
    return {"session_id": session_id, "status": "started"}

# ---- Live Coach ----
# Counted on the fighter's phone from the camera preview (nothing uploaded). These are
# activity counts, not technique: they never touch scores, personal bests or seasons.

class LiveRound(BaseModel):
    round_number: int = Field(..., ge=1, le=30)
    punches: int = Field(0, ge=0, le=3000)
    left: int = Field(0, ge=0, le=3000)
    right: int = Field(0, ge=0, le=3000)
    best_combo: int = Field(0, ge=0, le=300)
    guard_drops: int = Field(0, ge=0, le=1000)
    guard_pct: Optional[int] = Field(None, ge=0, le=100)
    head_moves: int = Field(0, ge=0, le=2000)
    airpods: bool = False
    timeline: List[float] = Field(default_factory=list, max_length=3000)


@api_router.post("/training/{session_id}/live-round")
async def save_live_round(session_id: str, data: LiveRound, user: dict = Depends(get_current_user)):
    session = await db.training_sessions.find_one({"session_id": session_id, "user_id": user["user_id"]},
                                                  {"_id": 0, "round_duration": 1, "status": 1})
    if not session:
        raise HTTPException(404, "Session not found")
    duration = session.get("round_duration", 180)
    rnd = data.model_dump()
    rnd["timeline"] = sorted(round(t, 1) for t in data.timeline if 0 <= t <= duration)[:data.punches]
    await db.training_sessions.update_one({"session_id": session_id}, {"$pull": {"live_rounds": {"round_number": data.round_number}}})
    await db.training_sessions.update_one({"session_id": session_id}, {"$push": {"live_rounds": rnd}})
    return {"ok": True}


def summarize_live_rounds(rounds: list) -> Optional[dict]:
    if not rounds:
        return None
    pcts = [r["guard_pct"] for r in rounds if isinstance(r.get("guard_pct"), int)]
    return {
        "rounds": len(rounds),
        "punches": sum(r.get("punches", 0) for r in rounds),
        "best_round_punches": max(r.get("punches", 0) for r in rounds),
        "best_combo": max(r.get("best_combo", 0) for r in rounds),
        "guard_drops": sum(r.get("guard_drops", 0) for r in rounds),
        "head_moves": sum(r.get("head_moves", 0) for r in rounds),
        "guard_pct": round(sum(pcts) / len(pcts)) if pcts else None,
        "airpods": any(r.get("airpods") for r in rounds),
    }


async def apply_live_records(user_id: str, rounds: list, round_duration: int) -> list:
    """Most punches in a round and longest combo are the fighter's own records — and the
    best round becomes the ghost they race next time at the same round length."""
    if not rounds:
        return []
    best = max(rounds, key=lambda r: r.get("punches", 0))
    fresh = await db.users.find_one({"user_id": user_id}, {"live_records": 1}) or {}
    prev = fresh.get("live_records") or {}
    combo = max(r.get("best_combo", 0) for r in rounds)
    new = []
    if best.get("punches", 0) > prev.get("most_punches", 0):
        new.append({"name": "Most punches in a round", "value": best["punches"], "prev": prev.get("most_punches")})
    if combo > prev.get("best_combo", 0):
        new.append({"name": "Longest combo", "value": combo, "prev": prev.get("best_combo")})
    await db.users.update_one({"user_id": user_id}, {"$max": {"live_records.most_punches": best.get("punches", 0),
                                                             "live_records.best_combo": combo}})
    current = await db.ghost_rounds.find_one({"user_id": user_id, "round_duration": round_duration}, {"punches": 1}) or {}
    if best.get("punches", 0) > current.get("punches", 0):
        await db.ghost_rounds.update_one(
            {"user_id": user_id, "round_duration": round_duration},
            {"$set": {"punches": best["punches"], "timeline": best.get("timeline", []),
                      "set_at": datetime.now(timezone.utc).isoformat()}},
            upsert=True,
        )
    return new


@api_router.get("/training/ghost")
async def get_ghost(round_duration: int = Query(180, ge=30, le=600), user: dict = Depends(get_current_user)):
    ghost = await db.ghost_rounds.find_one({"user_id": user["user_id"], "round_duration": round_duration},
                                           {"_id": 0, "punches": 1, "timeline": 1, "set_at": 1})
    return ghost or {}


@api_router.post("/training/{session_id}/complete")
async def complete_training_session(session_id: str, user: dict = Depends(get_current_user)):
    session = await db.training_sessions.find_one({"session_id": session_id, "user_id": user["user_id"]}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Get all video analyses for this session
    videos = await db.round_videos.find({"session_id": session_id, "user_id": user["user_id"]}, {"_id": 0}).to_list(100)
    
    # Aggregate scores
    all_scores = {}
    for video in videos:
        if video.get("analysis_results"):
            for score in video["analysis_results"].get("dimension_scores", []):
                dim = score["dimension_name"]
                if dim not in all_scores:
                    all_scores[dim] = []
                all_scores[dim].append(score["score"])
    
    # Only dimensions the analysis actually scored. Unwatched dimensions stay None —
    # a made-up number would poison personal bests, seasons and scouting reports.
    final_dimension_scores = []
    for dim in DIMENSIONS:
        vals = [v for v in all_scores.get(dim, []) if isinstance(v, (int, float))]
        final_dimension_scores.append({"dimension_name": dim, "score": round(sum(vals) / len(vals)) if vals else None})

    scores = [d["score"] for d in final_dimension_scores if d["score"] is not None]
    overall_score = round(sum(scores) / len(scores), 1) if scores else None

    session_record = {
        "session_id": session_id, "user_id": user["user_id"], "date": session["date"],
        "overall_score": overall_score, "scored": overall_score is not None,
        "trigger": session.get("trigger", "direct"), "record_video": session.get("record_video"),
        "dimension_scores": final_dimension_scores,
        "rounds": [{"round_number": v["round_number"], "video_url": v["video_url"], "analysis": v.get("analysis_results")} for v in videos],
        "training_config": {"round_duration": session["round_duration"], "rest_duration": session["rest_duration"], "total_rounds": session["total_rounds"]},
        "live_stats": summarize_live_rounds(session.get("live_rounds") or []),
        "created_at": session["created_at"], "completed_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.sessions.insert_one({**session_record})
    await db.training_sessions.update_one({"session_id": session_id}, {"$set": {"status": "completed", "overall_score": overall_score}})
    new_belts = await check_and_award_belts(user["user_id"])
    rewards = await safe_session_rewards(user, session_record, trusted_scores=True)
    if rewards.get("scouting_report"):
        await db.sessions.update_one({"session_id": session_id, "user_id": user["user_id"]},
                                     {"$set": {"scouting_report": rewards["scouting_report"]}})
    result = dict(session_record)
    result["new_belts"] = new_belts
    result["rewards"] = rewards
    result["scouting_report"] = rewards.get("scouting_report")
    try:
        result["live_records"] = await apply_live_records(user["user_id"], session.get("live_rounds") or [], session["round_duration"])
    except Exception as e:
        logger.error(f"Live records failed for {session_id}: {e}")
        result["live_records"] = []
    return result

# ============== STRIPE PAYMENT ENDPOINTS ==============

STANDARD_TRIAL_DAYS = 14
# The waitlist site promises founders "early access + 30-day Pro trial" on sign-up.
FOUNDER_TRIAL_DAYS = 30


async def _unspent_founder_promo(user: dict):
    """The founder's own single-use Stripe promotion code, if they have one they haven't
    used yet. A founder who cancelled has spent it — Stripe would reject it, and the price
    is gone, which is what the cancel screen warns about."""
    if not (STRIPE_FOUNDERS_COUPON_ID and user.get("email")):
        return None
    entry = await db.waitlist.find_one({"email": user["email"]})
    if not (entry and entry.get("promo_code")):
        return None
    try:
        codes = await asyncio.to_thread(stripe_lib.PromotionCode.list, code=entry["promo_code"], limit=1)
    except Exception as e:
        logger.warning(f"Founders discount lookup failed: {e}")
        return None
    code = codes.data[0] if codes.data else None
    limit = _sget(code, "max_redemptions")
    spent = bool(limit) and (_sget(code, "times_redeemed") or 0) >= limit
    return code if code is not None and _sget(code, "active") and not spent else None


@api_router.get("/payments/offer")
async def get_payment_offer(user: dict = Depends(get_current_user)):
    """What this person would pay today: the founder price and 30-day trial for an unspent
    founder code, otherwise the regular plans — so the paywall never shows a price that
    checkout won't charge."""
    promo = await _unspent_founder_promo(user)
    coupon = None
    if promo is not None:
        try:
            coupon = await _founder_coupon()
        except Exception as e:
            logger.warning(f"Founder coupon lookup failed: {e}")
    plans = {}
    for plan_id, plan in SUBSCRIPTION_PLANS.items():
        pricing = founder_pricing(plan["price"], coupon) if coupon else None
        plans[plan_id] = {"price": pricing["price"] if pricing else plan["price"], "regular_price": plan["price"],
                          "interval": plan["interval"]}
    founder = None
    if coupon:
        founder = {"percent_off": coupon.get("percent_off"), "lifetime": coupon.get("duration") == "forever"}
    return {"currency": PLAN_CURRENCY, "trial_days": FOUNDER_TRIAL_DAYS if founder else STANDARD_TRIAL_DAYS,
            "founder": founder, "plans": plans}


@api_router.post("/payments/checkout")
async def create_checkout(checkout_req: CheckoutRequest, user: dict = Depends(get_current_user)):
    import asyncio
    if checkout_req.plan_id not in SUBSCRIPTION_PLANS:
        raise HTTPException(status_code=400, detail="Invalid plan")

    plan = SUBSCRIPTION_PLANS[checkout_req.plan_id]
    host_url = _safe_checkout_origin(checkout_req.origin_url)

    checkout_params = {
        "mode": "subscription",
        "payment_method_types": ["card"],
        "line_items": [{"price": plan["stripe_price_id"], "quantity": 1} if plan.get("stripe_price_id") else {
            "price_data": {
                "currency": PLAN_CURRENCY,
                "product_data": {"name": f"Victory AI Pro {plan['name']}"},
                "unit_amount": round(plan["price"] * 100),
                "recurring": {"interval": plan["interval"]},
            },
            "quantity": 1,
        }],
        "subscription_data": {"trial_period_days": STANDARD_TRIAL_DAYS},
        "success_url": f"{host_url}/payment/success?session_id={{CHECKOUT_SESSION_ID}}",
        "cancel_url": f"{host_url}/paywall",
        "customer_email": user.get("email") or None,
        "metadata": {"user_id": user["user_id"], "plan_id": checkout_req.plan_id},
    }

    # Auto-apply founders discount for waitlist users — Stripe forbids mixing
    # allow_promotion_codes=True with discounts[], so only one path runs.
    founders_applied = False
    promo = await _unspent_founder_promo(user)
    if promo is not None:
        checkout_params["discounts"] = [{"promotion_code": _sget(promo, "id")}]
        checkout_params["subscription_data"]["trial_period_days"] = FOUNDER_TRIAL_DAYS
        founders_applied = True

    if not founders_applied:
        checkout_params["allow_promotion_codes"] = True

    try:
        session = await asyncio.to_thread(
            stripe_lib.checkout.Session.create,
            **checkout_params,
        )
    except Exception as e:
        logger.error(f"Stripe checkout error: {e}")
        raise HTTPException(status_code=500, detail="Could not start checkout — please try again")

    await db.payment_transactions.insert_one({
        "transaction_id": f"txn_{uuid.uuid4().hex[:12]}", "user_id": user["user_id"],
        "session_id": session.id, "plan_id": checkout_req.plan_id,
        "amount": float(plan["price"]), "currency": PLAN_CURRENCY, "payment_status": "pending",
        "founder": founders_applied, "trial_days": checkout_params["subscription_data"]["trial_period_days"],
        "created_at": datetime.now(timezone.utc).isoformat()
    })

    return {"checkout_url": session.url, "session_id": session.id}

async def _fulfil_tokens(session_id: Optional[str], meta: dict) -> bool:
    """Credits a token purchase exactly once. Both the webhook and the buyer's success page
    call this, so a slow or missed webhook never loses tokens; the first caller to claim the
    session id wins and every later call is a no-op."""
    uid, tokens = meta.get("user_id"), int(meta.get("tokens") or 0)
    if not (session_id and uid and tokens):
        return False
    try:
        await db.fulfilled_payments.insert_one({"_id": session_id, "user_id": uid, "tokens": tokens,
                                                "at": datetime.now(timezone.utc).isoformat()})
    except DuplicateKeyError:
        return False
    await db.users.update_one({"user_id": uid}, {"$inc": {"token_balance": tokens}})
    logger.info(f"Fulfilled {tokens} tokens for {uid}")
    return True


@api_router.get("/payments/status/{session_id}")
async def get_payment_status(session_id: str, user: dict = Depends(get_current_user)):
    try:
        session = await asyncio.to_thread(stripe_lib.checkout.Session.retrieve, session_id)
    except Exception as e:
        logger.error(f"Stripe status lookup error: {e}")
        raise HTTPException(status_code=500, detail="Could not check payment status — please try again")

    # Ownership check: session must belong to the authenticated user
    txn = await db.payment_transactions.find_one({"session_id": session_id}, {"user_id": 1})
    if txn:
        if txn.get("user_id") != user["user_id"]:
            raise HTTPException(403, "Not your payment session")
    elif (session.metadata or {}).get("user_id") and session.metadata["user_id"] != user["user_id"]:
        raise HTTPException(403, "Not your payment session")

    is_complete = session.status == "complete"
    # Subscriptions with a trial have payment_status="no_payment_required" — treat "complete" as success
    effective_payment_status = "paid" if is_complete else session.payment_status

    await db.payment_transactions.update_one(
        {"session_id": session_id},
        {"$set": {"payment_status": effective_payment_status, "status": session.status}}
    )

    # Only subscription-mode checkouts create a subscription; token/ad payments must not.
    if is_complete and session.mode == "subscription" and not await db.subscriptions.find_one({"session_id": session_id}):
        transaction = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
        plan_id = (transaction or {}).get("plan_id", "monthly")
        trial_end = datetime.now(timezone.utc) + timedelta(days=(transaction or {}).get("trial_days") or STANDARD_TRIAL_DAYS)
        subscription_end = trial_end + timedelta(days=365 if plan_id == "annual" else 30)

        await db.subscriptions.insert_one({
            "subscription_id": session.subscription or f"sub_{uuid.uuid4().hex[:12]}",
            "user_id": user["user_id"], "session_id": session_id, "plan_id": plan_id,
            "status": "trialing", "trial_end": trial_end.isoformat(),
            "current_period_end": subscription_end.isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat()
        })

    meta = session.metadata or {}
    if meta.get("purchase_type") == "tokens" and session.payment_status == "paid" and meta.get("user_id") == user["user_id"]:
        await _fulfil_tokens(session_id, meta)
    return {
        "status": session.status,
        "payment_status": effective_payment_status,
        "amount_total": session.amount_total,
        "currency": session.currency,
        "token_package": meta.get("token_package"),
        "tokens": int(meta["tokens"]) if meta.get("tokens", "").isdigit() else None,
    }

@api_router.get("/subscription/status")
async def get_subscription_status(user: dict = Depends(get_current_user)):
    subscription = await db.subscriptions.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if not subscription:
        return {"has_subscription": False, "status": None}
    return {"has_subscription": subscription["status"] in ["active", "trialing"], "status": subscription["status"], "plan_id": subscription.get("plan_id")}

# ---- Billing: founder price and cancellation ----
# Goal: keep founders subscribed (lower churn) without making leaving any harder.
# Psychology: loss aversion and the endowment effect — a price someone already owns weighs
# far more than the same discount offered fresh, but only when it's salient at the moment of
# decision. Design: name the locked-in price straight after purchase (ownership), and show
# the exact cost of losing it on the cancel screen — one honest screen, then cancel works.

_founder_coupon_cache: Dict[str, Any] = {}


def _sget(obj, key):
    if obj is None:
        return None
    if isinstance(obj, dict):
        return obj.get(key)
    try:
        return obj[key]
    except (KeyError, TypeError, AttributeError):
        return getattr(obj, key, None)


def coupon_ids_on(sub) -> set:
    """Coupon ids on a Stripe subscription, across the old `discount` and newer
    `discounts` (expanded) shapes."""
    items = list(_sget(sub, "discounts") or [])
    if _sget(sub, "discount"):
        items.append(_sget(sub, "discount"))
    ids = set()
    for d in items:
        if isinstance(d, str):
            continue
        coupon = _sget(d, "coupon") or _sget(_sget(d, "source"), "coupon")
        cid = coupon if isinstance(coupon, str) else _sget(coupon, "id")
        if cid:
            ids.add(cid)
    return ids


def founder_pricing(plan_price: float, coupon: dict) -> Optional[dict]:
    pct, off = coupon.get("percent_off"), coupon.get("amount_off")
    if pct:
        price = plan_price * (1 - pct / 100)
    elif off:
        price = max(0.0, plan_price - off / 100)
    else:
        return None
    price = round(price, 2)
    return {
        "price": price,
        "regular_price": round(plan_price, 2),
        "saving": round(plan_price - price, 2),
        "percent_off": pct,
        # Only a "forever" coupon is a lifetime price; anything else must not be called one.
        "lifetime": coupon.get("duration") == "forever",
        "duration_in_months": coupon.get("duration_in_months"),
    }


async def _founder_coupon() -> Optional[dict]:
    if not STRIPE_FOUNDERS_COUPON_ID:
        return None
    if "coupon" not in _founder_coupon_cache:
        c = await asyncio.to_thread(stripe_lib.Coupon.retrieve, STRIPE_FOUNDERS_COUPON_ID)
        _founder_coupon_cache["coupon"] = {k: _sget(c, k) for k in ("percent_off", "amount_off", "duration", "duration_in_months")}
    return _founder_coupon_cache["coupon"]


async def _billing_summary(user: dict) -> dict:
    local = await db.subscriptions.find_one({"user_id": user["user_id"]}, {"_id": 0}) or {}
    if not local:
        return {"has_subscription": False}
    plan = SUBSCRIPTION_PLANS.get(local.get("plan_id") or "monthly", SUBSCRIPTION_PLANS["monthly"])
    out = {
        "has_subscription": local.get("status") in ("active", "trialing"),
        "status": local.get("status"),
        "plan_id": local.get("plan_id"),
        "interval": plan["interval"],
        "currency": PLAN_CURRENCY,
        "regular_price": plan["price"],
        "price": plan["price"],
        "current_period_end": local.get("current_period_end"),
        "cancel_at_period_end": bool(local.get("cancel_at_period_end")),
        "founder": None,
        "manageable": False,
        "managed_by": "app_store" if local.get("source") == "app_store" else "stripe",
    }
    sub_id = local.get("subscription_id") or ""
    if not (STRIPE_API_KEY and sub_id.startswith("sub_")):
        return out
    try:
        sub = await asyncio.to_thread(stripe_lib.Subscription.retrieve, sub_id, expand=["discounts"])
    except Exception as e:
        logger.warning(f"Billing summary: Stripe lookup failed for {sub_id}: {e}")
        return out
    out["manageable"] = True
    out["status"] = _sget(sub, "status") or out["status"]
    out["cancel_at_period_end"] = bool(_sget(sub, "cancel_at_period_end"))
    item = ((_sget(_sget(sub, "items"), "data") or [None])[0])
    period_end = _sget(sub, "current_period_end") or _sget(item, "current_period_end")
    if period_end:
        out["current_period_end"] = datetime.fromtimestamp(period_end, tz=timezone.utc).isoformat()
    if STRIPE_FOUNDERS_COUPON_ID and STRIPE_FOUNDERS_COUPON_ID in coupon_ids_on(sub):
        try:
            pricing = founder_pricing(plan["price"], await _founder_coupon() or {})
        except Exception as e:
            logger.warning(f"Founder coupon lookup failed: {e}")
            pricing = None
        if pricing:
            out["founder"] = pricing
            out["price"] = pricing["price"]
    return out


@api_router.get("/subscription/billing")
async def get_billing(user: dict = Depends(get_current_user)):
    return await _billing_summary(user)


async def _set_cancel_at_period_end(user: dict, cancel: bool) -> dict:
    if _rate_limited(f"sub_cancel:{user['user_id']}", 10, 60):
        raise HTTPException(429, "Too many attempts — try again in a minute")
    local = await db.subscriptions.find_one({"user_id": user["user_id"]}, {"subscription_id": 1})
    sub_id = (local or {}).get("subscription_id") or ""
    if not (STRIPE_API_KEY and sub_id.startswith("sub_")):
        raise HTTPException(404, "No subscription to change")
    try:
        await asyncio.to_thread(stripe_lib.Subscription.modify, sub_id, cancel_at_period_end=cancel)
    except Exception as e:
        logger.error(f"Subscription cancel_at_period_end={cancel} failed for {sub_id}: {e}")
        raise HTTPException(502, "Couldn't reach billing — try again in a moment")
    await db.subscriptions.update_one({"subscription_id": sub_id}, {"$set": {
        "cancel_at_period_end": cancel,
        "cancel_requested_at" if cancel else "resumed_at": datetime.now(timezone.utc).isoformat(),
    }})
    return await _billing_summary(user)


@api_router.post("/subscription/cancel")
async def cancel_subscription(user: dict = Depends(get_current_user)):
    # Cancels at the end of the paid period: access continues until then, and so does the
    # founder price — which is why resuming before that date keeps it.
    return await _set_cancel_at_period_end(user, True)


@api_router.post("/subscription/resume")
async def resume_subscription(user: dict = Depends(get_current_user)):
    return await _set_cancel_at_period_end(user, False)


@api_router.post("/subscription/restore")
async def restore_subscription(user: dict = Depends(get_current_user)):
    """For someone who already paid but the app doesn't show them as subscribed — a
    missed webhook, a fresh account on the same email, a device switch. Looks the account
    up in Stripe by email, finds a live subscription, and re-points the local record at
    it. Read-only against Stripe; never creates a charge."""
    if _rate_limited(f"restore_sub:{user['user_id']}", 5, 60):
        raise HTTPException(429, "Too many attempts — try again in a minute")
    email = user.get("email")
    if not email:
        raise HTTPException(400, "No email on this account to match a purchase against")
    if not STRIPE_API_KEY:
        raise HTTPException(503, "Billing isn't configured")

    try:
        customers = await asyncio.to_thread(stripe_lib.Customer.list, email=email, limit=10)
    except Exception as e:
        logger.error(f"restore_subscription: Stripe customer lookup failed: {e}")
        raise HTTPException(502, "Couldn't reach Stripe — try again in a moment")

    live_sub = None
    for cust in customers.data:
        try:
            subs = await asyncio.to_thread(stripe_lib.Subscription.list, customer=cust.id, status="all", limit=10)
        except Exception:
            continue
        for s in subs.data:
            if s.status in ("active", "trialing"):
                live_sub = s
                break
        if live_sub:
            break

    if not live_sub:
        return {"restored": False, "reason": "no_active_subscription"}

    plan_id = "monthly"
    try:
        interval = live_sub["items"]["data"][0]["price"]["recurring"]["interval"]
        plan_id = "annual" if interval == "year" else "monthly"
    except Exception:
        pass

    fields = {
        "subscription_id": live_sub.id,
        "user_id": user["user_id"],
        "plan_id": plan_id,
        "status": live_sub.status,
        "subscription_active": True,  # only active/trialing subs get this far
        "restored_at": datetime.now(timezone.utc).isoformat(),
    }
    if live_sub.get("trial_end"):
        fields["trial_end"] = datetime.fromtimestamp(live_sub["trial_end"], tz=timezone.utc).isoformat()
    if live_sub.get("current_period_end"):
        fields["current_period_end"] = datetime.fromtimestamp(live_sub["current_period_end"], tz=timezone.utc).isoformat()

    await db.subscriptions.update_one(
        {"user_id": user["user_id"]},
        {"$set": fields, "$setOnInsert": {"created_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"restored": True, "status": live_sub.status, "plan_id": plan_id}

@api_router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    body = await request.body()
    signature = request.headers.get("stripe-signature", "")
    if not STRIPE_WEBHOOK_SECRET:
        logger.error("Stripe webhook secret not configured — refusing to process unsigned event")
        raise HTTPException(status_code=500, detail="Webhook not configured")
    try:
        event = stripe_lib.Webhook.construct_event(body, signature, STRIPE_WEBHOOK_SECRET)
    except Exception as e:
        logger.error(f"Webhook signature verification failed: {e}")
        raise HTTPException(status_code=400, detail="Invalid signature")

    event_type = event.get("type", "") if isinstance(event, dict) else event.type
    event_data = event.get("data", {}).get("object", {}) if isinstance(event, dict) else event.data.object

    try:
        if event_type == "customer.subscription.updated":
            stripe_sub_id = event_data.get("id") if isinstance(event_data, dict) else event_data.id
            sub_status = event_data.get("status") if isinstance(event_data, dict) else event_data.status
            if stripe_sub_id:
                await db.subscriptions.update_one(
                    {"subscription_id": stripe_sub_id},
                    {"$set": {"status": sub_status, "cancel_at_period_end": bool(_sget(event_data, "cancel_at_period_end"))}}
                )
        elif event_type == "invoice.payment_succeeded":
            stripe_sub_id = event_data.get("subscription") if isinstance(event_data, dict) else event_data.subscription
            if stripe_sub_id:
                await db.subscriptions.update_one(
                    {"subscription_id": stripe_sub_id},
                    {"$set": {"status": "active", "subscription_active": True}}
                )
        elif event_type == "customer.subscription.deleted":
            stripe_sub_id = event_data.get("id") if isinstance(event_data, dict) else event_data.id
            if stripe_sub_id:
                await db.subscriptions.update_one(
                    {"subscription_id": stripe_sub_id},
                    {"$set": {"status": "canceled", "subscription_active": False}}
                )
        elif event_type == "invoice.payment_failed":
            stripe_sub_id = event_data.get("subscription") if isinstance(event_data, dict) else event_data.subscription
            if stripe_sub_id:
                await db.subscriptions.update_one(
                    {"subscription_id": stripe_sub_id},
                    {"$set": {"status": "past_due", "subscription_active": False}}
                )
        elif event_type == "checkout.session.completed":
            meta = (event_data.get("metadata") or {}) if isinstance(event_data, dict) else (event_data.metadata or {})
            purchase_type = meta.get("purchase_type")
            gift_type = meta.get("gift_type")
            if purchase_type == "tokens":
                await _fulfil_tokens(_sget(event_data, "id"), meta)
            elif gift_type == "gift_sub":
                uid = meta.get("user_id")
                count = int(meta.get("gift_count", 0))
                stream_id = meta.get("stream_id", "")
                if uid and count:
                    await db.users.update_one({"user_id": uid}, {"$inc": {"lifetime_gifts": count}})
                    if stream_id:
                        gifter = await db.users.find_one({"user_id": uid}, {"name": 1, "display_name": 1, "avatar_url": 1})
                        gname = (gifter or {}).get("display_name") or (gifter or {}).get("name", "Someone")
                        record_hype(stream_id, uid, gift_hype_weight(count), paid=True)
                        await ws_manager.broadcast(stream_id, {
                            "type": "gift_sub",
                            "user_name": gname,
                            "count": count,
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                        })
            elif purchase_type == "fantasy_cosmetic":
                if _sget(event_data, "payment_status") == "paid" and meta.get("user_id"):
                    await _grant_cosmetic(meta["user_id"], meta.get("cosmetic_id"))
                    logger.info(f"Granted cosmetic {meta.get('cosmetic_id')} to {meta['user_id']}")
            elif purchase_type == "ad_campaign":
                campaign_id = meta.get("campaign_id")
                days = int(meta.get("days", 7))
                if campaign_id:
                    now_dt = datetime.now(timezone.utc)
                    end_dt = now_dt + timedelta(days=days)
                    await db.ad_campaigns.update_one(
                        {"campaign_id": campaign_id},
                        {"$set": {
                            "status": "active",
                            "start_date": now_dt.isoformat(),
                            "end_date": end_dt.isoformat(),
                        }},
                    )
                    logger.info(f"Ad campaign {campaign_id} activated for {days} days")
    except Exception as e:
        logger.error(f"Webhook handler error: {e}")

    return {"received": True}

# ============== TOKEN / TIPPING ENDPOINTS ==============

@api_router.get("/tokens/packages")
async def list_token_packages(_: dict = Depends(get_current_user)):
    return list({"id": k, **v} for k, v in TOKEN_PACKAGES.items())

@api_router.get("/tokens/balance")
async def get_token_balance(user: dict = Depends(get_current_user)):
    return {
        "balance": user.get("token_balance", 0),
        "packages": TOKEN_PACKAGES,
        "punch_menu": PUNCH_MENU,
    }

@api_router.post("/tokens/purchase")
async def purchase_tokens(
    pkg_id: str = Query(...),
    origin_url: str = Query(""),
    return_path: str = Query("/tokens"),   # where to go on cancel
    user: dict = Depends(get_current_user),
):
    import asyncio
    if pkg_id not in TOKEN_PACKAGES:
        raise HTTPException(400, "Invalid package")
    pkg = TOKEN_PACKAGES[pkg_id]
    host = _safe_checkout_origin(origin_url)
    safe_return = return_path.lstrip("/")
    try:
        session = await asyncio.to_thread(
            stripe_lib.checkout.Session.create,
            mode="payment",
            payment_method_types=["card"],
            line_items=[{
                "price_data": {
                    "currency": "usd",
                    "product_data": {
                        "name": f"Victory — {pkg['tokens']:,} Tokens ({pkg['label']})",
                        "description": pkg["tagline"],
                        "images": [],
                    },
                    "unit_amount": int(pkg["price"] * 100),
                },
                "quantity": 1,
            }],
            success_url=f"{host}/tokens/success?session_id={{CHECKOUT_SESSION_ID}}&pkg={pkg_id}",
            cancel_url=f"{host}/{safe_return}",
            customer_email=user.get("email") or None,
            payment_intent_data={"description": f"Victory tokens — {pkg['tokens']:,} ({pkg['label']})"},
            metadata={
                "user_id":        user["user_id"],
                "purchase_type":  "tokens",
                "token_package":  pkg_id,
                "tokens":         str(pkg["tokens"]),
            },
        )
    except Exception as e:
        logger.error(f"Stripe token checkout error: {e}")
        raise HTTPException(500, "Could not start checkout — please try again")
    return {"checkout_url": session.url, "tokens": pkg["tokens"], "price": pkg["price"]}

@api_router.post("/streams/{stream_id}/tip")
async def send_tip(stream_id: str, req: TipRequest, user: dict = Depends(get_current_user)):
    if _rate_limited(f"tip:{user['user_id']}", 30, 60):
        raise HTTPException(429, "Too many tip requests — slow down")
    if req.amount < 25:
        raise HTTPException(400, "Minimum tip is 25 tokens")
    stream = await db.streams.find_one({"stream_id": stream_id})
    if not stream:
        raise HTTPException(404, "Stream not found")
    if stream["user_id"] == user["user_id"]:
        raise HTTPException(400, "Cannot tip your own stream")

    # Determine punch action: prefer exact key match, fall back to amount threshold
    punch = None
    if req.action_key:
        punch = next((p for p in PUNCH_MENU if p.get("key") == req.action_key), None)
    if not punch:
        punch = next((p for p in reversed(PUNCH_MENU) if req.amount >= p["tokens"]), PUNCH_MENU[0])

    # Amount must match the selected punch price exactly
    if req.action_key and punch and req.amount != punch["tokens"]:
        raise HTTPException(400, "Amount does not match punch price")
    if await is_content_flagged(req.message):
        raise HTTPException(400, "Tip message violates community guidelines")

    # Atomically deduct sender only if they still have the balance (guards double-spend / negative balance)
    debit = await db.users.update_one(
        {"user_id": user["user_id"], "token_balance": {"$gte": req.amount}},
        {"$inc": {"token_balance": -req.amount}},
    )
    if debit.matched_count == 0:
        raise HTTPException(402, detail="insufficient_tokens")
    await db.users.update_one({"user_id": stream["user_id"]}, {"$inc": {"token_balance": int(req.amount * 0.7)}})

    now = datetime.now(timezone.utc).isoformat()
    tip_doc = {
        "tip_id": f"tip_{uuid.uuid4().hex[:12]}",
        "stream_id": stream_id,
        "streamer_id": stream["user_id"],
        "sender_id": user["user_id"],
        "sender_name": user.get("display_name") or user.get("name", "Fighter"),
        "sender_avatar": user.get("avatar_url", ""),
        "amount": req.amount,
        "message": req.message[:200],
        "punch_action": punch["action"] if punch else None,
        "punch_emoji": punch["emoji"] if punch else None,
        "punch_tier": punch["tier"] if punch else None,
        "created_at": now,
    }
    await db.tips.insert_one(tip_doc)
    record_hype(stream_id, user["user_id"], tip_hype_weight(req.amount), paid=True)

    # Broadcast tip event to all chat viewers
    is_combo = punch.get("category") == "combo" if punch else False
    await ws_manager.broadcast(stream_id, {
        "type": "tip",
        "tip_id": tip_doc["tip_id"],
        "user_id": user["user_id"],
        "user_name": tip_doc["sender_name"],
        "user_avatar": tip_doc["sender_avatar"],
        "amount": req.amount,
        "message": req.message,
        "punch_action": tip_doc["punch_action"],
        "punch_emoji": tip_doc["punch_emoji"],
        "punch_tier": tip_doc["punch_tier"],
        "punch_category": punch.get("category") if punch else None,
        "is_combo": is_combo,
        "combo_sequence": punch.get("combo_sequence", []) if punch else [],
        "combo_label": punch.get("combo_label", "") if punch else "",
        "timestamp": now,
    })

    # Push notification to streamer (non-blocking)
    sender_name = user.get("display_name") or user.get("name", "Someone")
    await _send_push(
        stream["user_id"],
        title=f"{sender_name} tipped {req.amount:,} tokens!",
        body=req.message[:80] if req.message else f"{punch['action'] if punch else '⚡'} — you're on fire",
        url=f"/stream/{stream_id}",
        tag=f"tip-{stream_id}",
    )

    return {"success": True, "tokens_remaining": user.get("token_balance", 0) - req.amount, "punch_action": tip_doc["punch_action"]}

@api_router.get("/streams/{stream_id}/leaderboard")
async def get_stream_leaderboard(stream_id: str, scope: str = Query("session", enum=["session", "lifetime"]), _: dict = Depends(get_current_user)):
    if scope == "session":
        match = {"stream_id": stream_id}
    else:
        s = await db.streams.find_one({"stream_id": stream_id}, {"user_id": 1})
        if not s:
            return []
        sibling_ids = await db.streams.distinct("stream_id", {"user_id": s["user_id"]})
        match = {"stream_id": {"$in": sibling_ids}}
    pipeline = [
        {"$match": match},
        {"$group": {"_id": "$sender_id", "user_name": {"$last": "$sender_name"}, "user_avatar": {"$last": "$sender_avatar"}, "total": {"$sum": "$amount"}}},
        {"$sort": {"total": -1}},
        {"$limit": 10},
    ]
    rows = await db.tips.aggregate(pipeline).to_list(10)
    return [{"rank": i + 1, "user_id": r["_id"], "user_name": r["user_name"], "user_avatar": r.get("user_avatar", ""), "total": r["total"]} for i, r in enumerate(rows)]

@api_router.post("/streams/{stream_id}/gift-sub")
async def gift_subscription(stream_id: str, req: GiftSubRequest, user: dict = Depends(get_current_user)):
    import asyncio
    if req.count not in GIFT_SUB_TIERS:
        raise HTTPException(400, f"Gift count must be one of: {list(GIFT_SUB_TIERS.keys())}")
    price = GIFT_SUB_TIERS[req.count]
    host = _safe_checkout_origin(req.origin_url)
    label = f"{req.count} Gift Sub{'s' if req.count > 1 else ''}"
    try:
        session = await asyncio.to_thread(
            stripe_lib.checkout.Session.create,
            mode="payment",
            payment_method_types=["card"],
            line_items=[{"price_data": {"currency": "usd", "product_data": {"name": f"Victory AI — {label}"}, "unit_amount": int(price * 100)}, "quantity": 1}],
            allow_promotion_codes=True,
            success_url=f"{host}/stream/{stream_id}?gift=success",
            cancel_url=f"{host}/stream/{stream_id}",
            customer_email=user.get("email") or None,
            metadata={"user_id": user["user_id"], "gift_type": "gift_sub", "stream_id": stream_id, "gift_count": str(req.count), "recipient_user_id": req.recipient_user_id or "community"},
        )
    except Exception as e:
        logger.error(f"Stripe gift-sub checkout error: {e}")
        raise HTTPException(500, "Could not start checkout — please try again")
    return {"checkout_url": session.url}

# ============== ADVERTISER ENDPOINTS ==============

@api_router.get("/ads/packages")
async def get_ad_packages():
    return AD_PACKAGES

@api_router.get("/ads/active")
async def get_active_ad():
    now = datetime.now(timezone.utc).isoformat()
    campaign = await db.ad_campaigns.find_one(
        {"status": "active", "end_date": {"$gt": now}},
        {"_id": 0},
        sort=[("start_date", -1)],
    )
    if not campaign:
        return None
    return {
        "brand_name": campaign["brand_name"],
        "tagline": campaign["tagline"],
        "website_url": campaign["website_url"],
        "package": campaign["package"],
    }

@api_router.post("/ads/checkout")
async def create_ad_checkout(request: Request, req: AdCampaignRequest):
    client_ip = request.client.host if request.client else "unknown"
    if _rate_limited(f"ads_checkout:{client_ip}", 5, 60):
        raise HTTPException(429, "Too many requests — try again in a minute")
    pkg = AD_PACKAGES.get(req.package_id)
    if not pkg:
        raise HTTPException(400, "Invalid ad package")
    if await is_content_flagged(req.brand_name) or await is_content_flagged(req.tagline):
        raise HTTPException(400, "Ad content violates community guidelines")
    if not STRIPE_API_KEY:
        raise HTTPException(500, "Payments not configured")
    campaign_id = f"ad_{uuid.uuid4().hex[:12]}"
    host = _safe_checkout_origin(req.origin_url)
    # Pre-create pending campaign so we have the ID for metadata
    await db.ad_campaigns.insert_one({
        "campaign_id": campaign_id,
        "brand_name": req.brand_name[:80],
        "tagline": req.tagline[:120],
        "website_url": req.website_url[:500],
        "advertiser_email": req.advertiser_email,
        "package": req.package_id,
        "days": pkg["days"],
        "status": "pending_payment",
        "start_date": None,
        "end_date": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    try:
        session = await asyncio.to_thread(
            stripe_lib.checkout.Session.create,
            mode="payment",
            payment_method_types=["card"],
            line_items=[{
                "price_data": {
                    "currency": "usd",
                    "product_data": {"name": f"Victory AI Sponsor Banner — {pkg['label']} ({pkg['days']} days)"},
                    "unit_amount": int(pkg["price"] * 100),
                },
                "quantity": 1,
            }],
            customer_email=req.advertiser_email or None,
            success_url=f"{host}/advertise/success?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{host}/advertise",
            metadata={
                "purchase_type": "ad_campaign",
                "campaign_id": campaign_id,
                "days": str(pkg["days"]),
            },
        )
    except Exception as e:
        logger.error(f"Stripe ad checkout error: {e}")
        raise HTTPException(500, "Could not start checkout — please try again")
    return {"checkout_url": session.url, "campaign_id": campaign_id}

# ============== WAITLIST ENDPOINTS ==============

# ---- Founder spots (first FOUNDER_SPOTS_LIMIT waitlist sign-ups) ----
# The site promises founding pricing to the first 1,000. One counter document is claimed
# atomically, so two sign-ups at the same moment can't both take the last spot.

async def _founder_spots_claimed() -> int:
    doc = await db.counters.find_one({"_id": "founder_spots"})
    if doc is None:
        existing = await db.waitlist.count_documents({"promo_code": {"$nin": [None, ""]}})
        await db.counters.update_one({"_id": "founder_spots"}, {"$setOnInsert": {"n": existing}}, upsert=True)
        doc = await db.counters.find_one({"_id": "founder_spots"})
    return doc.get("n", 0)


async def _claim_founder_spot() -> bool:
    await _founder_spots_claimed()
    claimed = await db.counters.find_one_and_update(
        {"_id": "founder_spots", "n": {"$lt": FOUNDER_SPOTS_LIMIT}}, {"$inc": {"n": 1}})
    return claimed is not None


async def _release_founder_spot():
    await db.counters.update_one({"_id": "founder_spots", "n": {"$gt": 0}}, {"$inc": {"n": -1}})


async def founder_spots() -> dict:
    claimed = min(await _founder_spots_claimed(), FOUNDER_SPOTS_LIMIT)
    return {"limit": FOUNDER_SPOTS_LIMIT, "claimed": claimed, "remaining": FOUNDER_SPOTS_LIMIT - claimed}


@api_router.get("/waitlist/stats")
async def waitlist_stats(request: Request):
    client_ip = request.client.host if request.client else "unknown"
    if _rate_limited(f"waitlist_stats:{client_ip}", 60, 60):
        raise HTTPException(429, "Too many requests — slow down")
    return await founder_spots()


_fx_cache: Dict[str, Any] = {"at": 0.0, "data": None}
FX_TTL_SECONDS = 12 * 3600


async def gbp_rates() -> Optional[dict]:
    """Daily GBP exchange rates (exchangerate-api.com open endpoint, attribution required),
    cached for 12 hours. Only used to show visitors an approximate local price — Stripe
    always charges the GBP amount."""
    if _fx_cache["data"] and time.time() - _fx_cache["at"] < FX_TTL_SECONDS:
        return _fx_cache["data"]
    try:
        async with httpx.AsyncClient(timeout=8) as http_client:
            r = await http_client.get("https://open.er-api.com/v6/latest/GBP")
        body = r.json()
        if body.get("result") != "success":
            raise ValueError(body.get("error-type", "bad response"))
        data = {"rates": body["rates"], "updated": body.get("time_last_update_utc"),
                "source": "https://www.exchangerate-api.com"}
        _fx_cache.update(at=time.time(), data=data)
    except Exception as e:
        logger.warning(f"FX rates fetch failed: {e}")
    return _fx_cache["data"]


@api_router.get("/pricing")
async def public_pricing(request: Request):
    """Everything the waitlist site needs to show prices that match Stripe: the GBP plans,
    the founder discount, live founder spots, and rates for an approximate local price."""
    client_ip = request.client.host if request.client else "unknown"
    if _rate_limited(f"pricing:{client_ip}", 60, 60):
        raise HTTPException(429, "Too many requests — slow down")
    coupon = None
    if STRIPE_API_KEY and STRIPE_FOUNDERS_COUPON_ID:
        try:
            coupon = await _founder_coupon()
        except Exception as e:
            logger.warning(f"Founder coupon lookup failed: {e}")
    monthly, annual = SUBSCRIPTION_PLANS["monthly"]["price"], SUBSCRIPTION_PLANS["annual"]["price"]
    founder = None
    if coupon:
        fm, fa = founder_pricing(monthly, coupon), founder_pricing(annual, coupon)
        if fm and fa:
            founder = {"percent_off": coupon.get("percent_off"), "lifetime": fm["lifetime"],
                       "monthly": fm["price"], "annual": fa["price"]}
    return {
        "currency": PLAN_CURRENCY.upper(),
        "plans": {
            "monthly": {"price": monthly, "interval": "month"},
            "annual": {"price": annual, "interval": "year",
                       "saving_percent": round(100 * (1 - annual / (monthly * 12)))},
        },
        "trial_days": STANDARD_TRIAL_DAYS,
        "founder_trial_days": FOUNDER_TRIAL_DAYS,
        "founder": founder,
        "founder_spots": await founder_spots(),
        "fx": await gbp_rates(),
    }


class WaitlistSignup(BaseModel):
    email: EmailStr
    name: Optional[str] = Field(None, max_length=100)
    phone: Optional[str] = Field(None, max_length=30)

@api_router.post("/waitlist/signup")
async def waitlist_signup(request: Request, data: WaitlistSignup):
    import asyncio
    client_ip = request.client.host if request.client else "unknown"
    if _rate_limited(f"waitlist:{client_ip}", 5, 60):
        raise HTTPException(429, "Too many requests — try again in a minute")

    # Prevent duplicate signups
    existing = await db.waitlist.find_one({"email": data.email})
    if existing:
        # Same shape as a new sign-up, so the site shows the right message to someone
        # signing up twice (a founder stays a founder).
        return {"message": "Already on the waitlist", "already_registered": True,
                "promo_code": None, "founder": bool(existing.get("promo_code")),
                "founder_spots": await founder_spots()}

    # Founding pricing is for the first FOUNDER_SPOTS_LIMIT only; after that people still
    # join the waitlist (the free tier is open to everyone) but get no founder code.
    promo_code_str = None
    if await _claim_founder_spot():
        promo_code_str = f"FOUNDER{uuid.uuid4().hex[:8].upper()}"
        try:
            promo = await asyncio.to_thread(
                stripe_lib.PromotionCode.create,
                coupon=STRIPE_FOUNDERS_COUPON_ID,
                code=promo_code_str,
                max_redemptions=1,
            )
            promo_code_str = promo.code
        except Exception as e:
            logger.error(f"Stripe promo code creation failed: {e}")
            await _release_founder_spot()
            promo_code_str = None

    # Store in waitlist collection
    await db.waitlist.insert_one({
        "email": data.email,
        "name": data.name or "",
        "phone": (data.phone or "").strip() or None,
        "promo_code": promo_code_str,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    # Forward full payload to n8n
    try:
        payload = data.model_dump()
        payload["promo_code"] = promo_code_str
        async with httpx.AsyncClient() as client:
            await client.post(
                "https://n8n.srv964449.hstgr.cloud/webhook/boxing-waitlist",
                json=payload,
                timeout=5,
            )
    except Exception as e:
        logger.error(f"n8n forward failed: {e}")

    return {"message": "Signed up successfully", "promo_code": promo_code_str,
            "founder": promo_code_str is not None, "founder_spots": await founder_spots()}

# ============== SESSION & STATIC ENDPOINTS ==============

@api_router.get("/sessions")
async def get_sessions(user: dict = Depends(get_current_user), limit: int = Query(100, ge=1, le=500)):
    sessions = await db.sessions.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return sessions

class DimensionScore(BaseModel):
    dimension_name: str
    score: Optional[float] = None

class SessionCreate(BaseModel):
    entry_source: Optional[str] = Field(None, max_length=20)
    entry_age_minutes: Optional[int] = Field(None, ge=0)
    video_url: Optional[str] = None
    session_notes: Optional[str] = None
    date: Optional[str] = None
    dimension_scores: List[DimensionScore] = []

@api_router.post("/sessions")
async def create_session(data: SessionCreate, user: dict = Depends(get_current_user)):
    dimension_scores = [{"dimension_name": d.dimension_name, "score": d.score} for d in data.dimension_scores]
    scored = [d["score"] for d in dimension_scores if d["score"] is not None]
    if not scored:
        raise HTTPException(status_code=400, detail="At least one dimension must be scored")
    overall_score = round(sum(scored) / len(scored), 1)
    now = datetime.now(timezone.utc).isoformat()
    session_record = {
        "session_id": f"session_{uuid.uuid4().hex[:12]}",
        "user_id": user["user_id"],
        "date": data.date or now[:10],
        "overall_score": overall_score,
        "dimension_scores": dimension_scores,
        "video_url": data.video_url,
        "session_notes": data.session_notes,
        "source": "manual",
        "trigger": session_trigger(data.entry_source, data.entry_age_minutes),
        "created_at": now,
        "completed_at": now,
    }
    await db.sessions.insert_one({**session_record})
    new_belts = await check_and_award_belts(user["user_id"])
    result = dict(session_record)
    result["rewards"] = await safe_session_rewards(user, session_record, trusted_scores=False)
    result["new_belts"] = new_belts
    return result

@api_router.get("/sessions/{session_id}")
async def get_session(session_id: str, user: dict = Depends(get_current_user)):
    session = await db.sessions.find_one({"session_id": session_id, "user_id": user["user_id"]}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session

@api_router.put("/users/me")
async def update_profile(update_data: UserUpdate, user: dict = Depends(get_current_user)):
    for field in ("name", "experience_level"):
        value = getattr(update_data, field)
        if value and await is_content_flagged(value):
            raise HTTPException(400, f"{field.replace('_', ' ').title()} violates community guidelines")
    update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}
    if update_dict:
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": update_dict})
    return await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "password": 0})

@api_router.delete("/users/me")
async def delete_account(user: dict = Depends(get_current_user)):
    """GDPR/CCPA account deletion. Removes the account and the primary
    personal-content collections. Financial/transaction records (tips,
    payment_transactions) are intentionally retained for fraud-prevention
    and accounting purposes, per common GDPR legal-basis exceptions."""
    user_id = user["user_id"]
    if await db.gyms.find_one({"owner_id": user_id}):
        raise HTTPException(400, "Transfer or delete your gym before deleting your account")

    post_ids = await db.posts.distinct("post_id", {"user_id": user_id})
    if post_ids:
        await db.comments.delete_many({"post_id": {"$in": post_ids}})
    await db.posts.delete_many({"user_id": user_id})
    await db.comments.delete_many({"user_id": user_id})
    await db.sessions.delete_many({"user_id": user_id})
    await db.round_videos.delete_many({"user_id": user_id})
    await db.follows.delete_many({"$or": [{"follower_id": user_id}, {"following_id": user_id}]})
    await db.blocks.delete_many({"$or": [{"blocker_id": user_id}, {"blocked_id": user_id}]})
    # Squads: hand ownership to another member rather than deleting a group of people
    # still training together just because one of them left; delete only if now empty.
    async for sq in db.squads.find({"owner_id": user_id}):
        remaining = [m for m in sq.get("members", []) if m != user_id]
        if remaining:
            await db.squads.update_one({"squad_id": sq["squad_id"]}, {"$set": {"owner_id": remaining[0]}, "$pull": {"members": user_id}})
        else:
            await db.squads.delete_one({"squad_id": sq["squad_id"]})
    await db.squads.update_many({"owner_id": {"$ne": user_id}, "members": user_id}, {"$pull": {"members": user_id}})
    await db.notifications.delete_many({"$or": [{"recipient_id": user_id}, {"actor_id": user_id}]})
    await db.scheduled_streams.delete_many({"user_id": user_id})
    await db.reports.delete_many({"reporter_id": user_id})
    await db.crash_reports.delete_many({"user_id": user_id})

    stream_ids = await db.streams.distinct("stream_id", {"user_id": user_id})
    if stream_ids:
        await db.chat_messages.delete_many({"stream_id": {"$in": stream_ids}})
    # Also remove messages this user sent in streams they didn't own — previously only
    # cascade-deleted via owned streams, leaving their identity attached elsewhere (GDPR Art. 17).
    await db.chat_messages.delete_many({"user_id": user_id})
    await db.streams.delete_many({"user_id": user_id})
    await db.push_subscriptions.delete_many({"user_id": user_id})
    await db.apns_tokens.delete_many({"user_id": user_id})
    await db.live_activity_tokens.delete_many({"user_id": user_id})
    await db.ghost_rounds.delete_many({"user_id": user_id})
    await db.squad_invites.delete_many({"inviter_id": user_id})
    await db.waitlist.delete_many({"email": user["email"]})
    own_highlights = await db.highlights.find({"streamer_id": user_id}, {"highlight_id": 1, "share_video_url": 1}).to_list(1000)
    for hl in own_highlights:
        if hl.get("share_video_url"):
            try:
                await asyncio.to_thread(cloudinary.uploader.destroy, f"victory_highlights/{hl['highlight_id']}",
                                        resource_type="video", invalidate=True)
            except Exception as e:
                logger.warning(f"Cloudinary destroy on account delete: {e}")
    await db.highlights.delete_many({"streamer_id": user_id})
    await db.highlights.update_many({"squad_viewer_ids": user_id}, {"$pull": {"squad_viewer_ids": user_id}})
    await db.highlight_stamps.delete_many({"$or": [{"user_id": user_id}, {"owner_id": user_id}]})
    await db.season_stats.delete_many({"user_id": user_id})
    await db.bookings.delete_many({"user_id": user_id})
    await db.callouts.delete_many({"challenger_id": user_id})
    await db.callouts.update_many({"target_ids": user_id}, {"$pull": {"target_ids": user_id, "accepted_ids": user_id}})
    await db.film_views.delete_many({"$or": [{"owner_id": user_id}, {"viewer_id": user_id}]})

    if user.get("gym_id"):
        await db.gyms.update_one({"gym_id": user["gym_id"]}, {"$pull": {"members": user_id}, "$inc": {"member_count": -1}})

    await db.users.delete_one({"user_id": user_id})
    return {"message": "Account and personal data deleted"}

@api_router.get("/users/me/export")
async def export_my_data(user: dict = Depends(get_current_user)):
    """GDPR Art. 15/20: full export of this user's personal data across collections."""
    from fastapi.encoders import jsonable_encoder
    if _rate_limited(f"data_export:{user['user_id']}", 3, 60):
        raise HTTPException(429, "Too many export requests — try again in a minute")
    user_id = user["user_id"]
    proj = {"_id": 0}

    post_ids = await db.posts.distinct("post_id", {"user_id": user_id})
    comments_on_own_posts = await db.comments.find({"post_id": {"$in": post_ids}}, proj).to_list(10000) if post_ids else []
    stream_ids = await db.streams.distinct("stream_id", {"user_id": user_id})
    chat_in_own_streams = await db.chat_messages.find({"stream_id": {"$in": stream_ids}}, proj).to_list(10000) if stream_ids else []

    export = {
        "profile": await db.users.find_one({"user_id": user_id}, {**proj, "password": 0}),
        "posts": await db.posts.find({"user_id": user_id}, proj).to_list(10000),
        "comments_authored": await db.comments.find({"user_id": user_id}, proj).to_list(10000),
        "comments_on_own_posts": comments_on_own_posts,
        "sessions": await db.sessions.find({"user_id": user_id}, proj).to_list(10000),
        "round_videos": await db.round_videos.find({"user_id": user_id}, proj).to_list(10000),
        "follows": await db.follows.find({"$or": [{"follower_id": user_id}, {"following_id": user_id}]}, proj).to_list(10000),
        "blocks": await db.blocks.find({"$or": [{"blocker_id": user_id}, {"blocked_id": user_id}]}, proj).to_list(10000),
        "squads": await db.squads.find({"members": user_id}, proj).to_list(1000),
        "notifications": await db.notifications.find({"$or": [{"recipient_id": user_id}, {"actor_id": user_id}]}, proj).to_list(10000),
        "scheduled_streams": await db.scheduled_streams.find({"user_id": user_id}, proj).to_list(10000),
        "streams_hosted": await db.streams.find({"user_id": user_id}, proj).to_list(10000),
        "chat_messages_sent": await db.chat_messages.find({"user_id": user_id}, proj).to_list(10000),
        "chat_messages_in_own_streams": chat_in_own_streams,
        "reports_filed": await db.reports.find({"reporter_id": user_id}, proj).to_list(10000),
        "crash_reports": await db.crash_reports.find({"user_id": user_id}, proj).to_list(1000),
        "highlights": await db.highlights.find({"streamer_id": user_id}, proj).to_list(1000),
        "round_stamps_given": await db.highlight_stamps.find({"user_id": user_id}, proj).to_list(10000),
        "season_stats": await db.season_stats.find({"user_id": user_id}, proj).to_list(1000),
        "bookings": await db.bookings.find({"user_id": user_id}, proj).to_list(1000),
        "callouts_sent": await db.callouts.find({"challenger_id": user_id}, proj).to_list(1000),
        "feedback_submitted": await db.feedback.find({"user_id": user_id}, proj).to_list(10000),
        "push_subscriptions": await db.push_subscriptions.find({"user_id": user_id}, proj).to_list(1000),
        "ios_push_devices": await db.apns_tokens.find({"user_id": user_id}, proj).to_list(1000),
    }
    return jsonable_encoder(export)

@api_router.get("/users/stats")
async def get_user_stats(user: dict = Depends(get_current_user)):
    sessions = await db.sessions.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(1000)
    current_streak, longest_streak = _compute_streaks(sessions)
    return {
        "total_sessions": len(sessions),
        "best_score": _best_score(sessions),
        "most_improved_dimension": None,
        "current_streak": current_streak,
        "longest_streak": longest_streak,
        "week_activity": _week_activity(sessions),
    }

@api_router.get("/dimensions")
async def get_dimensions():
    return {"dimensions": DIMENSIONS, "groups": {"Offensive": ["Jab", "Cross", "Left Hook", "Right Hook", "Uppercut", "Combination Flow", "Punch Balance", "Punch Accuracy"], "Defensive": ["Guard Position", "Head Movement", "Slip", "Roll", "Parry", "Body Movement"], "Movement": ["Footwork", "Ring Generalship"]}}

@api_router.get("/drills")
async def get_drills():
    return DRILLS

@api_router.get("/drills/{dimension}")
async def get_drill(dimension: str):
    if dimension not in DRILLS:
        raise HTTPException(status_code=404, detail="Dimension not found")
    return {"dimension": dimension, **DRILLS[dimension]}

@api_router.get("/legends")
async def get_legends(filter: Optional[str] = None):
    return LEGENDS

@api_router.get("/plans")
async def get_plans():
    return {"plans": SUBSCRIPTION_PLANS}

@api_router.get("/health")
async def health():
    return {"status": "healthy", "timestamp": datetime.now(timezone.utc).isoformat()}

# ============== TTS ENDPOINTS ==============

class TTSRequest(BaseModel):
    text: str
    voice_id: Optional[str] = None

@api_router.post("/tts/generate")
async def generate_tts(tts_req: TTSRequest, user: dict = Depends(get_current_user)):
    if not ELEVENLABS_API_KEY:
        raise HTTPException(status_code=503, detail="TTS not configured")

    quota = await check_and_consume_ai_tokens(user, "tts_generate")
    if not quota["allowed"]:
        raise HTTPException(status_code=402, detail="ai_quota_exceeded")

    voice_id = tts_req.voice_id or ELEVENLABS_VOICE_ID
    if not re.fullmatch(r"[A-Za-z0-9]{1,64}", voice_id or ""):
        raise HTTPException(status_code=400, detail="Invalid voice_id")

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}",
            headers={"xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json"},
            json={
                "text": tts_req.text,
                "model_id": "eleven_monolingual_v1",
                "voice_settings": {"stability": 0.5, "similarity_boost": 0.75}
            },
            timeout=30.0
        )
        if response.status_code != 200:
            raise HTTPException(status_code=502, detail="TTS generation failed")

    audio_data = base64.b64encode(response.content).decode('utf-8')
    return {"audio_data": audio_data, "mime_type": "audio/mpeg"}

# ============== LEADERBOARD ENDPOINTS ==============

@api_router.get("/leaderboard")
async def get_leaderboard(user: dict = Depends(get_current_user)):
    pipeline = [
        {"$group": {
            "_id": "$user_id",
            "avg_score": {"$avg": "$overall_score"},
            "total_sessions": {"$sum": 1},
            "best_score": {"$max": "$overall_score"}
        }},
        {"$sort": {"avg_score": -1}},
        {"$limit": 50},
        {"$lookup": {"from": "users", "localField": "_id", "foreignField": "user_id", "as": "user_info"}},
        {"$unwind": {"path": "$user_info", "preserveNullAndEmptyArrays": True}}
    ]
    leaders = await db.sessions.aggregate(pipeline).to_list(50)
    result = []
    def _display_name(raw: str) -> str:
        # Show first name + last initial only for privacy; tolerate empty/blank names.
        parts = (raw or "Fighter").strip().split() or ["Fighter"]
        return parts[0] if len(parts) == 1 else f"{parts[0]} {parts[-1][0]}."

    for i, leader in enumerate(leaders):
        user_info = leader.get("user_info") or {}
        result.append({
            "rank": i + 1,
            "display_name": _display_name(user_info.get("name")),
            "avg_score": round(leader["avg_score"], 1),
            "total_sessions": leader["total_sessions"],
            "best_score": round(leader["best_score"], 1),
            "is_current_user": leader["_id"] == user["user_id"]
        })
    # Current user's rank — computed across all fighters, not just the visible top 50.
    current_rank = next((r for r in result if r["is_current_user"]), None)
    if current_rank is None:
        my_agg = await db.sessions.aggregate([
            {"$match": {"user_id": user["user_id"]}},
            {"$group": {"_id": "$user_id", "avg_score": {"$avg": "$overall_score"},
                        "total_sessions": {"$sum": 1}, "best_score": {"$max": "$overall_score"}}},
        ]).to_list(1)
        if my_agg:
            my = my_agg[0]
            higher = await db.sessions.aggregate([
                {"$group": {"_id": "$user_id", "avg_score": {"$avg": "$overall_score"}}},
                {"$match": {"avg_score": {"$gt": my["avg_score"]}}},
                {"$count": "n"},
            ]).to_list(1)
            current_rank = {
                "rank": (higher[0]["n"] if higher else 0) + 1,
                "display_name": _display_name(user.get("name")),
                "avg_score": round(my["avg_score"], 1),
                "total_sessions": my["total_sessions"],
                "best_score": round(my["best_score"], 1),
                "is_current_user": True,
            }
    return {"leaderboard": result, "current_user_rank": current_rank}

# ============== SESSION REPLAY ENDPOINTS ==============

@api_router.get("/sessions/{session_id}/replay")
async def get_session_replay(session_id: str, user: dict = Depends(get_current_user)):
    session = await db.sessions.find_one({"session_id": session_id, "user_id": user["user_id"]}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    videos = await db.round_videos.find({"session_id": session_id, "user_id": user["user_id"]}, {"_id": 0}).sort("round_number", 1).to_list(20)
    training_partner = user.get("training_partner", {})
    partner_name = training_partner.get("name", "Coach")

    rounds = []
    for video in videos:
        analysis = video.get("analysis_results") or {}
        if isinstance(analysis, dict) and "dimension_scores" in analysis:
            dimension_scores = [d for d in analysis["dimension_scores"] if isinstance(d.get("score"), (int, float))]
        else:
            dimension_scores = []

        commentary = f"Round {video['round_number']}: "
        if dimension_scores:
            sorted_scores = sorted(dimension_scores, key=lambda x: x.get("score", 0))
            best = sorted_scores[-1]
            worst = sorted_scores[0]
            commentary += f"Best: {best['dimension_name']} ({best['score']}/10). Needs work: {worst['dimension_name']} ({worst['score']}/10)."
        else:
            commentary += "Keep pushing — every round counts."

        rounds.append({
            "round_number": video["round_number"],
            "video_url": video.get("video_url"),
            "public_id": video.get("public_id"),
            "dimension_scores": dimension_scores,
            "what_did_well": analysis.get("what_did_well", ""),
            "what_to_improve": analysis.get("what_to_improve", ""),
            "drill_recommendation": analysis.get("drill_recommendation", {}),
            "commentary": commentary,
            "partner_name": partner_name
        })

    return {"session": session, "rounds": rounds, "partner_name": partner_name, "total_rounds": len(rounds)}

# ============== TRIAL STATUS & PUSH NOTIFICATION ENDPOINTS ==============

@api_router.get("/subscription/trial-status")
async def get_trial_status(user: dict = Depends(get_current_user)):
    subscription = await db.subscriptions.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if not subscription:
        return {"has_subscription": False, "status": None, "days_remaining": None}

    status = subscription.get("status")
    if status == "trialing":
        trial_end = subscription.get("trial_end")
        if trial_end:
            if isinstance(trial_end, str):
                trial_end = datetime.fromisoformat(trial_end)
            if trial_end.tzinfo is None:
                trial_end = trial_end.replace(tzinfo=timezone.utc)
            days_remaining = (trial_end - datetime.now(timezone.utc)).days
            return {
                "has_subscription": True,
                "status": "trialing",
                "trial_end": trial_end.isoformat(),
                "days_remaining": max(0, days_remaining)
            }

    return {"has_subscription": True, "status": status, "days_remaining": None}

class PushSubscription(BaseModel):
    endpoint: str
    keys: Dict[str, Any]

@api_router.post("/notifications/subscribe")
async def subscribe_push(sub: PushSubscription, user: dict = Depends(get_current_user)):
    await db.push_subscriptions.update_one(
        {"user_id": user["user_id"]},
        {"$set": {
            "user_id": user["user_id"],
            "endpoint": sub.endpoint,
            "keys": sub.keys,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }},
        upsert=True
    )
    return {"message": "Push subscription registered"}

# ============== SOCIAL MODELS ==============

_AVATAR_PREFIXES = (
    "https://res.cloudinary.com/",
    "https://img.clerk.com/",
    "https://images.unsplash.com/",
    "https://lh3.googleusercontent.com/",
    "https://uploadthing.com/",
)

class UserProfileExtend(BaseModel):
    bio: Optional[str] = Field(None, max_length=500)
    school_name: Optional[str] = Field(None, max_length=100)
    city: Optional[str] = Field(None, max_length=100)   # self-reported locality — drives "gyms near you"
    weight_class: Optional[str] = Field(None, max_length=50)
    stance: Optional[str] = Field(None, max_length=20)
    amateur_wins: Optional[int] = None
    amateur_losses: Optional[int] = None
    amateur_draws: Optional[int] = None
    pro_wins: Optional[int] = None
    pro_losses: Optional[int] = None
    pro_draws: Optional[int] = None
    titles: Optional[List[str]] = None
    avatar_url: Optional[str] = Field(None, max_length=500)
    is_public: Optional[bool] = None
    display_name: Optional[str] = Field(None, max_length=60)
    weight_unit: Optional[Literal["kg", "lbs"]] = None

GYM_DEFAULT_CAP = 50
GYM_MIN_CAP = 5
GYM_MAX_CAP = 1000

class GymCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    style: Optional[str] = "mixed"
    is_public: bool = True
    city: Optional[str] = Field(None, max_length=100)   # self-reported, defines the gym's locality
    member_cap: Optional[int] = None                    # owner-set, clamped to [GYM_MIN_CAP, GYM_MAX_CAP]

def _gym_capacity(gym: dict) -> dict:
    """Computed capacity fields for any gym doc — old gyms with no member_cap fall back
    to the default rather than needing a migration."""
    cap = gym.get("member_cap") or GYM_DEFAULT_CAP
    count = gym.get("member_count", len(gym.get("members", [])))
    return {"member_cap": cap, "spots_left": max(0, cap - count), "is_full": count >= cap}

class PostCreate(BaseModel):
    video_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    caption: str = Field("", max_length=1000)
    post_type: str = "clip"
    tags: List[str] = []

class CommentCreate(BaseModel):
    text: str = Field(..., max_length=500)

class CompetitionCreate(BaseModel):
    title: str
    description: str = ""
    video_url: str
    thumbnail_url: Optional[str] = None
    competition_type: str = "poll"
    duration_hours: int = 24

class VoteCreate(BaseModel):
    scores: Dict[str, int]
    comment: Optional[str] = ""

# ============== SOCIAL HELPERS ==============

async def check_subscription(user: dict) -> bool:
    sub = await db.subscriptions.find_one(
        {"user_id": user["user_id"], "status": {"$in": ["active", "trialing"]}}, {"_id": 0}
    )
    return sub is not None

BELT_CATALOGUE = {
    # Training milestones
    "first_jab":      {"name": "First Jab",       "emoji": "🥊", "tier": "bronze", "desc": "Complete your first training session"},
    "heat_seeker":    {"name": "Heat Seeker",      "emoji": "🔥", "tier": "bronze", "desc": "Complete 10 training sessions"},
    "voltage":        {"name": "Voltage",          "emoji": "⚡", "tier": "silver", "desc": "Complete 25 training sessions"},
    "diamond_gloves": {"name": "Diamond Gloves",   "emoji": "💎", "tier": "diamond","desc": "Complete 100 training sessions"},
    "living_legend":  {"name": "Living Legend",    "emoji": "👑", "tier": "legend", "desc": "Complete 250 training sessions"},
    # Score tiers
    "sharpshooter":   {"name": "Sharpshooter",     "emoji": "🎯", "tier": "silver", "desc": "Average score 7.0+ (min 5 sessions)"},
    "elite":          {"name": "Elite",            "emoji": "🌟", "tier": "gold",   "desc": "Average score 8.0+ (min 10 sessions)"},
    "masterclass":    {"name": "Masterclass",      "emoji": "🔮", "tier": "legend", "desc": "Average score 9.0+ (min 20 sessions)"},
    # Competition belts
    "contender":      {"name": "Contender",        "emoji": "🏅", "tier": "bronze", "desc": "Win your first competition"},
    "regional_champ": {"name": "Regional Champion","emoji": "🥈", "tier": "silver", "desc": "Win 3 competitions"},
    "national_title": {"name": "National Title",   "emoji": "🥇", "tier": "gold",   "desc": "Win 5 competitions"},
    "world_champion": {"name": "World Champion",   "emoji": "🏆", "tier": "legend", "desc": "Win 10 competitions"},
    # Social
    "team_player":    {"name": "Team Player",      "emoji": "👥", "tier": "bronze", "desc": "Join a gym"},
    "gym_captain":    {"name": "Gym Captain",      "emoji": "🏟️", "tier": "gold",   "desc": "Create and own a gym"},
    "live_debut":     {"name": "Live Debut",       "emoji": "🔴", "tier": "silver", "desc": "Complete your first livestream"},
    # Streaks (real, consecutive training days — never app-open based)
    "on_a_roll":      {"name": "On a Roll",        "emoji": "🔥", "tier": "bronze", "desc": "7-day training streak"},
    "unbreakable":    {"name": "Unbreakable",       "emoji": "🧱", "tier": "gold",   "desc": "30-day training streak"},
}

def _compute_streaks(sessions: list) -> tuple:
    """Current/longest consecutive-day training streaks from real completed sessions."""
    dates = sorted({s["date"] for s in sessions if s.get("date")}, reverse=True)
    if not dates:
        return 0, 0
    parsed = [datetime.strptime(d, "%Y-%m-%d").date() for d in dates]
    day = timedelta(days=1)

    longest = run = 1
    for i in range(1, len(parsed)):
        run = run + 1 if parsed[i - 1] - parsed[i] == day else 1
        longest = max(longest, run)

    today = datetime.now(timezone.utc).date()
    if parsed[0] not in (today, today - day):
        current = 0
    else:
        current = 1
        for i in range(1, len(parsed)):
            if parsed[i - 1] - parsed[i] != day:
                break
            current += 1
    return current, longest

def _week_activity(sessions: list) -> list:
    """Last 7 days (oldest→newest), each {date, active} — real sessions only, for a Strava-style heatmap strip."""
    trained_dates = {s["date"] for s in sessions if s.get("date")}
    today = datetime.now(timezone.utc).date()
    return [
        {"date": (today - timedelta(days=i)).strftime("%Y-%m-%d"), "active": (today - timedelta(days=i)).strftime("%Y-%m-%d") in trained_dates}
        for i in range(6, -1, -1)
    ]

def _score_values(sessions) -> list:
    """Only sessions that were actually scored. A session with no video analysis has
    overall_score None and must not drag averages toward zero or crash sum()."""
    return [s["overall_score"] for s in sessions if isinstance(s.get("overall_score"), (int, float))]


def _avg_score(sessions, ndigits: int = 1) -> float:
    vals = _score_values(sessions)
    return round(sum(vals) / len(vals), ndigits) if vals else 0


def _best_score(sessions) -> float:
    return max(_score_values(sessions), default=0)


async def check_and_award_belts(user_id: str) -> list:
    user = await db.users.find_one({"user_id": user_id})
    if not user:
        return []
    already_earned = {b["belt_id"] for b in user.get("badges", [])}
    sessions = await db.sessions.find({"user_id": user_id}, {"overall_score": 1, "date": 1}).to_list(None)
    total = len(sessions)
    avg   = _avg_score(sessions, 4)
    _, longest_streak = _compute_streaks(sessions)
    comp_wins    = user.get("competition_wins", 0)
    has_gym      = bool(user.get("gym_id"))
    is_owner     = bool(await db.gyms.find_one({"owner_id": user_id}))
    has_streamed = bool(await db.streams.find_one({"user_id": user_id, "status": "ended"}))
    criteria = [
        ("first_jab",      total >= 1),
        ("heat_seeker",    total >= 10),
        ("voltage",        total >= 25),
        ("diamond_gloves", total >= 100),
        ("living_legend",  total >= 250),
        ("sharpshooter",   total >= 5  and avg >= 7.0),
        ("elite",          total >= 10 and avg >= 8.0),
        ("masterclass",    total >= 20 and avg >= 9.0),
        ("contender",      comp_wins >= 1),
        ("regional_champ", comp_wins >= 3),
        ("national_title", comp_wins >= 5),
        ("world_champion", comp_wins >= 10),
        ("team_player",    has_gym),
        ("gym_captain",    is_owner),
        ("live_debut",     has_streamed),
        ("on_a_roll",      longest_streak >= 7),
        ("unbreakable",    longest_streak >= 30),
    ]
    now = datetime.now(timezone.utc).isoformat()
    new_badges = []
    for belt_id, qualifies in criteria:
        if qualifies and belt_id not in already_earned:
            new_badges.append({"belt_id": belt_id, **BELT_CATALOGUE[belt_id], "earned_at": now})
    if new_badges:
        await db.users.update_one({"user_id": user_id}, {"$push": {"badges": {"$each": new_badges}}})
    return new_badges

def safe_user(user: dict) -> dict:
    return {
        "user_id": user.get("user_id"),
        "display_name": user.get("display_name") or user.get("name", "Fighter"),
        "name": user.get("name", "Fighter"),
        "picture": user.get("picture"),
        "avatar_url": user.get("avatar_url"),
        "weight_class": user.get("weight_class"),
        "weight_unit": user.get("weight_unit", "kg"),
        "stance": user.get("stance"),
        "gym_id": user.get("gym_id"),
        "bio": user.get("bio", ""),
        "amateur_wins": user.get("amateur_wins", 0),
        "amateur_losses": user.get("amateur_losses", 0),
        "amateur_draws": user.get("amateur_draws", 0),
        "amateur_verified_by": _record_status(user)["verified_by"],
        "competition_wins": user.get("competition_wins", 0),
        "competition_losses": user.get("competition_losses", 0),
        "badges": user.get("badges", []),
        "belts": user.get("badges", []),
        "competition_wins": user.get("competition_wins", 0),
        "competition_losses": user.get("competition_losses", 0),
        "is_public": user.get("is_public", True),
    }

async def _require_profile_visible(user_id: str, current_user: dict):
    """Raise 403 if user_id's profile is private and current_user isn't them.
    Shared by every endpoint that exposes another user's clips/schedule/follows."""
    if user_id == current_user["user_id"]:
        return
    target = await db.users.find_one({"user_id": user_id}, {"is_public": 1})
    if target and not target.get("is_public", True):
        raise HTTPException(status_code=403, detail="Profile is private")

async def _recalculate_gym_stats(gym_id: str):
    gym = await db.gyms.find_one({"gym_id": gym_id})
    if not gym:
        return
    total_sessions, scores = 0, []
    for uid in gym.get("members", []):
        sessions = await db.sessions.find({"user_id": uid}).to_list(10000)
        total_sessions += len(sessions)
        scores += _score_values(sessions)
    avg = round(sum(scores) / len(scores), 1) if scores else 0.0
    await db.gyms.update_one(
        {"gym_id": gym_id},
        {"$set": {"avg_score": avg, "total_sessions": total_sessions}}
    )

# ============== PROFILE EXTENDED ENDPOINTS ==============

@api_router.put("/users/profile")
async def update_extended_profile(data: UserProfileExtend, user: dict = Depends(get_current_user)):
    for field in ("display_name", "bio", "weight_class", "stance", "school_name", "city"):
        value = getattr(data, field)
        if value and await is_content_flagged(value):
            raise HTTPException(400, f"{field.replace('_', ' ').title()} violates community guidelines")
    update = {k: v for k, v in data.model_dump().items() if v is not None}
    if "avatar_url" in update and not any(update["avatar_url"].startswith(p) for p in _AVATAR_PREFIXES):
        del update["avatar_url"]
    if update:
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": update})
    updated = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "password": 0})
    # school_name and city are intentionally excluded from safe_user() (never shown on
    # another user's public profile) but the owner still needs to see their own values
    # back immediately after saving.
    result = safe_user(updated)
    result["school_name"] = updated.get("school_name")
    result["city"] = updated.get("city")
    return result


# ============== FIGHTER SEARCH / DISCOVER ==============

WEIGHT_CLASSES_ORDERED = [
    "Strawweight", "Light Flyweight", "Flyweight", "Super Flyweight",
    "Bantamweight", "Super Bantamweight", "Featherweight", "Super Featherweight",
    "Lightweight", "Super Lightweight", "Welterweight", "Super Welterweight",
    "Middleweight", "Super Middleweight", "Light Heavyweight",
    "Cruiserweight", "Heavyweight", "Super Heavyweight",
]

@api_router.get("/search/fighters")
async def search_fighters(
    q:            str   = Query(""),
    weight_class: str   = Query(""),
    stance:       str   = Query(""),
    sort:         str   = Query("active", enum=["active", "record", "new", "followers"]),
    page:         int   = Query(1, ge=1),
    limit:        int   = Query(20, ge=1, le=50),
    current_user: dict  = Depends(get_current_user),
):
    blocked_ids = await _blocked_either_way(current_user["user_id"])
    query: dict = {"is_public": {"$ne": False}, "user_id": {"$nin": list(blocked_ids)}}

    if q.strip():
        pattern = {"$regex": re.escape(q.strip()), "$options": "i"}
        query["$or"] = [{"display_name": pattern}, {"name": pattern}]

    if weight_class and weight_class != "All":
        query["weight_class"] = weight_class

    if stance and stance != "All":
        query["stance"] = stance

    skip = (page - 1) * limit

    # Sort mapping
    mongo_sort = {
        "new":  [("created_at", -1)],
        "active": [("last_session_at", -1), ("created_at", -1)],
    }.get(sort, [("created_at", -1)])

    raw_users = await db.users.find(
        query,
        {"_id": 0, "password": 0, "stream_key": 0},
    ).sort(mongo_sort).skip(skip).limit(limit).to_list(limit)

    # Filter out the caller themselves
    raw_users = [u for u in raw_users if u.get("user_id") != current_user["user_id"]]

    # Fetch caller's following set for is_following flag
    following_docs = await db.follows.find(
        {"follower_id": current_user["user_id"]},
        {"following_id": 1},
    ).to_list(None)
    following_ids = {f["following_id"] for f in following_docs}

    # Find who is currently live
    live_user_ids = set()
    live_streams = await db.streams.find(
        {"status": "live"},
        {"user_id": 1},
    ).to_list(None)
    for s in live_streams:
        live_user_ids.add(s["user_id"])

    results = []
    for u in raw_users:
        uid = u["user_id"]
        base = safe_user(u)

        # Session count
        base["total_sessions"] = await db.sessions.count_documents({"user_id": uid})

        # Follower count
        base["follower_count"] = await db.follows.count_documents({"following_id": uid})

        base["is_following"] = uid in following_ids
        base["is_live"]      = uid in live_user_ids
        base["experience_level"] = u.get("experience_level", "")

        results.append(base)

    # Secondary sort for "record" (most wins) and "followers" (done in Python after enrichment)
    if sort == "record":
        results.sort(
            key=lambda u: (u.get("amateur_wins", 0) + u.get("competition_wins", 0)),
            reverse=True,
        )
    elif sort == "followers":
        results.sort(key=lambda u: u.get("follower_count", 0), reverse=True)

    total = await db.users.count_documents(query)

    return {
        "fighters": results,
        "total":    total,
        "page":     page,
        "pages":    max(1, -(-total // limit)),   # ceil division
    }


@api_router.post("/contacts/find-matches")
async def find_contact_matches(body: ContactMatchRequest, current_user: dict = Depends(get_current_user)):
    """Hashed contact-sync matching. The client already ran the device contact picker
    and hashed each selected email with SHA-256 — raw contacts (names, real emails) are
    never sent here and never stored; only the matches are returned, and nothing about
    the non-matching hashes is persisted."""
    if _rate_limited(f"contact_match:{current_user['user_id']}", 20, 60):
        raise HTTPException(429, "Too many requests — try again in a minute")

    hashes = [h for h in body.email_hashes if h][:500]
    if not hashes:
        return {"fighters": []}

    blocked_ids = await _blocked_either_way(current_user["user_id"])
    raw_users = await db.users.find(
        {
            "email_hash": {"$in": hashes},
            "user_id": {"$nin": [current_user["user_id"], *blocked_ids]},
            "is_public": {"$ne": False},
        },
        {"_id": 0, "password": 0, "stream_key": 0},
    ).to_list(len(hashes))

    following_ids = {
        f["following_id"] for f in await db.follows.find(
            {"follower_id": current_user["user_id"]}, {"following_id": 1}
        ).to_list(None)
    }

    results = []
    for u in raw_users:
        base = safe_user(u)
        base["follower_count"] = await db.follows.count_documents({"following_id": u["user_id"]})
        base["is_following"] = u["user_id"] in following_ids
        results.append(base)

    return {"fighters": results}


@api_router.get("/users/{user_id}/profile")
async def get_public_profile(user_id: str, current_user: dict = Depends(get_current_user)):
    target = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password": 0})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target["user_id"] != current_user["user_id"] and await _is_blocked(current_user["user_id"], target["user_id"]):
        raise HTTPException(status_code=403, detail="Profile is unavailable")
    if not target.get("is_public", True) and target["user_id"] != current_user["user_id"]:
        raise HTTPException(status_code=403, detail="Profile is private")
    profile = safe_user(target)
    sessions = await db.sessions.find({"user_id": user_id}).to_list(10000)
    profile["total_sessions"] = len(sessions)
    profile["callouts_won"] = target.get("callouts_won", 0)
    profile["callouts_defended"] = target.get("callouts_defended", 0)
    profile["titles"] = target.get("titles", [])
    profile["identity_traits"] = top_identity_traits(target.get("identity_traits"))
    profile["fight_film_count"] = len(target.get("fight_film") or [])
    profile["avg_score"] = _avg_score(sessions)
    profile["best_score"] = _best_score(sessions)
    profile["current_streak"], profile["longest_streak"] = _compute_streaks(sessions)
    profile["week_activity"] = _week_activity(sessions)
    follower_count = await db.follows.count_documents({"following_id": user_id})
    following_count = await db.follows.count_documents({"follower_id": user_id})
    is_following = await db.follows.find_one({"follower_id": current_user["user_id"], "following_id": user_id}) is not None
    profile["follower_count"] = follower_count
    profile["following_count"] = following_count
    profile["is_following"] = is_following
    if target.get("gym_id"):
        gym = await db.gyms.find_one({"gym_id": target["gym_id"]}, {"_id": 0, "name": 1, "gym_id": 1})
        profile["gym"] = gym
    posts = await db.posts.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(6)
    profile["recent_posts"] = posts
    # Clip and schedule counts for the profile header
    profile["clip_count"] = await db.posts.count_documents(
        {"user_id": user_id, "video_url": {"$exists": True, "$ne": ""}}
    )
    now_iso = datetime.now(timezone.utc).isoformat()
    profile["upcoming_stream_count"] = await db.scheduled_streams.count_documents(
        {"user_id": user_id, "scheduled_at": {"$gte": now_iso}}
    )
    return profile


@api_router.post("/users/{user_id}/cheer-streak")
async def cheer_streak(user_id: str, user: dict = Depends(get_current_user)):
    if user_id == user["user_id"]:
        raise HTTPException(status_code=400, detail="Can't cheer your own streak")
    if _rate_limited(f"cheer_streak:{user['user_id']}", 30, 60):
        raise HTTPException(status_code=429, detail="Too many requests")
    target = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password": 0})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    sessions = await db.sessions.find({"user_id": user_id}, {"date": 1}).to_list(None)
    current_streak, _ = _compute_streaks(sessions)
    if current_streak < 1:
        raise HTTPException(status_code=400, detail="No active streak to cheer")
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    already = await db.streak_cheers.find_one({"actor_id": user["user_id"], "recipient_id": user_id, "date": today})
    if already:
        raise HTTPException(status_code=400, detail="Already cheered today")
    await db.streak_cheers.insert_one({
        "cheer_id": f"cheer_{uuid.uuid4().hex[:12]}",
        "actor_id": user["user_id"], "recipient_id": user_id, "date": today,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    await db.notifications.insert_one({
        "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
        "recipient_id": user_id, "actor_id": user["user_id"],
        "type": "streak_cheer", "read": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    actor_name = user.get("display_name") or user.get("name", "Someone")
    await _send_push(
        user_id,
        title=f"{actor_name} cheered your {current_streak}-day streak",
        body="Keep it going",
        url=f"/profile/{user['user_id']}",
        tag=f"streak-cheer-{user['user_id']}-{today}",
    )
    return {"cheered": True, "streak": current_streak}


# ── Clips ──────────────────────────────────────────────────────────────────────

@api_router.get("/users/{user_id}/clips")
async def get_user_clips(user_id: str, current_user: dict = Depends(get_current_user)):
    await _require_profile_visible(user_id, current_user)
    clips = await db.posts.find(
        {"user_id": user_id, "video_url": {"$exists": True, "$ne": ""}},
        {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    return clips


# ── Schedule ───────────────────────────────────────────────────────────────────

class ScheduledStreamCreate(BaseModel):
    title: str
    description: Optional[str] = ""
    scheduled_at: str   # ISO 8601 string, must be future
    category: Optional[str] = None
    weight_class: Optional[str] = None

@api_router.get("/users/{user_id}/schedule")
async def get_user_schedule(user_id: str, current_user: dict = Depends(get_current_user)):
    await _require_profile_visible(user_id, current_user)
    now_iso = datetime.now(timezone.utc).isoformat()
    items = await db.scheduled_streams.find(
        {"user_id": user_id, "scheduled_at": {"$gte": now_iso}},
        {"_id": 0}
    ).sort("scheduled_at", 1).limit(20).to_list(20)
    return items

@api_router.post("/streams/schedule")
async def create_scheduled_stream(data: ScheduledStreamCreate, user: dict = Depends(get_current_user)):
    if _rate_limited(f"stream_schedule:{user['user_id']}", 10, 60):
        raise HTTPException(429, "Too many requests — slow down")
    try:
        scheduled_dt = datetime.fromisoformat(data.scheduled_at.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        raise HTTPException(400, "Invalid datetime format — use ISO 8601")
    if scheduled_dt.tzinfo is None:
        scheduled_dt = scheduled_dt.replace(tzinfo=timezone.utc)
    if scheduled_dt <= datetime.now(timezone.utc):
        raise HTTPException(400, "Scheduled time must be in the future")
    if await is_content_flagged(data.title) or await is_content_flagged(data.description):
        raise HTTPException(400, "Stream content violates community guidelines")
    doc = {
        "schedule_id": f"sched_{uuid.uuid4().hex[:12]}",
        "user_id": user["user_id"],
        "title": data.title,
        "description": data.description or "",
        "scheduled_at": data.scheduled_at,
        "category": data.category,
        "weight_class": data.weight_class,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.scheduled_streams.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.delete("/streams/schedule/{schedule_id}")
async def delete_scheduled_stream(schedule_id: str, user: dict = Depends(get_current_user)):
    item = await db.scheduled_streams.find_one({"schedule_id": schedule_id})
    if not item:
        raise HTTPException(404, "Not found")
    if item["user_id"] != user["user_id"]:
        raise HTTPException(403, "Not your scheduled stream")
    await db.scheduled_streams.delete_one({"schedule_id": schedule_id})
    return {"ok": True}


# ============== STREAMER ANALYTICS ==============

@api_router.get("/analytics/dashboard")
async def get_analytics_dashboard(
    period: str = Query("30d", enum=["7d", "30d", "all"]),
    user: dict = Depends(get_current_user),
):
    uid = user["user_id"]
    now = datetime.now(timezone.utc)

    if period == "7d":
        cutoff = (now - timedelta(days=7)).isoformat()
        days   = 7
    elif period == "30d":
        cutoff = (now - timedelta(days=30)).isoformat()
        days   = 30
    else:
        cutoff = "2000-01-01T00:00:00+00:00"
        days   = 365

    # ── 1. Tips totals & daily breakdown ─────────────────────────────────────
    tips_cursor = db.tips.find(
        {"streamer_id": uid, "created_at": {"$gte": cutoff}},
        {"_id": 0, "amount": 1, "created_at": 1, "stream_id": 1},
    )
    tips_list = await tips_cursor.to_list(None)
    total_tips_tokens = sum(t["amount"] for t in tips_list)

    # ── 2. Emote unlock totals & daily breakdown ──────────────────────────────
    unlocks_cursor = db.emote_unlocks.find(
        {"owner_id": uid, "unlocked_at": {"$gte": cutoff}},
        {"_id": 0, "emote_id": 1, "unlocked_at": 1},
    )
    unlocks_list = await unlocks_cursor.to_list(None)

    # Fetch token prices for the user's emotes
    emotes_raw = await db.emotes.find({"owner_id": uid}, {"_id": 0}).to_list(None)
    price_map = {e["emote_id"]: e.get("token_price", 0) for e in emotes_raw}
    total_emote_tokens = sum(int(price_map.get(u["emote_id"], 0) * 0.7) for u in unlocks_list)

    # ── 3. Daily chart: merge tips + emote revenue by date ───────────────────
    from collections import defaultdict
    daily: dict = defaultdict(lambda: {"tips": 0, "emotes": 0})

    for t in tips_list:
        day = t["created_at"][:10]
        daily[day]["tips"] += t["amount"]

    for u in unlocks_list:
        day = u["unlocked_at"][:10]
        daily[day]["emotes"] += int(price_map.get(u["emote_id"], 0) * 0.7)

    # Fill all days in range (so chart has no gaps)
    chart_days = []
    for i in range(days - 1, -1, -1):
        d = (now - timedelta(days=i)).strftime("%Y-%m-%d")
        chart_days.append({
            "date":   d,
            "label":  (now - timedelta(days=i)).strftime("%d %b"),
            "tips":   daily[d]["tips"],
            "emotes": daily[d]["emotes"],
            "total":  daily[d]["tips"] + daily[d]["emotes"],
        })

    # ── 4. Past streams (ended, most recent first) ───────────────────────────
    past_streams_raw = await db.streams.find(
        {"user_id": uid, "status": {"$in": ["ended", "idle"]}, "created_at": {"$gte": cutoff}},
        {"_id": 0, "stream_key": 0},
    ).sort("created_at", -1).limit(20).to_list(20)

    # For each stream, attach total tips earned
    tips_by_stream: dict = defaultdict(int)
    for t in tips_list:
        tips_by_stream[t["stream_id"]] += t["amount"]

    past_streams = []
    for s in past_streams_raw:
        started  = s.get("started_at") or s["created_at"]
        ended    = s.get("ended_at")
        duration_mins = None
        if ended and started:
            try:
                start_dt = datetime.fromisoformat(started.replace("Z", "+00:00"))
                end_dt   = datetime.fromisoformat(ended.replace("Z", "+00:00"))
                duration_mins = max(0, int((end_dt - start_dt).total_seconds() / 60))
            except Exception:
                pass
        past_streams.append({
            "stream_id":      s["stream_id"],
            "title":          s.get("title", "Untitled"),
            "type":           s.get("type", "training"),
            "status":         s["status"],
            "viewer_count":   s.get("viewer_count", 0),
            "created_at":     s["created_at"],
            "duration_mins":  duration_mins,
            "tips_earned":    tips_by_stream[s["stream_id"]],
        })

    # ── 5. Emote performance ─────────────────────────────────────────────────
    unlocks_by_emote: dict = defaultdict(int)
    for u in unlocks_list:
        unlocks_by_emote[u["emote_id"]] += 1

    emote_performance = []
    for e in emotes_raw:
        eid = e["emote_id"]
        unlocks_period = unlocks_by_emote[eid]
        revenue_period = int(unlocks_period * e.get("token_price", 0) * 0.7)
        emote_performance.append({
            "emote_id":       eid,
            "name":           e["name"],
            "emoji":          e.get("emoji", ""),
            "image_url":      e["image_url"],
            "token_price":    e.get("token_price", 0),
            "unlock_count":   e.get("unlock_count", 0),   # all-time
            "unlocks_period": unlocks_period,
            "revenue_period": revenue_period,
        })
    emote_performance.sort(key=lambda x: x["revenue_period"], reverse=True)

    # ── 6. Overview totals ────────────────────────────────────────────────────
    total_streams       = await db.streams.count_documents({"user_id": uid})
    total_viewers_all   = await db.streams.aggregate([
        {"$match": {"user_id": uid}},
        {"$group": {"_id": None, "total": {"$sum": "$viewer_count"}}},
    ]).to_list(1)
    all_tips_ever = await db.tips.aggregate([
        {"$match": {"streamer_id": uid}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]).to_list(1)
    all_emote_unlocks_ever = await db.emote_unlocks.find({"owner_id": uid}, {"_id": 0, "emote_id": 1}).to_list(None)
    all_emote_revenue = sum(int(price_map.get(u["emote_id"], 0) * 0.7) for u in all_emote_unlocks_ever)

    return {
        "period": period,
        "overview": {
            "total_earned_alltime": (all_tips_ever[0]["total"] if all_tips_ever else 0) + all_emote_revenue,
            "tips_earned_period":   total_tips_tokens,
            "emotes_earned_period": total_emote_tokens,
            "total_earned_period":  total_tips_tokens + total_emote_tokens,
            "total_streams":        total_streams,
            "total_viewers":        total_viewers_all[0]["total"] if total_viewers_all else 0,
            "emote_count":          len(emotes_raw),
            "total_unlocks":        sum(e.get("unlock_count", 0) for e in emotes_raw),
        },
        "chart":            chart_days,
        "streams":          past_streams,
        "emote_performance": emote_performance,
    }


# ============== WEB PUSH NOTIFICATIONS ==============

class PushSubscribeRequest(BaseModel):
    endpoint: str
    keys: dict         # {p256dh: str, auth: str}
    expirationTime: Optional[float] = None

class PushUnsubscribeRequest(BaseModel):
    endpoint: str

@api_router.get("/push/vapid-key")
async def get_vapid_key(_: dict = Depends(get_current_user)):
    if not VAPID_PUBLIC_KEY:
        raise HTTPException(503, "Push notifications not configured")
    return {"public_key": VAPID_PUBLIC_KEY}

@api_router.post("/push/subscribe")
async def push_subscribe(req: PushSubscribeRequest, user: dict = Depends(get_current_user)):
    if not VAPID_PUBLIC_KEY:
        raise HTTPException(503, "Push notifications not configured")
    if _rate_limited(f"push_subscribe:{user['user_id']}", 10, 60):
        raise HTTPException(429, "Too many requests — slow down")
    await db.push_subscriptions.update_one(
        {"endpoint": req.endpoint},
        {"$set": {
            "user_id":    user["user_id"],
            "endpoint":   req.endpoint,
            "keys":       req.keys,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    return {"ok": True}

@api_router.delete("/push/subscribe")
async def push_unsubscribe(req: PushUnsubscribeRequest, user: dict = Depends(get_current_user)):
    await db.push_subscriptions.delete_one({
        "endpoint": req.endpoint,
        "user_id":  user["user_id"],
    })
    return {"ok": True}

class ApnsTokenRequest(BaseModel):
    device_token: str = Field(pattern=r"^[0-9a-fA-F]{64,200}$")
    environment: Literal["production", "sandbox"] = "production"

def _apns_configured() -> bool:
    return bool(APNS_KEY_ID and APNS_TEAM_ID and APNS_KEY and APNS_BUNDLE_ID)

@api_router.post("/push/apns")
async def apns_register(req: ApnsTokenRequest, user: dict = Depends(get_current_user)):
    if _rate_limited(f"apns_register:{user['user_id']}", 10, 60):
        raise HTTPException(429, "Too many requests — slow down")
    token = req.device_token.lower()
    # Upsert on the token so a device that changes hands moves to the new account.
    await db.apns_tokens.update_one(
        {"device_token": token},
        {"$set": {
            "user_id":      user["user_id"],
            "device_token": token,
            "environment":  req.environment,
            "updated_at":   datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    return {"ok": True}

@api_router.delete("/push/apns")
async def apns_unregister(req: ApnsTokenRequest, user: dict = Depends(get_current_user)):
    await db.apns_tokens.delete_one({"device_token": req.device_token.lower(), "user_id": user["user_id"]})
    return {"ok": True}

_apns_jwt: dict = {"token": None, "issued_at": 0.0}
_apns_client: Optional[httpx.AsyncClient] = None

def _apns_provider_token() -> str:
    # Apple rejects tokens older than 60 min and throttles refreshes more often than every
    # 20 min, so one token is reused for 50 min.
    now = time.time()
    if not _apns_jwt["token"] or now - _apns_jwt["issued_at"] > 50 * 60:
        _apns_jwt["token"] = jwt.encode(
            {"iss": APNS_TEAM_ID, "iat": int(now)},
            APNS_KEY,
            algorithm="ES256",
            headers={"kid": APNS_KEY_ID},
        )
        _apns_jwt["issued_at"] = now
    return _apns_jwt["token"]

def _apns_http() -> Optional[httpx.AsyncClient]:
    global _apns_client
    if _apns_client is None:
        try:
            _apns_client = httpx.AsyncClient(http2=True, timeout=10)
        except ImportError:
            logger.warning("h2 not installed — APNs push skipped")
            return None
    return _apns_client

async def _send_apns(user_id: str, title: str, body: str, url: str, tag: str):
    if not _apns_configured():
        return
    tokens = await db.apns_tokens.find({"user_id": user_id}, {"_id": 0}).to_list(10)
    if not tokens:
        return
    client = _apns_http()
    if client is None:
        return
    try:
        provider_token = _apns_provider_token()
    except Exception as exc:
        logger.error(f"APNs provider token failed — check APNS_KEY: {exc}")
        return

    payload = {"aps": {"alert": {"title": title, "body": body}, "sound": "default", "thread-id": tag}, "url": url}
    headers = {
        "authorization":   f"bearer {provider_token}",
        "apns-topic":      APNS_BUNDLE_ID,
        "apns-push-type":  "alert",
        "apns-priority":   "10",
        "apns-collapse-id": tag[:64],
    }
    dead = []
    for t in tokens:
        host = "api.sandbox.push.apple.com" if t.get("environment") == "sandbox" else "api.push.apple.com"
        try:
            r = await client.post(f"https://{host}/3/device/{t['device_token']}", json=payload, headers=headers)
        except httpx.HTTPError as exc:
            logger.warning(f"APNs request failed for {user_id}: {exc}")
            continue
        if r.status_code == 200:
            continue
        reason = ""
        try:
            reason = r.json().get("reason", "")
        except ValueError:
            pass
        logger.warning(f"APNs {r.status_code} {reason} for {user_id}")
        if r.status_code == 410 or reason in ("BadDeviceToken", "DeviceTokenNotForTopic"):
            dead.append(t["device_token"])
    if dead:
        await db.apns_tokens.delete_many({"device_token": {"$in": dead}})

# ---- Live Activities (Lock Screen / Dynamic Island countdowns) ----
# Started remotely with an ActivityKit push-to-start token (iOS 17.2+). The app renders
# them with VictoryActivityAttributes (ios/VictoryAI/Shared/VictoryActivityAttributes.swift).

APPLE_EPOCH_OFFSET = 978307200  # Swift's default Date coding counts from 2001-01-01


class LiveActivityTokenRequest(BaseModel):
    token: str = Field(pattern=r"^[0-9a-fA-F]{32,400}$")
    environment: Literal["production", "sandbox"] = "production"


@api_router.post("/push/live-activity-token")
async def register_live_activity_token(req: LiveActivityTokenRequest, user: dict = Depends(get_current_user)):
    if _rate_limited(f"la_token:{user['user_id']}", 10, 60):
        raise HTTPException(429, "Too many requests — slow down")
    token = req.token.lower()
    await db.live_activity_tokens.update_one(
        {"token": token},
        {"$set": {"user_id": user["user_id"], "token": token, "environment": req.environment,
                  "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"ok": True}


@api_router.delete("/push/live-activity-token")
async def unregister_live_activity_token(user: dict = Depends(get_current_user)):
    await db.live_activity_tokens.delete_many({"user_id": user["user_id"]})
    return {"ok": True}


def live_activity_payload(kind: str, headline: str, detail: str, ends_at: datetime, title: str, body: str,
                          now: Optional[datetime] = None) -> dict:
    now = now or datetime.now(timezone.utc)
    ends = ends_at.timestamp()
    return {"aps": {
        "timestamp": int(now.timestamp()),
        "event": "start",
        "content-state": {"headline": headline, "detail": detail,
                          "endsAt": ends - APPLE_EPOCH_OFFSET, "paused": False},
        "attributes-type": "VictoryActivityAttributes",
        "attributes": {"kind": kind},
        "alert": {"title": title, "body": body},
        "stale-date": int(ends),
        "dismissal-date": int(ends) + 15 * 60,
    }}


async def _send_live_activity(user_id: str, payload: dict):
    if not _apns_configured():
        return
    tokens = await db.live_activity_tokens.find({"user_id": user_id}, {"_id": 0}).to_list(10)
    client = _apns_http() if tokens else None
    if client is None:
        return
    headers = {
        "authorization": f"bearer {_apns_provider_token()}",
        "apns-topic": f"{APNS_BUNDLE_ID}.push-type.liveactivity",
        "apns-push-type": "liveactivity",
        "apns-priority": "10",
    }
    dead = []
    for t in tokens:
        host = "api.sandbox.push.apple.com" if t.get("environment") == "sandbox" else "api.push.apple.com"
        try:
            r = await client.post(f"https://{host}/3/device/{t['token']}", json=payload, headers=headers)
        except httpx.HTTPError as exc:
            logger.warning(f"Live Activity push failed for {user_id}: {exc}")
            continue
        if r.status_code == 410 or (r.status_code == 400 and "BadDeviceToken" in r.text):
            dead.append(t["token"])
        elif r.status_code != 200:
            logger.warning(f"Live Activity push {r.status_code} for {user_id}: {r.text[:200]}")
    if dead:
        await db.live_activity_tokens.delete_many({"token": {"$in": dead}})


_PUSH_KIND_RE = re.compile(r"[^a-z]")


def push_kind(tag: Optional[str]) -> str:
    return _PUSH_KIND_RE.sub("", (tag or "").split("-")[0].lower())[:20] or "push"


def tag_push_url(url: str, tag: Optional[str]) -> str:
    """Every push link says what kind of push it was (?src=booking), so a session started
    from it can be told apart from one the fighter started on their own."""
    if not url.startswith("/") or "src=" in url:
        return url
    return f"{url}{'&' if '?' in url else '?'}src={push_kind(tag)}"


async def _send_push(user_id: str, title: str, body: str, url: str = "/live", tag: str | None = None):
    """Fire-and-forget push to all web subscriptions and iOS devices for a user. Cleans up expired ones."""
    tag = tag or f"v-{uuid.uuid4().hex[:6]}"
    url = tag_push_url(url, tag)
    try:
        await _send_apns(user_id, title, body, url, tag)
    except Exception as exc:
        logger.warning(f"APNs push failed for {user_id}: {exc}")

    if not VAPID_PRIVATE_KEY or not VAPID_PUBLIC_KEY:
        return
    subs = await db.push_subscriptions.find({"user_id": user_id}, {"_id": 0}).to_list(10)
    if not subs:
        return

    try:
        from pywebpush import webpush, WebPushException
    except ImportError:
        logger.warning("pywebpush not installed — push skipped")
        return

    payload = json.dumps({"title": title, "body": body, "url": url, "tag": tag})
    loop = asyncio.get_running_loop()
    gone = []

    def send(sub):
        try:
            webpush(subscription_info={"endpoint": sub["endpoint"], "keys": sub["keys"]}, data=payload,
                    vapid_private_key=VAPID_PRIVATE_KEY, vapid_claims={"sub": VAPID_SUBJECT}, ttl=86400, timeout=10)
            return "sent"
        except WebPushException as exc:
            # An expired subscription is the browser saying "gone", not the push service failing,
            # so it must not count towards opening the breaker.
            if getattr(exc, "response", None) is not None and exc.response.status_code in (404, 410):
                return "gone"
            raise

    for sub in subs:
        try:
            result = await WEBPUSH_BREAKER.call(lambda sub=sub: loop.run_in_executor(_PUSH_POOL, send, sub))
        except CircuitOpen:
            logger.warning(f"Push skipped for {user_id}: web push breaker open")
            break
        except Exception as exc:
            logger.warning(f"Push failed for {user_id}: {exc}")
            continue
        if result == "gone":
            gone.append(sub["endpoint"])
    if gone:
        await db.push_subscriptions.delete_many({"endpoint": {"$in": gone}})


# ============== GYM ENDPOINTS ==============

@api_router.post("/gyms")
async def create_gym(gym_data: GymCreate, user: dict = Depends(get_current_user)):
    if not await check_subscription(user):
        raise HTTPException(status_code=403, detail="Pro subscription required to create a gym")
    if user.get("gym_id"):
        raise HTTPException(status_code=400, detail="Leave your current gym before creating a new one")
    if await is_content_flagged(gym_data.name) or await is_content_flagged(gym_data.description):
        raise HTTPException(status_code=400, detail="Gym content violates community guidelines")
    city = (gym_data.city or "").strip()
    if city and await is_content_flagged(city):
        raise HTTPException(status_code=400, detail="Gym content violates community guidelines")
    cap = gym_data.member_cap if gym_data.member_cap is not None else GYM_DEFAULT_CAP
    cap = max(GYM_MIN_CAP, min(GYM_MAX_CAP, cap))
    gym_id = f"gym_{uuid.uuid4().hex[:12]}"
    invite_code = uuid.uuid4().hex[:8].upper()
    gym_doc = {
        "gym_id": gym_id,
        "name": gym_data.name,
        "description": gym_data.description,
        "style": gym_data.style,
        "city": city or None,
        "member_cap": cap,
        "owner_id": user["user_id"],
        "members": [user["user_id"]],
        "is_public": gym_data.is_public,
        "invite_code": invite_code,
        "avg_score": 0.0,
        "total_sessions": 0,
        "member_count": 1,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.gyms.insert_one(gym_doc)
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"gym_id": gym_id}})
    await check_and_award_belts(user["user_id"])
    gym_doc.pop("_id", None)
    return gym_doc

@api_router.get("/gyms/my")
async def get_my_gym(user: dict = Depends(get_current_user)):
    if not user.get("gym_id"):
        return None
    gym = await db.gyms.find_one({"gym_id": user["gym_id"]}, {"_id": 0})
    if not gym:
        return None
    week_cutoff = (datetime.now(timezone.utc).date() - timedelta(days=6)).strftime("%Y-%m-%d")
    members = []
    for uid in gym.get("members", []):
        u = await db.users.find_one({"user_id": uid}, {"_id": 0, "password": 0})
        if u:
            sessions = await db.sessions.find({"user_id": uid}).to_list(10000)
            avg = _avg_score(sessions)
            weekly_sessions = len({s["date"] for s in sessions if s.get("date", "") >= week_cutoff})
            members.append({**safe_user(u), "avg_score": avg, "total_sessions": len(sessions), "weekly_sessions": weekly_sessions})
    gym["members_detail"] = sorted(members, key=lambda m: m.get("avg_score", 0), reverse=True)
    gym.update(_gym_capacity(gym))
    return gym

@api_router.get("/schools/leaderboard")
async def get_school_leaderboard(user: dict = Depends(get_current_user)):
    """Real school-vs-school competition — the school-specific version of phase 3's
    "school-based leaderboards". Deliberately aggregate-only: this returns a school's
    name, member count, and real training totals, never which individual users belong
    to it. A stranger being able to look up which specific named users attend a given
    school is a real safety risk for a mostly-teenage user base (the same concern that's
    driven "school tag" controversies on other apps), so unlike Gyms/Squads there is no
    per-school member list or join mechanism here at all — school_name is just a
    self-reported profile field (like weight_class or stance), set once in Profile
    settings, and this endpoint only ever aggregates over it.
    """
    week_ago = (datetime.now(timezone.utc).date() - timedelta(days=6)).strftime("%Y-%m-%d")
    pipeline = [
        {"$match": {"school_name": {"$nin": [None, ""]}}},
        {"$group": {"_id": "$school_name", "member_count": {"$sum": 1}, "user_ids": {"$push": "$user_id"}}},
    ]
    grouped = await db.users.aggregate(pipeline).to_list(500)

    results = []
    for g in grouped:
        sessions_this_week = await db.sessions.count_documents({"user_id": {"$in": g["user_ids"]}, "date": {"$gte": week_ago}})
        results.append({
            "school_name": g["_id"],
            "member_count": g["member_count"],
            "sessions_this_week": sessions_this_week,
            "is_my_school": g["_id"] == user.get("school_name"),
        })
    # ponytail: recomputes every school's weekly session count on every request — fine
    # at current scale (a handful of count_documents calls per request), revisit with a
    # cached/precomputed tally if this list gets long enough to matter.
    results.sort(key=lambda r: r["sessions_this_week"], reverse=True)
    return results[:100]

@api_router.get("/gyms/leaderboard")
async def get_gym_leaderboard(user: dict = Depends(get_current_user)):
    gyms = await db.gyms.find({"is_public": True}, {"_id": 0}).sort("avg_score", -1).to_list(50)
    return [
        {
            "gym_id": g["gym_id"],
            "name": g["name"],
            "style": g.get("style"),
            "city": g.get("city"),
            "avg_score": g.get("avg_score", 0),
            "member_count": g.get("member_count", 0),
            "total_sessions": g.get("total_sessions", 0),
            "is_my_gym": g["gym_id"] == user.get("gym_id"),
            **_gym_capacity(g),
        }
        for g in gyms
    ]

@api_router.get("/gyms/{gym_id}")
async def get_gym(gym_id: str, user: dict = Depends(get_current_user)):
    gym = await db.gyms.find_one({"gym_id": gym_id}, {"_id": 0})
    if not gym:
        raise HTTPException(status_code=404, detail="Gym not found")
    if not gym.get("is_public") and user["user_id"] not in gym.get("members", []):
        raise HTTPException(status_code=403, detail="Private gym")
    week_cutoff = (datetime.now(timezone.utc).date() - timedelta(days=6)).strftime("%Y-%m-%d")
    members = []
    for uid in gym.get("members", []):
        u = await db.users.find_one({"user_id": uid}, {"_id": 0, "password": 0})
        if u:
            sessions = await db.sessions.find({"user_id": uid}).to_list(10000)
            avg = _avg_score(sessions)
            weekly_sessions = len({s["date"] for s in sessions if s.get("date", "") >= week_cutoff})
            members.append({**safe_user(u), "avg_score": avg, "total_sessions": len(sessions), "weekly_sessions": weekly_sessions})
    gym["members_detail"] = sorted(members, key=lambda m: m.get("avg_score", 0), reverse=True)
    gym["is_member"] = user["user_id"] in gym.get("members", [])
    gym["is_owner"] = gym["owner_id"] == user["user_id"]
    gym.update(_gym_capacity(gym))
    posts = await db.posts.find({"gym_id": gym_id}, {"_id": 0}).sort("created_at", -1).to_list(10)
    for p in posts:
        poster = await db.users.find_one({"user_id": p["user_id"]}, {"_id": 0, "password": 0})
        p["author"] = safe_user(poster) if poster else {"display_name": "Unknown"}
    gym["recent_posts"] = posts
    return gym

@api_router.get("/gyms")
async def browse_gyms(user: dict = Depends(get_current_user), city: str = Query("")):
    query: dict = {"is_public": True}
    if city.strip():
        # Self-reported free text, so case-insensitive exact match on the trimmed string —
        # good enough for "London" == "london"; not trying to unify "NYC"/"New York".
        query["city"] = {"$regex": f"^{re.escape(city.strip())}$", "$options": "i"}
    # ponytail: capped at 50, sorted by reputation — fine now; if gym count outgrows that,
    # this needs real pagination and the city filter needs to move fully server-side.
    gyms = await db.gyms.find(query, {"_id": 0}).sort("avg_score", -1).to_list(50)
    return [
        {**g, "is_member": user["user_id"] in g.get("members", []), **_gym_capacity(g)}
        for g in gyms
    ]

# Atomic "add me only if there's still room" — the $expr in the filter means two people
# racing for the last spot can't both win.
_GYM_HAS_ROOM = {"$expr": {"$lt": [
    {"$size": {"$ifNull": ["$members", []]}},
    {"$ifNull": ["$member_cap", GYM_DEFAULT_CAP]},
]}}

@api_router.post("/gyms/{gym_id}/join")
async def join_gym(gym_id: str, user: dict = Depends(get_current_user)):
    gym = await db.gyms.find_one({"gym_id": gym_id})
    if not gym:
        raise HTTPException(status_code=404, detail="Gym not found")
    if user["user_id"] in gym.get("members", []):
        raise HTTPException(status_code=400, detail="Already a member")
    if user.get("gym_id"):
        raise HTTPException(status_code=400, detail="Leave your current gym first")
    if _gym_capacity(gym)["is_full"]:
        raise HTTPException(status_code=400, detail="This gym is full")
    joined = await db.gyms.update_one(
        {"gym_id": gym_id, "members": {"$ne": user["user_id"]}, **_GYM_HAS_ROOM},
        {"$addToSet": {"members": user["user_id"]}, "$inc": {"member_count": 1}}
    )
    if joined.modified_count == 0:
        # Lost the race for the last spot (or a concurrent join). Re-check to give the
        # right message rather than a misleading "already a member".
        fresh = await db.gyms.find_one({"gym_id": gym_id})
        if fresh and _gym_capacity(fresh)["is_full"]:
            raise HTTPException(status_code=400, detail="This gym is full")
        raise HTTPException(status_code=400, detail="Already a member")
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"gym_id": gym_id}})
    await _recalculate_gym_stats(gym_id)
    await check_and_award_belts(user["user_id"])
    return {"message": "Joined gym", "gym_id": gym_id}

@api_router.post("/gyms/{gym_id}/leave")
async def leave_gym(gym_id: str, user: dict = Depends(get_current_user)):
    gym = await db.gyms.find_one({"gym_id": gym_id})
    if not gym:
        raise HTTPException(status_code=404, detail="Gym not found")
    if gym["owner_id"] == user["user_id"]:
        raise HTTPException(status_code=400, detail="Gym owner cannot leave — delete the gym instead")
    if user.get("gym_id") != gym_id:
        raise HTTPException(status_code=400, detail="You're not a member of this gym")
    result = await db.gyms.update_one(
        {"gym_id": gym_id, "members": user["user_id"]},
        {"$pull": {"members": user["user_id"]}, "$inc": {"member_count": -1}}
    )
    if result.modified_count:
        await db.users.update_one({"user_id": user["user_id"]}, {"$unset": {"gym_id": ""}})
    return {"message": "Left gym"}

@api_router.delete("/gyms/{gym_id}")
async def delete_gym(gym_id: str, user: dict = Depends(get_current_user)):
    gym = await db.gyms.find_one({"gym_id": gym_id})
    if not gym:
        raise HTTPException(status_code=404, detail="Gym not found")
    if gym["owner_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Only the gym owner can delete this gym")
    members = gym.get("members", [])
    if members:
        await db.users.update_many({"user_id": {"$in": members}, "gym_id": gym_id}, {"$unset": {"gym_id": ""}})
    await db.gyms.delete_one({"gym_id": gym_id})
    return {"message": "Gym deleted"}

@api_router.post("/gyms/join-by-code")
async def join_gym_by_code(request: Request, user: dict = Depends(get_current_user)):
    if _rate_limited(f"gym_join_code:{user['user_id']}", 10, 60):
        raise HTTPException(429, "Too many attempts — slow down")
    body = await request.json()
    invite_code = body.get("invite_code", "").upper().strip()
    if not invite_code:
        raise HTTPException(status_code=400, detail="invite_code required")
    gym = await db.gyms.find_one({"invite_code": invite_code})
    if not gym:
        raise HTTPException(status_code=404, detail="Invalid invite code")
    if user["user_id"] in gym.get("members", []):
        raise HTTPException(status_code=400, detail="Already a member")
    if user.get("gym_id"):
        raise HTTPException(status_code=400, detail="Leave your current gym first")
    if _gym_capacity(gym)["is_full"]:
        raise HTTPException(status_code=400, detail="This gym is full")
    gym_id = gym["gym_id"]
    joined = await db.gyms.update_one(
        {"gym_id": gym_id, "members": {"$ne": user["user_id"]}, **_GYM_HAS_ROOM},
        {"$addToSet": {"members": user["user_id"]}, "$inc": {"member_count": 1}}
    )
    if joined.modified_count == 0:
        fresh = await db.gyms.find_one({"gym_id": gym_id})
        if fresh and _gym_capacity(fresh)["is_full"]:
            raise HTTPException(status_code=400, detail="This gym is full")
        raise HTTPException(status_code=400, detail="Already a member")
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"gym_id": gym_id}})
    await _recalculate_gym_stats(gym_id)
    return {"message": "Joined gym", "gym_id": gym_id, "gym_name": gym["name"]}

# ============== SQUAD CHALLENGES ==============
# A squad is a lightweight, free friend group (max 8) with a real weekly leaderboard —
# "sessions logged this week", nothing fabricated or pre-filled. Deliberately NOT gated
# behind a Pro subscription like gyms are: this is the core free social/motivation loop,
# and a mostly-teenage audience is much less likely to hold a paid subscription (usually
# needs a parent's card) than an adult one. Unlike a gym, a user can be in several squads
# at once — squads model casual friend groups, not a single home-training-facility.

MAX_SQUAD_SIZE = 8
MAX_SQUADS_PER_USER = 5

class SquadCreate(BaseModel):
    name: str = Field(..., max_length=40)

@api_router.post("/squads")
async def create_squad(squad_data: SquadCreate, user: dict = Depends(get_current_user)):
    if _rate_limited(f"squad_create:{user['user_id']}", 5, 3600):
        raise HTTPException(429, "Too many squads created — try again later")
    if await is_content_flagged(squad_data.name):
        raise HTTPException(400, "Squad name violates community guidelines")
    if await db.squads.count_documents({"members": user["user_id"]}) >= MAX_SQUADS_PER_USER:
        raise HTTPException(400, f"You're already in {MAX_SQUADS_PER_USER} squads — leave one to create another")
    squad_id = f"squad_{uuid.uuid4().hex[:12]}"
    squad_doc = {
        "squad_id": squad_id,
        "name": squad_data.name,
        "owner_id": user["user_id"],
        "members": [user["user_id"]],
        "invite_code": uuid.uuid4().hex[:8].upper(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.squads.insert_one(squad_doc)
    squad_doc.pop("_id", None)
    return squad_doc

@api_router.post("/squads/join-by-code")
async def join_squad_by_code(request: Request, user: dict = Depends(get_current_user)):
    if _rate_limited(f"squad_join_code:{user['user_id']}", 10, 60):
        raise HTTPException(429, "Too many attempts — slow down")
    body = await request.json()
    invite_code = (body.get("invite_code") or "").upper().strip()
    if not invite_code:
        raise HTTPException(status_code=400, detail="invite_code required")
    squad = await db.squads.find_one({"invite_code": invite_code})
    if not squad:
        raise HTTPException(status_code=404, detail="Invalid invite code")
    await _join_squad(user, squad)
    return {"message": "Joined squad", "squad_id": squad["squad_id"], "name": squad["name"]}

async def _join_squad(user: dict, squad: dict):
    if user["user_id"] in squad.get("members", []):
        raise HTTPException(status_code=400, detail="Already a member")
    if len(squad.get("members", [])) >= MAX_SQUAD_SIZE:
        raise HTTPException(status_code=400, detail=f"Squad is full (max {MAX_SQUAD_SIZE})")
    if await db.squads.count_documents({"members": user["user_id"]}) >= MAX_SQUADS_PER_USER:
        raise HTTPException(status_code=400, detail=f"You're already in {MAX_SQUADS_PER_USER} squads — leave one to join another")
    if await _is_blocked(user["user_id"], squad["owner_id"]):
        raise HTTPException(status_code=403, detail="Can't join this squad")
    joined = await db.squads.update_one(
        {"squad_id": squad["squad_id"], "members": {"$ne": user["user_id"]}},
        {"$addToSet": {"members": user["user_id"]}},
    )
    if joined.modified_count == 0:
        raise HTTPException(status_code=400, detail="Already a member")

@api_router.get("/squads/mine")
async def get_my_squads(user: dict = Depends(get_current_user)):
    squads = await db.squads.find({"members": user["user_id"]}, {"_id": 0}).to_list(MAX_SQUADS_PER_USER)
    for sq in squads:
        sq["member_count"] = len(sq.get("members", []))
    return squads

# ---- Invite links ----
# Only offered straight after a win, never in onboarding: nobody vouches for an app they
# haven't tried. The link carries the win itself (server-verified), so sharing it is a
# brag first and an invite second.

INVITE_TTL_DAYS = 14
INVITES_PER_DAY = 20


class InviteCreate(BaseModel):
    dimension: Optional[str] = Field(None, max_length=40)
    squad_id: Optional[str] = Field(None, max_length=40)


def invite_brag(first_name: str, dimension: Optional[str], pb: Optional[float], rank: Optional[str]) -> str:
    if dimension and isinstance(pb, (int, float)):
        return f"{first_name} just set a {dimension} personal best of {pb:g}. Think you can beat it?"
    if rank:
        return f"{first_name} is ranked {rank} this season. Come and train with the squad."
    return f"{first_name} wants you in their squad."


async def _squad_for_invite(user: dict, squad_id: Optional[str]) -> dict:
    uid = user["user_id"]
    if squad_id:
        squad = await db.squads.find_one({"squad_id": squad_id, "members": uid})
        if not squad:
            raise HTTPException(404, "Squad not found")
        return squad
    mine = await db.squads.find({"members": uid}).to_list(MAX_SQUADS_PER_USER)
    open_squads = [sq for sq in mine if len(sq.get("members", [])) < MAX_SQUAD_SIZE]
    if open_squads:
        return next((sq for sq in open_squads if sq["owner_id"] == uid), open_squads[0])
    if len(mine) >= MAX_SQUADS_PER_USER:
        raise HTTPException(400, "All your squads are full")
    first = (user.get("display_name") or user.get("name") or "My").split()[0][:30]
    squad = {
        "squad_id": f"squad_{uuid.uuid4().hex[:12]}",
        "name": f"{first}'s Squad",
        "owner_id": uid,
        "members": [uid],
        "invite_code": uuid.uuid4().hex[:8].upper(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.squads.insert_one(squad)
    return squad


@api_router.post("/squads/invites")
async def create_squad_invite(data: InviteCreate, user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    if not await db.sessions.find_one({"user_id": uid, "scored": True}, {"_id": 1}):
        raise HTTPException(400, "Finish a scored session first")
    if _rate_limited(f"squad_invite:{uid}", INVITES_PER_DAY, 86400):
        raise HTTPException(429, "That's enough invites for today")
    pb = None
    if data.dimension:
        if data.dimension != "Overall" and data.dimension not in DIMENSIONS:
            raise HTTPException(400, "Unknown skill")
        fresh = await db.users.find_one({"user_id": uid}, {"personal_bests": 1}) or {}
        pb = (fresh.get("personal_bests") or {}).get(_pb_key(data.dimension))
    season = current_season()
    stats = await db.season_stats.find_one({"user_id": uid, "season_id": season["season_id"]}, {"points": 1}) or {}
    standing = season_rank(stats.get("points", 0))
    rank = standing["rank"] if standing["rank_index"] > 0 else None
    squad = await _squad_for_invite(user, data.squad_id)
    first = (user.get("display_name") or user.get("name") or "Your mate").split()[0][:30]
    now = datetime.now(timezone.utc)
    invite = {
        "invite_id": uuid.uuid4().hex[:10],
        "squad_id": squad["squad_id"],
        "inviter_id": uid,
        "brag": invite_brag(first, data.dimension if isinstance(pb, (int, float)) else None, pb, rank),
        "accepted": 0,
        "created_at": now.isoformat(),
        "expires_at": (now + timedelta(days=INVITE_TTL_DAYS)).isoformat(),
    }
    await db.squad_invites.insert_one(invite)
    return {"invite_id": invite["invite_id"], "path": f"/join/{invite['invite_id']}",
            "brag": invite["brag"], "squad": {"squad_id": squad["squad_id"], "name": squad["name"]}}


async def _live_invite(invite_id: str) -> dict:
    invite = await db.squad_invites.find_one({"invite_id": invite_id}, {"_id": 0})
    if not invite or invite["expires_at"] < datetime.now(timezone.utc).isoformat():
        raise HTTPException(404, "This invite has expired")
    squad = await db.squads.find_one({"squad_id": invite["squad_id"]}, {"_id": 0})
    if not squad:
        raise HTTPException(404, "This squad no longer exists")
    return {"invite": invite, "squad": squad}


@api_router.get("/invites/{invite_id}")
async def preview_invite(invite_id: str, request: Request):
    client_ip = request.client.host if request.client else "unknown"
    if _rate_limited(f"invite_preview:{client_ip}", 30, 60):
        raise HTTPException(429, "Too many requests — slow down")
    found = await _live_invite(invite_id[:20])
    invite, squad = found["invite"], found["squad"]
    inviter = await db.users.find_one({"user_id": invite["inviter_id"]}, {"_id": 0, "display_name": 1, "name": 1, "picture": 1, "avatar_url": 1}) or {}
    return {
        "squad_name": squad["name"],
        "member_count": len(squad.get("members", [])),
        "full": len(squad.get("members", [])) >= MAX_SQUAD_SIZE,
        "inviter_name": inviter.get("display_name") or inviter.get("name") or "A fighter",
        "inviter_picture": inviter.get("avatar_url") or inviter.get("picture"),
        "brag": invite["brag"],
    }


@api_router.post("/invites/{invite_id}/accept")
async def accept_invite(invite_id: str, user: dict = Depends(get_current_user)):
    if _rate_limited(f"invite_accept:{user['user_id']}", 10, 60):
        raise HTTPException(429, "Too many attempts — slow down")
    found = await _live_invite(invite_id[:20])
    invite, squad = found["invite"], found["squad"]
    if user["user_id"] in squad.get("members", []):
        return {"squad_id": squad["squad_id"], "name": squad["name"], "already_member": True}
    await _join_squad(user, squad)
    await db.squad_invites.update_one({"invite_id": invite["invite_id"]}, {"$inc": {"accepted": 1}})
    await db.users.update_one({"user_id": user["user_id"], "invited_by": {"$exists": False}},
                              {"$set": {"invited_by": invite["inviter_id"]}})
    if invite["inviter_id"] != user["user_id"]:
        name = (user.get("display_name") or user.get("name") or "Someone").split()[0][:30]
        await _send_push(invite["inviter_id"], title=f"{name} joined {squad['name']}",
                         body="Your invite worked. Now beat them this week.",
                         url=f"/squads/{squad['squad_id']}", tag=f"squadjoin-{squad['squad_id']}")
    return {"squad_id": squad["squad_id"], "name": squad["name"], "already_member": False}


@api_router.get("/squads/{squad_id}")
async def get_squad(squad_id: str, user: dict = Depends(get_current_user)):
    squad = await db.squads.find_one({"squad_id": squad_id}, {"_id": 0})
    if not squad:
        raise HTTPException(status_code=404, detail="Squad not found")
    if user["user_id"] not in squad.get("members", []):
        raise HTTPException(status_code=403, detail="Not a member of this squad")

    # Real "sessions logged this week" per member — same 7-day window and same
    # sessions-collection ground truth as _week_activity()/the streak heatmap. No
    # fabricated head start, no invented metric: whoever actually trained more this
    # week is actually first.
    week_ago = (datetime.now(timezone.utc).date() - timedelta(days=6)).strftime("%Y-%m-%d")
    leaderboard = []
    for uid in squad["members"]:
        member = await db.users.find_one({"user_id": uid}, {"_id": 0, "password": 0})
        if not member:
            continue
        entry = safe_user(member)
        entry["sessions_this_week"] = await db.sessions.count_documents({"user_id": uid, "date": {"$gte": week_ago}})
        leaderboard.append(entry)
    leaderboard.sort(key=lambda m: m["sessions_this_week"], reverse=True)

    squad["leaderboard"] = leaderboard
    squad["is_owner"] = squad["owner_id"] == user["user_id"]
    return squad

@api_router.post("/squads/{squad_id}/leave")
async def leave_squad(squad_id: str, user: dict = Depends(get_current_user)):
    squad = await db.squads.find_one({"squad_id": squad_id})
    if not squad:
        raise HTTPException(status_code=404, detail="Squad not found")
    if squad["owner_id"] == user["user_id"]:
        remaining = [m for m in squad.get("members", []) if m != user["user_id"]]
        if remaining:
            # Ownership passes to whoever's been in the squad longest (members[0] after
            # the leaving owner is removed) rather than leaving it ownerless.
            await db.squads.update_one({"squad_id": squad_id}, {"$set": {"owner_id": remaining[0]}, "$pull": {"members": user["user_id"]}})
            return {"message": "Left squad — ownership transferred"}
        await db.squads.delete_one({"squad_id": squad_id})
        return {"message": "Squad deleted (you were the only member)"}
    result = await db.squads.update_one({"squad_id": squad_id}, {"$pull": {"members": user["user_id"]}})
    if result.modified_count == 0:
        raise HTTPException(status_code=400, detail="You're not a member of this squad")
    return {"message": "Left squad"}

@api_router.delete("/squads/{squad_id}")
async def delete_squad(squad_id: str, user: dict = Depends(get_current_user)):
    squad = await db.squads.find_one({"squad_id": squad_id})
    if not squad:
        raise HTTPException(status_code=404, detail="Squad not found")
    if squad["owner_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Only the squad creator can delete this squad")
    await db.squads.delete_one({"squad_id": squad_id})
    return {"message": "Squad deleted"}

# ============== FEED / POSTS ENDPOINTS ==============

@api_router.post("/posts")
async def create_post(request: Request, post_data: PostCreate, user: dict = Depends(get_current_user)):
    if _rate_limited(f"posts:{user['user_id']}", 10, 60):
        raise HTTPException(429, "Too many posts — slow down")
    if await is_content_flagged(post_data.caption):
        raise HTTPException(400, "Caption violates community guidelines")
    post_id = f"post_{uuid.uuid4().hex[:12]}"
    post_doc = {
        "post_id": post_id,
        "user_id": user["user_id"],
        "gym_id": user.get("gym_id"),
        "video_url": post_data.video_url,
        "thumbnail_url": post_data.thumbnail_url,
        "caption": post_data.caption,
        "post_type": post_data.post_type,
        "tags": post_data.tags,
        "likes": [],
        "like_count": 0,
        "comment_count": 0,
        "share_count": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.posts.insert_one(post_doc)
    post_doc.pop("_id", None)
    post_doc["author"] = safe_user(user)
    post_doc["liked_by_me"] = False
    return post_doc

@api_router.get("/feed")
async def get_feed(
    feed_type: str = Query("global", enum=["global", "following", "gym"]),
    page: int = Query(1, ge=1),
    user: dict = Depends(get_current_user),
):
    limit = 20
    skip = (page - 1) * limit
    query: dict = {"is_hidden": {"$ne": True}}
    if feed_type == "following":
        follows = await db.follows.find({"follower_id": user["user_id"]}, {"following_id": 1}).to_list(10000)
        following_ids = [f["following_id"] for f in follows] + [user["user_id"]]
        query["user_id"] = {"$in": following_ids}
    elif feed_type == "gym" and user.get("gym_id"):
        query["gym_id"] = user["gym_id"]
    posts = await db.posts.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    enriched = []
    for post in posts:
        author = await db.users.find_one({"user_id": post["user_id"]}, {"_id": 0, "password": 0})
        post["author"] = safe_user(author) if author else {"display_name": "Unknown", "name": "Unknown"}
        post["liked_by_me"] = user["user_id"] in post.get("likes", [])
        post.pop("likes", None)
        enriched.append(post)
    return {"posts": enriched, "page": page, "has_more": len(posts) == limit}

@api_router.post("/posts/{post_id}/like")
async def toggle_like(post_id: str, user: dict = Depends(get_current_user)):
    post = await db.posts.find_one({"post_id": post_id})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    user_id = user["user_id"]
    if user_id in post.get("likes", []):
        await db.posts.update_one({"post_id": post_id}, {"$pull": {"likes": user_id}, "$inc": {"like_count": -1}})
        await db.notifications.delete_one({"type": "like", "actor_id": user_id, "post_id": post_id})
        return {"liked": False}
    await db.posts.update_one({"post_id": post_id}, {"$addToSet": {"likes": user_id}, "$inc": {"like_count": 1}})
    # Write notification to post owner (skip self-likes)
    if post["user_id"] != user_id:
        try:
            await db.notifications.insert_one({
                "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
                "recipient_id": post["user_id"],
                "actor_id": user_id,
                "type": "like",
                "post_id": post_id,
                "read": False,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
            actor_name = user.get("display_name") or user.get("name", "Someone")
            await _send_push(
                post["user_id"],
                title=f"{actor_name} liked your post",
                body="Tap to see it",
                url=f"/profile/{post['user_id']}",
                tag=f"like-{post_id}",
            )
        except Exception: pass
    return {"liked": True}

@api_router.delete("/posts/{post_id}")
async def delete_post(post_id: str, user: dict = Depends(get_current_user)):
    post = await db.posts.find_one({"post_id": post_id})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    if post["user_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Not your post")
    await db.posts.delete_one({"post_id": post_id})
    await db.comments.delete_many({"post_id": post_id})
    return {"message": "Post deleted"}

@api_router.get("/posts/{post_id}")
async def get_post(post_id: str, user: dict = Depends(get_current_user)):
    post = await db.posts.find_one({"post_id": post_id, "is_hidden": {"$ne": True}}, {"_id": 0})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    author = await db.users.find_one({"user_id": post["user_id"]}, {"_id": 0, "password": 0})
    post["author"] = safe_user(author) if author else {"display_name": "Unknown"}
    post["liked_by_me"] = user["user_id"] in post.get("likes", [])
    post.pop("likes", None)
    return post

@api_router.post("/posts/{post_id}/share")
async def share_post(post_id: str, user: dict = Depends(get_current_user)):
    post = await db.posts.find_one({"post_id": post_id})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    await db.posts.update_one({"post_id": post_id}, {"$inc": {"share_count": 1}})
    new_count = (post.get("share_count") or 0) + 1
    # Push notify the post owner
    if post["user_id"] != user["user_id"]:
        sharer_name = user.get("display_name") or user.get("name", "Someone")
        asyncio.create_task(_send_push(
            post["user_id"],
            title=f"{sharer_name} shared your clip",
            body="Your clip is spreading — keep going!",
            url=f"/clip/{post_id}",
            tag=f"share-{post_id}",
        ))
    return {"share_count": new_count}

# ============== TRENDING CLIPS ==============

VIRAL_THRESHOLD = 50   # share_count to earn the flame badge

@api_router.get("/clips/trending")
async def trending_clips(
    period: str = Query("24h", enum=["24h", "7d", "all"]),
    page: int = Query(1, ge=1),
    user: dict = Depends(get_current_user),
):
    limit = 20
    skip  = (page - 1) * limit

    query: dict = {"video_url": {"$exists": True, "$ne": ""}, "is_hidden": {"$ne": True}}
    if period == "24h":
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
        query["created_at"] = {"$gte": cutoff}
    elif period == "7d":
        cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
        query["created_at"] = {"$gte": cutoff}

    posts = await db.posts.find(query, {"_id": 0}).to_list(500)

    # Viral score: shares weighted heaviest
    def viral_score(p):
        return (p.get("share_count") or 0) * 5 + (p.get("like_count") or 0) * 3 + (p.get("comment_count") or 0) * 2

    posts.sort(key=viral_score, reverse=True)
    page_posts = posts[skip: skip + limit]

    result = []
    for p in page_posts:
        author = await db.users.find_one({"user_id": p["user_id"]}, {"_id": 0, "password": 0})
        p["author"] = safe_user(author) if author else {"display_name": "Unknown"}
        p["liked_by_me"] = user["user_id"] in p.get("likes", [])
        p["is_viral"] = (p.get("share_count") or 0) >= VIRAL_THRESHOLD
        p.pop("likes", None)
        result.append(p)

    return {
        "clips": result,
        "page": page,
        "has_more": (skip + limit) < len(posts),
        "viral_threshold": VIRAL_THRESHOLD,
    }

@api_router.post("/posts/{post_id}/comments")
async def add_comment(request: Request, post_id: str, comment_data: CommentCreate, user: dict = Depends(get_current_user)):
    if _rate_limited(f"comment:{user['user_id']}", 20, 60):
        raise HTTPException(429, "Too many comments — slow down")
    if await is_content_flagged(comment_data.text):
        raise HTTPException(400, "Comment violates community guidelines")
    post = await db.posts.find_one({"post_id": post_id})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    if post["user_id"] != user["user_id"] and await _is_blocked(user["user_id"], post["user_id"]):
        raise HTTPException(status_code=403, detail="Can't comment on this post")
    comment_doc = {
        "comment_id": f"cmt_{uuid.uuid4().hex[:12]}",
        "post_id": post_id,
        "user_id": user["user_id"],
        "text": comment_data.text,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.comments.insert_one(comment_doc)
    await db.posts.update_one({"post_id": post_id}, {"$inc": {"comment_count": 1}})
    comment_doc.pop("_id", None)
    comment_doc["author"] = safe_user(user)
    # Notify post owner (skip self-comments)
    if post["user_id"] != user["user_id"]:
        try:
            await db.notifications.insert_one({
                "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
                "recipient_id": post["user_id"],
                "actor_id": user["user_id"],
                "type": "comment",
                "post_id": post_id,
                "text": comment_data.text[:200],
                "read": False,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
            actor_name = user.get("display_name") or user.get("name", "Someone")
            preview = comment_data.text[:60] + ("…" if len(comment_data.text) > 60 else "")
            await _send_push(
                post["user_id"],
                title=f"{actor_name} commented on your post",
                body=f'"{preview}"',
                url=f"/profile/{post['user_id']}",
                tag=f"comment-{post_id}",
            )
        except Exception: pass
    return comment_doc

@api_router.get("/posts/{post_id}/comments")
async def get_comments(post_id: str, user: dict = Depends(get_current_user)):
    comments = await db.comments.find(
        {"post_id": post_id, "is_hidden": {"$ne": True}}, {"_id": 0}
    ).sort("created_at", 1).to_list(100)
    for c in comments:
        author = await db.users.find_one({"user_id": c["user_id"]}, {"_id": 0, "password": 0})
        c["author"] = safe_user(author) if author else {"display_name": "Unknown", "name": "Unknown"}
    return comments

# ============== HOME FOR-YOU FEED ==============

@api_router.get("/home/feed")
async def home_for_you_feed(user: dict = Depends(get_current_user)):
    """Personalised For You feed: live streams + posts ranked by relevance."""
    user_id      = user["user_id"]
    weight_class = (user.get("weight_class") or "").lower()
    category     = (user.get("category") or "").lower()

    # Following set for boosting
    follows = await db.follows.find({"follower_id": user_id}, {"following_id": 1}).to_list(5000)
    following_ids = {f["following_id"] for f in follows}

    # Fetch streams (live first, then recent)
    streams = await db.streams.find({"is_hidden": {"$ne": True}}, {"_id": 0, "stream_key": 0}).sort(
        [("status", -1), ("viewer_count", -1)]
    ).limit(30).to_list(30)

    # Fetch posts from last 14 days
    cutoff = (datetime.now(timezone.utc) - timedelta(days=14)).isoformat()
    posts = await db.posts.find(
        {"created_at": {"$gte": cutoff}, "is_hidden": {"$ne": True}}, {"_id": 0}
    ).sort("created_at", -1).limit(50).to_list(50)

    now_ts = datetime.now(timezone.utc).timestamp()

    def score_stream(s):
        sc = 0.0
        if s.get("status") == "live":  sc += 60
        elif s.get("status") == "idle": sc += 5
        if weight_class and (s.get("weight_class") or "").lower() == weight_class: sc += 35
        if category     and (s.get("category")     or "").lower() == category:     sc += 25
        if s.get("user_id") in following_ids: sc += 50
        sc += min((s.get("viewer_count") or 0) * 0.5, 25)
        return sc

    def score_post(p):
        sc = 0.0
        if p.get("user_id") in following_ids: sc += 50
        sc += min((p.get("like_count")    or 0) * 3, 30)
        sc += min((p.get("comment_count") or 0) * 2, 20)
        sc += min((p.get("share_count")   or 0) * 5, 40)  # viral boost
        try:
            age_h = (now_ts - datetime.fromisoformat(p["created_at"]).timestamp()) / 3600
            sc += max(0.0, 40 - age_h * 1.5)
        except Exception: pass
        for tag in (p.get("tags") or []):
            if weight_class and weight_class in tag.lower(): sc += 10
            if category     and category     in tag.lower(): sc += 8
        return sc

    scored_streams = sorted(
        [{"type": "stream", "score": score_stream(s), "data": s} for s in streams],
        key=lambda x: x["score"], reverse=True
    )
    scored_posts = sorted(
        [{"type": "post", "score": score_post(p), "data": p} for p in posts],
        key=lambda x: x["score"], reverse=True
    )

    # Live streams surface first (up to 3), then interleave rest
    live_items   = [x for x in scored_streams if x["data"].get("status") == "live"][:3]
    other_streams = [x for x in scored_streams if x not in live_items]

    result = list(live_items)
    si = pi = 0
    for i in range(min(27, len(other_streams) + len(scored_posts))):
        # Inject a stream every 4th slot after the live block
        if si < len(other_streams) and (pi >= len(scored_posts) or i % 4 == 0):
            result.append(other_streams[si]); si += 1
        elif pi < len(scored_posts):
            result.append(scored_posts[pi]); pi += 1

    # Enrich items
    final = []
    for item in result[:30]:
        d = item["data"]
        if item["type"] == "post":
            author = await db.users.find_one({"user_id": d["user_id"]}, {"_id": 0, "password": 0})
            d["author"]      = safe_user(author) if author else {"display_name": "Unknown"}
            d["liked_by_me"] = user_id in d.get("likes", [])
            d.pop("likes", None)
        else:
            streamer = await db.users.find_one({"user_id": d["user_id"]}, {"_id": 0, "password": 0})
            if streamer:
                d["display_name"] = streamer.get("display_name") or streamer.get("name")
                d["user_name"]    = streamer.get("name")
                d["user_avatar"]  = streamer.get("avatar_url")
        final.append({"type": item["type"], "data": d})

    return final


@api_router.get("/home/following")
async def home_following_feed(user: dict = Depends(get_current_user)):
    """Feed of posts and live streams from users the caller follows, sorted by recency."""
    user_id = user["user_id"]
    follows = await db.follows.find({"follower_id": user_id}, {"following_id": 1}).to_list(5000)
    following_ids = [f["following_id"] for f in follows]
    if not following_ids:
        return []

    items = []

    # Streams from followed users (live first, then recent)
    streams = await db.streams.find(
        {"user_id": {"$in": following_ids}, "status": {"$in": ["live", "ended", "idle"]}},
        {"_id": 0, "stream_key": 0},
    ).sort([("status", -1), ("started_at", -1)]).limit(20).to_list(20)

    for s in streams:
        streamer = await db.users.find_one({"user_id": s["user_id"]}, {"_id": 0, "password": 0})
        if streamer:
            s["display_name"] = streamer.get("display_name") or streamer.get("name")
            s["user_name"]    = streamer.get("name")
            s["user_avatar"]  = streamer.get("avatar_url")
        items.append({"type": "stream", "data": s, "ts": s.get("started_at", "")})

    # Posts from followed users (last 30 days)
    cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    posts = await db.posts.find(
        {"user_id": {"$in": following_ids}, "created_at": {"$gte": cutoff}},
        {"_id": 0},
    ).sort("created_at", -1).limit(40).to_list(40)

    for p in posts:
        author = await db.users.find_one({"user_id": p["user_id"]}, {"_id": 0, "password": 0})
        p["author"]      = safe_user(author) if author else {"display_name": "Unknown"}
        p["liked_by_me"] = user_id in p.get("likes", [])
        p.pop("likes", None)
        items.append({"type": "post", "data": p, "ts": p.get("created_at", "")})

    # Sort by timestamp descending
    items.sort(key=lambda x: x.get("ts") or "", reverse=True)
    return [{"type": i["type"], "data": i["data"]} for i in items[:40]]


@api_router.get("/notifications")
async def get_notifications(user: dict = Depends(get_current_user)):
    """Return recent notifications for the authenticated user."""
    user_id = user["user_id"]
    cutoff  = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()

    notifs = await db.notifications.find(
        {"recipient_id": user_id, "created_at": {"$gte": cutoff}},
        {"_id": 0}
    ).sort("created_at", -1).limit(50).to_list(50)

    # Also surface tips received in the last 30 days
    tips = await db.tips.find(
        {"streamer_id": user_id, "created_at": {"$gte": cutoff}},
        {"_id": 0}
    ).sort("created_at", -1).limit(20).to_list(20)

    for tip in tips:
        notifs.append({
            "notification_id": tip.get("tip_id", f"notif_tip_{uuid.uuid4().hex[:8]}"),
            "recipient_id": user_id,
            "actor_id": tip.get("tipper_id"),
            "type": "tip",
            "amount": tip.get("amount"),
            "message": tip.get("message", ""),
            "read": True,
            "created_at": tip.get("created_at", ""),
        })

    # Sort merged list
    notifs.sort(key=lambda x: x.get("created_at", ""), reverse=True)

    # Enrich with actor names / avatars
    actor_ids = list({n["actor_id"] for n in notifs if n.get("actor_id")})
    if actor_ids:
        actors = await db.users.find({"user_id": {"$in": actor_ids}}, {"_id": 0, "password": 0}).to_list(len(actor_ids))
        actor_map = {a["user_id"]: a for a in actors}
    else:
        actor_map = {}

    for n in notifs:
        a = actor_map.get(n.get("actor_id"), {})
        n["actor_name"]   = a.get("display_name") or a.get("name") or "Fighter"
        n["actor_avatar"] = a.get("avatar_url")

    unread_count = sum(1 for n in notifs if not n.get("read"))
    return {"notifications": notifs[:50], "unread_count": unread_count}


@api_router.post("/notifications/mark-read")
async def mark_notifications_read(user: dict = Depends(get_current_user)):
    await db.notifications.update_many(
        {"recipient_id": user["user_id"], "read": False},
        {"$set": {"read": True}}
    )
    return {"ok": True}


# ============== COMPETITION ENDPOINTS ==============

@api_router.post("/competitions")
async def create_competition(data: CompetitionCreate, user: dict = Depends(get_current_user)):
    if _rate_limited(f"competitions:{user['user_id']}", 10, 60):
        raise HTTPException(429, "Too many competitions — slow down")
    if data.competition_type == "ai_judge" and not await check_subscription(user):
        raise HTTPException(status_code=403, detail="Pro subscription required for AI judging")
    if await is_content_flagged(data.title) or await is_content_flagged(data.description):
        raise HTTPException(400, "Competition content violates community guidelines")
    comp_id = f"comp_{uuid.uuid4().hex[:12]}"
    closes_at = (datetime.now(timezone.utc) + timedelta(hours=data.duration_hours)).isoformat()
    comp_doc = {
        "comp_id": comp_id,
        "challenger_id": user["user_id"],
        "title": data.title,
        "description": data.description,
        "video_url": data.video_url,
        "thumbnail_url": data.thumbnail_url,
        "competition_type": data.competition_type,
        "status": "open",
        "vote_count": 0,
        "avg_score": None,
        "dimension_averages": {},
        "ai_result": None,
        "voting_closes_at": closes_at,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "gym_id": user.get("gym_id"),
    }
    if data.competition_type == "ai_judge":
        ai_quota = await check_and_consume_ai_tokens(user, "ai_competition")
        if not ai_quota["allowed"]:
            raise HTTPException(status_code=402, detail="ai_quota_exceeded")
        # The judge watches the uploaded video; if it can't, the competition stays open for
        # human votes rather than getting a score nobody watched.
        public_id = cloudinary_video_public_id(data.video_url)
        analysis = None
        if GEMINI_API_KEY and public_id:
            try:
                analysis = await analyze_round_video(public_id, 1, "Judge", "neutral, precise", [])
            except Exception as e:
                logger.error(f"AI judging error: {e}")
        if analysis:
            result = competition_result(analysis)
            comp_doc.update({"ai_result": result, "avg_score": result["overall"],
                             "dimension_averages": result["scores"], "status": "closed"})
        else:
            await refund_ai_tokens(user, "ai_competition")
    await db.competitions.insert_one(comp_doc)
    comp_doc.pop("_id", None)
    comp_doc["challenger"] = safe_user(user)
    return comp_doc

async def _close_competition_if_due(comp: dict) -> Optional[str]:
    """Close an expired, voter-judged competition exactly once and award the winner.

    Solo format: the challenger 'wins' if the crowd scores them well (>=2 votes, avg>=6.5).
    There is no opponent, so nothing is ever counted as a loss. Returns the winner_id (or None).
    """
    if comp.get("status") == "closed":
        return comp.get("winner_id")
    closes_at = comp.get("voting_closes_at")
    if not closes_at:
        return None
    close_dt = datetime.fromisoformat(closes_at)
    if close_dt.tzinfo is None:
        close_dt = close_dt.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) <= close_dt:
        return None
    winner_id = comp.get("challenger_id") if (comp.get("vote_count", 0) >= 2 and comp.get("avg_score", 0) >= 6.5) else None
    # Atomically claim the close so concurrent callers can't double-award.
    claimed = await db.competitions.update_one(
        {"comp_id": comp["comp_id"], "status": {"$ne": "closed"}},
        {"$set": {"status": "closed", "winner_id": winner_id}},
    )
    if claimed.modified_count == 1 and winner_id:
        await db.users.update_one({"user_id": winner_id}, {"$inc": {"competition_wins": 1}})
        await check_and_award_belts(winner_id)
    return winner_id

@api_router.get("/competitions/mine")
async def get_my_competitions(user: dict = Depends(get_current_user)):
    comps = await db.competitions.find({"challenger_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)
    for comp in comps:
        comp["challenger"] = safe_user(user)
        comp["has_voted"] = False
    return comps

@api_router.get("/competitions")
async def browse_competitions(
    status: str = Query("open", enum=["open", "closed", "all"]),
    user: dict = Depends(get_current_user),
):
    # Lazily close any competitions whose voting window has elapsed before filtering by status.
    for expired in await db.competitions.find({"status": "open"}, {"_id": 0}).to_list(200):
        await _close_competition_if_due(expired)
    query: dict = {} if status == "all" else {"status": status}
    comps = await db.competitions.find(query, {"_id": 0}).sort("created_at", -1).to_list(50)
    enriched = []
    for comp in comps:
        challenger = await db.users.find_one({"user_id": comp["challenger_id"]}, {"_id": 0, "password": 0})
        comp["challenger"] = safe_user(challenger) if challenger else {"display_name": "Unknown"}
        my_vote = await db.competition_votes.find_one({"comp_id": comp["comp_id"], "voter_id": user["user_id"]})
        comp["has_voted"] = my_vote is not None
        enriched.append(comp)
    return enriched

@api_router.get("/competitions/{comp_id}")
async def get_competition(comp_id: str, user: dict = Depends(get_current_user)):
    comp = await db.competitions.find_one({"comp_id": comp_id}, {"_id": 0})
    if not comp:
        raise HTTPException(status_code=404, detail="Competition not found")
    if comp.get("status") == "open":
        await _close_competition_if_due(comp)
        comp = await db.competitions.find_one({"comp_id": comp_id}, {"_id": 0})
    challenger = await db.users.find_one({"user_id": comp["challenger_id"]}, {"_id": 0, "password": 0})
    comp["challenger"] = safe_user(challenger) if challenger else {"display_name": "Unknown"}
    my_vote = await db.competition_votes.find_one({"comp_id": comp_id, "voter_id": user["user_id"]}, {"_id": 0})
    comp["has_voted"] = my_vote is not None
    comp["my_vote"] = my_vote
    recent_comments = await db.competition_votes.find(
        {"comp_id": comp_id, "comment": {"$nin": ["", None]}},
        {"_id": 0, "scores": 0},
    ).sort("created_at", -1).to_list(10)
    for v in recent_comments:
        voter = await db.users.find_one({"user_id": v["voter_id"]}, {"_id": 0, "password": 0})
        v["voter"] = safe_user(voter) if voter else {"display_name": "Unknown"}
    comp["recent_comments"] = recent_comments
    return comp

@api_router.post("/competitions/{comp_id}/vote")
async def vote_on_competition(comp_id: str, vote_data: VoteCreate, user: dict = Depends(get_current_user)):
    comp = await db.competitions.find_one({"comp_id": comp_id})
    if not comp:
        raise HTTPException(status_code=404, detail="Competition not found")
    if comp["status"] != "open":
        raise HTTPException(status_code=400, detail="Voting is closed")
    if comp["challenger_id"] == user["user_id"]:
        raise HTTPException(status_code=400, detail="Cannot vote on your own competition")
    if await db.competition_votes.find_one({"comp_id": comp_id, "voter_id": user["user_id"]}):
        raise HTTPException(status_code=400, detail="Already voted")
    if await is_content_flagged(vote_data.comment):
        raise HTTPException(400, "Comment violates community guidelines")
    closes_at = comp.get("voting_closes_at")
    if closes_at:
        close_dt = datetime.fromisoformat(closes_at)
        if close_dt.tzinfo is None:
            close_dt = close_dt.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) > close_dt:
            await _close_competition_if_due(comp)
            raise HTTPException(status_code=400, detail="Voting period has ended")
    _DIMENSION_SET = set(DIMENSIONS)
    clean_scores = {
        dim: max(1, min(10, int(score)))
        for dim, score in (vote_data.scores or {}).items()
        if dim in _DIMENSION_SET and isinstance(score, (int, float))
    }
    if not clean_scores:
        raise HTTPException(status_code=400, detail="At least one valid dimension score is required")
    vote_doc = {
        "vote_id": f"vote_{uuid.uuid4().hex[:12]}",
        "comp_id": comp_id,
        "voter_id": user["user_id"],
        "scores": clean_scores,
        "comment": vote_data.comment or "",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.competition_votes.insert_one(vote_doc)
    all_votes = await db.competition_votes.find({"comp_id": comp_id}, {"_id": 0, "scores": 1}).to_list(100000)
    if all_votes:
        dim_totals: Dict[str, List[float]] = {}
        for v in all_votes:
            for dim, score in v.get("scores", {}).items():
                dim_totals.setdefault(dim, []).append(score)
        dim_avgs = {dim: round(sum(s) / len(s), 1) for dim, s in dim_totals.items()}
        overall = round(sum(dim_avgs.values()) / len(dim_avgs), 1) if dim_avgs else 0
        await db.competitions.update_one(
            {"comp_id": comp_id},
            {"$set": {"dimension_averages": dim_avgs, "avg_score": overall}, "$inc": {"vote_count": 1}},
        )
    # Award immediately if this vote lands exactly as the voting window closes.
    comp_now = await db.competitions.find_one({"comp_id": comp_id})
    if comp_now:
        await _close_competition_if_due(comp_now)
    return {"message": "Vote cast", "vote_id": vote_doc["vote_id"]}

# ============== FOLLOW ENDPOINTS ==============

@api_router.post("/users/{target_id}/block")
async def block_user(target_id: str, user: dict = Depends(get_current_user)):
    if target_id == user["user_id"]:
        raise HTTPException(status_code=400, detail="Cannot block yourself")
    if not await db.users.find_one({"user_id": target_id}):
        raise HTTPException(status_code=404, detail="User not found")
    await db.blocks.update_one(
        {"blocker_id": user["user_id"], "blocked_id": target_id},
        {"$setOnInsert": {
            "block_id": f"block_{uuid.uuid4().hex[:12]}",
            "blocker_id": user["user_id"],
            "blocked_id": target_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    # A block that still leaves the two of you following each other isn't a block.
    await db.follows.delete_many({"$or": [
        {"follower_id": user["user_id"], "following_id": target_id},
        {"follower_id": target_id, "following_id": user["user_id"]},
    ]})
    return {"blocked": True}

@api_router.delete("/users/{target_id}/block")
async def unblock_user(target_id: str, user: dict = Depends(get_current_user)):
    result = await db.blocks.delete_one({"blocker_id": user["user_id"], "blocked_id": target_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not blocked")
    return {"blocked": False}

@api_router.get("/users/me/blocked")
async def get_blocked_users(user: dict = Depends(get_current_user)):
    blocks = await db.blocks.find({"blocker_id": user["user_id"]}, {"_id": 0}).to_list(1000)
    users = []
    for b in blocks:
        u = await db.users.find_one({"user_id": b["blocked_id"]}, {"_id": 0, "password": 0})
        if u:
            users.append(safe_user(u))
    return users

@api_router.post("/follows/{target_id}")
async def follow_user(target_id: str, user: dict = Depends(get_current_user)):
    if target_id == user["user_id"]:
        raise HTTPException(status_code=400, detail="Cannot follow yourself")
    if not await db.users.find_one({"user_id": target_id}):
        raise HTTPException(status_code=404, detail="User not found")
    if await _is_blocked(user["user_id"], target_id):
        raise HTTPException(status_code=403, detail="Can't follow this user")
    if await db.follows.find_one({"follower_id": user["user_id"], "following_id": target_id}):
        raise HTTPException(status_code=400, detail="Already following")
    await db.follows.insert_one({
        "follow_id": f"follow_{uuid.uuid4().hex[:12]}",
        "follower_id": user["user_id"],
        "following_id": target_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    follower_name = user.get("display_name") or user.get("name", "Someone")
    await _send_push(
        target_id,
        title=f"{follower_name} started following you",
        body="Check out their profile",
        url=f"/profile/{user['user_id']}",
        tag=f"follow-{user['user_id']}",
    )
    return {"following": True}

@api_router.delete("/follows/{target_id}")
async def unfollow_user(target_id: str, user: dict = Depends(get_current_user)):
    result = await db.follows.delete_one({"follower_id": user["user_id"], "following_id": target_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not following this user")
    return {"following": False}

@api_router.get("/users/me/following")
async def get_following(user: dict = Depends(get_current_user)):
    follows = await db.follows.find({"follower_id": user["user_id"]}, {"_id": 0}).to_list(10000)
    users = []
    for f in follows:
        u = await db.users.find_one({"user_id": f["following_id"]}, {"_id": 0, "password": 0})
        if u:
            users.append(safe_user(u))
    return users

@api_router.get("/users/me/followers")
async def get_followers(user: dict = Depends(get_current_user)):
    follows = await db.follows.find({"following_id": user["user_id"]}, {"_id": 0}).to_list(10000)
    users = []
    for f in follows:
        u = await db.users.find_one({"user_id": f["follower_id"]}, {"_id": 0, "password": 0})
        if u:
            users.append(safe_user(u))
    return users

@api_router.get("/users/{user_id}/followers")
async def get_user_followers(user_id: str, current_user: dict = Depends(get_current_user)):
    await _require_profile_visible(user_id, current_user)
    follows = await db.follows.find({"following_id": user_id}, {"_id": 0}).to_list(10000)
    my_following_docs = await db.follows.find({"follower_id": current_user["user_id"]}, {"following_id": 1}).to_list(10000)
    my_following_ids = {f["following_id"] for f in my_following_docs}
    users = []
    for f in follows:
        u = await db.users.find_one({"user_id": f["follower_id"]}, {"_id": 0, "password": 0})
        if u:
            safe = safe_user(u)
            safe["is_following"] = u["user_id"] in my_following_ids
            users.append(safe)
    return users

@api_router.get("/users/{user_id}/following")
async def get_user_following(user_id: str, current_user: dict = Depends(get_current_user)):
    await _require_profile_visible(user_id, current_user)
    follows = await db.follows.find({"follower_id": user_id}, {"_id": 0}).to_list(10000)
    my_following_docs = await db.follows.find({"follower_id": current_user["user_id"]}, {"following_id": 1}).to_list(10000)
    my_following_ids = {f["following_id"] for f in my_following_docs}
    users = []
    for f in follows:
        u = await db.users.find_one({"user_id": f["following_id"]}, {"_id": 0, "password": 0})
        if u:
            safe = safe_user(u)
            safe["is_following"] = u["user_id"] in my_following_ids
            users.append(safe)
    return users

# ============== FEEDBACK ENDPOINTS ==============

class FeedbackCreate(BaseModel):
    type: str  # "bug" | "feature" | "general"
    message: str
    rating: Optional[int] = None  # 1-5
    page: Optional[str] = None

# Two different jobs: ADMIN_EMAIL is the account that signs in to admin tools; the official
# inbox is where every admin notice goes and the address the public is given.
ADMIN_EMAIL = os.environ.get('ADMIN_EMAIL', 'archieroach2013@gmail.com')
ADMIN_INBOX_EMAIL = os.environ.get('ADMIN_INBOX_EMAIL') or os.environ.get('FANTASY_ADMIN_EMAIL') or 'hello@victoryai.co.uk'
ADMIN_LOGINS = {e.strip().lower() for e in ADMIN_EMAIL.split(",") if e.strip()}
_clerk_email_cache: Dict[str, tuple] = {}


async def _clerk_verified_emails(clerk_user_id: str) -> set:
    """Every verified email on the Clerk account, cached 10 minutes. The saved user email is
    only Clerk's first address at sign-up (blank if Clerk was unreachable then, or an Apple
    relay address), so admin checks also accept any verified address on the account."""
    hit = _clerk_email_cache.get(clerk_user_id)
    if hit and time.time() - hit[0] < 600:
        return hit[1]
    emails = set()
    if CLERK_SECRET_KEY:
        try:
            async with httpx.AsyncClient(timeout=5) as http_client:
                r = await http_client.get(f"https://api.clerk.com/v1/users/{clerk_user_id}",
                                          headers={"Authorization": f"Bearer {CLERK_SECRET_KEY}"})
            if r.status_code == 200:
                emails = {(e.get("email_address") or "").strip().lower() for e in r.json().get("email_addresses", [])
                          if (e.get("verification") or {}).get("status") == "verified"}
        except Exception as e:
            logger.warning(f"Clerk email lookup failed: {e}")
    _clerk_email_cache[clerk_user_id] = (time.time(), emails)
    return emails


async def is_admin(user: dict) -> bool:
    if (user.get("email") or "").strip().lower() in ADMIN_LOGINS:
        return True
    verified = await _clerk_verified_emails(user["user_id"])
    if verified & ADMIN_LOGINS:
        # Repair the saved email so the next check is instant and admin emails show correctly.
        match = sorted(verified & ADMIN_LOGINS)[0]
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"email": match, "email_hash": _email_hash(match)}})
        return True
    return False

@api_router.post("/feedback")
async def submit_feedback(data: FeedbackCreate, user: dict = Depends(get_current_user)):
    doc = {
        "feedback_id": f"fb_{uuid.uuid4().hex[:12]}",
        "user_id": user["user_id"],
        "user_name": user.get("name") or user.get("email", "Unknown"),
        "user_email": user.get("email", ""),
        "type": data.type,
        "message": data.message,
        "rating": data.rating,
        "page": data.page,
        "created_at": datetime.now(timezone.utc),
    }
    await db.feedback.insert_one(doc)

    if RESEND_API_KEY:
        type_label = html.escape({"bug": "🐛 Bug Report", "feature": "💡 Feature Request", "general": "💬 General Feedback"}.get(data.type, data.type))
        rating_str = f"{'⭐' * data.rating} ({data.rating}/5)" if data.rating else "Not rated"
        email_html = f"""
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#12121A;color:#F0F0F5;padding:32px;border-radius:12px;">
          <h2 style="color:#E8FF47;margin-top:0;">New Beta Feedback</h2>
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="color:#8888A0;padding:6px 0;width:120px;">Type</td><td>{type_label}</td></tr>
            <tr><td style="color:#8888A0;padding:6px 0;">From</td><td>{html.escape(doc['user_name'])} &lt;{html.escape(doc['user_email'])}&gt;</td></tr>
            <tr><td style="color:#8888A0;padding:6px 0;">Rating</td><td>{rating_str}</td></tr>
            <tr><td style="color:#8888A0;padding:6px 0;">Page</td><td>{html.escape(data.page or 'Unknown')}</td></tr>
          </table>
          <div style="margin-top:20px;padding:16px;background:#1A1A2E;border-radius:8px;border-left:3px solid #E8FF47;">
            <p style="margin:0;line-height:1.6;">{html.escape(data.message)}</p>
          </div>
        </div>"""
        try:
            async with httpx.AsyncClient() as client:
                await _breaker_post(RESEND_BREAKER, client, "https://api.resend.com/emails",
                    headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"},
                    json={"from": RESEND_FROM, "to": [ADMIN_INBOX_EMAIL], "subject": f"[Victory AI] {type_label} from {doc['user_name']}", "html": email_html},
                    timeout=5,
                )
        except Exception:
            pass

    return {"feedback_id": doc["feedback_id"]}

@api_router.get("/feedback")
async def get_feedback(user: dict = Depends(get_current_user)):
    if not await is_admin(user):
        raise HTTPException(status_code=403, detail="Admin only")
    items = await db.feedback.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return items

# ============== CRASH REPORTS ==============
# "Early" means finding out fast, not just logging into a DB nobody checks — so this
# emails the admin immediately, same as /feedback does. Deliberately public/unauthenticated:
# the crashes most worth catching (a provider throwing during its own first render, an
# error before auth has resolved) have no valid session to attach a token to at all.
# Rate-limited per IP so a page stuck crash-looping can't turn into an email flood.

class CrashReportCreate(BaseModel):
    message: str = Field(..., max_length=2000)
    stack: Optional[str] = Field(None, max_length=8000)
    component_stack: Optional[str] = Field(None, max_length=8000)
    url: Optional[str] = Field(None, max_length=500)
    user_agent: Optional[str] = Field(None, max_length=500)
    source: str = Field("window", max_length=50)  # "boundary" | "window" | "promise"

# Browser warnings that fire on healthy pages (layout settling across frames). Filtered here
# too, not just client-side, so already-loaded older bundles stop emailing.
BENIGN_CRASH_PATTERNS = (
    "ResizeObserver loop completed with undelivered notifications",
    "ResizeObserver loop limit exceeded",
)


def is_benign_crash(message: str) -> bool:
    return any(p in (message or "") for p in BENIGN_CRASH_PATTERNS)


@api_router.post("/crash-reports")
async def report_crash(data: CrashReportCreate, request: Request):
    if is_benign_crash(data.message):
        return {"crash_id": None, "ignored": True}
    client_ip = request.client.host if request.client else "unknown"
    if _rate_limited(f"crash_report:{client_ip}", 20, 300):
        raise HTTPException(429, "Too many reports")

    # Best-effort identify — most real crashes (pre-auth, a broken session) genuinely
    # won't have one, and that's fine; never block a crash report on being logged in.
    user_id = None
    try:
        identified = await get_current_user(request)
        user_id = identified["user_id"]
    except Exception:
        pass

    doc = {
        "crash_id": f"crash_{uuid.uuid4().hex[:12]}",
        "message": data.message,
        "stack": data.stack,
        "component_stack": data.component_stack,
        "url": data.url,
        "user_agent": data.user_agent,
        "source": data.source,
        "user_id": user_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.crash_reports.insert_one(doc)

    if RESEND_API_KEY:
        stack_html = f'<pre style="white-space:pre-wrap;background:#1A1A2E;padding:12px;border-radius:8px;font-size:11px;overflow-x:auto;">{html.escape(data.stack)}</pre>' if data.stack else ""
        email_html = f"""
        <div style="font-family:monospace;max-width:700px;margin:0 auto;background:#12121A;color:#F0F0F5;padding:24px;border-radius:12px;">
          <h2 style="color:#FF6B35;margin-top:0;">🔥 Crash Report</h2>
          <p><strong>Message:</strong> {html.escape(data.message)}</p>
          <p><strong>Page:</strong> {html.escape(data.url or 'unknown')}</p>
          <p><strong>User:</strong> {html.escape(user_id or 'anonymous / not signed in')}</p>
          <p><strong>Source:</strong> {html.escape(data.source)}</p>
          {stack_html}
        </div>"""
        try:
            async with httpx.AsyncClient() as client:
                await _breaker_post(RESEND_BREAKER, client, "https://api.resend.com/emails",
                    headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"},
                    json={"from": RESEND_FROM, "to": [ADMIN_INBOX_EMAIL], "subject": f"[Victory AI] Crash: {data.message[:100]}", "html": email_html},
                    timeout=5,
                )
        except Exception:
            pass

    return {"crash_id": doc["crash_id"]}

@api_router.get("/crash-reports")
async def get_crash_reports(user: dict = Depends(get_current_user)):
    if not await is_admin(user):
        raise HTTPException(status_code=403, detail="Admin only")
    items = await db.crash_reports.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return items

# ============== CONTENT REPORTING ==============

REPORT_HIDE_THRESHOLD = 3  # unique reporters before content auto-hides pending review
REPORTABLE_COLLECTIONS = {"post": "posts", "comment": "comments", "stream": "streams"}
REPORTABLE_ID_FIELDS = {"post": "post_id", "comment": "comment_id", "stream": "stream_id"}

class ReportCreate(BaseModel):
    content_type: Literal["post", "comment", "stream", "user"]
    content_id: str
    reason: str = Field("", max_length=300)

@api_router.post("/reports")
async def create_report(data: ReportCreate, user: dict = Depends(get_current_user)):
    if _rate_limited(f"report:{user['user_id']}", 20, 60):
        raise HTTPException(429, "Too many reports — slow down")

    existing = await db.reports.find_one({
        "content_type": data.content_type,
        "content_id": data.content_id,
        "reporter_id": user["user_id"],
    })
    if existing:
        return {"message": "Already reported", "content_hidden": False}

    await db.reports.insert_one({
        "report_id": f"report_{uuid.uuid4().hex[:12]}",
        "content_type": data.content_type,
        "content_id": data.content_id,
        "reporter_id": user["user_id"],
        "reason": data.reason,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    # User reports aren't auto-actioned — account-level bans need a human,
    # since a report count alone is too easy to brigade.
    if data.content_type == "user":
        return {"message": "Report submitted", "content_hidden": False}

    report_count = await db.reports.count_documents({
        "content_type": data.content_type,
        "content_id": data.content_id,
    })
    hidden = False
    if report_count >= REPORT_HIDE_THRESHOLD:
        collection = REPORTABLE_COLLECTIONS[data.content_type]
        id_field = REPORTABLE_ID_FIELDS[data.content_type]
        result = await db[collection].update_one(
            {id_field: data.content_id, "is_hidden": {"$ne": True}},
            {"$set": {"is_hidden": True}},
        )
        hidden = result.modified_count > 0
        if hidden and RESEND_API_KEY:
            try:
                async with httpx.AsyncClient() as client:
                    await _breaker_post(RESEND_BREAKER, client, "https://api.resend.com/emails",
                        headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"},
                        json={
                            "from": RESEND_FROM,
                            "to": [ADMIN_INBOX_EMAIL],
                            "subject": f"[Victory AI] {data.content_type} auto-hidden after {report_count} reports",
                            "html": f"<p>{html.escape(data.content_type)} <code>{html.escape(data.content_id)}</code> was auto-hidden after reaching {report_count} reports. Review in the <code>reports</code> and <code>{collection}</code> collections.</p>",
                        },
                        timeout=5,
                    )
            except Exception:
                pass

    return {"message": "Report submitted", "content_hidden": hidden}

@api_router.get("/reports")
async def list_reports(user: dict = Depends(get_current_user)):
    if not await is_admin(user):
        raise HTTPException(status_code=403, detail="Admin only")
    items = await db.reports.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return items


# ============== REVENUECAT (App Store purchases in the iOS app) ==============
# Goal: let iPhone users subscribe to Pro inside the app (Apple rule 3.1.1 bans Stripe there).
# Design: the app buys through RevenueCat with app_user_id = our user_id. The server never
#   trusts the app: every webhook or sync re-reads the subscriber from RevenueCat's REST API
#   and writes one subscription doc per user (subscription_id "rc_<user_id>", source
#   "app_store"), so check_subscription / has_subscription treat it exactly like Stripe Pro.
REVENUECAT_SECRET_API_KEY = os.environ.get("REVENUECAT_SECRET_API_KEY", "").strip()
REVENUECAT_WEBHOOK_AUTH = os.environ.get("REVENUECAT_WEBHOOK_AUTH", "").strip()
REVENUECAT_ENTITLEMENT = os.environ.get("REVENUECAT_ENTITLEMENT", "victory_ai_pro").strip() or "victory_ai_pro"


async def _revenuecat_subscriber(app_user_id: str) -> Optional[dict]:
    if not REVENUECAT_SECRET_API_KEY:
        return None
    async with httpx.AsyncClient(timeout=10) as http_client:
        r = await http_client.get(f"https://api.revenuecat.com/v1/subscribers/{_url_parse.quote(app_user_id, safe='')}",
                                  headers={"Authorization": f"Bearer {REVENUECAT_SECRET_API_KEY}"})
    r.raise_for_status()
    return (r.json() or {}).get("subscriber") or {}


def _rc_parse_date(raw: Optional[str]) -> Optional[datetime]:
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None


async def sync_revenuecat(user_id: str) -> Optional[dict]:
    """RevenueCat is the source of truth for App Store Pro; mirror it into db.subscriptions."""
    subscriber = await _revenuecat_subscriber(user_id)
    if subscriber is None:
        return None
    ent = (subscriber.get("entitlements") or {}).get(REVENUECAT_ENTITLEMENT)
    sub_id = f"rc_{user_id}"
    if not ent:
        existing = await db.subscriptions.find_one({"subscription_id": sub_id}, {"_id": 0})
        if existing:
            await db.subscriptions.update_one({"subscription_id": sub_id}, {"$set": {"status": "expired", "subscription_active": False}})
        return None
    expires = _rc_parse_date(ent.get("expires_date"))  # None = lifetime
    product_id = ent.get("product_identifier") or ""
    product = (subscriber.get("subscriptions") or {}).get(product_id) or {}
    active = expires is None or expires > datetime.now(timezone.utc)
    status = ("trialing" if product.get("period_type") == "trial" else "active") if active else "expired"
    doc = {
        "subscription_id": sub_id, "user_id": user_id, "source": "app_store", "status": status,
        "subscription_active": active, "product_id": product_id,
        "plan_id": "lifetime" if expires is None or "lifetime" in product_id.lower()
                   else "annual" if any(k in product_id.lower() for k in ("annual", "year")) else "monthly",
        "current_period_end": expires.isoformat() if expires else None,
        "cancel_at_period_end": bool(product.get("unsubscribe_detected_at")) and active,
        "billing_issue": bool(product.get("billing_issues_detected_at")),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.subscriptions.update_one({"subscription_id": sub_id}, {"$set": doc,
                                       "$setOnInsert": {"created_at": doc["updated_at"]}}, upsert=True)
    return doc


@api_router.post("/webhooks/revenuecat")
async def revenuecat_webhook(request: Request):
    # RevenueCat sends the Authorization value you set in its dashboard; refuse anything else.
    if not REVENUECAT_WEBHOOK_AUTH:
        raise HTTPException(500, "Webhook not configured")
    if not secrets.compare_digest(request.headers.get("authorization", ""), REVENUECAT_WEBHOOK_AUTH):
        raise HTTPException(401, "Unauthorized")
    body = await request.json()
    event = body.get("event") or {}
    # Sandbox events are honoured on purpose: App Review and TestFlight purchase in sandbox.
    ids = {event.get("app_user_id"), event.get("original_app_user_id"), *(event.get("aliases") or [])}
    ids = {i for i in ids if i and not i.startswith("$RCAnonymousID")}
    for uid in ids:
        if await db.users.find_one({"user_id": uid}, {"_id": 1}):
            try:
                await sync_revenuecat(uid)
            except Exception as e:
                logger.error(f"RevenueCat sync failed for {uid}: {_redact(e)}")
                raise HTTPException(502, "Sync failed; RevenueCat will retry")
    return {"received": True}


@api_router.post("/subscription/revenuecat/sync")
async def revenuecat_sync_me(user: dict = Depends(get_current_user)):
    """The app calls this right after a purchase or restore, so Pro unlocks without waiting
    for the webhook. The answer still comes from RevenueCat, not the app."""
    if _rate_limited(f"rc_sync:{user['user_id']}", 20, 600):
        raise HTTPException(429, "Slow down a little")
    if not REVENUECAT_SECRET_API_KEY:
        raise HTTPException(503, "In-app purchases aren't set up yet")
    try:
        doc = await sync_revenuecat(user["user_id"])
    except Exception as e:
        logger.error(f"RevenueCat sync failed for {user['user_id']}: {_redact(e)}")
        raise HTTPException(502, "Couldn't reach the App Store service. Try again.")
    return {"active": bool(doc and doc["subscription_active"]), "status": (doc or {}).get("status")}


@api_router.post("/auth/validate")
async def validate_access(user: dict = Depends(get_current_user)):
    """iOS: verify Stripe subscription live and check access_granted flag."""
    import asyncio as _asyncio

    rc = await db.subscriptions.find_one({"user_id": user["user_id"], "source": "app_store"}, {"_id": 0})
    if rc and REVENUECAT_SECRET_API_KEY:
        try:
            rc = await sync_revenuecat(user["user_id"]) or rc
        except Exception as e:
            logger.warning(f"RevenueCat check in /auth/validate failed: {_redact(e)}")
    if rc and rc.get("status") in ("active", "trialing"):
        if not user.get("access_granted", True):
            return {"access_granted": False, "reason": "access_revoked"}
        return {"access_granted": True, "subscription_active": True}

    subscription = await db.subscriptions.find_one(
        {"user_id": user["user_id"], "source": {"$ne": "app_store"}},
        {"_id": 0},
    )
    if not subscription:
        return {"access_granted": False, "reason": "subscription_lapsed" if rc else "no_subscription"}

    stripe_sub_id = subscription.get("subscription_id", "")

    if stripe_sub_id.startswith("sub_"):
        try:
            stripe_sub = await _asyncio.to_thread(stripe_lib.Subscription.retrieve, stripe_sub_id)
            live_status = stripe_sub.status
            await db.subscriptions.update_one(
                {"subscription_id": stripe_sub_id},
                {"$set": {"status": live_status, "subscription_active": live_status in ("active", "trialing")}}
            )
            if live_status not in ("active", "trialing"):
                return {"access_granted": False, "reason": "subscription_inactive"}
        except stripe_lib.error.StripeError as e:
            logger.error(f"Stripe error in /auth/validate: {e}")
            if subscription.get("status") not in ("active", "trialing"):
                return {"access_granted": False, "reason": "subscription_inactive"}
    else:
        if subscription.get("status") not in ("active", "trialing"):
            return {"access_granted": False, "reason": "subscription_inactive"}

    if not user.get("access_granted", True):
        return {"access_granted": False, "reason": "access_revoked"}

    return {"access_granted": True, "subscription_active": True}

# ─── Livepeer Streaming ───────────────────────────────────────────────────────

async def _livepeer(method: str, path: str, payload: dict = None) -> dict:
    headers = {"Authorization": f"Bearer {LIVEPEER_API_KEY}", "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=15) as c:
        if method == "GET":
            r = await c.get(f"{LIVEPEER_BASE_URL}{path}", headers=headers)
        elif method == "POST":
            r = await c.post(f"{LIVEPEER_BASE_URL}{path}", headers=headers, json=payload or {})
        elif method == "DELETE":
            r = await c.delete(f"{LIVEPEER_BASE_URL}{path}", headers=headers)
        else:
            raise ValueError(method)
        if not r.is_success:
            body = r.text[:300]
            raise HTTPException(502, f"Livepeer {r.status_code}: {body}")
        return r.json() if r.content else {}


class ConnectionManager:
    def __init__(self):
        self._conns: Dict[str, List[WebSocket]] = {}

    async def connect(self, ws: WebSocket, stream_id: str):
        await ws.accept()
        self._conns.setdefault(stream_id, []).append(ws)

    def disconnect(self, ws: WebSocket, stream_id: str):
        conns = self._conns.get(stream_id, [])
        if ws in conns:
            conns.remove(ws)

    async def broadcast(self, stream_id: str, data: dict):
        msg = json.dumps(data)
        dead = []
        for ws in list(self._conns.get(stream_id, [])):
            try:
                await ws.send_text(msg)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws, stream_id)

    def viewer_count(self, stream_id: str) -> int:
        return len(self._conns.get(stream_id, []))


ws_manager = ConnectionManager()


# ─── Auto highlights ──────────────────────────────────────────────────────────
# Every viewer reaction (hype tap, chat line, tip, gift) is scored per stream. When the
# last HYPE_WINDOW_S seconds out-score both an absolute floor and a multiple of the
# stream's recent baseline, the moment is clipped automatically.

HYPE_WINDOW_S          = 10
HYPE_BASELINE_S        = 120
HYPE_MIN_SCORE         = 12
HYPE_SPIKE_MULTIPLIER  = 3.0
HYPE_MIN_REACTORS      = 3
HYPE_COOLDOWN_S        = 45
HYPE_MAX_PER_STREAM    = 15
# Free signals are capped per user per window so one person spamming can't fake a spike;
# paid signals (tips, gifts) count in full.
HYPE_FREE_CAP_PER_USER = 4

# Tiny streams (a streamer and a couple of friends) would never reach 3 reactors, so the
# first highlight — the reward that makes streaming worth repeating — would never come.
HYPE_SMALL_STREAM_VIEWERS = 5
HYPE_SMALL_MIN_REACTORS   = 2


def hype_thresholds(viewers: Optional[int]) -> tuple:
    if viewers is not None and viewers < HYPE_SMALL_STREAM_VIEWERS:
        return HYPE_SMALL_MIN_REACTORS, HYPE_FREE_CAP_PER_USER * HYPE_SMALL_MIN_REACTORS
    return HYPE_MIN_REACTORS, HYPE_MIN_SCORE


HIGHLIGHT_LEAD_MS = 25_000
HIGHLIGHT_TAIL_MS = 6_000


def tip_hype_weight(amount: int) -> int:
    return 5 + min(amount // 50, 15)


def gift_hype_weight(count: int) -> int:
    return min(8 * count, 40)


class HypeTracker:
    def __init__(self):
        self._events: Dict[str, deque] = {}
        self._last_fire: Dict[str, float] = {}
        self._fired: Dict[str, int] = {}

    def forget(self, stream_id: str):
        self._events.pop(stream_id, None)
        self._last_fire.pop(stream_id, None)
        self._fired.pop(stream_id, None)

    def _measure(self, stream_id: str, now: float) -> tuple:
        q = self._events.get(stream_id) or deque()
        n_buckets = HYPE_BASELINE_S // HYPE_WINDOW_S
        free: List[Dict[str, int]] = [{} for _ in range(n_buckets)]
        paid_totals = [0] * n_buckets
        reactors: set = set()
        reaction_count = 0
        for ts, uid, w, is_paid in q:
            b = int((now - ts) // HYPE_WINDOW_S)
            if b >= n_buckets or b < 0:
                continue
            if is_paid:
                paid_totals[b] += w
            else:
                free[b][uid] = free[b].get(uid, 0) + w
            if b == 0:
                reactors.add(uid)
                reaction_count += 1
        scores = [
            sum(min(v, HYPE_FREE_CAP_PER_USER) for v in free[b].values()) + paid_totals[b]
            for b in range(n_buckets)
        ]
        baseline = sum(scores[1:]) / (n_buckets - 1)
        return scores[0], baseline, reactors, reaction_count

    def _blocked(self, stream_id: str, now: float) -> bool:
        return (self._fired.get(stream_id, 0) >= HYPE_MAX_PER_STREAM
                or now - self._last_fire.get(stream_id, float("-inf")) < HYPE_COOLDOWN_S)

    def record(self, stream_id: str, user_id: str, weight: int, paid: bool = False,
               now: Optional[float] = None, viewers: Optional[int] = None) -> Optional[dict]:
        now = time.time() if now is None else now
        q = self._events.setdefault(stream_id, deque())
        q.append((now, user_id, weight, paid))
        while q and now - q[0][0] > HYPE_BASELINE_S:
            q.popleft()

        if self._blocked(stream_id, now):
            return None
        min_reactors, min_score = hype_thresholds(viewers)
        current, baseline, reactors, reaction_count = self._measure(stream_id, now)
        if current < min_score or current < baseline * HYPE_SPIKE_MULTIPLIER:
            return None
        if len(reactors) < min_reactors:
            return None

        self._last_fire[stream_id] = now
        self._fired[stream_id] = self._fired.get(stream_id, 0) + 1
        return {
            "score": current,
            "baseline": round(baseline, 2),
            "reactors": len(reactors),
            "reaction_count": reaction_count,
            "at": now,
        }

    def progress(self, stream_id: str, now: Optional[float] = None, viewers: Optional[int] = None) -> dict:
        """How close the current window is to clipping — shown to viewers as a hype meter so
        they can see (and coordinate) the last push."""
        now = time.time() if now is None else now
        if self._blocked(stream_id, now):
            return {"cooling": True, "ratio": 0, "reactors": 0, "needed_reactors": 0}
        min_reactors, min_score = hype_thresholds(viewers)
        current, baseline, reactors, _ = self._measure(stream_id, now)
        needed_score = max(min_score, baseline * HYPE_SPIKE_MULTIPLIER)
        ratio = min(current / needed_score, len(reactors) / min_reactors, 1.0)
        return {
            "cooling":         False,
            "ratio":           round(ratio, 2),
            "reactors":        len(reactors),
            "needed_reactors": min_reactors,
        }


hype_tracker = HypeTracker()
_bg_tasks: set = set()


def _spawn(coro):
    task = asyncio.create_task(coro)
    _bg_tasks.add(task)
    task.add_done_callback(_bg_tasks.discard)
    return task


def record_hype(stream_id: str, user_id: str, weight: int, paid: bool = False):
    spike = hype_tracker.record(stream_id, user_id, weight, paid, viewers=ws_manager.viewer_count(stream_id))
    if spike:
        _spawn(_start_auto_highlight(stream_id, spike))


# Hype taps are aggregated into one broadcast per stream every HYPE_FLUSH_S so a busy
# stream doesn't fan out one websocket frame per tap per viewer.
HYPE_FLUSH_S = 0.6
_pending_taps: Dict[str, int] = {}


async def _flush_taps(stream_id: str):
    await asyncio.sleep(HYPE_FLUSH_S)
    count = _pending_taps.pop(stream_id, 0)
    if count:
        meter = hype_tracker.progress(stream_id, viewers=ws_manager.viewer_count(stream_id))
        await ws_manager.broadcast(stream_id, {"type": "hype_burst", "count": count, "meter": meter})


def queue_hype_tap(stream_id: str):
    first = stream_id not in _pending_taps
    _pending_taps[stream_id] = _pending_taps.get(stream_id, 0) + 1
    if first:
        _spawn(_flush_taps(stream_id))


_WATERMARK_HANDLE_RE = re.compile(r"[^A-Za-z0-9_.]")


def watermark_handle(name: str) -> str:
    handle = _WATERMARK_HANDLE_RE.sub("", (name or "").replace(" ", "_"))[:24]
    return f"@{handle or 'fighter'}"


def highlight_share_urls(public_id: str, handle: str, badge: Optional[str] = None) -> dict:
    layers = [
        {"width": 1080, "height": 1920, "crop": "pad", "background": "blurred:400:15"},
        {"overlay": {"font_family": "Arial", "font_size": 64, "font_weight": "bold", "text": "VICTORY AI"},
         "color": "#E8FF47", "gravity": "north_west", "x": 48, "y": 96},
        {"overlay": {"font_family": "Arial", "font_size": 44, "font_weight": "bold", "text": handle},
         "color": "#F0F0F5", "gravity": "north_west", "x": 48, "y": 176},
    ]
    if badge:
        layers.append(
            {"overlay": {"font_family": "Arial", "font_size": 40, "font_weight": "bold", "text": badge},
             "color": "#E8FF47", "gravity": "south", "y": 160}
        )
    video_tf = layers + [{"quality": "auto", "video_codec": "h264", "audio_codec": "aac"}]
    video_url, _ = cloudinary.utils.cloudinary_url(
        public_id, resource_type="video", format="mp4", secure=True, transformation=video_tf,
    )
    thumb_url, _ = cloudinary.utils.cloudinary_url(
        public_id, resource_type="video", format="jpg", secure=True,
        transformation=[{"start_offset": "auto"}] + layers[:1] + [{"quality": "auto"}],
    )
    return {"share_video_url": video_url, "thumbnail_url": thumb_url, "eager": video_tf}


def training_source_url(public_id: str, trim_start: float, trim_duration: Optional[float]) -> str:
    tf = [{"start_offset": trim_start, "duration": trim_duration}] if trim_duration else []
    url, _ = cloudinary.utils.cloudinary_url(public_id, resource_type="video", format="mp4", secure=True, transformation=tf)
    return url


def reactions_badge(peak_reactions: int) -> Optional[str]:
    return f"{peak_reactions} REACTIONS AT ONCE" if peak_reactions else None


async def _start_auto_highlight(stream_id: str, spike: dict):
    try:
        stream = await db.streams.find_one({"stream_id": stream_id}, {"_id": 0, "stream_key": 0})
        if not stream or stream.get("status") != "live" or not stream.get("playback_id"):
            return
        spike_ms = int(spike["at"] * 1000)
        highlight = await _create_highlight(
            stream,
            source="auto",
            start_ms=spike_ms - HYPE_WINDOW_S * 1000 - HIGHLIGHT_LEAD_MS,
            end_ms=spike_ms + HIGHLIGHT_TAIL_MS,
            peak_score=spike["score"],
            peak_reactions=spike["reaction_count"],
            peak_reactors=spike["reactors"],
        )
        await ws_manager.broadcast(stream_id, {
            "type": "highlight",
            "highlight_id": highlight["highlight_id"],
            "reactions": spike["reaction_count"],
            "reactors": spike["reactors"],
        })
    except Exception as e:
        logger.error(f"Auto highlight for {stream_id} failed: {e}")


async def _create_highlight(stream: dict, *, source: str, start_ms: int, end_ms: int,
                            created_by: Optional[str] = None, post_id: Optional[str] = None,
                            asset_id: Optional[str] = None,
                            peak_score: int = 0, peak_reactions: int = 0, peak_reactors: int = 0) -> dict:
    now_iso = datetime.now(timezone.utc).isoformat()
    doc = {
        "highlight_id":   f"hl_{uuid.uuid4().hex[:12]}",
        "stream_id":      stream["stream_id"],
        "stream_title":   stream.get("title", ""),
        "stream_type":    stream.get("type", "training"),
        "streamer_id":    stream["user_id"],
        "streamer_name":  stream.get("display_name") or stream.get("user_name") or "",
        "created_by":     created_by or stream["user_id"],
        "source":         source,
        "start_ms":       start_ms,
        "end_ms":         end_ms,
        "peak_score":     peak_score,
        "peak_reactions": peak_reactions,
        "peak_reactors":  peak_reactors,
        "status":         "processing" if asset_id else "clipping",
        "livepeer_asset_id": asset_id,
        "post_id":        post_id,
        "share_count":    0,
        "created_at":     now_iso,
        "updated_at":     now_iso,
    }
    await db.highlights.insert_one(doc)
    doc.pop("_id", None)
    _highlight_jobs[doc["highlight_id"]] = _spawn(_run_highlight(doc["highlight_id"], stream["playback_id"]))
    return doc


_highlight_jobs: Dict[str, asyncio.Task] = {}

HIGHLIGHT_POLL_S        = 5
HIGHLIGHT_ASSET_TRIES   = 60
HIGHLIGHT_DERIVED_TRIES = 48
HIGHLIGHT_STALE_S       = 90


async def _set_highlight(highlight_id: str, **fields):
    fields["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.highlights.update_one({"highlight_id": highlight_id}, {"$set": fields})


async def _livepeer_clip_download_url(hl: dict, playback_id: Optional[str]) -> str:
    highlight_id = hl["highlight_id"]
    asset_id = hl.get("livepeer_asset_id")
    if not asset_id:
        wait_s = hl["end_ms"] / 1000 - time.time()
        if wait_s > 0:
            await asyncio.sleep(wait_s)
        if not playback_id:
            stream = await db.streams.find_one({"stream_id": hl["stream_id"]}, {"playback_id": 1})
            playback_id = (stream or {}).get("playback_id")
        if not playback_id:
            raise RuntimeError("stream has no playback id")
        clip = await _livepeer("POST", "/clip", {
            "playbackId": playback_id,
            "startTime":  hl["start_ms"],
            "endTime":    hl["end_ms"],
            "name":       f"Highlight – {hl.get('stream_title') or 'stream'}",
        })
        asset = clip.get("asset") or {}
        asset_id = asset.get("id")
        if not asset_id:
            raise RuntimeError("Livepeer returned no asset")
        await _set_highlight(highlight_id, status="processing", livepeer_asset_id=asset_id,
                             livepeer_playback_id=asset.get("playbackId", ""))

    for _ in range(HIGHLIGHT_ASSET_TRIES):
        asset = await _livepeer("GET", f"/asset/{asset_id}")
        phase = (asset.get("status") or {}).get("phase")
        if phase == "failed":
            raise RuntimeError(f"Livepeer asset failed: {(asset.get('status') or {}).get('errorMessage', '')}")
        if phase == "ready":
            url = asset.get("downloadUrl") or (
                f"https://livepeercdn.studio/asset/{asset['playbackId']}/video" if asset.get("playbackId") else None
            )
            if url:
                return url
        await asyncio.sleep(HIGHLIGHT_POLL_S)
    raise RuntimeError("Livepeer asset never became ready")


async def _run_highlight(highlight_id: str, playback_id: Optional[str] = None):
    try:
        hl = await db.highlights.find_one({"highlight_id": highlight_id}, {"_id": 0})
        if not hl:
            return

        streamer = await db.users.find_one({"user_id": hl["streamer_id"]}, {"display_name": 1, "name": 1})
        handle = watermark_handle((streamer or {}).get("display_name") or (streamer or {}).get("name") or hl.get("streamer_name"))

        # Every highlight is its own Cloudinary asset. Watermarking the source in place would
        # put the original's public_id in the share URL, and stripping the transformation
        # from it would expose the full, untrimmed round video.
        public_id = f"victory_highlights/{highlight_id}"
        if hl["source"] == "training":
            source_url = training_source_url(hl["source_public_id"], hl.get("trim_start") or 0, hl.get("trim_duration"))
            badge = hl.get("badge")
        else:
            source_url = await _livepeer_clip_download_url(hl, playback_id)
            badge = reactions_badge(hl.get("peak_reactions", 0)) if hl["source"] == "auto" else None
        urls = highlight_share_urls(public_id, handle, badge)
        await asyncio.to_thread(
            cloudinary.uploader.upload, source_url,
            resource_type="video", public_id=public_id, overwrite=True,
            eager=[urls["eager"]], eager_async=True,
        )

        # The watermarked rendition is built asynchronously; wait until it's servable so
        # "ready" means the user can actually download it.
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as c:
            for _ in range(HIGHLIGHT_DERIVED_TRIES):
                r = await c.head(urls["share_video_url"])
                if r.status_code == 200:
                    break
                await asyncio.sleep(HIGHLIGHT_POLL_S)
            else:
                raise RuntimeError("watermarked rendition never became available")

        await _set_highlight(highlight_id, status="ready", share_video_url=urls["share_video_url"],
                             thumbnail_url=urls["thumbnail_url"], watermark_handle=handle, error=None)
        if hl.get("post_id"):
            await db.posts.update_one({"post_id": hl["post_id"]}, {"$set": {
                "share_video_url": urls["share_video_url"],
                "thumbnail_url":   urls["thumbnail_url"],
                "highlight_id":    highlight_id,
            }})
        if hl.get("stream_id"):
            await ws_manager.broadcast(hl["stream_id"], {"type": "highlight_ready", "highlight_id": highlight_id})
        if hl["source"] == "training":
            await _maybe_suggest_film_swap({**hl, "status": "ready"})
        if hl["source"] == "auto":
            await _send_push(
                hl["streamer_id"],
                title="Your stream just popped off",
                body=f"{hl.get('peak_reactions', 0)} reactions at once — tap to post it",
                url=f"/highlights?open={highlight_id}",
                tag=f"highlight-{highlight_id}",
            )
    except Exception as e:
        logger.error(f"Highlight {highlight_id} failed: {e}")
        await _set_highlight(highlight_id, status="failed", error=str(e)[:300])
    finally:
        _highlight_jobs.pop(highlight_id, None)


def _resume_highlight_if_stale(hl: dict):
    if hl.get("status") not in ("clipping", "processing") or hl["highlight_id"] in _highlight_jobs:
        return
    try:
        updated = datetime.fromisoformat(hl["updated_at"])
    except (KeyError, ValueError):
        return
    if (datetime.now(timezone.utc) - updated).total_seconds() > HIGHLIGHT_STALE_S:
        _highlight_jobs[hl["highlight_id"]] = _spawn(_run_highlight(hl["highlight_id"]))


def _public_highlight(hl: dict) -> dict:
    hl.pop("_id", None)
    hl.pop("error", None)
    hl.pop("source_public_id", None)
    hl["sent_to_squad"] = len(hl.pop("squad_viewer_ids", None) or [])
    return hl


def can_view_stream(stream: dict, user_id: str) -> bool:
    if stream["user_id"] == user_id or not stream.get("is_private"):
        return True
    return user_id in (stream.get("allowed_viewer_ids") or [])


class StreamCreate(BaseModel):
    title: str
    description: Optional[str] = ""
    type: str = "training"
    is_private: bool = False


class StreamUpdate(BaseModel):
    status: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None


@api_router.post("/streams")
async def create_stream(data: StreamCreate, user: dict = Depends(get_current_user)):
    if not LIVEPEER_API_KEY:
        raise HTTPException(500, "Streaming not configured")
    if _rate_limited(f"stream_create:{user['user_id']}", 10, 60):
        raise HTTPException(429, "Too many streams — slow down")
    if await is_content_flagged(data.title) or await is_content_flagged(data.description):
        raise HTTPException(400, "Stream title/description violates community guidelines")
    try:
        lp = await _livepeer("POST", "/stream", {
            "name": f"{user.get('name', 'Fighter')} - {data.title}",
            "profiles": [
                {"name": "720p", "bitrate": 2000000, "fps": 30, "width": 1280, "height": 720},
                {"name": "480p", "bitrate": 1000000, "fps": 30, "width": 854, "height": 480},
                {"name": "360p", "bitrate": 500000, "fps": 30, "width": 640, "height": 360},
            ],
            "record": True,
        })
    except Exception as e:
        logger.error(f"Livepeer create stream: {e}")
        raise HTTPException(502, "Failed to create stream")
    stream_id = f"str_{uuid.uuid4().hex[:12]}"
    doc = {
        "stream_id": stream_id,
        "user_id": user["user_id"],
        "user_name": user.get("name") or "Fighter",
        "user_avatar": user.get("avatar_url") or "",
        "livepeer_id": lp["id"],
        "playback_id": lp["playbackId"],
        "stream_key": lp["streamKey"],
        "rtmp_url": "rtmp://rtmp.livepeer.studio/live",
        "title": data.title,
        "description": data.description or "",
        "type": data.type,
        "is_private": data.is_private,
        "status": "idle",
        "viewer_count": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "started_at": None,
        "ended_at": None,
    }
    await db.streams.insert_one(doc)
    doc.pop("_id", None)
    return doc


class GoLiveOptions(BaseModel):
    audience: Literal["public", "squad"] = "public"
    notify_squad: bool = True


SQUAD_PING_COOLDOWN_S = 1800


async def _squad_mate_ids(user_id: str) -> List[str]:
    squads = await db.squads.find({"members": user_id}, {"members": 1}).to_list(MAX_SQUADS_PER_USER)
    mates = {m for sq in squads for m in sq.get("members", []) if m != user_id}
    return [m for m in mates if not await _is_blocked(user_id, m)]


async def _ping_squad_live(user: dict, stream_id: str, mate_ids: List[str], squad_only: bool):
    name = user.get("display_name") or user.get("name") or "Your squad mate"
    body = "Squad-only stream — get in and hype them up" if squad_only else "Get in and hype them up"
    await asyncio.gather(*[
        _send_push(m, title=f"{name} is live", body=body, url=f"/stream/{stream_id}", tag=f"live-{stream_id}")
        for m in mate_ids
    ], return_exceptions=True)


@api_router.post("/streams/go-live")
async def go_live(options: Optional[GoLiveOptions] = None, user: dict = Depends(get_current_user)):
    if not LIVEPEER_API_KEY:
        raise HTTPException(500, "Streaming not configured")
    options = options or GoLiveOptions()
    mate_ids = await _squad_mate_ids(user["user_id"])
    squad_only = options.audience == "squad"
    if squad_only and not mate_ids:
        raise HTTPException(400, "Join or create a squad to stream to your squad")
    audience_fields = {
        "is_private":         squad_only,
        "audience":           options.audience,
        "allowed_viewer_ids": mate_ids if squad_only else [],
    }

    def _after_live(stream_id: str):
        if options.notify_squad and mate_ids and not _rate_limited(f"squad_live_ping:{user['user_id']}", 1, SQUAD_PING_COOLDOWN_S):
            _spawn(_ping_squad_live(user, stream_id, mate_ids, squad_only))

    # Reuse an idle stream created by this user in the last 24 hours
    existing = await db.streams.find_one(
        {
            "user_id": user["user_id"],
            "status": "idle",
            "created_at": {"$gt": (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()},
        },
        {"_id": 0},
    )
    # Derive stream metadata from user profile
    PRO_LEVELS = {"5–10 years", "10+ years", "Professional boxer"}
    exp = user.get("experience_level", "")
    stream_meta = {
        "user_name": user.get("name") or "Fighter",
        "display_name": user.get("display_name") or user.get("name") or "Fighter",
        "user_avatar": user.get("avatar_url") or "",
        "weight_class": user.get("weight_class") or "",
        "category": "Professional" if exp in PRO_LEVELS else "Amateur",
        "role": user.get("role", "Boxer"),
        "pro_wins": user.get("pro_wins", 0),
        "pro_losses": user.get("pro_losses", 0),
        "pro_draws": user.get("pro_draws", 0),
        "amateur_wins": user.get("amateur_wins", 0),
        "amateur_losses": user.get("amateur_losses", 0),
    }

    if existing:
        now = datetime.now(timezone.utc).isoformat()
        await db.streams.update_one(
            {"stream_id": existing["stream_id"]},
            {"$set": {"status": "live", "started_at": now, **stream_meta, **audience_fields}},
        )
        _after_live(existing["stream_id"])
        return {
            "audience": options.audience,
            "stream_id": existing["stream_id"],
            "playback_id": existing["playback_id"],
            "stream_key": existing["stream_key"],
            "title": existing["title"],
        }
    # Create a fresh Livepeer stream
    title = f"{stream_meta['display_name']} — Live"
    try:
        lp = await _livepeer("POST", "/stream", {
            "name": title,
            "profiles": [
                {"name": "720p", "bitrate": 2000000, "fps": 30, "width": 1280, "height": 720},
                {"name": "480p", "bitrate": 1000000, "fps": 30, "width": 854, "height": 480},
            ],
            "record": True,
        })
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Livepeer go-live: {e}")
        raise HTTPException(502, f"Failed to create stream: {e}")
    stream_id = f"str_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "stream_id": stream_id,
        "user_id": user["user_id"],
        **stream_meta,
        "livepeer_id": lp["id"],
        "playback_id": lp["playbackId"],
        "stream_key": lp["streamKey"],
        "rtmp_url": "rtmp://rtmp.livepeer.studio/live",
        "title": title,
        "description": "",
        "type": "training",
        **audience_fields,
        "status": "live",
        "viewer_count": 0,
        "created_at": now,
        "started_at": now,
        "ended_at": None,
    }
    await db.streams.insert_one(doc)
    _after_live(doc["stream_id"])
    return {
        "audience": options.audience,
        "stream_id": doc["stream_id"],
        "playback_id": doc["playback_id"],
        "stream_key": doc["stream_key"],
        "title": doc["title"],
    }


@api_router.post("/streams/{stream_id}/whip")
async def whip_proxy(stream_id: str, request: Request, user: dict = Depends(get_current_user)):
    stream = await db.streams.find_one({"stream_id": stream_id})
    if not stream:
        raise HTTPException(404, "Stream not found")
    if stream["user_id"] != user["user_id"]:
        raise HTTPException(403, "Not your stream")
    sdp_offer = await request.body()
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as c:
            resp = await c.post(
                f"https://livepeer.studio/webrtc/{stream['stream_key']}",
                content=sdp_offer,
                headers={"Content-Type": "application/sdp"},
            )
    except Exception as e:
        logger.error(f"WHIP proxy: {e}")
        raise HTTPException(502, "WHIP negotiation failed")
    if resp.status_code not in (200, 201):
        logger.error(f"WHIP Livepeer: {resp.status_code} {resp.text[:200]}")
        raise HTTPException(502, f"Livepeer rejected WHIP offer: {resp.status_code}")
    return Response(content=resp.content, media_type="application/sdp")


@api_router.get("/streams/my")
async def my_streams(user: dict = Depends(get_current_user), limit: int = Query(10, le=20)):
    cursor = db.streams.find({"user_id": user["user_id"]}, {"_id": 0, "stream_key": 0}).sort("created_at", -1).limit(limit)
    return await cursor.to_list(length=limit)


@api_router.get("/streams")
async def list_streams(
    status: Optional[str] = Query(None),
    type: Optional[str] = Query(None),
    limit: int = Query(20, le=50),
    viewer: dict = Depends(get_current_user),
):
    q: Dict[str, Any] = {
        "$or": [{"is_private": False}, {"allowed_viewer_ids": viewer["user_id"]}],
        "is_hidden": {"$ne": True},
    }
    if status:
        q["status"] = status
    if type:
        q["type"] = type
    cursor = (
        db.streams.find(q, {"_id": 0, "stream_key": 0})
        .sort([("status", -1), ("viewer_count", -1)])
        .limit(limit)
    )
    return await cursor.to_list(length=limit)


@api_router.get("/streams/{stream_id}")
async def get_stream(stream_id: str, user: dict = Depends(get_current_user)):
    stream = await db.streams.find_one({"stream_id": stream_id, "is_hidden": {"$ne": True}}, {"_id": 0})
    if not stream:
        raise HTTPException(404, "Stream not found")
    if not can_view_stream(stream, user["user_id"]):
        raise HTTPException(403, "Private stream")
    if stream["user_id"] != user["user_id"]:
        stream.pop("stream_key", None)
        stream.pop("allowed_viewer_ids", None)
    stream["viewer_count"] = ws_manager.viewer_count(stream_id)
    return stream


@api_router.patch("/streams/{stream_id}")
async def update_stream(stream_id: str, data: StreamUpdate, user: dict = Depends(get_current_user)):
    stream = await db.streams.find_one({"stream_id": stream_id})
    if not stream:
        raise HTTPException(404, "Stream not found")
    if stream["user_id"] != user["user_id"]:
        raise HTTPException(403, "Not your stream")
    updates: Dict[str, Any] = {}
    if data.status is not None:
        updates["status"] = data.status
        if data.status == "live":
            updates["started_at"] = datetime.now(timezone.utc).isoformat()
        elif data.status == "ended":
            updates["ended_at"] = datetime.now(timezone.utc).isoformat()
    if data.title is not None:
        if await is_content_flagged(data.title):
            raise HTTPException(400, "Stream title violates community guidelines")
        updates["title"] = data.title
    if data.description is not None:
        if await is_content_flagged(data.description):
            raise HTTPException(400, "Stream description violates community guidelines")
        updates["description"] = data.description
    if updates:
        await db.streams.update_one({"stream_id": stream_id}, {"$set": updates})
    if data.status == "ended":
        hype_tracker.forget(stream_id)
        await check_and_award_belts(user["user_id"])
    updated = await db.streams.find_one({"stream_id": stream_id}, {"_id": 0})
    return updated


@api_router.delete("/streams/{stream_id}")
async def delete_stream(stream_id: str, user: dict = Depends(get_current_user)):
    stream = await db.streams.find_one({"stream_id": stream_id})
    if not stream:
        raise HTTPException(404, "Stream not found")
    if stream["user_id"] != user["user_id"]:
        raise HTTPException(403, "Not your stream")
    if stream.get("livepeer_id"):
        try:
            await _livepeer("DELETE", f"/stream/{stream['livepeer_id']}")
        except Exception as e:
            logger.warning(f"Livepeer delete: {e}")
    await db.streams.delete_one({"stream_id": stream_id})
    await db.chat_messages.delete_many({"stream_id": stream_id})
    return {"ok": True}


MAX_CLIP_MS = 60_000


class ClipCreate(BaseModel):
    caption: str = ""

@api_router.post("/streams/{stream_id}/clip")
async def create_clip(
    stream_id: str,
    start_time: int = Query(...),
    end_time: int = Query(...),
    caption: str = Query(""),
    user: dict = Depends(get_current_user),
):
    if _rate_limited(f"clip_create:{user['user_id']}", 10, 60):
        raise HTTPException(429, "Too many clips — slow down")
    stream = await db.streams.find_one({"stream_id": stream_id, "is_hidden": {"$ne": True}}, {"_id": 0})
    if not stream:
        raise HTTPException(404, "Stream not found")
    if stream["user_id"] != user["user_id"]:
        if not can_view_stream(stream, user["user_id"]):
            raise HTTPException(403, "Private stream")
        if await _is_blocked(user["user_id"], stream["user_id"]):
            raise HTTPException(403, "You can't clip this stream")
        if stream.get("status") != "live":
            raise HTTPException(400, "Stream isn't live")
    if not stream.get("playback_id"):
        raise HTTPException(400, "No playback ID")
    now_ms = int(time.time() * 1000)
    if not (0 < end_time - start_time <= MAX_CLIP_MS) or end_time > now_ms + 5_000:
        raise HTTPException(400, "Clips must be up to 60 seconds of what's already streamed")
    if await is_content_flagged(caption):
        raise HTTPException(400, "Caption violates community guidelines")
    try:
        clip_resp = await _livepeer("POST", "/clip", {
            "playbackId": stream["playback_id"],
            "startTime": start_time,
            "endTime": end_time,
            "name": f"Clip – {stream['title']}",
        })
    except Exception as e:
        logger.error(f"Livepeer clip: {e}")
        raise HTTPException(502, "Clip failed")

    asset      = clip_resp.get("asset") or {}
    playback_id = asset.get("playbackId") or ""
    asset_id    = asset.get("id") or ""
    video_url   = f"https://livepeercdn.studio/hls/{playback_id}/index.m3u8" if playback_id else ""

    # Save clip as a shareable post in the DB
    post_id = f"clip_{uuid.uuid4().hex[:12]}"
    now_iso = datetime.now(timezone.utc).isoformat()
    post_doc = {
        "post_id":            post_id,
        "user_id":            user["user_id"],
        "post_type":          "clip",
        "video_url":          video_url,
        "livepeer_asset_id":  asset_id,
        "livepeer_playback_id": playback_id,
        "caption":            caption or f"Clip from: {stream.get('title', 'stream')}",
        "tags":               ["clip", stream.get("type", "training")],
        "stream_id_ref":      stream_id,
        "stream_title":       stream.get("title", ""),
        "streamer_id":        stream.get("user_id"),
        "streamer_name":      stream.get("user_name") or "",
        "likes":              [],
        "like_count":         0,
        "comment_count":      0,
        "share_count":        0,
        "created_at":         now_iso,
    }
    await db.posts.insert_one(post_doc)
    post_doc.pop("_id", None)
    post_doc["author"] = safe_user(user)
    post_doc["liked_by_me"] = False

    if asset_id:
        highlight = await _create_highlight(
            stream, source="manual", start_ms=start_time, end_ms=end_time,
            created_by=user["user_id"], post_id=post_id, asset_id=asset_id,
        )
        await db.posts.update_one({"post_id": post_id}, {"$set": {"highlight_id": highlight["highlight_id"]}})
        post_doc["highlight_id"] = highlight["highlight_id"]

    return post_doc


@api_router.get("/highlights/mine")
async def my_highlights(
    sort: str = Query("recent", enum=["recent", "top"]),
    stream_id: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
):
    query: Dict[str, Any] = {"streamer_id": user["user_id"]}
    if stream_id:
        query["stream_id"] = stream_id
    order = [("peak_reactions", -1), ("created_at", -1)] if sort == "top" else [("created_at", -1)]
    items = await db.highlights.find(query, {"_id": 0}).sort(order).limit(100).to_list(100)
    for hl in items:
        _resume_highlight_if_stale(hl)

    ready = [h for h in items if h.get("status") == "ready"]
    all_stats = await db.highlights.aggregate([
        {"$match": {"streamer_id": user["user_id"], "status": "ready"}},
        {"$group": {"_id": None, "count": {"$sum": 1}, "best": {"$max": "$peak_reactions"},
                    "shares": {"$sum": "$share_count"}}},
    ]).to_list(1)
    stats = all_stats[0] if all_stats else {}
    return {
        "highlights": [_public_highlight(h) for h in items],
        "stats": {
            "total":          stats.get("count", 0),
            "best_reactions": stats.get("best") or 0,
            "total_shares":   stats.get("shares", 0),
            "ready_in_view":  len(ready),
        },
    }


@api_router.get("/streams/{stream_id}/highlights")
async def stream_highlights(stream_id: str, user: dict = Depends(get_current_user)):
    stream = await db.streams.find_one({"stream_id": stream_id}, {"user_id": 1, "is_private": 1, "allowed_viewer_ids": 1})
    if not stream or not can_view_stream(stream, user["user_id"]):
        raise HTTPException(404, "Stream not found")
    query: Dict[str, Any] = {"stream_id": stream_id}
    if stream["user_id"] != user["user_id"]:
        await _require_profile_visible(stream["user_id"], user)
        query["status"] = "ready"
    items = await db.highlights.find(query, {"_id": 0}).sort("peak_reactions", -1).limit(50).to_list(50)
    return [_public_highlight(h) for h in items]


async def _get_highlight_for(highlight_id: str, user: dict, owner_only: bool = False) -> dict:
    hl = await db.highlights.find_one({"highlight_id": highlight_id}, {"_id": 0})
    if not hl:
        raise HTTPException(404, "Highlight not found")
    is_owner = user["user_id"] in (hl["streamer_id"], hl.get("created_by"))
    if owner_only and not is_owner:
        raise HTTPException(403, "Not your highlight")
    if not is_owner:
        if hl.get("status") != "ready":
            raise HTTPException(404, "Highlight not found")
        if user["user_id"] not in (hl.get("squad_viewer_ids") or []):
            await _require_profile_visible(hl["streamer_id"], user)
    return hl


@api_router.get("/highlights/{highlight_id}")
async def get_highlight(highlight_id: str, user: dict = Depends(get_current_user)):
    hl = await _get_highlight_for(highlight_id, user)
    _resume_highlight_if_stale(hl)
    if hl["streamer_id"] == user["user_id"]:
        fresh = await db.users.find_one({"user_id": user["user_id"]}, {"fight_film": 1}) or {}
        hl["on_fight_film"] = highlight_id in (fresh.get("fight_film") or [])
    return _public_highlight(hl)


@api_router.post("/highlights/{highlight_id}/retry")
async def retry_highlight(highlight_id: str, user: dict = Depends(get_current_user)):
    hl = await _get_highlight_for(highlight_id, user, owner_only=True)
    if hl.get("status") != "failed":
        raise HTTPException(400, "Only failed highlights can be retried")
    if _rate_limited(f"highlight_retry:{user['user_id']}", 5, 60):
        raise HTTPException(429, "Too many retries — give it a minute")
    resumes_at = "processing" if hl.get("livepeer_asset_id") or hl["source"] == "training" else "clipping"
    await _set_highlight(highlight_id, status=resumes_at, error=None)
    _highlight_jobs[highlight_id] = _spawn(_run_highlight(highlight_id))
    return {"status": "processing"}


class HighlightPublish(BaseModel):
    caption: str = ""


@api_router.post("/highlights/{highlight_id}/publish")
async def publish_highlight(highlight_id: str, data: HighlightPublish, user: dict = Depends(get_current_user)):
    hl = await _get_highlight_for(highlight_id, user, owner_only=True)
    if hl.get("status") != "ready":
        raise HTTPException(400, "Highlight is still processing")
    if hl.get("post_id"):
        post = await db.posts.find_one({"post_id": hl["post_id"]}, {"_id": 0, "likes": 0})
        if post:
            post["author"] = safe_user(user)
            return post
    caption = data.caption.strip()[:500]
    if await is_content_flagged(caption):
        raise HTTPException(400, "Caption violates community guidelines")
    playback_id = hl.get("livepeer_playback_id") or ""
    post_id = f"clip_{uuid.uuid4().hex[:12]}"
    post_doc = {
        "post_id":              post_id,
        "user_id":              user["user_id"],
        "post_type":            "clip",
        "video_url":            f"https://livepeercdn.studio/hls/{playback_id}/index.m3u8" if playback_id else hl["share_video_url"],
        "share_video_url":      hl["share_video_url"],
        "thumbnail_url":        hl.get("thumbnail_url"),
        "livepeer_asset_id":    hl.get("livepeer_asset_id"),
        "livepeer_playback_id": playback_id,
        "highlight_id":         highlight_id,
        "is_highlight":         hl["source"] == "auto",
        "is_training_clip":     hl["source"] == "training",
        "session_id":           hl.get("session_id"),
        "peak_reactions":       hl.get("peak_reactions", 0),
        "caption":              caption or (
            f"{hl.get('stream_title')} — {hl.get('badge')}" if hl["source"] == "training"
            else f"Highlight from: {hl.get('stream_title') or 'my stream'}"
        ),
        "tags":                 ["clip", "highlight", hl.get("stream_type", "training")],
        "stream_id_ref":        hl.get("stream_id"),
        "stream_title":         hl.get("stream_title", ""),
        "streamer_id":          hl["streamer_id"],
        "streamer_name":        hl.get("streamer_name", ""),
        "likes":                [],
        "like_count":           0,
        "comment_count":        0,
        "share_count":          0,
        "created_at":           datetime.now(timezone.utc).isoformat(),
    }
    await db.posts.insert_one(post_doc)
    await _set_highlight(highlight_id, post_id=post_id)
    post_doc.pop("_id", None)
    post_doc.pop("likes", None)
    post_doc["author"] = safe_user(user)
    post_doc["liked_by_me"] = False
    return post_doc


SHARE_TARGETS = ("native", "download", "link", "tiktok", "instagram", "snapchat", "youtube", "x", "other")


class HighlightShare(BaseModel):
    target: str = "native"


@api_router.post("/highlights/{highlight_id}/share")
async def share_highlight(highlight_id: str, data: HighlightShare, user: dict = Depends(get_current_user)):
    hl = await _get_highlight_for(highlight_id, user)
    if hl.get("status") != "ready":
        raise HTTPException(400, "Highlight is still processing")
    target = data.target if data.target in SHARE_TARGETS else "other"
    if _rate_limited(f"highlight_share:{user['user_id']}:{highlight_id}", 5, 60):
        return {"share_count": hl.get("share_count", 0)}
    await db.highlights.update_one(
        {"highlight_id": highlight_id},
        {"$inc": {"share_count": 1, f"shares_by_target.{target}": 1}},
    )
    if hl.get("post_id"):
        await db.posts.update_one({"post_id": hl["post_id"]}, {"$inc": {"share_count": 1}})
    return {"share_count": hl.get("share_count", 0) + 1}


TRAINING_CLIP_S = 30


def round_avg_score(analysis: Optional[dict]) -> Optional[float]:
    dims = (analysis or {}).get("dimension_scores") or []
    vals = [d["score"] for d in dims if isinstance(d.get("score"), (int, float))]
    return sum(vals) / len(vals) if vals else None


def training_badge(score: Optional[float], dims: list, delta: Optional[float] = None) -> str:
    parts = []
    if score is not None:
        parts.append(f"AI SCORE {score:.1f}" + (f" (+{delta:.1f})" if delta and delta > 0 else ""))
    scored = [d for d in dims or [] if isinstance(d.get("score"), (int, float))]
    if scored:
        best = max(scored, key=lambda d: d["score"])
        parts.append(f"{best['dimension_name'].upper()} {best['score']:g}")
    return " · ".join(parts) or "ROUND COMPLETE"


def training_trim(duration: Optional[float]) -> tuple:
    if not duration or duration <= TRAINING_CLIP_S + 2:
        return (0, None)
    return (round((duration - TRAINING_CLIP_S) / 2, 1), TRAINING_CLIP_S)


class TrainingHighlightCreate(BaseModel):
    round_number: Optional[int] = None


@api_router.post("/sessions/{session_id}/highlight")
async def create_training_highlight(session_id: str, data: TrainingHighlightCreate, user: dict = Depends(get_current_user)):
    if _rate_limited(f"training_highlight:{user['user_id']}", 10, 60):
        raise HTTPException(429, "Too many requests — slow down")
    uid = user["user_id"]
    session = await db.sessions.find_one({"session_id": session_id, "user_id": uid}, {"_id": 0})
    if not session:
        raise HTTPException(404, "Session not found")
    videos = await db.round_videos.find(
        {"session_id": session_id, "user_id": uid, "public_id": {"$exists": True, "$ne": ""}}, {"_id": 0},
    ).to_list(50)
    # public_id is client-supplied at registration; only accept videos in this user's own
    # upload folder so nobody can watermark someone else's footage with their handle.
    videos = [v for v in videos if v["public_id"].startswith(f"victory_rounds/{uid}/")]
    if not videos:
        raise HTTPException(400, "No round videos were recorded for this session")
    if data.round_number is not None:
        video = next((v for v in videos if v.get("round_number") == data.round_number), None)
        if not video:
            raise HTTPException(404, "No video for that round")
    else:
        video = max(videos, key=lambda v: ((round_avg_score(v.get("analysis_results")) or -1), v.get("round_number", 0)))
    round_number = video.get("round_number", 1)

    existing = await db.highlights.find_one(
        {"source": "training", "session_id": session_id, "round_number": round_number}, {"_id": 0},
    )
    if existing:
        _resume_highlight_if_stale(existing)
        return _public_highlight(existing)

    duration = None
    try:
        resource = await asyncio.to_thread(cloudinary.api.resource, video["public_id"], resource_type="video")
        duration = resource.get("duration")
    except Exception as e:
        logger.warning(f"Could not read duration for {video['public_id']}: {e}")
    trim_start, trim_duration = training_trim(duration)

    analysis = video.get("analysis_results") or {}
    # The badge shows the session score (what the results screen shows) so the "+delta"
    # beside it compares like with like; the clip itself is the best-scoring round.
    score = session.get("overall_score")
    if score is None:
        score = round_avg_score(analysis)
    prev = await db.sessions.find(
        {"user_id": uid, "created_at": {"$lt": session.get("created_at", "")}}, {"overall_score": 1},
    ).sort("created_at", -1).limit(1).to_list(1)
    delta = None
    if prev and prev[0].get("overall_score") is not None and session.get("overall_score") is not None:
        delta = round(session["overall_score"] - prev[0]["overall_score"], 1)
    badge = training_badge(score, analysis.get("dimension_scores") or session.get("dimension_scores") or [], delta)

    now_iso = datetime.now(timezone.utc).isoformat()
    doc = {
        "highlight_id":     f"hl_{uuid.uuid4().hex[:12]}",
        "stream_id":        None,
        "stream_title":     f"Training · Round {round_number}",
        "stream_type":      "training",
        "streamer_id":      uid,
        "streamer_name":    user.get("display_name") or user.get("name") or "",
        "created_by":       uid,
        "source":           "training",
        "session_id":       session_id,
        "round_number":     round_number,
        "source_public_id": video["public_id"],
        "trim_start":       trim_start,
        "trim_duration":    trim_duration,
        "badge":            badge,
        "round_score":      score,
        "score_delta":      delta,
        "peak_score":       0,
        "peak_reactions":   0,
        "peak_reactors":    0,
        "status":           "processing",
        "post_id":          None,
        "share_count":      0,
        "created_at":       now_iso,
        "updated_at":       now_iso,
    }
    await db.highlights.insert_one(doc)
    _highlight_jobs[doc["highlight_id"]] = _spawn(_run_highlight(doc["highlight_id"]))
    return _public_highlight(dict(doc))


@api_router.delete("/highlights/{highlight_id}")
async def delete_highlight(highlight_id: str, user: dict = Depends(get_current_user)):
    hl = await _get_highlight_for(highlight_id, user, owner_only=True)
    if hl["streamer_id"] != user["user_id"] and hl.get("source") != "manual":
        raise HTTPException(403, "Only the streamer can delete a highlight")
    job = _highlight_jobs.pop(highlight_id, None)
    if job:
        job.cancel()
    await db.highlights.delete_one({"highlight_id": highlight_id})
    await db.highlight_stamps.delete_many({"highlight_id": highlight_id})
    await db.users.update_one({"user_id": hl["streamer_id"]}, {"$pull": {"fight_film": highlight_id}})
    if hl.get("post_id"):
        await db.posts.update_one({"post_id": hl["post_id"]}, {"$unset": {"share_video_url": "", "thumbnail_url": ""}})
    if hl.get("share_video_url"):
        try:
            await asyncio.to_thread(
                cloudinary.uploader.destroy, f"victory_highlights/{highlight_id}",
                resource_type="video", invalidate=True,
            )
        except Exception as e:
            logger.warning(f"Cloudinary destroy for {highlight_id}: {e}")
    return {"ok": True}


@app.post("/api/livepeer/webhook")
async def livepeer_webhook(request: Request):
    raw = await request.body()
    if not LIVEPEER_WEBHOOK_SECRET:
        logger.error("LIVEPEER_WEBHOOK_SECRET not set — refusing to process unsigned event")
        raise HTTPException(status_code=500, detail="Webhook not configured")
    import hmac, hashlib
    sig_header = request.headers.get("Livepeer-Signature", "")
    provided = sig_header.split("v1=")[-1].split(",")[0].strip() if "v1=" in sig_header else sig_header.strip()
    expected = hmac.new(LIVEPEER_WEBHOOK_SECRET.encode(), raw, hashlib.sha256).hexdigest()
    if not provided or not hmac.compare_digest(provided, expected):
        raise HTTPException(status_code=400, detail="Invalid signature")
    body = json.loads(raw)
    event = body.get("event", "")
    lp_id = body.get("streamId") or body.get("id", "")
    if event in ("stream.started", "stream.idle"):
        stream = await db.streams.find_one({"livepeer_id": lp_id})
        if stream:
            new_status = "live" if event == "stream.started" else "idle"
            upd: Dict[str, Any] = {"status": new_status}
            if new_status == "live":
                upd["started_at"] = datetime.now(timezone.utc).isoformat()
            await db.streams.update_one({"livepeer_id": lp_id}, {"$set": upd})
    return {"ok": True}


@app.websocket("/api/ws/chat/{stream_id}")
async def ws_chat(websocket: WebSocket, stream_id: str):
    stream = await db.streams.find_one({"stream_id": stream_id}, {"_id": 0, "stream_key": 0})
    if not stream:
        await websocket.close(code=4004)
        return
    await ws_manager.connect(websocket, stream_id)

    # Require an auth frame as the very first message (10-second window)
    try:
        raw_auth = await asyncio.wait_for(websocket.receive_text(), timeout=10.0)
        auth_payload = json.loads(raw_auth)
        if auth_payload.get("type") != "auth" or not auth_payload.get("token"):
            raise ValueError("Missing auth")
    except Exception:
        ws_manager.disconnect(websocket, stream_id)
        await websocket.close(code=4003)
        return

    clerk_user_id = await verify_clerk_token(auth_payload["token"])
    if not clerk_user_id:
        ws_manager.disconnect(websocket, stream_id)
        await websocket.close(code=4003)
        return

    ws_user = await db.users.find_one({"user_id": clerk_user_id}, {"_id": 0, "password": 0})
    if not ws_user:
        ws_manager.disconnect(websocket, stream_id)
        await websocket.close(code=4003)
        return

    server_user_id   = ws_user["user_id"]
    server_user_name = ws_user.get("display_name") or ws_user.get("name", "Fighter")
    server_user_avatar = ws_user.get("avatar_url", "")

    if not can_view_stream(stream, server_user_id) or (
        server_user_id != stream["user_id"] and await _is_blocked(server_user_id, stream["user_id"])
    ):
        ws_manager.disconnect(websocket, stream_id)
        await websocket.close(code=4003)
        return

    count = ws_manager.viewer_count(stream_id)
    await db.streams.update_one({"stream_id": stream_id}, {"$set": {"viewer_count": count}})
    # Most recent 50 messages, returned in chronological order for display.
    history = await db.chat_messages.find(
        {"stream_id": stream_id}, {"_id": 0}
    ).sort("created_at", -1).limit(50).to_list(length=50)
    history.reverse()
    await websocket.send_text(json.dumps({"type": "history", "messages": history}))
    await ws_manager.broadcast(stream_id, {"type": "viewer_count", "count": count})
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                payload = json.loads(raw)
            except Exception:
                continue
            if payload.get("type") == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))
                continue
            if payload.get("type") == "hype":
                if not _rate_limited(f"hype:{stream_id}:{server_user_id}", 8, 2):
                    queue_hype_tap(stream_id)
                    if server_user_id != stream["user_id"]:
                        record_hype(stream_id, server_user_id, 1)
                continue
            text = (payload.get("message") or "").strip()
            if not text or len(text) > 500:
                continue
            if await is_content_flagged(text):
                continue
            msg = {
                "message_id": f"msg_{uuid.uuid4().hex[:10]}",
                "stream_id": stream_id,
                "user_id":     server_user_id,
                "user_name":   server_user_name,
                "user_avatar": server_user_avatar,
                "message": text,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.chat_messages.insert_one(msg)
            msg.pop("_id", None)
            await ws_manager.broadcast(stream_id, {"type": "message", **msg})
            if server_user_id != stream["user_id"]:
                record_hype(stream_id, server_user_id, 1)
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        ws_manager.disconnect(websocket, stream_id)
        count = ws_manager.viewer_count(stream_id)
        await db.streams.update_one({"stream_id": stream_id}, {"$set": {"viewer_count": count}})
        await ws_manager.broadcast(stream_id, {"type": "viewer_count", "count": count})

# ============== BELT SYSTEM ==============

@api_router.get("/belts/catalogue")
async def get_belt_catalogue(user: dict = Depends(get_current_user)):
    earned_ids = {b["belt_id"] for b in user.get("badges", [])}
    earned_map = {b["belt_id"]: b for b in user.get("badges", [])}
    sessions = await db.sessions.find({"user_id": user["user_id"]}, {"overall_score": 1}).to_list(None)
    total = len(sessions)
    avg   = _avg_score(sessions, 4)
    comp_wins = user.get("competition_wins", 0)
    result = []
    for belt_id, belt in BELT_CATALOGUE.items():
        earned = belt_id in earned_ids
        entry = {**belt, "belt_id": belt_id, "earned": earned,
                 "earned_at": earned_map[belt_id]["earned_at"] if earned else None}
        # progress hint
        if belt_id == "heat_seeker":    entry["progress"] = f"{min(total,10)}/10 sessions"
        elif belt_id == "voltage":      entry["progress"] = f"{min(total,25)}/25 sessions"
        elif belt_id == "diamond_gloves": entry["progress"] = f"{min(total,100)}/100 sessions"
        elif belt_id == "living_legend":  entry["progress"] = f"{min(total,250)}/250 sessions"
        elif belt_id == "sharpshooter": entry["progress"] = f"avg {round(avg,1)}/7.0 ({total} sessions)"
        elif belt_id == "elite":        entry["progress"] = f"avg {round(avg,1)}/8.0 ({total} sessions)"
        elif belt_id == "masterclass":  entry["progress"] = f"avg {round(avg,1)}/9.0 ({total} sessions)"
        elif belt_id == "regional_champ": entry["progress"] = f"{comp_wins}/3 wins"
        elif belt_id == "national_title": entry["progress"] = f"{comp_wins}/5 wins"
        elif belt_id == "world_champion": entry["progress"] = f"{comp_wins}/10 wins"
        result.append(entry)
    return result

# ============== EMOTE SYSTEM ==============

EMOTE_REACTIONS = {
    "hype":     {"label": "Hype",     "emoji": "🔥", "desc": "pumping fists in the air, celebrating, fired up explosive energy"},
    "ko":       {"label": "KO'd",     "emoji": "😵", "desc": "knocked out cold on the canvas, cartoon stars and birds swirling around head"},
    "dodge":    {"label": "Slip",     "emoji": "😏", "desc": "slipping a punch with a smirk, Matrix-style dodge, cool and composed"},
    "uppercut": {"label": "Uppercut", "emoji": "💥", "desc": "throwing a massive explosive uppercut, bursting with power"},
    "combo":    {"label": "Combo",    "emoji": "👊", "desc": "throwing a rapid jab-cross-hook combination, hands a blur"},
    "gassed":   {"label": "Gassed",   "emoji": "😮‍💨", "desc": "completely exhausted, hands on knees, out of breath"},
    "love":     {"label": "Love",     "emoji": "❤️",  "desc": "heart eyes, glowing with love and admiration"},
    "dead":     {"label": "Dead",     "emoji": "💀", "desc": "collapsed on the floor, dying of laughter"},
    "respect":  {"label": "Respect",  "emoji": "🫡", "desc": "bowing deeply in total respect, saluting with honour"},
    "goat":     {"label": "GOAT",     "emoji": "🐐", "desc": "wearing a golden crown with goat horns, greatest of all time stance"},
    "shocked":  {"label": "No Way",   "emoji": "😱", "desc": "jaw completely dropped, eyes wide in total disbelief"},
    "clinch":   {"label": "Clinch",   "emoji": "🤝", "desc": "grabbing in a bear-hug clinch, arms locked tight"},
}

EMOTE_TOKEN_PRICES = [0, 50, 100, 200]  # 0 = free with any subscription

import urllib.parse as _url_parse

class EmoteCreate(BaseModel):
    reaction_type: str
    name: str             # display name, e.g. "GOGOEGO"
    token_price: int = 0  # 0 | 50 | 100 | 200

@api_router.post("/emotes/generate")
async def generate_emote(data: EmoteCreate, user: dict = Depends(get_current_user)):
    """Generate an emote image via Pollinations.ai and persist it."""
    if _rate_limited(f"emote_generate:{user['user_id']}", 10, 60):
        raise HTTPException(429, "Too many requests — try again in a minute")
    if data.reaction_type not in EMOTE_REACTIONS:
        raise HTTPException(400, "Unknown reaction type")
    if data.token_price not in EMOTE_TOKEN_PRICES:
        raise HTTPException(400, "Invalid token price")
    if not data.name.strip():
        raise HTTPException(400, "Emote name is required")
    if await is_content_flagged(data.name):
        raise HTTPException(400, "Emote name violates community guidelines")

    reaction = EMOTE_REACTIONS[data.reaction_type]
    partner  = user.get("training_partner") or {}
    partner_name  = partner.get("name", "boxer")
    partner_style = partner.get("style_name") or partner.get("style") or "professional boxer"

    prompt = (
        f"Twitch emote sticker of {partner_name}, a {partner_style} boxing character, "
        f"{reaction['desc']}, "
        f"transparent background, no background, isolated character, "
        f"chibi cartoon sticker art, bold black outlines, "
        f"vivid colours, expressive eyes, boxing gloves, highly detailed emote, cutout sticker"
    )
    seed = abs(hash(f"{user['user_id']}{data.reaction_type}")) % 999999
    encoded = _url_parse.quote(prompt)
    image_url = (
        f"https://image.pollinations.ai/prompt/{encoded}"
        f"?width=256&height=256&nologo=true&seed={seed}&model=flux&transparent=true"
    )

    emote_id = f"emote_{uuid.uuid4().hex[:12]}"
    doc = {
        "emote_id":      emote_id,
        "owner_id":      user["user_id"],
        "name":          data.name.strip().upper()[:20],
        "reaction_type": data.reaction_type,
        "emoji":         reaction["emoji"],
        "label":         reaction["label"],
        "image_url":     image_url,
        "token_price":   data.token_price,
        "unlock_count":  0,
        "is_active":     True,
        "created_at":    datetime.now(timezone.utc).isoformat(),
    }
    await db.emotes.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/emotes/my-emotes")
async def get_my_emotes(user: dict = Depends(get_current_user)):
    emotes = await db.emotes.find(
        {"owner_id": user["user_id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    return emotes


@api_router.get("/emotes/{owner_id}/collection")
async def get_emote_collection(owner_id: str, current_user: dict = Depends(get_current_user)):
    """Returns a streamer's active emotes, each flagged with whether the viewer owns it."""
    emotes = await db.emotes.find(
        {"owner_id": owner_id, "is_active": True}, {"_id": 0}
    ).sort("created_at", -1).to_list(50)

    unlocked_ids = set()
    for e in emotes:
        rec = await db.emote_unlocks.find_one({
            "user_id": current_user["user_id"],
            "emote_id": e["emote_id"],
        })
        if rec or e["token_price"] == 0 or owner_id == current_user["user_id"]:
            unlocked_ids.add(e["emote_id"])

    for e in emotes:
        e["owned"] = e["emote_id"] in unlocked_ids
    return emotes


@api_router.get("/emotes/unlocked")
async def get_unlocked_emotes(stream_owner_id: str = Query(...), current_user: dict = Depends(get_current_user)):
    """All emotes from stream_owner_id that the current user has access to."""
    all_emotes = await db.emotes.find(
        {"owner_id": stream_owner_id, "is_active": True}, {"_id": 0}
    ).to_list(50)
    result = []
    for e in all_emotes:
        if (e["token_price"] == 0
                or stream_owner_id == current_user["user_id"]
                or await db.emote_unlocks.find_one({"user_id": current_user["user_id"], "emote_id": e["emote_id"]})):
            result.append(e)
    return result


@api_router.post("/emotes/{emote_id}/purchase")
async def purchase_emote(emote_id: str, user: dict = Depends(get_current_user)):
    emote = await db.emotes.find_one({"emote_id": emote_id}, {"_id": 0})
    if not emote:
        raise HTTPException(404, "Emote not found")
    if emote["owner_id"] == user["user_id"]:
        raise HTTPException(400, "You already own your own emotes")
    if await db.emote_unlocks.find_one({"user_id": user["user_id"], "emote_id": emote_id}):
        raise HTTPException(400, "Already unlocked")

    price = emote.get("token_price", 0)
    if price > 0:
        # Deduct from buyer only if they still have the balance (guards double-spend / negative balance)
        debit = await db.users.update_one(
            {"user_id": user["user_id"], "token_balance": {"$gte": price}},
            {"$inc": {"token_balance": -price}},
        )
        if debit.matched_count == 0:
            raise HTTPException(402, detail="insufficient_tokens")
        await db.users.update_one({"user_id": emote["owner_id"]},          {"$inc": {"token_balance": int(price * 0.7)}})

    await db.emote_unlocks.insert_one({
        "unlock_id":   f"unlock_{uuid.uuid4().hex[:12]}",
        "user_id":     user["user_id"],
        "emote_id":    emote_id,
        "owner_id":    emote["owner_id"],
        "unlocked_at": datetime.now(timezone.utc).isoformat(),
    })
    await db.emotes.update_one({"emote_id": emote_id}, {"$inc": {"unlock_count": 1}})

    # Notify emote owner
    buyer_name = user.get("display_name") or user.get("name", "Someone")
    await _send_push(
        emote["owner_id"],
        title=f"{buyer_name} bought your {emote['name']} emote!",
        body=f"+{int(price * 0.7):,} tokens earned" if price > 0 else "Your free emote is spreading 🔥",
        url="/dashboard",
        tag=f"emote-sale-{emote_id}",
    )

    return {"ok": True, "emote_id": emote_id}


@api_router.delete("/emotes/{emote_id}")
async def delete_emote(emote_id: str, user: dict = Depends(get_current_user)):
    emote = await db.emotes.find_one({"emote_id": emote_id})
    if not emote or emote["owner_id"] != user["user_id"]:
        raise HTTPException(403, "Not your emote")
    await db.emotes.delete_one({"emote_id": emote_id})
    return {"ok": True}


# ─────────────────────────────────────────────────────────────────────────────

_default_origins = "https://victory-ai-one.vercel.app,https://victory-ai-alpha.vercel.app,http://localhost:3000"
_cors_origins = [o.strip() for o in os.environ.get('CORS_ORIGINS', _default_origins).split(',') if o.strip()]
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=_cors_origins, allow_methods=["*"], allow_headers=["*"])


def _safe_checkout_origin(origin_url: str) -> str:
    """Prevents open-redirect: only allow checkout redirects back to a known frontend origin."""
    origin_url = (origin_url or "").rstrip("/")
    return origin_url if origin_url in _cors_origins else _cors_origins[0]

from starlette.middleware.base import BaseHTTPMiddleware

class _SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("Strict-Transport-Security", "max-age=63072000; includeSubDomains")
        return response

app.add_middleware(_SecurityHeadersMiddleware)

# Prices and the founder-spot count are public, read-only and carry no user data, so any
# site may read them — including the waitlist site's Lovable preview, whose address isn't
# in CORS_ORIGINS. Everything else (sign-ups included) stays limited to our own origins.
PUBLIC_READ_PATHS = {"/api/pricing", "/api/waitlist/stats"}


class _PublicReadCorsMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        if request.url.path not in PUBLIC_READ_PATHS or request.method not in ("GET", "HEAD", "OPTIONS"):
            return await call_next(request)
        if request.method == "OPTIONS":
            return Response(status_code=204, headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Max-Age": "86400",
            })
        response = await call_next(request)
        response.headers["Access-Control-Allow-Origin"] = "*"
        if "access-control-allow-credentials" in response.headers:
            del response.headers["access-control-allow-credentials"]
        if "vary" in response.headers:
            del response.headers["vary"]
        return response


app.add_middleware(_PublicReadCorsMiddleware)


# Public, identical-for-everyone JSON that changes rarely: let browsers reuse it instead of
# asking again on every screen. Short max-ages where the data moves (spots left, the counter).
_PUBLIC_CACHE_CONTROL = {
    "/api/onboarding/partner-styles": "public, max-age=3600",
    "/api/onboarding/social-proof": "public, max-age=3600",
    "/api/pricing": "public, max-age=60",  # includes the live founder-spots count
    "/api/waitlist/stats": "public, max-age=30",
}


class _PublicCacheMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        policy = _PUBLIC_CACHE_CONTROL.get(scope.get("path")) if scope["type"] == "http" and scope.get("method") == "GET" else None
        if not policy:
            return await self.app(scope, receive, send)

        async def send_with_cache(message):
            if message["type"] == "http.response.start" and message.get("status") == 200:
                headers = [(k, v) for k, v in message.get("headers", []) if k.lower() != b"cache-control"]
                message = {**message, "headers": headers + [(b"cache-control", policy.encode())]}
            await send(message)

        await self.app(scope, receive, send_with_cache)


app.add_middleware(_PublicCacheMiddleware)
# ============== VARIABLE REWARDS ==============
# Three reward loops that make every session end on something the fighter couldn't
# predict: personal bests across 16 dimensions (self), a scouting report of varying type
# and rarity (hunt, in information — never money), and squad stamps on round clips
# (tribe). Only real analysed scores feed PBs, season score points and reports.

PB_NEAR_MISS = {"Overall": 0.3}
PB_NEAR_MISS_DIM = 1
_PB_KEY_RE = re.compile(r"[^A-Za-z0-9 ]")


def _pb_key(name: str) -> str:
    return _PB_KEY_RE.sub("", name)[:40]


def compute_pb_changes(pbs: dict, overall: Optional[float], dims: list) -> dict:
    entries = []
    if isinstance(overall, (int, float)):
        entries.append(("Overall", overall))
    entries += [(d["dimension_name"], d["score"]) for d in dims or []
                if isinstance(d.get("score"), (int, float))]
    new, near, baselines = [], [], 0
    for name, score in entries:
        best = (pbs or {}).get(_pb_key(name))
        if best is None:
            baselines += 1
        elif score > best:
            new.append({"name": name, "score": score, "prev": best})
        else:
            gap = round(best - score, 1)
            if 0 < gap <= PB_NEAR_MISS.get(name, PB_NEAR_MISS_DIM):
                near.append({"name": name, "score": score, "best": best, "gap": gap})
    near.sort(key=lambda n: n["gap"])
    return {"new": new, "near": near[:3], "baselines": baselines, "entries": entries}


SEASON_EPOCH = date(2026, 1, 5)
SEASON_DAYS = 42
SEASON_RANKS = [
    ("Bronze", 0), ("Silver", 100), ("Gold", 250),
    ("Platinum", 450), ("Diamond", 700), ("Champion", 1000),
]
SESSION_POINTS = 10
PB_POINTS = 15


def current_season(today: Optional[date] = None) -> dict:
    today = today or datetime.now(timezone.utc).date()
    n = max(0, (today - SEASON_EPOCH).days // SEASON_DAYS)
    start = SEASON_EPOCH + timedelta(days=n * SEASON_DAYS)
    end = start + timedelta(days=SEASON_DAYS)
    return {"season_id": f"S{n + 1}", "number": n + 1, "starts": start.isoformat(),
            "ends": end.isoformat(), "days_left": (end - today).days}


def season_rank(points: int) -> dict:
    idx = max(i for i, (_, at) in enumerate(SEASON_RANKS) if points >= at)
    nxt = SEASON_RANKS[idx + 1] if idx + 1 < len(SEASON_RANKS) else None
    return {"rank": SEASON_RANKS[idx][0], "rank_index": idx,
            "next_rank": nxt[0] if nxt else None, "next_at": nxt[1] if nxt else None}


def session_points(overall: Optional[float], new_pbs: int, trusted_scores: bool) -> int:
    pts = SESSION_POINTS
    if trusted_scores and isinstance(overall, (int, float)):
        pts += round(overall * 5) + new_pbs * PB_POINTS
    return pts


SCOUTING_TYPES = ("weakness", "strength", "percentile", "elite")


def build_scouting_report(dims: list, seed: str, percentiles: Optional[dict] = None) -> dict:
    scored = [d for d in dims or [] if isinstance(d.get("score"), (int, float))]
    if not scored:
        return {"locked": True, "type": None, "rarity": None,
                "title": "Scouting report locked",
                "body": "Record a round on video and the AI will scout your technique."}
    rng = random.Random(seed)
    best = max(scored, key=lambda d: d["score"])
    worst = min(scored, key=lambda d: d["score"])
    options = [("weakness", 40), ("strength", 35)]
    top_pct = None
    if percentiles:
        name, pct = max(percentiles.items(), key=lambda kv: kv[1])
        if pct >= 60:
            top_pct = (name, pct)
            options.append(("percentile", 20))
    if best["score"] >= 9 or (len(scored) >= 4 and worst["score"] >= 7):
        options.append(("elite", 5))
    kind = rng.choices([o[0] for o in options], weights=[o[1] for o in options])[0]

    if kind == "weakness":
        drill = DRILLS.get(worst["dimension_name"], {})
        return {"locked": False, "type": kind, "rarity": "common", "dimension": worst["dimension_name"],
                "title": f"Scout says: {worst['dimension_name']} is the gap",
                "body": f"Scored {worst['score']}/10 today. Fix it with “{drill.get('name', 'fundamentals')}”: "
                        f"{drill.get('description', 'drill the basics until it is automatic.')}"}
    if kind == "strength":
        return {"locked": False, "type": kind, "rarity": "common", "dimension": best["dimension_name"],
                "title": f"Weapon spotted: {best['dimension_name']}",
                "body": f"{best['score']}/10 today — build your combos around it."}
    if kind == "percentile":
        name, pct = top_pct
        return {"locked": False, "type": kind, "rarity": "rare", "dimension": name,
                "title": f"Top {100 - pct}% {name} this week",
                "body": f"Your {name.lower()} beat {pct}% of fighters who trained on Victory AI in the last 7 days."}
    return {"locked": False, "type": "elite", "rarity": "epic",
            "title": "Elite pattern detected",
            "body": (f"{best['dimension_name']} hit {best['score']}/10" if best["score"] >= 9
                     else f"No dimension under 7 across {len(scored)} scored")
                    + " — that's a pro-level round. Screenshot this one."}


PERCENTILE_MIN_SAMPLE = 20


async def _weekly_percentiles(user_id: str, dims: list) -> dict:
    scored = {d["dimension_name"]: d["score"] for d in dims or [] if isinstance(d.get("score"), (int, float))}
    if not scored:
        return {}
    cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    others = await db.sessions.find(
        {"user_id": {"$ne": user_id}, "scored": True, "created_at": {"$gte": cutoff}},
        {"dimension_scores": 1},
    ).limit(2000).to_list(2000)
    pool: Dict[str, list] = {}
    for s in others:
        for d in s.get("dimension_scores") or []:
            if isinstance(d.get("score"), (int, float)) and d.get("dimension_name") in scored:
                pool.setdefault(d["dimension_name"], []).append(d["score"])
    result = {}
    for name, mine in scored.items():
        vals = pool.get(name, [])
        if len(vals) >= PERCENTILE_MIN_SAMPLE:
            result[name] = round(100 * sum(1 for v in vals if v < mine) / len(vals))
    return result


# ---- Fighter identity ----
# Goal: fighters keep coming back because they see themselves as boxers, not app users.
# Psychology: self-perception theory (people work out who they are from what they've seen
# themselves do) and the labelling effect (an earned, specific label pulls behaviour towards
# it). Praise works when it names the behaviour, not talent, and when it's believable.
# Design: after each session the coach names one trait the fighter showed, quotes the
# evidence and counts how many times they've shown it. A trait is only awarded on evidence:
# a verified AI score, a live count, or sessions actually logged.

IDENTITY_TRAITS = {
    "iron_guard":    ("Iron Guard", "You keep your hands home. That's how you fight now."),
    "sharp_jab":     ("Sharp Jab", "Your jab is turning into your weapon."),
    "slick":         ("Slick", "You make shots miss. That's a slick fighter's instinct."),
    "relentless":    ("Relentless", "You don't stop throwing. Nobody wants to face that."),
    "combo_puncher": ("Combination Puncher", "You punch in bunches, not singles."),
    "finisher":      ("Finisher", "You finish stronger than you start. That's a fighter's engine."),
    "clean_mover":   ("Clean Mover", "Your feet put you in the right place."),
    "shows_up":      ("Shows Up", "You turn up when it would be easier not to. That's what fighters are made of."),
}
TRAIT_SCORE = 7
SHOWS_UP_PER_WEEK = 3


def _round_avg(rnd: dict) -> Optional[float]:
    vals = [d.get("score") for d in ((rnd.get("analysis") or {}).get("dimension_scores") or [])
            if isinstance(d.get("score"), (int, float))]
    return sum(vals) / len(vals) if vals else None


def identity_evidence(session: dict, trusted_scores: bool, sessions_this_week: int) -> list:
    """Every trait this session gives evidence for, as (key, evidence) in display order."""
    dims = {d["dimension_name"]: d["score"] for d in session.get("dimension_scores") or []
            if trusted_scores and isinstance(d.get("score"), (int, float))}
    live = session.get("live_stats") or {}
    minutes = (live.get("rounds") or 0) * ((session.get("training_config") or {}).get("round_duration") or 0) / 60
    found = {}

    def scored(key, *names):
        best = max(((dims[n], n) for n in names if n in dims), default=None)
        if best and best[0] >= TRAIT_SCORE:
            found.setdefault(key, f"{best[1]} {best[0]:g}/10")

    scored("iron_guard", "Guard Position")
    scored("sharp_jab", "Jab")
    scored("slick", "Head Movement", "Slip", "Roll")
    scored("combo_puncher", "Combination Flow")
    scored("clean_mover", "Footwork")
    if isinstance(live.get("guard_pct"), int) and live["guard_pct"] >= 80:
        found.setdefault("iron_guard", f"guard up {live['guard_pct']}% of the time")
    if live.get("rounds") and live.get("head_moves", 0) / live["rounds"] >= 15:
        found.setdefault("slick", f"{live['head_moves']} head movements")
    if live.get("best_combo", 0) >= 5:
        found.setdefault("combo_puncher", f"a {live['best_combo']}-punch combination")
    if minutes and live.get("punches", 0) / minutes >= 45:
        found["relentless"] = f"{round(live['punches'] / minutes)} punches a minute"
    rounds = [r for r in (session.get("rounds") or []) if trusted_scores and _round_avg(r) is not None]
    if len(rounds) >= 2 and _round_avg(rounds[-1]) > _round_avg(rounds[0]):
        found["finisher"] = f"your last round scored higher than your first"
    if sessions_this_week >= SHOWS_UP_PER_WEEK:
        found["shows_up"] = f"{sessions_this_week} sessions this week"
    return [(k, found[k]) for k in IDENTITY_TRAITS if k in found]


def pick_identity_trait(evidence: list, counts: dict) -> Optional[tuple]:
    # The least-earned trait wins, so the label a fighter hears keeps widening — and a
    # new one is a surprise worth coming back for.
    if not evidence:
        return None
    return min(evidence, key=lambda kv: counts.get(kv[0], 0))


async def apply_identity(user_id: str, session: dict, trusted_scores: bool) -> Optional[dict]:
    week_ago = (datetime.now(timezone.utc).date() - timedelta(days=6)).strftime("%Y-%m-%d")
    this_week = await db.sessions.count_documents({"user_id": user_id, "date": {"$gte": week_ago}})
    fresh = await db.users.find_one({"user_id": user_id}, {"identity_traits": 1}) or {}
    counts = fresh.get("identity_traits") or {}
    picked = pick_identity_trait(identity_evidence(session, trusted_scores, this_week), counts)
    if not picked:
        return None
    key, evidence = picked
    await db.users.update_one({"user_id": user_id}, {"$inc": {f"identity_traits.{key}": 1}})
    counts = {**counts, key: counts.get(key, 0) + 1}
    name, statement = IDENTITY_TRAITS[key]
    return {"key": key, "name": name, "evidence": evidence, "statement": statement,
            "count": counts[key], "traits": top_identity_traits(counts)}


def top_identity_traits(counts: dict, n: int = 3) -> list:
    ranked = sorted(((c, k) for k, c in (counts or {}).items() if k in IDENTITY_TRAITS and c > 0), reverse=True)
    return [{"name": IDENTITY_TRAITS[k][0], "count": c} for c, k in ranked[:n]]


async def apply_session_rewards(user: dict, session: dict, trusted_scores: bool) -> dict:
    uid = user["user_id"]
    overall = session.get("overall_score") if trusted_scores else None
    dims = session.get("dimension_scores") if trusted_scores else []
    fresh = await db.users.find_one({"user_id": uid}, {"personal_bests": 1}) or {}
    pb = compute_pb_changes(fresh.get("personal_bests") or {}, overall, dims)
    if pb["entries"]:
        await db.users.update_one({"user_id": uid}, {"$max": {
            f"personal_bests.{_pb_key(name)}": score for name, score in pb["entries"]
        }})

    season = current_season()
    pts = session_points(overall, len(pb["new"]), trusted_scores)
    before = await db.season_stats.find_one({"user_id": uid, "season_id": season["season_id"]}, {"points": 1}) or {}
    stats = await db.season_stats.find_one_and_update(
        {"user_id": uid, "season_id": season["season_id"]},
        {"$inc": {"points": pts, "sessions": 1, "pbs": len(pb["new"])}},
        upsert=True, return_document=True,
    )
    total = (stats or {}).get("points", pts)
    rank = season_rank(total)
    ranked_up = season_rank(before.get("points", 0))["rank_index"] < rank["rank_index"]

    report = None
    if trusted_scores:
        percentiles = await _weekly_percentiles(uid, dims)
        report = build_scouting_report(dims, session["session_id"], percentiles)
        if report.get("type"):
            await db.users.update_one({"user_id": uid}, {"$addToSet": {"scouting_types_found": report["type"]}})
            found = await db.users.find_one({"user_id": uid}, {"scouting_types_found": 1}) or {}
            report["types_found"] = len(found.get("scouting_types_found") or [])
            report["types_total"] = len(SCOUTING_TYPES)

    await _complete_bookings_for(uid)
    callouts_beaten = await _settle_callouts_for(user, overall, dims) if trusted_scores else []
    identity = await apply_identity(uid, session, trusted_scores)

    return {
        "identity": identity,
        "callouts_beaten": callouts_beaten,
        "personal_bests": {"new": pb["new"], "near": pb["near"], "baselines": pb["baselines"]},
        "season": {**season, **rank, "points": total, "earned": pts, "ranked_up": ranked_up},
        "scouting_report": report,
    }


async def safe_session_rewards(user: dict, session: dict, trusted_scores: bool) -> dict:
    # Rewards are a bonus layer: a failure here must never lose or 500 the session itself.
    try:
        return await apply_session_rewards(user, session, trusted_scores)
    except Exception as e:
        logger.error(f"Session rewards failed for {session.get('session_id')}: {e}")
        return {}


@api_router.get("/seasons/me")
async def my_season(user: dict = Depends(get_current_user)):
    season = current_season()
    stats = await db.season_stats.find_one({"user_id": user["user_id"], "season_id": season["season_id"]}, {"_id": 0}) or {}
    points = stats.get("points", 0)
    return {**season, **season_rank(points), "points": points, "sessions": stats.get("sessions", 0)}


@api_router.get("/users/me/personal-bests")
async def my_personal_bests(user: dict = Depends(get_current_user)):
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"personal_bests": 1}) or {}
    return fresh.get("personal_bests") or {}


# ── Squad stamps on round clips ──────────────────────────────────────────────

SQUAD_STAMPS = {
    "heavy_hands":   "Heavy hands",
    "clean":         "Clean",
    "sharp_jab":     "Sharp jab",
    "slick_defence": "Slick D",
    "keep_grinding": "Keep grinding",
}
VERDICT_AT = 5
SQUAD_ROUND_TTL_DAYS = 14


def teasers_enabled(u: Optional[dict]) -> bool:
    return ((u or {}).get("notification_prefs") or {}).get("teasers", True)


def stamp_summary(stamps: list, reveal_at: int = VERDICT_AT) -> dict:
    tally = {k: 0 for k in SQUAD_STAMPS}
    for s in stamps:
        if s.get("stamp") in tally:
            tally[s["stamp"]] += 1
    n = len(stamps)
    verdict = None
    if n >= reveal_at:
        top = max(tally.items(), key=lambda kv: kv[1])
        verdict = {"stamp": top[0], "label": SQUAD_STAMPS[top[0]], "count": top[1]}
    return {"count": n, "tally": tally, "verdict": verdict,
            "verdict_in": max(0, reveal_at - n)}


@api_router.post("/highlights/{highlight_id}/send-to-squad")
async def send_highlight_to_squad(highlight_id: str, user: dict = Depends(get_current_user)):
    hl = await _get_highlight_for(highlight_id, user, owner_only=True)
    if hl["streamer_id"] != user["user_id"]:
        raise HTTPException(403, "Only the fighter in the clip can send it")
    if hl.get("status") != "ready":
        raise HTTPException(400, "Highlight is still processing")
    if _rate_limited(f"squad_send:{user['user_id']}", 5, 3600):
        raise HTTPException(429, "You've sent a lot to your squad — try again later")
    mates = await _squad_mate_ids(user["user_id"])
    if not mates:
        raise HTTPException(400, "Join or create a squad first")
    already = set(hl.get("squad_viewer_ids") or [])
    new_mates = [m for m in mates if m not in already]
    await db.highlights.update_one({"highlight_id": highlight_id}, {
        "$addToSet": {"squad_viewer_ids": {"$each": mates}},
        "$set": {"sent_to_squad_at": datetime.now(timezone.utc).isoformat()},
    })
    name = user.get("display_name") or user.get("name") or "Your squad mate"
    prefs = {u["user_id"]: u for u in await db.users.find(
        {"user_id": {"$in": new_mates}}, {"user_id": 1, "notification_prefs": 1}).to_list(len(new_mates) or 1)}
    await asyncio.gather(*[
        _send_push(m, title=f"{name} wants your verdict", body="Rate their round — one tap",
                   url=f"/rate/{highlight_id}", tag=f"rate-{highlight_id}")
        for m in new_mates if teasers_enabled(prefs.get(m))
    ], return_exceptions=True)
    return {"sent_to": len(mates)}


class StampCreate(BaseModel):
    stamp: str
    comment: str = Field("", max_length=80)


@api_router.post("/highlights/{highlight_id}/stamps")
async def stamp_highlight(highlight_id: str, data: StampCreate, user: dict = Depends(get_current_user)):
    hl = await db.highlights.find_one({"highlight_id": highlight_id}, {"_id": 0})
    if not hl or user["user_id"] not in (hl.get("squad_viewer_ids") or []):
        raise HTTPException(404, "Round not found")
    if data.stamp not in SQUAD_STAMPS:
        raise HTTPException(400, "Unknown stamp")
    if _rate_limited(f"stamp:{user['user_id']}", 30, 60):
        raise HTTPException(429, "Slow down")
    comment = data.comment.strip()
    if comment and await is_content_flagged(comment):
        raise HTTPException(400, "Comment violates community guidelines")
    now = datetime.now(timezone.utc).isoformat()
    res = await db.highlight_stamps.update_one(
        {"highlight_id": highlight_id, "user_id": user["user_id"]},
        {"$set": {"stamp": data.stamp, "comment": comment, "updated_at": now},
         "$setOnInsert": {"created_at": now, "owner_id": hl["streamer_id"]}},
        upsert=True,
    )
    stamps = await db.highlight_stamps.find({"highlight_id": highlight_id}, {"stamp": 1}).to_list(100)
    summary = stamp_summary(stamps)
    if res.upserted_id is not None:
        owner = await db.users.find_one({"user_id": hl["streamer_id"]}, {"notification_prefs": 1})
        if teasers_enabled(owner):
            n = summary["count"]
            teaser = (f"The verdict is in — tap to see it" if n == VERDICT_AT
                      else f"{n} {'person' if n == 1 else 'people'} reacted to your round — see who")
            _spawn(_send_push(hl["streamer_id"], title="Your squad reacted", body=teaser,
                              url=f"/highlights?open={highlight_id}", tag=f"stamps-{highlight_id}"))
    return {**summary, "my_stamp": data.stamp}


@api_router.get("/highlights/{highlight_id}/stamps")
async def get_highlight_stamps(highlight_id: str, user: dict = Depends(get_current_user)):
    hl = await db.highlights.find_one({"highlight_id": highlight_id}, {"_id": 0})
    if not hl:
        raise HTTPException(404, "Round not found")
    is_owner = hl["streamer_id"] == user["user_id"]
    if not is_owner and user["user_id"] not in (hl.get("squad_viewer_ids") or []):
        raise HTTPException(404, "Round not found")
    stamps = await db.highlight_stamps.find({"highlight_id": highlight_id}, {"_id": 0}).sort("created_at", 1).to_list(100)
    summary = stamp_summary(stamps)
    mine = next((s for s in stamps if s["user_id"] == user["user_id"]), None)
    out = {**summary, "my_stamp": mine["stamp"] if mine else None, "sent_to": len(hl.get("squad_viewer_ids") or [])}
    if is_owner:
        people = {u["user_id"]: u for u in await db.users.find(
            {"user_id": {"$in": [s["user_id"] for s in stamps]}}, {"_id": 0, "password": 0}).to_list(100)}
        out["reactions"] = [{
            "user": safe_user(people.get(s["user_id"], {"user_id": s["user_id"]})),
            "stamp": s["stamp"], "label": SQUAD_STAMPS.get(s["stamp"], s["stamp"]),
            "comment": s.get("comment", ""),
        } for s in stamps]
    return out


@api_router.get("/squad-rounds/inbox")
async def squad_rounds_inbox(user: dict = Depends(get_current_user)):
    cutoff = (datetime.now(timezone.utc) - timedelta(days=SQUAD_ROUND_TTL_DAYS)).isoformat()
    items = await db.highlights.find(
        {"squad_viewer_ids": user["user_id"], "status": "ready", "sent_to_squad_at": {"$gte": cutoff}},
        {"_id": 0},
    ).sort("sent_to_squad_at", -1).limit(20).to_list(20)
    mine = {s["highlight_id"]: s["stamp"] for s in await db.highlight_stamps.find(
        {"user_id": user["user_id"], "highlight_id": {"$in": [h["highlight_id"] for h in items]}},
        {"highlight_id": 1, "stamp": 1}).to_list(20)}
    out = []
    for h in items:
        h = _public_highlight(h)
        h.pop("squad_viewer_ids", None)
        h["my_stamp"] = mine.get(h["highlight_id"])
        out.append(h)
    return out


class NotificationPrefs(BaseModel):
    teasers: Optional[bool] = None
    weekly_reminder: Optional[bool] = None
    tz_offset_minutes: Optional[int] = Field(None, ge=-840, le=840)


@api_router.get("/users/me/notification-prefs")
async def get_notification_prefs(user: dict = Depends(get_current_user)):
    return {"teasers": teasers_enabled(user), "weekly_reminder": weekly_reminder_prefs_on(user)}


@api_router.put("/users/me/notification-prefs")
async def set_notification_prefs(data: NotificationPrefs, user: dict = Depends(get_current_user)):
    updates: Dict[str, Any] = {}
    if data.teasers is not None:
        updates["notification_prefs.teasers"] = data.teasers
    if data.weekly_reminder is not None:
        updates["notification_prefs.weekly_reminder"] = data.weekly_reminder
    if data.tz_offset_minutes is not None:
        updates["tz_offset_minutes"] = data.tz_offset_minutes
    if updates:
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": updates})
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"notification_prefs": 1}) or {}
    return {"teasers": teasers_enabled(fresh), "weekly_reminder": weekly_reminder_prefs_on(fresh)}


# ============== INVESTMENT LOOPS ==============
# Small investments right after the reward that (1) load the next trigger and (2) store
# value the fighter would lose by leaving: a booked next round (data), squad callouts
# (reputation), and a curated Fight Film reel (content, followers).

QUIET_START_HOUR = 22
QUIET_END_HOUR = 5
BOOKING_MIN_LEAD = timedelta(minutes=15)
BOOKING_MAX_LEAD = timedelta(days=14)
LOCAL_SEND_HOUR_REMINDER = 17
LOCAL_SEND_HOUR_DIGEST = 12


def local_hour(at_utc: datetime, tz_offset_minutes: int) -> int:
    # JS getTimezoneOffset(): minutes to ADD to local time to get UTC (BST → -60).
    return (at_utc - timedelta(minutes=tz_offset_minutes)).hour


def in_quiet_hours(at_utc: datetime, tz_offset_minutes: int) -> bool:
    h = local_hour(at_utc, tz_offset_minutes)
    return h >= QUIET_START_HOUR or h < QUIET_END_HOUR


def _parse_utc(iso: str) -> datetime:
    dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


class BookingCreate(BaseModel):
    at: str
    tz_offset_minutes: int = Field(0, ge=-840, le=840)
    focus: Optional[str] = Field(None, max_length=40)


@api_router.post("/bookings")
async def book_next_round(data: BookingCreate, user: dict = Depends(get_current_user)):
    try:
        at = _parse_utc(data.at)
    except ValueError:
        raise HTTPException(400, "Invalid time")
    now = datetime.now(timezone.utc)
    if not (now + BOOKING_MIN_LEAD <= at <= now + BOOKING_MAX_LEAD):
        raise HTTPException(400, "Pick a time between 15 minutes and 2 weeks from now")
    if in_quiet_hours(at, data.tz_offset_minutes):
        raise HTTPException(400, "Pick a time between 5am and 10pm")
    focus = data.focus if data.focus in DIMENSIONS else None
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"personal_bests": 1}) or {}
    focus_pb = (fresh.get("personal_bests") or {}).get(_pb_key(focus)) if focus else None
    await db.bookings.update_many({"user_id": user["user_id"], "status": "pending"},
                                  {"$set": {"status": "replaced"}})
    doc = {
        "booking_id": f"book_{uuid.uuid4().hex[:12]}",
        "user_id": user["user_id"],
        "at": at.isoformat(),
        "focus": focus,
        "focus_pb": focus_pb,
        "status": "pending",
        "created_at": now.isoformat(),
    }
    await db.bookings.insert_one(doc)
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"tz_offset_minutes": data.tz_offset_minutes}})
    doc.pop("_id", None)
    return doc


@api_router.get("/bookings/next")
async def next_booking(user: dict = Depends(get_current_user)):
    return await db.bookings.find_one({"user_id": user["user_id"], "status": "pending"}, {"_id": 0})


@api_router.delete("/bookings/{booking_id}")
async def cancel_booking(booking_id: str, user: dict = Depends(get_current_user)):
    res = await db.bookings.update_one({"booking_id": booking_id, "user_id": user["user_id"], "status": "pending"},
                                       {"$set": {"status": "cancelled"}})
    if res.matched_count == 0:
        raise HTTPException(404, "Booking not found")
    return {"ok": True}


def booking_push(b: dict) -> tuple:
    if b.get("focus"):
        body = f"PB to beat: {b['focus_pb']:g}" if isinstance(b.get("focus_pb"), (int, float)) else "Set your first score"
        return (f"Your {b['focus'].lower()} round is booked", body,
                f"/train?focus={_url_parse.quote(b['focus'])}")
    return ("Your round is booked", "You said now — gloves on", "/train")


async def _send_due_bookings(now: datetime):
    due = await db.bookings.find({"status": "pending", "at": {"$lte": now.isoformat()}}, {"_id": 0}).to_list(500)
    for b in due:
        claimed = await db.bookings.update_one({"booking_id": b["booking_id"], "status": "pending"},
                                               {"$set": {"status": "sent", "sent_at": now.isoformat()}})
        if claimed.modified_count:
            title, body, url = booking_push(b)
            await _send_push(b["user_id"], title=title, body=body, url=url, tag=f"booking-{b['booking_id']}")


BOOKING_COUNTDOWN_MINUTES = 30
CALLOUT_COUNTDOWN_HOURS = 8


async def _start_booking_countdowns(now: datetime):
    soon = (now + timedelta(minutes=BOOKING_COUNTDOWN_MINUTES)).isoformat()
    due = await db.bookings.find({"status": "pending", "la_started": {"$ne": True},
                                  "at": {"$gt": now.isoformat(), "$lte": soon}}, {"_id": 0}).to_list(500)
    for b in due:
        claimed = await db.bookings.update_one({"booking_id": b["booking_id"], "la_started": {"$ne": True}},
                                               {"$set": {"la_started": True}})
        if not claimed.modified_count:
            continue
        _, detail, _ = booking_push(b)
        headline = f"{b['focus']} round" if b.get("focus") else "Your round"
        await _send_live_activity(b["user_id"], live_activity_payload(
            "booking", headline, detail, _parse_utc(b["at"]),
            title=f"{headline} in {BOOKING_COUNTDOWN_MINUTES} min", body=detail, now=now))


async def _start_callout_countdowns(now: datetime):
    """The last hours of a callout, ticking on the Lock Screen of everyone who accepted it."""
    soon = (now + timedelta(hours=CALLOUT_COUNTDOWN_HOURS)).isoformat()
    due = await db.callouts.find({"status": "open", "la_started": {"$ne": True},
                                  "expires_at": {"$gt": now.isoformat(), "$lte": soon}}, {"_id": 0}).to_list(500)
    for c in due:
        claimed = await db.callouts.update_one({"callout_id": c["callout_id"], "la_started": {"$ne": True}},
                                               {"$set": {"la_started": True}})
        if not claimed.modified_count:
            continue
        ends = _parse_utc(c["expires_at"])
        users = await db.users.find({"user_id": {"$in": c.get("accepted_ids") or []}},
                                    {"user_id": 1, "tz_offset_minutes": 1}).to_list(50)
        for u in users:
            if in_quiet_hours(now, u.get("tz_offset_minutes") or 0):
                continue
            headline = f"Beat {c['challenger_name']}'s {c['dimension']} {c['score']:g}"
            await _send_live_activity(u["user_id"], live_activity_payload(
                "callout", headline, "Callout closes when the clock hits zero", ends,
                title="Final hours on your callout", body=headline, now=now))


async def _complete_bookings_for(user_id: str):
    # Training within 6h of (or before) the booked time counts as keeping the booking —
    # no reminder for a round they already did.
    horizon = (datetime.now(timezone.utc) + timedelta(hours=6)).isoformat()
    await db.bookings.update_many({"user_id": user_id, "status": {"$in": ["pending", "sent"]}, "at": {"$lte": horizon}},
                                  {"$set": {"status": "kept"}})


# ── Weekly reminder (the Profile switch now actually does something) ─────────

def weekly_reminder_prefs_on(u: dict) -> bool:
    return ((u or {}).get("notification_prefs") or {}).get("weekly_reminder", True)


def joined_before(u: dict, cutoff: datetime) -> bool:
    # Older user docs stored created_at as a datetime, newer ones as an ISO string.
    created = u.get("created_at")
    try:
        created = _parse_utc(created) if isinstance(created, str) else created
    except ValueError:
        return False
    if isinstance(created, datetime):
        created = created if created.tzinfo else created.replace(tzinfo=timezone.utc)
        return created < cutoff
    return False


def is_local_hour(now: datetime, u: dict, hour: int) -> bool:
    return local_hour(now, u.get("tz_offset_minutes") or 0) == hour


async def _send_weekly_reminders(now: datetime):
    week_ago = (now - timedelta(days=7)).isoformat()
    day_ago = (now - timedelta(days=1)).isoformat()
    candidates = await db.users.find({
        "notification_prefs.weekly_reminder": {"$ne": False},
        "$or": [{"last_weekly_reminder_at": {"$exists": False}}, {"last_weekly_reminder_at": {"$lt": week_ago}}],
    }, {"user_id": 1, "tz_offset_minutes": 1, "created_at": 1}).to_list(5000)
    season = current_season(now.date())
    for u in candidates:
        if not is_local_hour(now, u, LOCAL_SEND_HOUR_REMINDER) or not joined_before(u, now - timedelta(days=7)):
            continue
        uid = u["user_id"]
        if await db.bookings.find_one({"user_id": uid, "status": "pending"}):
            continue
        if await db.sessions.find_one({"user_id": uid, "created_at": {"$gte": day_ago}}):
            continue
        stats = await db.season_stats.find_one({"user_id": uid, "season_id": season["season_id"]}) or {}
        rank = season_rank(stats.get("points", 0))
        body = (f"{rank['next_at'] - stats.get('points', 0)} points to {rank['next_rank']} · season ends in {season['days_left']} days"
                if rank["next_rank"] else "Book this week's round and keep your streak alive")
        await _send_push(uid, title="Your weekly round", body=body, url="/train", tag="weekly-reminder")
        await db.users.update_one({"user_id": uid}, {"$set": {"last_weekly_reminder_at": now.isoformat()}})


# ── Squad callouts ───────────────────────────────────────────────────────────

CALLOUT_DAYS = 7
CALLOUTS_PER_DAY = 3


def callout_beaten_by(callout: dict, overall: Optional[float], dims: list) -> Optional[float]:
    if callout["dimension"] == "Overall":
        mine = overall
    else:
        mine = next((d["score"] for d in dims or [] if d.get("dimension_name") == callout["dimension"]), None)
    return mine if isinstance(mine, (int, float)) and mine > callout["score"] else None


class CalloutCreate(BaseModel):
    dimension: str = Field(..., max_length=40)


@api_router.post("/callouts")
async def create_callout(data: CalloutCreate, user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    if data.dimension != "Overall" and data.dimension not in DIMENSIONS:
        raise HTTPException(400, "Unknown skill")
    fresh = await db.users.find_one({"user_id": uid}, {"personal_bests": 1}) or {}
    pb = (fresh.get("personal_bests") or {}).get(_pb_key(data.dimension))
    if not isinstance(pb, (int, float)):
        raise HTTPException(400, "Set a personal best in that skill first")
    mates = await _squad_mate_ids(uid)
    if not mates:
        raise HTTPException(400, "Join or create a squad first")
    now = datetime.now(timezone.utc)
    if await db.callouts.find_one({"challenger_id": uid, "dimension": data.dimension, "status": "open",
                                   "expires_at": {"$gt": now.isoformat()}}):
        raise HTTPException(400, "You already have an open callout for that skill")
    if _rate_limited(f"callout:{uid}", CALLOUTS_PER_DAY, 86400):
        raise HTTPException(429, "That's enough callouts for today")
    name = user.get("display_name") or user.get("name") or "Your squad mate"
    doc = {
        "callout_id": f"call_{uuid.uuid4().hex[:12]}",
        "challenger_id": uid,
        "challenger_name": name,
        "target_ids": mates,
        "accepted_ids": [],
        "dimension": data.dimension,
        "score": pb,
        "status": "open",
        "created_at": now.isoformat(),
        "expires_at": (now + timedelta(days=CALLOUT_DAYS)).isoformat(),
    }
    await db.callouts.insert_one(doc)
    doc.pop("_id", None)
    prefs = {u["user_id"]: u for u in await db.users.find(
        {"user_id": {"$in": mates}}, {"user_id": 1, "notification_prefs": 1}).to_list(len(mates))}
    await asyncio.gather(*[
        _send_push(m, title=f"{name} called you out",
                   body=f"Beat their {data.dimension} {pb:g} within {CALLOUT_DAYS} days",
                   url="/callouts", tag=f"callout-{doc['callout_id']}")
        for m in mates if teasers_enabled(prefs.get(m))
    ], return_exceptions=True)
    return doc


@api_router.post("/callouts/{callout_id}/accept")
async def accept_callout(callout_id: str, user: dict = Depends(get_current_user)):
    c = await db.callouts.find_one({"callout_id": callout_id, "target_ids": user["user_id"]}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Callout not found")
    if c["status"] != "open":
        raise HTTPException(400, "This callout is already settled")
    res = await db.callouts.update_one({"callout_id": callout_id, "accepted_ids": {"$ne": user["user_id"]}},
                                       {"$addToSet": {"accepted_ids": user["user_id"]}})
    if res.modified_count:
        owner = await db.users.find_one({"user_id": c["challenger_id"]}, {"notification_prefs": 1})
        if teasers_enabled(owner):
            name = user.get("display_name") or user.get("name") or "Someone"
            _spawn(_send_push(c["challenger_id"], title=f"{name} accepted your callout",
                              body=f"They're coming for your {c['dimension']} {c['score']:g}",
                              url="/callouts", tag=f"callout-{callout_id}"))
    return {"ok": True}


@api_router.get("/callouts")
async def my_callouts(user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    since = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    proj = {"_id": 0}
    sent = await db.callouts.find({"challenger_id": uid, "created_at": {"$gte": since}}, proj).sort("created_at", -1).to_list(30)
    received = await db.callouts.find({"target_ids": uid, "created_at": {"$gte": since}}, proj).sort("created_at", -1).to_list(30)
    for c in sent + received:
        c["accepted"] = uid in c.get("accepted_ids", [])
        c["accepted_count"] = len(c.pop("accepted_ids", []))
        c["target_count"] = len(c.pop("target_ids", []))
    return {"sent": sent, "received": received}


async def _settle_callouts_for(user: dict, overall: Optional[float], dims: list) -> list:
    uid = user["user_id"]
    now = datetime.now(timezone.utc).isoformat()
    beaten = []
    for c in await db.callouts.find({"target_ids": uid, "status": "open", "expires_at": {"$gt": now}},
                                    {"_id": 0}).to_list(50):
        score = callout_beaten_by(c, overall, dims)
        if score is None:
            continue
        name = user.get("display_name") or user.get("name") or "Someone"
        won = await db.callouts.update_one({"callout_id": c["callout_id"], "status": "open"}, {"$set": {
            "status": "beaten", "beaten_by": uid, "beaten_by_name": name, "beaten_score": score, "resolved_at": now,
        }})
        if not won.modified_count:
            continue
        title = f"{c['dimension']} King"
        await db.users.update_one({"user_id": uid}, {"$inc": {"callouts_won": 1}, "$addToSet": {"titles": title}})
        await db.users.update_one({"user_id": c["challenger_id"]}, {"$pull": {"titles": title}})
        _spawn(_send_push(c["challenger_id"], title=f"{name} beat your callout",
                          body=f"{c['dimension']} {score:g} — your title's gone. Win it back",
                          url=f"/train?focus={_url_parse.quote(c['dimension']) if c['dimension'] != 'Overall' else ''}",
                          tag=f"callout-{c['callout_id']}"))
        beaten.append({"callout_id": c["callout_id"], "challenger_name": c["challenger_name"],
                       "dimension": c["dimension"], "score": c["score"], "your_score": score, "title": title})
    return beaten


async def _expire_callouts(now: datetime):
    expired = await db.callouts.find({"status": "open", "expires_at": {"$lte": now.isoformat()}}, {"_id": 0}).to_list(500)
    for c in expired:
        res = await db.callouts.update_one({"callout_id": c["callout_id"], "status": "open"},
                                           {"$set": {"status": "defended", "resolved_at": now.isoformat()}})
        if not res.modified_count:
            continue
        await db.users.update_one({"user_id": c["challenger_id"]},
                                  {"$inc": {"callouts_defended": 1}, "$addToSet": {"titles": f"{c['dimension']} King"}})
        await _send_push(c["challenger_id"], title="Callout defended",
                         body=f"Nobody touched your {c['dimension']} {c['score']:g}. Title: {c['dimension']} King",
                         url="/callouts", tag=f"callout-{c['callout_id']}")


# ── Fight Film ───────────────────────────────────────────────────────────────

FIGHT_FILM_MAX = 6


@api_router.post("/fight-film/{highlight_id}")
async def add_to_fight_film(highlight_id: str, user: dict = Depends(get_current_user)):
    hl = await _get_highlight_for(highlight_id, user, owner_only=True)
    if hl["streamer_id"] != user["user_id"]:
        raise HTTPException(403, "Only your own rounds go on your Fight Film")
    if hl.get("status") != "ready":
        raise HTTPException(400, "Highlight is still processing")
    res = await db.users.update_one(
        {"user_id": user["user_id"], "fight_film": {"$ne": highlight_id},
         f"fight_film.{FIGHT_FILM_MAX - 1}": {"$exists": False}},
        {"$push": {"fight_film": highlight_id}},
    )
    if res.matched_count == 0:
        fresh = await db.users.find_one({"user_id": user["user_id"]}, {"fight_film": 1}) or {}
        if highlight_id in (fresh.get("fight_film") or []):
            return {"on_fight_film": True}
        raise HTTPException(400, f"Your Fight Film is full ({FIGHT_FILM_MAX}) — remove one first")
    return {"on_fight_film": True}


@api_router.delete("/fight-film/{highlight_id}")
async def remove_from_fight_film(highlight_id: str, user: dict = Depends(get_current_user)):
    await db.users.update_one({"user_id": user["user_id"]}, {"$pull": {"fight_film": highlight_id}})
    return {"on_fight_film": False}


@api_router.get("/users/{user_id}/fight-film")
async def get_fight_film(user_id: str, current_user: dict = Depends(get_current_user)):
    if user_id != current_user["user_id"] and await _is_blocked(current_user["user_id"], user_id):
        raise HTTPException(403, "Profile is unavailable")
    await _require_profile_visible(user_id, current_user)
    owner = await db.users.find_one({"user_id": user_id}, {"fight_film": 1}) or {}
    ids = owner.get("fight_film") or []
    docs = {h["highlight_id"]: h for h in await db.highlights.find(
        {"highlight_id": {"$in": ids}, "status": "ready"}, {"_id": 0}).to_list(FIGHT_FILM_MAX)}
    reel = [_public_highlight(docs[i]) for i in ids if i in docs]
    out = {"reel": reel, "max": FIGHT_FILM_MAX}
    if user_id == current_user["user_id"]:
        week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).date().isoformat()
        out["views_7d"] = await db.film_views.count_documents({"owner_id": user_id, "date": {"$gte": week_ago}})
    return out


@api_router.post("/users/{user_id}/fight-film/view")
async def view_fight_film(user_id: str, current_user: dict = Depends(get_current_user)):
    if user_id == current_user["user_id"]:
        return {"ok": True}
    if await _is_blocked(current_user["user_id"], user_id):
        raise HTTPException(403, "Profile is unavailable")
    await _require_profile_visible(user_id, current_user)
    today = datetime.now(timezone.utc).date().isoformat()
    await db.film_views.update_one(
        {"owner_id": user_id, "viewer_id": current_user["user_id"], "date": today},
        {"$setOnInsert": {"created_at": datetime.now(timezone.utc).isoformat()}}, upsert=True,
    )
    return {"ok": True}


async def _maybe_suggest_film_swap(hl: dict):
    """A new training clip that out-scores the weakest round on the reel is a reason to
    come back and curate — a trigger loaded by the fighter's own improvement."""
    score = hl.get("round_score")
    if hl.get("source") != "training" or not isinstance(score, (int, float)):
        return
    owner = await db.users.find_one({"user_id": hl["streamer_id"]}, {"fight_film": 1}) or {}
    ids = owner.get("fight_film") or []
    if not ids:
        return
    reel_scores = [h.get("round_score") for h in await db.highlights.find(
        {"highlight_id": {"$in": ids}}, {"round_score": 1}).to_list(FIGHT_FILM_MAX)]
    reel_scores = [s for s in reel_scores if isinstance(s, (int, float))]
    if len(ids) >= FIGHT_FILM_MAX and reel_scores and score > min(reel_scores):
        await _send_push(hl["streamer_id"], title="This round beats your Fight Film",
                         body=f"AI score {score:.1f} — swap it onto your reel?",
                         url=f"/highlights?open={hl['highlight_id']}", tag=f"film-swap-{hl['highlight_id']}")


async def _send_film_digests(now: datetime):
    week_ago = now - timedelta(days=7)
    owners = await db.users.find({
        "fight_film.0": {"$exists": True},
        "notification_prefs.teasers": {"$ne": False},
        "$or": [{"last_film_digest_at": {"$exists": False}}, {"last_film_digest_at": {"$lt": week_ago.isoformat()}}],
    }, {"user_id": 1, "tz_offset_minutes": 1}).to_list(5000)
    for u in owners:
        if not is_local_hour(now, u, LOCAL_SEND_HOUR_DIGEST):
            continue
        uid = u["user_id"]
        views = await db.film_views.count_documents({"owner_id": uid, "date": {"$gte": week_ago.date().isoformat()}})
        follows = await db.follows.count_documents({"following_id": uid, "created_at": {"$gte": week_ago.isoformat()}})
        await db.users.update_one({"user_id": uid}, {"$set": {"last_film_digest_at": now.isoformat()}})
        if views + follows == 0:
            continue
        parts = []
        if views:
            parts.append(f"{views} {'view' if views == 1 else 'views'}")
        if follows:
            parts.append(f"{follows} new {'follower' if follows == 1 else 'followers'}")
        await _send_push(uid, title="Your Fight Film this week", body=" and ".join(parts),
                         url=f"/profile/{uid}", tag="film-digest")


# ── Habit measurement (admin) ────────────────────────────────────────────────

HABIT_ZONE = (2, 4)


def summarise_habit_week(sessions: list) -> dict:
    per_user: Dict[str, int] = {}
    by_trigger: Dict[str, int] = {}
    for s in sessions:
        per_user[s["user_id"]] = per_user.get(s["user_id"], 0) + 1
        t = s.get("trigger") or "untagged"
        by_trigger[t] = by_trigger.get(t, 0) + 1
    tagged = sum(v for k, v in by_trigger.items() if k != "untagged")
    counts = sorted(per_user.values())
    lo, hi = HABIT_ZONE
    return {
        "sessions": len(sessions),
        "active_users": len(per_user),
        "by_trigger": dict(sorted(by_trigger.items(), key=lambda kv: -kv[1])),
        "pct_direct": round(100 * by_trigger.get("direct", 0) / tagged) if tagged else None,
        "median_sessions_per_user": counts[len(counts) // 2] if counts else 0,
        "users_in_habit_zone": sum(1 for c in counts if lo <= c <= hi),
        "users_over_zone": sum(1 for c in counts if c > hi),
        "pct_recorded": round(100 * sum(1 for s in sessions if s.get("record_video")) / len(sessions)) if sessions else None,
        "pct_live_coach": round(100 * sum(1 for s in sessions if s.get("live_stats")) / len(sessions)) if sessions else None,
    }


# Lets the owner read habit metrics from a script or Claude Code without a browser
# session. Only this read-only endpoint accepts it; unset (or short) disables it.
METRICS_API_TOKEN = os.environ.get("METRICS_API_TOKEN", "")


def metrics_token_ok(provided: Optional[str]) -> bool:
    import hmac as _hmac
    return len(METRICS_API_TOKEN) >= 32 and bool(provided) and _hmac.compare_digest(provided, METRICS_API_TOKEN)


@api_router.get("/admin/habit-metrics")
async def habit_metrics(request: Request, weeks: int = Query(8, ge=1, le=26)):
    if not metrics_token_ok(request.headers.get("X-Metrics-Token")):
        user = await get_current_user(request)
        if not await is_admin(user):
            raise HTTPException(403, "Admin only")
    today = datetime.now(timezone.utc).date()
    week_start = today - timedelta(days=today.weekday())
    out = []
    for i in range(weeks - 1, -1, -1):
        start = week_start - timedelta(weeks=i)
        end = start + timedelta(days=7)
        sessions = await db.sessions.find(
            {"created_at": {"$gte": start.isoformat(), "$lt": end.isoformat()}},
            {"user_id": 1, "trigger": 1, "record_video": 1, "live_stats.punches": 1},
        ).to_list(100000)
        bookings = await db.bookings.find(
            {"at": {"$gte": start.isoformat(), "$lt": end.isoformat()}}, {"status": 1},
        ).to_list(100000)
        b = {k: sum(1 for x in bookings if x.get("status") == k) for k in ("kept", "sent", "cancelled")}
        due = b["kept"] + b["sent"]
        out.append({
            "week_of": start.isoformat(),
            **summarise_habit_week(sessions),
            "bookings": {**b, "kept_rate": round(100 * b["kept"] / due) if due else None},
        })
    return {"weeks": out, "habit_zone": list(HABIT_ZONE), "attribution_minutes": TRIGGER_ATTRIBUTION_MINUTES}


async def _investment_loop():
    last_hourly = None
    while True:
        await asyncio.sleep(60)
        now = datetime.now(timezone.utc)
        try:
            await _send_due_bookings(now)
            await _expire_callouts(now)
            await _start_booking_countdowns(now)
            await _start_callout_countdowns(now)
            hour_key = now.strftime("%Y%m%d%H")
            if hour_key != last_hourly:
                last_hourly = hour_key
                await _send_weekly_reminders(now)
                await _send_film_digests(now)
        except Exception as exc:
            logger.warning(f"Investment loop error: {exc}")


# ============== FANTASY BOXING ==============
# Free-to-play fantasy on real fight cards. No entry fee, no prizes from players, nothing
# bought affects points (halal: no maysir; UK: not gambling). See fantasy_engine.py for
# the price formula, result mapping and scoring.
#
# Automatic:  cards (UK pro shows + world-title cards worldwide, next 14 days), fighter
#             records, prices, picks locking, results and scoring — from the Boxing Data API.
# By email:   sponsored leagues, promoter-featured cards and cosmetics are agreed with
#             FANTASY_ADMIN_EMAIL, then switched on with the admin endpoints below.
# Manual:     amateur cards (no licensed amateur data feed exists) — entered by an admin.
import fantasy_engine as fx

# Stripped: a key pasted into Railway with a trailing newline is an illegal header value.
BOXING_DATA_API_KEY = os.environ.get("BOXING_DATA_API_KEY", "").strip()
BOXING_DATA_HOST = os.environ.get("BOXING_DATA_HOST", "").strip() or "boxing-data-api.p.rapidapi.com"


def _redact(text) -> str:
    """Error text can echo request headers, so the key is masked before it's shown or logged."""
    text = str(text)
    raw = os.environ.get("BOXING_DATA_API_KEY", "")
    for secret in {BOXING_DATA_API_KEY, raw, raw.strip()}:
        if secret and len(secret) >= 8:
            text = text.replace(secret, "***").replace(repr(secret.encode())[2:-1], "***")
    return text
FANTASY_ADMIN_EMAIL = ADMIN_INBOX_EMAIL
FANTASY_LOOKAHEAD_DAYS = 14
# Low-cost defaults: the feed is used for world-title cards only, the schedule is checked
# once a day, records are kept a month, and results are only checked on fight night.
# UK small-hall cards come from promoters (partners form) and admins instead. Raise these
# on Railway when the budget allows (e.g. FANTASY_FEED_SCOPE=all, a bigger monthly limit).
FANTASY_FEED_SCOPE = os.environ.get("FANTASY_FEED_SCOPE", "world_title")  # world_title | all
BOXING_DATA_MONTHLY_LIMIT = int(os.environ.get("BOXING_DATA_MONTHLY_LIMIT", "100"))
FANTASY_IMPORT_HOURS = float(os.environ.get("FANTASY_IMPORT_HOURS", "24"))
FANTASY_RESULTS_MINUTES = float(os.environ.get("FANTASY_RESULTS_MINUTES", "90"))
FANTASY_FIGHTER_TTL_DAYS = int(os.environ.get("FANTASY_FIGHTER_TTL_DAYS", "30"))
FANTASY_FIGHT_NIGHT_HOURS = 12
FANTASY_SEASON_DAYS = 90
FANTASY_LEAGUE_MAX_MEMBERS = 50
FANTASY_LEAGUES_PER_OWNER = 5

# Bought outright (no random boxes), purely cosmetic — they never change points.
# Sold by email: the player asks, the admin sends a payment link, then grants it.
FANTASY_COSMETICS = {
    "gold_gloves":  {"name": "Gold Gloves",    "price_gbp": 1.99, "style": "gold",   "description": "Gold gloves next to your name on every leaderboard."},
    "title_belt":   {"name": "Title Belt",     "price_gbp": 2.99, "style": "belt",   "description": "A championship belt badge on your team."},
    "corner_red":   {"name": "Red Corner",     "price_gbp": 0.99, "style": "red",    "description": "Red-corner team colours."},
    "corner_blue":  {"name": "Blue Corner",    "price_gbp": 0.99, "style": "blue",   "description": "Blue-corner team colours."},
    "team_name":    {"name": "Custom Team Name", "price_gbp": 1.49, "style": "name", "description": "Give your team its own name on leaderboards."},
}


async def is_fantasy_admin(user: dict) -> bool:
    return await is_admin(user)


async def _email_fantasy_admin(subject: str, rows: dict, reply_to: Optional[str] = None):
    """Monetisation and data-review notices go to the admin inbox (hello@victoryai.co.uk)."""
    if not RESEND_API_KEY:
        logger.info(f"[fantasy] email skipped (no RESEND_API_KEY): {subject}")
        return
    body = "".join(f"<tr><td style='padding:4px 12px 4px 0;color:#888'>{html.escape(str(k))}</td>"
                   f"<td style='padding:4px 0'>{html.escape(str(v))}</td></tr>" for k, v in rows.items())
    payload = {"from": RESEND_FROM, "to": [FANTASY_ADMIN_EMAIL], "subject": f"[Victory Fantasy] {subject}",
               "html": f"<h3>{html.escape(subject)}</h3><table>{body}</table>"}
    if reply_to:
        payload["reply_to"] = reply_to
    try:
        async with httpx.AsyncClient(timeout=10) as http_client:
            await _breaker_post(RESEND_BREAKER, http_client, "https://api.resend.com/emails", json=payload,
                                   headers={"Authorization": f"Bearer {RESEND_API_KEY}"})
    except Exception as e:
        logger.warning(f"[fantasy] admin email failed: {e}")


# ── Boxing Data API client ──────────────────────────────────────────────────

class FeedBudgetSpent(Exception):
    pass


async def _bd_reserve_request():
    """Counts every call against the plan's monthly quota and stops at the limit, so a
    busy month can never run up an overage bill. Emails the admin at 80% and 100%."""
    month = datetime.now(timezone.utc).strftime("%Y-%m")
    doc = await db.counters.find_one_and_update(
        {"_id": f"boxing_data_{month}"}, {"$inc": {"n": 1}}, upsert=True, return_document=True)
    n = doc["n"]
    if n > BOXING_DATA_MONTHLY_LIMIT:
        raise FeedBudgetSpent(month)
    if n in (int(BOXING_DATA_MONTHLY_LIMIT * 0.8), BOXING_DATA_MONTHLY_LIMIT):
        await _email_fantasy_admin(f"Data feed: {n} of {BOXING_DATA_MONTHLY_LIMIT} requests used", {
            "Month": month, "What happens at the limit": "The feed pauses until next month. Pro cards stay playable; "
            "enter any missing results at /fantasy/admin.", "To raise it": "Set BOXING_DATA_MONTHLY_LIMIT on Railway "
            "(and upgrade the RapidAPI plan to match)."})


async def _bd_get(url_or_path: str, params: Optional[dict] = None) -> dict:
    await _bd_reserve_request()
    url = url_or_path if url_or_path.startswith("http") else f"https://{BOXING_DATA_HOST}{url_or_path}"
    async with httpx.AsyncClient(timeout=20) as http_client:
        r = await http_client.get(url, params=params, headers={
            "X-RapidAPI-Key": BOXING_DATA_API_KEY, "X-RapidAPI-Host": BOXING_DATA_HOST})
    r.raise_for_status()
    return r.json()


async def _bd_all(path: str, params: dict, max_pages: int = 20) -> list:
    out, page = [], await _bd_get(path, params)
    for _ in range(max_pages):
        out.extend(page.get("data") or [])
        nxt = (page.get("pagination") or {}).get("next_page")
        if not nxt:
            break
        # The feed's next_page URL uses its own host; keep our configured one.
        page = await _bd_get(re.sub(r"^https://[^/]+", f"https://{BOXING_DATA_HOST}", nxt))
    return out


async def _fighter_stats(fighter_id: str) -> dict:
    """A boxer's record, cached for a week (records change at most once per fight)."""
    cached = await db.fantasy_fighters.find_one({"fighter_id": fighter_id}, {"_id": 0})
    fresh_after = (datetime.now(timezone.utc) - timedelta(days=FANTASY_FIGHTER_TTL_DAYS)).isoformat()
    if cached and cached.get("fetched_at", "") > fresh_after:
        return cached
    try:
        data = (await _bd_get(f"/v2/fighters/{fighter_id}")).get("data") or {}
    except Exception as e:
        logger.warning(f"[fantasy] fighter {fighter_id} fetch failed: {_redact(e)}")
        return cached or {"fighter_id": fighter_id, "stats": {}}
    doc = {"fighter_id": fighter_id, "name": data.get("name"), "nickname": data.get("nickname"),
           "nationality": data.get("nationality_code") or data.get("nationality"),
           "stats": data.get("stats") or {}, "fetched_at": datetime.now(timezone.utc).isoformat()}
    await db.fantasy_fighters.update_one({"fighter_id": fighter_id}, {"$set": doc}, upsert=True)
    return doc


def _record_str(stats: dict) -> str:
    return f"{stats.get('wins', 0)}-{stats.get('losses', 0)}-{stats.get('draws', 0)}"


async def _build_bout(fight: dict, order: int) -> dict:
    f1 = (fight.get("fighters") or {}).get("fighter_1") or {}
    f2 = (fight.get("fighters") or {}).get("fighter_2") or {}
    s1, s2 = await _fighter_stats(f1.get("fighter_id")), await _fighter_stats(f2.get("fighter_id"))
    p1, p2 = fx.bout_prices(s1.get("stats"), s2.get("stats"))
    person = lambda f, s, price: {
        "fighter_id": f.get("fighter_id"), "name": f.get("full_name") or f.get("name") or s.get("name") or "TBC",
        "nickname": s.get("nickname"), "record": _record_str(s.get("stats") or {}),
        "ko_wins": (s.get("stats") or {}).get("ko_wins", 0), "nationality": s.get("nationality"), "salary": price,
    }
    return {
        "bout_id": fight.get("id"), "provider_fight_id": fight.get("id"), "order": order,
        "division": (fight.get("division") or {}).get("name") or "", "scheduled_rounds": fight.get("scheduled_rounds") or 0,
        "titles": [t.get("name") for t in fight.get("titles") or []],
        "status": fx.map_status(fight), "result": None,
        "fighters": [person(f1, s1, p1), person(f2, s2, p2)],
    }


async def sync_fantasy_cards(force_event_ids: Optional[set] = None) -> dict:
    """Imports qualifying cards from the schedule. Prices are recalculated until the card
    starts, then frozen; promoter-featured cards are kept even outside the UK."""
    if not BOXING_DATA_API_KEY:
        return {"skipped": "BOXING_DATA_API_KEY not set"}
    try:
        fights = await _bd_all("/v2/fights/schedule", {"days": FANTASY_LOOKAHEAD_DAYS, "page_size": 25, "date_sort": "ASC"})
    except httpx.HTTPStatusError as e:
        if _feed_error_code(e.response) in PLAN_REFUSALS:
            await _pause_feed(_feed_error_text(e.response))
            return {"paused": "Your RapidAPI plan doesn't include upcoming fights, so the daily import is paused "
                              "until next month. Promoter, amateur and admin cards still work."}
        raise
    by_event: Dict[str, list] = {}
    events: Dict[str, dict] = {}
    for f in fights:
        ev = f.get("event") or {}
        if ev.get("id"):
            by_event.setdefault(ev["id"], []).append(f)
            events[ev["id"]] = ev
    featured = {c["provider_event_id"] for c in await db.fantasy_cards.find(
        {"featured": True, "provider_event_id": {"$ne": None}}, {"provider_event_id": 1}).to_list(500)}
    force_event_ids = (force_event_ids or set()) | featured
    imported = 0
    for event_id, ev_fights in by_event.items():
        ev = events[event_id]
        reason = fx.card_qualifies(ev.get("location") or ev_fights[0].get("location"), ev_fights)
        if reason == "uk" and FANTASY_FEED_SCOPE != "all" and not any(fx.is_world_title(f.get("titles")) for f in ev_fights):
            reason = None  # low-cost mode: UK shows come from promoters, not the feed
        elif reason == "uk" and any(fx.is_world_title(f.get("titles")) for f in ev_fights) and FANTASY_FEED_SCOPE != "all":
            reason = "world_title"
        if not reason and event_id not in force_event_ids:
            continue
        card_id = f"fc_{event_id}"
        existing = await db.fantasy_cards.find_one({"card_id": card_id}, {"_id": 0, "status": 1})
        if existing and existing.get("status") != "upcoming":
            continue  # prices and line-up are frozen once the card starts
        bouts = [await _build_bout(f, i + 1) for i, f in enumerate(ev_fights)]
        await db.fantasy_cards.update_one({"card_id": card_id}, {"$set": {
            "card_id": card_id, "source": "boxing_data", "provider_event_id": event_id, "reason": reason or "promoter",
            "title": ev.get("title") or ev_fights[0].get("title"), "date": ev.get("date"),
            "location": ev.get("location"), "venue": ev.get("venue") or ev_fights[0].get("venue"),
            "status": fx.card_status(bouts), "bouts": bouts, "updated_at": datetime.now(timezone.utc).isoformat(),
            **dict(zip(("stable_size", "salary_cap"), fx.team_rules(len(bouts)))),
        }, "$setOnInsert": {"featured": False, "sponsor": None, "created_at": datetime.now(timezone.utc).isoformat()}},
            upsert=True)
        imported += 1
    return {"events_seen": len(by_event), "cards_imported": imported}


async def sync_fantasy_results(card: dict) -> bool:
    """Pulls statuses and official results for one card. Returns True if anything changed."""
    fights = await _bd_all("/v2/fights", {"event_id": card["provider_event_id"], "page_size": 25})
    by_id = {f.get("id"): f for f in fights}
    changed = False
    for bout in card["bouts"]:
        f = by_id.get(bout.get("provider_fight_id"))
        if not f:
            continue
        status, result = fx.map_status(f), fx.map_result(f)
        if result and result.get("needs_review"):
            if not bout.get("review_sent"):
                bout["review_sent"] = True
                changed = True
                await _email_fantasy_admin("Result needs a check", {
                    "Card": card.get("title"), "Bout": " vs ".join(x["name"] for x in bout["fighters"]),
                    "Outcome from feed": result.get("raw_outcome"), "Card id": card["card_id"], "Bout id": bout["bout_id"],
                    "Fix": "POST /api/admin/fantasy/cards/{card_id}/bouts/{bout_id}/result"})
            status, result = "live", None
        if bout.get("manual_result"):
            continue  # an admin's correction always wins over the feed
        if status == "upcoming" and bout.get("status") != "upcoming":
            status = bout["status"]  # picks locked on the clock stay locked
        if status != bout.get("status") or result != bout.get("result"):
            bout["status"], bout["result"] = status, result
            changed = True
    if changed:
        before = card.get("status")
        card["status"] = fx.card_status(card["bouts"])
        await db.fantasy_cards.update_one({"card_id": card["card_id"]}, {"$set": {
            "bouts": card["bouts"], "status": card["status"], "updated_at": datetime.now(timezone.utc).isoformat()}})
        if before != "complete" and card["status"] == "complete":
            await _notify_fantasy_card_done(card)
    return changed


async def _notify_fantasy_card_done(card: dict):
    entries = await db.fantasy_entries.find({"card_id": card["card_id"]}, {"_id": 0}).to_list(10000)
    for e in entries:
        pts = fx.stable_score(e["picks"], card)
        await _send_push(e["user_id"], title=f"Your team scored {pts} points",
                         body=f"{card.get('title')} is over — see who won your friends league.",
                         url="/fantasy", tag=f"fantasy-{card['card_id']}")


def _card_start(card: dict) -> datetime:
    raw = card.get("date") or ""
    try:
        start = datetime.fromisoformat(raw) if "T" in raw else datetime.fromisoformat(f"{raw[:10]}T17:00:00")
    except ValueError:
        return datetime.max.replace(tzinfo=timezone.utc)
    return start if start.tzinfo else start.replace(tzinfo=timezone.utc)


async def lock_started_cards(now: Optional[datetime] = None) -> int:
    """Locks picks when a card's start time passes, with no feed call needed."""
    now, locked = now or datetime.now(timezone.utc), 0
    for card in await db.fantasy_cards.find({"source": "boxing_data", "status": "upcoming", "bouts.0": {"$exists": True}},
                                            {"_id": 0}).to_list(200):
        if _card_start(card) <= now:
            card["bouts"][0]["status"] = "live"
            await db.fantasy_cards.update_one({"card_id": card["card_id"]}, {"$set": {"bouts": card["bouts"], "status": "live"}})
            locked += 1
    return locked


def results_due(card: dict, now: datetime) -> bool:
    """Only on fight night (start → +12h), and once more the next morning for late results."""
    start = _card_start(card)
    last = card.get("results_checked_at")
    since_last = (now - datetime.fromisoformat(last)).total_seconds() / 60 if last else 1e9
    if start <= now <= start + timedelta(hours=FANTASY_FIGHT_NIGHT_HOURS):
        return since_last >= FANTASY_RESULTS_MINUTES
    morning_after = start + timedelta(hours=FANTASY_FIGHT_NIGHT_HOURS + 6)
    return now >= morning_after and (not last or datetime.fromisoformat(last) < morning_after) and now <= start + timedelta(days=3)


async def _fantasy_loop():
    last_import = 0.0
    while True:
        await asyncio.sleep(300)
        if not BOXING_DATA_API_KEY:
            continue
        try:
            await lock_started_cards()
            if time.time() - last_import > FANTASY_IMPORT_HOURS * 3600 and not await _feed_paused():
                last_import = time.time()
                logger.info(f"[fantasy] import: {await sync_fantasy_cards()}")
            now = datetime.now(timezone.utc)
            for card in await db.fantasy_cards.find({"source": "boxing_data", "status": {"$ne": "complete"},
                                                     "date": {"$gte": (now - timedelta(days=3)).isoformat()[:10]}}, {"_id": 0}).to_list(50):
                if results_due(card, now):
                    await db.fantasy_cards.update_one({"card_id": card["card_id"]}, {"$set": {"results_checked_at": now.isoformat()}})
                    await sync_fantasy_results(card)
        except FeedBudgetSpent as month:
            logger.warning(f"[fantasy] monthly feed budget spent for {month}; pausing until next month")
        except Exception as exc:
            logger.warning(f"[fantasy] loop error: {_redact(exc)}")


# ── Player endpoints ────────────────────────────────────────────────────────

def _public_card(card: dict) -> dict:
    return {k: card.get(k) for k in ("card_id", "title", "date", "location", "venue", "status", "reason",
                                     "featured", "promoter", "sponsor", "bouts", "source", "stable_size", "salary_cap")}


async def _get_card(card_id: str, user: Optional[dict] = None) -> dict:
    card = await db.fantasy_cards.find_one({"card_id": card_id}, {"_id": 0})
    # Private cards (under-18 amateur fights) only exist for the boxer's gym and squad.
    if not card or (user and "private_to" in card and user["user_id"] not in card["private_to"] and not await is_fantasy_admin(user)):
        raise HTTPException(404, "Card not found")
    return card


@api_router.get("/fantasy/cards")
async def list_fantasy_cards(user: dict = Depends(get_current_user)):
    since = (datetime.now(timezone.utc) - timedelta(days=3)).isoformat()[:10]
    cards = await db.fantasy_cards.find({"date": {"$gte": since}, "hidden": {"$ne": True},
                                         "$or": [{"private_to": {"$exists": False}}, {"private_to": user["user_id"]}]},
                                        {"_id": 0, "bouts.fighters.ko_wins": 0}).to_list(200)
    order = {"live": 0, "upcoming": 1, "complete": 2}
    cards.sort(key=lambda c: (order.get(c.get("status"), 3), not c.get("featured"), c.get("date") or ""))
    mine = {e["card_id"] for e in await db.fantasy_entries.find({"user_id": user["user_id"]}, {"card_id": 1}).to_list(500)}
    return [{**{k: c.get(k) for k in ("card_id", "title", "date", "location", "status", "reason", "featured", "promoter", "sponsor", "stable_size")},
             "private": "private_to" in c,
             "bout_count": len(c.get("bouts") or []), "entered": c["card_id"] in mine} for c in cards]


@api_router.get("/fantasy/cards/{card_id}")
async def get_fantasy_card(card_id: str, user: dict = Depends(get_current_user)):
    card = await _get_card(card_id, user)
    entry = await db.fantasy_entries.find_one({"card_id": card_id, "user_id": user["user_id"]}, {"_id": 0})
    return {"card": _public_card(card), "me": {"user_id": user["user_id"], "picks": (entry or {}).get("picks", []),
                                                "saved": bool(entry)}}


class FantasyStable(BaseModel):
    picks: List[str] = Field(..., min_length=1, max_length=fx.STABLE_SIZE)


@api_router.put("/fantasy/cards/{card_id}/stable")
async def save_fantasy_stable(card_id: str, data: FantasyStable, user: dict = Depends(get_current_user)):
    if _rate_limited(f"fantasy_stable:{user['user_id']}", 20, 60):
        raise HTTPException(429, "Slow down a little")
    card = await _get_card(card_id, user)
    if card.get("status") != "upcoming":
        raise HTTPException(400, "The fights have started, so teams can't change now.")
    problem = fx.check_stable(data.picks, card)
    if problem:
        raise HTTPException(400, problem)
    now = datetime.now(timezone.utc).isoformat()
    await db.fantasy_entries.update_one({"card_id": card_id, "user_id": user["user_id"]}, {
        "$set": {"picks": data.picks, "saved_at": now}, "$setOnInsert": {"created_at": now}}, upsert=True)
    return {"ok": True, "picks": data.picks}


async def _league_member_ids(user: dict, league: str) -> List[str]:
    if league == "squad":
        return list({user["user_id"], *await _squad_mate_ids(user["user_id"])})
    lg = await db.fantasy_leagues.find_one({"league_id": league, "members": user["user_id"]}, {"members": 1})
    if not lg:
        raise HTTPException(404, "League not found")
    return lg["members"]


async def _people(user_ids: List[str]) -> Dict[str, dict]:
    users = await db.users.find({"user_id": {"$in": user_ids}},
                                {"_id": 0, "user_id": 1, "name": 1, "display_name": 1, "picture": 1,
                                 "fantasy_equipped": 1, "fantasy_team_name": 1}).to_list(len(user_ids) or 1)
    return {u["user_id"]: u for u in users}


def _person_row(u: dict, me_id: str) -> dict:
    eq = u.get("fantasy_equipped")
    return {"user_id": u["user_id"], "name": u.get("display_name") or u.get("name") or "Fighter",
            "picture": u.get("picture"), "isMe": u["user_id"] == me_id,
            "cosmetic": FANTASY_COSMETICS.get(eq, {}).get("style") if eq else None,
            "team_name": u.get("fantasy_team_name")}


@api_router.get("/fantasy/cards/{card_id}/leaderboard")
async def fantasy_leaderboard(card_id: str, league: str = Query("squad", max_length=40), user: dict = Depends(get_current_user)):
    card = await _get_card(card_id, user)
    ids = await _league_member_ids(user, league)
    entries = await db.fantasy_entries.find({"card_id": card_id, "user_id": {"$in": ids}}, {"_id": 0}).to_list(len(ids))
    people = await _people([e["user_id"] for e in entries])
    rows = [{**_person_row(people.get(e["user_id"], {"user_id": e["user_id"]}), user["user_id"]),
             "picks": e["picks"], "total": fx.stable_score(e["picks"], card)} for e in entries]
    return fx.rank_entries(rows)


# ── Pro perks: private leagues and season standings ──

class LeagueCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=40)


@api_router.post("/fantasy/leagues")
async def create_fantasy_league(data: LeagueCreate, user: dict = Depends(get_current_user)):
    if not await check_subscription(user):
        raise HTTPException(403, "Private leagues are a Pro perk")
    if await is_content_flagged(data.name):
        raise HTTPException(400, "Pick another league name")
    if await db.fantasy_leagues.count_documents({"owner_id": user["user_id"]}) >= FANTASY_LEAGUES_PER_OWNER:
        raise HTTPException(400, f"You can run up to {FANTASY_LEAGUES_PER_OWNER} leagues")
    league = {"league_id": f"fl_{uuid.uuid4().hex[:10]}", "name": data.name, "owner_id": user["user_id"],
              "code": uuid.uuid4().hex[:6].upper(), "members": [user["user_id"]],
              "created_at": datetime.now(timezone.utc).isoformat()}
    await db.fantasy_leagues.insert_one(league)
    league.pop("_id", None)
    return league


class LeagueJoin(BaseModel):
    code: str = Field(..., min_length=4, max_length=12)


@api_router.post("/fantasy/leagues/join")
async def join_fantasy_league(data: LeagueJoin, user: dict = Depends(get_current_user)):
    if _rate_limited(f"fantasy_join:{user['user_id']}", 10, 60):
        raise HTTPException(429, "Too many attempts — slow down")
    lg = await db.fantasy_leagues.find_one({"code": data.code.upper().strip()})
    if not lg:
        raise HTTPException(404, "No league with that code")
    if user["user_id"] not in lg["members"]:
        if len(lg["members"]) >= FANTASY_LEAGUE_MAX_MEMBERS:
            raise HTTPException(400, "That league is full")
        if await _is_blocked(user["user_id"], lg["owner_id"]):
            raise HTTPException(403, "Can't join this league")
        await db.fantasy_leagues.update_one({"league_id": lg["league_id"]}, {"$addToSet": {"members": user["user_id"]}})
    return {"league_id": lg["league_id"], "name": lg["name"]}


@api_router.get("/fantasy/leagues/mine")
async def my_fantasy_leagues(user: dict = Depends(get_current_user)):
    leagues = await db.fantasy_leagues.find({"members": user["user_id"]}, {"_id": 0}).to_list(50)
    return [{"league_id": l["league_id"], "name": l["name"], "member_count": len(l["members"]),
             "code": l["code"] if l["owner_id"] == user["user_id"] else None, "is_owner": l["owner_id"] == user["user_id"]}
            for l in leagues]


@api_router.get("/fantasy/season")
async def fantasy_season(league: str = Query("squad", max_length=40), user: dict = Depends(get_current_user)):
    if not await check_subscription(user):
        raise HTTPException(403, "Season standings are a Pro perk")
    ids = await _league_member_ids(user, league)
    since = (datetime.now(timezone.utc) - timedelta(days=FANTASY_SEASON_DAYS)).isoformat()[:10]
    cards = {c["card_id"]: c for c in await db.fantasy_cards.find(
        {"date": {"$gte": since}, "status": {"$ne": "upcoming"}}, {"_id": 0}).to_list(500)}
    totals: Dict[str, dict] = {}
    for e in await db.fantasy_entries.find({"user_id": {"$in": ids}, "card_id": {"$in": list(cards)}}, {"_id": 0}).to_list(20000):
        t = totals.setdefault(e["user_id"], {"total": 0, "cards": 0})
        t["total"] += fx.stable_score(e["picks"], cards[e["card_id"]])
        t["cards"] += 1
    people = await _people(list(totals))
    rows = [{**_person_row(people.get(uid, {"user_id": uid}), user["user_id"]), **t} for uid, t in totals.items()]
    return {"days": FANTASY_SEASON_DAYS, "standings": fx.rank_entries(rows)}


# ── Cosmetics (bought outright by email, never affect points) ──

@api_router.get("/fantasy/cosmetics")
async def fantasy_cosmetics(user: dict = Depends(get_current_user)):
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"fantasy_cosmetics": 1, "fantasy_equipped": 1}) or {}
    owned = set(fresh.get("fantasy_cosmetics") or [])
    return {"items": [{"id": k, **v, "owned": k in owned} for k, v in FANTASY_COSMETICS.items()],
            "equipped": fresh.get("fantasy_equipped"), "contact": FANTASY_ADMIN_EMAIL}


@api_router.post("/fantasy/cosmetics/{cosmetic_id}/request")
async def request_fantasy_cosmetic(cosmetic_id: str, user: dict = Depends(get_current_user)):
    item = FANTASY_COSMETICS.get(cosmetic_id)
    if not item:
        raise HTTPException(404, "Unknown item")
    if _rate_limited(f"fantasy_cosmetic_req:{user['user_id']}", 5, 3600):
        raise HTTPException(429, "You've already asked — we'll email you")
    await db.fantasy_enquiries.insert_one({"kind": "cosmetic", "cosmetic_id": cosmetic_id, "user_id": user["user_id"],
                                           "email": user.get("email"), "status": "new",
                                           "created_at": datetime.now(timezone.utc).isoformat()})
    await _email_fantasy_admin(f"Cosmetic request: {item['name']} (£{item['price_gbp']:.2f})", {
        "Player": user.get("display_name") or user.get("name"), "Email": user.get("email"),
        "Item": f"{item['name']} — £{item['price_gbp']:.2f}", "Next": "Email a payment link, then grant it with "
        "POST /api/admin/fantasy/cosmetics/grant"}, reply_to=user.get("email"))
    return {"ok": True, "message": f"We'll email {user.get('email') or 'you'} a payment link."}


class CosmeticCheckout(BaseModel):
    origin_url: str = ""


@api_router.post("/fantasy/cosmetics/{cosmetic_id}/checkout")
async def cosmetic_checkout(cosmetic_id: str, data: CosmeticCheckout, user: dict = Depends(get_current_user)):
    """Bought outright through Stripe; the webhook (or /confirm on return) switches it on.
    Under-18s get the same link to send to a parent, who pays."""
    import asyncio
    item = FANTASY_COSMETICS.get(cosmetic_id)
    if not item:
        raise HTTPException(404, "Unknown item")
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0}) or user
    if cosmetic_id in (fresh.get("fantasy_cosmetics") or []):
        raise HTTPException(400, "You already own this")
    if _rate_limited(f"cosmetic_checkout:{user['user_id']}", 10, 3600):
        raise HTTPException(429, "Slow down a little")
    host = _safe_checkout_origin(data.origin_url)
    minor = _is_minor(fresh)
    try:
        session = await asyncio.to_thread(
            stripe_lib.checkout.Session.create,
            mode="payment",
            payment_method_types=["card"],
            line_items=[{"price_data": {"currency": "gbp", "unit_amount": int(round(item["price_gbp"] * 100)),
                                        "product_data": {"name": f"Victory Fantasy — {item['name']}",
                                                         "description": item["description"] + " Looks only; never changes points."}},
                         "quantity": 1}],
            success_url=f"{host}/fantasy?cosmetic_paid={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{host}/fantasy",
            customer_email=None if minor else (fresh.get("email") or None),
            metadata={"purchase_type": "fantasy_cosmetic", "user_id": user["user_id"], "cosmetic_id": cosmetic_id},
        )
    except Exception as e:
        logger.error(f"Stripe cosmetic checkout error: {e}")
        raise HTTPException(500, "Could not start checkout — please try again")
    return {"checkout_url": session.url, "for_parent": minor, "item": item["name"], "price_gbp": item["price_gbp"]}


async def _grant_cosmetic(user_id: str, cosmetic_id: str) -> bool:
    if cosmetic_id not in FANTASY_COSMETICS:
        return False
    await db.users.update_one({"user_id": user_id}, {"$addToSet": {"fantasy_cosmetics": cosmetic_id}})
    return True


@api_router.get("/fantasy/cosmetics/confirm")
async def confirm_cosmetic(session_id: str = Query(..., max_length=200), user: dict = Depends(get_current_user)):
    """Switches the item on as soon as the buyer returns, in case the webhook is slower."""
    import asyncio
    try:
        session = await asyncio.to_thread(stripe_lib.checkout.Session.retrieve, session_id)
    except Exception:
        raise HTTPException(404, "Payment not found")
    meta = _sget(session, "metadata") or {}
    if meta.get("purchase_type") != "fantasy_cosmetic" or meta.get("user_id") != user["user_id"]:
        raise HTTPException(404, "Payment not found")
    if _sget(session, "payment_status") != "paid":
        return {"paid": False}
    await _grant_cosmetic(user["user_id"], meta.get("cosmetic_id"))
    return {"paid": True, "cosmetic_id": meta.get("cosmetic_id"), "name": FANTASY_COSMETICS[meta["cosmetic_id"]]["name"]}


class CosmeticEquip(BaseModel):
    team_name: Optional[str] = Field(None, max_length=24)


@api_router.post("/fantasy/cosmetics/{cosmetic_id}/equip")
async def equip_fantasy_cosmetic(cosmetic_id: str, data: CosmeticEquip, user: dict = Depends(get_current_user)):
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"fantasy_cosmetics": 1}) or {}
    if cosmetic_id not in (fresh.get("fantasy_cosmetics") or []):
        raise HTTPException(403, "You don't own that yet")
    updates = {"fantasy_equipped": cosmetic_id if cosmetic_id != "team_name" else None}
    if cosmetic_id == "team_name":
        name = (data.team_name or "").strip()
        if not name or await is_content_flagged(name):
            raise HTTPException(400, "Pick another team name")
        updates = {"fantasy_team_name": name}
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": updates})
    return {"ok": True}


# ── Sponsors and promoters (public enquiry form → admin inbox) ──

class ManualFighter(BaseModel):
    name: str = Field(..., max_length=80)
    nickname: Optional[str] = Field(None, max_length=40)
    wins: int = Field(0, ge=0, le=500)
    losses: int = Field(0, ge=0, le=500)
    draws: int = Field(0, ge=0, le=200)
    ko_wins: int = Field(0, ge=0, le=500)


class ManualBout(BaseModel):
    division: str = Field("", max_length=40)
    scheduled_rounds: int = Field(3, ge=1, le=12)
    fighters: List[ManualFighter] = Field(..., min_length=2, max_length=2)


class PromoterCardIn(BaseModel):
    date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    location: str = Field("", max_length=120)
    bouts: List[ManualBout] = Field(..., min_length=1, max_length=20)


class FantasyEnquiry(BaseModel):
    kind: Literal["sponsor", "promoter"]
    name: str = Field(..., min_length=2, max_length=80)
    company: str = Field(..., min_length=2, max_length=120)
    email: EmailStr
    message: str = Field("", max_length=1500)
    event_name: Optional[str] = Field(None, max_length=120)
    halal_confirmed: bool = False
    card: Optional[PromoterCardIn] = None  # promoters can send their whole card with records
    promoter_key: Optional[str] = Field(None, max_length=64)  # from a trusted promoter's private link
    website: Optional[str] = None  # honeypot: real people never fill this in


@api_router.post("/fantasy/enquiries")
async def fantasy_enquiry(data: FantasyEnquiry, request: Request):
    client_ip = request.client.host if request.client else "unknown"
    if _rate_limited(f"fantasy_enquiry:{client_ip}", 5, 3600):
        raise HTTPException(429, "Too many enquiries — email us instead")
    if data.website:
        return {"ok": True}
    if data.kind == "sponsor" and not data.halal_confirmed:
        raise HTTPException(400, "We can only accept sponsors outside gambling, alcohol and interest-based lending.")
    doc = {**data.model_dump(exclude={"website", "card", "promoter_key"}), "enquiry_id": f"fe_{uuid.uuid4().hex[:10]}",
           "status": "new", "created_at": datetime.now(timezone.utc).isoformat()}
    draft_id = None
    if data.kind == "promoter" and data.card:
        for text in [data.event_name or "", *(f.name for b in data.card.bouts for f in b.fighters)]:
            if text and await is_content_flagged(text):
                raise HTTPException(400, "Something on the card isn't allowed — check the names")
        # A draft: hidden until an admin publishes it, then the promoter enters results by link.
        draft_id = f"fp_{uuid.uuid4().hex[:10]}"
        trusted = await _trusted_promoter(data.promoter_key)
        bouts = _priced_bouts(draft_id, data.card.bouts)
        size, cap = fx.team_rules(len(bouts))
        await db.fantasy_cards.insert_one({
            "card_id": draft_id, "source": "promoter", "reason": "promoter", "title": data.event_name or f"{data.company} show",
            "date": data.card.date, "location": data.card.location, "venue": "", "promoter": data.company,
            "promoter_email": data.email, "results_token": secrets.token_urlsafe(24), "featured": True, "sponsor": None,
            "status": "upcoming", "bouts": bouts, "stable_size": size, "salary_cap": cap, "hidden": True,
            "pending_review": True, "created_at": doc["created_at"]})
        doc["card_id"] = draft_id
        if trusted:
            # Approved before: goes live straight away; the admin just gets an FYI.
            doc["status"] = "auto_published"
            await db.fantasy_enquiries.insert_one(doc)
            await _publish_promoter_card(draft_id, trusted["email"])
            await _email_fantasy_admin(f"Auto-published: {data.event_name or data.company}", {
                "Promoter": data.company, "Card": f"{len(data.card.bouts)} bouts on {data.card.date} ({draft_id})",
                "Why": "This promoter was approved before. Unpublish at /fantasy/admin if anything looks wrong."})
            return {"ok": True, "card_submitted": True, "published": True}
    await db.fantasy_enquiries.insert_one(doc)
    label = "Sponsored league enquiry" if data.kind == "sponsor" else "Promoter: feature our card"
    await _email_fantasy_admin(f"{label} — {data.company}", {
        "Name": data.name, "Company": data.company, "Email": data.email, "Event": data.event_name or "—",
        "Halal-sector confirmed": "yes" if data.halal_confirmed else "n/a", "Message": data.message or "—",
        **({"Card sent": f"{len(data.card.bouts)} bouts on {data.card.date} — check and publish at /fantasy/admin ({draft_id})"} if draft_id else {})},
        reply_to=data.email)
    return {"ok": True, "card_submitted": bool(draft_id)}


# ── Admin (signed in as ADMIN_EMAIL; notices go to ADMIN_INBOX_EMAIL) ──

async def require_fantasy_admin(user: dict = Depends(get_current_user)) -> dict:
    if not await is_fantasy_admin(user):
        raise HTTPException(403, "Admins only")
    return user


@api_router.get("/admin/fantasy/enquiries")
async def admin_fantasy_enquiries(user: dict = Depends(require_fantasy_admin)):
    return await db.fantasy_enquiries.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)


@api_router.post("/admin/fantasy/enquiries/{enquiry_id}/done")
async def admin_enquiry_done(enquiry_id: str, user: dict = Depends(require_fantasy_admin)):
    await db.fantasy_enquiries.update_one({"enquiry_id": enquiry_id}, {"$set": {"status": "done"}})
    return {"ok": True}


@api_router.get("/admin/fantasy/cards")
async def admin_fantasy_cards(user: dict = Depends(require_fantasy_admin)):
    return await db.fantasy_cards.find({}, {"_id": 0, "bouts": 0}).sort("date", -1).to_list(300)


class SponsorSet(BaseModel):
    name: Optional[str] = Field(None, max_length=80)
    url: Optional[str] = Field(None, max_length=300)
    logo_url: Optional[str] = Field(None, max_length=500)


@api_router.post("/admin/fantasy/cards/{card_id}/sponsor")
async def admin_set_sponsor(card_id: str, data: SponsorSet, user: dict = Depends(require_fantasy_admin)):
    await _get_card(card_id)
    sponsor = data.model_dump() if data.name else None
    if sponsor and sponsor.get("url") and not sponsor["url"].startswith("https://"):
        raise HTTPException(400, "Sponsor links must be https://")
    await db.fantasy_cards.update_one({"card_id": card_id}, {"$set": {"sponsor": sponsor}})
    return {"ok": True, "sponsor": sponsor}


class FeatureCard(BaseModel):
    card_id: Optional[str] = None
    provider_event_id: Optional[str] = None
    promoter: Optional[str] = Field(None, max_length=80)
    featured: bool = True


@api_router.post("/admin/fantasy/feature")
async def admin_feature_card(data: FeatureCard, user: dict = Depends(require_fantasy_admin)):
    """Promoter deals: feature an existing card, or import any event from the feed by id."""
    card_id = data.card_id or (f"fc_{data.provider_event_id}" if data.provider_event_id else None)
    if not card_id:
        raise HTTPException(400, "card_id or provider_event_id required")
    if data.provider_event_id and not await db.fantasy_cards.find_one({"card_id": card_id}):
        await db.fantasy_cards.insert_one({"card_id": card_id, "provider_event_id": data.provider_event_id, "source": "boxing_data",
                                           "status": "upcoming", "bouts": [], "featured": True, "promoter": data.promoter,
                                           "date": datetime.now(timezone.utc).isoformat()[:10], "hidden": True})
        await sync_fantasy_cards(force_event_ids={data.provider_event_id})
        await db.fantasy_cards.update_one({"card_id": card_id, "bouts.0": {"$exists": True}}, {"$unset": {"hidden": ""}})
    await db.fantasy_cards.update_one({"card_id": card_id}, {"$set": {"featured": data.featured, "promoter": data.promoter}})
    return {"ok": True, "card": await db.fantasy_cards.find_one({"card_id": card_id}, {"_id": 0, "bouts": 0})}


def _priced_bouts(card_id: str, bouts: list) -> list:
    out = []
    for i, b in enumerate(bouts):
        stats = [{"wins": f.wins, "losses": f.losses, "draws": f.draws, "total_bouts": f.wins + f.losses + f.draws,
                  "ko_wins": f.ko_wins} for f in b.fighters]
        prices = fx.bout_prices(*stats)
        out.append({"bout_id": f"{card_id}_b{i + 1}", "order": i + 1, "division": b.division,
                    "scheduled_rounds": b.scheduled_rounds, "status": "upcoming", "result": None, "titles": [],
                    "fighters": [{"fighter_id": f"{card_id}_b{i + 1}_{j}", "name": f.name, "nickname": f.nickname,
                                  "record": f"{f.wins}-{f.losses}-{f.draws}", "salary": prices[j]}
                                 for j, f in enumerate(b.fighters)]})
    return out


class ManualCard(BaseModel):
    title: str = Field(..., max_length=120)
    date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}")
    location: str = Field("", max_length=120)
    venue: str = Field("", max_length=120)
    amateur: bool = True
    promoter: Optional[str] = Field(None, max_length=80)
    bouts: List[ManualBout] = Field(..., min_length=2, max_length=20)


@api_router.post("/admin/fantasy/cards")
async def admin_create_card(data: ManualCard, user: dict = Depends(require_fantasy_admin)):
    """Amateur (or any off-feed) cards. Records come from the club/promoter sheet and are
    priced with the same formula as pro cards."""
    card_id = f"fm_{uuid.uuid4().hex[:10]}"
    bouts = _priced_bouts(card_id, data.bouts)
    card = {"stable_size": fx.team_rules(len(bouts))[0], "salary_cap": fx.team_rules(len(bouts))[1],"card_id": card_id, "source": "manual", "reason": "amateur" if data.amateur else "promoter",
            "title": data.title, "date": data.date, "location": data.location, "venue": data.venue,
            "promoter": data.promoter, "featured": bool(data.promoter), "sponsor": None, "status": "upcoming",
            "bouts": bouts, "created_at": datetime.now(timezone.utc).isoformat()}
    await db.fantasy_cards.insert_one(card)
    card.pop("_id", None)
    return card


class ManualResult(BaseModel):
    winner_index: Optional[int] = Field(None, ge=0, le=1)
    method: Literal["KO", "TKO", "DQ", "UD", "SD", "MD", "TD", "NC", "D"]
    round: int = Field(..., ge=1, le=12)
    clean_sweep: bool = False


@api_router.post("/admin/fantasy/cards/{card_id}/bouts/{bout_id}/result")
async def admin_set_result(card_id: str, bout_id: str, data: ManualResult, user: dict = Depends(require_fantasy_admin)):
    return await _apply_manual_result(await _get_card(card_id), bout_id, data)


async def _apply_manual_result(card: dict, bout_id: str, data: "ManualResult") -> dict:
    card_id = card["card_id"]
    bout = next((b for b in card["bouts"] if b["bout_id"] == bout_id), None)
    if not bout:
        raise HTTPException(404, "Bout not found")
    no_winner = data.method in fx.NO_DECISION
    if no_winner != (data.winner_index is None):
        raise HTTPException(400, "Draws and no contests have no winner; every other result needs one")
    if data.round > bout["scheduled_rounds"]:
        raise HTTPException(400, f"This bout is {bout['scheduled_rounds']} rounds")
    bout["result"] = {"winner_id": None if no_winner else bout["fighters"][data.winner_index]["fighter_id"],
                      "method": data.method, "round": data.round, "clean_sweep": data.clean_sweep and not no_winner}
    bout["status"], bout["manual_result"] = "complete", True
    before, card["status"] = card["status"], fx.card_status(card["bouts"])
    await db.fantasy_cards.update_one({"card_id": card_id}, {"$set": {"bouts": card["bouts"], "status": card["status"]}})
    if before != "complete" and card["status"] == "complete":
        await _notify_fantasy_card_done(card)
    return {"ok": True, "card_status": card["status"]}


@api_router.post("/admin/fantasy/cards/{card_id}/start")
async def admin_start_card(card_id: str, user: dict = Depends(require_fantasy_admin)):
    """Locks picks on a manual card when the first bell goes."""
    return await _start_card(await _get_card(card_id))


async def _start_card(card: dict) -> dict:
    card_id = card["card_id"]
    for b in card["bouts"]:
        if b["status"] == "upcoming":
            b["status"] = "live"
            break
    card["status"] = fx.card_status(card["bouts"])
    await db.fantasy_cards.update_one({"card_id": card_id}, {"$set": {"bouts": card["bouts"], "status": card["status"]}})
    return {"ok": True, "card_status": card["status"]}


FRONTEND_URL = os.environ.get("FRONTEND_URL", "https://victory-ai-alpha.vercel.app")


async def _trusted_promoter(key: Optional[str]) -> Optional[dict]:
    if not key:
        return None
    doc = await db.fantasy_promoters.find_one({"key": key, "trusted": True}, {"_id": 0})
    return doc if doc and secrets.compare_digest(doc["key"], key) else None


async def _send_email(to: str, subject: str, html_body: str, reply_to: Optional[str] = None):
    if not RESEND_API_KEY or not to:
        return
    payload = {"from": RESEND_FROM, "to": [to], "subject": subject, "html": html_body}
    if reply_to:
        payload["reply_to"] = reply_to
    try:
        async with httpx.AsyncClient(timeout=10) as http_client:
            await _breaker_post(RESEND_BREAKER, http_client, "https://api.resend.com/emails", json=payload, headers={"Authorization": f"Bearer {RESEND_API_KEY}"})
    except Exception as e:
        logger.warning(f"[fantasy] email to promoter failed: {e}")


async def _publish_promoter_card(card_id: str, promoter_email: Optional[str]) -> dict:
    """Publishes the card, trusts the promoter for next time, and emails them two private
    links: results for this show, and a submit link that publishes future cards directly."""
    card = await db.fantasy_cards.find_one({"card_id": card_id}, {"_id": 0})
    await db.fantasy_cards.update_one({"card_id": card_id}, {"$set": {"hidden": False, "pending_review": False}})
    results_link = f"{FRONTEND_URL}/fantasy/results/{card_id}?t={card.get('results_token', '')}"
    submit_link = None
    if promoter_email:
        email = promoter_email.strip().lower()
        prom = await db.fantasy_promoters.find_one({"email": email})
        if not prom:
            prom = {"email": email, "key": secrets.token_urlsafe(24), "trusted": True, "name": card.get("promoter"),
                    "created_at": datetime.now(timezone.utc).isoformat()}
            await db.fantasy_promoters.insert_one(dict(prom))
        submit_link = f"{FRONTEND_URL}/fantasy/partners?promoter={prom['key']}"
        await _send_email(promoter_email, f"{card['title']} is live on Victory Fantasy",
            f"<p>Your card is live in the Victory Fantasy fixture list.</p>"
            f"<p><b>Fight night:</b> tap <b>First bell</b> at <a href='{html.escape(results_link)}'>your results link</a> "
            f"and add each result as it happens.</p>"
            f"<p><b>Next show:</b> send it with <a href='{html.escape(submit_link)}'>your promoter link</a> and it goes live straight away.</p>"
            f"<p>Keep both links private.</p>", reply_to=FANTASY_ADMIN_EMAIL)
    return {"results_link": results_link, "submit_link": submit_link}


@api_router.post("/admin/fantasy/cards/{card_id}/publish")
async def admin_publish_card(card_id: str, user: dict = Depends(require_fantasy_admin)):
    """Publishes a promoter's submitted card and emails them their results link."""
    card = await _get_card(card_id)
    links = await _publish_promoter_card(card_id, card.get("promoter_email"))
    return {"ok": True, **links}


@api_router.post("/admin/fantasy/cards/{card_id}/unpublish")
async def admin_unpublish_card(card_id: str, user: dict = Depends(require_fantasy_admin)):
    await _get_card(card_id)
    await db.fantasy_cards.update_one({"card_id": card_id}, {"$set": {"hidden": True}})
    return {"ok": True}


async def _promoter_card(card_id: str, t: str, request: Request) -> dict:
    client_ip = request.client.host if request.client else "unknown"
    if _rate_limited(f"promoter_link:{client_ip}", 60, 3600):
        raise HTTPException(429, "Too many requests")
    card = await db.fantasy_cards.find_one({"card_id": card_id, "source": "promoter"}, {"_id": 0})
    if not card or not t or not secrets.compare_digest(card.get("results_token") or "", t):
        raise HTTPException(404, "Link not recognised")
    return card


@api_router.get("/fantasy/promoter/{card_id}")
async def promoter_card(card_id: str, request: Request, t: str = Query("", max_length=64)):
    card = await _promoter_card(card_id, t, request)
    return {k: card.get(k) for k in ("card_id", "title", "date", "status", "bouts", "hidden")}


@api_router.post("/fantasy/promoter/{card_id}/start")
async def promoter_start(card_id: str, request: Request, t: str = Query("", max_length=64)):
    return await _start_card(await _promoter_card(card_id, t, request))


@api_router.post("/fantasy/promoter/{card_id}/bouts/{bout_id}/result")
async def promoter_result(card_id: str, bout_id: str, data: ManualResult, request: Request, t: str = Query("", max_length=64)):
    card = await _promoter_card(card_id, t, request)
    if card.get("hidden"):
        raise HTTPException(400, "This card isn't published yet")
    return await _apply_manual_result(card, bout_id, data)


class CosmeticGrant(BaseModel):
    email: EmailStr
    cosmetic_id: str


@api_router.post("/admin/fantasy/cosmetics/grant")
async def admin_grant_cosmetic(data: CosmeticGrant, user: dict = Depends(require_fantasy_admin)):
    if data.cosmetic_id not in FANTASY_COSMETICS:
        raise HTTPException(404, "Unknown item")
    res = await db.users.update_one({"email": data.email}, {"$addToSet": {"fantasy_cosmetics": data.cosmetic_id}})
    if not res.matched_count:
        raise HTTPException(404, "No player with that email")
    await db.fantasy_enquiries.update_many({"kind": "cosmetic", "email": data.email, "cosmetic_id": data.cosmetic_id},
                                           {"$set": {"status": "granted"}})
    return {"ok": True}


@api_router.get("/admin/fantasy/feed-status")
async def admin_feed_status(user: dict = Depends(require_fantasy_admin)):
    month = datetime.now(timezone.utc).strftime("%Y-%m")
    used = (await db.counters.find_one({"_id": f"boxing_data_{month}"}) or {}).get("n", 0)
    paused = await _feed_paused()
    return {"key_set": bool(BOXING_DATA_API_KEY), "used": min(used, BOXING_DATA_MONTHLY_LIMIT),
            "limit": BOXING_DATA_MONTHLY_LIMIT, "paused": (paused or {}).get("reason"), "scope": FANTASY_FEED_SCOPE}


@api_router.post("/admin/fantasy/sync")
async def admin_fantasy_sync(user: dict = Depends(require_fantasy_admin)):
    if not BOXING_DATA_API_KEY:
        raise HTTPException(400, "Set BOXING_DATA_API_KEY on Railway first")
    try:
        return await sync_fantasy_cards()
    except FeedBudgetSpent:
        raise HTTPException(400, "This month's data-feed budget is used up (BOXING_DATA_MONTHLY_LIMIT)")
    except httpx.HTTPStatusError as e:
        raise HTTPException(502, f"The data feed refused the request ({e.response.status_code}): {_feed_error_text(e.response)}")
    except Exception as e:
        logger.warning(f"[fantasy] admin sync failed: {type(e).__name__}: {_redact(e)}")
        raise HTTPException(500, f"Sync failed: {type(e).__name__}: {_redact(e)[:200]}")


# The free plan answers schedule requests with DateOutOfRange: retrying daily would only
# burn the 100 free requests, so the first refusal pauses the import for the month.
PLAN_REFUSALS = {"DateOutOfRange"}


def _feed_error_code(response) -> str:
    try:
        return ((response.json() or {}).get("error") or {}).get("code") or ""
    except Exception:
        return ""


async def _pause_feed(reason: str):
    month = datetime.now(timezone.utc).strftime("%Y-%m")
    res = await db.counters.update_one({"_id": f"boxing_data_paused_{month}"},
                                       {"$setOnInsert": {"reason": reason, "at": datetime.now(timezone.utc).isoformat()}}, upsert=True)
    if res.upserted_id:
        await _email_fantasy_admin("Data feed paused for this month", {
            "Why": reason, "What still works": "Promoter-sent cards, amateur fights from /camp and cards added at /fantasy/admin.",
            "To resume": "Upgrade the RapidAPI plan, then tap sync on /fantasy/admin (the pause also lifts next month)."})


async def _feed_paused() -> Optional[dict]:
    month = datetime.now(timezone.utc).strftime("%Y-%m")
    return await db.counters.find_one({"_id": f"boxing_data_paused_{month}"}, {"_id": 0})


def _feed_error_text(response) -> str:
    """RapidAPI explains refusals in the body (e.g. "You are not subscribed to this API.")."""
    try:
        body = response.json()
        err = body.get("error")
        msg = body.get("message") or (err.get("message") if isinstance(err, dict) else err) or body
    except Exception:
        msg = response.text
    hints = {401: " Check the key is the X-RapidAPI-Key value.", 403: " Subscribe to a plan (Free is fine) on RapidAPI.",
             429: " Rate limit or monthly quota reached on RapidAPI."}
    return _redact(msg)[:200] + hints.get(response.status_code, "")



# ============== FIGHT CAMP + AMATEUR RECORD ==============
# Goal: the app becomes the amateur boxer's admin desk: record, next fight, camp, gym and the
#   people they train with. Their fights feed the fantasy game, so friends play along.
# Psychology: a coach-like buddy who asks at the right moments ("10 days out, how's camp?")
#   makes logging feel like being looked after, not paperwork. Each answer gets a reply
#   built from what they told it (visible progress), and the record grows with every result
#   (identity: "I'm a 6-2 boxer").
# Design: the boxer adds their next fight once. The buddy then sends check-ins on a camp
#   timetable, a fight-week checklist and a "how did it go?" prompt. The answer updates the
#   record and the fantasy card. Records are self-reported until their gym owner verifies
#   them, and the UI says which.
# Safety: under-18s (or unknown age) get private fantasy cards (gym + squad only), no venue
#   is ever shown, they're only findable as training partners by their own gym, and the
#   buddy never coaches weight cutting — it says to plan weight with a coach.
from zoneinfo import ZoneInfo

UK_TZ = ZoneInfo("Europe/London")
CAMP_CHECKPOINTS = [42, 28, 21, 14, 10, 7, 4, 2]
BUDDY_HOURS = range(8, 20)
OPEN_TO = {"sparring": "Sparring", "pads": "Pad work", "training_partner": "Training partner", "promotion": "Promoting together"}
MAX_UPCOMING_FIGHTS = 3


def _uk_today() -> date:
    return datetime.now(UK_TZ).date()


def _is_minor(user: dict) -> bool:
    try:
        return _age_years(date.fromisoformat((user.get("birth_date") or "")[:10])) < 18
    except ValueError:
        return True  # unknown age gets the under-18 defaults


def _record(user: dict) -> dict:
    return {k: int(user.get(f"amateur_{k}") or 0) for k in ("wins", "losses", "draws")}


def _record_status(user: dict) -> dict:
    rec, snap = _record(user), user.get("amateur_verified") or {}
    verified = bool(snap) and all(snap.get(k) == rec[k] for k in rec)
    return {**rec, "verified": verified, "verified_by": snap.get("gym_name") if verified else None,
            "last_verified": {k: snap.get(k) for k in rec} if snap and not verified else None}


def _partner_name(user: dict) -> str:
    return (user.get("training_partner") or {}).get("name") or "Your buddy"


async def _buddy_say(user: dict, text: str, fight_id: Optional[str] = None, action: str = "none",
                     push: bool = True, kind: str = "note") -> dict:
    msg = {"msg_id": f"bm_{uuid.uuid4().hex[:12]}", "user_id": user["user_id"], "fight_id": fight_id, "kind": kind,
           "text": text, "action": action, "done": action == "none", "created_at": datetime.now(timezone.utc).isoformat()}
    await db.buddy_messages.insert_one(dict(msg))
    if push:
        await _send_push(user["user_id"], title=_partner_name(user), body=text, url="/camp", tag=f"camp-{fight_id or 'note'}")
    return msg


def _days_to(fight: dict) -> int:
    return (date.fromisoformat(fight["date"]) - _uk_today()).days


def camp_prompt(fight: dict, days: int) -> tuple:
    """(text, action) for the camp timetable. Goals are cycled so each prompt asks about one."""
    goals = fight.get("camp_goals") or []
    goal = goals[len(fight.get("prompts_sent") or []) % len(goals)] if goals else None
    ask_goal = f" How's '{goal}' coming on?" if goal else ""
    if days > 14:
        return f"{days} days to your fight. How was training this week?{ask_goal}", "checkin"
    if days > 7:
        return f"{days} days out. How's sparring and your weight?{ask_goal}", "checkin"
    if days > 2:
        return f"Fight week's close — {days} days. How are you feeling?", "checkin"
    return ("Nearly there! Medical card, kit, gum shield, weigh-in time — all sorted? "
            "Rest up and tell your coach if anything's wrong.", "none")


def checkin_reply(fight: dict, checkin: dict, previous: Optional[dict], camp_rounds: int, minor: bool) -> str:
    """A reply built only from what the boxer told us — never invented praise."""
    days = _days_to(fight)
    parts = [f"Logged: {checkin['sessions']} session{'s' if checkin['sessions'] != 1 else ''}"
             + (f" and {checkin['sparring_rounds']} sparring rounds" if checkin.get("sparring_rounds") else "") + "."]
    if previous:
        if checkin["sessions"] > previous["sessions"]:
            parts.append(f"That's up from {previous['sessions']} last time.")
        elif checkin["sessions"] < previous["sessions"]:
            parts.append(f"Down from {previous['sessions']} last time — what got in the way?")
    if camp_rounds:
        parts.append(f"{camp_rounds} sparring rounds this camp.")
    target, weight = fight.get("target_weight_kg"), checkin.get("weight_kg")
    if target and weight:
        diff = round(weight - target, 1)
        if diff > 0:
            parts.append(f"You're {diff} kg above your fight weight with {max(days, 0)} days to go. "
                         + ("Tell your coach so they can plan it with you." if minor else
                            "Plan how you'll make it with your coach — never by drying out."))
        else:
            parts.append("You're on weight.")
    if (checkin.get("energy") or 3) <= 2:
        parts.append("Low energy is worth telling your coach about. Rest is training too.")
    if days > 0:
        parts.append(f"{days} days to go.")
    return " ".join(parts)


def result_reply(outcome: str, rec: dict) -> str:
    line = f"{rec['wins']}-{rec['losses']}-{rec['draws']}"
    return {
        "win": f"Win recorded! You're now {line}. Enjoy it — then tell me when the next one is.",
        "loss": f"Loss recorded. You're {line}. Every real record has these. Rest, review it with your coach, and tell me the next one when it's booked.",
        "draw": f"Draw recorded. You're {line}. Tell me when the next one is.",
        "nc": "No contest recorded — your record doesn't change. Tell me when the next one is.",
    }[outcome]


# ── Fantasy cards from amateur fights ──

def _week_key(d: str) -> str:
    y, w, _ = date.fromisoformat(d).isocalendar()
    return f"{y}w{w:02d}"


def _bout_status(fight: dict) -> str:
    if fight.get("result") or fight.get("fantasy_void"):
        return "complete"
    return "live" if _days_to(fight) <= 0 else "upcoming"


async def sync_amateur_card(group: str, week: str):
    """One fantasy card per gym (or boxer, if they have no gym) per week of fights."""
    card_id = f"fa_{group}_{week}"
    fights = await db.amateur_fights.find({"fantasy_group": group, "week": week, "fantasy_opt_in": True,
                                           "status": {"$ne": "cancelled"}}, {"_id": 0}).sort("date", 1).to_list(50)
    if not fights:
        await db.fantasy_cards.update_one({"card_id": card_id}, {"$set": {"hidden": True}})
        return None
    boxers = {u["user_id"]: u for u in await db.users.find({"user_id": {"$in": [f["user_id"] for f in fights]}}, {"_id": 0}).to_list(50)}
    bouts, audience, private = [], set(), False
    for i, f in enumerate(fights):
        u = boxers.get(f["user_id"]) or {"user_id": f["user_id"]}
        mine, theirs = _record(u), f.get("opponent_record") or {}
        stats = lambda r: {**r, "total_bouts": sum(r.get(k, 0) for k in ("wins", "losses", "draws")), "ko_wins": r.get("ko_wins", 0)}
        p_me, p_them = fx.bout_prices(stats(mine), stats(theirs))
        me_id, them_id = f"am_{f['fight_id']}", f"op_{f['fight_id']}"
        result = None
        if f.get("result"):
            r = f["result"]
            winner = me_id if r["outcome"] == "win" else them_id if r["outcome"] == "loss" else None
            method = {"draw": "D", "nc": "NC"}.get(r["outcome"], r.get("method") or "UD")
            result = {"winner_id": winner, "method": method, "round": r.get("round") or f["scheduled_rounds"], "clean_sweep": False}
        elif f.get("fantasy_void"):
            result = {"winner_id": None, "method": fx.VOID, "round": f["scheduled_rounds"], "clean_sweep": False}
        bouts.append({"bout_id": f["fight_id"], "order": i + 1, "division": f.get("weight_class") or "", "titles": [],
                      "scheduled_rounds": f["scheduled_rounds"], "status": _bout_status(f), "result": result,
                      "fighters": [{"fighter_id": me_id, "user_id": u["user_id"], "name": u.get("display_name") or u.get("name") or "Boxer",
                                    "record": "{wins}-{losses}-{draws}".format(**mine), "verified": _record_status(u)["verified"], "salary": p_me},
                                   {"fighter_id": them_id, "name": f["opponent_name"],
                                    "record": "{}-{}-{}".format(theirs.get("wins", 0), theirs.get("losses", 0), theirs.get("draws", 0)), "salary": p_them}]})
        audience |= {u["user_id"], *await _squad_mate_ids(u["user_id"])}
        if _is_minor(u) or not u.get("is_public", True):
            private = True
    gym = await db.gyms.find_one({"gym_id": group}, {"_id": 0, "name": 1, "members": 1, "city": 1}) if group.startswith("gym_") else None
    if gym:
        audience |= set(gym.get("members") or [])
    size, cap = fx.team_rules(len(bouts))
    title = f"{gym['name']} fight week" if gym else f"{bouts[0]['fighters'][0]['name']}'s fight"
    doc = {"card_id": card_id, "source": "amateur_self", "reason": "amateur", "title": title, "date": fights[0]["date"],
           "location": (gym or {}).get("city") or "", "venue": "", "status": fx.card_status(bouts), "bouts": bouts,
           "stable_size": size, "salary_cap": cap, "hidden": False, "updated_at": datetime.now(timezone.utc).isoformat()}
    update = {"$set": doc, "$setOnInsert": {"featured": False, "sponsor": None, "created_at": doc["updated_at"]}}
    if private:
        doc["private_to"] = sorted(audience)
    else:
        update["$unset"] = {"private_to": ""}
    existing = await db.fantasy_cards.find_one({"card_id": card_id}, {"status": 1})
    await db.fantasy_cards.update_one({"card_id": card_id}, update, upsert=True)
    if existing and existing.get("status") != "complete" and doc["status"] == "complete":
        await _notify_fantasy_card_done(doc)
    return card_id


# ── Endpoints ──

class OpponentRecord(BaseModel):
    wins: int = Field(0, ge=0, le=300)
    losses: int = Field(0, ge=0, le=300)
    draws: int = Field(0, ge=0, le=100)


class AmateurFightIn(BaseModel):
    date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    event_name: str = Field(..., min_length=2, max_length=100)
    city: str = Field("", max_length=60)
    opponent_name: str = Field(..., min_length=2, max_length=60)
    opponent_club: str = Field("", max_length=80)
    opponent_record: OpponentRecord = OpponentRecord()
    scheduled_rounds: int = Field(3, ge=1, le=12)
    weight_class: str = Field("", max_length=40)
    target_weight_kg: Optional[float] = Field(None, ge=20, le=200)
    camp_goals: List[str] = Field(default_factory=list, max_length=3)
    fantasy_opt_in: bool = True


async def _my_fight(user: dict, fight_id: str) -> dict:
    fight = await db.amateur_fights.find_one({"fight_id": fight_id, "user_id": user["user_id"]}, {"_id": 0})
    if not fight:
        raise HTTPException(404, "Fight not found")
    return fight


@api_router.get("/amateur/me")
async def amateur_me(user: dict = Depends(get_current_user)):
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "password": 0}) or user
    fights = await db.amateur_fights.find({"user_id": user["user_id"], "status": {"$ne": "cancelled"}}, {"_id": 0}).sort("date", -1).to_list(50)
    upcoming = sorted([f for f in fights if f["status"] == "upcoming"], key=lambda f: f["date"])
    nxt = upcoming[0] if upcoming else None
    checkins = await db.camp_checkins.find({"fight_id": nxt["fight_id"]}, {"_id": 0}).sort("created_at", -1).to_list(30) if nxt else []
    messages = await db.buddy_messages.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(30)
    gym = await db.gyms.find_one({"gym_id": fresh.get("gym_id")}, {"_id": 0, "gym_id": 1, "name": 1, "owner_id": 1}) if fresh.get("gym_id") else None
    if nxt:
        nxt["days_to_go"] = _days_to(nxt)
    return {"record": _record_status(fresh), "is_minor": _is_minor(fresh), "gym": gym,
            "is_gym_owner": bool(gym and gym["owner_id"] == user["user_id"]),
            "partner_name": _partner_name(fresh), "next_fight": nxt, "upcoming": upcoming,
            "history": [f for f in fights if f["status"] == "done"][:20], "checkins": checkins,
            "messages": messages, "open_to": fresh.get("open_to") or [], "open_to_options": OPEN_TO}


class RecordIn(BaseModel):
    wins: int = Field(..., ge=0, le=500)
    losses: int = Field(..., ge=0, le=500)
    draws: int = Field(0, ge=0, le=200)


@api_router.put("/amateur/record")
async def set_amateur_record(data: RecordIn, user: dict = Depends(get_current_user)):
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {
        "amateur_wins": data.wins, "amateur_losses": data.losses, "amateur_draws": data.draws}})
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return _record_status(fresh)


@api_router.post("/amateur/fights")
async def add_amateur_fight(data: AmateurFightIn, user: dict = Depends(get_current_user)):
    if _rate_limited(f"amateur_fight:{user['user_id']}", 10, 3600):
        raise HTTPException(429, "Slow down a little")
    try:
        days = (date.fromisoformat(data.date) - _uk_today()).days
    except ValueError:
        raise HTTPException(400, "That date doesn't exist")
    if not 0 <= days <= 365:
        raise HTTPException(400, "Pick a date from today to a year ahead")
    goals = [g.strip()[:60] for g in data.camp_goals if g.strip()]
    for text in [data.event_name, data.opponent_name, data.opponent_club, data.city, *goals]:
        if text and await is_content_flagged(text):
            raise HTTPException(400, "Something in there isn't allowed — try different words")
    if await db.amateur_fights.count_documents({"user_id": user["user_id"], "status": "upcoming"}) >= MAX_UPCOMING_FIGHTS:
        raise HTTPException(400, f"You can have up to {MAX_UPCOMING_FIGHTS} fights booked at once")
    group = user.get("gym_id") or f"u_{user['user_id']}"
    fight = {**data.model_dump(), "camp_goals": goals, "fight_id": f"af_{uuid.uuid4().hex[:10]}", "user_id": user["user_id"],
             "status": "upcoming", "result": None, "fantasy_group": group, "week": _week_key(data.date),
             # Checkpoints already passed don't fire late: a fight booked 5 days out starts at fight week.
             "prompts_sent": [c for c in CAMP_CHECKPOINTS if c > days], "result_prompts": 0,
             "created_at": datetime.now(timezone.utc).isoformat()}
    await db.amateur_fights.insert_one(dict(fight))
    if data.fantasy_opt_in:
        fight["card_id"] = await sync_amateur_card(group, fight["week"])
    await _buddy_say(user, f"Got it — {data.event_name}, {days} days from now, against {data.opponent_name}. "
                           "I'll check in on camp as it goes and ask how it went after.", fight["fight_id"], push=False, kind="booked")
    return fight


@api_router.post("/amateur/fights/{fight_id}/cancel")
async def cancel_amateur_fight(fight_id: str, user: dict = Depends(get_current_user)):
    fight = await _my_fight(user, fight_id)
    if fight["status"] != "upcoming":
        raise HTTPException(400, "Only upcoming fights can be cancelled")
    await db.amateur_fights.update_one({"fight_id": fight_id}, {"$set": {"status": "cancelled"}})
    await db.buddy_messages.update_many({"fight_id": fight_id}, {"$set": {"done": True}})
    if fight.get("fantasy_opt_in"):
        await sync_amateur_card(fight["fantasy_group"], fight["week"])
    return {"ok": True}


class CheckinIn(BaseModel):
    sessions: int = Field(..., ge=0, le=21)
    sparring_rounds: int = Field(0, ge=0, le=200)
    weight_kg: Optional[float] = Field(None, ge=20, le=200)
    energy: int = Field(3, ge=1, le=5)
    note: str = Field("", max_length=300)


@api_router.post("/amateur/fights/{fight_id}/checkin")
async def camp_checkin(fight_id: str, data: CheckinIn, user: dict = Depends(get_current_user)):
    if _rate_limited(f"camp_checkin:{user['user_id']}", 10, 3600):
        raise HTTPException(429, "Slow down a little")
    fight = await _my_fight(user, fight_id)
    if fight["status"] != "upcoming":
        raise HTTPException(400, "This fight's already done")
    if data.note and await is_content_flagged(data.note):
        raise HTTPException(400, "Try different words")
    previous = await db.camp_checkins.find_one({"fight_id": fight_id}, {"_id": 0}, sort=[("created_at", -1)])
    checkin = {**data.model_dump(), "fight_id": fight_id, "user_id": user["user_id"], "created_at": datetime.now(timezone.utc).isoformat()}
    await db.camp_checkins.insert_one(dict(checkin))
    rounds = sum(c.get("sparring_rounds", 0) for c in await db.camp_checkins.find({"fight_id": fight_id}, {"sparring_rounds": 1}).to_list(100))
    await db.buddy_messages.update_many({"fight_id": fight_id, "action": "checkin", "done": False}, {"$set": {"done": True}})
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0}) or user
    reply = await _buddy_say(fresh, checkin_reply(fight, checkin, previous, rounds, _is_minor(fresh)), fight_id, push=False, kind="reply")
    return {"checkin": checkin, "reply": reply}


class ResultIn(BaseModel):
    outcome: Literal["win", "loss", "draw", "nc"]
    method: Optional[Literal["KO", "TKO", "DQ", "UD", "SD", "MD"]] = None
    round: Optional[int] = Field(None, ge=1, le=12)


@api_router.post("/amateur/fights/{fight_id}/result")
async def report_amateur_result(fight_id: str, data: ResultIn, user: dict = Depends(get_current_user)):
    fight = await _my_fight(user, fight_id)
    if _days_to(fight) > 0:
        raise HTTPException(400, "You can add the result once fight day comes")
    if data.outcome in ("win", "loss") and not data.method:
        raise HTTPException(400, "How did it end? Pick the method")
    result = {"outcome": data.outcome, "method": data.method if data.outcome in ("win", "loss") else None,
              "round": data.round, "reported_at": datetime.now(timezone.utc).isoformat()}
    # Guarded on status so a double-tap can't count the same fight twice.
    res = await db.amateur_fights.update_one({"fight_id": fight_id, "status": "upcoming"}, {"$set": {"status": "done", "result": result}})
    if not res.modified_count:
        raise HTTPException(400, "This result is already in")
    field = {"win": "amateur_wins", "loss": "amateur_losses", "draw": "amateur_draws"}.get(data.outcome)
    if field:
        await db.users.update_one({"user_id": user["user_id"]}, {"$inc": {field: 1}})
    await db.buddy_messages.update_many({"fight_id": fight_id, "done": False}, {"$set": {"done": True}})
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0}) or user
    if fight.get("fantasy_opt_in"):
        await sync_amateur_card(fight["fantasy_group"], fight["week"])
    reply = await _buddy_say(fresh, result_reply(data.outcome, _record(fresh)), fight_id, push=False, kind="reply")
    return {"record": _record_status(fresh), "reply": reply}


class OpenToIn(BaseModel):
    open_to: List[Literal["sparring", "pads", "training_partner", "promotion"]] = Field(default_factory=list, max_length=4)


@api_router.put("/amateur/open-to")
async def set_open_to(data: OpenToIn, user: dict = Depends(get_current_user)):
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"open_to": sorted(set(data.open_to))}})
    return {"open_to": sorted(set(data.open_to))}


@api_router.get("/amateur/partners")
async def find_training_partners(open_to: str = Query("sparring", max_length=30), weight_class: str = Query("", max_length=50),
                                 user: dict = Depends(get_current_user)):
    """Boxers open to sparring, pads or promoting together. Under-18s only ever appear to
    members of their own gym."""
    if open_to not in OPEN_TO:
        raise HTTPException(400, "Unknown option")
    blocked = await _blocked_either_way(user["user_id"])
    query = {"open_to": open_to, "is_public": {"$ne": False}, "user_id": {"$nin": [user["user_id"], *blocked]}}
    if weight_class:
        query["weight_class"] = weight_class
    found = await db.users.find(query, {"_id": 0, "password": 0}).limit(100).to_list(100)
    out = []
    for u in found:
        if _is_minor(u) and not (u.get("gym_id") and u.get("gym_id") == user.get("gym_id")):
            continue
        out.append({**safe_user(u), "record": _record_status(u), "same_gym": bool(u.get("gym_id")) and u.get("gym_id") == user.get("gym_id"),
                    "open_to": u.get("open_to") or []})
    out.sort(key=lambda u: (not u["same_gym"], u.get("display_name") or ""))
    return out[:50]


@api_router.get("/amateur/messages")
async def buddy_messages(user: dict = Depends(get_current_user)):
    return await db.buddy_messages.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(30)


@api_router.post("/amateur/messages/{msg_id}/dismiss")
async def dismiss_buddy_message(msg_id: str, user: dict = Depends(get_current_user)):
    await db.buddy_messages.update_one({"msg_id": msg_id, "user_id": user["user_id"]}, {"$set": {"done": True}})
    return {"ok": True}


# ── Gym owners verify their boxers' records ──

async def _owned_gym(user: dict) -> dict:
    gym = await db.gyms.find_one({"owner_id": user["user_id"]}, {"_id": 0, "gym_id": 1, "name": 1, "members": 1})
    if not gym:
        raise HTTPException(403, "Only a gym owner can do this")
    return gym


@api_router.get("/amateur/verify-queue")
async def verify_queue(user: dict = Depends(get_current_user)):
    gym = await _owned_gym(user)
    members = await db.users.find({"user_id": {"$in": gym["members"]}}, {"_id": 0, "password": 0}).to_list(GYM_MAX_CAP)
    return [{"user_id": m["user_id"], "name": m.get("display_name") or m.get("name") or "Boxer", "record": _record_status(m)}
            for m in members if sum(_record(m).values()) and not _record_status(m)["verified"]]


@api_router.post("/amateur/verify/{member_id}")
async def verify_record(member_id: str, user: dict = Depends(get_current_user)):
    gym = await _owned_gym(user)
    if member_id not in gym["members"]:
        raise HTTPException(404, "They're not in your gym")
    member = await db.users.find_one({"user_id": member_id}, {"_id": 0})
    snap = {**_record(member), "gym_id": gym["gym_id"], "gym_name": gym["name"], "by": user["user_id"],
            "at": datetime.now(timezone.utc).isoformat()}
    await db.users.update_one({"user_id": member_id}, {"$set": {"amateur_verified": snap}})
    if member_id != user["user_id"]:
        await _buddy_say(member, f"{gym['name']} verified your record: {snap['wins']}-{snap['losses']}-{snap['draws']}.", kind="verified")
    return {"ok": True, "record": _record_status({**member, "amateur_verified": snap})}


# ── The buddy's timetable ──

async def run_buddy_timetable():
    """Camp check-ins, fight-week checklist and the "how did it go?" prompt. Daytime only."""
    sent = 0
    fights = await db.amateur_fights.find({"status": "upcoming"}, {"_id": 0}).to_list(5000)
    users = {u["user_id"]: u for u in await db.users.find({"user_id": {"$in": list({f["user_id"] for f in fights})}}, {"_id": 0}).to_list(5000)}
    for f in fights:
        u = users.get(f["user_id"])
        if not u:
            continue
        days = _days_to(f)
        if days > 0:
            due = [c for c in CAMP_CHECKPOINTS if c >= days and c not in (f.get("prompts_sent") or [])]
            if due:
                text, action = camp_prompt(f, days)
                await db.amateur_fights.update_one({"fight_id": f["fight_id"]}, {"$addToSet": {"prompts_sent": {"$each": due}}})
                await _buddy_say(u, text, f["fight_id"], action=action, kind="camp")
                sent += 1
        elif days == 0:
            if f.get("fantasy_opt_in"):
                await sync_amateur_card(f["fantasy_group"], f["week"])  # locks picks on fight day
        else:
            asked = f.get("result_prompts", 0)
            if (asked == 0) or (asked == 1 and days <= -3):
                text = ("How did it go? Tell me the result and I'll update your record." if asked == 0
                        else "Still need your result from " + f["event_name"] + " — it keeps your record and your friends' fantasy scores right.")
                await db.amateur_fights.update_one({"fight_id": f["fight_id"]}, {"$inc": {"result_prompts": 1}})
                await _buddy_say(u, text, f["fight_id"], action="result", kind="result")
                sent += 1
    return sent


async def _buddy_loop():
    while True:
        await asyncio.sleep(3600)
        if datetime.now(UK_TZ).hour not in BUDDY_HOURS:
            continue
        try:
            await run_buddy_timetable()
        except Exception as exc:
            logger.warning(f"[buddy] loop error: {exc}")




# ============== FANTASY OPS (runs itself) ==============
# Goal: the admin's whole routine is answering deal emails and approving a promoter's
#   first card; everything else here happens on its own.
# Design: the morning after a show, promoters with missing results get a reminder; three
#   days on (seven for amateur fights, which wait on the boxer) unreported bouts close as
#   "No result recorded" so cards finish and nobody is scored on a guess. Every Monday the
#   admin inbox gets one email listing anything that needs a person, or nothing at all.
RESULTS_REMIND_DAYS, RESULTS_CLOSE_DAYS, AMATEUR_CLOSE_DAYS = 1, 3, 7


async def _close_unreported(card: dict) -> int:
    closed = 0
    for b in card["bouts"]:
        if b.get("status") != "complete":
            b["status"], b["result"], b["manual_result"] = "complete", {
                "winner_id": None, "method": fx.VOID, "round": b.get("scheduled_rounds") or 1, "clean_sweep": False}, True
            closed += 1
    if closed:
        card["status"] = fx.card_status(card["bouts"])
        await db.fantasy_cards.update_one({"card_id": card["card_id"]}, {"$set": {"bouts": card["bouts"], "status": card["status"]}})
        await _notify_fantasy_card_done(card)
    return closed


async def run_fantasy_ops(today: Optional[date] = None) -> dict:
    today = today or _uk_today()
    out = {"reminded": 0, "closed_bouts": 0, "amateur_closed": 0}
    cards = await db.fantasy_cards.find({"source": {"$in": ["promoter", "manual"]}, "status": {"$ne": "complete"},
                                         "hidden": {"$ne": True}}, {"_id": 0}).to_list(500)
    for card in cards:
        try:
            age = (today - date.fromisoformat(card["date"][:10])).days
        except (KeyError, ValueError):
            continue
        if age >= RESULTS_CLOSE_DAYS:
            n = await _close_unreported(card)
            out["closed_bouts"] += n
            if n:
                await _email_fantasy_admin(f"Closed {n} unreported bout(s): {card['title']}", {
                    "Card": card["card_id"], "What happened": "No result arrived within 3 days, so these bouts score 0 for everyone.",
                    "To fix": "Enter the real result at /fantasy/admin; it replaces 'No result recorded'."})
        elif age >= RESULTS_REMIND_DAYS and not card.get("results_reminded") and card.get("promoter_email"):
            link = f"{FRONTEND_URL}/fantasy/results/{card['card_id']}?t={card.get('results_token', '')}"
            await _send_email(card["promoter_email"], f"Results needed: {card['title']}",
                f"<p>Players are waiting for the results from {html.escape(card['title'])}.</p>"
                f"<p>Add them at <a href='{html.escape(link)}'>your results link</a>. Bouts without a result after 3 days "
                f"close as 'No result recorded'.</p>", reply_to=FANTASY_ADMIN_EMAIL)
            await db.fantasy_cards.update_one({"card_id": card["card_id"]}, {"$set": {"results_reminded": True}})
            out["reminded"] += 1
    cutoff = (today - timedelta(days=AMATEUR_CLOSE_DAYS)).isoformat()
    for f in await db.amateur_fights.find({"status": "upcoming", "date": {"$lte": cutoff}, "fantasy_opt_in": True,
                                            "fantasy_void": {"$ne": True}}, {"_id": 0}).to_list(500):
        await db.amateur_fights.update_one({"fight_id": f["fight_id"]}, {"$set": {"fantasy_void": True}})
        await sync_amateur_card(f["fantasy_group"], f["week"])
        out["amateur_closed"] += 1
    return out


async def build_admin_digest() -> dict:
    """Everything that needs a person, in one list. Empty means no email."""
    rows = {}
    pending = await db.fantasy_cards.find({"pending_review": True, "source": "promoter"}, {"_id": 0, "title": 1, "promoter": 1}).to_list(50)
    if pending:
        rows["Promoter cards to approve"] = "; ".join(f"{c['title']} ({c.get('promoter') or '?'})" for c in pending)
    deals = await db.fantasy_enquiries.find({"status": "new", "kind": {"$in": ["sponsor", "promoter"]}}, {"_id": 0, "company": 1, "kind": 1}).to_list(50)
    if deals:
        rows["Deal enquiries to answer"] = "; ".join(f"{d['company']} ({d['kind']})" for d in deals)
    cutoff = (_uk_today() - timedelta(days=RESULTS_REMIND_DAYS)).isoformat()
    missing = await db.fantasy_cards.find({"source": {"$in": ["promoter", "manual"]}, "status": {"$ne": "complete"},
                                           "hidden": {"$ne": True}, "date": {"$lte": cutoff}}, {"_id": 0, "title": 1}).to_list(50)
    if missing:
        rows["Cards still missing results"] = "; ".join(c["title"] for c in missing)
    paused = await _feed_paused()
    if paused:
        rows["Data feed"] = "Paused this month (free plan). Promoter, amateur and admin cards still work."
    return rows


async def send_weekly_digest(now: Optional[datetime] = None) -> bool:
    now = now or datetime.now(UK_TZ)
    if now.weekday() != 0 or now.hour < 9:
        return False
    week = now.strftime("%G-W%V")
    claimed = await db.counters.update_one({"_id": f"admin_digest_{week}"}, {"$setOnInsert": {"at": now.isoformat()}}, upsert=True)
    if not claimed.upserted_id:
        return False  # already handled this week
    rows = await build_admin_digest()
    if not rows:
        return False
    await _email_fantasy_admin("Your weekly to-do", {**rows, "Open": f"{FRONTEND_URL}/fantasy/admin"})
    return True


async def _fantasy_ops_loop():
    while True:
        await asyncio.sleep(1800)
        if datetime.now(UK_TZ).hour not in BUDDY_HOURS:
            continue
        try:
            await run_fantasy_ops()
            await send_weekly_digest()
        except Exception as exc:
            logger.warning(f"[fantasy] ops error: {_redact(exc)}")


app.include_router(api_router)

async def _scheduled_stream_reminder_loop():
    """Every 5 minutes: push 30-min-ahead reminders for scheduled streams."""
    import asyncio as _aio
    while True:
        await _aio.sleep(300)
        try:
            now  = datetime.now(timezone.utc)
            w_lo = (now + timedelta(minutes=25)).isoformat()
            w_hi = (now + timedelta(minutes=35)).isoformat()
            streams = await db.scheduled_streams.find(
                {
                    "scheduled_at":  {"$gte": w_lo, "$lte": w_hi},
                    "reminder_sent": {"$ne": True},
                },
                {"_id": 0},
            ).to_list(50)

            for s in streams:
                uid   = s["user_id"]
                title = s.get("title", "Upcoming stream")

                # Notify the streamer themselves
                await _send_push(uid, "Your stream starts in 30 minutes!", f'"{title}" — get ready to go live.', "/go-live", tag=f"sched-self-{s['schedule_id']}")

                # Notify followers
                streamer = await db.users.find_one({"user_id": uid}, {"name": 1, "display_name": 1})
                sname = (streamer or {}).get("display_name") or (streamer or {}).get("name", "A streamer")
                followers = await db.follows.find({"following_id": uid}, {"follower_id": 1}).to_list(None)
                for f in followers:
                    await _send_push(
                        f["follower_id"],
                        title=f"{sname} goes live in 30 min",
                        body=title,
                        url="/live",
                        tag=f"sched-follow-{s['schedule_id']}",
                    )

                await db.scheduled_streams.update_one(
                    {"schedule_id": s["schedule_id"]},
                    {"$set": {"reminder_sent": True}},
                )
        except Exception as exc:
            logger.warning(f"Scheduled stream reminder loop error: {exc}")


# ============== RE-ENGAGEMENT (win-back + trial-ending) ==============
# Both branches below are deliberately targeted, not a scheduled blast to the whole user
# base: each query only matches users in a real, specific state (genuinely quiet 3+ days,
# or a real trial genuinely about to end), and each message is built from that same
# user's own real training data — never a generic "come back!" with nothing behind it.
# See victory_ai_ethical_engagement_design memory: engagement must be tied to real user
# data/actions, never fabricated.

WINBACK_INACTIVITY_DAYS = 3
WINBACK_RESEND_COOLDOWN_DAYS = 7  # don't re-nag someone who's been gone a month every loop
TRIAL_REMINDER_WINDOW_DAYS = 3

async def _build_winback_message(user: dict) -> tuple:
    partner_name = (user.get("training_partner") or {}).get("name", "your coach")
    sessions = await db.sessions.find({"user_id": user["user_id"]}, {"date": 1}).to_list(1000)
    if not sessions:
        return ("Ready for your first round?", f"{partner_name} is ready whenever you are.")
    _current_streak, longest_streak = _compute_streaks(sessions)
    if longest_streak >= 3:
        # current_streak is already 0 by definition (they've been gone 3+ days) — cite the
        # real longest streak they actually built, not a currently-active one that no
        # longer exists. Honest, not "your streak is still alive!" when it isn't.
        return (f"Your {longest_streak}-day streak is waiting", "Jump back in and start building the next one.")
    return (f"You've logged {len(sessions)} real training sessions", f"{partner_name} is ready for the next one.")

async def _reengagement_loop():
    """Every 6 hours: targeted win-back pushes for genuinely quiet users, and a one-shot
    reminder for accounts whose real trial is genuinely about to end. Never a periodic
    blast to everyone — every candidate is matched on real per-user state."""
    import asyncio as _aio
    while True:
        await _aio.sleep(6 * 3600)
        now = datetime.now(timezone.utc)
        try:
            inactive_cutoff = (now - timedelta(days=WINBACK_INACTIVITY_DAYS)).isoformat()
            resend_cutoff = (now - timedelta(days=WINBACK_RESEND_COOLDOWN_DAYS)).isoformat()
            candidates = await db.users.find({
                "last_active_at": {"$lt": inactive_cutoff},
                "$or": [
                    {"last_winback_push_at": {"$exists": False}},
                    {"last_winback_push_at": {"$lt": resend_cutoff}},
                ],
            }, {"_id": 0}).to_list(500)
            for u in candidates:
                title, body = await _build_winback_message(u)
                await _send_push(u["user_id"], title, body, url="/home", tag="winback")
                await db.users.update_one({"user_id": u["user_id"]}, {"$set": {"last_winback_push_at": now.isoformat()}})
        except Exception as exc:
            logger.warning(f"Win-back loop error: {exc}")

        try:
            trials = await db.subscriptions.find({
                "status": "trialing",
                "trial_reminder_sent": {"$ne": True},
            }, {"_id": 0}).to_list(500)
            for sub in trials:
                trial_end = sub.get("trial_end")
                if not trial_end:
                    continue
                trial_end_dt = datetime.fromisoformat(trial_end) if isinstance(trial_end, str) else trial_end
                if trial_end_dt.tzinfo is None:
                    trial_end_dt = trial_end_dt.replace(tzinfo=timezone.utc)
                days_remaining = (trial_end_dt - now).total_seconds() / 86400
                if not (0 < days_remaining <= TRIAL_REMINDER_WINDOW_DAYS):
                    continue
                uid = sub["user_id"]
                real_sessions = await db.sessions.count_documents({"user_id": uid})
                day_word = "day" if round(days_remaining) == 1 else "days"
                body = (
                    f"You've completed {real_sessions} real sessions so far — keep your progress going."
                    if real_sessions > 0 else
                    "Subscribe to keep your AI coaching and full training history."
                )
                await _send_push(
                    uid,
                    f"Your trial ends in {round(days_remaining)} {day_word}",
                    body,
                    url="/paywall",
                    tag="trial-ending",
                )
                await db.subscriptions.update_one({"user_id": uid}, {"$set": {"trial_reminder_sent": True}})
        except Exception as exc:
            logger.warning(f"Trial-ending loop error: {exc}")


# GDPR Art. 5(1)(e) storage limitation: ephemeral collections with a bounded retention
# window. Excludes `sessions` (training history — the core product value, kept indefinitely
# per the account's own lifetime) and `posts`/`comments` (user content, not time-bound).
_RETENTION_POLICIES = {
    "user_sessions": ("expires_at", 0),     # legacy auth tokens — purge once actually expired
    "notifications": ("created_at", 180),   # engagement pings, no purpose after ~6 months
    "chat_messages":  ("created_at", 90),    # live-stream chat, ephemeral
    "waitlist":       ("created_at", 365),   # pre-signup leads that never converted
    "reports":        ("created_at", 730),   # trust & safety records, kept 2y for disputes
    "crash_reports":  ("created_at", 90),    # diagnostic data, not core product data
}

async def _run_retention_cleanup():
    now_iso = datetime.now(timezone.utc).isoformat()
    for collection, (field, max_age_days) in _RETENTION_POLICIES.items():
        cutoff = now_iso if max_age_days == 0 else (datetime.now(timezone.utc) - timedelta(days=max_age_days)).isoformat()
        try:
            result = await db[collection].delete_many({field: {"$lt": cutoff}})
            if result.deleted_count:
                logger.info(f"Retention cleanup: purged {result.deleted_count} old docs from {collection}")
        except Exception as exc:
            logger.warning(f"Retention cleanup failed for {collection}: {exc}")

async def _retention_cleanup_loop():
    """Once a day: enforce the data retention policy above."""
    import asyncio as _aio
    while True:
        await _run_retention_cleanup()
        await _aio.sleep(86400)

async def run_once_migrations():
    # The first 19 founder spots were all pre-launch test sign-ups, so the public counter
    # starts again from 0. The marker makes it run exactly once, on the first deploy.
    marker = "reset_founder_spots_2026_10_04"
    if await db.migrations.find_one({"_id": marker}):
        return
    await db.counters.update_one({"_id": "founder_spots"}, {"$set": {"n": 0}}, upsert=True)
    await db.migrations.insert_one({"_id": marker, "ran_at": datetime.now(timezone.utc).isoformat()})
    logger.info("Migration: founder spot counter reset to 0")


@app.on_event("startup")
async def startup():
    import asyncio as _aio
    result = await db.users.update_many(
        {"access_granted": {"$exists": False}},
        {"$set": {"access_granted": True}}
    )
    if result.modified_count:
        logger.info(f"Migration: backfilled access_granted=True on {result.modified_count} users")
    await run_once_migrations()
    _aio.create_task(_scheduled_stream_reminder_loop())
    _aio.create_task(_retention_cleanup_loop())
    _aio.create_task(_reengagement_loop())
    _aio.create_task(_investment_loop())
    _aio.create_task(_fantasy_loop())
    _aio.create_task(_buddy_loop())
    _aio.create_task(_fantasy_ops_loop())

@app.on_event("shutdown")
async def shutdown():
    client.close()
