import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API, useAuth } from "@/App";
import { toast } from "sonner";

export default function AuthCallback() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const hasProcessed = useRef(false);

  useEffect(() => {
    // Use useRef for the processed flag to prevent race conditions under StrictMode
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const processAuth = async () => {
      try {
        // Extract session_id from URL fragment
        const hash = window.location.hash;
        const params = new URLSearchParams(hash.replace("#", ""));
        const sessionId = params.get("session_id");

        if (!sessionId) {
          toast.error("Authentication failed - no session ID");
          navigate("/login", { replace: true });
          return;
        }

        // Exchange session_id for user data
        const response = await axios.post(
          `${API}/auth/session`,
          { session_id: sessionId },
          { withCredentials: true }
        );

        const userData = response.data;
        login(userData);
        localStorage.setItem("victory_onboarded", "true");
        toast.success("Welcome to Victory AI!");

        // Clear the hash and navigate to home
        window.history.replaceState(null, "", window.location.pathname);
        navigate("/home", { replace: true, state: { user: userData } });
      } catch (error) {
        console.error("Auth callback error:", error);
        toast.error("Authentication failed");
        navigate("/login", { replace: true });
      }
    };

    processAuth();
  }, [login, navigate]);

  return (
    <div className="min-h-screen bg-victory-bg flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-victory-lime border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-victory-muted">Completing sign in...</p>
      </div>
    </div>
  );
}
