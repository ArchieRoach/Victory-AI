import { useState, useEffect } from "react";
import axios from "axios";
import { API } from "@/App";
import { BottomNav } from "@/components/BottomNav";
import { Trophy, Medal, Star, RefreshCw } from "lucide-react";

const RANK_STYLES = {
  1: { icon: "🥇", color: "text-yellow-400", bg: "bg-yellow-400/10 border-yellow-400/30" },
  2: { icon: "🥈", color: "text-gray-300", bg: "bg-gray-300/10 border-gray-300/30" },
  3: { icon: "🥉", color: "text-orange-400", bg: "bg-orange-400/10 border-orange-400/30" },
};

export default function LeaderboardPage() {
  const [leaderboard, setLeaderboard] = useState([]);
  const [currentUserRank, setCurrentUserRank] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("avg_score"); // avg_score | best_score | total_sessions

  useEffect(() => {
    fetchLeaderboard();
  }, []);

  const fetchLeaderboard = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/leaderboard`, { withCredentials: true });
      setLeaderboard(res.data.leaderboard || []);
      setCurrentUserRank(res.data.current_user_rank);
    } catch (error) {
      console.error("Leaderboard fetch error:", error);
    } finally {
      setLoading(false);
    }
  };

  const sorted = [...leaderboard].sort((a, b) => {
    if (filter === "best_score") return b.best_score - a.best_score;
    if (filter === "total_sessions") return b.total_sessions - a.total_sessions;
    return b.avg_score - a.avg_score;
  }).map((entry, i) => ({ ...entry, displayRank: i + 1 }));

  return (
    <div className="min-h-screen bg-victory-bg pb-nav" data-testid="leaderboard-page">
      <header className="p-4 border-b border-victory-border">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-heading font-extrabold text-victory-text flex items-center gap-2">
              <Trophy className="w-5 h-5 text-victory-lime" />
              Leaderboard
            </h1>
            <p className="text-victory-muted text-sm">Top fighters ranked by performance</p>
          </div>
          <button onClick={fetchLeaderboard} className="w-9 h-9 rounded-full bg-victory-card border border-victory-border flex items-center justify-center text-victory-muted hover:text-victory-text">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mt-4">
          {[
            { key: "avg_score", label: "Avg Score" },
            { key: "best_score", label: "Best Score" },
            { key: "total_sessions", label: "Sessions" },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                filter === key
                  ? "bg-victory-lime text-victory-bg"
                  : "bg-victory-card border border-victory-border text-victory-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <main className="p-4 space-y-3">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="skeleton-shimmer h-16 rounded-lg" />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div className="text-center py-16">
            <Star className="w-12 h-12 text-victory-muted mx-auto mb-4" />
            <p className="text-victory-muted">No fighters ranked yet.</p>
            <p className="text-victory-muted text-sm mt-1">Complete sessions to appear here!</p>
          </div>
        ) : (
          <>
            {/* Top 3 podium */}
            {sorted.length >= 3 && (
              <div className="grid grid-cols-3 gap-2 mb-6">
                {/* 2nd place */}
                <div className="flex flex-col items-center pt-4">
                  <div className="text-2xl mb-1">🥈</div>
                  <div className="w-full victory-card border border-gray-300/20 p-3 text-center rounded-lg">
                    <p className="text-victory-text text-xs font-semibold truncate">{sorted[1]?.display_name}</p>
                    <p className="text-gray-300 font-mono font-bold mt-1">
                      {filter === "total_sessions" ? sorted[1]?.total_sessions : sorted[1]?.[filter]?.toFixed(1)}
                    </p>
                    {sorted[1]?.is_current_user && <p className="text-victory-lime text-xs mt-1">You</p>}
                  </div>
                </div>

                {/* 1st place */}
                <div className="flex flex-col items-center">
                  <div className="text-3xl mb-1">🥇</div>
                  <div className="w-full victory-card border border-yellow-400/30 p-3 text-center rounded-lg bg-yellow-400/5">
                    <p className="text-victory-text text-xs font-semibold truncate">{sorted[0]?.display_name}</p>
                    <p className="text-yellow-400 font-mono font-bold text-lg mt-1">
                      {filter === "total_sessions" ? sorted[0]?.total_sessions : sorted[0]?.[filter]?.toFixed(1)}
                    </p>
                    {sorted[0]?.is_current_user && <p className="text-victory-lime text-xs mt-1">You</p>}
                  </div>
                </div>

                {/* 3rd place */}
                <div className="flex flex-col items-center pt-6">
                  <div className="text-2xl mb-1">🥉</div>
                  <div className="w-full victory-card border border-orange-400/20 p-3 text-center rounded-lg">
                    <p className="text-victory-text text-xs font-semibold truncate">{sorted[2]?.display_name}</p>
                    <p className="text-orange-400 font-mono font-bold mt-1">
                      {filter === "total_sessions" ? sorted[2]?.total_sessions : sorted[2]?.[filter]?.toFixed(1)}
                    </p>
                    {sorted[2]?.is_current_user && <p className="text-victory-lime text-xs mt-1">You</p>}
                  </div>
                </div>
              </div>
            )}

            {/* Full list */}
            <div className="victory-card divide-y divide-victory-border">
              {sorted.map((entry) => {
                const rankStyle = RANK_STYLES[entry.displayRank];
                return (
                  <div
                    key={entry.display_name + entry.displayRank}
                    className={`p-4 flex items-center gap-3 ${entry.is_current_user ? "bg-victory-lime/5" : ""}`}
                    data-testid={`leaderboard-row-${entry.displayRank}`}
                  >
                    <div className="w-8 text-center">
                      {rankStyle ? (
                        <span className="text-xl">{rankStyle.icon}</span>
                      ) : (
                        <span className="font-mono text-sm text-victory-muted">#{entry.displayRank}</span>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`font-semibold truncate ${entry.is_current_user ? "text-victory-lime" : "text-victory-text"}`}>
                          {entry.display_name}
                        </p>
                        {entry.is_current_user && (
                          <span className="text-xs bg-victory-lime/20 text-victory-lime px-2 py-0.5 rounded-full">You</span>
                        )}
                      </div>
                      <p className="text-victory-muted text-xs">{entry.total_sessions} session{entry.total_sessions !== 1 ? "s" : ""}</p>
                    </div>

                    <div className="text-right">
                      <p className={`font-mono font-bold text-lg ${rankStyle ? rankStyle.color : "text-victory-lime"}`}>
                        {filter === "total_sessions" ? entry.total_sessions : entry[filter]?.toFixed(1)}
                      </p>
                      <p className="text-victory-muted text-xs">
                        {filter === "avg_score" ? "avg" : filter === "best_score" ? "best" : "sessions"}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Show current user rank if outside top 50 */}
            {currentUserRank && !sorted.find(e => e.is_current_user) && (
              <div className="victory-card p-4 border border-victory-lime/30 bg-victory-lime/5">
                <p className="text-victory-muted text-xs mb-1">Your ranking</p>
                <div className="flex items-center justify-between">
                  <p className="text-victory-lime font-semibold">#{currentUserRank.rank} — {currentUserRank.display_name}</p>
                  <p className="font-mono font-bold text-victory-lime">{currentUserRank.avg_score?.toFixed(1)}</p>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
