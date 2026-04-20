import { useState, useEffect, useCallback, createContext, useContext, useRef } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import { Toaster } from "@/components/ui/sonner";
import { ClerkProvider, useUser, useAuth as useClerkAuth } from "@clerk/clerk-react";

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
import LeaderboardPage from "@/pages/LeaderboardPage";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;
const PUBLISHABLE_KEY = process.env.REACT_APP_CLERK_PUBLISHABLE_KEY;

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};

const AuthProvider = ({ children }) => {
  const { isSignedIn, isLoaded } = useUser();
  const { getToken, signOut } = useClerkAuth();
  const [user, setUser] = useState(null);
  const [mongoLoading, setMongoLoading] = useState(true);
  const getTokenRef = useRef(getToken);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  // Global axios interceptor — adds Clerk Bearer token to every request
  useEffect(() => {
    const id = axios.interceptors.request.use(async (config) => {
      try {
        const token = await getTokenRef.current();
        if (token) config.headers.Authorization = `Bearer ${token}`;
      } catch (e) {}
      return config;
    });
    return () => axios.interceptors.request.eject(id);
  }, []);

  const checkAuth = useCallback(async () => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setUser(null);
      setMongoLoading(false);
      return;
    }
    setMongoLoading(true);
    try {
      const token = await getToken();
      const res = await axios.get(`${API}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUser(res.data);
    } catch (e) {
      setUser(null);
    } finally {
      setMongoLoading(false);
    }
  }, [isSignedIn, isLoaded, getToken]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const logout = useCallback(async () => {
    await signOut();
    setUser(null);
  }, [signOut]);

  return (
    <AuthContext.Provider value={{
      user,
      setUser,
      loading: !isLoaded || mongoLoading,
      isAuthenticated: isLoaded && isSignedIn && !!user,
      login: () => {},
      logout,
      checkAuth,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

const ProtectedRoute = ({ children, requireSubscription = false }) => {
  const { isAuthenticated, loading, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate("/login", { replace: true });
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
    if (!loading && !isAuthenticated) navigate("/login", { replace: true });
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

const TrialExpirationBanner = () => {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [trialInfo, setTrialInfo] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || !user?.has_subscription) return;
    const check = async () => {
      try {
        const res = await axios.get(`${API}/subscription/trial-status`);
        if (res.data.status === "trialing" && res.data.days_remaining <= 3) {
          setTrialInfo(res.data);
        }
      } catch (e) {}
    };
    check();
  }, [isAuthenticated, user]);

  if (!trialInfo || dismissed) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-victory-orange text-white px-4 py-2 flex items-center justify-between text-sm">
      <span>
        Trial ends in <strong>{trialInfo.days_remaining} day{trialInfo.days_remaining !== 1 ? "s" : ""}</strong> — keep your progress going.
      </span>
      <div className="flex items-center gap-3">
        <button onClick={() => navigate("/paywall")} className="underline font-semibold whitespace-nowrap">Upgrade</button>
        <button onClick={() => setDismissed(true)} className="text-white/70 hover:text-white text-lg leading-none">×</button>
      </div>
    </div>
  );
};

const AppRouter = () => {
  return (
    <>
      <TrialExpirationBanner />
      <Routes>
        <Route path="/welcome" element={<WelcomePage />} />
        <Route path="/login/*" element={<LoginPage />} />

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
        <Route path="/leaderboard" element={<ProtectedRoute requireSubscription={true}><LeaderboardPage /></ProtectedRoute>} />

        <Route path="/" element={<Navigate to="/welcome" replace />} />
        <Route path="*" element={<Navigate to="/welcome" replace />} />
      </Routes>
    </>
  );
};

function App() {
  return (
    <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
      <div className="App min-h-screen bg-victory-bg">
        <BrowserRouter>
          <AuthProvider>
            <AppRouter />
            <Toaster position="top-center" toastOptions={{ style: { background: "#12121A", border: "1px solid #2A2A3A", color: "#F0F0F5" } }} />
          </AuthProvider>
        </BrowserRouter>
      </div>
    </ClerkProvider>
  );
}

export default App;
