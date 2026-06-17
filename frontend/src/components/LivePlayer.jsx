import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { Wifi, WifiOff } from "lucide-react";

export default function LivePlayer({ playbackId, autoPlay = true, className = "" }) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const src = playbackId
    ? `https://livepeercdn.studio/hls/${playbackId}/index.m3u8`
    : null;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        lowLatencyMode: true,
        backBufferLength: 30,
        maxBufferLength: 60,
      });
      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setLoading(false);
        if (autoPlay) video.play().catch(() => {});
      });
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          setLoading(false);
          setError("Stream unavailable — it may not be live yet.");
        }
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // Safari native HLS
      video.src = src;
      video.addEventListener("canplay", () => setLoading(false), { once: true });
      video.addEventListener("error", () => {
        setLoading(false);
        setError("Stream unavailable.");
      }, { once: true });
      if (autoPlay) video.play().catch(() => {});
    } else {
      setLoading(false);
      setError("HLS playback not supported in this browser.");
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [src, autoPlay]);

  if (!playbackId) {
    return (
      <div className={`w-full aspect-video bg-black flex flex-col items-center justify-center gap-2 ${className}`}>
        <WifiOff className="w-8 h-8 text-victory-muted" />
        <p className="text-victory-muted text-sm">Stream not started</p>
      </div>
    );
  }

  return (
    <div className={`relative w-full aspect-video bg-black ${className}`}>
      <video
        ref={videoRef}
        playsInline
        controls
        muted={autoPlay}
        className="w-full h-full object-contain"
      />

      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 gap-3">
          <Wifi className="w-8 h-8 text-victory-lime animate-pulse" />
          <p className="text-victory-muted text-sm">Connecting to stream...</p>
        </div>
      )}

      {error && !loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 gap-2 p-4 text-center">
          <WifiOff className="w-8 h-8 text-victory-muted" />
          <p className="text-victory-muted text-sm">{error}</p>
        </div>
      )}
    </div>
  );
}
