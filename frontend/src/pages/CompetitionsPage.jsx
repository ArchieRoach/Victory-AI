import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API, useAuth } from "@/App";
import { BottomNav } from "@/components/BottomNav";
import { toast } from "sonner";
import { Swords, Plus, Clock, CheckCircle, Star, Lock, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatDistanceToNow } from "date-fns";

function CompetitionCard({ comp, onClick }) {
  const { t } = useTranslation();
  const isOpen = comp.status === "open";
  const isAI = comp.competition_type === "ai_judge";
  const challenger = comp.challenger?.display_name || comp.challenger?.name || t("compete.unknownFighter");

  const timeLeft = () => {
    if (!comp.voting_closes_at || !isOpen) return null;
    try {
      return formatDistanceToNow(new Date(comp.voting_closes_at), { addSuffix: true });
    } catch {
      return null;
    }
  };

  return (
    <button onClick={onClick} className="victory-card w-full p-4 flex items-center gap-3 text-left">
      {/* Thumbnail / avatar */}
      <div className="w-16 h-16 rounded-xl bg-victory-card border border-victory-border overflow-hidden flex-shrink-0 flex items-center justify-center">
        {comp.thumbnail_url ? (
          <img src={comp.thumbnail_url} alt={comp.title} className="w-full h-full object-cover" />
        ) : (
          <Swords className="w-7 h-7 text-victory-muted" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="font-semibold text-victory-text truncate">{comp.title}</p>
          {isAI && (
            <span className="text-xs bg-victory-lime/20 text-victory-lime px-1.5 py-0.5 rounded-full flex-shrink-0">AI</span>
          )}
        </div>
        <p className="text-victory-muted text-xs truncate">{challenger}</p>
        <div className="flex items-center gap-3 mt-1.5">
          <span className={`text-xs flex items-center gap-0.5 ${isOpen ? "text-victory-lime" : "text-victory-muted"}`}>
            {isOpen ? <Clock className="w-3 h-3" /> : <CheckCircle className="w-3 h-3" />}
            {isOpen ? timeLeft() || t("compete.open") : t("compete.closed")}
          </span>
          <span className="text-xs text-victory-muted">
            <Star className="w-3 h-3 inline mr-0.5" />
            {comp.avg_score ? comp.avg_score.toFixed(1) : "—"}
            {" · "}{comp.vote_count} {t("compete.votes")}
          </span>
        </div>
        {comp.has_voted && (
          <span className="text-xs text-victory-teal mt-0.5 block">{t("compete.youVoted")}</span>
        )}
      </div>

      <ChevronRight className="w-5 h-5 text-victory-muted flex-shrink-0" />
    </button>
  );
}

export default function CompetitionsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [comps, setComps] = useState([]);
  const [myComps, setMyComps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("open");
  const [activeTab, setActiveTab] = useState("all");

  useEffect(() => {
    fetchAll();
  }, [statusFilter]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [allRes, mineRes] = await Promise.all([
        axios.get(`${API}/competitions`, { params: { status: statusFilter } }),
        axios.get(`${API}/competitions/mine`).catch(() => ({ data: [] })),
      ]);
      setComps(allRes.data);
      setMyComps(mineRes.data);
    } catch {
      toast.error(t("common.error"));
    } finally {
      setLoading(false);
    }
  };

  const hasSubscription = user?.has_subscription;
  const displayComps = activeTab === "mine" ? myComps : comps;

  return (
    <div className="min-h-screen bg-victory-bg pb-nav" data-testid="competitions-page">
      <header className="p-4 border-b border-victory-border">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-heading font-extrabold text-victory-text flex items-center gap-2">
              <Swords className="w-5 h-5 text-victory-lime" />
              {t("compete.title")}
            </h1>
            <p className="text-victory-muted text-sm">{t("compete.subtitle")}</p>
          </div>
          <button
            onClick={() => navigate("/post/create?mode=compete")}
            className="w-11 h-11 rounded-full bg-victory-lime flex items-center justify-center touch-target"
            aria-label="Create competition"
            data-testid="create-comp-btn"
          >
            <Plus className="w-5 h-5 text-victory-bg" />
          </button>
        </div>

        {/* Tabs: All | Mine */}
        <div className="flex gap-2 mb-3">
          {["all", "mine"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                activeTab === tab ? "bg-victory-lime text-victory-bg" : "bg-victory-card border border-victory-border text-victory-muted"
              }`}
            >
              {t(`compete.tab_${tab}`)}
            </button>
          ))}
        </div>

        {/* Status filter (only on "all" tab) */}
        {activeTab === "all" && (
          <div className="flex gap-2">
            {["open", "closed", "all"].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  statusFilter === s ? "bg-victory-lime/20 text-victory-lime border border-victory-lime/40" : "text-victory-muted border border-victory-border"
                }`}
              >
                {t(`compete.status_${s}`)}
              </button>
            ))}
          </div>
        )}
      </header>

      <main className="p-4 space-y-3">
        {/* AI judge promo banner */}
        {!hasSubscription && (
          <div className="victory-card p-4 border border-victory-lime/20 bg-victory-lime/5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-victory-lime/20 flex items-center justify-center flex-shrink-0">
              <Star className="w-5 h-5 text-victory-lime" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-victory-text text-sm font-semibold">{t("compete.aiJudgeBanner")}</p>
              <p className="text-victory-muted text-xs">{t("compete.aiJudgeBannerDesc")}</p>
            </div>
            <button onClick={() => navigate("/paywall")} className="flex items-center gap-1 text-xs text-victory-lime border border-victory-lime/40 rounded-full px-3 py-1.5 flex-shrink-0">
              <Lock className="w-3 h-3" />
              Pro
            </button>
          </div>
        )}

        {loading ? (
          [1, 2, 3].map((i) => <div key={i} className="skeleton-shimmer h-24 rounded-xl" />)
        ) : displayComps.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Swords className="w-12 h-12 text-victory-muted mb-4" />
            <p className="text-victory-muted font-medium">
              {activeTab === "mine" ? t("compete.noMine") : t("compete.noComps")}
            </p>
            <p className="text-victory-muted text-sm mt-1">{t("compete.noCompsHint")}</p>
            <button onClick={() => navigate("/post/create?mode=compete")} className="victory-btn-primary mt-6">
              {t("compete.postChallenge")}
            </button>
          </div>
        ) : (
          displayComps.map((comp) => (
            <CompetitionCard
              key={comp.comp_id}
              comp={comp}
              onClick={() => navigate(`/compete/${comp.comp_id}`)}
            />
          ))
        )}
      </main>

      <BottomNav />
    </div>
  );
}
