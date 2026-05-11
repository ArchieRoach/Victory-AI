import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import { API } from "@/App";
import { BottomNav } from "@/components/BottomNav";
import { RadarChart } from "@/components/RadarChart";
import { DrillCard } from "@/components/DrillCard";
import { Confetti } from "@/components/Confetti";
import { ArrowUp, ArrowDown, Share2, Home, Target, Star } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

const POSITIVE_HIGHLIGHTS = {
  Jab: "Your jab is landing clean — opponents won't see it coming.",
  Cross: "That cross has real power behind it. Keep rotating those hips.",
  "Left Hook": "Tight hook with solid hip pivot. That's textbook.",
  "Right Hook": "Short arc, fast return — that's a weapon.",
  Uppercut: "Loading that uppercut properly. Finding those gaps.",
  "Combination Flow": "Punches flowing together smoothly — hard to read.",
  "Punch Balance": "Staying balanced through combinations. Hard to knock off.",
  "Punch Accuracy": "Punches landing where you're aiming. Precision matters.",
  "Guard Position": "Hands staying high between punches. Protecting the chin.",
  "Head Movement": "Moving off the centreline — making yourself hard to hit.",
  Slip: "Slipping outside the punch — not just ducking. Smart.",
  Roll: "Full shoulder roll. That's professional-level defense.",
  Parry: "Redirecting punches cleanly — not just blocking.",
  "Body Movement": "Angling off after punching. Not giving a stationary target.",
  Footwork: "Weight centred, pivoting well — solid foundation.",
  "Ring Generalship": "Controlling distance and dictating the fight.",
};

const getPositiveHighlight = (dimensionName, score) => {
  if (score >= 9) return `Outstanding — ${POSITIVE_HIGHLIGHTS[dimensionName] || "elite-level execution here."}`;
  if (score >= 7) return POSITIVE_HIGHLIGHTS[dimensionName] || "Solid technique — keep building on this.";
  return `Showing improvement — ${POSITIVE_HIGHLIGHTS[dimensionName] || "keep focused here."}`;
};

export default function SessionResultsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const [sessions, setSessions] = useState([]);
  const [showConfetti, setShowConfetti] = useState(false);

  const session = location.state?.session;

  useEffect(() => {
    if (!session) {
      navigate("/home", { replace: true });
      return;
    }
    fetchSessions();
    checkFirstSession();
  }, [session, navigate]);

  const fetchSessions = async () => {
    try {
      const response = await axios.get(`${API}/sessions?limit=10`, { withCredentials: true });
      setSessions(response.data);
    } catch (error) {
      console.error("Error fetching sessions:", error);
    }
  };

  const checkFirstSession = async () => {
    try {
      const response = await axios.get(`${API}/sessions?limit=2`, { withCredentials: true });
      if (response.data.length === 1) {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 3000);
      }
    } catch (error) {
      console.error("Error checking first session:", error);
    }
  };

  const getScoreComment = (score) => {
    if (score >= 8) return t("results.scoreHigh");
    if (score >= 6) return t("results.scoreMediumHigh");
    if (score >= 4) return t("results.scoreMedium");
    return t("results.scoreLow");
  };

  const previousSession = sessions.find((s) => s.session_id !== session?.session_id);

  const getScoreDifference = () => {
    if (!previousSession || !session) return null;
    return session.overall_score - previousSession.overall_score;
  };

  const getDimensionChange = (dimensionName) => {
    if (!previousSession) return null;
    const current = session.dimension_scores.find((d) => d.dimension_name === dimensionName)?.score;
    const previous = previousSession.dimension_scores.find((d) => d.dimension_name === dimensionName)?.score;
    if (current === null || previous === null) return null;
    return current - previous;
  };

  const getLowestDimensions = () => {
    if (!session) return [];
    return session.dimension_scores
      .filter((d) => d.score !== null)
      .sort((a, b) => (a.score || 0) - (b.score || 0))
      .slice(0, 3);
  };

  const getTopDimensions = () => {
    if (!session) return [];
    return session.dimension_scores
      .filter((d) => d.score !== null)
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, 3);
  };

  const handleShare = async () => {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 600;
      canvas.height = 760;
      const ctx = canvas.getContext("2d");

      const grad = ctx.createLinearGradient(0, 0, 0, 760);
      grad.addColorStop(0, "#0D0D15");
      grad.addColorStop(1, "#0A0A0F");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 600, 760);

      ctx.fillStyle = "#E8FF47";
      ctx.fillRect(0, 0, 600, 4);

      ctx.fillStyle = "#E8FF47";
      ctx.font = "bold 20px Arial";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText("VICTORY AI", 32, 24);

      ctx.fillStyle = "#8888A0";
      ctx.font = "14px Arial";
      ctx.textAlign = "right";
      ctx.fillText(new Date(session.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }), 568, 26);

      ctx.fillStyle = "#F0F0F5";
      ctx.font = "bold 28px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("My Boxing Scorecard", 300, 80);

      const cx = 300, cy = 290, r = 170;
      ctx.strokeStyle = "#2A2A3A";
      ctx.lineWidth = 1;
      for (let scale = 0.33; scale <= 1; scale += 0.33) {
        ctx.beginPath();
        const n = session.dimension_scores.length;
        session.dimension_scores.forEach((_, i) => {
          const angle = (i * (360 / n) - 90) * (Math.PI / 180);
          const method = i === 0 ? "moveTo" : "lineTo";
          ctx[method](cx + r * scale * Math.cos(angle), cy + r * scale * Math.sin(angle));
        });
        ctx.closePath();
        ctx.stroke();
      }

      ctx.strokeStyle = "#1A1A2A";
      ctx.lineWidth = 1;
      session.dimension_scores.forEach((_, i) => {
        const n = session.dimension_scores.length;
        const angle = (i * (360 / n) - 90) * (Math.PI / 180);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
        ctx.stroke();
      });

      ctx.fillStyle = "rgba(232, 255, 71, 0.25)";
      ctx.strokeStyle = "#E8FF47";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      const n = session.dimension_scores.length;
      session.dimension_scores.forEach((d, i) => {
        const angle = (i * (360 / n) - 90) * (Math.PI / 180);
        const pr = ((d.score || 0) / 10) * r;
        const x = cx + pr * Math.cos(angle);
        const y = cy + pr * Math.sin(angle);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#12121A";
      ctx.beginPath();
      ctx.arc(cx, cy, 52, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#E8FF47";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = "#E8FF47";
      ctx.font = "bold 38px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(session.overall_score.toFixed(1), cx, cy - 4);
      ctx.fillStyle = "#8888A0";
      ctx.font = "12px Arial";
      ctx.fillText("/ 10", cx, cy + 20);

      ctx.strokeStyle = "#2A2A3A";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(32, 480);
      ctx.lineTo(568, 480);
      ctx.stroke();

      const scored = session.dimension_scores.filter(d => d.score !== null).sort((a, b) => b.score - a.score);
      const top3 = scored.slice(0, 3);
      const bottom3 = scored.slice(-3).reverse();

      ctx.font = "bold 13px Arial";
      ctx.textAlign = "left";
      ctx.fillStyle = "#8888A0";
      ctx.fillText("STRENGTHS", 32, 504);
      ctx.fillStyle = "#8888A0";
      ctx.textAlign = "right";
      ctx.fillText("FOCUS AREAS", 568, 504);

      top3.forEach((d, i) => {
        const y = 528 + i * 26;
        ctx.fillStyle = "#E8FF47";
        ctx.textAlign = "left";
        ctx.font = "11px Arial";
        ctx.fillText(`${d.score}/10`, 32, y);
        ctx.fillStyle = "#F0F0F5";
        ctx.fillText(d.dimension_name, 72, y);
      });

      bottom3.forEach((d, i) => {
        const y = 528 + i * 26;
        ctx.fillStyle = "#F0F0F5";
        ctx.textAlign = "right";
        ctx.font = "11px Arial";
        ctx.fillText(d.dimension_name, 528, y);
        ctx.fillStyle = "#FF6B35";
        ctx.fillText(`${d.score}/10`, 568, y);
      });

      ctx.fillStyle = "#2A2A3A";
      ctx.fillRect(0, 726, 600, 34);
      ctx.fillStyle = "#E8FF47";
      ctx.font = "bold 13px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("victoryai.app", 300, 743);

      canvas.toBlob(async (blob) => {
        const file = new File([blob], "victory-scorecard.png", { type: "image/png" });
        if (navigator.share && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              files: [file],
              title: "My Victory AI Scorecard",
              text: `Check out my boxing scorecard! Overall score: ${session.overall_score.toFixed(1)}/10 — tracked with Victory AI`,
            });
          } catch (error) {
            if (error.name !== "AbortError") downloadImage(canvas);
          }
        } else {
          downloadImage(canvas);
        }
      }, "image/png");
    } catch (error) {
      toast.error(t("common.error"));
    }
  };

  const downloadImage = (canvas) => {
    const link = document.createElement("a");
    link.download = "victory-scorecard.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
    toast.success("Scorecard saved!");
  };

  if (!session) return null;

  const scoreDiff = getScoreDifference();
  const lowestDimensions = getLowestDimensions();
  const topDimensions = getTopDimensions();
  const isFirstSession = sessions.length <= 1;

  return (
    <div className="min-h-screen bg-victory-bg pb-nav" data-testid="session-results-page">
      {showConfetti && <Confetti />}

      <main className="p-4 space-y-6">
        {/* Header Message */}
        <section className="text-center py-4">
          {isFirstSession ? (
            <>
              <h1 className="text-2xl font-heading font-extrabold text-victory-text mb-2">
                {t("results.baselineTitle")}
              </h1>
              <p className="text-victory-muted">{t("results.baselineSubtitle")}</p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-heading font-extrabold text-victory-text mb-2">
                {t("results.sessionComplete")}
              </h1>
              {scoreDiff !== null && (
                <p className={`flex items-center justify-center gap-1 ${scoreDiff >= 0 ? "text-victory-lime" : "text-victory-orange"}`}>
                  {scoreDiff >= 0 ? <ArrowUp className="w-5 h-5" /> : <ArrowDown className="w-5 h-5" />}
                  {t("results.pointsUp", { points: Math.abs(scoreDiff).toFixed(1) })}
                  {scoreDiff < 0 && t("results.letsLookWhy")}
                </p>
              )}
            </>
          )}
        </section>

        {/* Radar Chart */}
        <section className="victory-card p-4" data-testid="results-radar">
          <RadarChart
            currentScores={session.dimension_scores}
            previousScores={previousSession?.dimension_scores}
            overallScore={session.overall_score}
          />
        </section>

        {/* Top 3 Highlights */}
        {topDimensions.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Star className="w-5 h-5 text-victory-lime fill-victory-lime" />
              <h2 className="text-lg font-heading font-bold text-victory-text">
                {t("results.highlights")}
              </h2>
            </div>
            <div className="space-y-2">
              {topDimensions.map((dim, idx) => (
                <div
                  key={dim.dimension_name}
                  className="victory-card p-4 flex items-start gap-3 border-l-2 border-victory-lime"
                  data-testid={`highlight-${dim.dimension_name}`}
                >
                  <div className="w-7 h-7 rounded-full bg-victory-lime/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-victory-lime text-xs font-bold">{idx + 1}</span>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-0.5">
                      <p className="text-victory-text font-semibold text-sm">{dim.dimension_name}</p>
                      <span className="font-mono text-victory-lime font-bold text-sm">{dim.score}/10</span>
                    </div>
                    <p className="text-victory-muted text-xs leading-relaxed">
                      {getPositiveHighlight(dim.dimension_name, dim.score)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Dimension Breakdown */}
        <section>
          <h2 className="text-lg font-heading font-bold text-victory-text mb-3">
            {t("results.breakdown")}
          </h2>
          <div className="victory-card divide-y divide-victory-border">
            {session.dimension_scores
              .filter((d) => d.score !== null)
              .map((dim) => {
                const change = getDimensionChange(dim.dimension_name);
                return (
                  <div
                    key={dim.dimension_name}
                    className="p-4 flex items-center justify-between"
                    data-testid={`dimension-${dim.dimension_name}`}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-victory-text font-medium">{dim.dimension_name}</span>
                        {change !== null && change !== 0 && (
                          <span className={`text-xs flex items-center ${change > 0 ? "text-victory-lime" : "text-victory-orange"}`}>
                            {change > 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                          </span>
                        )}
                      </div>
                      <p className="text-victory-muted text-sm mt-1">{getScoreComment(dim.score)}</p>
                    </div>
                    <span className="font-mono text-xl font-semibold text-victory-lime">{dim.score}</span>
                  </div>
                );
              })}
          </div>
        </section>

        {/* Drill Recommendations */}
        <section>
          <h2 className="text-lg font-heading font-bold text-victory-text mb-3">
            {t("results.homework")}
          </h2>
          <div className="space-y-3">
            {lowestDimensions.map((dim) => (
              <DrillCard key={dim.dimension_name} dimension={dim.dimension_name} score={dim.score} />
            ))}
          </div>
        </section>

        {/* Share Button */}
        <button
          onClick={handleShare}
          className="victory-btn-secondary w-full flex items-center justify-center gap-2"
          data-testid="share-btn"
        >
          <Share2 className="w-5 h-5" />
          {t("results.shareBtn")}
        </button>

        {/* Navigation Buttons */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => navigate("/home")}
            className="victory-btn-ghost flex items-center justify-center gap-2"
            data-testid="back-home-btn"
          >
            <Home className="w-5 h-5" />
            {t("results.backHome")}
          </button>
          <button
            onClick={() => navigate("/score")}
            className="victory-btn-primary flex items-center justify-center gap-2"
            data-testid="score-another-btn"
          >
            <Target className="w-5 h-5" />
            {t("results.scoreAnother")}
          </button>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
