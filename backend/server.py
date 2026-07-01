from fastapi import FastAPI, APIRouter, HTTPException, Depends, Response, Request, Query, File, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import httpx
import bcrypt
import jwt
import base64
import random
import time
import json
import cloudinary
import cloudinary.uploader
import cloudinary.utils
import stripe as stripe_lib

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ.get('MONGO_URL', '')
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'victoryai')]

# JWT Settings
JWT_SECRET = os.environ.get('JWT_SECRET', 'victory-ai-secret-key-change-in-prod')
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_DAYS = 7

# Stripe Settings
STRIPE_API_KEY = os.environ.get('STRIPE_API_KEY', '')
STRIPE_WEBHOOK_SECRET = os.environ.get('STRIPE_WEBHOOK_SECRET', '')
STRIPE_FOUNDERS_COUPON_ID = os.environ.get('STRIPE_FOUNDERS_COUPON_ID', '')
stripe_lib.api_key = STRIPE_API_KEY

# ── Web Push (VAPID) ─────────────────────────────────────────────────────────
# Generate keys once with:
#   python -c "from py_vapid import Vapid; v=Vapid(); v.generate_keys(); \
#     print('Private:', v.private_pem().decode()); \
#     print('Public:', v.public_key.public_bytes(__import__('cryptography').hazmat.primitives.serialization.Encoding.X962, __import__('cryptography').hazmat.primitives.serialization.PublicFormat.UncompressedPoint).__import__('base64').urlsafe_b64encode(v.public_key.public_bytes(...)).decode())"
# Easier: run `vapid --gen` from the pywebpush package and paste the outputs below.
VAPID_PRIVATE_KEY = os.environ.get('VAPID_PRIVATE_KEY', '')  # PEM string
VAPID_PUBLIC_KEY  = os.environ.get('VAPID_PUBLIC_KEY',  '')  # URL-safe base64
VAPID_SUBJECT     = os.environ.get('VAPID_SUBJECT', 'mailto:push@victory.ai')

# ── Freemium AI token budget ──────────────────────────────────────────────────
# Based on real API costs: GPT-4o ~$0.005/call, ElevenLabs ~$0.02/call.
# 10,000 free tokens/month ≈ 5 video analyses OR 6 TTS sessions OR any mix.
FREE_MONTHLY_AI_TOKENS = 10_000
AI_TOKEN_COSTS = {
    "analyze_video":  2_000,   # GPT-4o vision: ~600 input + 400 output tokens
    "tts_generate":   1_500,   # ElevenLabs TTS: ~100 chars, cost-normalised
    "ai_competition": 2_000,   # GPT-4o judge: ~600 input + 400 output tokens
}
# ─────────────────────────────────────────────────────────────────────────────

# Resend (email)
RESEND_API_KEY = os.environ.get('RESEND_API_KEY', '')
RESEND_FROM = os.environ.get('RESEND_FROM', 'Victory AI <onboarding@resend.dev>')

# Clerk Settings
CLERK_SECRET_KEY = os.environ.get('CLERK_SECRET_KEY', '')
CLERK_JWKS_URL = "https://allowing-dragon-5.clerk.accounts.dev/.well-known/jwks.json"
_clerk_jwks_cache: dict = {"keys": [], "fetched_at": 0}

# Emergent LLM Key
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')

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
SUBSCRIPTION_PLANS = {
    "monthly": {"price": 5.00, "name": "Monthly", "interval": "month"},
    "annual": {"price": 25.00, "name": "Annual", "interval": "year", "savings": "Save 58%"}
}

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
    why_downloaded: str
    heard_from: str
    biggest_frustration: str
    training_frequency: str
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
        "feedback_tone": "direct",
        "phrases": ["No excuses!", "You've got more in the tank!", "That's the stuff!", "Again!"]
    },
    "supportive_mentor": {
        "name": "Supportive Mentor",
        "personality": "Encouraging, patient, builds you up. Focuses on progress over perfection.",
        "feedback_tone": "encouraging",
        "phrases": ["You're getting better every day!", "Progress, not perfection!", "I see you improving!", "Keep it up!"]
    },
    "analytical_technician": {
        "name": "Technical Analyst",
        "personality": "Detailed, precise, loves the science of boxing. Breaks down every movement.",
        "feedback_tone": "analytical",
        "phrases": ["Let's analyze that.", "The data shows...", "Technically speaking...", "Notice the angle here."]
    },
    "hype_man": {
        "name": "Hype Man",
        "personality": "Energetic, motivational, makes every session feel like fight night.",
        "feedback_tone": "hype",
        "phrases": ["LET'S GO!", "You're a BEAST!", "THAT'S MY FIGHTER!", "FIRE!"]
    },
    "old_school_trainer": {
        "name": "Old School Trainer",
        "personality": "Wise, experienced, shares stories from the greats. Classic boxing wisdom.",
        "feedback_tone": "wise",
        "phrases": ["In my day...", "The greats always...", "Boxing is an art.", "Patience, young fighter."]
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

def create_jwt_token(user_id: str) -> str:
    payload = {"user_id": user_id, "exp": datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRATION_DAYS), "iat": datetime.now(timezone.utc)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_jwt_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except:
        return None

async def verify_clerk_token(token: str) -> Optional[str]:
    """Verify a Clerk JWT and return the Clerk user ID (sub claim)."""
    global _clerk_jwks_cache
    try:
        from jose import jwt as jose_jwt
        now = time.time()
        if now - _clerk_jwks_cache.get("fetched_at", 0) > 3600:
            async with httpx.AsyncClient() as client:
                resp = await client.get(CLERK_JWKS_URL, timeout=5)
                _clerk_jwks_cache = {**resp.json(), "fetched_at": now}
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
        return user
    email, name, picture = "", "", ""
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"https://api.clerk.com/v1/users/{clerk_user_id}",
                headers={"Authorization": f"Bearer {CLERK_SECRET_KEY}"},
                timeout=5
            )
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
async def register(user_data: UserCreate, response: Response):
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
async def login(user_data: UserLogin, response: Response):
    user = await db.users.find_one({"email": user_data.email}, {"_id": 0})
    if not user or not verify_password(user_data.password, user.get("password", "")):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_jwt_token(user["user_id"])
    response.set_cookie(key="session_token", value=token, httponly=True, secure=True, samesite="none", path="/", max_age=JWT_EXPIRATION_DAYS * 24 * 60 * 60)
    return TokenResponse(access_token=token)

@api_router.post("/auth/session")
async def exchange_session(request: Request, response: Response):
    body = await request.json()
    session_id = body.get("session_id")
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id required")
    
    async with httpx.AsyncClient() as client:
        auth_response = await client.get("https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data", headers={"X-Session-ID": session_id}, timeout=10.0)
        if auth_response.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid session")
        auth_data = auth_response.json()
    
    email, name, picture, session_token = auth_data.get("email"), auth_data.get("name"), auth_data.get("picture"), auth_data.get("session_token")
    existing_user = await db.users.find_one({"email": email}, {"_id": 0})
    
    if existing_user:
        user_id = existing_user["user_id"]
        await db.users.update_one({"user_id": user_id}, {"$set": {"name": name, "picture": picture}})
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id, "email": email, "name": name, "picture": picture,
            "experience_level": "beginner", "primary_goal": "", "created_at": datetime.now(timezone.utc).isoformat(),
            "password": None, "onboarding_completed": False, "training_partner": None, "onboarding_answers": None
        })
    
    await db.user_sessions.delete_many({"user_id": user_id})
    await db.user_sessions.insert_one({"user_id": user_id, "session_token": session_token, "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(), "created_at": datetime.now(timezone.utc).isoformat()})
    response.set_cookie(key="session_token", value=session_token, httponly=True, secure=True, samesite="none", path="/", max_age=7 * 24 * 60 * 60)
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password": 0})
    return user

@api_router.get("/auth/me")
async def get_me(user: dict = Depends(get_current_user_with_subscription)):
    if isinstance(user.get("created_at"), datetime):
        user["created_at"] = user["created_at"].isoformat()
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

@api_router.post("/onboarding/submit")
async def submit_onboarding(answers: OnboardingAnswers, user: dict = Depends(get_current_user)):
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
            "experience_level": answers.experience_level,
            "primary_goal": answers.biggest_frustration,
            "personalized_affirmations": affirmations
        }}
    )
    return {"message": "Onboarding answers saved", "affirmations": affirmations}

@api_router.post("/onboarding/create-partner")
async def create_training_partner(partner_data: TrainingPartnerCreate, user: dict = Depends(get_current_user)):
    style_info = TRAINING_PARTNER_STYLES.get(partner_data.style, TRAINING_PARTNER_STYLES["supportive_mentor"])
    
    partner_id = f"partner_{uuid.uuid4().hex[:12]}"
    training_partner = {
        "partner_id": partner_id,
        "name": partner_data.name,
        "style": partner_data.style,
        "style_name": style_info["name"],
        "personality": style_info["personality"],
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
    training_partner = user.get("training_partner")
    if not training_partner:
        raise HTTPException(status_code=400, detail="Create a training partner first")

    body = await request.json()
    favorite_fighter = body.get("favorite_fighter", "")

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

# ============== CLOUDINARY VIDEO UPLOAD ==============

@api_router.get("/cloudinary/signature")
async def generate_cloudinary_signature(
    resource_type: str = Query("video", enum=["image", "video"]),
    folder: str = Query("victory_rounds"),
    user: dict = Depends(get_current_user)
):
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
    if user.get("ai_tokens_month") != current_month:
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"ai_tokens_used": 0, "ai_tokens_month": current_month}},
        )
        tokens_used = 0
    else:
        tokens_used = user.get("ai_tokens_used", 0)
    remaining = FREE_MONTHLY_AI_TOKENS - tokens_used
    if remaining < cost:
        return {"allowed": False, "tokens_remaining": max(0, remaining)}
    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {"ai_tokens_used": tokens_used + cost, "ai_tokens_month": current_month}},
    )
    return {"allowed": True, "tokens_remaining": remaining - cost}


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


# ============== GPT-4 VISION VIDEO ANALYSIS ==============

@api_router.post("/ai/analyze-video")
async def analyze_video_with_vision(request: Request, user: dict = Depends(get_current_user)):
    body = await request.json()
    video_url = body.get("video_url")
    round_number = body.get("round_number", 1)
    
    if not video_url:
        raise HTTPException(status_code=400, detail="video_url required")

    quota = await check_and_consume_ai_tokens(user, "analyze_video")
    if not quota["allowed"]:
        raise HTTPException(status_code=402, detail="ai_quota_exceeded")

    training_partner = user.get("training_partner", {})
    partner_name = training_partner.get("name", "Coach")
    feedback_tone = training_partner.get("feedback_tone", "encouraging")
    focus_areas = training_partner.get("focus_areas", ["Guard Position", "Head Movement"])
    
    if not EMERGENT_LLM_KEY:
        # Return simulated analysis
        return generate_simulated_analysis(round_number, partner_name, focus_areas)
    
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
        import httpx
        
        # Download video thumbnail/frame for analysis
        # In production, extract frames from video. For now, analyze video URL metadata
        
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"analysis_{user['user_id']}_{round_number}",
            system_message=f"""You are {partner_name}, an expert boxing technique analyst with a {feedback_tone} style.
Analyze the boxing footage and provide feedback on:
1. Guard Position - Are hands at cheekbone height? Elbows tucked?
2. Head Movement - Is the head moving off centerline?
3. Footwork - Balanced stance, no crossing feet?
4. Punch Technique - Extension, snap, hip rotation?
5. Combination Flow - Smooth transitions between punches?

Focus especially on: {', '.join(focus_areas)}

Provide scores 1-10 for each dimension and specific, actionable feedback.
Be {feedback_tone} in your tone but always honest about areas needing work."""
        )
        chat.with_model("openai", "gpt-4o")
        
        # For video analysis, we'd extract frames. Simulating with URL-based prompt
        prompt = f"""Based on the training video from round {round_number}, analyze the boxer's technique.
Video URL: {video_url}

Provide:
1. Scores (1-10) for: Jab, Cross, Guard Position, Head Movement, Footwork, Combination Flow
2. One thing they did well
3. One thing to improve next round
4. A specific drill recommendation

Format as JSON with keys: dimension_scores (array), what_did_well, what_to_improve, drill_recommendation"""

        response = await chat.send_message(UserMessage(text=prompt))
        
        # Parse AI response
        import json
        try:
            analysis = json.loads(response)
        except:
            analysis = generate_simulated_analysis(round_number, partner_name, focus_areas)
        
        # Store analysis
        await db.round_videos.update_one(
            {"video_url": video_url},
            {"$set": {"analyzed": True, "analysis_results": analysis, "analyzed_at": datetime.now(timezone.utc).isoformat()}}
        )
        
        return {"analysis": analysis, "partner_name": partner_name}
        
    except Exception as e:
        logger.error(f"Video analysis error: {e}")
        return generate_simulated_analysis(round_number, partner_name, focus_areas)

def generate_simulated_analysis(round_number: int, partner_name: str, focus_areas: List[str]) -> dict:
    key_dimensions = ["Jab", "Cross", "Guard Position", "Head Movement", "Footwork", "Combination Flow"]
    dimension_scores = [{"dimension_name": dim, "score": random.randint(5, 9)} for dim in key_dimensions]
    
    sorted_scores = sorted(dimension_scores, key=lambda x: x["score"])
    best = sorted_scores[-1]
    worst = sorted_scores[0]
    
    return {
        "analysis": {
            "dimension_scores": dimension_scores,
            "what_did_well": f"Strong {best['dimension_name'].lower()} this round - keep that up!",
            "what_to_improve": f"Focus on your {worst['dimension_name'].lower()} next round.",
            "drill_recommendation": DRILLS.get(worst["dimension_name"], {"name": "Basic drill", "description": "Work on fundamentals"})
        },
        "partner_name": partner_name
    }

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
    
    # Use video analysis if available, otherwise generate
    if video_analysis and "dimension_scores" in video_analysis:
        dimension_scores = video_analysis["dimension_scores"]
        what_did_well = video_analysis.get("what_did_well", "Good work!")
        what_to_improve = video_analysis.get("what_to_improve", "Keep pushing!")
        drill_rec = video_analysis.get("drill_recommendation", {})
    else:
        # Generate simulated scores
        key_dimensions = ["Jab", "Cross", "Guard Position", "Head Movement", "Footwork", "Combination Flow"]
        dimension_scores = [{"dimension_name": dim, "score": random.randint(4, 9)} for dim in key_dimensions]
        sorted_scores = sorted(dimension_scores, key=lambda x: x["score"])
        
        best = sorted_scores[-1]
        worst = sorted_scores[0]
        
        what_did_well = f"Great {best['dimension_name'].lower()} this round! {random.choice(phrases)}"
        what_to_improve = f"Your {worst['dimension_name'].lower()} needs attention. Let's tighten that up."
        drill_rec = DRILLS.get(worst["dimension_name"], {"name": "Focus drill", "description": "Work on this area."})
    
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
        "rounds": [], "status": "in_progress", "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.training_sessions.insert_one(session_doc)
    return {"session_id": session_id, "status": "started"}

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
    
    # Calculate final scores
    final_dimension_scores = []
    for dim in DIMENSIONS:
        if dim in all_scores:
            avg = sum(all_scores[dim]) / len(all_scores[dim])
            final_dimension_scores.append({"dimension_name": dim, "score": round(avg)})
        else:
            final_dimension_scores.append({"dimension_name": dim, "score": random.randint(5, 8)})
    
    scores = [d["score"] for d in final_dimension_scores if d["score"]]
    overall_score = sum(scores) / len(scores) if scores else 6.0
    
    session_record = {
        "session_id": session_id, "user_id": user["user_id"], "date": session["date"],
        "overall_score": round(overall_score, 1), "dimension_scores": final_dimension_scores,
        "rounds": [{"round_number": v["round_number"], "video_url": v["video_url"], "analysis": v.get("analysis_results")} for v in videos],
        "training_config": {"round_duration": session["round_duration"], "rest_duration": session["rest_duration"], "total_rounds": session["total_rounds"]},
        "created_at": session["created_at"], "completed_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.sessions.insert_one({**session_record})
    await db.training_sessions.update_one({"session_id": session_id}, {"$set": {"status": "completed", "overall_score": round(overall_score, 1)}})
    
    # Return a clean copy without _id
    return session_record

# ============== STRIPE PAYMENT ENDPOINTS ==============

@api_router.post("/payments/checkout")
async def create_checkout(checkout_req: CheckoutRequest, user: dict = Depends(get_current_user)):
    import asyncio
    if checkout_req.plan_id not in SUBSCRIPTION_PLANS:
        raise HTTPException(status_code=400, detail="Invalid plan")

    plan = SUBSCRIPTION_PLANS[checkout_req.plan_id]
    host_url = checkout_req.origin_url.rstrip('/')

    checkout_params = {
        "mode": "subscription",
        "payment_method_types": ["card"],
        "line_items": [{
            "price_data": {
                "currency": "usd",
                "product_data": {"name": f"Victory AI {plan['name']}"},
                "unit_amount": int(plan["price"] * 100),
                "recurring": {"interval": plan["interval"]},
            },
            "quantity": 1,
        }],
        "subscription_data": {"trial_period_days": 14},
        "success_url": f"{host_url}/payment/success?session_id={{CHECKOUT_SESSION_ID}}",
        "cancel_url": f"{host_url}/paywall",
        "customer_email": user.get("email") or None,
        "metadata": {"user_id": user["user_id"], "plan_id": checkout_req.plan_id},
    }

    # Auto-apply founders discount for waitlist users — Stripe forbids mixing
    # allow_promotion_codes=True with discounts[], so only one path runs.
    founders_applied = False
    if STRIPE_FOUNDERS_COUPON_ID and user.get("email"):
        waitlist_entry = await db.waitlist.find_one({"email": user["email"]})
        if waitlist_entry and waitlist_entry.get("promo_code"):
            try:
                codes = await asyncio.to_thread(
                    stripe_lib.PromotionCode.list,
                    code=waitlist_entry["promo_code"],
                    limit=1,
                )
                if codes.data and codes.data[0].active:
                    checkout_params["discounts"] = [{"promotion_code": codes.data[0].id}]
                    founders_applied = True
            except Exception as e:
                logger.warning(f"Founders discount lookup failed: {e}")

    if not founders_applied:
        checkout_params["allow_promotion_codes"] = True

    try:
        session = await asyncio.to_thread(
            stripe_lib.checkout.Session.create,
            **checkout_params,
        )
    except Exception as e:
        logger.error(f"Stripe checkout error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    await db.payment_transactions.insert_one({
        "transaction_id": f"txn_{uuid.uuid4().hex[:12]}", "user_id": user["user_id"],
        "session_id": session.id, "plan_id": checkout_req.plan_id,
        "amount": float(plan["price"]), "currency": "usd", "payment_status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat()
    })

    return {"checkout_url": session.url, "session_id": session.id}

@api_router.get("/payments/status/{session_id}")
async def get_payment_status(session_id: str, user: dict = Depends(get_current_user)):
    import asyncio
    try:
        session = await asyncio.to_thread(stripe_lib.checkout.Session.retrieve, session_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    is_complete = session.status == "complete"
    # Subscriptions with a trial have payment_status="no_payment_required" — treat "complete" as success
    effective_payment_status = "paid" if is_complete else session.payment_status

    await db.payment_transactions.update_one(
        {"session_id": session_id},
        {"$set": {"payment_status": effective_payment_status, "status": session.status}}
    )

    if is_complete and not await db.subscriptions.find_one({"session_id": session_id}):
        transaction = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
        plan_id = (transaction or {}).get("plan_id", "monthly")
        trial_end = datetime.now(timezone.utc) + timedelta(days=14)
        subscription_end = trial_end + timedelta(days=365 if plan_id == "annual" else 30)

        await db.subscriptions.insert_one({
            "subscription_id": session.subscription or f"sub_{uuid.uuid4().hex[:12]}",
            "user_id": user["user_id"], "session_id": session_id, "plan_id": plan_id,
            "status": "trialing", "trial_end": trial_end.isoformat(),
            "current_period_end": subscription_end.isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat()
        })

    return {
        "status": session.status,
        "payment_status": effective_payment_status,
        "amount_total": session.amount_total,
        "currency": session.currency
    }

@api_router.get("/subscription/status")
async def get_subscription_status(user: dict = Depends(get_current_user)):
    subscription = await db.subscriptions.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if not subscription:
        return {"has_subscription": False, "status": None}
    return {"has_subscription": subscription["status"] in ["active", "trialing"], "status": subscription["status"], "plan_id": subscription.get("plan_id")}

@api_router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    body = await request.body()
    signature = request.headers.get("stripe-signature", "")
    try:
        if STRIPE_WEBHOOK_SECRET:
            event = stripe_lib.Webhook.construct_event(body, signature, STRIPE_WEBHOOK_SECRET)
        else:
            import json
            event = json.loads(body)
    except Exception as e:
        logger.error(f"Webhook parse error: {e}")
        return {"received": True}

    event_type = event.get("type", "") if isinstance(event, dict) else event.type
    event_data = event.get("data", {}).get("object", {}) if isinstance(event, dict) else event.data.object

    try:
        if event_type == "customer.subscription.updated":
            stripe_sub_id = event_data.get("id") if isinstance(event_data, dict) else event_data.id
            sub_status = event_data.get("status") if isinstance(event_data, dict) else event_data.status
            if stripe_sub_id:
                await db.subscriptions.update_one(
                    {"subscription_id": stripe_sub_id},
                    {"$set": {"status": sub_status}}
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
                uid = meta.get("user_id")
                tokens = int(meta.get("tokens", 0))
                if uid and tokens:
                    await db.users.update_one({"user_id": uid}, {"$inc": {"token_balance": tokens}})
                    logger.info(f"Fulfilled {tokens} tokens for {uid}")
            elif gift_type == "gift_sub":
                uid = meta.get("user_id")
                count = int(meta.get("gift_count", 0))
                stream_id = meta.get("stream_id", "")
                if uid and count:
                    await db.users.update_one({"user_id": uid}, {"$inc": {"lifetime_gifts": count}})
                    if stream_id:
                        gifter = await db.users.find_one({"user_id": uid}, {"name": 1, "display_name": 1, "avatar_url": 1})
                        gname = (gifter or {}).get("display_name") or (gifter or {}).get("name", "Someone")
                        await ws_manager.broadcast(stream_id, json.dumps({
                            "type": "gift_sub",
                            "user_name": gname,
                            "count": count,
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                        }))
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
    host = origin_url.rstrip("/") or "https://victory-ai-alpha.vercel.app"
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
        raise HTTPException(500, str(e))
    return {"checkout_url": session.url, "tokens": pkg["tokens"], "price": pkg["price"]}

@api_router.post("/streams/{stream_id}/tip")
async def send_tip(stream_id: str, req: TipRequest, user: dict = Depends(get_current_user)):
    if req.amount < 25:
        raise HTTPException(400, "Minimum tip is 25 tokens")
    balance = user.get("token_balance", 0)
    if balance < req.amount:
        raise HTTPException(402, detail="insufficient_tokens")
    stream = await db.streams.find_one({"stream_id": stream_id})
    if not stream:
        raise HTTPException(404, "Stream not found")

    # Determine punch action: prefer exact key match, fall back to amount threshold
    punch = None
    if req.action_key:
        punch = next((p for p in PUNCH_MENU if p.get("key") == req.action_key), None)
    if not punch:
        punch = next((p for p in reversed(PUNCH_MENU) if req.amount >= p["tokens"]), PUNCH_MENU[0])

    # Atomically deduct sender, credit streamer (70% cut)
    await db.users.update_one({"user_id": user["user_id"]}, {"$inc": {"token_balance": -req.amount}})
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

    # Broadcast tip event to all chat viewers
    is_combo = punch.get("category") == "combo" if punch else False
    await ws_manager.broadcast(stream_id, json.dumps({
        "type": "tip",
        "tip_id": tip_doc["tip_id"],
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
    }))

    # Push notification to streamer (non-blocking)
    sender_name = user.get("display_name") or user.get("name", "Someone")
    await _send_push(
        stream["user_id"],
        title=f"{sender_name} tipped {req.amount:,} tokens!",
        body=req.message[:80] if req.message else f"{punch['action'] if punch else '⚡'} — you're on fire",
        url=f"/stream/{stream_id}",
        tag=f"tip-{stream_id}",
    )

    return {"success": True, "tokens_remaining": balance - req.amount, "punch_action": tip_doc["punch_action"]}

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
    host = req.origin_url.rstrip("/") or "https://victory-ai-alpha.vercel.app"
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
        raise HTTPException(500, str(e))
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
async def create_ad_checkout(req: AdCampaignRequest):
    pkg = AD_PACKAGES.get(req.package_id)
    if not pkg:
        raise HTTPException(400, "Invalid ad package")
    if not STRIPE_SECRET_KEY:
        raise HTTPException(500, "Payments not configured")
    campaign_id = f"ad_{uuid.uuid4().hex[:12]}"
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
            success_url=f"{req.origin_url}/advertise/success?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{req.origin_url}/advertise",
            metadata={
                "purchase_type": "ad_campaign",
                "campaign_id": campaign_id,
                "days": str(pkg["days"]),
            },
        )
    except Exception as e:
        raise HTTPException(500, str(e))
    return {"checkout_url": session.url, "campaign_id": campaign_id}

# ============== WAITLIST ENDPOINTS ==============

class WaitlistSignup(BaseModel):
    model_config = {"extra": "allow"}
    email: EmailStr
    name: Optional[str] = None

@api_router.post("/waitlist/signup")
async def waitlist_signup(data: WaitlistSignup):
    import asyncio

    # Prevent duplicate signups
    existing = await db.waitlist.find_one({"email": data.email})
    if existing:
        return {"message": "Already on the waitlist", "already_registered": True}

    # Create a unique Stripe promotion code for this person
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

    # Store in waitlist collection
    await db.waitlist.insert_one({
        "email": data.email,
        "name": data.name or "",
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

    return {"message": "Signed up successfully", "promo_code": promo_code_str}

# ============== SESSION & STATIC ENDPOINTS ==============

@api_router.get("/sessions")
async def get_sessions(user: dict = Depends(get_current_user), limit: int = 100):
    sessions = await db.sessions.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return sessions

@api_router.get("/sessions/{session_id}")
async def get_session(session_id: str, user: dict = Depends(get_current_user)):
    session = await db.sessions.find_one({"session_id": session_id, "user_id": user["user_id"]}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session

@api_router.put("/users/me")
async def update_profile(update_data: UserUpdate, user: dict = Depends(get_current_user)):
    update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}
    if update_dict:
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": update_dict})
    return await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "password": 0})

@api_router.get("/users/stats")
async def get_user_stats(user: dict = Depends(get_current_user)):
    sessions = await db.sessions.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(1000)
    return {"total_sessions": len(sessions), "best_score": max([s.get("overall_score", 0) for s in sessions]) if sessions else 0, "most_improved_dimension": None}

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
    for i, leader in enumerate(leaders):
        user_info = leader.get("user_info") or {}
        name = user_info.get("name", "Fighter")
        # Show first name + last initial only for privacy
        parts = name.strip().split()
        display_name = parts[0] if len(parts) == 1 else f"{parts[0]} {parts[-1][0]}."
        result.append({
            "rank": i + 1,
            "display_name": display_name,
            "avg_score": round(leader["avg_score"], 1),
            "total_sessions": leader["total_sessions"],
            "best_score": round(leader["best_score"], 1),
            "is_current_user": leader["_id"] == user["user_id"]
        })
    # Find current user's rank if not in top 50
    current_rank = next((r for r in result if r["is_current_user"]), None)
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
            dimension_scores = analysis["dimension_scores"]
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

class UserProfileExtend(BaseModel):
    bio: Optional[str] = None
    weight_class: Optional[str] = None
    stance: Optional[str] = None
    amateur_wins: Optional[int] = None
    amateur_losses: Optional[int] = None
    amateur_draws: Optional[int] = None
    pro_wins: Optional[int] = None
    pro_losses: Optional[int] = None
    pro_draws: Optional[int] = None
    titles: Optional[List[str]] = None
    avatar_url: Optional[str] = None
    is_public: Optional[bool] = None
    display_name: Optional[str] = None

class GymCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    style: Optional[str] = "mixed"
    is_public: bool = True

class PostCreate(BaseModel):
    video_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    caption: str = ""
    post_type: str = "clip"
    tags: List[str] = []

class CommentCreate(BaseModel):
    text: str

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

def safe_user(user: dict) -> dict:
    return {
        "user_id": user.get("user_id"),
        "display_name": user.get("display_name") or user.get("name", "Fighter"),
        "name": user.get("name", "Fighter"),
        "picture": user.get("picture"),
        "avatar_url": user.get("avatar_url"),
        "weight_class": user.get("weight_class"),
        "stance": user.get("stance"),
        "gym_id": user.get("gym_id"),
        "bio": user.get("bio", ""),
        "amateur_wins": user.get("amateur_wins", 0),
        "amateur_losses": user.get("amateur_losses", 0),
        "amateur_draws": user.get("amateur_draws", 0),
        "competition_wins": user.get("competition_wins", 0),
        "competition_losses": user.get("competition_losses", 0),
        "badges": user.get("badges", []),
        "is_public": user.get("is_public", True),
    }

async def _recalculate_gym_stats(gym_id: str):
    gym = await db.gyms.find_one({"gym_id": gym_id})
    if not gym:
        return
    total_score, total_sessions = 0.0, 0
    for uid in gym.get("members", []):
        sessions = await db.sessions.find({"user_id": uid}).to_list(10000)
        total_sessions += len(sessions)
        total_score += sum(s.get("overall_score", 0) for s in sessions)
    avg = round(total_score / total_sessions, 1) if total_sessions else 0.0
    await db.gyms.update_one(
        {"gym_id": gym_id},
        {"$set": {"avg_score": avg, "total_sessions": total_sessions}}
    )

# ============== PROFILE EXTENDED ENDPOINTS ==============

@api_router.put("/users/profile")
async def update_extended_profile(data: UserProfileExtend, user: dict = Depends(get_current_user)):
    update = {k: v for k, v in data.model_dump().items() if v is not None}
    if update:
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": update})
    updated = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "password": 0})
    return safe_user(updated)


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
    query: dict = {"is_public": {"$ne": False}}

    if q.strip():
        pattern = {"$regex": q.strip(), "$options": "i"}
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


@api_router.get("/users/{user_id}/profile")
async def get_public_profile(user_id: str, current_user: dict = Depends(get_current_user)):
    target = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password": 0})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if not target.get("is_public", True) and target["user_id"] != current_user["user_id"]:
        raise HTTPException(status_code=403, detail="Profile is private")
    profile = safe_user(target)
    sessions = await db.sessions.find({"user_id": user_id}).to_list(10000)
    profile["total_sessions"] = len(sessions)
    profile["avg_score"] = round(sum(s.get("overall_score", 0) for s in sessions) / len(sessions), 1) if sessions else 0
    profile["best_score"] = max((s.get("overall_score", 0) for s in sessions), default=0)
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


# ── Clips ──────────────────────────────────────────────────────────────────────

@api_router.get("/users/{user_id}/clips")
async def get_user_clips(user_id: str, current_user: dict = Depends(get_current_user)):
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
    now_iso = datetime.now(timezone.utc).isoformat()
    items = await db.scheduled_streams.find(
        {"user_id": user_id, "scheduled_at": {"$gte": now_iso}},
        {"_id": 0}
    ).sort("scheduled_at", 1).limit(20).to_list(20)
    return items

@api_router.post("/streams/schedule")
async def create_scheduled_stream(data: ScheduledStreamCreate, user: dict = Depends(get_current_user)):
    try:
        scheduled_dt = datetime.fromisoformat(data.scheduled_at.replace("Z", "+00:00"))
        if scheduled_dt <= datetime.now(timezone.utc):
            raise HTTPException(400, "Scheduled time must be in the future")
    except ValueError:
        raise HTTPException(400, "Invalid datetime format — use ISO 8601")
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

async def _send_push(user_id: str, title: str, body: str, url: str = "/live", tag: str | None = None):
    """Fire-and-forget push to all subscriptions for a user. Cleans up expired subs."""
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

    import asyncio as _aio
    payload = json.dumps({"title": title, "body": body, "url": url, "tag": tag or f"v-{uuid.uuid4().hex[:6]}"})

    for sub in subs:
        sub_info = {"endpoint": sub["endpoint"], "keys": sub["keys"]}
        try:
            await _aio.to_thread(
                webpush,
                subscription_info=sub_info,
                data=payload,
                vapid_private_key=VAPID_PRIVATE_KEY,
                vapid_claims={"sub": VAPID_SUBJECT},
                ttl=86400,
            )
        except Exception as exc:
            err_str = str(exc)
            logger.warning(f"Push failed for {user_id}: {err_str}")
            if "410" in err_str or "404" in err_str:
                # Subscription expired — remove it
                await db.push_subscriptions.delete_one({"endpoint": sub["endpoint"]})


# ============== GYM ENDPOINTS ==============

@api_router.post("/gyms")
async def create_gym(gym_data: GymCreate, user: dict = Depends(get_current_user)):
    if not await check_subscription(user):
        raise HTTPException(status_code=403, detail="Pro subscription required to create a gym")
    if user.get("gym_id"):
        raise HTTPException(status_code=400, detail="Leave your current gym before creating a new one")
    gym_id = f"gym_{uuid.uuid4().hex[:12]}"
    invite_code = uuid.uuid4().hex[:8].upper()
    gym_doc = {
        "gym_id": gym_id,
        "name": gym_data.name,
        "description": gym_data.description,
        "style": gym_data.style,
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
    gym_doc.pop("_id", None)
    return gym_doc

@api_router.get("/gyms/my")
async def get_my_gym(user: dict = Depends(get_current_user)):
    if not user.get("gym_id"):
        return None
    gym = await db.gyms.find_one({"gym_id": user["gym_id"]}, {"_id": 0})
    if not gym:
        return None
    members = []
    for uid in gym.get("members", []):
        u = await db.users.find_one({"user_id": uid}, {"_id": 0, "password": 0})
        if u:
            sessions = await db.sessions.find({"user_id": uid}).to_list(10000)
            avg = round(sum(s.get("overall_score", 0) for s in sessions) / len(sessions), 1) if sessions else 0
            members.append({**safe_user(u), "avg_score": avg, "total_sessions": len(sessions)})
    gym["members_detail"] = sorted(members, key=lambda m: m.get("avg_score", 0), reverse=True)
    return gym

@api_router.get("/gyms/leaderboard")
async def get_gym_leaderboard(user: dict = Depends(get_current_user)):
    gyms = await db.gyms.find({"is_public": True}, {"_id": 0}).sort("avg_score", -1).to_list(50)
    return [
        {
            "gym_id": g["gym_id"],
            "name": g["name"],
            "style": g.get("style"),
            "avg_score": g.get("avg_score", 0),
            "member_count": g.get("member_count", 0),
            "total_sessions": g.get("total_sessions", 0),
            "is_my_gym": g["gym_id"] == user.get("gym_id"),
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
    members = []
    for uid in gym.get("members", []):
        u = await db.users.find_one({"user_id": uid}, {"_id": 0, "password": 0})
        if u:
            sessions = await db.sessions.find({"user_id": uid}).to_list(10000)
            avg = round(sum(s.get("overall_score", 0) for s in sessions) / len(sessions), 1) if sessions else 0
            members.append({**safe_user(u), "avg_score": avg, "total_sessions": len(sessions)})
    gym["members_detail"] = sorted(members, key=lambda m: m.get("avg_score", 0), reverse=True)
    gym["is_member"] = user["user_id"] in gym.get("members", [])
    gym["is_owner"] = gym["owner_id"] == user["user_id"]
    posts = await db.posts.find({"gym_id": gym_id}, {"_id": 0}).sort("created_at", -1).to_list(10)
    for p in posts:
        poster = await db.users.find_one({"user_id": p["user_id"]}, {"_id": 0, "password": 0})
        p["author"] = safe_user(poster) if poster else {"display_name": "Unknown"}
    gym["recent_posts"] = posts
    return gym

@api_router.get("/gyms")
async def browse_gyms(user: dict = Depends(get_current_user)):
    gyms = await db.gyms.find({"is_public": True}, {"_id": 0}).sort("avg_score", -1).to_list(50)
    return [{**g, "is_member": user["user_id"] in g.get("members", [])} for g in gyms]

@api_router.post("/gyms/{gym_id}/join")
async def join_gym(gym_id: str, user: dict = Depends(get_current_user)):
    gym = await db.gyms.find_one({"gym_id": gym_id})
    if not gym:
        raise HTTPException(status_code=404, detail="Gym not found")
    if user["user_id"] in gym.get("members", []):
        raise HTTPException(status_code=400, detail="Already a member")
    if user.get("gym_id"):
        raise HTTPException(status_code=400, detail="Leave your current gym first")
    await db.gyms.update_one(
        {"gym_id": gym_id},
        {"$addToSet": {"members": user["user_id"]}, "$inc": {"member_count": 1}}
    )
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"gym_id": gym_id}})
    await _recalculate_gym_stats(gym_id)
    return {"message": "Joined gym", "gym_id": gym_id}

@api_router.post("/gyms/{gym_id}/leave")
async def leave_gym(gym_id: str, user: dict = Depends(get_current_user)):
    gym = await db.gyms.find_one({"gym_id": gym_id})
    if not gym:
        raise HTTPException(status_code=404, detail="Gym not found")
    if gym["owner_id"] == user["user_id"]:
        raise HTTPException(status_code=400, detail="Gym owner cannot leave — delete the gym instead")
    await db.gyms.update_one(
        {"gym_id": gym_id},
        {"$pull": {"members": user["user_id"]}, "$inc": {"member_count": -1}}
    )
    await db.users.update_one({"user_id": user["user_id"]}, {"$unset": {"gym_id": ""}})
    return {"message": "Left gym"}

@api_router.delete("/gyms/{gym_id}")
async def delete_gym(gym_id: str, user: dict = Depends(get_current_user)):
    gym = await db.gyms.find_one({"gym_id": gym_id})
    if not gym:
        raise HTTPException(status_code=404, detail="Gym not found")
    if gym["owner_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Only the gym owner can delete this gym")
    for uid in gym.get("members", []):
        await db.users.update_one({"user_id": uid}, {"$unset": {"gym_id": ""}})
    await db.gyms.delete_one({"gym_id": gym_id})
    return {"message": "Gym deleted"}

@api_router.post("/gyms/join-by-code")
async def join_gym_by_code(request: Request, user: dict = Depends(get_current_user)):
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
    gym_id = gym["gym_id"]
    await db.gyms.update_one(
        {"gym_id": gym_id},
        {"$addToSet": {"members": user["user_id"]}, "$inc": {"member_count": 1}}
    )
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"gym_id": gym_id}})
    await _recalculate_gym_stats(gym_id)
    return {"message": "Joined gym", "gym_id": gym_id, "gym_name": gym["name"]}

# ============== FEED / POSTS ENDPOINTS ==============

@api_router.post("/posts")
async def create_post(post_data: PostCreate, user: dict = Depends(get_current_user)):
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
    query: dict = {}
    if feed_type == "following":
        follows = await db.follows.find({"follower_id": user["user_id"]}, {"following_id": 1}).to_list(10000)
        following_ids = [f["following_id"] for f in follows] + [user["user_id"]]
        query = {"user_id": {"$in": following_ids}}
    elif feed_type == "gym" and user.get("gym_id"):
        query = {"gym_id": user["gym_id"]}
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
    post = await db.posts.find_one({"post_id": post_id}, {"_id": 0})
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

    query: dict = {"video_url": {"$exists": True, "$ne": ""}}
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
async def add_comment(post_id: str, comment_data: CommentCreate, user: dict = Depends(get_current_user)):
    post = await db.posts.find_one({"post_id": post_id})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
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
    comments = await db.comments.find({"post_id": post_id}, {"_id": 0}).sort("created_at", 1).to_list(100)
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
    streams = await db.streams.find({}, {"_id": 0, "stream_key": 0}).sort(
        [("status", -1), ("viewer_count", -1)]
    ).limit(30).to_list(30)

    # Fetch posts from last 14 days
    cutoff = (datetime.now(timezone.utc) - timedelta(days=14)).isoformat()
    posts = await db.posts.find(
        {"created_at": {"$gte": cutoff}}, {"_id": 0}
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
    if data.competition_type == "ai_judge" and not await check_subscription(user):
        raise HTTPException(status_code=403, detail="Pro subscription required for AI judging")
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
        try:
            import json as _json
            headers = {"Authorization": f"Bearer {EMERGENT_LLM_KEY}", "Content-Type": "application/json"}
            prompt = (
                f"You are a professional boxing judge. Score this boxing video on: "
                f"Jab, Cross, Left Hook, Right Hook, Guard Position, Head Movement, Footwork, Combination Flow, Punch Accuracy. "
                f"Video URL: {data.video_url}. "
                f'Respond in JSON: {{"scores":{{"Jab":7,...}},"overall":7.5,"feedback":"...","highlight":"...","improve":"..."}}'
            )
            async with httpx.AsyncClient() as http_client:
                res = await http_client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers=headers,
                    json={"model": "gpt-4o", "messages": [{"role": "user", "content": prompt}], "response_format": {"type": "json_object"}},
                    timeout=30,
                )
                if res.status_code == 200:
                    ai_result = _json.loads(res.json()["choices"][0]["message"]["content"])
                    comp_doc["ai_result"] = ai_result
                    comp_doc["avg_score"] = ai_result.get("overall")
                    comp_doc["dimension_averages"] = ai_result.get("scores", {})
                    comp_doc["status"] = "closed"
        except Exception as e:
            logger.error(f"AI judging error: {e}")
    await db.competitions.insert_one(comp_doc)
    comp_doc.pop("_id", None)
    comp_doc["challenger"] = safe_user(user)
    return comp_doc

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
    closes_at = comp.get("voting_closes_at")
    if closes_at:
        close_dt = datetime.fromisoformat(closes_at)
        if close_dt.tzinfo is None:
            close_dt = close_dt.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) > close_dt:
            await db.competitions.update_one({"comp_id": comp_id}, {"$set": {"status": "closed"}})
            raise HTTPException(status_code=400, detail="Voting period has ended")
    vote_doc = {
        "vote_id": f"vote_{uuid.uuid4().hex[:12]}",
        "comp_id": comp_id,
        "voter_id": user["user_id"],
        "scores": vote_data.scores,
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
    return {"message": "Vote cast", "vote_id": vote_doc["vote_id"]}

# ============== FOLLOW ENDPOINTS ==============

@api_router.post("/follows/{target_id}")
async def follow_user(target_id: str, user: dict = Depends(get_current_user)):
    if target_id == user["user_id"]:
        raise HTTPException(status_code=400, detail="Cannot follow yourself")
    if not await db.users.find_one({"user_id": target_id}):
        raise HTTPException(status_code=404, detail="User not found")
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

ADMIN_EMAIL = os.environ.get('ADMIN_EMAIL', 'archieroach2013@gmail.com')

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
        type_label = {"bug": "🐛 Bug Report", "feature": "💡 Feature Request", "general": "💬 General Feedback"}.get(data.type, data.type)
        rating_str = f"{'⭐' * data.rating} ({data.rating}/5)" if data.rating else "Not rated"
        email_html = f"""
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#12121A;color:#F0F0F5;padding:32px;border-radius:12px;">
          <h2 style="color:#E8FF47;margin-top:0;">New Beta Feedback</h2>
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="color:#8888A0;padding:6px 0;width:120px;">Type</td><td>{type_label}</td></tr>
            <tr><td style="color:#8888A0;padding:6px 0;">From</td><td>{doc['user_name']} &lt;{doc['user_email']}&gt;</td></tr>
            <tr><td style="color:#8888A0;padding:6px 0;">Rating</td><td>{rating_str}</td></tr>
            <tr><td style="color:#8888A0;padding:6px 0;">Page</td><td>{data.page or 'Unknown'}</td></tr>
          </table>
          <div style="margin-top:20px;padding:16px;background:#1A1A2E;border-radius:8px;border-left:3px solid #E8FF47;">
            <p style="margin:0;line-height:1.6;">{data.message}</p>
          </div>
        </div>"""
        try:
            async with httpx.AsyncClient() as client:
                await client.post(
                    "https://api.resend.com/emails",
                    headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"},
                    json={"from": RESEND_FROM, "to": [ADMIN_EMAIL], "subject": f"[Victory AI] {type_label} from {doc['user_name']}", "html": email_html},
                    timeout=5,
                )
        except Exception:
            pass

    return {"feedback_id": doc["feedback_id"]}

@api_router.get("/feedback")
async def get_feedback(user: dict = Depends(get_current_user)):
    if user.get("email") != ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="Admin only")
    items = await db.feedback.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return items

@api_router.post("/auth/validate")
async def validate_access(user: dict = Depends(get_current_user)):
    """iOS: verify Stripe subscription live and check access_granted flag."""
    import asyncio as _asyncio

    subscription = await db.subscriptions.find_one(
        {"user_id": user["user_id"]},
        {"_id": 0},
    )
    if not subscription:
        return {"access_granted": False, "reason": "no_subscription"}

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
        r.raise_for_status()
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


@api_router.post("/streams/go-live")
async def go_live(user: dict = Depends(get_current_user)):
    if not LIVEPEER_API_KEY:
        raise HTTPException(500, "Streaming not configured")
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
            {"$set": {"status": "live", "started_at": now, **stream_meta}},
        )
        return {
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
    except Exception as e:
        logger.error(f"Livepeer go-live: {e}")
        raise HTTPException(502, "Failed to create stream")
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
        "is_private": False,
        "status": "live",
        "viewer_count": 0,
        "created_at": now,
        "started_at": now,
        "ended_at": None,
    }
    await db.streams.insert_one(doc)
    return {
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
        async with httpx.AsyncClient(timeout=15) as c:
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
    cursor = db.streams.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).limit(limit)
    return await cursor.to_list(length=limit)


@api_router.get("/streams")
async def list_streams(
    status: Optional[str] = Query(None),
    type: Optional[str] = Query(None),
    limit: int = Query(20, le=50),
    _: dict = Depends(get_current_user),
):
    q: Dict[str, Any] = {"is_private": False}
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
    stream = await db.streams.find_one({"stream_id": stream_id}, {"_id": 0})
    if not stream:
        raise HTTPException(404, "Stream not found")
    if stream.get("is_private") and stream["user_id"] != user["user_id"]:
        raise HTTPException(403, "Private stream")
    if stream["user_id"] != user["user_id"]:
        stream.pop("stream_key", None)
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
        updates["title"] = data.title
    if data.description is not None:
        updates["description"] = data.description
    if updates:
        await db.streams.update_one({"stream_id": stream_id}, {"$set": updates})
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
    stream = await db.streams.find_one({"stream_id": stream_id}, {"_id": 0})
    if not stream:
        raise HTTPException(404, "Stream not found")
    if not stream.get("playback_id"):
        raise HTTPException(400, "No playback ID")
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

    return post_doc


@app.post("/api/livepeer/webhook")
async def livepeer_webhook(request: Request):
    body = await request.json()
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
    count = ws_manager.viewer_count(stream_id)
    await db.streams.update_one({"stream_id": stream_id}, {"$set": {"viewer_count": count}})
    history = await db.chat_messages.find(
        {"stream_id": stream_id}, {"_id": 0}
    ).sort("created_at", 1).limit(50).to_list(length=50)
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
            text = (payload.get("message") or "").strip()
            if not text or len(text) > 500:
                continue
            msg = {
                "message_id": f"msg_{uuid.uuid4().hex[:10]}",
                "stream_id": stream_id,
                "user_name": (payload.get("user_name") or "Fighter")[:50],
                "user_avatar": (payload.get("user_avatar") or "")[:200],
                "message": text,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.chat_messages.insert_one(msg)
            msg.pop("_id", None)
            await ws_manager.broadcast(stream_id, {"type": "message", **msg})
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        ws_manager.disconnect(websocket, stream_id)
        count = ws_manager.viewer_count(stream_id)
        await db.streams.update_one({"stream_id": stream_id}, {"$set": {"viewer_count": count}})
        await ws_manager.broadcast(stream_id, {"type": "viewer_count", "count": count})

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
    if data.reaction_type not in EMOTE_REACTIONS:
        raise HTTPException(400, "Unknown reaction type")
    if data.token_price not in EMOTE_TOKEN_PRICES:
        raise HTTPException(400, "Invalid token price")
    if not data.name.strip():
        raise HTTPException(400, "Emote name is required")

    reaction = EMOTE_REACTIONS[data.reaction_type]
    partner  = user.get("training_partner") or {}
    partner_name  = partner.get("name", "boxer")
    partner_style = partner.get("style_name") or partner.get("style") or "professional boxer"

    prompt = (
        f"Twitch emote sticker of {partner_name}, a {partner_style} boxing character, "
        f"{reaction['desc']}, "
        f"clean white background, chibi cartoon sticker art, bold black outlines, "
        f"vivid colours, expressive eyes, boxing gloves, highly detailed emote"
    )
    seed = abs(hash(f"{user['user_id']}{data.reaction_type}")) % 999999
    encoded = _url_parse.quote(prompt)
    image_url = (
        f"https://image.pollinations.ai/prompt/{encoded}"
        f"?width=256&height=256&nologo=true&seed={seed}"
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
        balance = user.get("token_balance", 0)
        if balance < price:
            raise HTTPException(402, detail="insufficient_tokens")
        # Deduct from buyer, 70% to emote owner
        await db.users.update_one({"user_id": user["user_id"]},           {"$inc": {"token_balance": -price}})
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
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=_cors_origins, allow_origin_regex=r'https://.*\.lovable\.app', allow_methods=["*"], allow_headers=["*"])
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


@app.on_event("startup")
async def startup():
    import asyncio as _aio
    result = await db.users.update_many(
        {"access_granted": {"$exists": False}},
        {"$set": {"access_granted": True}}
    )
    if result.modified_count:
        logger.info(f"Migration: backfilled access_granted=True on {result.modified_count} users")
    _aio.create_task(_scheduled_stream_reminder_loop())

@app.on_event("shutdown")
async def shutdown():
    client.close()
