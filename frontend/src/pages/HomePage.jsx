import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API, useAuth } from "@/App";
import { BottomNav } from "@/components/BottomNav";
import { RadarChart } from "@/components/RadarChart";
import { ProgressChart } from "@/components/ProgressChart";
import { DrillCard } from "@/components/DrillCard";
import { SessionCard } from "@/components/SessionCard";
import { Target, ChevronRight } from "lucide-react";

export default function HomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    total_sessions: 0,
    best_score: 0,
    most_improved_dimension: null,
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [sessionsRes, statsRes] = await Promise.all([
        axios.get(`${API}/sessions?limit=10`, { withCredentials: true }),
        axios.get(`${API}/users/stats`, { withCredentials: true }),
      ]);
      setSessions(sessionsRes.data);
      setStats(statsRes.data);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  const currentSession = sessions[0];
  const previousSession = sessions[1];

  // Get lowest 3 dimensions for drill recommendations
  const getDrillRecommendations = () => {
    if (!currentSession) return [];
    const scores = currentSession.dimension_scores
      .filter((d) => d.score !== null)
      .sort((a, b) => (a.score || 0) - (b.score || 0))
      .slice(0, 3);
    return scores;
  };

  const drillRecommendations = getDrillRecommendations();

  // Get sessions for this month
  const getMonthSessions = () => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    return sessions.filter((s) => new Date(s.date) >= startOfMonth);
  };

  const monthSessions = getMonthSessions();

  if (loading) {
    return (
      <div className="min-h-screen bg-victory-bg pb-nav">
        <div className="p-4 space-y-6">
          {/* Skeleton loader */}
          <div className="skeleton-shimmer h-8 w-48 rounded" />
          <div className="skeleton-shimmer h-64 rounded-lg" />
          <div className="skeleton-shimmer h-48 rounded-lg" />
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-victory-bg pb-nav"
      data-testid="home-page"
    >
      {/* Header */}
      <header className="p-4 flex items-start justify-between">
        <div>
          <p className="text-victory-muted text-sm">
            {getGreeting()}, {user?.name?.split(" ")[0] || "Champ"}
          </p>
          <h1
            className="text-2xl sm:text-3xl font-heading font-extrabold text-victory-text"
            data-testid="page-headline"
          >
            Your Boxing Today
          </h1>
        </div>
        <button
          onClick={() => navigate("/profile")}
          className="w-10 h-10 rounded-full bg-victory-card-highlight border border-victory-border flex items-center justify-center text-victory-text font-semibold"
          data-testid="profile-btn"
        >
          {user?.name?.[0]?.toUpperCase() || "U"}
        </button>
      </header>

      <main className="px-4 space-y-6">
        {/* Radar Chart Section */}
        <section data-testid="radar-section">
          {currentSession ? (
            <div className="victory-card p-4">
              <RadarChart
                currentScores={currentSession.dimension_scores}
                previousScores={previousSession?.dimension_scores}
                overallScore={currentSession.overall_score}
                onDimensionClick={(dimension) => {
                  const element = document.getElementById(`drill-${dimension}`);
                  if (element) {
                    element.scrollIntoView({ behavior: "smooth" });
                  }
                }}
              />
              <p className="text-victory-muted text-sm text-center mt-4">
                Tap a dimension to see drill recommendations
              </p>
            </div>
          ) : (
            <div className="victory-card p-6 text-center">
              <div className="w-48 h-48 mx-auto mb-4 opacity-30">
                <svg viewBox="0 0 200 200">
                  {[0.33, 0.66, 1].map((scale, i) => (
                    <polygon
                      key={i}
                      points={Array(6)
                        .fill(0)
                        .map((_, idx) => {
                          const angle = (idx * 60 - 90) * (Math.PI / 180);
                          const r = 80 * scale;
                          return `${100 + r * Math.cos(angle)},${100 + r * Math.sin(angle)}`;
                        })
                        .join(" ")}
                      fill="none"
                      stroke="#2A2A3A"
                      strokeWidth="1"
                    />
                  ))}
                </svg>
              </div>
              <p className="text-victory-muted mb-4">
                Score your first round to see your chart.
              </p>
              <button
                onClick={() => navigate("/score")}
                className="victory-btn-primary inline-flex items-center justify-center gap-2"
                data-testid="first-score-btn"
              >
                <Target className="w-5 h-5" />
                Score My First Round
              </button>
            </div>
          )}
        </section>

        {/* Progress Trend Section */}
        <section data-testid="progress-section">
          <h2 className="text-lg font-heading font-bold text-victory-text mb-3">
            Your Progress This Month
          </h2>

          {sessions.length >= 2 ? (
            <div className="victory-card p-4">
              <ProgressChart sessions={sessions} />
            </div>
          ) : (
            <div className="victory-card p-4">
              <div className="h-32 flex items-center justify-center">
                <p className="text-victory-muted text-sm text-center">
                  {sessions.length === 1
                    ? "Complete two sessions to unlock your trend chart."
                    : "Your progress story starts with one session."}
                </p>
              </div>
            </div>
          )}

          {/* Stat Pills */}
          <div className="grid grid-cols-3 gap-3 mt-3">
            <div className="stat-pill" data-testid="stat-sessions">
              <span className="font-mono text-xl font-semibold text-victory-lime">
                {monthSessions.length || "—"}
              </span>
              <span className="text-victory-muted text-xs mt-1">
                Sessions This Month
              </span>
            </div>
            <div className="stat-pill" data-testid="stat-best">
              <span className="font-mono text-xl font-semibold text-victory-lime">
                {stats.best_score ? stats.best_score.toFixed(1) : "—"}
              </span>
              <span className="text-victory-muted text-xs mt-1">Best Score</span>
            </div>
            <div className="stat-pill" data-testid="stat-improved">
              <span className="font-mono text-sm font-semibold text-victory-lime truncate px-1">
                {stats.most_improved_dimension || "—"}
              </span>
              <span className="text-victory-muted text-xs mt-1">
                Most Improved
              </span>
            </div>
          </div>
        </section>

        {/* Drill Recommendations Section */}
        <section data-testid="drills-section">
          <h2 className="text-lg font-heading font-bold text-victory-text mb-3">
            Your Focus This Week
          </h2>

          {drillRecommendations.length > 0 ? (
            <div className="space-y-3">
              {drillRecommendations.map((dim) => (
                <DrillCard
                  key={dim.dimension_name}
                  id={`drill-${dim.dimension_name}`}
                  dimension={dim.dimension_name}
                  score={dim.score}
                />
              ))}
            </div>
          ) : (
            <div className="victory-card p-4">
              <p className="text-victory-muted text-sm text-center">
                Drill recommendations appear here after your first session.
              </p>
            </div>
          )}
        </section>

        {/* Recent Sessions Section */}
        <section data-testid="sessions-section" className="pb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-heading font-bold text-victory-text">
              Recent Sessions
            </h2>
          </div>

          {sessions.length > 0 ? (
            <div className="space-y-3">
              {sessions.slice(0, 5).map((session) => (
                <SessionCard
                  key={session.session_id}
                  session={session}
                  onClick={() => navigate(`/sessions/${session.session_id}`)}
                />
              ))}
            </div>
          ) : (
            <div className="victory-card p-4">
              <p className="text-victory-muted text-sm text-center">
                Your session history will appear here. Start with one round.
              </p>
            </div>
          )}
        </section>
      </main>

      <BottomNav />
    </div>
  );
}
