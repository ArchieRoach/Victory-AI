import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API, useAuth } from "@/App";
import { toast } from "sonner";

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    name: "",
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.email || !formData.password) {
      toast.error("Please fill in all required fields");
      return;
    }

    setLoading(true);
    try {
      if (isLogin) {
        const response = await axios.post(
          `${API}/auth/login`,
          { email: formData.email, password: formData.password },
          { withCredentials: true }
        );

        const userResponse = await axios.get(`${API}/auth/me`, {
          withCredentials: true,
        });

        login(userResponse.data, response.data.access_token);
        toast.success("Welcome back!");
        navigate("/home", { replace: true });
      } else {
        if (!formData.name) {
          toast.error("Please enter your name");
          setLoading(false);
          return;
        }

        const response = await axios.post(
          `${API}/auth/register`,
          formData,
          { withCredentials: true }
        );

        const userResponse = await axios.get(`${API}/auth/me`, {
          withCredentials: true,
        });

        login(userResponse.data, response.data.access_token);
        localStorage.setItem("victory_onboarded", "true");
        toast.success("Account created!");
        navigate("/home", { replace: true });
      }
    } catch (error) {
      const message = error.response?.data?.detail || "Authentication failed";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/home";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  return (
    <div
      className="min-h-screen bg-victory-bg flex flex-col items-center justify-center p-6"
      data-testid="login-page"
    >
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-victory-lime text-victory-bg font-heading text-2xl font-extrabold mb-4">
            VA
          </div>
          <h1 className="text-3xl font-heading font-extrabold text-victory-text">
            {isLogin ? "Welcome Back" : "Create Account"}
          </h1>
          <p className="text-victory-muted mt-2">
            {isLogin
              ? "Sign in to continue your training"
              : "Start tracking your boxing technique"}
          </p>
        </div>

        {/* Google Login Button */}
        <button
          onClick={handleGoogleLogin}
          className="w-full victory-btn-ghost flex items-center justify-center gap-3 mb-6"
          data-testid="google-login-btn"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="currentColor"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="currentColor"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="currentColor"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          Continue with Google
        </button>

        {/* Divider */}
        <div className="flex items-center gap-4 mb-6">
          <div className="flex-1 h-px bg-victory-border" />
          <span className="text-victory-muted text-sm">or</span>
          <div className="flex-1 h-px bg-victory-border" />
        </div>

        {/* Email/Password Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div>
              <label className="victory-label">Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="Your name"
                className="victory-input"
                data-testid="name-input"
              />
            </div>
          )}

          <div>
            <label className="victory-label">Email</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
              placeholder="your@email.com"
              className="victory-input"
              data-testid="email-input"
            />
          </div>

          <div>
            <label className="victory-label">Password</label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) =>
                setFormData({ ...formData, password: e.target.value })
              }
              placeholder="Your password"
              className="victory-input"
              data-testid="password-input"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="victory-btn-primary"
            data-testid="submit-btn"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-5 h-5 border-2 border-victory-bg border-t-transparent rounded-full animate-spin" />
                {isLogin ? "Signing in..." : "Creating account..."}
              </span>
            ) : isLogin ? (
              "Sign In"
            ) : (
              "Create Account"
            )}
          </button>
        </form>

        {/* Toggle Login/Register */}
        <p className="text-center mt-6 text-victory-muted">
          {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
          <button
            onClick={() => setIsLogin(!isLogin)}
            className="text-victory-lime hover:underline"
            data-testid="toggle-auth-btn"
          >
            {isLogin ? "Sign up" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
}
