import { useState, useEffect, useCallback, createContext, useContext, useRef } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import { Toaster } from "@/components/ui/sonner";

// Pages
import WelcomePage from "@/pages/WelcomePage";
import OnboardingFlow from "@/pages/OnboardingFlow";
import PaywallPage from "@/pages/PaywallPage";
import PaymentSuccess from "@/pages/PaymentSuccess";
import HomePage from "@/pages/HomePage";
import TrainPage from "@/pages/TrainPage";
import ScorePage from "@/pages/ScorePage";
import SessionResultsPage from "@/pages/SessionResultsPage";
import TimerPage from "@/pages/TimerPage";
import LibraryPage from "@/pages/LibraryPage";
import SessionDetailPage from "@/pages/SessionDetailPage";
import ProfilePage from "@/pages/ProfilePage";
import LoginPage from "@/pages/LoginPage";
import AuthCallback from "@/pages/AuthCallback";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const checkAuth = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/auth/me`, { withCredentials: true });
      setUser(response.data);
      setIsAuthenticated(true);
    } catch (error) {
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (window.location.hash?.includes("session_id=")) {
      setLoading(false);
      return;
    }
    checkAuth();
  }, [checkAuth]);

  const login = useCallback((userData, token) => {
    setUser(userData);
    setIsAuthenticated(true);
    if (token) localStorage.setItem("token", token);
  }, []);

  const logout = useCallback(async () => {
    try {
      await axios.post(`${API}/auth/logout`, {}, { withCredentials: true });
    } catch (error) {}
    setUser(null);
    setIsAuthenticated(false);
    localStorage.removeItem("token");
  }, []);

  return (
    <AuthContext.Provider value={{ user, setUser, loading, isAuthenticated, login, logout, checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
};

const ProtectedRoute = ({ children, requireSubscription = false }) => {
  const { isAuthenticated, loading, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      const hasOnboarded = localStorage.getItem("victory_onboarded");
      navigate(hasOnboarded ? "/login" : "/welcome", { replace: true });
    } else if (!loading && isAuthenticated && requireSubscription) {
      if (!user?.has_subscription) {
        if (!user?.onboarding_completed) {
          navigate("/onboarding", { replace: true });
        } else {
          navigate("/paywall", { replace: true });
        }
      }
    }
  }, [loading, isAuthenticated, user, requireSubscription, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-victory-bg flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-victory-lime border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!isAuthenticated || (requireSubscription && !user?.has_subscription)) return null;
  return children;
};

const OnboardingRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !isAuthenticated) navigate("/welcome", { replace: true });
  }, [loading, isAuthenticated, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-victory-bg flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-victory-lime border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return isAuthenticated ? children : null;
};

const AppRouter = () => {
  const location = useLocation();
  if (location.hash?.includes("session_id=")) return <AuthCallback />;

  return (
    <Routes>
      <Route path="/welcome" element={<WelcomePage />} />
      <Route path="/login" element={<LoginPage />} />
      
      <Route path="/onboarding" element={<OnboardingRoute><OnboardingFlow /></OnboardingRoute>} />
      <Route path="/paywall" element={<OnboardingRoute><PaywallPage /></OnboardingRoute>} />
      <Route path="/payment/success" element={<OnboardingRoute><PaymentSuccess /></OnboardingRoute>} />
      
      <Route path="/home" element={<ProtectedRoute requireSubscription={true}><HomePage /></ProtectedRoute>} />
      <Route path="/train" element={<ProtectedRoute requireSubscription={true}><TrainPage /></ProtectedRoute>} />
      <Route path="/score" element={<ProtectedRoute requireSubscription={true}><ScorePage /></ProtectedRoute>} />
      <Route path="/score/results" element={<ProtectedRoute requireSubscription={true}><SessionResultsPage /></ProtectedRoute>} />
      <Route path="/timer" element={<ProtectedRoute requireSubscription={true}><TimerPage /></ProtectedRoute>} />
      <Route path="/library" element={<ProtectedRoute requireSubscription={true}><LibraryPage /></ProtectedRoute>} />
      <Route path="/sessions/:sessionId" element={<ProtectedRoute requireSubscription={true}><SessionDetailPage /></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute requireSubscription={true}><ProfilePage /></ProtectedRoute>} />
      
      <Route path="/" element={<Navigate to="/home" replace />} />
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  );
};

function App() {
  return (
    <div className="App min-h-screen bg-victory-bg">
      <BrowserRouter>
        <AuthProvider>
          <AppRouter />
          <Toaster position="top-center" toastOptions={{ style: { background: "#12121A", border: "1px solid #2A2A3A", color: "#F0F0F5" } }} />
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;
