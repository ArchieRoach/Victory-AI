import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { API, useAuth } from "@/App";
import { BottomNav } from "@/components/BottomNav";
import { toast } from "sonner";
import { ArrowLeft, Trophy, Swords, Target, Building2, Users, Star } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function PublicProfilePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { userId } = useParams();
  const { user: currentUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

  useEffect(() => {
    // Redirect own profile to /profile settings page
    if (userId === currentUser?.user_id) {
      navigate("/profile", { replace: true });
      return;
    }
    fetchProfile();
  }, [userId]);

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/users/${userId}/profile`);
      setProfile(res.data);
      setFollowing(res.data.is_following);
    } catch (err) {
      toast.error(err.response?.data?.detail || t("common.error"));
      navigate(-1);
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
    } catch {
      toast.error(t("common.error"));
    } finally {
      setFollowLoading(false);
    }
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

  if (!profile) return null;

  const displayName = profile.display_name || profile.name || t("publicProfile.unknownFighter");
  const hasRealRecord = profile.amateur_wins > 0 || profile.amateur_losses > 0 || profile.amateur_draws > 0;
  const hasVirtualRecord = profile.competition_wins > 0 || profile.competition_losses > 0;

  return (
    <div className="min-h-screen bg-victory-bg pb-nav" data-testid="public-profile-page">
      <header className="p-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-victory-card border border-victory-border flex items-center justify-center touch-target">
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
          {followLoading ? "..." : following ? t("publicProfile.following") : t("publicProfile.follow")}
        </button>
      </header>

      <main className="px-4 space-y-4 pb-4">
        {/* Profile card */}
        <section className="victory-card p-4">
          <div className="flex items-start gap-4">
            {profile.picture || profile.avatar_url ? (
              <img src={profile.avatar_url || profile.picture} alt={displayName} className="w-16 h-16 rounded-full object-cover border-2 border-victory-lime flex-shrink-0" />
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
                  <span className="text-xs text-victory-muted bg-victory-card border border-victory-border px-2 py-0.5 rounded-full">{profile.weight_class}</span>
                )}
              </div>
              {profile.bio && <p className="text-victory-muted text-sm mt-2 leading-relaxed">{profile.bio}</p>}
            </div>
          </div>

          {/* Follow stats */}
          <div className="flex gap-6 mt-4 pt-4 border-t border-victory-border">
            <div className="text-center">
              <p className="font-mono font-bold text-victory-text">{profile.follower_count}</p>
              <p className="text-victory-muted text-xs">{t("publicProfile.followers")}</p>
            </div>
            <div className="text-center">
              <p className="font-mono font-bold text-victory-text">{profile.following_count}</p>
              <p className="text-victory-muted text-xs">{t("publicProfile.following")}</p>
            </div>
            {profile.gym && (
              <button onClick={() => navigate(`/gyms/${profile.gym.gym_id}`)} className="flex items-center gap-1.5 text-victory-lime text-sm">
                <Building2 className="w-4 h-4" />
                {profile.gym.name}
              </button>
            )}
          </div>
        </section>

        {/* In-app performance */}
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

        {/* Real-world amateur record */}
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

        {/* Virtual competition record */}
        {hasVirtualRecord && (
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

        {/* Recent posts */}
        {profile.recent_posts?.length > 0 && (
          <section>
            <h2 className="font-heading font-bold text-victory-text mb-3 flex items-center gap-2">
              <Star className="w-5 h-5 text-victory-lime" />
              {t("publicProfile.recentPosts")}
            </h2>
            <div className="grid grid-cols-2 gap-3">
              {profile.recent_posts.map((post) => (
                <div key={post.post_id} className="aspect-video rounded-xl overflow-hidden bg-victory-card border border-victory-border flex items-center justify-center">
                  {post.video_url ? (
                    <video src={post.video_url} className="w-full h-full object-cover" preload="none" />
                  ) : (
                    <p className="text-victory-muted text-xs text-center px-2">{post.caption}</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
