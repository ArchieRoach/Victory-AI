import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API, useAuth } from "@/App";
import { toast } from "sonner";
import { ChevronRight } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const EXPERIENCE_LEVELS = [
  "Total beginner",
  "Training under 6 months",
  "6–18 months",
  "1–3 years",
  "3+ years",
];

const PRIMARY_GOALS = [
  "Get better overall",
  "Improve defence",
  "Sharpen my offence",
  "Prepare for sparring",
  "Just having fun",
];

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
    experience_level: "Training under 6 months",
    primary_goal: "Get better overall",
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

      // Get user data
      const userResponse = await axios.get(`${API}/auth/me`, {
        withCredentials: true,
      });

      login(userResponse.data, response.data.access_token);
      localStorage.setItem("victory_onboarded", "true");
      toast.success("Welcome to Victory AI!");
      navigate("/home", { replace: true });
    } catch (error) {
      const message = error.response?.data?.detail || "Registration failed";
      toast.error(message);
    } finally {
      setLoading(false);
    }
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
            <div
              className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-victory-lime text-victory-bg font-heading text-3xl font-extrabold"
              data-testid="app-logo"
            >
              VA
            </div>
          </div>

          {/* Headlines */}
          <h1
            className="text-4xl sm:text-5xl font-heading font-extrabold text-victory-text mb-4"
            data-testid="welcome-headline"
          >
            Know exactly what to fix.
          </h1>
          <p className="text-lg text-victory-muted mb-8">
            Score your technique. Track your progress. Train smarter.
          </p>

          {/* Placeholder Radar Preview */}
          <div className="victory-card p-6 mb-8">
            <svg
              viewBox="0 0 200 200"
              className="w-full max-w-[200px] mx-auto"
              data-testid="radar-preview"
            >
              {/* Grid lines */}
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

              {/* Data polygon */}
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

              {/* Center score */}
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
              <span className="text-victory-lime text-lg">⚡</span>
              <span>Score yourself across 16 technique dimensions</span>
            </li>
            <li className="flex items-start gap-3 text-victory-text">
              <span className="text-victory-teal text-lg">📈</span>
              <span>See your progress over time</span>
            </li>
            <li className="flex items-start gap-3 text-victory-text">
              <span className="text-victory-orange text-lg">🥊</span>
              <span>Get drills for your weakest areas</span>
            </li>
          </ul>

          {/* CTA Button */}
          <button
            onClick={() => setShowForm(true)}
            className="victory-btn-primary flex items-center justify-center gap-2"
            data-testid="setup-profile-btn"
          >
            Set Up My Profile
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
            Build Your Profile
          </h2>
          <p className="text-victory-muted mb-8">
            Tell us a bit about yourself to personalize your experience.
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="victory-label">What should we call you?</label>
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
                placeholder="Create a password"
                className="victory-input"
                data-testid="password-input"
              />
            </div>

            <div>
              <label className="victory-label">Experience level</label>
              <Select
                value={formData.experience_level}
                onValueChange={(value) =>
                  setFormData({ ...formData, experience_level: value })
                }
              >
                <SelectTrigger
                  className="victory-input"
                  data-testid="experience-select"
                >
                  <SelectValue placeholder="Select experience" />
                </SelectTrigger>
                <SelectContent className="bg-victory-card border-victory-border">
                  {EXPERIENCE_LEVELS.map((level) => (
                    <SelectItem
                      key={level}
                      value={level}
                      className="text-victory-text hover:bg-victory-card-highlight"
                    >
                      {level}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="victory-label">Primary goal</label>
              <Select
                value={formData.primary_goal}
                onValueChange={(value) =>
                  setFormData({ ...formData, primary_goal: value })
                }
              >
                <SelectTrigger
                  className="victory-input"
                  data-testid="goal-select"
                >
                  <SelectValue placeholder="Select goal" />
                </SelectTrigger>
                <SelectContent className="bg-victory-card border-victory-border">
                  {PRIMARY_GOALS.map((goal) => (
                    <SelectItem
                      key={goal}
                      value={goal}
                      className="text-victory-text hover:bg-victory-card-highlight"
                    >
                      {goal}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="victory-btn-primary mt-8"
              data-testid="submit-profile-btn"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-5 h-5 border-2 border-victory-bg border-t-transparent rounded-full animate-spin" />
                  Creating...
                </span>
              ) : (
                "Build My Profile"
              )}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
