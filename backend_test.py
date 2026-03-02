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
                response = requests.get(url, headers=default_headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=default_headers, timeout=10)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=default_headers, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, headers=default_headers, timeout=10)
            
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

    def test_dimensions_endpoint(self):
        """Test dimensions endpoint"""
        response = self.make_request('GET', 'dimensions')
        
        if not response:
            return self.log_test("Get Dimensions", False, "Request failed")
        
        if response.status_code == 200:
            data = response.json()
            if 'dimensions' in data and 'rubrics' in data and 'groups' in data:
                dimensions = data['dimensions']
                if len(dimensions) == 16:
                    return self.log_test("Get Dimensions", True)
                else:
                    return self.log_test("Get Dimensions", False, f"Expected 16 dimensions, got {len(dimensions)}")
            else:
                return self.log_test("Get Dimensions", False, "Invalid dimensions data", data)
        else:
            return self.log_test("Get Dimensions", False, f"Status code {response.status_code}")

    def test_legends_endpoint(self):
        """Test legends endpoint"""
        response = self.make_request('GET', 'legends')
        
        if not response:
            return self.log_test("Get Legends", False, "Request failed")
        
        if response.status_code == 200:
            data = response.json()
            if isinstance(data, list) and len(data) >= 8:
                return self.log_test("Get Legends", True)
            else:
                return self.log_test("Get Legends", False, f"Expected list of 8+ legends, got {type(data)} with {len(data) if isinstance(data, list) else 0} items")
        else:
            return self.log_test("Get Legends", False, f"Status code {response.status_code}")

    def test_drills_endpoint(self):
        """Test drills endpoint"""
        response = self.make_request('GET', 'drills')
        
        if not response:
            return self.log_test("Get Drills", False, "Request failed")
        
        if response.status_code == 200:
            data = response.json()
            if isinstance(data, dict) and len(data) >= 16:
                return self.log_test("Get Drills", True)
            else:
                return self.log_test("Get Drills", False, f"Expected dict with 16+ drills, got {len(data) if isinstance(data, dict) else 0} items")
        else:
            return self.log_test("Get Drills", False, f"Status code {response.status_code}")

    def test_create_session(self):
        """Test session creation"""
        session_data = {
            "video_url": "https://example.com/test-video",
            "session_notes": "Test session notes",
            "date": datetime.now().strftime("%Y-%m-%d"),
            "dimension_scores": [
                {"dimension_name": "Jab", "score": 7},
                {"dimension_name": "Cross", "score": 6},
                {"dimension_name": "Guard Position", "score": 8},
                {"dimension_name": "Footwork", "score": 5},
                {"dimension_name": "Head Movement", "score": 6}
            ]
        }

        response = self.make_request('POST', 'sessions', session_data)
        
        if not response:
            return self.log_test("Create Session", False, "Request failed")
        
        if response.status_code == 200:
            data = response.json()
            if 'session_id' in data and 'overall_score' in data:
                self.session_id = data['session_id']
                return self.log_test("Create Session", True)
            else:
                return self.log_test("Create Session", False, "Invalid session data", data)
        else:
            return self.log_test("Create Session", False, f"Status code {response.status_code}", response.text)

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

    def test_user_stats(self):
        """Test user stats endpoint"""
        response = self.make_request('GET', 'users/stats')
        
        if not response:
            return self.log_test("Get User Stats", False, "Request failed")
        
        if response.status_code == 200:
            data = response.json()
            if 'total_sessions' in data and 'best_score' in data:
                return self.log_test("Get User Stats", True)
            else:
                return self.log_test("Get User Stats", False, "Invalid stats data", data)
        else:
            return self.log_test("Get User Stats", False, f"Status code {response.status_code}")

    def test_insufficient_dimensions_validation(self):
        """Test session creation with insufficient dimensions (should fail)"""
        session_data = {
            "dimension_scores": [
                {"dimension_name": "Jab", "score": 7},
                {"dimension_name": "Cross", "score": 6}
            ]
        }

        response = self.make_request('POST', 'sessions', session_data)
        
        if not response:
            return self.log_test("Insufficient Dimensions Validation", False, "Request failed")
        
        if response.status_code == 400:
            return self.log_test("Insufficient Dimensions Validation", True)
        else:
            return self.log_test("Insufficient Dimensions Validation", False, f"Expected 400, got {response.status_code}")

    def run_all_tests(self):
        """Run all backend tests"""
        print("=" * 50)
        print("Victory AI Backend API Testing")
        print("=" * 50)
        
        # Test health check first
        self.test_health_check()
        
        # Test public endpoints
        self.test_dimensions_endpoint()
        self.test_legends_endpoint() 
        self.test_drills_endpoint()
        
        # Test authentication flow
        self.test_user_registration()
        self.test_get_current_user()
        
        # Test protected endpoints
        if self.session_token:
            self.test_create_session()
            self.test_get_sessions()
            self.test_user_stats()
            self.test_insufficient_dimensions_validation()
        
        # Print final results
        print("\n" + "=" * 50)
        print(f"Tests completed: {self.tests_passed}/{self.tests_run} passed")
        print("=" * 50)
        
        return {
            "total_tests": self.tests_run,
            "passed_tests": self.tests_passed,
            "success_rate": (self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0,
            "results": self.test_results
        }

def main():
    tester = VictoryAITester()
    results = tester.run_all_tests()
    
    # Return appropriate exit code
    return 0 if results["passed_tests"] == results["total_tests"] else 1

if __name__ == "__main__":
    sys.exit(main())