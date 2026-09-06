import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { API, useAuth } from "@/App";
import { BottomNav } from "@/components/BottomNav";
import { toast } from "sonner";
import { ArrowLeft, Swords, Copy, LogOut, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function SquadDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { squadId } = useParams();
  const { user } = useAuth();
  const [squad,   setSquad]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy,    setBusy]    = useState(false);
  const [copied,  setCopied]  = useState(false);

  useEffect(() => {
    fetchSquad();
  }, [squadId]);

  const fetchSquad = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/squads/${squadId}`);
      setSquad(res.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || t("common.error"));
      navigate("/squads");
    } finally {
      setLoading(false);
    }
  };

  const copyCode = () => {
    navigator.clipboard?.writeText(squad.invite_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLeave = async () => {
    if (!window.confirm(t("squads.leaveConfirm"))) return;
    setBusy(true);
    try {
      await axios.post(`${API}/squads/${squadId}/leave`);
      navigate("/squads");
    } catch (err) {
      toast.error(err.response?.data?.detail || t("common.error"));
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(t("squads.deleteConfirm"))) return;
    setBusy(true);
    try {
      await axios.delete(`${API}/squads/${squadId}`);
      navigate("/squads");
    } catch (err) {
      toast.error(err.response?.data?.detail || t("common.error"));
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-victory-bg pb-nav">
        <div className="p-4 space-y-4">
          {[1, 2, 3].map((i) => <div key={i} className="skeleton-shimmer h-16 rounded-xl" />)}
        </div>
        <BottomNav />
      </div>
    );
  }
  if (!squad) return null;

  return (
    <div className="min-h-screen bg-victory-bg pb-nav" data-testid="squad-detail-page">
      <header className="p-4 flex items-center gap-3 border-b border-victory-border">
        <button onClick={() => navigate("/squads")} aria-label="Go back" className="w-11 h-11 rounded-full bg-victory-card border border-victory-border flex items-center justify-center touch-target">
          <ArrowLeft className="w-5 h-5 text-victory-text" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-heading font-bold text-victory-text truncate flex items-center gap-2">
            <Swords className="w-4 h-4 text-victory-lime flex-shrink-0" />
            {squad.name}
          </h1>
        </div>
      </header>

      <main className="p-4 space-y-4">
        {/* Invite code */}
        <div className="victory-card p-4 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-victory-muted text-xs mb-1">{t("squads.inviteCode")}</p>
            <p className="font-mono text-xl font-bold text-victory-text tracking-widest">{squad.invite_code}</p>
          </div>
          <button
            onClick={copyCode}
            className="touch-target px-3 flex items-center gap-1.5 justify-center rounded-xl text-xs font-bold border border-victory-lime text-victory-lime hover:bg-victory-lime/10 flex-shrink-0"
          >
            <Copy className="w-3.5 h-3.5" />
            {copied ? t("squads.codeCopied") : t("squads.copyCode")}
          </button>
        </div>

        {/* Real weekly leaderboard — sessions_this_week comes straight from the sessions
            collection, same ground truth as the streak heatmap. No fabricated head start. */}
        <div>
          <p className="text-victory-muted text-xs uppercase tracking-wider mb-2">{t("squads.thisWeek")}</p>
          <div className="victory-card divide-y divide-victory-border">
            {squad.leaderboard.map((m, idx) => (
              <div key={m.user_id} className="p-4 flex items-center gap-3">
                <span className="font-mono text-sm text-victory-muted w-6">#{idx + 1}</span>
                {m.avatar_url || m.picture ? (
                  <img src={m.avatar_url || m.picture} alt={m.display_name}
                    className="w-10 h-10 rounded-full object-cover border border-victory-border flex-shrink-0"
                    onError={(e) => { e.target.style.display = "none"; }} />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-victory-lime/20 flex items-center justify-center text-victory-lime font-bold flex-shrink-0">
                    {(m.display_name || m.name || "F")[0].toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-victory-text truncate">
                    {m.display_name || m.name}
                    {m.user_id === user?.user_id && <span className="text-victory-muted font-normal"> {t("squads.you")}</span>}
                    {m.user_id === squad.owner_id && <span className="text-victory-lime text-xs font-normal"> · {t("squads.owner")}</span>}
                  </p>
                </div>
                <p className="font-mono font-bold text-victory-lime flex-shrink-0">{m.sessions_this_week}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Leave / Delete — same Von Restorff treatment as ProfilePage: leaving is
            reversible (rejoin with the code), deleting isn't, so only delete gets danger styling. */}
        {squad.is_owner ? (
          <button onClick={handleDelete} disabled={busy} className="victory-btn-ghost w-full flex items-center justify-center gap-2 border-victory-danger/30 text-victory-danger disabled:opacity-60">
            <Trash2 className="w-4 h-4" />
            {t("squads.deleteBtn")}
          </button>
        ) : (
          <button onClick={handleLeave} disabled={busy} className="victory-btn-ghost w-full flex items-center justify-center gap-2 disabled:opacity-60">
            <LogOut className="w-4 h-4" />
            {t("squads.leaveBtn")}
          </button>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
