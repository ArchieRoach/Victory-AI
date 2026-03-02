import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { API } from "@/App";
import { BottomNav } from "@/components/BottomNav";
import { RadarChart } from "@/components/RadarChart";
import { DrillCard } from "@/components/DrillCard";
import { ArrowLeft, Edit, ExternalLink } from "lucide-react";

export default function SessionDetailPage() {
  const navigate = useNavigate();
  const { sessionId } = useParams();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [previousSession, setPreviousSession] = useState(null);

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
    } catch (error) {
      console.error("Error fetching session:", error);
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
            Session Details
          </h1>
          <p className="text-victory-muted text-sm">
            {new Date(session.date).toLocaleDateString("en-US", {
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
                <label className="text-victory-muted text-sm">Video Link</label>
                <a
                  href={session.video_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-victory-lime hover:underline mt-1"
                  data-testid="video-link"
                >
                  <ExternalLink className="w-4 h-4" />
                  View Recording
                </a>
              </div>
            )}
            {session.session_notes && (
              <div>
                <label className="text-victory-muted text-sm">Notes</label>
                <p className="text-victory-text mt-1">{session.session_notes}</p>
              </div>
            )}
          </section>
        )}

        {/* Dimension Scores */}
        <section>
          <h2 className="text-lg font-heading font-bold text-victory-text mb-3">
            All Scores
          </h2>
          <div className="victory-card divide-y divide-victory-border">
            {session.dimension_scores
              .filter((d) => d.score !== null)
              .map((dim) => (
                <div
                  key={dim.dimension_name}
                  className="p-4 flex items-center justify-between"
                >
                  <span className="text-victory-text">{dim.dimension_name}</span>
                  <span className="font-mono text-xl font-semibold text-victory-lime">
                    {dim.score}
                  </span>
                </div>
              ))}
          </div>
        </section>

        {/* Drill Recommendations */}
        <section>
          <h2 className="text-lg font-heading font-bold text-victory-text mb-3">
            Drill Recommendations
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

        {/* Re-score Button */}
        <button
          onClick={() =>
            navigate("/score", { state: { prefillSession: session } })
          }
          className="victory-btn-secondary w-full flex items-center justify-center gap-2 mb-6"
          data-testid="rescore-btn"
        >
          <Edit className="w-5 h-5" />
          Re-score This Session
        </button>
      </main>

      <BottomNav />
    </div>
  );
}
