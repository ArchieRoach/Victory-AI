import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import { API } from "@/App";
import { BottomNav } from "@/components/BottomNav";
import { RadarChart } from "@/components/RadarChart";
import { DrillCard } from "@/components/DrillCard";
import { Confetti } from "@/components/Confetti";
import { ArrowUp, ArrowDown, Share2, Home, Target } from "lucide-react";
import { toast } from "sonner";

const SCORE_COMMENTS = {
  high: "Strong — keep doing this.",
  medium_high: "Solid foundation — a few tweaks here.",
  medium: "Room to grow — try this drill.",
  low: "Starting point. Here's how to build.",
};

const getScoreComment = (score) => {
  if (score >= 8) return SCORE_COMMENTS.high;
  if (score >= 6) return SCORE_COMMENTS.medium_high;
  if (score >= 4) return SCORE_COMMENTS.medium;
  return SCORE_COMMENTS.low;
};

export default function SessionResultsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [sessions, setSessions] = useState([]);
  const [showConfetti, setShowConfetti] = useState(false);
  const canvasRef = useRef(null);

  const session = location.state?.session;

  useEffect(() => {
    if (!session) {
      navigate("/home", { replace: true });
      return;
    }

    // Fetch previous sessions to compare
    fetchSessions();

    // Check if this is first session for confetti
    checkFirstSession();
  }, [session, navigate]);

  const fetchSessions = async () => {
    try {
      const response = await axios.get(`${API}/sessions?limit=10`, {
        withCredentials: true,
      });
      setSessions(response.data);
    } catch (error) {
      console.error("Error fetching sessions:", error);
    }
  };

  const checkFirstSession = async () => {
    try {
      const response = await axios.get(`${API}/sessions?limit=2`, {
        withCredentials: true,
      });
      if (response.data.length === 1) {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 3000);
      }
    } catch (error) {
      console.error("Error checking first session:", error);
    }
  };

  const previousSession = sessions.find((s) => s.session_id !== session?.session_id);

  const getScoreDifference = () => {
    if (!previousSession || !session) return null;
    return session.overall_score - previousSession.overall_score;
  };

  const getDimensionChange = (dimensionName) => {
    if (!previousSession) return null;
    const current = session.dimension_scores.find(
      (d) => d.dimension_name === dimensionName
    )?.score;
    const previous = previousSession.dimension_scores.find(
      (d) => d.dimension_name === dimensionName
    )?.score;
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

  const handleShare = async () => {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 600;
      canvas.height = 760;
      const ctx = canvas.getContext("2d");

      // Background gradient
      const grad = ctx.createLinearGradient(0, 0, 0, 760);
      grad.addColorStop(0, "#0D0D15");
      grad.addColorStop(1, "#0A0A0F");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 600, 760);

      // Top accent bar
      ctx.fillStyle = "#E8FF47";
      ctx.fillRect(0, 0, 600, 4);

      // Logo / brand
      ctx.fillStyle = "#E8FF47";
      ctx.font = "bold 20px Arial";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText("VICTORY AI", 32, 24);

      // Date (top right)
      ctx.fillStyle = "#8888A0";
      ctx.font = "14px Arial";
      ctx.textAlign = "right";
      ctx.fillText(new Date(session.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }), 568, 26);

      // Title
      ctx.fillStyle = "#F0F0F5";
      ctx.font = "bold 28px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("My Boxing Scorecard", 300, 80);

      // Overall score circle
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

      // Radar spokes
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

      // Data polygon
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

      // Center score badge
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

      // Divider
      ctx.strokeStyle = "#2A2A3A";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(32, 480);
      ctx.lineTo(568, 480);
      ctx.stroke();

      // Top 3 strengths + bottom 3 to improve
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

      // Bottom watermark
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
      toast.error("Failed to generate share image");
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
  const isFirstSession = sessions.length <= 1;

  return (
    <div
      className="min-h-screen bg-victory-bg pb-nav"
      data-testid="session-results-page"
    >
      {showConfetti && <Confetti />}

      <main className="p-4 space-y-6">
        {/* Header Message */}
        <section className="text-center py-4">
          {isFirstSession ? (
            <>
              <h1 className="text-2xl font-heading font-extrabold text-victory-text mb-2">
                Your baseline is set.
              </h1>
              <p className="text-victory-muted">
                Everything from here is progress.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-heading font-extrabold text-victory-text mb-2">
                Session complete.
              </h1>
              {scoreDiff !== null && (
                <p
                  className={`flex items-center justify-center gap-1 ${
                    scoreDiff >= 0 ? "text-victory-lime" : "text-victory-orange"
                  }`}
                >
                  {scoreDiff >= 0 ? (
                    <ArrowUp className="w-5 h-5" />
                  ) : (
                    <ArrowDown className="w-5 h-5" />
                  )}
                  {Math.abs(scoreDiff).toFixed(1)} points since last session
                  {scoreDiff < 0 && " — let's look at why"}
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

        {/* Dimension Breakdown */}
        <section>
          <h2 className="text-lg font-heading font-bold text-victory-text mb-3">
            Dimension Breakdown
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
                        <span className="text-victory-text font-medium">
                          {dim.dimension_name}
                        </span>
                        {change !== null && change !== 0 && (
                          <span
                            className={`text-xs flex items-center ${
                              change > 0
                                ? "text-victory-lime"
                                : "text-victory-orange"
                            }`}
                          >
                            {change > 0 ? (
                              <ArrowUp className="w-3 h-3" />
                            ) : (
                              <ArrowDown className="w-3 h-3" />
                            )}
                          </span>
                        )}
                      </div>
                      <p className="text-victory-muted text-sm mt-1">
                        {getScoreComment(dim.score)}
                      </p>
                    </div>
                    <span className="font-mono text-xl font-semibold text-victory-lime">
                      {dim.score}
                    </span>
                  </div>
                );
              })}
          </div>
        </section>

        {/* Drill Recommendations */}
        <section>
          <h2 className="text-lg font-heading font-bold text-victory-text mb-3">
            Your Homework
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

        {/* Share Button */}
        <button
          onClick={handleShare}
          className="victory-btn-secondary w-full flex items-center justify-center gap-2"
          data-testid="share-btn"
        >
          <Share2 className="w-5 h-5" />
          Share My Scorecard
        </button>

        {/* Navigation Buttons */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => navigate("/home")}
            className="victory-btn-ghost flex items-center justify-center gap-2"
            data-testid="back-home-btn"
          >
            <Home className="w-5 h-5" />
            Back to Home
          </button>
          <button
            onClick={() => navigate("/score")}
            className="victory-btn-primary flex items-center justify-center gap-2"
            data-testid="score-another-btn"
          >
            <Target className="w-5 h-5" />
            Score Another
          </button>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
