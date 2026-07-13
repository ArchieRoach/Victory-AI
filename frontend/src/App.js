import { useState, useEffect, useCallback, createContext, useContext, useRef } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import i18n from "@/i18n";

// Apply RTL direction based on stored language on first load
const storedLang = localStorage.getItem("i18nextLng") || "";
if (storedLang === "ar") {
  document.documentElement.dir = "rtl";
  document.documentElement.lang = "ar";
} else if (storedLang) {
  document.documentElement.lang = storedLang;
}
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
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
import FeedPage from "@/pages/FeedPage";
import CreatePostPage from "@/pages/CreatePostPage";
import GymsPage from "@/pages/GymsPage";
import GymDetailPage from "@/pages/GymDetailPage";
import CompetitionsPage from "@/pages/CompetitionsPage";
import CompetitionDetailPage from "@/pages/CompetitionDetailPage";
import PublicProfilePage from "@/pages/PublicProfilePage";
import FeedbackWidget from "@/components/FeedbackWidget";
import NotFoundPage from "@/pages/NotFoundPage";
import SubscriptionGate from "@/components/SubscriptionGate";
import LiveFeedPage from "@/pages/LiveFeedPage";
import StreamViewPage from "@/pages/StreamViewPage";
import GoLivePage from "@/pages/GoLivePage";
import AdvertisePage from "@/pages/AdvertisePage";
import EmoteStudioPage from "@/pages/EmoteStudioPage";
import { PushPrompt } from "@/components/PushPrompt";
import StreamerDashboardPage from "@/pages/StreamerDashboardPage";
import TokensPage from "@/pages/TokensPage";
import DiscoverPage from "@/pages/DiscoverPage";
import TokenSuccessPage from "@/pages/TokenSuccessPage";
import TrendingClipsPage from "@/pages/TrendingClipsPage";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;
const PUBLISHABLE_KEY = process.env.REACT_APP_CLERK_PUBLISHABLE_KEY;

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};

// Mobile app bridge: the native iOS shell (WKWebView wrapping this same site)
// has no Clerk web session, so it pushes a fresh Clerk token in periodically
// via window.__setMobileAuthToken. When present, it wins over the web Clerk
// SDK. See ios/VictoryAI/App/MainAppView.swift.
let setMobileToken = null;
window.__setMobileAuthToken = (token) => setMobileToken?.(token);
window.__clearMobileAuthToken = () => setMobileToken?.(null);

const AuthProvider = ({ children }) => {
  const { isSignedIn, isLoaded } = useUser();
  const { getToken, signOut } = useClerkAuth();
  const [user, setUser] = useState(null);
  const [mongoLoading, setMongoLoading] = useState(true);
  const [mobileToken, setMobileTokenState] = useState(null);
  const getTokenRef = useRef(getToken);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  useEffect(() => {
    setMobileToken = setMobileTokenState;
    return () => { setMobileToken = null; };
  }, []);

  // Global axios interceptor — adds a Bearer token to every request.
  // Native mobile token (if the bridge above set one) takes priority.
  useEffect(() => {
    const id = axios.interceptors.request.use(async (config) => {
      try {
        const token = mobileToken || await getTokenRef.current();
        if (token) config.headers.Authorization = `Bearer ${token}`;
      } catch (e) {}
      return config;
    });
    return () => axios.interceptors.request.eject(id);
  }, [mobileToken]);

  const checkAuth = useCallback(async () => {
    if (!mobileToken && !isLoaded) return;
    if (!mobileToken && !isSignedIn) {
      setUser(null);
      setMongoLoading(false);
      return;
    }
    setMongoLoading(true);
    try {
      const token = mobileToken || await getToken();
      const res = await axios.get(`${API}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUser(res.data);
    } catch (e) {
      setUser(null);
    } finally {
      setMongoLoading(false);
    }
  }, [isSignedIn, isLoaded, getToken, mobileToken]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Refresh the user doc WITHOUT toggling global loading (so callers like the
  // payment-success pages aren't unmounted mid-flow).
  const refreshUser = useCallback(async () => {
    if (!mobileToken && !isSignedIn) return;
    try {
      const token = mobileToken || await getToken();
      const res = await axios.get(`${API}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUser(res.data);
    } catch (e) {}
  }, [isSignedIn, getToken, mobileToken]);

  const logout = useCallback(async () => {
    if (mobileToken) {
      // No web Clerk session to sign out of — just clear local state.
      setMobileTokenState(null);
      setUser(null);
      return;
    }
    await signOut();
    setUser(null);
  }, [signOut, mobileToken]);

  return (
    <AuthContext.Provider value={{
      user,
      setUser,
      loading: !mobileToken && (!isLoaded || mongoLoading),
      isAuthenticated: (mobileToken || (isLoaded && isSignedIn)) && !!user,
      login: () => {},
      logout,
      checkAuth,
      refreshUser,
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

const RootRedirect = () => {
  const { isAuthenticated, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen bg-victory-bg flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-victory-lime border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  return <Navigate to={isAuthenticated ? "/live" : "/welcome"} replace />;
};

const AppRouter = () => {
  const navigate = useNavigate();

  // Global 402 handler — fires when free-tier AI quota is exceeded mid-session
  useEffect(() => {
    const id = axios.interceptors.response.use(
      (r) => r,
      (err) => {
        if (err?.response?.status === 402 && err?.response?.data?.detail === "ai_quota_exceeded") {
          toast("Monthly AI limit reached", {
            description: "You've used your 10,000 free AI credits. Upgrade to Pro for unlimited access.",
            action: { label: "Upgrade", onClick: () => navigate("/paywall") },
            duration: 6000,
          });
        }
        return Promise.reject(err);
      }
    );
    return () => axios.interceptors.response.eject(id);
  }, [navigate]);

  return (
    <>
      <TrialExpirationBanner />
      <PushPrompt />
      <Routes>
        <Route path="/welcome" element={<WelcomePage />} />
        <Route path="/login/*" element={<LoginPage />} />

        <Route path="/onboarding" element={<OnboardingRoute><OnboardingFlow /></OnboardingRoute>} />
        <Route path="/paywall" element={<OnboardingRoute><PaywallPage /></OnboardingRoute>} />
        <Route path="/payment/success" element={<OnboardingRoute><PaymentSuccess /></OnboardingRoute>} />

        {/* Free for all authenticated users */}
        <Route path="/home" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
        <Route path="/timer" element={<ProtectedRoute><TimerPage /></ProtectedRoute>} />
        <Route path="/library" element={<ProtectedRoute><LibraryPage /></ProtectedRoute>} />
        <Route path="/sessions/:sessionId" element={<ProtectedRoute><SessionDetailPage /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
        <Route path="/leaderboard" element={<ProtectedRoute><LeaderboardPage /></ProtectedRoute>} />

        {/* AI-heavy features — subscription required at point of use */}
        <Route path="/train" element={<ProtectedRoute><SubscriptionGate feature="AI training analysis"><TrainPage /></SubscriptionGate></ProtectedRoute>} />
        <Route path="/score" element={<ProtectedRoute><SubscriptionGate feature="AI session scoring"><ScorePage /></SubscriptionGate></ProtectedRoute>} />
        <Route path="/score/results" element={<ProtectedRoute><SubscriptionGate feature="AI session results"><SessionResultsPage /></SubscriptionGate></ProtectedRoute>} />

        {/* Social / Network features — free tier */}
        <Route path="/feed" element={<ProtectedRoute><FeedPage /></ProtectedRoute>} />
        <Route path="/discover" element={<ProtectedRoute><DiscoverPage /></ProtectedRoute>} />
        <Route path="/post/create" element={<ProtectedRoute><CreatePostPage /></ProtectedRoute>} />
        <Route path="/gyms" element={<ProtectedRoute><GymsPage /></ProtectedRoute>} />
        <Route path="/gyms/:gymId" element={<ProtectedRoute><GymDetailPage /></ProtectedRoute>} />
        <Route path="/compete" element={<ProtectedRoute><CompetitionsPage /></ProtectedRoute>} />
        <Route path="/compete/:compId" element={<ProtectedRoute><CompetitionDetailPage /></ProtectedRoute>} />
        <Route path="/profile/:userId" element={<ProtectedRoute><PublicProfilePage /></ProtectedRoute>} />

        {/* Live Streaming */}
        <Route path="/live" element={<ProtectedRoute><LiveFeedPage /></ProtectedRoute>} />
        <Route path="/stream/:streamId" element={<ProtectedRoute><StreamViewPage /></ProtectedRoute>} />
        <Route path="/go-live" element={<ProtectedRoute><GoLivePage /></ProtectedRoute>} />
        <Route path="/emotes" element={<ProtectedRoute><EmoteStudioPage /></ProtectedRoute>} />
        <Route path="/dashboard" element={<ProtectedRoute><StreamerDashboardPage /></ProtectedRoute>} />
        <Route path="/tokens" element={<ProtectedRoute><TokensPage /></ProtectedRoute>} />
        <Route path="/tokens/success" element={<ProtectedRoute><TokenSuccessPage /></ProtectedRoute>} />
        <Route path="/clips" element={<ProtectedRoute><TrendingClipsPage /></ProtectedRoute>} />
        <Route path="/clip/:postId" element={<ProtectedRoute><TrendingClipsPage /></ProtectedRoute>} />

        {/* Advertiser onboarding — public, no auth required */}
        <Route path="/advertise" element={<AdvertisePage />} />
        <Route path="/advertise/success" element={<AdvertisePage success />} />

        <Route path="/" element={<RootRedirect />} />
        <Route path="*" element={<NotFoundPage />} />
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
            <FeedbackWidget />
            <Toaster position="top-center" toastOptions={{ style: { background: "#12121A", border: "1px solid #2A2A3A", color: "#F0F0F5" } }} />
          </AuthProvider>
        </BrowserRouter>
      </div>
    </ClerkProvider>
  );
}

export default App;
