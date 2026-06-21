import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { API } from "@/App";
import { Trophy, ChevronDown, ChevronUp } from "lucide-react";

const MEDALS = ["🥇", "🥈", "🥉"];
const RANK_COLORS = ["text-yellow-400", "text-slate-300", "text-amber-600"];

function Avatar({ user, size = "w-7 h-7" }) {
  return user.user_avatar ? (
    <img src={user.user_avatar} alt={user.user_name} className={`${size} rounded-full object-cover border border-victory-border flex-shrink-0`} />
  ) : (
    <div className={`${size} rounded-full bg-victory-lime/20 flex items-center justify-center text-victory-lime text-[10px] font-bold flex-shrink-0`}>
      {(user.user_name || "?")[0].toUpperCase()}
    </div>
  );
}

export function TopKnockouts({ streamId, refreshTrigger }) {
  const [rows,      setRows]      = useState([]);
  const [scope,     setScope]     = useState("session"); // "session" | "lifetime"
  const [collapsed, setCollapsed] = useState(false);
  const [loading,   setLoading]   = useState(true);
  // Track previous rank positions for animation
  const [prevIds,   setPrevIds]   = useState([]);

  const fetch = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/streams/${streamId}/leaderboard?scope=${scope}`);
      setRows((prev) => {
        setPrevIds(prev.map((r) => r.user_id));
        return res.data.slice(0, 3);
      });
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [streamId, scope]);

  useEffect(() => { setLoading(true); fetch(); }, [fetch]);

  // Re-fetch whenever a new tip comes in
  useEffect(() => { if (refreshTrigger) fetch(); }, [refreshTrigger, fetch]);

  if (!loading && rows.length === 0) return null;

  const movedUp = (userId, idx) => prevIds.indexOf(userId) > idx;

  return (
    <div className="bg-victory-card border border-victory-border rounded-xl overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-victory-card-highlight transition-colors"
      >
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-yellow-400" />
          <span className="text-victory-text text-sm font-semibold">Top Knockouts</span>
          {rows.length > 0 && !collapsed && (
            <div className="flex gap-1 ml-1">
              {["session", "lifetime"].map((s) => (
                <button
                  key={s}
                  onClick={(e) => { e.stopPropagation(); setScope(s); }}
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize transition-colors ${
                    scope === s ? "bg-victory-lime text-victory-bg" : "text-victory-muted hover:text-victory-text"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
        {collapsed
          ? <ChevronDown className="w-4 h-4 text-victory-muted" />
          : <ChevronUp className="w-4 h-4 text-victory-muted" />}
      </button>

      {/* Leaderboard rows */}
      {!collapsed && (
        <div className="divide-y divide-victory-border/50">
          {loading ? (
            <div className="flex justify-center py-4">
              <div className="w-5 h-5 border-2 border-victory-lime border-t-transparent rounded-full animate-spin" />
            </div>
          ) : rows.map((row, i) => (
            <div
              key={row.user_id}
              className={`flex items-center gap-3 px-3 py-2.5 transition-all ${
                movedUp(row.user_id, i) ? "animate-pulse bg-victory-lime/5" : ""
              }`}
            >
              <span className="text-base w-5 text-center">{MEDALS[i]}</span>
              <Avatar user={row} />
              <div className="flex-1 min-w-0">
                <p className="text-victory-text text-xs font-semibold truncate">{row.user_name}</p>
              </div>
              <span className={`text-xs font-mono font-bold ${RANK_COLORS[i]}`}>
                {row.total.toLocaleString()} <span className="opacity-60 font-normal">tkn</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
