import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { API } from "@/App";
import { BottomNav } from "@/components/BottomNav";
import { RadarChart } from "@/components/RadarChart";
import { DrillCard } from "@/components/DrillCard";
import { ArrowLeft, Edit, ExternalLink, Play, ChevronDown, ChevronUp, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

export default function SessionDetailPage() {
  const navigate = useNavigate();
  const { sessionId } = useParams();
  const { t, i18n } = useTranslation();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [previousSession, setPreviousSession] = useState(null);
  const [replay, setReplay] = useState(null);
  const [replayLoading, setReplayLoading] = useState(false);
  const [replayOpen, setReplayOpen] = useState(false);
  const [expandedRound, setExpandedRound] = useState(null);

  useEffect(() => {
    fetchSession();
    fetchPreviousSession();
  }, [sessionId]);

  const fetchSession = async () => {
    try {
      const response = await axios.get(`${API}/sessions/${sessionId}`, {
        withCredentials: true,
      });
      setSession(response.data);
    } catch {
      toast.error("Couldn't load this session");
      navigate("/home", { replace: true });
    } finally {
      setLoading(false);
    }
  };

  const fetchPreviousSession = async () => {
    try {
      const response = await axios.get(`${API}/sessions?limit=10`, {
        withCredentials: true,
      });
      const sessions = response.data;
      const currentIndex = sessions.findIndex((s) => s.session_id === sessionId);
      if (currentIndex < sessions.length - 1) {
        setPreviousSession(sessions[currentIndex + 1]);
      }
    } catch (error) {
      console.error("Error fetching previous session:", error);
    }
  };

  const fetchReplay = async () => {
    if (replay) { setReplayOpen(true); return; }
    setReplayLoading(true);
    try {
      const res = await axios.get(`${API}/sessions/${sessionId}/replay`, { withCredentials: true });
      setReplay(res.data);
      setReplayOpen(true);
    } catch {
      toast.error("Couldn't load replay");
    } finally {
      setReplayLoading(false);
    }
  };

  const getLowestDimensions = () => {
    if (!session) return [];
    return session.dimension_scores
      .filter((d) => d.score !== null)
      .sort((a, b) => (a.score || 0) - (b.score || 0))
      .slice(0, 3);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-victory-bg pb-nav">
        <div className="p-4 space-y-4">
          <div className="skeleton-shimmer h-8 w-32 rounded" />
          <div className="skeleton-shimmer h-64 rounded-lg" />
          <div className="skeleton-shimmer h-48 rounded-lg" />
        </div>
        <BottomNav />
      </div>
    );
  }

  if (!session) return null;

  const lowestDimensions = getLowestDimensions();

  return (
    <div
      className="min-h-screen bg-victory-bg pb-nav"
      data-testid="session-detail-page"
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
        <div className="flex-1">
          <h1 className="text-lg font-heading font-bold text-victory-text">
            {t("sessionDetail.title")}
          </h1>
          <p className="text-victory-muted text-sm">
            {new Date(session.date).toLocaleDateString(i18n.language, {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>
      </header>

      <main className="px-4 space-y-6">
        {/* Radar Chart */}
        <section className="victory-card p-4">
          <RadarChart
            currentScores={session.dimension_scores}
            previousScores={previousSession?.dimension_scores}
            overallScore={session.overall_score}
          />
        </section>

        {/* Session Info */}
        {(session.video_url || session.session_notes) && (
          <section className="victory-card p-4 space-y-4">
            {session.video_url && (
              <div>
                <label className="text-victory-muted text-sm">{t("sessionDetail.videoLink")}</label>
                <a
                  href={session.video_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-victory-lime hover:underline mt-1"
                  data-testid="video-link"
                >
                  <ExternalLink className="w-4 h-4" />
                  {t("sessionDetail.viewRecording")}
                </a>
              </div>
            )}
            {session.session_notes && (
              <div>
                <label className="text-victory-muted text-sm">{t("sessionDetail.notes")}</label>
                <p className="text-victory-text mt-1">{session.session_notes}</p>
              </div>
            )}
          </section>
        )}

        {/* Dimension Scores */}
        <section>
          <p className="section-label mb-3">{t("sessionDetail.allScores")}</p>
          <div className="victory-card divide-y divide-victory-border">
            {session.dimension_scores
              .filter((d) => d.score !== null)
              .map((dim) => {
                const score = dim.score ?? 0;
                const pct = (score / 10) * 100;
                const barColor =
                  score >= 8 ? "bg-victory-lime" :
                  score >= 5 ? "bg-victory-orange" :
                  "bg-red-500";
                return (
                  <div
                    key={dim.dimension_name}
                    className="p-4 flex items-center gap-3"
                  >
                    <span className="text-victory-text text-sm flex-1 min-w-0 truncate">{dim.dimension_name}</span>
                    <div className="w-20 h-1.5 rounded-full bg-victory-border flex-shrink-0 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${barColor} transition-all`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="font-mono text-lg font-semibold text-victory-lime w-8 text-right flex-shrink-0">
                      {score}
                    </span>
                  </div>
                );
              })}
          </div>
        </section>

        {/* Drill Recommendations */}
        <section>
          <h2 className="text-lg font-heading font-bold text-victory-text mb-3">
            {t("sessionDetail.drills")}
          </h2>
          <div className="space-y-3">
            {lowestDimensions.map((dim) => (
              <DrillCard
                key={dim.dimension_name}
                dimension={dim.dimension_name}
                score={dim.score}
              />
            ))}
          </div>
        </section>

        {/* Session Replay */}
        <section>
          <button
            onClick={() => replayOpen ? setReplayOpen(false) : fetchReplay()}
            className="victory-card w-full p-4 flex items-center justify-between text-left"
            data-testid="replay-btn"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-victory-lime/20 flex items-center justify-center">
                <Play className="w-5 h-5 text-victory-lime" />
              </div>
              <div>
                <p className="text-victory-text font-semibold">{t("sessionDetail.replay")}</p>
                <p className="text-victory-muted text-sm">{t("sessionDetail.replayDesc")}</p>
              </div>
            </div>
            {replayLoading ? (
              <div className="w-5 h-5 border-2 border-victory-lime border-t-transparent rounded-full animate-spin" />
            ) : replayOpen ? (
              <ChevronUp className="w-5 h-5 text-victory-muted" />
            ) : (
              <ChevronDown className="w-5 h-5 text-victory-muted" />
            )}
          </button>

          {replayOpen && replay && (
            <div className="mt-3 space-y-3">
              {replay.rounds.length === 0 ? (
                <div className="victory-card p-4 text-center">
                  <MessageSquare className="w-8 h-8 text-victory-muted mx-auto mb-2" />
                  <p className="text-victory-muted text-sm">{t("sessionDetail.noRounds")}</p>
                </div>
              ) : (
                replay.rounds.map((round) => (
                  <div key={round.round_number} className="victory-card overflow-hidden">
                    <button
                      onClick={() => setExpandedRound(expandedRound === round.round_number ? null : round.round_number)}
                      className="w-full p-4 flex items-center justify-between text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-victory-lime/20 flex items-center justify-center">
                          <span className="text-victory-lime font-bold text-sm">{round.round_number}</span>
                        </div>
                        <div>
                          <p className="text-victory-text font-medium">{t("sessionDetail.roundLabel", { num: round.round_number })}</p>
                          <p className="text-victory-muted text-xs truncate max-w-[200px]">{round.commentary}</p>
                        </div>
                      </div>
                      {expandedRound === round.round_number ? (
                        <ChevronUp className="w-4 h-4 text-victory-muted flex-shrink-0" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-victory-muted flex-shrink-0" />
                      )}
                    </button>

                    {expandedRound === round.round_number && (
                      <div className="px-4 pb-4 border-t border-victory-border space-y-3 pt-3">
                        {/* Video link */}
                        {round.video_url && (
                          <a
                            href={round.video_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-victory-lime text-sm hover:underline"
                          >
                            <ExternalLink className="w-4 h-4" />
                            {t("sessionDetail.watchRound")}
                          </a>
                        )}

                        {/* AI Commentary */}
                        <div className="bg-victory-lime/5 rounded-lg p-3 border border-victory-lime/20">
                          <p className="text-victory-muted text-xs mb-1">{round.partner_name || t("common.champ")} {t("sessionDetail.says")}</p>
                          <p className="text-victory-text text-sm">{round.commentary}</p>
                        </div>

                        {/* What went well / improve */}
                        {round.what_did_well && (
                          <div className="flex items-start gap-2">
                            <span className="text-victory-lime text-sm">✓</span>
                            <p className="text-victory-text text-sm">{round.what_did_well}</p>
                          </div>
                        )}
                        {round.what_to_improve && (
                          <div className="flex items-start gap-2">
                            <span className="text-victory-orange text-sm">→</span>
                            <p className="text-victory-text text-sm">{round.what_to_improve}</p>
                          </div>
                        )}

                        {/* Dimension scores for round */}
                        {round.dimension_scores.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-victory-muted text-xs font-medium">{t("sessionDetail.roundScores")}</p>
                            {round.dimension_scores.map(d => (
                              <div key={d.dimension_name} className="flex justify-between text-sm">
                                <span className="text-victory-muted">{d.dimension_name}</span>
                                <span className="font-mono text-victory-lime">{d.score}/10</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </section>

        {/* Re-score Button */}
        <button
          onClick={() =>
            navigate("/score", { state: { prefillSession: session } })
          }
          className="victory-btn-secondary w-full flex items-center justify-center gap-2 mb-6"
          data-testid="rescore-btn"
        >
          <Edit className="w-5 h-5" />
          {t("sessionDetail.rescoreBtn")}
        </button>
      </main>

      <BottomNav />
    </div>
  );
}
