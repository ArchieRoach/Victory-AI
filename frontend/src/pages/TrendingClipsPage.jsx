import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { formatDistanceToNow } from "date-fns";
import { API, useAuth } from "@/App";
import { BottomNav } from "@/components/BottomNav";
import { ShareSheet } from "@/components/ShareSheet";
import { toast } from "sonner";
import { Flame, Heart, Share2, MessageCircle, Play, ArrowLeft } from "lucide-react";

function timeAgo(str) {
  try { return formatDistanceToNow(new Date(str), { addSuffix: true }); }
  catch { return ""; }
}

const PERIODS = [
  { value: "24h", label: "Hot 🔥" },
  { value: "7d",  label: "Rising" },
  { value: "all", label: "All Time" },
];

function ClipCard({ clip, onLike, onShare }) {
  const navigate    = useNavigate();
  const videoRef    = useRef(null);
  const [playing,   setPlaying]   = useState(false);
  const authorName  = clip.author?.display_name || clip.author?.name || "Fighter";
  const shareCount  = clip.share_count || 0;

  const togglePlay = (e) => {
    e.stopPropagation();
    if (!videoRef.current) return;
    if (playing) {
      videoRef.current.pause();
      setPlaying(false);
    } else {
      videoRef.current.play().catch(() => {});
      setPlaying(true);
    }
  };

  return (
    <article className="bg-victory-card border-b border-victory-border">
      {/* Author row */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          onClick={() => navigate(`/profile/${clip.user_id}`)}
          className="flex items-center gap-3 flex-1 min-w-0"
        >
          {clip.author?.avatar_url ? (
            <img src={clip.author.avatar_url} alt={authorName}
              className="w-9 h-9 rounded-full object-cover border border-victory-border flex-shrink-0" />
          ) : (
            <div className="w-9 h-9 rounded-full bg-victory-lime/20 flex items-center justify-center flex-shrink-0">
              <span className="text-victory-lime font-bold text-sm">{authorName[0]?.toUpperCase()}</span>
            </div>
          )}
          <div className="min-w-0">
            <p className="font-semibold text-victory-text text-sm truncate">{authorName}</p>
            <p className="text-xs text-victory-muted">{timeAgo(clip.created_at)}</p>
          </div>
        </button>

        {clip.is_viral && (
          <span className="flex items-center gap-1 bg-victory-orange/20 text-victory-orange text-[10px] font-bold px-2 py-0.5 rounded-full border border-victory-orange/30 flex-shrink-0">
            <Flame className="w-3 h-3" /> VIRAL
          </span>
        )}
      </div>

      {/* Caption */}
      {clip.caption && (
        <p className="px-4 pb-3 text-victory-text text-sm leading-relaxed">{clip.caption}</p>
      )}

      {/* Video */}
      {clip.video_url ? (
        <div className="relative bg-black aspect-video">
          <video
            ref={videoRef}
            src={clip.video_url}
            className="w-full h-full object-contain"
            preload="metadata"
            loop
            playsInline
            onEnded={() => setPlaying(false)}
          />
          {!playing && (
            <button
              onClick={togglePlay}
              aria-label="Play video"
              className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/20 transition-colors"
            >
              <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <Play className="w-7 h-7 text-white fill-white ml-1" />
              </div>
            </button>
          )}
          {playing && (
            <button onClick={togglePlay} aria-label="Pause video" className="absolute inset-0" />
          )}
        </div>
      ) : clip.thumbnail_url ? (
        <div className="bg-black aspect-video">
          <img src={clip.thumbnail_url} alt={clip.caption} className="w-full h-full object-cover" />
        </div>
      ) : null}

      {/* Stream source tag */}
      {clip.stream_title && (
        <p className="px-4 pt-2 text-victory-muted text-xs">
          From stream: <span className="text-victory-text">{clip.stream_title}</span>
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-5 px-4 py-3">
        <button
          onClick={() => onLike(clip.post_id)}
          className={`flex items-center gap-1.5 transition-colors ${clip.liked_by_me ? "text-red-400" : "text-victory-muted hover:text-red-400"}`}
        >
          <Heart className={`w-5 h-5 ${clip.liked_by_me ? "fill-current" : ""}`} />
          <span className="text-sm">{clip.like_count || 0}</span>
        </button>
        <button
          className="flex items-center gap-1.5 text-victory-muted hover:text-victory-text transition-colors"
        >
          <MessageCircle className="w-5 h-5" />
          <span className="text-sm">{clip.comment_count || 0}</span>
        </button>
        <button
          onClick={() => onShare(clip)}
          className={`flex items-center gap-1.5 transition-colors ${shareCount > 0 ? "text-victory-orange" : "text-victory-muted hover:text-victory-orange"}`}
        >
          <Share2 className="w-5 h-5" />
          <span className="text-sm">{shareCount.toLocaleString()}</span>
        </button>
      </div>
    </article>
  );
}

export default function TrendingClipsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { postId } = useParams();

  const [period,  setPeriod]  = useState("24h");
  const [clips,   setClips]   = useState([]);
  const [featured, setFeatured] = useState(null);
  const [page,    setPage]    = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [shareTarget, setShareTarget] = useState(null);
  const reqIdRef = useRef(0);
  const likingRef = useRef(new Set());

  const fetchClips = useCallback(async (p, append = false) => {
    setLoading(true);
    // Ignore responses from superseded requests (period switch racing with load-more).
    const reqId = ++reqIdRef.current;
    try {
      const res = await axios.get(`${API}/clips/trending`, { params: { period, page: p } });
      if (reqId !== reqIdRef.current) return;
      setClips((prev) => append ? [...prev, ...res.data.clips] : res.data.clips);
      setHasMore(res.data.has_more);
    } catch {}
    if (reqId === reqIdRef.current) setLoading(false);
  }, [period]);

  useEffect(() => {
    setPage(1);
    fetchClips(1);
  }, [fetchClips]);

  // Deep-linked shared clip (/clip/:postId): fetch and pin it above the trending list.
  useEffect(() => {
    if (!postId) { setFeatured(null); return; }
    let cancelled = false;
    axios.get(`${API}/posts/${postId}`)
      .then((res) => { if (!cancelled) setFeatured(res.data); })
      .catch(() => { if (!cancelled) setFeatured(null); });
    return () => { cancelled = true; };
  }, [postId]);

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    fetchClips(next, true);
  };

  const handleLike = async (pid) => {
    if (likingRef.current.has(pid)) return; // ignore rapid double-taps
    likingRef.current.add(pid);
    try {
      const res = await axios.post(`${API}/posts/${pid}/like`);
      const apply = (c) =>
        c.post_id === pid
          ? { ...c, liked_by_me: res.data.liked, like_count: res.data.like_count ?? (c.like_count + (res.data.liked ? 1 : -1)) }
          : c;
      setClips((prev) => prev.map(apply));
      setFeatured((f) => (f && f.post_id === pid ? apply(f) : f));
    } catch {} finally {
      likingRef.current.delete(pid);
    }
  };

  const handleShareClose = () => setShareTarget(null);
  const handleShared = (postId, newCount) => {
    setClips((prev) =>
      prev.map((c) => c.post_id === postId ? { ...c, share_count: newCount } : c)
    );
  };

  return (
    <div className="min-h-screen bg-victory-bg pb-nav">

      {shareTarget && (
        <ShareSheet
          post={shareTarget}
          onClose={handleShareClose}
          onShared={(count) => handleShared(shareTarget.post_id, count)}
        />
      )}

      {/* Header */}
      <header className="sticky top-0 z-20 bg-victory-bg/95 backdrop-blur border-b border-victory-border">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={() => navigate(-1)} aria-label="Go back" className="w-11 h-11 flex items-center justify-center touch-target text-victory-muted hover:text-victory-text">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 flex-1">
            <Flame className="w-5 h-5 text-victory-orange" />
            <h1 className="text-lg font-heading font-extrabold text-victory-text">Trending Clips</h1>
          </div>
        </div>

        {/* Period tabs */}
        <div className="flex px-4 pb-0">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`pb-3 pr-6 text-sm font-semibold border-b-2 transition-colors ${
                period === p.value
                  ? "border-victory-orange text-victory-orange"
                  : "border-transparent text-victory-muted hover:text-victory-text"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </header>

      {/* Clips */}
      <main>
        {featured && (
          <div className="mb-1">
            <p className="px-4 py-2 text-xs font-semibold text-victory-orange uppercase tracking-wide">Shared clip</p>
            <ClipCard clip={featured} onLike={handleLike} onShare={setShareTarget} />
          </div>
        )}
        {loading && clips.length === 0 ? (
          <div className="space-y-1 mt-1">
            {[1,2,3].map((i) => (
              <div key={i} className="bg-victory-card border-b border-victory-border">
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="skeleton-shimmer w-9 h-9 rounded-full flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="skeleton-shimmer h-3 w-1/2 rounded" />
                    <div className="skeleton-shimmer h-2.5 w-1/4 rounded" />
                  </div>
                </div>
                <div className="skeleton-shimmer w-full aspect-video" />
                <div className="h-12" />
              </div>
            ))}
          </div>
        ) : clips.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-8 text-center gap-4">
            <Flame className="w-12 h-12 text-victory-orange/30" />
            <p className="text-victory-text font-bold">No clips yet</p>
            <p className="text-victory-muted text-sm">
              {period === "24h"
                ? "No clips in the last 24 hours. Check Rising or All Time."
                : "Be the first to clip a live stream!"}
            </p>
          </div>
        ) : (
          <>
            {clips.map((clip) => (
              <ClipCard
                key={clip.post_id}
                clip={clip}
                onLike={handleLike}
                onShare={setShareTarget}
              />
            ))}
            {hasMore && (
              <button
                onClick={loadMore}
                disabled={loading}
                className="w-full py-4 text-victory-muted text-sm hover:text-victory-text transition-colors border-t border-victory-border disabled:opacity-50"
              >
                {loading ? "Loading…" : "Load more clips"}
              </button>
            )}
          </>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
