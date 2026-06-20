import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API, useAuth } from "@/App";
import { BottomNav } from "@/components/BottomNav";
import { LanguageSelector } from "@/components/LanguageSelector";
import { toast } from "sonner";
import { ArrowLeft, LogOut, User, Target, Bell, Trophy, Swords, ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, setUser, logout } = useAuth();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({
    total_sessions: 0,
    best_score: 0,
    most_improved_dimension: null,
  });
  const [weeklyReminder, setWeeklyReminder] = useState(true);

  const EXPERIENCE_LEVELS = [
    "Total beginner",
    "Training under 6 months",
    "6–18 months",
    "1–3 years",
    "3+ years",
  ];

  const goalOptions = useMemo(() => {
    const idx = EXPERIENCE_LEVELS.indexOf(formData.experience_level);
    const isIntermediate = idx >= 3; // 1–3 years+
    const isAdvanced = idx >= 4;     // 3+ years
    const hasRecord = extendedForm.amateur_wins > 0 || extendedForm.amateur_losses > 0 || extendedForm.amateur_draws > 0;

    return [
      // Available to everyone
      "Get better overall",
      "Improve defence",
      "Sharpen my offence",
      "Prepare for sparring",
      "Build my following online",
      "Grow my fanbase as a streamer",
      "Just having fun",
      // 1–3 years+
      ...(isIntermediate ? [
        "Compete in amateurs",
        "Build my gym reputation",
      ] : []),
      // 3+ years
      ...(isAdvanced ? [
        "Go professional",
        "Build my fighter brand",
        "Win a regional / national title",
      ] : []),
      // Has competitive record
      ...(hasRecord || isAdvanced ? [
        "Fund my fight camp",
        "Climb the world rankings",
        "Earn a title shot",
        "Win a world title",
      ] : []),
    ];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.experience_level, extendedForm.amateur_wins, extendedForm.amateur_losses, extendedForm.amateur_draws]);

  const [formData, setFormData] = useState({
    name: user?.name || "",
    experience_level: user?.experience_level || "Training under 6 months",
    primary_goal: user?.primary_goal || "Get better overall",
  });

  const [extendedForm, setExtendedForm] = useState({
    display_name: user?.display_name || "",
    bio: user?.bio || "",
    weight_class: user?.weight_class || "",
    stance: user?.stance || "",
    amateur_wins: user?.amateur_wins ?? 0,
    amateur_losses: user?.amateur_losses ?? 0,
    amateur_draws: user?.amateur_draws ?? 0,
  });
  const [savingExtended, setSavingExtended] = useState(false);

  useEffect(() => {
    fetchStats();
  }, []);

  // Reset goal if it's no longer in the current tier's options
  useEffect(() => {
    if (!goalOptions.includes(formData.primary_goal)) {
      setFormData((prev) => ({ ...prev, primary_goal: "Get better overall" }));
    }
  }, [goalOptions]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchStats = async () => {
    try {
      const response = await axios.get(`${API}/users/stats`, { withCredentials: true });
      setStats(response.data);
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const response = await axios.put(`${API}/users/me`, formData, { withCredentials: true });
      setUser(response.data);
      toast.success(t("profile.saved"));
    } catch (error) {
      toast.error(t("profile.saveFailed"));
    } finally {
      setLoading(false);
    }
  };

  const handleSaveExtended = async () => {
    setSavingExtended(true);
    try {
      await axios.put(`${API}/users/profile`, extendedForm);
      toast.success(t("profile.saved"));
    } catch {
      toast.error(t("profile.saveFailed"));
    } finally {
      setSavingExtended(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-victory-bg pb-nav" data-testid="profile-page">
      <header className="p-4 flex items-center gap-4">
        <button
          onClick={() => navigate("/home")}
          className="w-10 h-10 rounded-full bg-victory-card border border-victory-border flex items-center justify-center text-victory-text touch-target"
          data-testid="back-btn"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-heading font-extrabold text-victory-text">
          {t("profile.title")}
        </h1>
      </header>

      <main className="px-4 space-y-6">
        {/* My Profile Section */}
        <section className="victory-card p-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-full bg-victory-lime flex items-center justify-center">
              {user?.picture ? (
                <img src={user.picture} alt={user.name} className="w-12 h-12 rounded-full object-cover" />
              ) : (
                <User className="w-6 h-6 text-victory-bg" />
              )}
            </div>
            <div>
              <h2 className="font-heading font-bold text-victory-text">{t("profile.myProfile")}</h2>
              <p className="text-victory-muted text-sm">{user?.email}</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="victory-label">{t("profile.nameLabel")}</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="victory-input"
                data-testid="name-input"
              />
            </div>

            <div>
              <label className="victory-label">{t("profile.experienceLabel")}</label>
              <Select
                value={formData.experience_level}
                onValueChange={(value) => setFormData({ ...formData, experience_level: value })}
              >
                <SelectTrigger className="victory-input" data-testid="experience-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-victory-card border-victory-border">
                  {EXPERIENCE_LEVELS.map((level) => (
                    <SelectItem key={level} value={level} className="text-victory-text hover:bg-victory-card-highlight">
                      {t(`profile.experienceLevels.${level}`, level)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="victory-label">{t("profile.goalLabel")}</label>
              <Select
                value={formData.primary_goal}
                onValueChange={(value) => setFormData({ ...formData, primary_goal: value })}
              >
                <SelectTrigger className="victory-input" data-testid="goal-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-victory-card border-victory-border">
                  {goalOptions.map((goal) => (
                    <SelectItem key={goal} value={goal} className="text-victory-text hover:bg-victory-card-highlight">
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
              {loading ? t("profile.saving") : t("profile.save")}
            </button>
          </div>
        </section>

        {/* Stats Summary */}
        <section className="victory-card p-4">
          <h2 className="font-heading font-bold text-victory-text mb-4 flex items-center gap-2">
            <Target className="w-5 h-5 text-victory-lime" />
            {t("profile.statsTitle")}
          </h2>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <p className="font-mono text-2xl font-semibold text-victory-lime">{stats.total_sessions}</p>
              <p className="text-victory-muted text-xs">{t("profile.totalSessions")}</p>
            </div>
            <div className="text-center">
              <p className="font-mono text-2xl font-semibold text-victory-lime">
                {stats.best_score ? stats.best_score.toFixed(1) : "—"}
              </p>
              <p className="text-victory-muted text-xs">{t("profile.bestScore")}</p>
            </div>
            <div className="text-center">
              <p className="font-mono text-sm font-semibold text-victory-lime truncate">
                {stats.most_improved_dimension || "—"}
              </p>
              <p className="text-victory-muted text-xs">{t("profile.mostImproved")}</p>
            </div>
          </div>
        </section>

        {/* Fighter Profile — real world + virtual record */}
        <section className="victory-card p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-heading font-bold text-victory-text flex items-center gap-2">
              <Trophy className="w-5 h-5 text-victory-lime" />
              {t("profile.fighterProfile")}
            </h2>
            <button
              onClick={() => navigate(`/profile/${user?.user_id}`)}
              className="text-xs text-victory-muted flex items-center gap-1 hover:text-victory-lime"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              {t("profile.viewPublic")}
            </button>
          </div>

          <div>
            <label className="victory-label">{t("profile.displayName")}</label>
            <input
              value={extendedForm.display_name}
              onChange={(e) => setExtendedForm({ ...extendedForm, display_name: e.target.value })}
              className="victory-input"
              placeholder={user?.name || ""}
              maxLength={30}
            />
          </div>

          <div>
            <label className="victory-label">{t("profile.bio")}</label>
            <textarea
              value={extendedForm.bio}
              onChange={(e) => setExtendedForm({ ...extendedForm, bio: e.target.value })}
              className="victory-input resize-none"
              rows={2}
              placeholder={t("profile.bioPlaceholder")}
              maxLength={160}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="victory-label">{t("profile.weightClass")}</label>
              <select
                value={extendedForm.weight_class}
                onChange={(e) => setExtendedForm({ ...extendedForm, weight_class: e.target.value })}
                className="victory-input"
              >
                <option value="">—</option>
                {["Minimumweight","Light Flyweight","Flyweight","Super Flyweight","Bantamweight","Super Bantamweight","Featherweight","Super Featherweight","Lightweight","Super Lightweight","Welterweight","Super Welterweight","Middleweight","Super Middleweight","Light Heavyweight","Cruiserweight","Heavyweight","Super Heavyweight"].map((w) => (
                  <option key={w} value={w}>{w}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="victory-label">{t("profile.stance")}</label>
              <select
                value={extendedForm.stance}
                onChange={(e) => setExtendedForm({ ...extendedForm, stance: e.target.value })}
                className="victory-input"
              >
                <option value="">—</option>
                <option value="orthodox">{t("profile.orthodox")}</option>
                <option value="southpaw">{t("profile.southpaw")}</option>
              </select>
            </div>
          </div>

          {/* Amateur record */}
          <div>
            <p className="victory-label mb-2">{t("profile.amateurRecord")}</p>
            <div className="grid grid-cols-3 gap-2">
              {["amateur_wins", "amateur_losses", "amateur_draws"].map((field) => (
                <div key={field} className="text-center">
                  <input
                    type="number"
                    min={0}
                    max={999}
                    value={extendedForm[field]}
                    onChange={(e) => setExtendedForm({ ...extendedForm, [field]: Math.max(0, Number(e.target.value)) })}
                    className="victory-input text-center font-mono text-lg"
                  />
                  <p className="text-victory-muted text-xs mt-1">{t(`profile.${field}`)}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Virtual competition record */}
          <div>
            <p className="victory-label mb-2">{t("profile.virtualRecord")}</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="victory-card p-3 text-center">
                <p className="font-mono font-bold text-xl text-victory-lime">{user?.competition_wins || 0}</p>
                <p className="text-victory-muted text-xs">{t("profile.competition_wins")}</p>
              </div>
              <div className="victory-card p-3 text-center">
                <p className="font-mono font-bold text-xl text-victory-muted">{user?.competition_losses || 0}</p>
                <p className="text-victory-muted text-xs">{t("profile.competition_losses")}</p>
              </div>
            </div>
          </div>

          <button onClick={handleSaveExtended} disabled={savingExtended} className="victory-btn-primary w-full">
            {savingExtended ? t("common.saving") : t("common.save")}
          </button>
        </section>

        {/* Language */}
        <section className="victory-card p-4">
          <h2 className="font-heading font-bold text-victory-text mb-4">
            {t("profile.language")}
          </h2>
          <LanguageSelector />
        </section>

        {/* Notifications */}
        <section className="victory-card p-4">
          <h2 className="font-heading font-bold text-victory-text mb-4 flex items-center gap-2">
            <Bell className="w-5 h-5 text-victory-lime" />
            {t("profile.notifications")}
          </h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-victory-text">{t("profile.weeklyReminder")}</p>
              <p className="text-victory-muted text-sm">{t("profile.weeklyReminderDesc")}</p>
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
          <h2 className="font-heading font-bold text-victory-text mb-3">{t("profile.about")}</h2>
          <p className="text-victory-muted text-sm leading-relaxed">{t("profile.aboutText")}</p>
        </section>

        {/* Sign Out */}
        <button
          onClick={handleLogout}
          className="victory-btn-ghost w-full flex items-center justify-center gap-2 text-victory-danger border-victory-danger"
          data-testid="logout-btn"
        >
          <LogOut className="w-5 h-5" />
          {t("profile.signOut")}
        </button>
      </main>

      <BottomNav />
    </div>
  );
}
