import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { API, useAuth } from "@/App";
import { BottomNav } from "@/components/BottomNav";
import { toast } from "sonner";
import { ArrowLeft, Building2, Copy, Users, Trophy, LogOut, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function GymDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { gymId } = useParams();
  const { user } = useAuth();
  const [gym, setGym] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("members");

  useEffect(() => {
    fetchGym();
  }, [gymId]);

  const fetchGym = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/gyms/${gymId}`);
      setGym(res.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || t("common.error"));
      navigate("/gyms");
    } finally {
      setLoading(false);
    }
  };

  const handleLeave = async () => {
    try {
      await axios.post(`${API}/gyms/${gymId}/leave`);
      toast.success(t("gym.leftGym"));
      navigate("/gyms");
    } catch (err) {
      toast.error(err.response?.data?.detail || t("common.error"));
    }
  };

  const handleDelete = async () => {
    try {
      await axios.delete(`${API}/gyms/${gymId}`);
      toast.success(t("gym.deleted"));
      navigate("/gyms");
    } catch (err) {
      toast.error(err.response?.data?.detail || t("common.error"));
    }
  };

  const copyInviteCode = () => {
    if (gym?.invite_code) {
      navigator.clipboard.writeText(gym.invite_code).catch(() => {});
      toast.success(t("gym.codeCopied"));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-victory-bg pb-nav">
        <div className="p-4 space-y-4">
          <div className="skeleton-shimmer h-8 w-40 rounded" />
          <div className="skeleton-shimmer h-32 rounded-xl" />
          <div className="skeleton-shimmer h-64 rounded-xl" />
        </div>
        <BottomNav />
      </div>
    );
  }

  if (!gym) return null;

  const isOwner = gym.is_owner;
  const isMember = gym.is_member;

  return (
    <div className="min-h-screen bg-victory-bg pb-nav" data-testid="gym-detail-page">
      <header className="p-4 flex items-center gap-3 border-b border-victory-border">
        <button onClick={() => navigate("/gyms")} aria-label="Go back" className="w-11 h-11 rounded-full bg-victory-card border border-victory-border flex items-center justify-center touch-target">
          <ArrowLeft className="w-5 h-5 text-victory-text" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-heading font-bold text-victory-text truncate">{gym.name}</h1>
          <p className="text-victory-muted text-sm">{gym.style} · {gym.member_count} {t("gym.members")}</p>
        </div>
        {isMember && !isOwner && (
          <button onClick={handleLeave} aria-label="Leave gym" className="w-11 h-11 flex items-center justify-center touch-target text-victory-muted hover:text-victory-danger">
            <LogOut className="w-5 h-5" />
          </button>
        )}
        {isOwner && (
          <button onClick={handleDelete} aria-label="Delete gym" className="w-11 h-11 flex items-center justify-center touch-target text-victory-muted hover:text-victory-danger">
            <Trash2 className="w-5 h-5" />
          </button>
        )}
      </header>

      <main className="px-4 space-y-4 py-4">
        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          <div className="victory-card p-3 text-center">
            <p className="font-mono font-bold text-xl text-victory-lime">{gym.avg_score?.toFixed(1) || "—"}</p>
            <p className="text-victory-muted text-xs mt-0.5">{t("gym.avgScore")}</p>
          </div>
          <div className="victory-card p-3 text-center">
            <p className="font-mono font-bold text-xl text-victory-text">{gym.member_count}</p>
            <p className="text-victory-muted text-xs mt-0.5">{t("gym.members")}</p>
          </div>
          <div className="victory-card p-3 text-center">
            <p className="font-mono font-bold text-xl text-victory-text">{gym.total_sessions}</p>
            <p className="text-victory-muted text-xs mt-0.5">{t("gym.sessions")}</p>
          </div>
        </div>

        {/* Description */}
        {gym.description && (
          <div className="victory-card p-4">
            <p className="text-victory-muted text-sm">{gym.description}</p>
          </div>
        )}

        {/* Invite code (owner only) */}
        {isOwner && (
          <div className="victory-card p-4 flex items-center justify-between">
            <div>
              <p className="text-victory-muted text-xs mb-1">{t("gym.inviteCode")}</p>
              <p className="font-mono font-bold text-victory-lime tracking-widest">{gym.invite_code}</p>
            </div>
            <button onClick={copyInviteCode} className="flex items-center gap-1.5 text-xs text-victory-muted border border-victory-border rounded-full px-3 py-1.5 touch-target">
              <Copy className="w-3.5 h-3.5" />
              {t("gym.copy")}
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2">
          {["members", "feed"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                activeTab === tab ? "bg-victory-lime text-victory-bg" : "bg-victory-card border border-victory-border text-victory-muted"
              }`}
            >
              {t(`gym.tab_${tab}`)}
            </button>
          ))}
        </div>

        {activeTab === "members" ? (
          <section>
            <div className="victory-card divide-y divide-victory-border">
              {gym.members_detail?.map((member, idx) => (
                <button
                  key={member.user_id}
                  onClick={() => navigate(`/profile/${member.user_id}`)}
                  className="w-full p-4 flex items-center gap-3 text-left"
                >
                  <span className="font-mono text-sm text-victory-muted w-6">#{idx + 1}</span>
                  {member.picture || member.avatar_url ? (
                    <img src={member.avatar_url || member.picture} alt={member.display_name} className="w-9 h-9 rounded-full object-cover border border-victory-border flex-shrink-0" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-victory-lime/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-victory-lime text-xs font-bold">{(member.display_name || member.name || "?")[0].toUpperCase()}</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className={`font-semibold truncate ${member.user_id === user?.user_id ? "text-victory-lime" : "text-victory-text"}`}>
                        {member.display_name || member.name}
                      </p>
                      {gym.owner_id === member.user_id && (
                        <span className="text-xs bg-victory-lime/20 text-victory-lime px-1.5 py-0.5 rounded-full">{t("gym.owner")}</span>
                      )}
                    </div>
                    <p className="text-victory-muted text-xs">{member.total_sessions} {t("gym.sessions")}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono font-bold text-victory-lime">{member.avg_score?.toFixed(1) || "—"}</p>
                    <p className="text-victory-muted text-xs">{t("gym.avg")}</p>
                  </div>
                </button>
              ))}
            </div>
          </section>
        ) : (
          <section className="space-y-3">
            {gym.recent_posts?.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-victory-muted">{t("gym.noPosts")}</p>
              </div>
            ) : (
              gym.recent_posts?.map((post) => (
                <div key={post.post_id} className="victory-card p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-7 h-7 rounded-full bg-victory-lime/20 flex items-center justify-center">
                      <span className="text-victory-lime text-xs font-bold">
                        {(post.author?.display_name || post.author?.name || "?")[0].toUpperCase()}
                      </span>
                    </div>
                    <p className="text-victory-text text-sm font-medium">{post.author?.display_name || post.author?.name}</p>
                  </div>
                  {post.caption && <p className="text-victory-muted text-sm">{post.caption}</p>}
                  {post.video_url && (
                    <video src={post.video_url} controls className="w-full rounded-lg mt-2 aspect-video object-cover" preload="metadata" />
                  )}
                </div>
              ))
            )}
          </section>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
