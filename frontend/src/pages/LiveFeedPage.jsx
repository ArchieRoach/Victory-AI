import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API, useAuth } from "@/App";
import { Radio, Users, Tv, Plus } from "lucide-react";
import { BottomNav } from "@/components/BottomNav";

const TYPE_COLORS = {
  training: "bg-blue-500/20 text-blue-400",
  sparring: "bg-yellow-500/20 text-yellow-400",
  smoker: "bg-orange-500/20 text-orange-400",
  bout: "bg-red-500/20 text-red-400",
};

const FILTERS = [
  { label: "All", value: null },
  { label: "Live Now", value: "live" },
  { label: "Recent", value: "idle" },
];

function StreamCard({ stream }) {
  const navigate = useNavigate();
  const isLive = stream.status === "live";

  return (
    <button
      onClick={() => navigate(`/stream/${stream.stream_id}`)}
      className="victory-card p-4 text-left w-full hover:border-victory-lime/40 transition-colors"
    >
      {/* Thumbnail placeholder */}
      <div className="w-full aspect-video bg-black rounded-lg mb-3 flex items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-victory-card to-black" />
        {isLive && (
          <div className="absolute top-2 left-2 flex items-center gap-1 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded">
            <Radio className="w-3 h-3" />
            LIVE
          </div>
        )}
        <div className="relative z-10 flex flex-col items-center gap-1">
          {stream.user_avatar ? (
            <img
              src={stream.user_avatar}
              alt={stream.user_name}
              className="w-12 h-12 rounded-full object-cover border-2 border-victory-border"
              onError={(e) => { e.target.style.display = "none"; }}
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-victory-lime/20 flex items-center justify-center text-victory-lime text-xl font-bold">
              {(stream.user_name || "F")[0].toUpperCase()}
            </div>
          )}
        </div>
        {isLive && (
          <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-black/70 text-victory-muted text-xs px-2 py-0.5 rounded">
            <Users className="w-3 h-3" />
            {stream.viewer_count}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-victory-text font-semibold text-sm truncate">{stream.title}</p>
          <p className="text-victory-muted text-xs truncate">{stream.user_name}</p>
        </div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded capitalize flex-shrink-0 ${TYPE_COLORS[stream.type] || "bg-victory-border text-victory-muted"}`}>
          {stream.type}
        </span>
      </div>
    </button>
  );
}

export default function LiveFeedPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [streams, setStreams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState(null);

  const fetchStreams = useCallback(async () => {
    try {
      const params = {};
      if (filter) params.status = filter;
      const res = await axios.get(`${API}/streams`, { params });
      setStreams(res.data);
    } catch {
      // silently fail on background refresh
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    fetchStreams();
  }, [fetchStreams]);

  // Auto-refresh every 30s when watching live streams
  useEffect(() => {
    const interval = setInterval(fetchStreams, 30000);
    return () => clearInterval(interval);
  }, [fetchStreams]);

  return (
    <div className="min-h-screen bg-victory-bg pb-nav">
      {/* Header */}
      <div className="px-4 pt-6 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Tv className="w-6 h-6 text-victory-lime" />
          <h1 className="text-xl font-heading font-extrabold text-victory-text">Live</h1>
        </div>
        <button
          onClick={() => navigate("/go-live")}
          className="flex items-center gap-1.5 border border-victory-border text-victory-text text-sm rounded-lg px-3 py-2 hover:border-victory-lime transition-colors"
        >
          <Plus className="w-4 h-4" />
          Go Live
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 px-4 mb-4">
        {FILTERS.map(({ label, value }) => (
          <button
            key={label}
            onClick={() => setFilter(value)}
            className={`text-sm font-medium px-4 py-1.5 rounded-full transition-colors ${
              filter === value
                ? "bg-victory-lime text-victory-bg"
                : "bg-victory-card border border-victory-border text-victory-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Stream grid */}
      <div className="px-4">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-victory-lime border-t-transparent rounded-full animate-spin" />
          </div>
        ) : streams.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <Tv className="w-12 h-12 text-victory-muted mx-auto" />
            <p className="text-victory-muted">
              {filter === "live" ? "Nobody is live right now." : "No streams yet."}
            </p>
            <button
              onClick={() => navigate("/go-live")}
              className="victory-btn-primary px-8 mt-2"
            >
              Be the first to go live
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {streams.map((s) => (
              <StreamCard key={s.stream_id} stream={s} />
            ))}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
