import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API, useAuth } from "@/App";
import { BottomNav } from "@/components/BottomNav";
import { toast } from "sonner";
import { ArrowLeft, LogOut, User, Target, Bell } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

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

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, setUser, logout } = useAuth();
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({
    total_sessions: 0,
    best_score: 0,
    most_improved_dimension: null,
  });
  const [weeklyReminder, setWeeklyReminder] = useState(true);

  const [formData, setFormData] = useState({
    name: user?.name || "",
    experience_level: user?.experience_level || "Training under 6 months",
    primary_goal: user?.primary_goal || "Get better overall",
  });

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await axios.get(`${API}/users/stats`, {
        withCredentials: true,
      });
      setStats(response.data);
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const response = await axios.put(`${API}/users/me`, formData, {
        withCredentials: true,
      });
      setUser(response.data);
      toast.success("Profile updated!");
    } catch (error) {
      toast.error("Failed to update profile");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div
      className="min-h-screen bg-victory-bg pb-nav"
      data-testid="profile-page"
    >
      {/* Header */}
      <header className="p-4 flex items-center gap-4">
        <button
          onClick={() => navigate("/home")}
          className="w-10 h-10 rounded-full bg-victory-card border border-victory-border flex items-center justify-center text-victory-text touch-target"
          data-testid="back-btn"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-heading font-extrabold text-victory-text">
          Profile & Settings
        </h1>
      </header>

      <main className="px-4 space-y-6">
        {/* My Profile Section */}
        <section className="victory-card p-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-full bg-victory-lime flex items-center justify-center">
              {user?.picture ? (
                <img
                  src={user.picture}
                  alt={user.name}
                  className="w-12 h-12 rounded-full object-cover"
                />
              ) : (
                <User className="w-6 h-6 text-victory-bg" />
              )}
            </div>
            <div>
              <h2 className="font-heading font-bold text-victory-text">
                My Profile
              </h2>
              <p className="text-victory-muted text-sm">{user?.email}</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="victory-label">Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                className="victory-input"
                data-testid="name-input"
              />
            </div>

            <div>
              <label className="victory-label">Experience Level</label>
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
                  <SelectValue />
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
              <label className="victory-label">Primary Goal</label>
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
                  <SelectValue />
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
              onClick={handleSave}
              disabled={loading}
              className="victory-btn-primary"
              data-testid="save-profile-btn"
            >
              {loading ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </section>

        {/* Stats Summary */}
        <section className="victory-card p-4">
          <h2 className="font-heading font-bold text-victory-text mb-4 flex items-center gap-2">
            <Target className="w-5 h-5 text-victory-lime" />
            Stats Summary
          </h2>

          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <p className="font-mono text-2xl font-semibold text-victory-lime">
                {stats.total_sessions}
              </p>
              <p className="text-victory-muted text-xs">Total Sessions</p>
            </div>
            <div className="text-center">
              <p className="font-mono text-2xl font-semibold text-victory-lime">
                {stats.best_score ? stats.best_score.toFixed(1) : "—"}
              </p>
              <p className="text-victory-muted text-xs">Best Score</p>
            </div>
            <div className="text-center">
              <p className="font-mono text-sm font-semibold text-victory-lime truncate">
                {stats.most_improved_dimension || "—"}
              </p>
              <p className="text-victory-muted text-xs">Most Improved</p>
            </div>
          </div>
        </section>

        {/* Notifications */}
        <section className="victory-card p-4">
          <h2 className="font-heading font-bold text-victory-text mb-4 flex items-center gap-2">
            <Bell className="w-5 h-5 text-victory-lime" />
            Notifications
          </h2>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-victory-text">Weekly training reminder</p>
              <p className="text-victory-muted text-sm">
                A nudge to keep your streak going
              </p>
            </div>
            <Switch
              checked={weeklyReminder}
              onCheckedChange={setWeeklyReminder}
              data-testid="reminder-toggle"
            />
          </div>
        </section>

        {/* About */}
        <section className="victory-card p-4">
          <h2 className="font-heading font-bold text-victory-text mb-3">
            About Victory AI
          </h2>
          <p className="text-victory-muted text-sm leading-relaxed">
            Victory AI is your personal boxing technique tracker. Score your
            shadowboxing sessions, track your progress over time, and get
            targeted drill recommendations to improve your weakest areas. Train
            smarter, not just harder.
          </p>
        </section>

        {/* Sign Out */}
        <button
          onClick={handleLogout}
          className="victory-btn-ghost w-full flex items-center justify-center gap-2 text-victory-danger border-victory-danger"
          data-testid="logout-btn"
        >
          <LogOut className="w-5 h-5" />
          Sign Out
        </button>
      </main>

      <BottomNav />
    </div>
  );
}
