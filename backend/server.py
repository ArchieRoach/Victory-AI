from fastapi import FastAPI, APIRouter, HTTPException, Depends, Response, Request
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

# Subscription Plans
SUBSCRIPTION_PLANS = {
    "monthly": {"price": 2.99, "name": "Monthly", "interval": "month"},
    "annual": {"price": 19.99, "name": "Annual", "interval": "year", "savings": "Save over 40%"}
}

# Create the main app
app = FastAPI(title="Victory AI API")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ============== MODELS ==============

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    experience_level: str = "Training under 6 months"
    primary_goal: str = "Get better overall"

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserUpdate(BaseModel):
    name: Optional[str] = None
    experience_level: Optional[str] = None
    primary_goal: Optional[str] = None

class UserResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    user_id: str
    email: str
    name: str
    experience_level: str
    primary_goal: str
    created_at: str
    picture: Optional[str] = None
    has_subscription: Optional[bool] = False
    subscription_status: Optional[str] = None
    fighter_buddy: Optional[Dict[str, Any]] = None
    quiz_completed: Optional[bool] = False

class QuizAnswers(BaseModel):
    training_goal: str
    training_frequency: str
    training_location: str
    biggest_frustration: str
    favorite_fighters: List[str]

class FighterBuddyCreate(BaseModel):
    name: str
    weight_class: str
    stance: str
    favorite_punch: str
    archetype: str

class FighterBuddyResponse(BaseModel):
    buddy_id: str
    name: str
    weight_class: str
    stance: str
    favorite_punch: str
    archetype: str
    personality: str
    avatar_url: Optional[str] = None
    created_at: str

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

class RoundData(BaseModel):
    round_number: int
    video_blob: Optional[str] = None
    duration_seconds: int
    feedback: Optional[Dict[str, Any]] = None
    dimension_scores: Optional[List[Dict[str, Any]]] = None

class SessionResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    session_id: str
    user_id: str
    date: str
    video_url: Optional[str] = None
    session_notes: Optional[str] = None
    overall_score: float
    dimension_scores: List[Dict[str, Any]]
    rounds: Optional[List[Dict[str, Any]]] = None
    created_at: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

# ============== FIGHTER BUDDY ARCHETYPES ==============

FIGHTER_ARCHETYPES = {
    "ukrainian_technician": {
        "name": "Ukrainian Technician",
        "inspired_by": "Oleksandr Usyk",
        "personality": "Calm, analytical southpaw who loves angles and outthinking opponents. Speaks with quiet confidence.",
        "feedback_style": "analytical",
        "catchphrases": ["Angles win fights.", "Think, then strike.", "Make them miss, make them pay."]
    },
    "relentless_pressure": {
        "name": "Relentless Pressure Fighter",
        "inspired_by": "Artur Beterbiev / Joe Frazier",
        "personality": "Aggressive body puncher who hates wasted movement. Intense and motivating.",
        "feedback_style": "intense",
        "catchphrases": ["Pressure breaks pipes!", "The body, the body!", "Never let them breathe!"]
    },
    "explosive_finisher": {
        "name": "Explosive Finisher",
        "inspired_by": "Naoya Inoue / Gervonta Davis",
        "personality": "Patient setup artist with devastating power. Speaks with cool confidence.",
        "feedback_style": "cool",
        "catchphrases": ["One shot, one kill.", "Set the trap.", "When you see it, throw it."]
    },
    "slick_counterpuncher": {
        "name": "Slick Counter-Puncher",
        "inspired_by": "Terence Crawford / Floyd Mayweather",
        "personality": "Defensive genius who makes opponents miss and pay. Smooth and calculating.",
        "feedback_style": "smooth",
        "catchphrases": ["Make them reach.", "Defense is art.", "Counter and coast."]
    },
    "complete_champion": {
        "name": "Complete Champion",
        "inspired_by": "Canelo Alvarez / Dmitrii Bivol",
        "personality": "Well-rounded master who adapts to any style. Confident but respectful.",
        "feedback_style": "balanced",
        "catchphrases": ["Adjust and dominate.", "Every round is a new fight.", "Champions find a way."]
    },
    "classic_great_ali": {
        "name": "Classic Great - The Greatest",
        "inspired_by": "Muhammad Ali",
        "personality": "Float like a butterfly, sting like a bee. Charismatic and poetic.",
        "feedback_style": "poetic",
        "catchphrases": ["Float and fly!", "Dance, baby, dance!", "Show them your beautiful moves!"]
    },
    "classic_great_tyson": {
        "name": "Classic Great - Iron Will",
        "inspired_by": "Mike Tyson",
        "personality": "Peek-a-boo intensity with explosive power. Direct and fierce.",
        "feedback_style": "fierce",
        "catchphrases": ["Head movement is life!", "Close the distance!", "Destroy with bad intentions!"]
    },
    "classic_great_hagler": {
        "name": "Classic Great - Marvelous",
        "inspired_by": "Marvin Hagler",
        "personality": "Destruct and destroy. Southpaw warrior with unmatched determination.",
        "feedback_style": "warrior",
        "catchphrases": ["War is won in the gym.", "Destruct and destroy.", "Southpaw supremacy."]
    },
    "modern_star_garcia": {
        "name": "Modern Star - Flash",
        "inspired_by": "Ryan Garcia",
        "personality": "Fast hands and flashy style. Young, energetic, and social media savvy.",
        "feedback_style": "energetic",
        "catchphrases": ["Speed kills!", "Let's go viral!", "Flash and dash!"]
    },
    "modern_star_benavidez": {
        "name": "Modern Star - Mexican Monster",
        "inspired_by": "David Benavidez",
        "personality": "High volume, relentless pressure. Proud Mexican warrior spirit.",
        "feedback_style": "proud",
        "catchphrases": ["Volume wins!", "Mexican pride!", "Work rate is everything!"]
    }
}

# ============== HARDCODED DATA ==============

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
    "Right Hook": {"name": "Short Hook Wall Drill", "description": "Stand 6 inches from a wall, throw right hooks without hitting it. Forces tightness."},
    "Uppercut": {"name": "Uppercut Dip Drill", "description": "Consciously bend knees before each uppercut. 4 sets of 20."},
    "Guard Position": {"name": "Hands-Up Shadowboxing", "description": "3 rounds where you consciously reset guard after every single punch."},
    "Head Movement": {"name": "Slip Rope Drill", "description": "Tie a rope at nose height and walk along it, slipping to each side repeatedly."},
    "Slip": {"name": "Partner Jab Slip", "description": "Have a partner throw soft jabs, slip outside every one. Or use a slip bag."},
    "Roll": {"name": "Roll Under the Hook", "description": "Hang a soft object at head height, practice rolling shoulder-to-shoulder under it. 50 reps."},
    "Parry": {"name": "Soft Jab Parry Drill", "description": "Partner throws light jabs, redirect them with open palm only. No blocking."},
    "Body Movement": {"name": "Exit Angle Drill", "description": "After every combination, pivot 45 degrees to a new angle. Force the habit."},
    "Footwork": {"name": "Box Step Pattern", "description": "Practice the square footwork pattern (forward, right, back, left) for 3 minutes without crossing feet."},
    "Combination Flow": {"name": "3-Punch Pause Drill", "description": "Throw 1-2-3 with a 1-second pause after each punch to check balance and guard."},
    "Ring Generalship": {"name": "Wall Drill", "description": "Practice cutting off the ring against a wall, pivoting to keep opponent 'cornered'."},
    "Punch Balance": {"name": "Combination and Freeze", "description": "Throw a 4-punch combo and freeze at the end. Check: are you in stance?"},
    "Punch Accuracy": {"name": "Slip Bag Accuracy", "description": "Tape an X on a slip bag and aim every punch at the X for 3 rounds."}
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
    payload = {
        "user_id": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRATION_DAYS),
        "iat": datetime.now(timezone.utc)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_jwt_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None

async def get_current_user(request: Request) -> dict:
    session_token = request.cookies.get("session_token")
    if not session_token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            session_token = auth_header.split(" ")[1]
    
    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Check OAuth session
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
    
    # Try JWT token
    payload = decode_jwt_token(session_token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    
    user = await db.users.find_one({"user_id": payload["user_id"]}, {"_id": 0, "password": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

async def get_current_user_with_subscription(request: Request) -> dict:
    """Get current user and check if they have an active subscription"""
    user = await get_current_user(request)
    
    # Check subscription status
    subscription = await db.subscriptions.find_one(
        {"user_id": user["user_id"], "status": {"$in": ["active", "trialing"]}},
        {"_id": 0}
    )
    
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
        "user_id": user_id,
        "email": user_data.email,
        "password": hash_password(user_data.password),
        "name": user_data.name,
        "experience_level": user_data.experience_level,
        "primary_goal": user_data.primary_goal,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "picture": None,
        "quiz_completed": False,
        "fighter_buddy": None
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
        try:
            auth_response = await client.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": session_id},
                timeout=10.0
            )
            if auth_response.status_code != 200:
                raise HTTPException(status_code=401, detail="Invalid session")
            auth_data = auth_response.json()
        except httpx.RequestError:
            raise HTTPException(status_code=500, detail="Auth service unavailable")
    
    email = auth_data.get("email")
    name = auth_data.get("name")
    picture = auth_data.get("picture")
    session_token = auth_data.get("session_token")
    
    existing_user = await db.users.find_one({"email": email}, {"_id": 0})
    
    if existing_user:
        user_id = existing_user["user_id"]
        await db.users.update_one({"user_id": user_id}, {"$set": {"name": name, "picture": picture}})
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        user_doc = {
            "user_id": user_id, "email": email, "name": name, "picture": picture,
            "experience_level": "Training under 6 months", "primary_goal": "Get better overall",
            "created_at": datetime.now(timezone.utc).isoformat(), "password": None,
            "quiz_completed": False, "fighter_buddy": None
        }
        await db.users.insert_one(user_doc)
    
    await db.user_sessions.delete_many({"user_id": user_id})
    await db.user_sessions.insert_one({
        "user_id": user_id, "session_token": session_token,
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
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

# ============== QUIZ ENDPOINTS ==============

@api_router.post("/quiz/submit")
async def submit_quiz(quiz_answers: QuizAnswers, user: dict = Depends(get_current_user)):
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {
            "quiz_answers": quiz_answers.model_dump(),
            "quiz_completed": True,
            "primary_goal": quiz_answers.training_goal
        }}
    )
    return {"message": "Quiz completed", "quiz_completed": True}

# ============== FIGHTER BUDDY ENDPOINTS ==============

@api_router.get("/fighter-buddy/archetypes")
async def get_archetypes():
    return {"archetypes": FIGHTER_ARCHETYPES}

@api_router.post("/fighter-buddy/create")
async def create_fighter_buddy(buddy_data: FighterBuddyCreate, user: dict = Depends(get_current_user)):
    archetype_info = FIGHTER_ARCHETYPES.get(buddy_data.archetype, FIGHTER_ARCHETYPES["complete_champion"])
    
    buddy_id = f"buddy_{uuid.uuid4().hex[:12]}"
    fighter_buddy = {
        "buddy_id": buddy_id,
        "name": buddy_data.name,
        "weight_class": buddy_data.weight_class,
        "stance": buddy_data.stance,
        "favorite_punch": buddy_data.favorite_punch,
        "archetype": buddy_data.archetype,
        "archetype_name": archetype_info["name"],
        "personality": archetype_info["personality"],
        "feedback_style": archetype_info["feedback_style"],
        "catchphrases": archetype_info["catchphrases"],
        "avatar_url": None,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"fighter_buddy": fighter_buddy}}
    )
    
    return fighter_buddy

@api_router.post("/fighter-buddy/generate-avatar")
async def generate_fighter_avatar(user: dict = Depends(get_current_user)):
    """Generate an AI avatar for the fighter buddy using Gemini Nano Banana"""
    fighter_buddy = user.get("fighter_buddy")
    if not fighter_buddy:
        raise HTTPException(status_code=400, detail="Create a fighter buddy first")
    
    if not EMERGENT_LLM_KEY:
        # Return placeholder if no API key
        placeholder_url = f"https://api.dicebear.com/7.x/bottts/svg?seed={fighter_buddy['buddy_id']}&backgroundColor=0A0A0F"
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {"$set": {"fighter_buddy.avatar_url": placeholder_url}}
        )
        return {"avatar_url": placeholder_url}
    
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        
        archetype_info = FIGHTER_ARCHETYPES.get(fighter_buddy["archetype"], {})
        prompt = f"""Create a stylized digital avatar portrait of a boxer character. The character should be:
- Name style: {fighter_buddy['name']}
- Weight class: {fighter_buddy['weight_class']}
- Stance: {fighter_buddy['stance']}
- Fighting style: {archetype_info.get('name', 'Complete Champion')}
- Personality: {archetype_info.get('personality', 'Confident fighter')}

Style: Modern digital art, athletic, confident pose, dark background with subtle electric lime (#E8FF47) accents. 
NO real person likenesses. Create an original character. Professional boxing aesthetic."""

        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"avatar_{fighter_buddy['buddy_id']}",
            system_message="You are an AI artist creating boxer character avatars."
        )
        chat.with_model("gemini", "gemini-3-pro-image-preview").with_params(modalities=["image", "text"])
        
        msg = UserMessage(text=prompt)
        text, images = await chat.send_message_multimodal_response(msg)
        
        if images and len(images) > 0:
            # Store base64 image data
            avatar_data = f"data:{images[0]['mime_type']};base64,{images[0]['data']}"
            await db.users.update_one(
                {"user_id": user["user_id"]},
                {"$set": {"fighter_buddy.avatar_url": avatar_data}}
            )
            return {"avatar_url": avatar_data}
        else:
            # Fallback to placeholder
            placeholder_url = f"https://api.dicebear.com/7.x/bottts/svg?seed={fighter_buddy['buddy_id']}&backgroundColor=0A0A0F"
            await db.users.update_one(
                {"user_id": user["user_id"]},
                {"$set": {"fighter_buddy.avatar_url": placeholder_url}}
            )
            return {"avatar_url": placeholder_url}
            
    except Exception as e:
        logger.error(f"Avatar generation error: {e}")
        placeholder_url = f"https://api.dicebear.com/7.x/bottts/svg?seed={fighter_buddy['buddy_id']}&backgroundColor=0A0A0F"
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {"$set": {"fighter_buddy.avatar_url": placeholder_url}}
        )
        return {"avatar_url": placeholder_url}

# ============== STRIPE PAYMENT ENDPOINTS ==============

@api_router.post("/payments/checkout")
async def create_checkout(checkout_req: CheckoutRequest, user: dict = Depends(get_current_user)):
    """Create Stripe checkout session for subscription"""
    from emergentintegrations.payments.stripe.checkout import StripeCheckout, CheckoutSessionRequest
    
    if checkout_req.plan_id not in SUBSCRIPTION_PLANS:
        raise HTTPException(status_code=400, detail="Invalid plan")
    
    plan = SUBSCRIPTION_PLANS[checkout_req.plan_id]
    
    host_url = checkout_req.origin_url.rstrip('/')
    success_url = f"{host_url}/payment/success?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{host_url}/paywall"
    webhook_url = f"{host_url}/api/webhook/stripe"
    
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
    
    checkout_request = CheckoutSessionRequest(
        amount=float(plan["price"]),
        currency="usd",
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={
            "user_id": user["user_id"],
            "plan_id": checkout_req.plan_id,
            "plan_name": plan["name"]
        }
    )
    
    session = await stripe_checkout.create_checkout_session(checkout_request)
    
    # Create payment transaction record
    await db.payment_transactions.insert_one({
        "transaction_id": f"txn_{uuid.uuid4().hex[:12]}",
        "user_id": user["user_id"],
        "session_id": session.session_id,
        "plan_id": checkout_req.plan_id,
        "amount": float(plan["price"]),
        "currency": "usd",
        "payment_status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    return {"checkout_url": session.url, "session_id": session.session_id}

@api_router.get("/payments/status/{session_id}")
async def get_payment_status(session_id: str, user: dict = Depends(get_current_user)):
    """Get payment status and update subscription if successful"""
    from emergentintegrations.payments.stripe.checkout import StripeCheckout
    
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url="")
    
    status = await stripe_checkout.get_checkout_status(session_id)
    
    # Update transaction record
    await db.payment_transactions.update_one(
        {"session_id": session_id},
        {"$set": {"payment_status": status.payment_status, "status": status.status}}
    )
    
    # If payment successful, create/update subscription
    if status.payment_status == "paid":
        transaction = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
        if transaction and not await db.subscriptions.find_one({"session_id": session_id}):
            plan_id = transaction.get("plan_id", "monthly")
            
            # Calculate trial end and subscription end
            trial_end = datetime.now(timezone.utc) + timedelta(days=7)
            if plan_id == "annual":
                subscription_end = trial_end + timedelta(days=365)
            else:
                subscription_end = trial_end + timedelta(days=30)
            
            await db.subscriptions.insert_one({
                "subscription_id": f"sub_{uuid.uuid4().hex[:12]}",
                "user_id": user["user_id"],
                "session_id": session_id,
                "plan_id": plan_id,
                "status": "trialing",
                "trial_end": trial_end.isoformat(),
                "current_period_end": subscription_end.isoformat(),
                "created_at": datetime.now(timezone.utc).isoformat()
            })
    
    return {
        "status": status.status,
        "payment_status": status.payment_status,
        "amount_total": status.amount_total,
        "currency": status.currency
    }

@api_router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    """Handle Stripe webhooks"""
    from emergentintegrations.payments.stripe.checkout import StripeCheckout
    
    body = await request.body()
    signature = request.headers.get("Stripe-Signature")
    
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url="")
    
    try:
        webhook_response = await stripe_checkout.handle_webhook(body, signature)
        
        if webhook_response.payment_status == "paid":
            user_id = webhook_response.metadata.get("user_id")
            plan_id = webhook_response.metadata.get("plan_id", "monthly")
            
            if user_id:
                # Update subscription status
                await db.subscriptions.update_one(
                    {"user_id": user_id},
                    {"$set": {"status": "active"}}
                )
        
        return {"received": True}
    except Exception as e:
        logger.error(f"Webhook error: {e}")
        return {"received": True}

@api_router.get("/subscription/status")
async def get_subscription_status(user: dict = Depends(get_current_user)):
    """Get user's subscription status"""
    subscription = await db.subscriptions.find_one(
        {"user_id": user["user_id"]},
        {"_id": 0}
    )
    
    if not subscription:
        return {"has_subscription": False, "status": None}
    
    return {
        "has_subscription": subscription["status"] in ["active", "trialing"],
        "status": subscription["status"],
        "plan_id": subscription.get("plan_id"),
        "trial_end": subscription.get("trial_end"),
        "current_period_end": subscription.get("current_period_end")
    }

# ============== AI FEEDBACK ENDPOINTS ==============

@api_router.post("/ai/generate-feedback")
async def generate_round_feedback(request: Request, user: dict = Depends(get_current_user)):
    """Generate AI feedback for a training round using Gemini 3 Flash"""
    body = await request.json()
    round_number = body.get("round_number", 1)
    total_rounds = body.get("total_rounds", 3)
    
    fighter_buddy = user.get("fighter_buddy")
    if not fighter_buddy:
        # Use default feedback style
        feedback_style = "balanced"
        buddy_name = "Your Coach"
        catchphrases = ["Keep it up!", "Stay focused!", "Looking good!"]
    else:
        feedback_style = fighter_buddy.get("feedback_style", "balanced")
        buddy_name = fighter_buddy.get("name", "Your Buddy")
        catchphrases = fighter_buddy.get("catchphrases", ["Keep it up!"])
    
    # Generate simulated scores for key dimensions
    key_dimensions = ["Jab", "Cross", "Guard Position", "Head Movement", "Footwork", "Combination Flow"]
    dimension_scores = []
    for dim in key_dimensions:
        score = random.randint(4, 9)
        dimension_scores.append({"dimension_name": dim, "score": score})
    
    # Sort to find lowest scores
    sorted_scores = sorted(dimension_scores, key=lambda x: x["score"])
    lowest = sorted_scores[0]
    
    if not EMERGENT_LLM_KEY:
        # Template-based feedback
        feedback = {
            "buddy_name": buddy_name,
            "round_number": round_number,
            "what_you_did_well": f"Great {sorted_scores[-1]['dimension_name'].lower()} this round! {random.choice(catchphrases)}",
            "what_to_tighten": f"Your {lowest['dimension_name'].lower()} could use some work. Focus on it next round.",
            "drill_focus": f"Later, work on '{DRILLS[lowest['dimension_name']]['name']}' for 3 rounds.",
            "dimension_scores": dimension_scores
        }
        return feedback
    
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        
        style_prompts = {
            "analytical": "Be calm and analytical. Use precise technical language.",
            "intense": "Be intense and motivating. Use short punchy sentences.",
            "cool": "Be cool and confident. Speak like a patient setup artist.",
            "smooth": "Be smooth and calculating. Emphasize defense and timing.",
            "balanced": "Be balanced and encouraging. Mix technical advice with motivation.",
            "poetic": "Be charismatic and poetic. Use metaphors and rhythm.",
            "fierce": "Be direct and fierce. Emphasize aggression and bad intentions.",
            "warrior": "Be determined like a warrior. Emphasize hard work and discipline.",
            "energetic": "Be young and energetic. Use modern slang and enthusiasm.",
            "proud": "Be proud and motivating. Emphasize work ethic and volume."
        }
        
        system_message = f"""You are {buddy_name}, a boxing training buddy. 
{style_prompts.get(feedback_style, style_prompts['balanced'])}
Your catchphrases include: {', '.join(catchphrases[:2])}.
Keep responses SHORT - 1-2 sentences each. Be encouraging but honest."""

        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"feedback_{user['user_id']}_{round_number}",
            system_message=system_message
        )
        chat.with_model("gemini", "gemini-3-flash-preview")
        
        prompt = f"""Round {round_number} of {total_rounds} just ended. 
The boxer's scores: {', '.join([f"{d['dimension_name']}: {d['score']}/10" for d in dimension_scores])}.

Give 3 bullet points:
1. What they did well (mention their best score: {sorted_scores[-1]['dimension_name']})
2. What to tighten next round (mention their lowest: {lowest['dimension_name']})
3. One drill to focus on this week for {lowest['dimension_name']}

Be specific, encouraging, and in character. Use one of your catchphrases naturally."""

        msg = UserMessage(text=prompt)
        response = await chat.send_message(msg)
        
        # Parse the response into structured feedback
        lines = response.strip().split('\n')
        what_well = lines[0] if len(lines) > 0 else f"Great {sorted_scores[-1]['dimension_name'].lower()}!"
        what_tighten = lines[1] if len(lines) > 1 else f"Work on your {lowest['dimension_name'].lower()}."
        drill_focus = lines[2] if len(lines) > 2 else f"Try '{DRILLS[lowest['dimension_name']]['name']}'."
        
        feedback = {
            "buddy_name": buddy_name,
            "round_number": round_number,
            "what_you_did_well": what_well.lstrip('1.-• '),
            "what_to_tighten": what_tighten.lstrip('2.-• '),
            "drill_focus": drill_focus.lstrip('3.-• '),
            "dimension_scores": dimension_scores
        }
        return feedback
        
    except Exception as e:
        logger.error(f"AI feedback error: {e}")
        # Fallback template
        return {
            "buddy_name": buddy_name,
            "round_number": round_number,
            "what_you_did_well": f"Great {sorted_scores[-1]['dimension_name'].lower()} this round! {random.choice(catchphrases)}",
            "what_to_tighten": f"Your {lowest['dimension_name'].lower()} could use some work.",
            "drill_focus": f"Later, work on '{DRILLS[lowest['dimension_name']]['name']}' for 3 rounds.",
            "dimension_scores": dimension_scores
        }

# ============== TRAINING SESSION ENDPOINTS ==============

@api_router.post("/training/start")
async def start_training_session(session_config: TrainingSessionCreate, user: dict = Depends(get_current_user)):
    """Start a new training session"""
    session_id = f"train_{uuid.uuid4().hex[:12]}"
    
    session_doc = {
        "session_id": session_id,
        "user_id": user["user_id"],
        "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "round_duration": session_config.round_duration,
        "rest_duration": session_config.rest_duration,
        "total_rounds": session_config.total_rounds,
        "record_video": session_config.record_video,
        "rounds": [],
        "status": "in_progress",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.training_sessions.insert_one(session_doc)
    
    return {"session_id": session_id, "status": "started"}

@api_router.post("/training/{session_id}/round")
async def save_round_data(session_id: str, round_data: RoundData, user: dict = Depends(get_current_user)):
    """Save data for a completed round"""
    session = await db.training_sessions.find_one(
        {"session_id": session_id, "user_id": user["user_id"]},
        {"_id": 0}
    )
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    round_doc = {
        "round_number": round_data.round_number,
        "duration_seconds": round_data.duration_seconds,
        "feedback": round_data.feedback,
        "dimension_scores": round_data.dimension_scores,
        "has_video": round_data.video_blob is not None,
        "completed_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Store video separately if provided (in production, upload to cloud storage)
    if round_data.video_blob:
        await db.round_videos.insert_one({
            "session_id": session_id,
            "round_number": round_data.round_number,
            "video_data": round_data.video_blob[:100] + "...",  # Truncate for storage
            "created_at": datetime.now(timezone.utc).isoformat()
        })
    
    await db.training_sessions.update_one(
        {"session_id": session_id},
        {"$push": {"rounds": round_doc}}
    )
    
    return {"message": "Round saved", "round_number": round_data.round_number}

@api_router.post("/training/{session_id}/complete")
async def complete_training_session(session_id: str, user: dict = Depends(get_current_user)):
    """Complete a training session and generate final scores"""
    session = await db.training_sessions.find_one(
        {"session_id": session_id, "user_id": user["user_id"]},
        {"_id": 0}
    )
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Aggregate scores from all rounds
    all_scores = {}
    for round_data in session.get("rounds", []):
        for score in round_data.get("dimension_scores", []):
            dim = score["dimension_name"]
            if dim not in all_scores:
                all_scores[dim] = []
            all_scores[dim].append(score["score"])
    
    # Average scores per dimension
    final_dimension_scores = []
    for dim in DIMENSIONS:
        if dim in all_scores:
            avg = sum(all_scores[dim]) / len(all_scores[dim])
            final_dimension_scores.append({"dimension_name": dim, "score": round(avg)})
        else:
            # Generate random score for dimensions not tracked
            final_dimension_scores.append({"dimension_name": dim, "score": random.randint(5, 8)})
    
    # Calculate overall score
    scores = [d["score"] for d in final_dimension_scores if d["score"]]
    overall_score = sum(scores) / len(scores) if scores else 6.0
    
    # Create session record (for history)
    session_record = {
        "session_id": session_id,
        "user_id": user["user_id"],
        "date": session["date"],
        "overall_score": round(overall_score, 1),
        "dimension_scores": final_dimension_scores,
        "rounds": session.get("rounds", []),
        "training_config": {
            "round_duration": session["round_duration"],
            "rest_duration": session["rest_duration"],
            "total_rounds": session["total_rounds"]
        },
        "created_at": session["created_at"],
        "completed_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.sessions.insert_one(session_record)
    
    # Update training session status
    await db.training_sessions.update_one(
        {"session_id": session_id},
        {"$set": {"status": "completed", "overall_score": round(overall_score, 1)}}
    )
    
    return SessionResponse(**session_record)

# ============== SESSION ENDPOINTS ==============

@api_router.get("/sessions", response_model=List[SessionResponse])
async def get_sessions(user: dict = Depends(get_current_user), limit: int = 100):
    sessions = await db.sessions.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return [SessionResponse(**s) for s in sessions]

@api_router.get("/sessions/{session_id}", response_model=SessionResponse)
async def get_session(session_id: str, user: dict = Depends(get_current_user)):
    session = await db.sessions.find_one({"session_id": session_id, "user_id": user["user_id"]}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return SessionResponse(**session)

@api_router.put("/users/me")
async def update_profile(update_data: UserUpdate, user: dict = Depends(get_current_user)):
    update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}
    if update_dict:
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": update_dict})
    updated_user = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "password": 0})
    if isinstance(updated_user.get("created_at"), datetime):
        updated_user["created_at"] = updated_user["created_at"].isoformat()
    return updated_user

@api_router.get("/users/stats")
async def get_user_stats(user: dict = Depends(get_current_user)):
    sessions = await db.sessions.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(1000)
    total_sessions = len(sessions)
    best_score = max([s.get("overall_score", 0) for s in sessions]) if sessions else 0
    return {"total_sessions": total_sessions, "best_score": round(best_score, 1), "most_improved_dimension": None}

# ============== STATIC DATA ENDPOINTS ==============

@api_router.get("/dimensions")
async def get_dimensions():
    return {"dimensions": DIMENSIONS, "groups": {
        "Offensive Technique": ["Jab", "Cross", "Left Hook", "Right Hook", "Uppercut", "Combination Flow", "Punch Balance", "Punch Accuracy"],
        "Defensive Technique": ["Guard Position", "Head Movement", "Slip", "Roll", "Parry", "Body Movement"],
        "Movement & Ring Craft": ["Footwork", "Ring Generalship"]
    }}

@api_router.get("/drills")
async def get_drills():
    return DRILLS

@api_router.get("/drills/{dimension}")
async def get_drill_for_dimension(dimension: str):
    if dimension not in DRILLS:
        raise HTTPException(status_code=404, detail="Dimension not found")
    return {"dimension": dimension, **DRILLS[dimension]}

@api_router.get("/legends")
async def get_legends(filter: Optional[str] = None):
    if filter and filter != "All":
        filtered = []
        for legend in LEGENDS:
            if filter == "Offensive" and any(d in legend["dimensions"] for d in ["Jab", "Cross", "Left Hook", "Right Hook", "Uppercut", "Combination Flow"]):
                filtered.append(legend)
            elif filter == "Defensive" and any(d in legend["dimensions"] for d in ["Guard Position", "Head Movement", "Slip", "Roll", "Parry", "Body Movement"]):
                filtered.append(legend)
            elif filter == "Footwork & Movement" and any(d in legend["dimensions"] for d in ["Footwork", "Ring Generalship"]):
                filtered.append(legend)
            elif filter == "Combinations" and "Combination Flow" in legend["dimensions"]:
                filtered.append(legend)
        return filtered
    return LEGENDS

@api_router.get("/plans")
async def get_subscription_plans():
    return {"plans": SUBSCRIPTION_PLANS}

@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.now(timezone.utc).isoformat()}

# Include the router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
