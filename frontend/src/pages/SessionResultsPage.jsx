import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import { API } from "@/App";
import { BottomNav } from "@/components/BottomNav";
import { DrillCard } from "@/components/DrillCard";
import { Confetti } from "@/components/Confetti";
import { BeltCelebration } from "@/components/BeltCelebration";
import { ArrowUp, ArrowDown, Share2, Home, Target, Star, Flame, Swords, Shield, Footprints, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

// Real grouping already used server-side (see /dimensions) — reused here so the
// scorecard's categories match the rest of the app, not an invented split.
const CATEGORY_GROUPS = [
  { key: "Offensive", label: "Offense",  icon: Swords,     color: "#E8FF47", dims: ["Jab", "Cross", "Left Hook", "Right Hook", "Uppercut", "Combination Flow", "Punch Balance", "Punch Accuracy"] },
  { key: "Defensive", label: "Defense",  icon: Shield,     color: "#47E8C8", dims: ["Guard Position", "Head Movement", "Slip", "Roll", "Parry", "Body Movement"] },
  { key: "Movement",  label: "Movement", icon: Footprints, color: "#FF6B35", dims: ["Footwork", "Ring Generalship"] },
];

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
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [beltQueue, setBeltQueue] = useState([]);
  const [beltsReady, setBeltsReady] = useState(false);
  const [currentStreak, setCurrentStreak] = useState(0);
  const navButtonsRef = useRef(null);

  const session = location.state?.session;

  useEffect(() => {
    if (session?.new_belts?.length) setBeltQueue(session.new_belts);
  }, [session]);

  // Peak-end rule: hold the belt celebration until the fighter actually reaches
  // the end of the results (the nav buttons scroll into view), instead of
  // interrupting the page the instant it loads. IntersectionObserver fires
  // immediately if the target is already on-screen, so short pages that don't
  // need scrolling still work with no extra fallback logic.
  useEffect(() => {
    if (beltQueue.length === 0 || !navButtonsRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setBeltsReady(true); observer.disconnect(); } },
      { threshold: 0.4 }
    );
    observer.observe(navButtonsRef.current);
    return () => observer.disconnect();
  }, [beltQueue.length]);

  useEffect(() => {
    if (!session) {
      navigate("/home", { replace: true });
      return;
    }
    fetchSessions();
    checkFirstSession();
    fetchStreak();
  }, [session, navigate]);

  const fetchStreak = async () => {
    try {
      const response = await axios.get(`${API}/users/stats`, { withCredentials: true });
      setCurrentStreak(response.data.current_streak || 0);
    } catch {
      // streak line is supplementary — result page still works without it
    }
  };

  const fetchSessions = async () => {
    try {
      const response = await axios.get(`${API}/sessions?limit=10`, { withCredentials: true });
      setSessions(response.data);
    } catch {
      // comparison data is supplementary — result page still works without it
    }
  };

  const checkFirstSession = async () => {
    try {
      const response = await axios.get(`${API}/sessions?limit=2`, { withCredentials: true });
      if (response.data.length === 1) {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 3000);
      }
    } catch {
      // confetti is decorative — failure is acceptable
    }
  };

  const previousSession = sessions.find((s) => s.session_id !== session?.session_id);

  const getCategoryAverage = (dims) => {
    if (!session) return null;
    const scores = session.dimension_scores.filter((d) => dims.includes(d.dimension_name) && d.score !== null).map((d) => d.score);
    if (!scores.length) return null;
    return scores.reduce((a, b) => a + b, 0) / scores.length;
  };

  const getScoreDifference = () => {
    if (!previousSession || !session) return null;
    return session.overall_score - previousSession.overall_score;
  };

  const getDimensionChange = (dimensionName) => {
    if (!previousSession) return null;
    const current = session.dimension_scores.find((d) => d.dimension_name === dimensionName)?.score;
    const previous = previousSession.dimension_scores.find((d) => d.dimension_name === dimensionName)?.score;
    // Guard against undefined (dimension missing from a prior session) → avoids a NaN "change".
    if (current == null || previous == null) return null;
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

      // Overall score — big and simple, no 16-point radar polygon to squint at
      ctx.fillStyle = "#E8FF47";
      ctx.font = "bold 56px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(session.overall_score.toFixed(1), 300, 150);
      ctx.fillStyle = "#8888A0";
      ctx.font = "bold 14px Arial";
      ctx.fillText("OVERALL / 10", 300, 188);

      // Three real category rings — same Offense/Defense/Movement grouping as the
      // on-screen results page, not sixteen tiny unreadable spokes.
      const ringR = 62;
      const centers = [150, 300, 450];
      CATEGORY_GROUPS.forEach(({ label, color, dims }, i) => {
        const avg = getCategoryAverage(dims) || 0;
        const rcx = centers[i], rcy = 320;

        ctx.strokeStyle = "rgba(255,255,255,0.08)";
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.arc(rcx, rcy, ringR, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = color;
        ctx.lineWidth = 8;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.arc(rcx, rcy, ringR, -Math.PI / 2, -Math.PI / 2 + (avg / 10) * Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = "#F0F0F5";
        ctx.font = "bold 26px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(avg.toFixed(1), rcx, rcy);

        ctx.fillStyle = "#8888A0";
        ctx.font = "bold 13px Arial";
        ctx.fillText(label.toUpperCase(), rcx, rcy + ringR + 26);
      });

      ctx.strokeStyle = "#2A2A3A";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(32, 440);
      ctx.lineTo(568, 440);
      ctx.stroke();

      const scored = session.dimension_scores.filter(d => d.score !== null).sort((a, b) => b.score - a.score);
      const top3 = scored.slice(0, 3);
      const bottom3 = scored.slice(-3).reverse();

      ctx.font = "bold 13px Arial";
      ctx.textAlign = "left";
      ctx.fillStyle = "#8888A0";
      ctx.fillText("STRENGTHS", 32, 464);
      ctx.fillStyle = "#8888A0";
      ctx.textAlign = "right";
      ctx.fillText("FOCUS AREAS", 568, 464);

      top3.forEach((d, i) => {
        const y = 490 + i * 28;
        ctx.fillStyle = "#E8FF47";
        ctx.textAlign = "left";
        ctx.font = "bold 13px Arial";
        ctx.fillText(`${d.score}/10`, 32, y);
        ctx.fillStyle = "#F0F0F5";
        ctx.font = "13px Arial";
        ctx.fillText(d.dimension_name, 72, y);
      });

      bottom3.forEach((d, i) => {
        const y = 490 + i * 28;
        ctx.fillStyle = "#F0F0F5";
        ctx.textAlign = "right";
        ctx.font = "13px Arial";
        ctx.fillText(d.dimension_name, 528, y);
        ctx.fillStyle = "#FF6B35";
        ctx.font = "bold 13px Arial";
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
      {beltsReady && beltQueue.length > 0 && (
        <BeltCelebration belts={beltQueue} onDone={() => setBeltQueue((q) => q.slice(1))} />
      )}

      <main className="p-4 space-y-6">
        {/* Header Message */}
        <section className="text-center py-2">
          <div className="relative inline-flex items-center justify-center w-32 h-32 mb-4">
            <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 128 128">
              <circle cx="64" cy="64" r="56" fill="none" stroke="rgba(232,255,71,0.08)" strokeWidth="6"/>
              <circle
                cx="64" cy="64" r="56"
                fill="none" stroke="#E8FF47" strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={`${(session.overall_score / 10) * 351.86} 351.86`}
              />
            </svg>
            <div>
              <p className="font-heading font-extrabold text-4xl text-victory-lime leading-none">
                {session.overall_score.toFixed(1)}
              </p>
              <p className="text-victory-muted text-[10px] text-center font-mono">/10</p>
            </div>
          </div>
          {isFirstSession ? (
            <>
              <h1 className="text-2xl font-heading font-extrabold text-victory-text mb-2">
                {t("results.baselineTitle")}
              </h1>
              <p className="text-victory-muted text-sm">{t("results.baselineSubtitle")}</p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-heading font-extrabold text-victory-text mb-2">
                {t("results.sessionComplete")}
              </h1>
              {scoreDiff !== null && (
                <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold ${
                  scoreDiff >= 0 ? "bg-victory-lime/15 text-victory-lime" : "bg-red-500/15 text-red-400"
                }`}>
                  {scoreDiff >= 0 ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
                  {t("results.pointsUp", { points: Math.abs(scoreDiff).toFixed(1) })}
                  {scoreDiff < 0 && <> — {t("results.letsLookWhy")}</>}
                </span>
              )}
            </>
          )}
        </section>

        {/* Category scores — three real, meaningful numbers beat sixteen tiny
            radar-chart spokes nobody can actually read on a phone. */}
        <section className="grid grid-cols-3 gap-3" data-testid="results-categories">
          {CATEGORY_GROUPS.map(({ key, label, icon: Icon, color, dims }) => {
            const avg = getCategoryAverage(dims);
            const circumference = 2 * Math.PI * 28;
            return (
              <div key={key} className="victory-card p-3 flex flex-col items-center text-center">
                <div className="relative w-16 h-16 mb-2">
                  <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 64 64">
                    <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" />
                    <circle
                      cx="32" cy="32" r="28" fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
                      strokeDasharray={`${((avg || 0) / 10) * circumference} ${circumference}`}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Icon className="w-6 h-6" style={{ color }} />
                  </div>
                </div>
                <p className="font-mono font-bold text-xl text-victory-text">{avg?.toFixed(1) ?? "—"}</p>
                <p className="text-victory-muted text-xs">{label}</p>
              </div>
            );
          })}
        </section>

        {/* Top 3 Highlights */}
        {topDimensions.length > 0 && (
          <section>
            <p className="section-label mb-3 flex items-center gap-1.5">
              <Star className="w-3 h-3 fill-current" />
              {t("results.highlights")}
            </p>
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
                    <p className="text-victory-muted text-sm leading-relaxed">
                      {getPositiveHighlight(dim.dimension_name, dim.score)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Dimension Breakdown — bars, not sentences, same real numbers/deltas as
            before. Collapsed by default: Highlights above already surfaces the
            same top dimensions, so showing the full 16-row breakdown unconditionally
            was pure redundancy — real data stays one tap away, not force-scrolled
            (Tesler's Law: the detail is real complexity that can't be deleted, so
            it's the page's job to let people skip it by default, not the fighter's
            job to scroll past it every time). */}
        <section className="space-y-4">
          <button
            onClick={() => setShowBreakdown((v) => !v)}
            className="w-full flex items-center justify-between touch-target"
          >
            <span className="section-label">{t("results.breakdown")}</span>
            {showBreakdown ? <ChevronUp className="w-4 h-4 text-victory-muted" /> : <ChevronDown className="w-4 h-4 text-victory-muted" />}
          </button>
          {showBreakdown && CATEGORY_GROUPS.map(({ key, label, dims }) => {
            const groupScores = session.dimension_scores.filter((d) => dims.includes(d.dimension_name) && d.score !== null);
            if (!groupScores.length) return null;
            return (
              <div key={key} className="victory-card p-4">
                <p className="text-victory-muted text-xs uppercase tracking-wider font-semibold mb-3">{label}</p>
                <div className="space-y-3">
                  {groupScores.map((dim) => {
                    const change = getDimensionChange(dim.dimension_name);
                    return (
                      <div key={dim.dimension_name} className="flex items-center gap-3" data-testid={`dimension-${dim.dimension_name}`}>
                        <span className="text-victory-text text-sm w-28 flex-shrink-0 truncate">{dim.dimension_name}</span>
                        <div className="flex-1 h-2 bg-victory-border rounded-full overflow-hidden">
                          <div className="h-full bg-victory-lime rounded-full" style={{ width: `${(dim.score / 10) * 100}%` }} />
                        </div>
                        <span className="font-mono text-sm font-semibold text-victory-lime w-5 text-right flex-shrink-0">{dim.score}</span>
                        {change !== null && change !== 0 && (
                          change > 0
                            ? <ArrowUp className="w-3.5 h-3.5 text-victory-lime flex-shrink-0" />
                            : <ArrowDown className="w-3.5 h-3.5 text-victory-orange flex-shrink-0" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>

        {/* Drill Recommendations */}
        <section>
          <p className="section-label mb-3">{t("results.homework")}</p>
          <div className="space-y-3">
            {lowestDimensions.map((dim) => (
              <DrillCard key={dim.dimension_name} dimension={dim.dimension_name} score={dim.score} />
            ))}
          </div>
        </section>

        {/* Session Complete — closing affirmation. Peak-end rule: this is the last
            content the fighter reads before leaving the results screen, so it
            should land on genuine accomplishment, not the drill/homework list
            above it. Grounded in real data only — rounds actually completed and
            the real streak from /users/stats. */}
        <section className="victory-card p-4 flex items-center gap-3 border-l-2 border-victory-lime">
          <div className="w-10 h-10 rounded-full bg-victory-lime/15 flex items-center justify-center flex-shrink-0">
            <Flame className="w-5 h-5 text-victory-lime" />
          </div>
          <div>
            <p className="text-victory-text font-semibold text-sm">
              {t("results.sessionLogged", { rounds: session.rounds?.length || session.training_config?.total_rounds || 0 })}
            </p>
            {currentStreak > 0 && (
              <p className="text-victory-muted text-xs mt-0.5">
                {t("results.streakLine", { count: currentStreak })}
              </p>
            )}
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
        <div ref={navButtonsRef} className="grid grid-cols-2 gap-3">
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
