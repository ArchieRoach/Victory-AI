import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API, useAuth } from "@/App";
import { Radio, Tv, Plus } from "lucide-react";
import { BottomNav } from "@/components/BottomNav";
import { DeepTaggingMatrix } from "@/components/streaming/DeepTaggingMatrix";
import { StreamCard } from "@/components/streaming/StreamCard";

const DEFAULT_FILTERS = {
  status:       null,
  weight_class: null,
  category:     null,
  role:         null,
};

export default function LiveFeedPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [streams,  setStreams]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [filters,  setFilters]  = useState(DEFAULT_FILTERS);

  // Only pass status to the API — everything else is client-side (zero-latency)
  const fetchStreams = useCallback(async () => {
    try {
      const params = {};
      if (filters.status) params.status = filters.status;
      const res = await axios.get(`${API}/streams`, { params });
      setStreams(res.data);
    } catch {
      // silent on background refresh
    } finally {
      setLoading(false);
    }
  }, [filters.status]);

  useEffect(() => {
    setLoading(true);
    fetchStreams();
  }, [fetchStreams]);

  // Background refresh every 30 s
  useEffect(() => {
    const id = setInterval(fetchStreams, 30_000);
    return () => clearInterval(id);
  }, [fetchStreams]);

  // Client-side multi-filter — instant, no re-fetch
  const visible = useMemo(() => {
    return streams.filter((s) => {
      if (filters.weight_class && s.weight_class !== filters.weight_class) return false;
      if (filters.category    && s.category     !== filters.category)     return false;
      if (filters.role        && s.role         !== filters.role)         return false;
      return true;
    });
  }, [streams, filters.weight_class, filters.category, filters.role]);

  const liveCount = streams.filter((s) => s.status === "live").length;

  return (
    <div className="min-h-screen bg-victory-bg pb-nav">

      {/* Header */}
      <div className="px-4 pt-6 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Tv className="w-6 h-6 text-victory-lime" />
          <h1 className="text-xl font-heading font-extrabold text-victory-text">Live</h1>
          {liveCount > 0 && (
            <span className="flex items-center gap-1 text-xs text-red-400 font-semibold">
              <Radio className="w-3 h-3" />
              {liveCount} live
            </span>
          )}
        </div>
        <button
          onClick={() => navigate("/go-live")}
          className="flex items-center gap-1.5 border border-victory-border text-victory-text text-sm rounded-lg px-3 py-2 hover:border-victory-lime transition-colors"
        >
          <Plus className="w-4 h-4" />
          Go Live
        </button>
      </div>

      {/* Deep filter matrix */}
      <div className="pb-3">
        <DeepTaggingMatrix filters={filters} onChange={setFilters} />
      </div>

      {/* Stream grid */}
      <div className="px-4">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-victory-lime border-t-transparent rounded-full animate-spin" />
          </div>
        ) : visible.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <Tv className="w-12 h-12 text-victory-muted mx-auto" />
            <p className="text-victory-muted">
              {filters.status === "live"
                ? "Nobody is live right now."
                : streams.length > 0
                ? "No streams match your filters."
                : "No streams yet."}
            </p>
            {streams.length > 0 ? (
              <button
                onClick={() => setFilters(DEFAULT_FILTERS)}
                className="text-sm text-victory-lime hover:underline"
              >
                Clear filters
              </button>
            ) : (
              <button
                onClick={() => navigate("/go-live")}
                className="victory-btn-primary px-8 mt-2"
              >
                Be the first to go live
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {visible.map((s) => (
              <StreamCard key={s.stream_id} stream={s} />
            ))}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
