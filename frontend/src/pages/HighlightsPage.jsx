import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { API } from "@/App";
import { toast } from "sonner";
import { ArrowLeft, Scissors, Flame, Share2, Trophy, Radio, Trash2, X, AlertCircle, Dumbbell } from "lucide-react";
import { BottomNav } from "@/components/BottomNav";
import { HighlightShareSheet } from "@/components/HighlightShareSheet";

const PENDING = ["clipping", "processing"];
const SORTS = [
  { value: "recent", label: "Recent" },
  { value: "top",    label: "Biggest pops" },
];

function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function HighlightCard({ hl, isBest, onOpen, onDelete }) {
  const pending = PENDING.includes(hl.status);
  const failed  = hl.status === "failed";
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(hl)}
      onKeyDown={(e) => { if (e.key === "Enter") onOpen(hl); }}
      className={`relative aspect-[9/16] rounded-2xl overflow-hidden bg-victory-card border cursor-pointer active:scale-[0.99] transition-transform ${
        isBest ? "border-victory-lime/60" : failed ? "border-victory-danger/40" : "border-victory-border"
      }`}
    >
      {hl.status === "ready" && hl.thumbnail_url ? (
        <img src={hl.thumbnail_url} alt={hl.stream_title} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
      ) : pending ? (
        <div className="skeleton-shimmer absolute inset-0" />
      ) : null}

      <div className="absolute inset-0 bg-gradient-to-t from-victory-bg via-transparent to-victory-bg/40" />

      <div className="absolute top-2 left-2 right-1 flex items-start justify-between gap-1">
        {isBest ? (
          <span className="flex items-center gap-1 bg-victory-lime text-victory-bg text-[10px] font-heading font-extrabold px-2 py-0.5 rounded-full">
            <Trophy className="w-3 h-3" /> BEST
          </span>
        ) : hl.source === "auto" ? (
          <span className="flex items-center gap-1 bg-victory-bg/80 text-victory-lime text-[10px] font-heading font-bold px-2 py-0.5 rounded-full border border-victory-lime/30">
            <Flame className="w-3 h-3" /> AUTO
          </span>
        ) : hl.source === "training" ? (
          <span className="flex items-center gap-1 bg-victory-bg/80 text-victory-teal text-[10px] font-heading font-bold px-2 py-0.5 rounded-full border border-victory-teal/30">
            <Dumbbell className="w-3 h-3" /> ROUND
          </span>
        ) : (
          <span className="flex items-center gap-1 bg-victory-bg/80 text-victory-muted text-[10px] font-heading font-bold px-2 py-0.5 rounded-full border border-victory-border">
            <Scissors className="w-3 h-3" /> CLIP
          </span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(hl); }}
          aria-label="Delete highlight"
          className="w-11 h-11 -mt-2 flex items-center justify-center touch-target text-victory-muted hover:text-victory-danger"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {pending && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-3 text-center">
          <Scissors className="w-6 h-6 text-victory-lime animate-bounce-slow" />
          <p className="text-victory-text text-xs font-heading font-bold">Rendering…</p>
        </div>
      )}
      {failed && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-3 text-center">
          <AlertCircle className="w-6 h-6 text-victory-danger" />
          <p className="text-victory-text text-xs font-heading font-bold">Tap to retry</p>
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 p-2.5">
        {hl.source === "training" && hl.round_score != null && (
          <p className="font-mono font-bold text-lg text-victory-lime leading-none">
            {Number(hl.round_score).toFixed(1)}<span className="text-victory-muted text-[10px] font-body font-medium ml-1">AI score</span>
          </p>
        )}
        {hl.peak_reactions > 0 && (
          <p className="font-mono font-bold text-lg text-victory-lime leading-none">
            {hl.peak_reactions}<span className="text-victory-muted text-[10px] font-body font-medium ml-1">reactions</span>
          </p>
        )}
        <p className="text-victory-text text-xs font-semibold truncate mt-1">{hl.stream_title || "Stream"}</p>
        <div className="flex items-center justify-between text-victory-muted text-[10px] mt-0.5">
          <span>{timeAgo(hl.created_at)}</span>
          {hl.share_count > 0 && (
            <span className="flex items-center gap-0.5"><Share2 className="w-3 h-3" />{hl.share_count}</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function HighlightsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const streamFilter = params.get("stream");
  const openParam    = params.get("open");

  const [sort,    setSort]    = useState("recent");
  const [items,   setItems]   = useState([]);
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [open,    setOpen]    = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/highlights/mine`, {
        params: { sort, ...(streamFilter ? { stream_id: streamFilter } : {}) },
      });
      setItems(res.data.highlights || []);
      setStats(res.data.stats || null);
    } catch {
      toast.error("Couldn't load your highlights");
    } finally {
      setLoading(false);
    }
  }, [sort, streamFilter]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  // Deep links (push notification, end of stream) land straight in the share sheet, so the
  // reward is one tap away instead of four. "best" = the biggest pop, else the newest.
  useEffect(() => {
    if (!openParam || loading) return;
    let target = null;
    if (openParam === "best") {
      target = items.reduce((best, h) => (!best || (h.peak_reactions || 0) > (best.peak_reactions || 0) ? h : best), null);
    } else {
      target = items.find((h) => h.highlight_id === openParam) || { highlight_id: openParam };
    }
    if (target) setOpen(target);
    const next = new URLSearchParams(params);
    next.delete("open");
    setParams(next, { replace: true });
  }, [openParam, loading, items, params, setParams]);

  const anyPending = items.some((h) => PENDING.includes(h.status));
  useEffect(() => {
    if (!anyPending) return;
    const t = setInterval(load, 6000);
    return () => clearInterval(t);
  }, [anyPending, load]);

  const bestId = items.reduce(
    (best, h) => (h.status === "ready" && h.peak_reactions > (best?.peak_reactions || 0) ? h : best),
    null,
  )?.highlight_id;

  const handleDelete = (hl) => {
    toast("Delete this highlight?", {
      description: "It'll be removed from Victory AI. Copies you already shared stay where you posted them.",
      action: {
        label: "Delete",
        onClick: async () => {
          try {
            await axios.delete(`${API}/highlights/${hl.highlight_id}`);
            setItems((xs) => xs.filter((x) => x.highlight_id !== hl.highlight_id));
          } catch {
            toast.error("Couldn't delete — try again");
          }
        },
      },
    });
  };

  const handleChange = useCallback((updated) => {
    setItems((xs) => xs.map((x) => (x.highlight_id === updated.highlight_id ? { ...x, ...updated } : x)));
  }, []);

  return (
    <div className="min-h-screen bg-victory-bg pb-nav">
      <div className="sticky top-0 z-20 bg-victory-bg/95 backdrop-blur border-b border-victory-border">
        <header className="p-4 flex items-center gap-2 max-w-lg mx-auto">
          <button onClick={() => navigate(-1)} aria-label="Go back" className="w-11 h-11 -ml-2 flex items-center justify-center touch-target text-victory-muted hover:text-victory-text">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-heading font-extrabold text-victory-text">Highlights</h1>
            <p className="text-victory-muted text-sm">Your biggest moments, clipped when your chat went wild</p>
          </div>
        </header>
        <div className="flex gap-2 px-4 pb-3 overflow-x-auto no-scrollbar max-w-lg mx-auto">
          {SORTS.map((s) => (
            <button
              key={s.value}
              onClick={() => setSort(s.value)}
              className={`filter-pill ${sort === s.value ? "filter-pill-active" : "filter-pill-inactive"}`}
            >
              {s.label}
            </button>
          ))}
          {streamFilter && (
            <button onClick={() => setParams({})} className="filter-pill filter-pill-inactive flex items-center gap-1">
              Last stream <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      <main className="max-w-lg mx-auto px-4 py-4 space-y-4">
        {stats && stats.total > 0 && (
          <div className="grid grid-cols-3 gap-2">
            <div className="stat-pill">
              <span className="font-mono font-bold text-xl text-victory-lime">{stats.total}</span>
              <span className="text-victory-muted text-xs mt-1">Highlights</span>
            </div>
            <div className="stat-pill">
              <span className="font-mono font-bold text-xl text-victory-lime">{stats.best_reactions}</span>
              <span className="text-victory-muted text-xs mt-1">Biggest pop</span>
            </div>
            <div className="stat-pill">
              <span className="font-mono font-bold text-xl text-victory-lime">{stats.total_shares}</span>
              <span className="text-victory-muted text-xs mt-1">Shares</span>
            </div>
          </div>
        )}

        {loading && (
          <div className="grid grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton-shimmer aspect-[9/16] rounded-2xl" />)}
          </div>
        )}

        {!loading && items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center px-6">
            <div className="w-16 h-16 rounded-2xl bg-victory-lime/10 border border-victory-lime/20 flex items-center justify-center mb-4">
              <Scissors className="w-8 h-8 text-victory-lime/60" />
            </div>
            <p className="text-victory-text font-bold text-lg mb-1">No highlights yet</p>
            <p className="text-victory-muted text-sm">
              Go live. When your viewers smash the hype button at the same moment, we clip it and watermark it for you automatically.
            </p>
            <button onClick={() => navigate("/go-live")} className="mt-4 victory-btn-primary w-auto px-6 flex items-center gap-2">
              <Radio className="w-4 h-4" /> Go Live
            </button>
          </div>
        )}

        {!loading && items.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {items.map((hl) => (
              <HighlightCard
                key={hl.highlight_id}
                hl={hl}
                isBest={hl.highlight_id === bestId}
                onOpen={setOpen}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </main>

      {open && (
        <HighlightShareSheet
          highlightId={open.highlight_id}
          initial={open}
          onClose={() => setOpen(null)}
          onChange={handleChange}
        />
      )}

      <BottomNav />
    </div>
  );
}
