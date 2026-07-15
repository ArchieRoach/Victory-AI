import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { API, useAuth } from "@/App";
import { BottomNav } from "@/components/BottomNav";
import { toast } from "sonner";
import { ArrowLeft, Swords, Star, CheckCircle, Clock, Send } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatDistanceToNow } from "date-fns";

const JUDGE_DIMENSIONS = [
  "Jab", "Cross", "Left Hook", "Right Hook",
  "Guard Position", "Head Movement", "Footwork",
  "Combination Flow", "Punch Accuracy",
];

export default function CompetitionDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { compId } = useParams();
  const { user } = useAuth();
  const [comp, setComp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scores, setScores] = useState(
    Object.fromEntries(JUDGE_DIMENSIONS.map((d) => [d, 7]))
  );
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchComp();
  }, [compId]);

  const fetchComp = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/competitions/${compId}`);
      setComp(res.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || t("common.error"));
      navigate("/compete");
    } finally {
      setLoading(false);
    }
  };

  const submitVote = async () => {
    setSubmitting(true);
    try {
      await axios.post(`${API}/competitions/${compId}/vote`, { scores, comment });
      toast.success(t("compete.voteCast"));
      fetchComp();
    } catch (err) {
      toast.error(err.response?.data?.detail || t("common.error"));
    } finally {
      setSubmitting(false);
    }
  };

  const avgScore = Object.values(scores).reduce((a, b) => a + b, 0) / JUDGE_DIMENSIONS.length;

  if (loading) {
    return (
      <div className="min-h-screen bg-victory-bg pb-nav">
        <div className="p-4 space-y-4">
          {[1, 2, 3].map((i) => <div key={i} className="skeleton-shimmer h-32 rounded-xl" />)}
        </div>
        <BottomNav />
      </div>
    );
  }

  if (!comp) return null;

  const isOpen = comp.status === "open";
  const isAI = comp.competition_type === "ai_judge";
  const isMine = comp.challenger_id === user?.user_id;
  const canVote = isOpen && !isMine && !comp.has_voted;
  const challengerName = comp.challenger?.display_name || comp.challenger?.name || t("compete.unknownFighter");

  const timeLeft = () => {
    try {
      return formatDistanceToNow(new Date(comp.voting_closes_at), { addSuffix: true });
    } catch {
      return "";
    }
  };

  return (
    <div className="min-h-screen bg-victory-bg pb-nav" data-testid="competition-detail-page">
      <header className="p-4 flex items-center gap-3 border-b border-victory-border">
        <button onClick={() => navigate("/compete")} aria-label="Go back" className="w-11 h-11 rounded-full bg-victory-card border border-victory-border flex items-center justify-center touch-target">
          <ArrowLeft className="w-5 h-5 text-victory-text" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-heading font-bold text-victory-text truncate">{comp.title}</h1>
          <div className="flex items-center gap-2 text-xs text-victory-muted">
            {isAI ? (
              <span className="text-victory-lime font-semibold">AI {t("compete.judged")}</span>
            ) : isOpen ? (
              <span className="text-victory-lime flex items-center gap-0.5">
                <Clock className="w-3 h-3" />{timeLeft()}
              </span>
            ) : (
              <span className="flex items-center gap-0.5"><CheckCircle className="w-3 h-3" />{t("compete.closed")}</span>
            )}
            <span>·</span>
            <span>{comp.vote_count} {t("compete.votes")}</span>
          </div>
        </div>
      </header>

      <main className="px-4 py-4 space-y-4">
        {/* Challenger info */}
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`/profile/${comp.challenger_id}`)} className="flex items-center gap-3">
            {comp.challenger?.picture || comp.challenger?.avatar_url ? (
              <img src={comp.challenger.avatar_url || comp.challenger.picture} alt={challengerName} className="w-10 h-10 rounded-full object-cover border border-victory-border" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-victory-lime/20 flex items-center justify-center">
                <span className="text-victory-lime font-bold">{challengerName[0]?.toUpperCase()}</span>
              </div>
            )}
            <div>
              <p className="font-semibold text-victory-text">{challengerName}</p>
              {comp.description && <p className="text-victory-muted text-xs">{comp.description}</p>}
            </div>
          </button>
        </div>

        {/* Video */}
        {comp.video_url && (
          <div className="rounded-xl overflow-hidden bg-black aspect-video">
            <video src={comp.video_url} controls className="w-full h-full object-contain" preload="metadata" />
          </div>
        )}

        {/* Current scores */}
        {(comp.avg_score !== null && comp.avg_score !== undefined) && (
          <div className="victory-card p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="font-semibold text-victory-text">{isAI ? t("compete.aiVerdict") : t("compete.currentScores")}</p>
              <span className="font-mono font-bold text-2xl text-victory-lime">{comp.avg_score?.toFixed(1)}</span>
            </div>
            {comp.dimension_averages && Object.keys(comp.dimension_averages).length > 0 && (
              <div className="space-y-1.5">
                {Object.entries(comp.dimension_averages).map(([dim, score]) => (
                  <div key={dim} className="flex items-center gap-2">
                    <span className="text-victory-muted text-xs w-28 truncate">{dim}</span>
                    <div className="flex-1 h-1.5 bg-victory-border rounded-full overflow-hidden">
                      <div className="h-full bg-victory-lime rounded-full" style={{ width: `${(score / 10) * 100}%` }} />
                    </div>
                    <span className="font-mono text-xs text-victory-text w-6 text-right">{score}</span>
                  </div>
                ))}
              </div>
            )}
            {/* AI specific feedback */}
            {isAI && comp.ai_result && (
              <div className="mt-4 space-y-2 pt-3 border-t border-victory-border">
                {comp.ai_result.feedback && <p className="text-victory-text text-sm">{comp.ai_result.feedback}</p>}
                {comp.ai_result.highlight && (
                  <div className="flex items-start gap-1.5">
                    <CheckCircle className="w-4 h-4 text-victory-lime mt-0.5 flex-shrink-0" />
                    <p className="text-victory-text text-sm">{comp.ai_result.highlight}</p>
                  </div>
                )}
                {comp.ai_result.improve && (
                  <div className="flex items-start gap-1.5">
                    <span className="text-victory-orange font-bold mt-0.5">→</span>
                    <p className="text-victory-text text-sm">{comp.ai_result.improve}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Voting form */}
        {canVote && !isAI && (
          <div className="victory-card p-4 space-y-4">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-victory-text">{t("compete.castVote")}</p>
              <span className="font-mono font-bold text-xl text-victory-lime">{avgScore.toFixed(1)}</span>
            </div>

            <div className="space-y-3">
              {JUDGE_DIMENSIONS.map((dim) => (
                <div key={dim}>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-victory-muted text-sm">{dim}</label>
                    <span className="font-mono text-sm text-victory-lime">{scores[dim]}</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    step={1}
                    value={scores[dim]}
                    onChange={(e) => setScores((prev) => ({ ...prev, [dim]: Number(e.target.value) }))}
                    className="w-full h-2"
                  />
                </div>
              ))}
            </div>

            <div>
              <label className="text-victory-muted text-sm block mb-1">{t("compete.comment")}</label>
              <div className="flex gap-2">
                <input
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder={t("compete.commentPlaceholder")}
                  className="victory-input flex-1 text-sm"
                  maxLength={200}
                />
                <button
                  onClick={submitVote}
                  disabled={submitting}
                  className="w-10 h-10 rounded-full bg-victory-lime flex items-center justify-center disabled:opacity-40 flex-shrink-0"
                >
                  {submitting ? (
                    <div className="w-4 h-4 border-2 border-victory-bg border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Send className="w-4 h-4 text-victory-bg" />
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Already voted */}
        {comp.has_voted && (
          <div className="victory-card p-4 flex items-center gap-3 border border-victory-lime/30">
            <CheckCircle className="w-5 h-5 text-victory-lime flex-shrink-0" />
            <p className="text-victory-text text-sm">{t("compete.alreadyVoted")}</p>
          </div>
        )}

        {/* Own competition */}
        {isMine && isOpen && (
          <div className="victory-card p-4 flex items-center gap-3 border border-victory-lime/20">
            <Swords className="w-5 h-5 text-victory-lime flex-shrink-0" />
            <div>
              <p className="text-victory-text text-sm font-medium">{t("compete.yourChallenge")}</p>
              <p className="text-victory-muted text-xs">{t("compete.yourChallengeDesc")}</p>
            </div>
          </div>
        )}

        {/* Recent comments */}
        {comp.recent_comments?.length > 0 && (
          <div className="space-y-2">
            <p className="text-victory-muted text-xs uppercase tracking-wider">{t("compete.judgeComments")}</p>
            {comp.recent_comments.map((v) => (
              <div key={v.vote_id} className="victory-card p-3 flex gap-2">
                <div className="w-7 h-7 rounded-full bg-victory-lime/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-victory-lime text-xs font-bold">
                    {(v.voter?.display_name || v.voter?.name || "?")[0].toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="text-victory-lime text-xs font-semibold">{v.voter?.display_name || v.voter?.name}</p>
                  <p className="text-victory-text text-sm">{v.comment}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
