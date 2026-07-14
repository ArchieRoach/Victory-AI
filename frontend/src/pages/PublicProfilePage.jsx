import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { formatDistanceToNow, format, isPast } from "date-fns";
import { API, useAuth } from "@/App";
import { BottomNav } from "@/components/BottomNav";
import { toast } from "sonner";
import {
  ArrowLeft, Trophy, Swords, Target, Building2,
  Clapperboard, CalendarDays, Radio, Play, Clock, X, Share2, Flame, Users,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { ShareSheet } from "@/components/ShareSheet";
import { formatWeightClass, getWeightUnit } from "@/utils/weightClasses";

// ── Follow list modal (followers / following) ─────────────────────────────────
function FollowListModal({ userId, mode, onClose, weightUnit = "kg" }) {
  const navigate = useNavigate();
  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const endpoint = mode === "followers"
      ? `${API}/users/${userId}/followers`
      : `${API}/users/${userId}/following`;
    axios.get(endpoint)
      .then((r) => setUsers(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId, mode]);

  const [followState, setFollowState] = useState({});

  const handleFollow = async (targetId, currentlyFollowing) => {
    setFollowState((s) => ({ ...s, [targetId]: "busy" }));
    try {
      if (currentlyFollowing) {
        await axios.delete(`${API}/follows/${targetId}`);
        setFollowState((s) => ({ ...s, [targetId]: false }));
      } else {
        await axios.post(`${API}/follows/${targetId}`);
        setFollowState((s) => ({ ...s, [targetId]: true }));
      }
    } catch {
      setFollowState((s) => { const n = { ...s }; delete n[targetId]; return n; });
    }
  };

  const isFollowing = (u) => {
    if (followState[u.user_id] !== undefined) return followState[u.user_id];
    return u.is_following;
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Sheet */}
      <div
        className="relative mt-auto bg-victory-bg rounded-t-2xl max-h-[70vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle + header */}
        <div className="flex items-center justify-between px-4 pt-3 pb-3 border-b border-victory-border">
          <div className="w-10 h-1 rounded-full bg-victory-border absolute top-2 left-1/2 -translate-x-1/2" />
          <p className="text-victory-text font-bold capitalize mt-1">{mode}</p>
          <button onClick={onClose} aria-label="Close" className="w-11 h-11 flex items-center justify-center touch-target text-victory-muted hover:text-victory-text">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 pb-6">
          {loading ? (
            <div className="flex justify-center py-10">
              <div className="w-6 h-6 border-2 border-victory-lime border-t-transparent rounded-full animate-spin" />
            </div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center text-center py-12 px-6">
              <Users className="w-8 h-8 text-victory-muted mb-3" />
              <p className="text-victory-text font-bold">No {mode} yet</p>
              <p className="text-victory-muted text-sm mt-1">
                {mode === "followers" ? "When people follow this fighter, they'll show up here." : "Fighters this account follows will show up here."}
              </p>
            </div>
          ) : (
            users.map((u) => (
              <div key={u.user_id} className="flex items-center gap-3 px-4 py-3 border-b border-victory-border last:border-0">
                <button onClick={() => { onClose(); navigate(`/profile/${u.user_id}`); }} className="flex items-center gap-3 flex-1 min-w-0">
                  {u.avatar_url ? (
                    <img src={u.avatar_url} alt={u.display_name} className="w-10 h-10 rounded-full object-cover border border-victory-border flex-shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-victory-lime/20 flex items-center justify-center text-victory-lime font-bold flex-shrink-0">
                      {(u.display_name || u.name || "F")[0].toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-victory-text font-semibold text-sm truncate">{u.display_name || u.name}</p>
                    {u.weight_class && <p className="text-victory-muted text-xs">{formatWeightClass(u.weight_class, weightUnit)}</p>}
                  </div>
                </button>
                <button
                  onClick={() => handleFollow(u.user_id, isFollowing(u))}
                  disabled={followState[u.user_id] === "busy"}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors disabled:opacity-50 ${
                    isFollowing(u)
                      ? "border-victory-border text-victory-muted"
                      : "border-victory-lime text-victory-lime hover:bg-victory-lime/10"
                  }`}
                >
                  {followState[u.user_id] === "busy" ? "…" : isFollowing(u) ? "Following" : "Follow"}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function timeAgo(str) {
  try { return formatDistanceToNow(new Date(str), { addSuffix: true }); }
  catch { return ""; }
}

// ── Clips grid ────────────────────────────────────────────────────────────────
export function ClipsTab({ userId }) {
  const [clips,       setClips]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [playing,     setPlaying]     = useState(null);
  const [shareTarget, setShareTarget] = useState(null);

  useEffect(() => {
    axios.get(`${API}/users/${userId}/clips`)
      .then((r) => setClips(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId]);

  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-px mt-px">
        {[1,2,3,4,5,6].map((i) => (
          <div key={i} className="aspect-square skeleton-shimmer" />
        ))}
      </div>
    );
  }

  if (clips.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-8 text-center gap-4">
        <div className="w-16 h-16 rounded-full bg-victory-card border border-victory-border flex items-center justify-center">
          <Clapperboard className="w-8 h-8 text-victory-muted" />
        </div>
        <div>
          <p className="text-victory-text font-bold text-lg">No clips yet</p>
          <p className="text-victory-muted text-sm mt-1">Clips will appear here once uploaded.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {shareTarget && (
        <ShareSheet
          post={shareTarget}
          onClose={() => setShareTarget(null)}
          onShared={(count) => setClips((prev) => prev.map((c) => c.post_id === shareTarget.post_id ? { ...c, share_count: count } : c))}
        />
      )}

      <div className="grid grid-cols-3 gap-px">
        {clips.map((clip) => (
          <button
            key={clip.post_id}
            onClick={() => setPlaying(playing === clip.post_id ? null : clip.post_id)}
            className="relative aspect-square bg-black overflow-hidden group"
          >
            {clip.thumbnail_url ? (
              <img src={clip.thumbnail_url} alt={clip.caption || "Clip"}
                className="w-full h-full object-cover group-hover:opacity-80 transition-opacity" />
            ) : (
              <video src={clip.video_url} className="w-full h-full object-cover" preload="none" />
            )}
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
              <Play className="w-10 h-10 text-white drop-shadow-lg" />
            </div>
            <div className="absolute bottom-1 left-1 flex items-center gap-1">
              <div className="bg-black/60 backdrop-blur-sm text-white text-[10px] px-1.5 py-0.5 rounded font-mono">
                ▶ {clip.like_count || 0}
              </div>
            </div>
            {(clip.share_count || 0) >= 50 && (
              <div className="absolute top-1 right-1">
                <span className="flex items-center gap-0.5 bg-orange-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                  <Flame className="w-2.5 h-2.5" />
                </span>
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Expanded clip player */}
      {playing && (() => {
        const clip = clips.find((c) => c.post_id === playing);
        if (!clip) return null;
        return (
          <div className="mt-4 mx-4 victory-card overflow-hidden">
            <video src={clip.video_url} controls autoPlay
              className="w-full aspect-video object-contain bg-black" />
            {clip.caption && (
              <p className="px-4 py-3 text-victory-text text-sm">{clip.caption}</p>
            )}
            <div className="flex items-center justify-between px-4 pb-3">
              <div className="flex items-center gap-3">
                <span className="text-victory-muted text-xs">{timeAgo(clip.created_at)}</span>
                {clip.tags?.map((t) => (
                  <span key={t} className="text-[10px] bg-victory-lime/10 text-victory-lime px-2 py-0.5 rounded-full">
                    #{t}
                  </span>
                ))}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setShareTarget(clip); }}
                className={`flex items-center gap-1.5 text-xs font-semibold transition-colors ${(clip.share_count || 0) > 0 ? "text-orange-400" : "text-victory-muted hover:text-orange-400"}`}
              >
                <Share2 className="w-4 h-4" />
                {clip.share_count > 0 ? clip.share_count : "Share"}
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ── Schedule list ─────────────────────────────────────────────────────────────
export function ScheduleTab({ userId, isOwn, onScheduleChange, weightUnit = "kg" }) {
  const navigate = useNavigate();
  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form,   setForm]     = useState({
    title: "", description: "", scheduled_at: "", category: "", weight_class: "",
  });
  const [saving, setSaving] = useState(false);

  const fetch = useCallback(() => {
    setLoading(true);
    axios.get(`${API}/users/${userId}/schedule`)
      .then((r) => setItems(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId]);

  useEffect(() => { fetch(); }, [fetch]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.scheduled_at) {
      toast.error("Title and date/time are required");
      return;
    }
    setSaving(true);
    try {
      await axios.post(`${API}/streams/schedule`, {
        ...form,
        scheduled_at: new Date(form.scheduled_at).toISOString(),
      });
      toast.success("Stream scheduled!");
      setShowForm(false);
      setForm({ title: "", description: "", scheduled_at: "", category: "", weight_class: "" });
      fetch();
      onScheduleChange?.();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not schedule stream");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`${API}/streams/schedule/${id}`);
      setItems((prev) => prev.filter((i) => i.schedule_id !== id));
      onScheduleChange?.();
    } catch {
      toast.error("Could not remove scheduled stream");
    }
  };

  // Minimum datetime string for the input (now + 5 min)
  const minDt = new Date(Date.now() + 5 * 60 * 1000).toISOString().slice(0, 16);

  return (
    <div className="pb-6">
      {/* Own user: create button */}
      {isOwn && (
        <div className="px-4 py-4 border-b border-victory-border">
          {!showForm ? (
            <button
              onClick={() => setShowForm(true)}
              className="w-full victory-btn-primary py-3 flex items-center justify-center gap-2 font-bold"
            >
              <CalendarDays className="w-4 h-4" />
              Schedule a Stream
            </button>
          ) : (
            <form onSubmit={handleCreate} className="space-y-3">
              <p className="text-victory-text font-semibold text-sm">New Scheduled Stream</p>

              <div>
                <label className="victory-label">Stream Title</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Saturday Morning Sparring Session"
                  className="victory-input"
                  maxLength={120}
                  required
                />
              </div>

              <div>
                <label className="victory-label">Date &amp; Time</label>
                <input
                  type="datetime-local"
                  value={form.scheduled_at}
                  min={minDt}
                  onChange={(e) => setForm((f) => ({ ...f, scheduled_at: e.target.value }))}
                  className="victory-input"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="victory-label">Category</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                    className="victory-input"
                  >
                    <option value="">Any</option>
                    <option value="Amateur">Amateur</option>
                    <option value="Professional">Professional</option>
                    <option value="Training">Training</option>
                    <option value="Sparring">Sparring</option>
                  </select>
                </div>
                <div>
                  <label className="victory-label">Weight Class</label>
                  <select
                    value={form.weight_class}
                    onChange={(e) => setForm((f) => ({ ...f, weight_class: e.target.value }))}
                    className="victory-input"
                  >
                    <option value="">Any</option>
                    {["Strawweight","Flyweight","Bantamweight","Featherweight","Lightweight","Welterweight","Middleweight","Light Heavyweight","Heavyweight"].map((w) => (
                      <option key={w} value={w}>{w}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="victory-label">Description <span className="text-victory-muted font-normal">(optional)</span></label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="What's this session about?"
                  rows={2}
                  maxLength={300}
                  className="victory-input resize-none"
                />
              </div>

              <div className="flex gap-3">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 victory-btn-ghost py-3 text-sm font-semibold">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 victory-btn-primary py-3 text-sm font-bold disabled:opacity-50">
                  {saving ? "Saving…" : "Schedule"}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Schedule list */}
      {loading ? (
        <div className="px-4 pt-4 space-y-3">
          {[1,2,3].map((i) => <div key={i} className="skeleton-shimmer h-20 rounded-xl" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 px-8 text-center gap-4">
          <div className="w-16 h-16 rounded-full bg-victory-card border border-victory-border flex items-center justify-center">
            <CalendarDays className="w-8 h-8 text-victory-muted" />
          </div>
          <div>
            <p className="text-victory-text font-bold text-lg">No scheduled streams</p>
            <p className="text-victory-muted text-sm mt-1">
              {isOwn ? "Schedule your next session above." : "This channel has no upcoming streams."}
            </p>
          </div>
        </div>
      ) : (
        <div className="px-4 pt-4 space-y-3">
          {items.map((item) => {
            const dt    = new Date(item.scheduled_at);
            const soon  = !isPast(dt) && (dt - Date.now()) < 24 * 60 * 60 * 1000; // within 24h
            return (
              <div key={item.schedule_id}
                className={`victory-card p-4 flex items-start gap-4 ${soon ? "border-victory-lime/40 bg-victory-lime/5" : ""}`}>
                {/* Date block */}
                <div className={`flex-shrink-0 w-14 rounded-xl flex flex-col items-center py-2 ${soon ? "bg-victory-lime text-black" : "bg-victory-card-highlight text-victory-text"}`}>
                  <span className="text-[10px] font-bold uppercase tracking-wide">
                    {format(dt, "MMM")}
                  </span>
                  <span className="text-2xl font-extrabold font-mono leading-tight">
                    {format(dt, "d")}
                  </span>
                  <span className="text-[10px] font-semibold">
                    {format(dt, "HH:mm")}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-victory-text font-bold text-sm leading-tight truncate">{item.title}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {item.category && (
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        item.category === "Professional" ? "bg-victory-lime/20 text-victory-lime" : "bg-victory-card text-victory-muted border border-victory-border"
                      }`}>{item.category}</span>
                    )}
                    {item.weight_class && (
                      <span className="text-[10px] text-victory-muted bg-victory-card border border-victory-border px-2 py-0.5 rounded-full">
                        {formatWeightClass(item.weight_class, weightUnit)}
                      </span>
                    )}
                    {soon && (
                      <span className="flex items-center gap-1 text-[10px] text-victory-lime font-semibold">
                        <Clock className="w-3 h-3" />
                        Soon
                      </span>
                    )}
                  </div>
                  {item.description && (
                    <p className="text-victory-muted text-xs mt-1.5 line-clamp-2">{item.description}</p>
                  )}
                  <p className="text-victory-muted text-xs mt-1.5 flex items-center gap-1">
                    <Radio className="w-3 h-3" />
                    {format(dt, "EEEE, d MMMM yyyy · HH:mm")}
                  </p>
                </div>

                {/* Own: delete button */}
                {isOwn && (
                  <button
                    onClick={() => handleDelete(item.schedule_id)}
                    className="flex-shrink-0 text-victory-muted hover:text-red-400 transition-colors text-xs py-1"
                  >
                    Remove
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main public profile page ───────────────────────────────────────────────────
export default function PublicProfilePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { userId } = useParams();
  const { user: currentUser } = useAuth();
  const weightUnit = getWeightUnit(currentUser);
  const [profile,       setProfile]       = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [loadError,     setLoadError]     = useState(false);
  const [following,     setFollowing]     = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [tab,           setTab]           = useState("home"); // "home" | "clips" | "schedule"
  const [followModal,   setFollowModal]   = useState(null);  // "followers" | "following" | null

  const isOwn = userId === currentUser?.user_id;

  useEffect(() => {
    if (isOwn) { navigate("/profile", { replace: true }); return; }
    fetchProfile();
  }, [userId]);

  const fetchProfile = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await axios.get(`${API}/users/${userId}/profile`);
      setProfile(res.data);
      setFollowing(res.data.is_following);
    } catch (err) {
      // On a deep link there's no history to go back to, so show an error state
      // instead of silently rendering a blank page.
      toast.error(err.response?.data?.detail || t("common.error"));
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  const toggleFollow = async () => {
    setFollowLoading(true);
    try {
      if (following) {
        await axios.delete(`${API}/follows/${userId}`);
        setFollowing(false);
        setProfile((p) => p ? { ...p, follower_count: p.follower_count - 1 } : p);
      } else {
        await axios.post(`${API}/follows/${userId}`);
        setFollowing(true);
        setProfile((p) => p ? { ...p, follower_count: p.follower_count + 1 } : p);
      }
    } catch { toast.error(t("common.error")); }
    finally { setFollowLoading(false); }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-victory-bg pb-nav">
        <div className="p-4 space-y-4">
          <div className="skeleton-shimmer h-24 rounded-xl" />
          <div className="skeleton-shimmer h-32 rounded-xl" />
          <div className="skeleton-shimmer h-48 rounded-xl" />
        </div>
        <BottomNav />
      </div>
    );
  }
  if (!profile) {
    return (
      <div className="min-h-screen bg-victory-bg pb-nav flex flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-victory-muted">
          {loadError ? t("publicProfile.notFound", "This fighter's profile couldn't be loaded.") : t("common.error")}
        </p>
        <button
          onClick={() => navigate("/discover")}
          className="px-5 py-2 rounded-full bg-victory-lime text-black font-semibold"
        >
          {t("publicProfile.browseFighters", "Browse fighters")}
        </button>
        <BottomNav />
      </div>
    );
  }

  const displayName    = profile.display_name || profile.name || t("publicProfile.unknownFighter");
  const hasRealRecord  = profile.amateur_wins > 0 || profile.amateur_losses > 0 || profile.amateur_draws > 0;
  const hasVirtRecord  = profile.competition_wins > 0 || profile.competition_losses > 0;

  const TABS = [
    { key: "home",     label: "Home" },
    { key: "clips",    label: `Clips${profile.clip_count > 0 ? ` (${profile.clip_count})` : ""}` },
    { key: "schedule", label: `Schedule${profile.upcoming_stream_count > 0 ? ` · ${profile.upcoming_stream_count}` : ""}` },
  ];

  return (
    <div className="min-h-screen bg-victory-bg pb-nav" data-testid="public-profile-page">

      {followModal && (
        <FollowListModal
          userId={userId}
          mode={followModal}
          onClose={() => setFollowModal(null)}
          weightUnit={weightUnit}
        />
      )}

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header className="p-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)}
          className="w-10 h-10 rounded-full bg-victory-card border border-victory-border flex items-center justify-center touch-target">
          <ArrowLeft className="w-5 h-5 text-victory-text" />
        </button>
        <h1 className="text-lg font-heading font-bold text-victory-text flex-1 truncate">{displayName}</h1>
        <button
          onClick={toggleFollow}
          disabled={followLoading}
          className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
            following
              ? "border border-victory-border text-victory-muted"
              : "bg-victory-lime text-victory-bg"
          }`}
        >
          {followLoading ? "…" : following ? t("publicProfile.following") : t("publicProfile.follow")}
        </button>
      </header>

      {/* ── Profile card (always visible) ────────────────────────────────── */}
      <div className="px-4 pb-4">
        <div className="victory-card p-4">
          <div className="flex items-start gap-4">
            {profile.picture || profile.avatar_url ? (
              <img src={profile.avatar_url || profile.picture} alt={displayName}
                className="w-16 h-16 rounded-full object-cover border-2 border-victory-lime flex-shrink-0" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-victory-lime flex items-center justify-center flex-shrink-0">
                <span className="text-victory-bg font-bold text-2xl">{displayName[0]?.toUpperCase()}</span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h2 className="font-heading font-bold text-xl text-victory-text truncate">{displayName}</h2>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {profile.stance && (
                  <span className="text-xs text-victory-muted bg-victory-card border border-victory-border px-2 py-0.5 rounded-full capitalize">{profile.stance}</span>
                )}
                {profile.weight_class && (
                  <span className="text-xs text-victory-muted bg-victory-card border border-victory-border px-2 py-0.5 rounded-full">
                    {formatWeightClass(profile.weight_class, weightUnit)}
                  </span>
                )}
              </div>
              {profile.bio && <p className="text-victory-muted text-sm mt-2 leading-relaxed">{profile.bio}</p>}
            </div>
          </div>
          {/* Follower stats */}
          <div className="flex gap-6 mt-4 pt-4 border-t border-victory-border">
            <button onClick={() => setFollowModal("followers")} className="text-center hover:opacity-70 transition-opacity">
              <p className="font-mono font-bold text-victory-text">{profile.follower_count}</p>
              <p className="text-victory-muted text-xs">{t("publicProfile.followers")}</p>
            </button>
            <button onClick={() => setFollowModal("following")} className="text-center hover:opacity-70 transition-opacity">
              <p className="font-mono font-bold text-victory-text">{profile.following_count}</p>
              <p className="text-victory-muted text-xs">{t("publicProfile.following")}</p>
            </button>
            {profile.gym && (
              <button onClick={() => navigate(`/gyms/${profile.gym.gym_id}`)}
                className="flex items-center gap-1.5 text-victory-lime text-sm">
                <Building2 className="w-4 h-4" />
                {profile.gym.name}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Tab bar ───────────────────────────────────────────────────────── */}
      <div className="sticky top-0 bg-victory-bg/95 backdrop-blur-sm border-b border-victory-border z-10">
        <div className="flex overflow-x-auto scrollbar-hide px-4">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-shrink-0 pb-3 pr-6 pt-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
                tab === t.key
                  ? "border-victory-lime text-victory-lime"
                  : "border-transparent text-victory-muted hover:text-victory-text"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab content ──────────────────────────────────────────────────── */}

      {tab === "home" && (
        <main className="px-4 pt-4 space-y-4 pb-4">
          {/* Stats */}
          <section className="victory-card p-4">
            <h2 className="font-heading font-bold text-victory-text mb-3 flex items-center gap-2">
              <Target className="w-5 h-5 text-victory-lime" />
              {t("publicProfile.appStats")}
            </h2>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center">
                <p className="font-mono font-bold text-xl text-victory-lime">{profile.total_sessions}</p>
                <p className="text-victory-muted text-xs">{t("publicProfile.sessions")}</p>
              </div>
              <div className="text-center">
                <p className="font-mono font-bold text-xl text-victory-lime">{profile.avg_score?.toFixed(1) || "—"}</p>
                <p className="text-victory-muted text-xs">{t("publicProfile.avgScore")}</p>
              </div>
              <div className="text-center">
                <p className="font-mono font-bold text-xl text-victory-lime">{profile.best_score?.toFixed(1) || "—"}</p>
                <p className="text-victory-muted text-xs">{t("publicProfile.bestScore")}</p>
              </div>
            </div>
          </section>

          {/* Amateur record */}
          {hasRealRecord && (
            <section className="victory-card p-4">
              <h2 className="font-heading font-bold text-victory-text mb-3 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-victory-lime" />
                {t("publicProfile.amateurRecord")}
              </h2>
              <div className="flex justify-center gap-8">
                <div className="text-center">
                  <p className="font-mono font-bold text-3xl text-victory-lime">{profile.amateur_wins}</p>
                  <p className="text-victory-muted text-xs mt-1">{t("publicProfile.wins")}</p>
                </div>
                <div className="text-center">
                  <p className="font-mono font-bold text-3xl text-victory-muted">{profile.amateur_losses}</p>
                  <p className="text-victory-muted text-xs mt-1">{t("publicProfile.losses")}</p>
                </div>
                <div className="text-center">
                  <p className="font-mono font-bold text-3xl text-victory-text">{profile.amateur_draws}</p>
                  <p className="text-victory-muted text-xs mt-1">{t("publicProfile.draws")}</p>
                </div>
              </div>
            </section>
          )}

          {/* Virtual record */}
          {hasVirtRecord && (
            <section className="victory-card p-4">
              <h2 className="font-heading font-bold text-victory-text mb-3 flex items-center gap-2">
                <Swords className="w-5 h-5 text-victory-lime" />
                {t("publicProfile.virtualRecord")}
              </h2>
              <div className="flex justify-center gap-8">
                <div className="text-center">
                  <p className="font-mono font-bold text-3xl text-victory-lime">{profile.competition_wins}</p>
                  <p className="text-victory-muted text-xs mt-1">{t("publicProfile.wins")}</p>
                </div>
                <div className="text-center">
                  <p className="font-mono font-bold text-3xl text-victory-muted">{profile.competition_losses}</p>
                  <p className="text-victory-muted text-xs mt-1">{t("publicProfile.losses")}</p>
                </div>
              </div>
            </section>
          )}

          {/* Belts */}
          {profile.belts?.length > 0 && (
            <section className="px-4 pb-4">
              <h2 className="text-victory-text font-bold text-sm mb-3 flex items-center gap-2">
                <span className="text-base">🏆</span> Belts &amp; Titles
              </h2>
              <div className="flex flex-wrap gap-2">
                {profile.belts.map((belt) => (
                  <div key={belt.belt_id} title={belt.desc} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${
                    belt.tier === "legend"  ? "bg-yellow-500/15 border-yellow-400/40 text-yellow-300" :
                    belt.tier === "diamond" ? "bg-blue-400/15  border-blue-400/40  text-blue-300"   :
                    belt.tier === "gold"    ? "bg-amber-500/15 border-amber-400/40 text-amber-300"  :
                    belt.tier === "silver"  ? "bg-slate-400/15 border-slate-400/40 text-slate-200"  :
                                             "bg-orange-700/15 border-orange-600/30 text-orange-300"
                  }`}>
                    <span>{belt.emoji}</span>
                    {belt.name}
                  </div>
                ))}
              </div>
            </section>
          )}
        </main>
      )}

      {tab === "clips" && (
        <ClipsTab userId={userId} />
      )}

      {tab === "schedule" && (
        <ScheduleTab userId={userId} isOwn={false} weightUnit={weightUnit} />
      )}

      <BottomNav />
    </div>
  );
}
