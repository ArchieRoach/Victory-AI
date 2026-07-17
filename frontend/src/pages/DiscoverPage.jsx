import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API, useAuth } from "@/App";
import { BottomNav } from "@/components/BottomNav";
import { toast } from "sonner";
import {
  Search, X, Radio, Users, Dumbbell, ChevronDown, ChevronUp,
} from "lucide-react";
import { WEIGHT_CLASS_DATA, formatWeightClass, weightBadge, getWeightUnit } from "@/utils/weightClasses";

const WEIGHT_CLASS_NAMES = [
  "All",
  ...WEIGHT_CLASS_DATA.map((w) => w.name),
];

const STANCES  = ["All", "Orthodox", "Southpaw", "Switch"];
const SORTS    = [
  { value: "active",    label: "Most Active" },
  { value: "followers", label: "Most Followed" },
  { value: "record",    label: "Best Record" },
  { value: "new",       label: "Newest" },
];

const STANCE_COLORS = {
  Orthodox: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  Southpaw: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  Switch:   "bg-violet-500/10 text-violet-400 border-violet-500/20",
};

function FighterCard({ fighter, onFollowChange, weightUnit }) {
  const navigate   = useNavigate();
  const [following, setFollowing] = useState(fighter.is_following);
  const [busy,      setBusy]      = useState(false);

  const record =
    (fighter.amateur_wins     || 0) +
    (fighter.competition_wins || 0);
  const losses =
    (fighter.amateur_losses     || 0) +
    (fighter.competition_losses || 0);

  const handleFollow = async (e) => {
    e.stopPropagation();
    setBusy(true);
    try {
      if (following) {
        await axios.delete(`${API}/follows/${fighter.user_id}`);
        setFollowing(false);
        onFollowChange?.(fighter.user_id, false);
      } else {
        await axios.post(`${API}/follows/${fighter.user_id}`);
        setFollowing(true);
        onFollowChange?.(fighter.user_id, true);
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not update follow.");
    }
    setBusy(false);
  };

  return (
    <div
      onClick={() => navigate(`/profile/${fighter.user_id}`)}
      className="bg-victory-card border border-victory-border rounded-2xl p-4 flex items-center gap-3 cursor-pointer active:scale-[0.99] transition-transform"
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        {fighter.avatar_url ? (
          <img
            src={fighter.avatar_url}
            alt={fighter.display_name}
            className="w-14 h-14 rounded-full object-cover border-2 border-victory-border"
            onError={(e) => { e.target.style.display = "none"; }}
          />
        ) : (
          <div className="w-14 h-14 rounded-full bg-victory-lime/10 flex items-center justify-center text-victory-lime text-xl font-black border-2 border-victory-border">
            {(fighter.display_name || fighter.name || "F")[0].toUpperCase()}
          </div>
        )}
        {fighter.is_live && (
          <span className="absolute -bottom-1 -right-1 flex items-center gap-0.5 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none">
            <Radio className="w-2 h-2" /> LIVE
          </span>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-victory-text font-bold text-sm truncate">
          {fighter.display_name || fighter.name}
        </p>

        <div className="flex items-center gap-2 flex-wrap mt-0.5">
          {fighter.weight_class && (
            <span className="text-[10px] text-victory-lime font-medium">
              {fighter.weight_class}
              {weightBadge(fighter.weight_class, weightUnit) && (
                <span className="text-victory-muted font-normal ml-1">
                  · {weightBadge(fighter.weight_class, weightUnit)}
                </span>
              )}
            </span>
          )}
          {fighter.stance && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${STANCE_COLORS[fighter.stance] || "bg-victory-border/30 text-victory-muted border-victory-border"}`}>
              {fighter.stance}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 mt-1.5 text-[11px] text-victory-muted">
          {(record + losses) > 0 && (
            <span className="font-mono">
              <span className="text-victory-lime font-bold">{record}W</span>
              {" "}
              <span className="text-red-400">{losses}L</span>
            </span>
          )}
          <span className="flex items-center gap-1">
            <Dumbbell className="w-3 h-3" />
            {fighter.total_sessions} sessions
          </span>
          <span className="flex items-center gap-1">
            <Users className="w-3 h-3" />
            {(fighter.follower_count || 0).toLocaleString()}
          </span>
        </div>

        {fighter.bio && (
          <p className="text-victory-muted text-[11px] mt-1 truncate">{fighter.bio}</p>
        )}
      </div>

      {/* Follow button */}
      <button
        onClick={handleFollow}
        disabled={busy}
        className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors disabled:opacity-50 ${
          following
            ? "border-victory-border text-victory-muted hover:border-red-500/40 hover:text-red-400"
            : "border-victory-lime text-victory-lime hover:bg-victory-lime/10"
        }`}
      >
        {busy ? "…" : following ? "Following" : "Follow"}
      </button>
    </div>
  );
}

export default function DiscoverPage() {
  const { user }    = useAuth();
  const weightUnit  = getWeightUnit(user);
  const [q,              setQ]             = useState("");
  const [weightClass,    setWeightClass]   = useState("All");
  const [stance,         setStance]        = useState("All");
  const [sort,           setSort]          = useState("active");
  const [fighters,       setFighters]      = useState([]);
  const [page,           setPage]          = useState(1);
  const [totalPages,     setTotalPages]    = useState(1);
  const [loading,        setLoading]       = useState(false);
  const [initialDone,    setInitialDone]   = useState(false);
  const [showFilters,    setShowFilters]   = useState(false);

  const debounceRef = useRef(null);

  const fetchFighters = useCallback(async (params, append = false) => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/search/fighters`, { params });
      setFighters((prev) => append ? [...prev, ...res.data.fighters] : res.data.fighters);
      setTotalPages(res.data.pages);
    } catch {}
    setLoading(false);
    setInitialDone(true);
  }, []);

  // Debounced search on filter change — reset to page 1
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      fetchFighters({ q, weight_class: weightClass, stance, sort, page: 1 });
    }, q ? 350 : 0);
    return () => clearTimeout(debounceRef.current);
  }, [q, weightClass, stance, sort, fetchFighters]);

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    fetchFighters({ q, weight_class: weightClass, stance, sort, page: next }, true);
  };

  const activeFilters = [weightClass !== "All" && weightClass, stance !== "All" && stance].filter(Boolean);

  return (
    <div className="min-h-screen bg-victory-bg pb-24">

      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-20 bg-victory-bg/95 backdrop-blur border-b border-victory-border">

        {/* Search bar */}
        <div className="px-4 py-3 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-victory-muted pointer-events-none" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search fighters by name…"
              className="w-full bg-victory-card border border-victory-border rounded-xl pl-9 pr-9 py-2.5 text-victory-text text-sm placeholder:text-victory-muted focus:outline-none focus:border-victory-lime"
            />
            {q && (
              <button onClick={() => setQ("")} aria-label="Clear search" className="absolute right-1 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center touch-target text-victory-muted hover:text-victory-text">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-xs font-medium transition-colors flex-shrink-0 ${
              activeFilters.length > 0 || showFilters
                ? "border-victory-lime text-victory-lime bg-victory-lime/10"
                : "border-victory-border text-victory-muted hover:border-victory-lime/40"
            }`}
          >
            Filters
            {activeFilters.length > 0 && (
              <span className="w-4 h-4 rounded-full bg-victory-lime text-victory-bg text-[10px] font-black flex items-center justify-center">
                {activeFilters.length}
              </span>
            )}
            {showFilters ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>

        {/* Weight class pills — always visible, horizontal scroll */}
        <div className="flex gap-2 px-4 pb-3 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          {WEIGHT_CLASS_NAMES.map((wc) => (
            <button
              key={wc}
              onClick={() => setWeightClass(wc)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap ${
                weightClass === wc
                  ? "bg-victory-lime text-victory-bg border-victory-lime"
                  : "border-victory-border text-victory-muted hover:border-victory-lime/40 hover:text-victory-text"
              }`}
            >
              {formatWeightClass(wc, weightUnit)}
            </button>
          ))}
        </div>

        {/* Expanded filters panel */}
        {showFilters && (
          <div className="px-4 pb-3 space-y-3 border-t border-victory-border pt-3">
            {/* Stance */}
            <div>
              <p className="text-victory-muted text-xs mb-2">Stance</p>
              <div className="flex gap-2">
                {STANCES.map((s) => (
                  <button
                    key={s}
                    onClick={() => setStance(s)}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      stance === s
                        ? "bg-victory-lime text-victory-bg border-victory-lime"
                        : "border-victory-border text-victory-muted hover:border-victory-lime/40"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Sort */}
            <div>
              <p className="text-victory-muted text-xs mb-2">Sort by</p>
              <div className="flex gap-2 flex-wrap">
                {SORTS.map((s) => (
                  <button
                    key={s.value}
                    onClick={() => setSort(s.value)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      sort === s.value
                        ? "bg-victory-lime text-victory-bg border-victory-lime"
                        : "border-victory-border text-victory-muted hover:border-victory-lime/40"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Clear */}
            {activeFilters.length > 0 && (
              <button
                onClick={() => { setWeightClass("All"); setStance("All"); }}
                className="text-red-400 text-xs hover:text-red-300"
              >
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Results ── */}
      <div className="max-w-lg mx-auto px-4 py-4 space-y-3">

        {/* Context label */}
        {initialDone && (
          <p className="text-victory-muted text-xs">
            {weightClass !== "All"
              ? `${weightClass} fighters`
              : q ? `Results for "${q}"` : "All fighters"}
            {stance !== "All" ? ` · ${stance}` : ""}
          </p>
        )}

        {/* Loading skeleton */}
        {loading && fighters.length === 0 && (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-victory-card border border-victory-border rounded-2xl p-4 flex items-center gap-3 animate-pulse">
              <div className="w-14 h-14 rounded-full bg-victory-border flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-victory-border rounded w-2/3" />
                <div className="h-2 bg-victory-border rounded w-1/2" />
                <div className="h-2 bg-victory-border rounded w-1/3" />
              </div>
              <div className="w-16 h-8 bg-victory-border rounded-xl flex-shrink-0" />
            </div>
          ))
        )}

        {/* Fighter cards */}
        {fighters.map((f) => (
          <FighterCard
            key={f.user_id}
            fighter={f}
            weightUnit={weightUnit}
            onFollowChange={(uid, nowFollowing) => {
              setFighters((prev) =>
                prev.map((x) => x.user_id === uid ? { ...x, is_following: nowFollowing, follower_count: x.follower_count + (nowFollowing ? 1 : -1) } : x)
              );
            }}
          />
        ))}

        {/* Empty state */}
        {initialDone && !loading && fighters.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-victory-lime/10 border border-victory-lime/20 flex items-center justify-center mb-4">
              <Search className="w-8 h-8 text-victory-lime/60" />
            </div>
            <p className="text-victory-text font-bold text-lg mb-1">No fighters found</p>
            <p className="text-victory-muted text-sm">
              {q ? `No one matches "${q}"` : "Be the first to represent your weight class!"}
            </p>
            {(activeFilters.length > 0 || q) && (
              <button
                onClick={() => { setWeightClass("All"); setStance("All"); setQ(""); }}
                className="mt-4 text-victory-lime text-sm font-semibold underline underline-offset-2"
              >
                Clear all filters
              </button>
            )}
          </div>
        )}

        {/* Load more */}
        {initialDone && !loading && fighters.length > 0 && page < totalPages && (
          <button
            onClick={loadMore}
            className="w-full py-3 rounded-xl border border-victory-border text-victory-muted text-sm hover:border-victory-lime/40 hover:text-victory-text transition-colors"
          >
            Load more fighters
          </button>
        )}

        {/* Loading spinner for pagination */}
        {loading && fighters.length > 0 && (
          <div className="flex justify-center py-4">
            <div className="w-5 h-5 border-2 border-victory-lime border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
