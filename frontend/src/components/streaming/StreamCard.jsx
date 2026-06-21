import { useRef, useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Hls from "hls.js";
import { Radio, Users } from "lucide-react";

const HLS_BASE = "https://livepeercdn.studio/hls";

function buildRecord(stream) {
  if (stream.pro_wins > 0 || stream.pro_losses > 0) {
    const w = stream.pro_wins ?? 0;
    const l = stream.pro_losses ?? 0;
    const d = stream.pro_draws ?? 0;
    return d > 0 ? `${w}-${l}-${d}` : `${w}-${l}`;
  }
  if (stream.amateur_wins > 0 || stream.amateur_losses > 0) {
    return `${stream.amateur_wins ?? 0}-${stream.amateur_losses ?? 0}`;
  }
  return null;
}

export function StreamCard({ stream }) {
  const navigate  = useNavigate();
  const videoRef  = useRef(null);
  const hlsRef    = useRef(null);
  const timerRef  = useRef(null);
  const [previewing, setPreviewing] = useState(false);

  const isLive  = stream.status === "live";
  const record  = buildRecord(stream);
  const name    = stream.display_name || stream.user_name || "Fighter";
  const initial = name[0].toUpperCase();

  // ── HLS preview lifecycle ────────────────────────────────────────────────
  const startPreview = useCallback(() => {
    if (!isLive || !stream.playback_id || hlsRef.current) return;
    const video = videoRef.current;
    if (!video) return;

    const src = `${HLS_BASE}/${stream.playback_id}/index.m3u8`;

    if (Hls.isSupported()) {
      const hls = new Hls({ lowLatencyMode: true, startLevel: 1 });
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
        setPreviewing(true);
      });
      hlsRef.current = hls;
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      video.play().catch(() => {});
      setPreviewing(true);
    }
  }, [isLive, stream.playback_id]);

  const stopPreview = useCallback(() => {
    clearTimeout(timerRef.current);
    setPreviewing(false);
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    const video = videoRef.current;
    if (video) { video.pause(); video.removeAttribute("src"); video.load(); }
  }, []);

  const handleMouseEnter = useCallback(() => {
    timerRef.current = setTimeout(startPreview, 400);
  }, [startPreview]);

  const handleMouseLeave = useCallback(() => {
    clearTimeout(timerRef.current);
    stopPreview();
  }, [stopPreview]);

  useEffect(() => () => { clearTimeout(timerRef.current); if (hlsRef.current) hlsRef.current.destroy(); }, []);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <button
      onClick={() => navigate(`/stream/${stream.stream_id}`)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="victory-card overflow-hidden text-left w-full group transition-all hover:border-victory-lime/40 hover:shadow-lg hover:shadow-black/30"
    >
      {/* ── Thumbnail area ── */}
      <div className="w-full aspect-video bg-black relative overflow-hidden">

        {/* Static gradient background */}
        <div
          className={`absolute inset-0 bg-gradient-to-br from-[#1a1a2e] to-black transition-opacity duration-500 ${
            previewing ? "opacity-0" : "opacity-100"
          }`}
        />

        {/* Avatar (shown when not previewing) */}
        <div
          className={`absolute inset-0 flex items-center justify-center transition-opacity duration-300 ${
            previewing ? "opacity-0" : "opacity-100"
          }`}
        >
          {stream.user_avatar ? (
            <img
              src={stream.user_avatar}
              alt={name}
              className="w-16 h-16 rounded-full object-cover border-2 border-victory-border"
              onError={(e) => { e.target.style.display = "none"; }}
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-victory-lime/20 flex items-center justify-center text-victory-lime text-2xl font-bold border-2 border-victory-lime/20">
              {initial}
            </div>
          )}
        </div>

        {/* HLS video */}
        <video
          ref={videoRef}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${
            previewing ? "opacity-100" : "opacity-0"
          }`}
          muted
          playsInline
        />

        {/* Gradient scrim for badge legibility */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 pointer-events-none" />

        {/* LIVE badge */}
        {isLive && (
          <div className="absolute top-2 left-2 flex items-center gap-1 bg-red-500 text-white text-[10px] font-extrabold px-2 py-0.5 rounded shadow">
            <Radio className="w-2.5 h-2.5" />
            LIVE
          </div>
        )}

        {/* Weight class chip */}
        {stream.weight_class && (
          <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm text-white text-[10px] font-medium px-2 py-0.5 rounded">
            {stream.weight_class}
          </div>
        )}

        {/* Bottom overlays */}
        <div className="absolute bottom-2 left-2 right-2 flex items-end justify-between gap-2">
          {/* Viewer count */}
          {isLive && (
            <div className="flex items-center gap-1 bg-black/60 backdrop-blur-sm text-white text-[10px] px-2 py-0.5 rounded">
              <Users className="w-2.5 h-2.5" />
              {(stream.viewer_count ?? 0).toLocaleString()}
            </div>
          )}

          {/* Fighter record */}
          {record && (
            <div className="ml-auto bg-black/70 backdrop-blur-sm text-victory-lime text-[10px] font-mono font-bold px-2 py-0.5 rounded">
              {record}
            </div>
          )}
        </div>

        {/* Hover shimmer on desktop */}
        <div className="absolute inset-0 ring-inset ring-1 ring-transparent group-hover:ring-victory-lime/20 rounded transition-all pointer-events-none" />
      </div>

      {/* ── Card info ── */}
      <div className="p-3 flex items-start gap-3">
        {/* Small avatar for info row */}
        <div className="flex-shrink-0 w-8 h-8 rounded-full overflow-hidden bg-victory-lime/10 border border-victory-border flex items-center justify-center">
          {stream.user_avatar ? (
            <img src={stream.user_avatar} alt={name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-victory-lime text-xs font-bold">{initial}</span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-victory-text font-semibold text-sm truncate leading-tight">{stream.title}</p>
          <p className="text-victory-muted text-xs truncate mt-0.5">{name}</p>
        </div>

        {/* Category badge */}
        {stream.category && (
          <span
            className={`text-[10px] font-semibold px-2 py-0.5 rounded flex-shrink-0 mt-0.5 ${
              stream.category === "Professional"
                ? "bg-yellow-500/20 text-yellow-400"
                : "bg-blue-500/20 text-blue-400"
            }`}
          >
            {stream.category}
          </span>
        )}
      </div>
    </button>
  );
}
