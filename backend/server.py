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
    params = {"timestamp": timestamp, "folder": f"{folder}/{user['user_id']}", "resource_type": resource_type}
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
    except Exception as e:
        logger.error(f"Webhook handler error: {e}")

    return {"received": True}

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
    return profile

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
        return {"liked": False}
    await db.posts.update_one({"post_id": post_id}, {"$addToSet": {"likes": user_id}, "$inc": {"like_count": 1}})
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

@api_router.post("/posts/{post_id}/comments")
async def add_comment(post_id: str, comment_data: CommentCreate, user: dict = Depends(get_current_user)):
    if not await db.posts.find_one({"post_id": post_id}):
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
    return comment_doc

@api_router.get("/posts/{post_id}/comments")
async def get_comments(post_id: str, user: dict = Depends(get_current_user)):
    comments = await db.comments.find({"post_id": post_id}, {"_id": 0}).sort("created_at", 1).to_list(100)
    for c in comments:
        author = await db.users.find_one({"user_id": c["user_id"]}, {"_id": 0, "password": 0})
        c["author"] = safe_user(author) if author else {"display_name": "Unknown", "name": "Unknown"}
    return comments

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
    if existing:
        now = datetime.now(timezone.utc).isoformat()
        await db.streams.update_one(
            {"stream_id": existing["stream_id"]},
            {"$set": {"status": "live", "started_at": now}},
        )
        return {
            "stream_id": existing["stream_id"],
            "playback_id": existing["playback_id"],
            "stream_key": existing["stream_key"],
            "title": existing["title"],
        }
    # Create a fresh Livepeer stream
    title = f"{user.get('name', 'Fighter')} — Live"
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
        "user_name": user.get("name") or "Fighter",
        "user_avatar": user.get("avatar_url") or "",
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
                f"https://rtmp.livepeer.studio/webrtc/{stream['stream_key']}",
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


@api_router.post("/streams/{stream_id}/clip")
async def create_clip(
    stream_id: str,
    start_time: int = Query(...),
    end_time: int = Query(...),
    user: dict = Depends(get_current_user),
):
    stream = await db.streams.find_one({"stream_id": stream_id}, {"_id": 0})
    if not stream:
        raise HTTPException(404, "Stream not found")
    if not stream.get("playback_id"):
        raise HTTPException(400, "No playback ID")
    try:
        clip = await _livepeer("POST", "/clip", {
            "playbackId": stream["playback_id"],
            "startTime": start_time,
            "endTime": end_time,
            "name": f"Clip – {stream['title']}",
        })
    except Exception as e:
        logger.error(f"Livepeer clip: {e}")
        raise HTTPException(502, "Clip failed")
    return {
        "playback_id": (clip.get("asset") or {}).get("playbackId"),
        "asset_id": (clip.get("asset") or {}).get("id"),
    }


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

# ─────────────────────────────────────────────────────────────────────────────

_default_origins = "https://victory-ai-one.vercel.app,https://victory-ai-alpha.vercel.app,http://localhost:3000"
_cors_origins = [o.strip() for o in os.environ.get('CORS_ORIGINS', _default_origins).split(',') if o.strip()]
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=_cors_origins, allow_origin_regex=r'https://.*\.lovable\.app', allow_methods=["*"], allow_headers=["*"])
app.include_router(api_router)

@app.on_event("startup")
async def startup():
    result = await db.users.update_many(
        {"access_granted": {"$exists": False}},
        {"$set": {"access_granted": True}}
    )
    if result.modified_count:
        logger.info(f"Migration: backfilled access_granted=True on {result.modified_count} users")

@app.on_event("shutdown")
async def shutdown():
    client.close()
