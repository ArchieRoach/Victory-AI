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

class DimensionScoreInput(BaseModel):
    dimension_name: str
    score: Optional[int] = None  # 1-10 or null if skipped

class SessionCreate(BaseModel):
    video_url: Optional[str] = None
    session_notes: Optional[str] = None
    date: Optional[str] = None
    dimension_scores: List[DimensionScoreInput]

class SessionUpdate(BaseModel):
    video_url: Optional[str] = None
    session_notes: Optional[str] = None
    dimension_scores: Optional[List[DimensionScoreInput]] = None

class SessionResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    session_id: str
    user_id: str
    date: str
    video_url: Optional[str] = None
    session_notes: Optional[str] = None
    overall_score: float
    dimension_scores: List[Dict[str, Any]]
    created_at: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

# ============== HARDCODED DATA ==============

DIMENSIONS = [
    "Jab", "Cross", "Left Hook", "Right Hook", "Uppercut",
    "Guard Position", "Head Movement", "Footwork", "Slip", "Roll",
    "Parry", "Body Movement", "Combination Flow", "Ring Generalship",
    "Punch Balance", "Punch Accuracy"
]

DIMENSION_RUBRICS = {
    "Jab": "Extension, snap, and return speed — are you recovering guard after every jab?",
    "Cross": "Hip rotation driving power — does your weight transfer fully?",
    "Left Hook": "Elbow parallel to floor, pivot from hips — not just an arm swing",
    "Right Hook": "Short arc, tight rotation — watch for overextension",
    "Uppercut": "Knees dipping to load power, fist scooping upward — not a looping swing",
    "Combination Flow": "Transitions between punches — smooth or choppy? Each punch sets up the next",
    "Punch Balance": "Are you off-balance after combinations, or back in stance quickly?",
    "Punch Accuracy": "Are punches landing where you aimed, or are they sailing wide?",
    "Guard Position": "Hands at cheekbone height, elbows in — consistent between punches?",
    "Head Movement": "Moving your head off centreline before and after punching",
    "Slip": "Rotating outside the punch line, not just ducking",
    "Roll": "Full shoulder-to-shoulder roll under hooks — smooth continuous motion",
    "Parry": "Redirecting punches with open hand, not blocking or stopping them",
    "Body Movement": "Angling off after punching — not standing flat in front of opponent",
    "Footwork": "Weight centred, not flat-footed — pivoting and stepping without crossing feet",
    "Ring Generalship": "Controlling distance, cutting off the ring, dictating where the fight happens"
}

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
    {
        "name": "Muhammad Ali",
        "nickname": "The Greatest",
        "era": "1960s-1980s",
        "dimensions": ["Footwork", "Body Movement", "Ring Generalship"],
        "description": "Ali's perpetual motion created angles his opponents couldn't solve — he was never where you expected.",
        "youtube_search": "Muhammad Ali footwork technique breakdown"
    },
    {
        "name": "Mike Tyson",
        "nickname": "Iron Mike",
        "era": "1980s-2000s",
        "dimensions": ["Head Movement", "Roll", "Body Movement", "Combination Flow"],
        "description": "Tyson's peek-a-boo style required constant rolling movement, making him a small target while closing distance.",
        "youtube_search": "Mike Tyson peek-a-boo style technique"
    },
    {
        "name": "Floyd Mayweather Jr.",
        "nickname": "Money / Pretty Boy",
        "era": "1990s-2010s",
        "dimensions": ["Parry", "Guard Position", "Slip", "Ring Generalship"],
        "description": "Mayweather's shoulder roll defence turns opponent power into wasted energy — study how he smothers punches.",
        "youtube_search": "Floyd Mayweather shoulder roll defense"
    },
    {
        "name": "Sugar Ray Leonard",
        "nickname": "Sugar Ray",
        "era": "1970s-1990s",
        "dimensions": ["Combination Flow", "Footwork", "Ring Generalship"],
        "description": "Leonard combined hand speed with constant lateral movement — combinations always came with an exit angle.",
        "youtube_search": "Sugar Ray Leonard combinations technique"
    },
    {
        "name": "Pernell Whitaker",
        "nickname": "Sweet Pea",
        "era": "1980s-2000s",
        "dimensions": ["Slip", "Head Movement", "Roll", "Body Movement"],
        "description": "The most elusive defensive master in boxing history — watch how little space his head movement actually covers.",
        "youtube_search": "Pernell Whitaker defense technique breakdown"
    },
    {
        "name": "Manny Pacquiao",
        "nickname": "Pac-Man",
        "era": "1990s-2020s",
        "dimensions": ["Footwork", "Left Hook", "Combination Flow", "Punch Balance"],
        "description": "Pacquiao's southpaw angles created openings that orthodox fighters never saw coming.",
        "youtube_search": "Manny Pacquiao southpaw technique"
    },
    {
        "name": "Joe Frazier",
        "nickname": "Smokin' Joe",
        "era": "1960s-1980s",
        "dimensions": ["Head Movement", "Roll", "Combination Flow", "Body Movement"],
        "description": "Frazier's constant forward pressure came from disciplined head movement — he bobbed into range, never walked straight in.",
        "youtube_search": "Joe Frazier bob and weave technique"
    },
    {
        "name": "Roy Jones Jr.",
        "nickname": "RJJ",
        "era": "1980s-2010s",
        "dimensions": ["Punch Accuracy", "Combination Flow", "Footwork", "Guard Position"],
        "description": "Jones proved unorthodox guard can work if movement and reflexes compensate — study WHY it worked, not just what it looks like.",
        "youtube_search": "Roy Jones Jr technique breakdown"
    }
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
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None

async def get_current_user(request: Request) -> dict:
    # Check cookie first
    session_token = request.cookies.get("session_token")
    
    # Then check Authorization header
    if not session_token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            session_token = auth_header.split(" ")[1]
    
    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Check if it's a Google OAuth session token
    session_doc = await db.user_sessions.find_one(
        {"session_token": session_token},
        {"_id": 0}
    )
    
    if session_doc:
        # Check expiry
        expires_at = session_doc.get("expires_at")
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at)
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < datetime.now(timezone.utc):
            raise HTTPException(status_code=401, detail="Session expired")
        
        user = await db.users.find_one(
            {"user_id": session_doc["user_id"]},
            {"_id": 0, "password": 0}
        )
        if user:
            return user
    
    # Try JWT token
    payload = decode_jwt_token(session_token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    
    user = await db.users.find_one(
        {"user_id": payload["user_id"]},
        {"_id": 0, "password": 0}
    )
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    
    return user

# ============== AUTH ENDPOINTS ==============

@api_router.post("/auth/register", response_model=TokenResponse)
async def register(user_data: UserCreate, response: Response):
    # Check if email exists
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
        "picture": None
    }
    
    await db.users.insert_one(user_doc)
    
    token = create_jwt_token(user_id)
    response.set_cookie(
        key="session_token",
        value=token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=JWT_EXPIRATION_DAYS * 24 * 60 * 60
    )
    
    return TokenResponse(access_token=token)

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(user_data: UserLogin, response: Response):
    user = await db.users.find_one({"email": user_data.email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    if not verify_password(user_data.password, user.get("password", "")):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    token = create_jwt_token(user["user_id"])
    response.set_cookie(
        key="session_token",
        value=token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=JWT_EXPIRATION_DAYS * 24 * 60 * 60
    )
    
    return TokenResponse(access_token=token)

@api_router.post("/auth/session")
async def exchange_session(request: Request, response: Response):
    """Exchange Google OAuth session_id for user data and set cookie"""
    body = await request.json()
    session_id = body.get("session_id")
    
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id required")
    
    # Call Emergent Auth to get session data
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
    
    # Find or create user
    existing_user = await db.users.find_one({"email": email}, {"_id": 0})
    
    if existing_user:
        user_id = existing_user["user_id"]
        # Update user info if needed
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": name, "picture": picture}}
        )
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        user_doc = {
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "experience_level": "Training under 6 months",
            "primary_goal": "Get better overall",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "password": None
        }
        await db.users.insert_one(user_doc)
    
    # Store session
    await db.user_sessions.delete_many({"user_id": user_id})
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    # Set cookie
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=7 * 24 * 60 * 60
    )
    
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password": 0})
    return user

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(user: dict = Depends(get_current_user)):
    if isinstance(user.get("created_at"), datetime):
        user["created_at"] = user["created_at"].isoformat()
    return UserResponse(**user)

@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    session_token = request.cookies.get("session_token")
    if session_token:
        await db.user_sessions.delete_many({"session_token": session_token})
    
    response.delete_cookie(key="session_token", path="/")
    return {"message": "Logged out successfully"}

# ============== USER ENDPOINTS ==============

@api_router.put("/users/me", response_model=UserResponse)
async def update_profile(update_data: UserUpdate, user: dict = Depends(get_current_user)):
    update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}
    
    if update_dict:
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {"$set": update_dict}
        )
    
    updated_user = await db.users.find_one(
        {"user_id": user["user_id"]},
        {"_id": 0, "password": 0}
    )
    if isinstance(updated_user.get("created_at"), datetime):
        updated_user["created_at"] = updated_user["created_at"].isoformat()
    return UserResponse(**updated_user)

@api_router.get("/users/stats")
async def get_user_stats(user: dict = Depends(get_current_user)):
    """Get user statistics summary"""
    sessions = await db.sessions.find(
        {"user_id": user["user_id"]},
        {"_id": 0}
    ).to_list(1000)
    
    total_sessions = len(sessions)
    best_score = 0
    most_improved_dimension = None
    
    if sessions:
        scores = [s.get("overall_score", 0) for s in sessions]
        best_score = max(scores) if scores else 0
        
        # Calculate most improved dimension
        if len(sessions) >= 2:
            first_session = sessions[0]
            last_session = sessions[-1]
            
            first_scores = {d["dimension_name"]: d.get("score", 0) for d in first_session.get("dimension_scores", [])}
            last_scores = {d["dimension_name"]: d.get("score", 0) for d in last_session.get("dimension_scores", [])}
            
            improvements = {}
            for dim in DIMENSIONS:
                first = first_scores.get(dim, 0) or 0
                last = last_scores.get(dim, 0) or 0
                improvements[dim] = last - first
            
            if improvements:
                most_improved_dimension = max(improvements, key=improvements.get)
    
    return {
        "total_sessions": total_sessions,
        "best_score": round(best_score, 1),
        "most_improved_dimension": most_improved_dimension
    }

# ============== SESSION ENDPOINTS ==============

@api_router.post("/sessions", response_model=SessionResponse)
async def create_session(session_data: SessionCreate, user: dict = Depends(get_current_user)):
    # Validate at least 5 dimensions scored
    scored_count = sum(1 for d in session_data.dimension_scores if d.score is not None)
    if scored_count < 5:
        raise HTTPException(
            status_code=400,
            detail=f"Score at least 5 dimensions to get meaningful recommendations. You've scored {scored_count} so far."
        )
    
    # Calculate overall score
    scores = [d.score for d in session_data.dimension_scores if d.score is not None]
    overall_score = sum(scores) / len(scores) if scores else 0
    
    session_id = f"session_{uuid.uuid4().hex[:12]}"
    session_date = session_data.date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    session_doc = {
        "session_id": session_id,
        "user_id": user["user_id"],
        "date": session_date,
        "video_url": session_data.video_url,
        "session_notes": session_data.session_notes,
        "overall_score": round(overall_score, 1),
        "dimension_scores": [d.model_dump() for d in session_data.dimension_scores],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.sessions.insert_one(session_doc)
    
    return SessionResponse(**session_doc)

@api_router.get("/sessions", response_model=List[SessionResponse])
async def get_sessions(user: dict = Depends(get_current_user), limit: int = 100):
    sessions = await db.sessions.find(
        {"user_id": user["user_id"]},
        {"_id": 0}
    ).sort("created_at", -1).to_list(limit)
    
    return [SessionResponse(**s) for s in sessions]

@api_router.get("/sessions/{session_id}", response_model=SessionResponse)
async def get_session(session_id: str, user: dict = Depends(get_current_user)):
    session = await db.sessions.find_one(
        {"session_id": session_id, "user_id": user["user_id"]},
        {"_id": 0}
    )
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    return SessionResponse(**session)

@api_router.put("/sessions/{session_id}", response_model=SessionResponse)
async def update_session(session_id: str, update_data: SessionUpdate, user: dict = Depends(get_current_user)):
    session = await db.sessions.find_one(
        {"session_id": session_id, "user_id": user["user_id"]},
        {"_id": 0}
    )
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    update_dict = {}
    
    if update_data.video_url is not None:
        update_dict["video_url"] = update_data.video_url
    if update_data.session_notes is not None:
        update_dict["session_notes"] = update_data.session_notes
    if update_data.dimension_scores is not None:
        scored_count = sum(1 for d in update_data.dimension_scores if d.score is not None)
        if scored_count < 5:
            raise HTTPException(
                status_code=400,
                detail=f"Score at least 5 dimensions. You've scored {scored_count} so far."
            )
        
        scores = [d.score for d in update_data.dimension_scores if d.score is not None]
        overall_score = sum(scores) / len(scores) if scores else 0
        
        update_dict["dimension_scores"] = [d.model_dump() for d in update_data.dimension_scores]
        update_dict["overall_score"] = round(overall_score, 1)
    
    if update_dict:
        await db.sessions.update_one(
            {"session_id": session_id},
            {"$set": update_dict}
        )
    
    updated_session = await db.sessions.find_one(
        {"session_id": session_id},
        {"_id": 0}
    )
    
    return SessionResponse(**updated_session)

# ============== STATIC DATA ENDPOINTS ==============

@api_router.get("/dimensions")
async def get_dimensions():
    """Get all scoring dimensions with rubrics"""
    return {
        "dimensions": DIMENSIONS,
        "rubrics": DIMENSION_RUBRICS,
        "groups": {
            "Offensive Technique": ["Jab", "Cross", "Left Hook", "Right Hook", "Uppercut", "Combination Flow", "Punch Balance", "Punch Accuracy"],
            "Defensive Technique": ["Guard Position", "Head Movement", "Slip", "Roll", "Parry", "Body Movement"],
            "Movement & Ring Craft": ["Footwork", "Ring Generalship"]
        }
    }

@api_router.get("/drills")
async def get_drills():
    """Get all drill recommendations"""
    return DRILLS

@api_router.get("/drills/{dimension}")
async def get_drill_for_dimension(dimension: str):
    """Get drill for a specific dimension"""
    if dimension not in DRILLS:
        raise HTTPException(status_code=404, detail="Dimension not found")
    return {
        "dimension": dimension,
        **DRILLS[dimension]
    }

@api_router.get("/legends")
async def get_legends(filter: Optional[str] = None):
    """Get all legend technique breakdowns"""
    if filter and filter != "All":
        filtered = []
        for legend in LEGENDS:
            if filter == "Offensive":
                if any(d in legend["dimensions"] for d in ["Jab", "Cross", "Left Hook", "Right Hook", "Uppercut", "Combination Flow", "Punch Balance", "Punch Accuracy"]):
                    filtered.append(legend)
            elif filter == "Defensive":
                if any(d in legend["dimensions"] for d in ["Guard Position", "Head Movement", "Slip", "Roll", "Parry", "Body Movement"]):
                    filtered.append(legend)
            elif filter == "Footwork & Movement":
                if any(d in legend["dimensions"] for d in ["Footwork", "Ring Generalship"]):
                    filtered.append(legend)
            elif filter == "Combinations":
                if "Combination Flow" in legend["dimensions"]:
                    filtered.append(legend)
        return filtered
    return LEGENDS

# ============== HEALTH CHECK ==============

@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.now(timezone.utc).isoformat()}

# Include the router in the main app
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
