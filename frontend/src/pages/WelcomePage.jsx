import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API, useAuth } from "@/App";
import { toast } from "sonner";
import { ChevronRight } from "lucide-react";

// Placeholder radar data for preview
const PLACEHOLDER_DIMENSIONS = [
  { name: "Jab", value: 7 },
  { name: "Cross", value: 6 },
  { name: "Head Movement", value: 5 },
  { name: "Footwork", value: 8 },
  { name: "Guard", value: 6 },
  { name: "Combinations", value: 7 },
];

export default function WelcomePage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.password) {
      toast.error("Please fill in all fields");
      return;
    }

    setLoading(true);
    try {
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
      
      // Navigate to quiz after registration
      navigate("/onboarding/quiz", { replace: true });
    } catch (error) {
      const message = error.response?.data?.detail || "Registration failed";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    localStorage.setItem("victory_onboarded", "true");
    const redirectUrl = window.location.origin + "/onboarding/quiz";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  return (
    <div
      className="min-h-screen bg-victory-bg flex flex-col items-center justify-center p-6"
      data-testid="welcome-page"
    >
      {!showForm ? (
        <div className="w-full max-w-md text-center animate-fade-in">
          {/* Logo */}
          <div className="mb-8">
            <img
              src="/victory-logo.png"
              alt="Victory AI"
              className="w-48 h-48 mx-auto object-contain"
              data-testid="app-logo"
            />
          </div>

          {/* Headlines */}
          <h1
            className="text-4xl sm:text-5xl font-heading font-extrabold text-victory-text mb-4"
            data-testid="welcome-headline"
          >
            Your AI training partner is waiting.
          </h1>
          <p className="text-lg text-victory-muted mb-8">
            Train with instant feedback. Track your progress. Get better every round.
          </p>

          {/* Placeholder Radar Preview */}
          <div className="victory-card p-6 mb-8">
            <svg
              viewBox="0 0 200 200"
              className="w-full max-w-[200px] mx-auto"
              data-testid="radar-preview"
            >
              {[0.33, 0.66, 1].map((scale, i) => (
                <polygon
                  key={i}
                  points={PLACEHOLDER_DIMENSIONS.map((_, idx) => {
                    const angle = (idx * 60 - 90) * (Math.PI / 180);
                    const r = 80 * scale;
                    return `${100 + r * Math.cos(angle)},${100 + r * Math.sin(angle)}`;
                  }).join(" ")}
                  fill="none"
                  stroke="#2A2A3A"
                  strokeWidth="1"
                />
              ))}
              <polygon
                points={PLACEHOLDER_DIMENSIONS.map((d, idx) => {
                  const angle = (idx * 60 - 90) * (Math.PI / 180);
                  const r = (d.value / 10) * 80;
                  return `${100 + r * Math.cos(angle)},${100 + r * Math.sin(angle)}`;
                }).join(" ")}
                fill="#E8FF47"
                fillOpacity="0.3"
                stroke="#E8FF47"
                strokeWidth="2"
              />
              <text
                x="100"
                y="100"
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-victory-lime font-heading text-2xl font-extrabold"
              >
                6.5
              </text>
            </svg>
          </div>

          {/* Bullet Points */}
          <ul className="text-left space-y-3 mb-10">
            <li className="flex items-start gap-3 text-victory-text">
              <span className="text-victory-lime text-lg">🥊</span>
              <span>AI training partner gives you instant technique feedback</span>
            </li>
            <li className="flex items-start gap-3 text-victory-text">
              <span className="text-victory-teal text-lg">📹</span>
              <span>Auto-record your rounds and track progress</span>
            </li>
            <li className="flex items-start gap-3 text-victory-text">
              <span className="text-victory-orange text-lg">📈</span>
              <span>Get personalized drills for your weakest areas</span>
            </li>
          </ul>

          {/* CTA Button */}
          <button
            onClick={() => setShowForm(true)}
            className="victory-btn-primary flex items-center justify-center gap-2"
            data-testid="setup-profile-btn"
          >
            Get Started
            <ChevronRight className="w-5 h-5" />
          </button>

          {/* Login link */}
          <p className="mt-6 text-victory-muted text-sm">
            Already have an account?{" "}
            <button
              onClick={() => navigate("/login")}
              className="text-victory-lime hover:underline"
              data-testid="login-link"
            >
              Log in
            </button>
          </p>
        </div>
      ) : (
        <div className="w-full max-w-md animate-slide-up">
          <button
            onClick={() => setShowForm(false)}
            className="text-victory-muted mb-6 flex items-center gap-1 hover:text-victory-text"
            data-testid="back-btn"
          >
            ← Back
          </button>

          <h2 className="text-2xl font-heading font-extrabold text-victory-text mb-2">
            Create Your Account
          </h2>
          <p className="text-victory-muted mb-6">
            Quick signup, then we'll match you with your perfect AI training partner.
          </p>

          {/* Google Sign Up */}
          <button
            onClick={handleGoogleLogin}
            className="w-full victory-btn-ghost flex items-center justify-center gap-3 mb-4"
            data-testid="google-signup-btn"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Continue with Google
          </button>

          {/* Divider */}
          <div className="flex items-center gap-4 mb-4">
            <div className="flex-1 h-px bg-victory-border" />
            <span className="text-victory-muted text-sm">or</span>
            <div className="flex-1 h-px bg-victory-border" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="victory-label">Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Your name"
                className="victory-input"
                data-testid="name-input"
              />
            </div>

            <div>
              <label className="victory-label">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
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
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="Create a password"
                className="victory-input"
                data-testid="password-input"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="victory-btn-primary mt-4"
              data-testid="submit-btn"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-5 h-5 border-2 border-victory-bg border-t-transparent rounded-full animate-spin" />
                  Creating...
                </span>
              ) : (
                "Create Account"
              )}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
