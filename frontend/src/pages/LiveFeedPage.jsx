import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import Hls from "hls.js";
import { API } from "@/App";
import { BottomNav } from "@/components/BottomNav";
import { Radio, Users, Volume2, VolumeX, Plus, Tv } from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtViewers(n = 0) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function buildRecord(stream) {
  if (stream.pro_wins != null && (stream.pro_wins || stream.pro_losses || stream.pro_draws)) {
    return `${stream.pro_wins}-${stream.pro_losses}-${stream.pro_draws} Pro`;
  }
  if (stream.amateur_wins || stream.amateur_losses) {
    return `${stream.amateur_wins || 0}-${stream.amateur_losses || 0} Am.`;
  }
  return null;
}

// ── Filter pills ──────────────────────────────────────────────────────────────
const STATUS_PILLS = [
  { label: "All",      value: null        },
  { label: "🔴 Live",  value: "live"      },
  { label: "Recent",   value: "recent"    },
];

// ── Full-screen stream card with IntersectionObserver HLS autoplay ─────────
function StreamCard({ stream, muted, onToggleMute }) {
  const navigate = useNavigate();
  const cardRef  = useRef(null);
  const videoRef = useRef(null);
  const hlsRef   = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [error,   setError]   = useState(false);

  const startHls = useCallback(() => {
    const video = videoRef.current;
    if (!video || !stream.playback_id) return;
    const src = `https://livepeercdn.studio/hls/${stream.playback_id}/index.m3u8`;
    setError(false);

    if (Hls.isSupported()) {
      const hls = new Hls({ lowLatencyMode: true, maxBufferLength: 10 });
      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.muted = true;
        video.play().then(() => setPlaying(true)).catch(() => setError(true));
      });
      hls.on(Hls.Events.ERROR, (_, d) => {
        if (d.fatal) setError(true);
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      video.muted = true;
      video.play().then(() => setPlaying(true)).catch(() => setError(true));
    } else {
      setError(true);
    }
  }, [stream.playback_id]);

  const stopHls = useCallback(() => {
    const video = videoRef.current;
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    if (video) { video.pause(); video.src = ""; }
    setPlaying(false);
  }, []);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { entry.isIntersecting ? startHls() : stopHls(); },
      { threshold: 0.55 }
    );
    obs.observe(el);
    return () => { obs.disconnect(); stopHls(); };
  }, [startHls, stopHls]);

  // Keep muted state in sync
  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);

  const isLive  = stream.status === "live";
  const record  = buildRecord(stream);
  const name    = stream.display_name || stream.user_name || "Fighter";
  const initial = name[0].toUpperCase();

  return (
    <div ref={cardRef} className="h-screen w-full snap-start relative flex-shrink-0 bg-black overflow-hidden">

      {/* Video layer */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        playsInline
        muted
        loop
      />

      {/* Overlay: tap anywhere to open full stream view */}
      <button
        className="absolute inset-0 z-10"
        onClick={() => navigate(`/stream/${stream.stream_id}`)}
        aria-label="Open stream"
      />

      {/* Gradient layers */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-black/40 pointer-events-none" />

      {/* No playback fallback */}
      {!playing && !error && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-10 h-10 border-2 border-white/40 border-t-white rounded-full animate-spin" />
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-2 text-center px-8">
            <Tv className="w-10 h-10 text-white/40" />
            <p className="text-white/60 text-sm">Stream unavailable</p>
          </div>
        </div>
      )}

      {/* Top-left badges */}
      <div className="absolute top-16 left-4 flex items-center gap-2 z-20 pointer-events-none">
        {isLive ? (
          <span className="flex items-center gap-1.5 bg-victory-danger text-white text-xs font-bold px-2.5 py-1 rounded">
            <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
            LIVE
          </span>
        ) : (
          <span className="bg-white/20 backdrop-blur-sm text-white text-xs font-semibold px-2.5 py-1 rounded">
            Recent
          </span>
        )}
        {stream.category && (
          <span className={`text-xs font-semibold px-2.5 py-1 rounded backdrop-blur-sm ${
            stream.category === "Professional"
              ? "bg-victory-lime text-black"
              : "bg-white/20 text-white"
          }`}>
            {stream.category}
          </span>
        )}
        {stream.weight_class && (
          <span className="text-xs bg-white/20 backdrop-blur-sm text-white px-2.5 py-1 rounded">
            {stream.weight_class}
          </span>
        )}
      </div>

      {/* Right-side action column */}
      <div className="absolute right-4 bottom-32 flex flex-col items-center gap-6 z-20">
        {/* Streamer avatar */}
        <button
          onClick={(e) => { e.stopPropagation(); navigate(`/stream/${stream.stream_id}`); }}
          className="relative"
        >
          {stream.user_avatar ? (
            <img
              src={stream.user_avatar}
              alt={name}
              className="w-12 h-12 rounded-full object-cover border-2 border-white shadow-lg"
              onError={(e) => { e.target.style.display = "none"; }}
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-victory-lime flex items-center justify-center text-black text-lg font-bold border-2 border-white shadow-lg">
              {initial}
            </div>
          )}
          {isLive && (
            <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 bg-victory-danger text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded">
              LIVE
            </span>
          )}
        </button>

        {/* Viewer count */}
        <div className="flex flex-col items-center gap-0.5">
          <Users className="w-7 h-7 text-white drop-shadow" />
          <span className="text-white text-xs font-semibold drop-shadow">{fmtViewers(stream.viewer_count)}</span>
        </div>

        {/* Mute toggle */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleMute(); }}
          className="flex flex-col items-center gap-0.5"
        >
          {muted
            ? <VolumeX className="w-7 h-7 text-white drop-shadow" />
            : <Volume2 className="w-7 h-7 text-white drop-shadow" />}
          <span className="text-white text-xs drop-shadow">{muted ? "Unmute" : "Mute"}</span>
        </button>

        {/* Go Live shortcut */}
        <button
          onClick={(e) => { e.stopPropagation(); navigate("/go-live"); }}
          className="flex flex-col items-center gap-0.5"
        >
          <div className="w-10 h-10 rounded-xl bg-victory-lime flex items-center justify-center shadow-lg">
            <Radio className="w-5 h-5 text-black" />
          </div>
          <span className="text-white text-xs drop-shadow">Go Live</span>
        </button>
      </div>

      {/* Bottom-left stream info */}
      <div className="absolute bottom-24 left-4 right-20 z-20 pointer-events-none">
        <p className="text-white font-bold text-base leading-tight drop-shadow-lg">{name}</p>
        {record && (
          <p className="text-white/80 text-sm font-mono mt-0.5 drop-shadow">{record}</p>
        )}
        <p className="text-white/80 text-sm mt-1.5 line-clamp-2 drop-shadow leading-snug">
          {stream.title || "Live Boxing Session"}
        </p>
      </div>
    </div>
  );
}

// ── Empty full-screen card ────────────────────────────────────────────────────
function EmptyCard({ onGoLive }) {
  return (
    <div className="h-screen w-full snap-start relative flex-shrink-0 bg-victory-bg flex flex-col items-center justify-center gap-6 text-center px-8">
      <div className="w-20 h-20 rounded-full bg-victory-lime/10 border border-victory-lime/30 flex items-center justify-center">
        <Tv className="w-10 h-10 text-victory-lime/60" />
      </div>
      <div className="space-y-2">
        <h2 className="text-victory-text font-heading font-extrabold text-2xl">Nobody's Live Yet</h2>
        <p className="text-victory-muted text-sm">Be the first in the gym today.</p>
      </div>
      <button onClick={onGoLive} className="victory-btn-primary px-10 py-3 font-bold text-base">
        <Radio className="w-4 h-4 inline mr-2" />
        Go Live Now
      </button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function LiveFeedPage() {
  const navigate = useNavigate();

  const [streams, setStreams]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [muted,   setMuted]     = useState(true);
  const [status,  setStatus]    = useState(null); // null | "live" | "recent"

  const fetch = useCallback(async () => {
    try {
      const params = {};
      if (status === "live")   params.status = "live";
      // Streams that stopped go "idle" (Livepeer webhook); "ended" is only the manual-stop case.
      if (status === "recent") params.status = "idle";
      const res = await axios.get(`${API}/streams`, { params });
      setStreams(res.data);
    } catch {}
    finally { setLoading(false); }
  }, [status]);

  useEffect(() => { setLoading(true); fetch(); }, [fetch]);
  useEffect(() => {
    const id = setInterval(fetch, 30_000);
    return () => clearInterval(id);
  }, [fetch]);

  const visible = useMemo(() => streams, [streams]);
  const liveCount = streams.filter((s) => s.status === "live").length;

  return (
    <div className="relative h-screen overflow-hidden bg-black">

      {/* Filter pills — fixed overlay at top */}
      <div className="fixed top-0 left-0 right-0 z-30 pt-safe-top">
        <div className="flex items-center gap-2 px-4 py-3 overflow-x-auto scrollbar-hide">
          {STATUS_PILLS.map((pill) => (
            <button
              key={pill.label}
              onClick={() => setStatus(pill.value)}
              className={`flex-shrink-0 text-sm font-semibold px-4 py-1.5 rounded-full transition-colors ${
                status === pill.value
                  ? "bg-white text-black"
                  : "text-white/80 hover:text-white"
              }`}
            >
              {pill.label}
            </button>
          ))}
          {liveCount > 0 && (
            <span className="flex-shrink-0 ml-auto flex items-center gap-1 text-victory-danger text-xs font-semibold">
              <span className="w-1.5 h-1.5 bg-victory-danger rounded-full animate-pulse" />
              {liveCount} live
            </span>
          )}
        </div>
      </div>

      {/* Snap-scroll feed */}
      {loading ? (
        <div className="h-screen flex items-center justify-center bg-black">
          <div className="w-10 h-10 border-2 border-victory-lime border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div
          className="h-screen overflow-y-scroll snap-y snap-mandatory"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {visible.length === 0 ? (
            <EmptyCard onGoLive={() => navigate("/go-live")} />
          ) : (
            visible.map((s) => (
              <StreamCard
                key={s.stream_id}
                stream={s}
                muted={muted}
                onToggleMute={() => setMuted((m) => !m)}
              />
            ))
          )}
          {/* Bottom padding so last card clears the nav */}
          <div className="h-20 w-full snap-start flex-shrink-0 bg-black" />
        </div>
      )}

      {/* Plus / Go Live FAB — matches TikTok centre */}
      <button
        onClick={() => navigate("/go-live")}
        aria-label="Go live"
        className="fixed bottom-24 left-1/2 -translate-x-1/2 z-30 w-12 h-12 bg-victory-lime rounded-2xl flex items-center justify-center shadow-lg shadow-victory-lime/30 pointer-events-auto"
      >
        <Plus className="w-6 h-6 text-black stroke-[3]" />
      </button>

      <BottomNav />
    </div>
  );
}
