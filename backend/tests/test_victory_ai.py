"""
Victory AI Backend Tests - Iteration 2
Tests cover:
- Health check
- User registration flow
- Onboarding social proof
- Partner styles
- Training partner creation
- Cloudinary signature
- AI feedback generation
- Training session start/complete
- Stripe checkout
"""
import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test user credentials
TEST_EMAIL = f"test_victory_{uuid.uuid4().hex[:8]}@test.com"
TEST_PASSWORD = "testpass123"
TEST_NAME = "TEST_VictoryUser"


class TestHealthEndpoint:
    """Health check endpoint tests"""
    
    def test_health_check(self):
        """Test /api/health returns healthy status"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "timestamp" in data
        print(f"✓ Health check passed: {data}")


class TestPublicEndpoints:
    """Public endpoints that don't require authentication"""
    
    def test_social_proof_endpoint(self):
        """Test /api/onboarding/social-proof returns stats and testimonials"""
        response = requests.get(f"{BASE_URL}/api/onboarding/social-proof")
        assert response.status_code == 200
        data = response.json()
        
        # Validate stats
        assert "stats" in data
        assert "rounds_recorded" in data["stats"]
        assert "avg_improvement" in data["stats"]
        assert "active_fighters" in data["stats"]
        
        # Validate testimonials
        assert "testimonials" in data
        assert len(data["testimonials"]) > 0
        assert "name" in data["testimonials"][0]
        assert "text" in data["testimonials"][0]
        assert "improvement" in data["testimonials"][0]
        print(f"✓ Social proof endpoint works: {len(data['testimonials'])} testimonials")
    
    def test_partner_styles_endpoint(self):
        """Test /api/onboarding/partner-styles returns 5 styles"""
        response = requests.get(f"{BASE_URL}/api/onboarding/partner-styles")
        assert response.status_code == 200
        data = response.json()
        
        assert "styles" in data
        styles = data["styles"]
        
        # Should have exactly 5 styles
        assert len(styles) == 5, f"Expected 5 styles, got {len(styles)}"
        
        # Validate style structure
        expected_styles = ["tough_love", "supportive_mentor", "analytical_technician", "hype_man", "old_school_trainer"]
        for style_key in expected_styles:
            assert style_key in styles, f"Missing style: {style_key}"
            assert "name" in styles[style_key]
            assert "personality" in styles[style_key]
            assert "feedback_tone" in styles[style_key]
            assert "phrases" in styles[style_key]
        
        print(f"✓ Partner styles endpoint works: {list(styles.keys())}")
    
    def test_dimensions_endpoint(self):
        """Test /api/dimensions returns all boxing dimensions"""
        response = requests.get(f"{BASE_URL}/api/dimensions")
        assert response.status_code == 200
        data = response.json()
        
        assert "dimensions" in data
        assert "groups" in data
        assert len(data["dimensions"]) >= 10  # Should have many dimensions
        print(f"✓ Dimensions endpoint works: {len(data['dimensions'])} dimensions")
    
    def test_drills_endpoint(self):
        """Test /api/drills returns drill data"""
        response = requests.get(f"{BASE_URL}/api/drills")
        assert response.status_code == 200
        data = response.json()
        
        # Should have drill entries
        assert len(data) > 0
        # Validate drill structure - check first drill
        first_key = list(data.keys())[0]
        assert "name" in data[first_key]
        assert "description" in data[first_key]
        print(f"✓ Drills endpoint works: {len(data)} drills")
    
    def test_plans_endpoint(self):
        """Test /api/plans returns subscription plans"""
        response = requests.get(f"{BASE_URL}/api/plans")
        assert response.status_code == 200
        data = response.json()
        
        assert "plans" in data
        plans = data["plans"]
        
        assert "monthly" in plans
        assert "annual" in plans
        assert plans["monthly"]["price"] == 2.99
        assert plans["annual"]["price"] == 19.99
        print(f"✓ Plans endpoint works: monthly=${plans['monthly']['price']}, annual=${plans['annual']['price']}")


class TestUserRegistration:
    """User registration and authentication tests"""
    
    def test_register_new_user(self):
        """Test user registration flow"""
        response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD,
            "name": TEST_NAME
        })
        
        assert response.status_code == 200, f"Registration failed: {response.text}"
        data = response.json()
        
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        print(f"✓ User registration works: {TEST_EMAIL}")
        
        # Store token for other tests
        return data["access_token"]
    
    def test_login_user(self):
        """Test user login with registered credentials"""
        # First register a user
        reg_response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": f"login_test_{uuid.uuid4().hex[:8]}@test.com",
            "password": "testpass123",
            "name": "Login Test User"
        })
        
        if reg_response.status_code == 400:
            # User already exists, try login
            pass
        
        login_email = f"login_test_{uuid.uuid4().hex[:8]}@test.com"
        
        # Register fresh user
        requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": login_email,
            "password": "testpass123",
            "name": "Login Test User"
        })
        
        # Login
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": login_email,
            "password": "testpass123"
        })
        
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        print(f"✓ User login works")
    
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials returns 401"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "nonexistent@test.com",
            "password": "wrongpassword"
        })
        assert response.status_code == 401
        print(f"✓ Invalid login properly rejected")
    
    def test_get_me_unauthorized(self):
        """Test /api/auth/me without token returns 401"""
        response = requests.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 401
        print(f"✓ Unauthorized access properly rejected")


class TestAuthenticatedEndpoints:
    """Tests for endpoints requiring authentication"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test user with auth token"""
        email = f"auth_test_{uuid.uuid4().hex[:8]}@test.com"
        reg_response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": email,
            "password": "testpass123",
            "name": "Auth Test User"
        })
        
        if reg_response.status_code == 200:
            self.token = reg_response.json()["access_token"]
        else:
            # Try login
            login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
                "email": email,
                "password": "testpass123"
            })
            self.token = login_response.json()["access_token"]
        
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_me(self):
        """Test /api/auth/me with valid token"""
        response = requests.get(f"{BASE_URL}/api/auth/me", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        
        assert "user_id" in data
        assert "email" in data
        assert "name" in data
        print(f"✓ Get me endpoint works: {data['email']}")
    
    def test_cloudinary_signature(self):
        """Test Cloudinary signature endpoint returns valid credentials"""
        response = requests.get(
            f"{BASE_URL}/api/cloudinary/signature?resource_type=video",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "signature" in data
        assert "timestamp" in data
        assert "cloud_name" in data
        assert "api_key" in data
        assert "folder" in data
        
        # Validate Cloudinary credentials are set
        assert data["cloud_name"] == "dtlng3ite"
        assert data["api_key"] == "425519145995724"
        print(f"✓ Cloudinary signature endpoint works: cloud={data['cloud_name']}")
    
    def test_onboarding_submit(self):
        """Test onboarding answers submission"""
        response = requests.post(f"{BASE_URL}/api/onboarding/submit", json={
            "why_downloaded": "improve_technique",
            "heard_from": "social_media",
            "biggest_frustration": "no_feedback",
            "training_frequency": "3-4_week",
            "experience_level": "6_18_months",
            "favorite_counter": "jab",
            "training_partner_style": "tough_love"
        }, headers=self.headers)
        
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "affirmations" in data
        print(f"✓ Onboarding submit works")
    
    def test_create_training_partner(self):
        """Test creating a training partner"""
        response = requests.post(f"{BASE_URL}/api/onboarding/create-partner", json={
            "name": "TestCoach",
            "style": "tough_love",
            "focus_areas": ["Guard Position", "Head Movement"],
            "accountability_level": "high"
        }, headers=self.headers)
        
        assert response.status_code == 200
        data = response.json()
        
        assert "partner_id" in data
        assert data["name"] == "TestCoach"
        assert data["style"] == "tough_love"
        assert data["style_name"] == "Tough Love Coach"
        assert data["feedback_tone"] == "direct"
        assert "phrases" in data
        print(f"✓ Create training partner works: {data['name']} ({data['style_name']})")
    
    def test_generate_ai_feedback(self):
        """Test AI feedback generation with training partner name"""
        # First create a training partner
        requests.post(f"{BASE_URL}/api/onboarding/create-partner", json={
            "name": "TestPartner",
            "style": "hype_man",
            "focus_areas": ["Footwork"],
            "accountability_level": "moderate"
        }, headers=self.headers)
        
        # Generate feedback
        response = requests.post(f"{BASE_URL}/api/ai/generate-feedback", json={
            "round_number": 1,
            "total_rounds": 3,
            "video_analysis": None
        }, headers=self.headers)
        
        assert response.status_code == 200
        data = response.json()
        
        assert "partner_name" in data
        assert "round_number" in data
        assert "what_you_did_well" in data
        assert "what_to_tighten" in data
        assert "drill_focus" in data
        assert "dimension_scores" in data
        print(f"✓ AI feedback generation works: partner={data['partner_name']}")


class TestTrainingSession:
    """Training session start and complete tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test user with auth token"""
        email = f"train_test_{uuid.uuid4().hex[:8]}@test.com"
        reg_response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": email,
            "password": "testpass123",
            "name": "Training Test User"
        })
        self.token = reg_response.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_start_training_session(self):
        """Test starting a training session"""
        response = requests.post(f"{BASE_URL}/api/training/start", json={
            "round_duration": 180,
            "rest_duration": 60,
            "total_rounds": 3,
            "record_video": True
        }, headers=self.headers)
        
        assert response.status_code == 200
        data = response.json()
        
        assert "session_id" in data
        assert data["status"] == "started"
        print(f"✓ Training session start works: {data['session_id']}")
        return data["session_id"]
    
    def test_complete_training_session(self):
        """Test completing a training session"""
        # Start a session first
        start_response = requests.post(f"{BASE_URL}/api/training/start", json={
            "round_duration": 180,
            "rest_duration": 60,
            "total_rounds": 3,
            "record_video": False
        }, headers=self.headers)
        
        session_id = start_response.json()["session_id"]
        
        # Complete the session
        response = requests.post(
            f"{BASE_URL}/api/training/{session_id}/complete",
            headers=self.headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert "session_id" in data
        assert "overall_score" in data
        assert "dimension_scores" in data
        assert "completed_at" in data
        
        # Check no MongoDB _id leakage
        assert "_id" not in data
        print(f"✓ Training session complete works: score={data['overall_score']}")
    
    def test_get_sessions(self):
        """Test getting user's training sessions"""
        # Start and complete a session first
        start_response = requests.post(f"{BASE_URL}/api/training/start", json={
            "round_duration": 180,
            "rest_duration": 60,
            "total_rounds": 2,
            "record_video": False
        }, headers=self.headers)
        
        session_id = start_response.json()["session_id"]
        requests.post(f"{BASE_URL}/api/training/{session_id}/complete", headers=self.headers)
        
        # Get sessions
        response = requests.get(f"{BASE_URL}/api/sessions", headers=self.headers)
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Get sessions works: {len(data)} sessions")


class TestStripeCheckout:
    """Stripe payment checkout tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test user with auth token"""
        email = f"stripe_test_{uuid.uuid4().hex[:8]}@test.com"
        reg_response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": email,
            "password": "testpass123",
            "name": "Stripe Test User"
        })
        self.token = reg_response.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_create_checkout_session(self):
        """Test creating a Stripe checkout session"""
        response = requests.post(f"{BASE_URL}/api/payments/checkout", json={
            "plan_id": "monthly",
            "origin_url": "https://sparring-ai-log.preview.emergentagent.com"
        }, headers=self.headers)
        
        assert response.status_code == 200
        data = response.json()
        
        assert "checkout_url" in data
        assert "session_id" in data
        assert "stripe.com" in data["checkout_url"]
        print(f"✓ Stripe checkout works: {data['checkout_url'][:50]}...")
    
    def test_checkout_invalid_plan(self):
        """Test checkout with invalid plan returns error"""
        response = requests.post(f"{BASE_URL}/api/payments/checkout", json={
            "plan_id": "invalid_plan",
            "origin_url": "https://sparring-ai-log.preview.emergentagent.com"
        }, headers=self.headers)
        
        assert response.status_code == 400
        print(f"✓ Invalid plan properly rejected")
    
    def test_subscription_status(self):
        """Test getting subscription status"""
        response = requests.get(
            f"{BASE_URL}/api/subscription/status",
            headers=self.headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert "has_subscription" in data
        assert "status" in data
        print(f"✓ Subscription status works: has_subscription={data['has_subscription']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
