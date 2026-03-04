#!/usr/bin/env python3
import requests
import sys
import json
import uuid
from datetime import datetime

class VictoryAITester:
    def __init__(self, base_url="https://sparring-ai-log.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.session_token = None
        self.user_id = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []
        self.fighter_buddy = None
        self.training_session_id = None

    def log_test(self, test_name, success, message="", response_data=None):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {test_name} - PASSED")
        else:
            print(f"❌ {test_name} - FAILED: {message}")
            if response_data:
                print(f"   Response: {response_data}")
        
        self.test_results.append({
            "test": test_name,
            "passed": success,
            "message": message,
            "response": response_data
        })
        return success

    def make_request(self, method, endpoint, data=None, headers=None, auth_required=True):
        """Make HTTP request with error handling"""
        url = f"{self.api_url}/{endpoint}"
        default_headers = {'Content-Type': 'application/json'}
        
        if auth_required and self.session_token:
            default_headers['Authorization'] = f'Bearer {self.session_token}'
        
        if headers:
            default_headers.update(headers)

        try:
            if method == 'GET':
                response = requests.get(url, headers=default_headers, timeout=15)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=default_headers, timeout=15)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=default_headers, timeout=15)
            elif method == 'DELETE':
                response = requests.delete(url, headers=default_headers, timeout=15)
            
            return response
        except Exception as e:
            print(f"Request error: {str(e)}")
            return None

    def test_health_check(self):
        """Test health endpoint"""
        response = self.make_request('GET', 'health', auth_required=False)
        
        if not response:
            return self.log_test("Health Check", False, "Request failed")
        
        if response.status_code == 200:
            data = response.json()
            if 'status' in data and data['status'] == 'healthy':
                return self.log_test("Health Check", True)
            else:
                return self.log_test("Health Check", False, "Invalid health response", data)
        else:
            return self.log_test("Health Check", False, f"Status code {response.status_code}")

    def test_user_registration(self):
        """Test user registration"""
        timestamp = str(int(datetime.now().timestamp()))
        test_user = {
            "email": f"test.user.{timestamp}@example.com",
            "password": "TestPass123!",
            "name": f"Test User {timestamp}",
            "experience_level": "Training under 6 months",
            "primary_goal": "Get better overall"
        }

        response = self.make_request('POST', 'auth/register', test_user, auth_required=False)
        
        if not response:
            return self.log_test("User Registration", False, "Request failed")
        
        if response.status_code == 200:
            data = response.json()
            if 'access_token' in data:
                self.session_token = data['access_token']
                return self.log_test("User Registration", True)
            else:
                return self.log_test("User Registration", False, "No access token returned", data)
        else:
            return self.log_test("User Registration", False, f"Status code {response.status_code}", response.text)

    def test_get_current_user(self):
        """Test getting current user info"""
        response = self.make_request('GET', 'auth/me')
        
        if not response:
            return self.log_test("Get Current User", False, "Request failed")
        
        if response.status_code == 200:
            data = response.json()
            if 'user_id' in data and 'email' in data:
                self.user_id = data['user_id']
                return self.log_test("Get Current User", True)
            else:
                return self.log_test("Get Current User", False, "Invalid user data", data)
        else:
            return self.log_test("Get Current User", False, f"Status code {response.status_code}")

    def test_quiz_submit(self):
        """Test quiz submission - NEW FEATURE"""
        quiz_data = {
            "training_goal": "Get fit",
            "training_frequency": "3-4 times/week", 
            "training_location": "Home",
            "biggest_frustration": "No feedback",
            "favorite_fighters": ["Usyk", "Ali", "Tyson"]
        }

        response = self.make_request('POST', 'quiz/submit', quiz_data)
        
        if not response:
            return self.log_test("Quiz Submit", False, "Request failed")
        
        if response.status_code == 200:
            data = response.json()
            if 'quiz_completed' in data:
                return self.log_test("Quiz Submit", True)
            else:
                return self.log_test("Quiz Submit", False, "Invalid quiz response", data)
        else:
            return self.log_test("Quiz Submit", False, f"Status code {response.status_code}")

    def test_fighter_buddy_archetypes(self):
        """Test getting fighter buddy archetypes - NEW FEATURE"""
        response = self.make_request('GET', 'fighter-buddy/archetypes', auth_required=False)
        
        if not response:
            return self.log_test("Fighter Buddy Archetypes", False, "Request failed")
        
        if response.status_code == 200:
            data = response.json()
            if 'archetypes' in data and len(data['archetypes']) > 0:
                return self.log_test("Fighter Buddy Archetypes", True)
            else:
                return self.log_test("Fighter Buddy Archetypes", False, "No archetypes returned", data)
        else:
            return self.log_test("Fighter Buddy Archetypes", False, f"Status code {response.status_code}")

    def test_fighter_buddy_create(self):
        """Test creating fighter buddy - NEW FEATURE"""
        buddy_data = {
            "name": "Test Buddy",
            "weight_class": "Welterweight",
            "stance": "Orthodox", 
            "favorite_punch": "Jab",
            "archetype": "complete_champion"
        }

        response = self.make_request('POST', 'fighter-buddy/create', buddy_data)
        
        if not response:
            return self.log_test("Fighter Buddy Create", False, "Request failed")
        
        if response.status_code == 200:
            data = response.json()
            if 'buddy_id' in data and 'name' in data:
                self.fighter_buddy = data
                return self.log_test("Fighter Buddy Create", True)
            else:
                return self.log_test("Fighter Buddy Create", False, "Invalid buddy data", data)
        else:
            return self.log_test("Fighter Buddy Create", False, f"Status code {response.status_code}")

    def test_payments_checkout(self):
        """Test creating checkout session - NEW FEATURE"""
        checkout_data = {
            "plan_id": "monthly",
            "origin_url": self.base_url
        }

        response = self.make_request('POST', 'payments/checkout', checkout_data)
        
        if not response:
            return self.log_test("Payments Checkout", False, "Request failed")
        
        if response.status_code == 200:
            data = response.json()
            if 'checkout_url' in data:
                return self.log_test("Payments Checkout", True)
            else:
                return self.log_test("Payments Checkout", False, "No checkout URL", data)
        else:
            return self.log_test("Payments Checkout", False, f"Status code {response.status_code}")

    def test_subscription_status(self):
        """Test subscription status - NEW FEATURE"""
        response = self.make_request('GET', 'subscription/status')
        
        if not response:
            return self.log_test("Subscription Status", False, "Request failed")
        
        if response.status_code == 200:
            data = response.json()
            if 'has_subscription' in data and 'status' in data:
                return self.log_test("Subscription Status", True)
            else:
                return self.log_test("Subscription Status", False, "Invalid status data", data)
        else:
            return self.log_test("Subscription Status", False, f"Status code {response.status_code}")

    def test_ai_generate_feedback(self):
        """Test AI feedback generation - NEW FEATURE"""
        feedback_data = {
            "round_number": 1,
            "total_rounds": 3
        }

        response = self.make_request('POST', 'ai/generate-feedback', feedback_data)
        
        if not response:
            return self.log_test("AI Generate Feedback", False, "Request failed")
        
        if response.status_code == 200:
            data = response.json()
            if 'buddy_name' in data and 'what_you_did_well' in data:
                return self.log_test("AI Generate Feedback", True)
            else:
                return self.log_test("AI Generate Feedback", False, "Invalid feedback data", data)
        else:
            return self.log_test("AI Generate Feedback", False, f"Status code {response.status_code}")

    def test_training_start(self):
        """Test starting training session - NEW FEATURE"""
        training_data = {
            "round_duration": 180,
            "rest_duration": 60,
            "total_rounds": 3,
            "record_video": True
        }

        response = self.make_request('POST', 'training/start', training_data)
        
        if not response:
            return self.log_test("Training Start", False, "Request failed")
        
        if response.status_code == 200:
            data = response.json()
            if 'session_id' in data and 'status' in data:
                self.training_session_id = data['session_id']
                return self.log_test("Training Start", True)
            else:
                return self.log_test("Training Start", False, "Invalid training data", data)
        else:
            return self.log_test("Training Start", False, f"Status code {response.status_code}")

    def test_dimensions_endpoint(self):
        """Test dimensions endpoint"""
        response = self.make_request('GET', 'dimensions', auth_required=False)
        
        if not response:
            return self.log_test("Get Dimensions", False, "Request failed")
        
        if response.status_code == 200:
            data = response.json()
            if 'dimensions' in data and 'groups' in data:
                dimensions = data['dimensions']
                if len(dimensions) >= 16:
                    return self.log_test("Get Dimensions", True)
                else:
                    return self.log_test("Get Dimensions", False, f"Expected 16+ dimensions, got {len(dimensions)}")
            else:
                return self.log_test("Get Dimensions", False, "Invalid dimensions data", data)
        else:
            return self.log_test("Get Dimensions", False, f"Status code {response.status_code}")

    def test_get_sessions(self):
        """Test getting user sessions"""
        response = self.make_request('GET', 'sessions')
        
        if not response:
            return self.log_test("Get Sessions", False, "Request failed")
        
        if response.status_code == 200:
            data = response.json()
            if isinstance(data, list):
                return self.log_test("Get Sessions", True)
            else:
                return self.log_test("Get Sessions", False, f"Expected list, got {type(data)}")
        else:
            return self.log_test("Get Sessions", False, f"Status code {response.status_code}")

    def test_subscription_plans(self):
        """Test subscription plans"""
        response = self.make_request('GET', 'plans', auth_required=False)
        
        if not response:
            return self.log_test("Get Subscription Plans", False, "Request failed")
        
        if response.status_code == 200:
            data = response.json()
            if 'plans' in data and 'monthly' in data['plans'] and 'annual' in data['plans']:
                return self.log_test("Get Subscription Plans", True)
            else:
                return self.log_test("Get Subscription Plans", False, "Invalid plans data", data)
        else:
            return self.log_test("Get Subscription Plans", False, f"Status code {response.status_code}")

    def run_all_tests(self):
        """Run all backend tests for Victory AI"""
        print("=" * 60)
        print("Victory AI Backend API Testing - Major Rebuild")
        print("=" * 60)
        
        # Basic health check
        print("\n📋 HEALTH CHECK")
        self.test_health_check()
        
        # Public endpoints 
        print("\n📊 PUBLIC ENDPOINTS")
        self.test_dimensions_endpoint()
        self.test_fighter_buddy_archetypes()
        self.test_subscription_plans()
        
        # Authentication flow
        print("\n🔐 AUTHENTICATION")
        self.test_user_registration()
        self.test_get_current_user()
        
        # New onboarding features
        if self.session_token:
            print("\n📝 ONBOARDING FLOW")
            self.test_quiz_submit()
            self.test_fighter_buddy_create()
            
            print("\n💳 PAYMENT & SUBSCRIPTION") 
            self.test_payments_checkout()
            self.test_subscription_status()
            
            print("\n🏃 TRAINING FEATURES")
            self.test_training_start()
            self.test_ai_generate_feedback()
            self.test_get_sessions()
        
        # Print final results
        print("\n" + "=" * 60)
        success_rate = (self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0
        print(f"FINAL RESULTS: {self.tests_passed}/{self.tests_run} tests passed ({success_rate:.1f}%)")
        
        if self.tests_passed == self.tests_run:
            print("🎉 ALL TESTS PASSED!")
        else:
            print(f"❌ {self.tests_run - self.tests_passed} tests failed")
            
        print("=" * 60)
        
        return {
            "total_tests": self.tests_run,
            "passed_tests": self.tests_passed,
            "success_rate": success_rate,
            "results": self.test_results
        }

def main():
    tester = VictoryAITester()
    results = tester.run_all_tests()
    
    # Return appropriate exit code
    return 0 if results["passed_tests"] == results["total_tests"] else 1

if __name__ == "__main__":
    sys.exit(main())