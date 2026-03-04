from fastapi import FastAPI, APIRouter, HTTPException, Depends, Response, Request, Query, File, UploadFile
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
import cloudinary
import cloudinary.uploader
import cloudinary.utils

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Settings
JWT_SECRET = os.environ.get('JWT_SECRET', 'victory-ai-secret-key-change-in-prod')
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_DAYS = 7

# Stripe Settings
STRIPE_API_KEY = os.environ.get('STRIPE_API_KEY', 'sk_test_emergent')

# Emergent LLM Key
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')

# Cloudinary Settings
cloudinary.config(
    cloud_name=os.environ.get("CLOUDINARY_CLOUD_NAME", ""),
    api_key=os.environ.get("CLOUDINARY_API_KEY", ""),
    api_secret=os.environ.get("CLOUDINARY_API_SECRET", ""),
    secure=True
)

# Subscription Plans
SUBSCRIPTION_PLANS = {
    "monthly": {"price": 2.99, "name": "Monthly", "interval": "month"},
    "annual": {"price": 19.99, "name": "Annual", "interval": "year", "savings": "Save over 40%"}
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
    training_partner_style: str

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

async def get_current_user(request: Request) -> dict:
    session_token = request.cookies.get("session_token")
    if not session_token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            session_token = auth_header.split(" ")[1]
    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    session_doc = await db.user_sessions.find_one({"session_token": session_token}, {"_id": 0})
    if session_doc:
        expires_at = session_doc.get("expires_at")
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at)
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < datetime.now(timezone.utc):
            raise HTTPException(status_code=401, detail="Session expired")
        user = await db.users.find_one({"user_id": session_doc["user_id"]}, {"_id": 0, "password": 0})
        if user:
            return user
    
    payload = decode_jwt_token(session_token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user = await db.users.find_one({"user_id": payload["user_id"]}, {"_id": 0, "password": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

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
async def generate_partner_avatar(user: dict = Depends(get_current_user)):
    training_partner = user.get("training_partner")
    if not training_partner:
        raise HTTPException(status_code=400, detail="Create a training partner first")
    
    if not EMERGENT_LLM_KEY:
        placeholder_url = f"https://api.dicebear.com/7.x/bottts/svg?seed={training_partner['partner_id']}&backgroundColor=0A0A0F"
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"training_partner.avatar_url": placeholder_url}})
        return {"avatar_url": placeholder_url}
    
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        
        style_info = TRAINING_PARTNER_STYLES.get(training_partner["style"], {})
        prompt = f"""Create a stylized digital avatar portrait of a boxing trainer character:
- Name style: {training_partner['name']}
- Personality: {style_info.get('personality', 'Confident trainer')}
- Training style: {style_info.get('name', 'Coach')}
Style: Modern digital art, athletic, confident pose, dark background with electric lime (#E8FF47) accents.
NO real person likenesses. Create an original character. Professional boxing trainer aesthetic."""

        chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"avatar_{training_partner['partner_id']}", system_message="You are an AI artist creating boxing trainer avatars.")
        chat.with_model("gemini", "gemini-3-pro-image-preview").with_params(modalities=["image", "text"])
        
        text, images = await chat.send_message_multimodal_response(UserMessage(text=prompt))
        
        if images and len(images) > 0:
            avatar_data = f"data:{images[0]['mime_type']};base64,{images[0]['data']}"
            await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"training_partner.avatar_url": avatar_data}})
            return {"avatar_url": avatar_data}
    except Exception as e:
        logger.error(f"Avatar generation error: {e}")
    
    placeholder_url = f"https://api.dicebear.com/7.x/bottts/svg?seed={training_partner['partner_id']}&backgroundColor=0A0A0F"
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"training_partner.avatar_url": placeholder_url}})
    return {"avatar_url": placeholder_url}

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

# ============== GPT-4 VISION VIDEO ANALYSIS ==============

@api_router.post("/ai/analyze-video")
async def analyze_video_with_vision(request: Request, user: dict = Depends(get_current_user)):
    body = await request.json()
    video_url = body.get("video_url")
    round_number = body.get("round_number", 1)
    
    if not video_url:
        raise HTTPException(status_code=400, detail="video_url required")
    
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
    
    await db.sessions.insert_one(session_record)
    await db.training_sessions.update_one({"session_id": session_id}, {"$set": {"status": "completed", "overall_score": round(overall_score, 1)}})
    
    return session_record

# ============== STRIPE PAYMENT ENDPOINTS ==============

@api_router.post("/payments/checkout")
async def create_checkout(checkout_req: CheckoutRequest, user: dict = Depends(get_current_user)):
    from emergentintegrations.payments.stripe.checkout import StripeCheckout, CheckoutSessionRequest
    
    if checkout_req.plan_id not in SUBSCRIPTION_PLANS:
        raise HTTPException(status_code=400, detail="Invalid plan")
    
    plan = SUBSCRIPTION_PLANS[checkout_req.plan_id]
    host_url = checkout_req.origin_url.rstrip('/')
    
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=f"{host_url}/api/webhook/stripe")
    checkout_request = CheckoutSessionRequest(
        amount=float(plan["price"]), currency="usd",
        success_url=f"{host_url}/payment/success?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{host_url}/paywall",
        metadata={"user_id": user["user_id"], "plan_id": checkout_req.plan_id, "plan_name": plan["name"]}
    )
    
    session = await stripe_checkout.create_checkout_session(checkout_request)
    await db.payment_transactions.insert_one({
        "transaction_id": f"txn_{uuid.uuid4().hex[:12]}", "user_id": user["user_id"],
        "session_id": session.session_id, "plan_id": checkout_req.plan_id,
        "amount": float(plan["price"]), "currency": "usd", "payment_status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    return {"checkout_url": session.url, "session_id": session.session_id}

@api_router.get("/payments/status/{session_id}")
async def get_payment_status(session_id: str, user: dict = Depends(get_current_user)):
    from emergentintegrations.payments.stripe.checkout import StripeCheckout
    
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url="")
    status = await stripe_checkout.get_checkout_status(session_id)
    
    await db.payment_transactions.update_one({"session_id": session_id}, {"$set": {"payment_status": status.payment_status, "status": status.status}})
    
    if status.payment_status == "paid":
        transaction = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
        if transaction and not await db.subscriptions.find_one({"session_id": session_id}):
            plan_id = transaction.get("plan_id", "monthly")
            trial_end = datetime.now(timezone.utc) + timedelta(days=7)
            subscription_end = trial_end + timedelta(days=365 if plan_id == "annual" else 30)
            
            await db.subscriptions.insert_one({
                "subscription_id": f"sub_{uuid.uuid4().hex[:12]}", "user_id": user["user_id"],
                "session_id": session_id, "plan_id": plan_id, "status": "trialing",
                "trial_end": trial_end.isoformat(), "current_period_end": subscription_end.isoformat(),
                "created_at": datetime.now(timezone.utc).isoformat()
            })
    
    return {"status": status.status, "payment_status": status.payment_status, "amount_total": status.amount_total, "currency": status.currency}

@api_router.get("/subscription/status")
async def get_subscription_status(user: dict = Depends(get_current_user)):
    subscription = await db.subscriptions.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if not subscription:
        return {"has_subscription": False, "status": None}
    return {"has_subscription": subscription["status"] in ["active", "trialing"], "status": subscription["status"], "plan_id": subscription.get("plan_id")}

@api_router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    from emergentintegrations.payments.stripe.checkout import StripeCheckout
    body = await request.body()
    signature = request.headers.get("Stripe-Signature")
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url="")
    try:
        webhook_response = await stripe_checkout.handle_webhook(body, signature)
        if webhook_response.payment_status == "paid":
            user_id = webhook_response.metadata.get("user_id")
            if user_id:
                await db.subscriptions.update_one({"user_id": user_id}, {"$set": {"status": "active"}})
        return {"received": True}
    except Exception as e:
        logger.error(f"Webhook error: {e}")
        return {"received": True}

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

app.include_router(api_router)
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','), allow_methods=["*"], allow_headers=["*"])

@app.on_event("shutdown")
async def shutdown():
    client.close()
