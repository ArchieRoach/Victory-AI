import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { useAuth as useClerkHook } from "@clerk/clerk-react";
import { API, useAuth } from "@/App";
import { Radio, Users, AlertCircle, VideoOff, Scissors, Globe, Lock, BellRing } from "lucide-react";
import { toast } from "sonner";
import { BottomNav } from "@/components/BottomNav";
import { withMinDuration } from "@/utils/async";

async function waitForIce(pc, timeout = 4000) {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === "complete") return resolve();
    const check = () => {
      if (pc.iceGatheringState === "complete") {
        pc.removeEventListener("icegatheringstatechange", check);
        resolve();
      }
    };
    pc.addEventListener("icegatheringstatechange", check);
    setTimeout(resolve, timeout);
  });
}

export default function GoLivePage() {
  const { user } = useAuth();
  const { getToken } = useClerkHook();
  const navigate = useNavigate();

  const [phase, setPhase] = useState("idle"); // idle | starting | live | error
  const [errorMsg, setErrorMsg] = useState("");
  const [streamInfo, setStreamInfo] = useState(null);
  const [viewerCount, setViewerCount] = useState(0);
  const [endingStream, setEndingStream] = useState(false);
  const [highlightCount, setHighlightCount] = useState(0);
  const [squadCount,   setSquadCount]   = useState(null);
  const [audience,     setAudience]     = useState("public");
  const [notifySquad,  setNotifySquad]  = useState(true);

  const videoRef = useRef(null);
  const mediaRef = useRef(null);
  const pcRef = useRef(null);
  const pollRef = useRef(null);
  const highlightCountRef = useRef(0);
  const mountedRef = useRef(true);
  const startingRef = useRef(false);

  const cleanup = useCallback(() => {
    clearInterval(pollRef.current);
    if (mediaRef.current) {
      mediaRef.current.getTracks().forEach((t) => t.stop());
      mediaRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    startingRef.current = false;
  }, []);

  // Assign stream to video element once we're live
  useEffect(() => {
    if (phase === "live" && videoRef.current && mediaRef.current) {
      videoRef.current.srcObject = mediaRef.current;
    }
  }, [phase]);

  useEffect(() => {
    axios.get(`${API}/squads/mine`)
      .then((r) => setSquadCount((r.data || []).length))
      // Unknown ≠ none: a failed lookup must not lock the option; the server re-checks.
      .catch(() => setSquadCount(null));
  }, []);

  // Cleanup on unmount (navigating away while live or mid-setup)
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, [cleanup]);

  const handleGoLive = async () => {
    // Guard against double-taps launching two parallel setups (leaks streams/PCs).
    if (startingRef.current) return;
    startingRef.current = true;
    setPhase("starting");
    setErrorMsg("");

    // Step 1: Request camera + mic
    let localStream;
    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
    } catch (err) {
      const denied = err.name === "NotAllowedError" || err.name === "PermissionDeniedError";
      const notFound = err.name === "NotFoundError" || err.name === "DevicesNotFoundError";
      startingRef.current = false;
      if (!mountedRef.current) return;
      setErrorMsg(
        denied
          ? "Camera and microphone access is required. Tap the camera icon in your browser's address bar to allow access, then try again."
          : notFound
          ? "No camera found on this device."
          : `Camera error: ${err.message}`
      );
      setPhase("error");
      return;
    }

    // If the user navigated away during the permission prompt, don't leave the camera on.
    if (!mountedRef.current) {
      localStream.getTracks().forEach((t) => t.stop());
      return;
    }

    mediaRef.current = localStream;

    // Step 2: Create / reuse stream on backend
    let streamData;
    try {
      const res = await axios.post(`${API}/streams/go-live`, {
        audience,
        notify_squad: notifySquad && squadCount > 0,
      });
      streamData = res.data;
    } catch (err) {
      cleanup();
      const detail = err?.response?.data?.detail;
      if (detail && detail.toLowerCase().includes("squad")) {
        setErrorMsg(detail);
      } else if (detail && detail.toLowerCase().includes("not configured")) {
        setErrorMsg("Streaming is not configured on the server. Please contact support.");
      } else if (detail) {
        setErrorMsg("Stream setup failed. Please check your connection and try again.");
      } else {
        setErrorMsg("Failed to set up the stream. Check your connection and try again.");
      }
      setPhase("error");
      return;
    }

    // Step 3: WebRTC peer connection (send-only)
    let pc;
    try {
      pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        bundlePolicy: "max-bundle",
      });
      pcRef.current = pc;

      // Surface a dropped connection instead of showing "LIVE" over a dead stream.
      pc.onconnectionstatechange = () => {
        if (!mountedRef.current) return;
        if (["failed", "disconnected", "closed"].includes(pc.connectionState)) {
          cleanup();
          setErrorMsg("Your connection to the stream server dropped. Please go live again.");
          setPhase("error");
        }
      };

      for (const track of localStream.getTracks()) {
        pc.addTransceiver(track, { direction: "sendonly" });
      }

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForIce(pc);
    } catch (err) {
      cleanup();
      if (!mountedRef.current) return;
      setErrorMsg(`Could not initialise the broadcast: ${err.message}`);
      setPhase("error");
      return;
    }

    // Step 4: Proxy SDP through backend — stream key never touches the browser
    let answerSdp;
    try {
      const token = await getToken();
      const resp = await fetch(`${API}/streams/${streamData.stream_id}/whip`, {
        method: "POST",
        headers: {
          "Content-Type": "application/sdp",
          Authorization: `Bearer ${token}`,
        },
        body: pc.localDescription.sdp,
      });
      if (!resp.ok) {
        let detail = resp.statusText;
        try { const body = await resp.json(); detail = body.detail || detail; } catch {}
        throw new Error(detail || `${resp.status}`);
      }
      answerSdp = await resp.text();
    } catch (err) {
      cleanup();
      setErrorMsg(`Could not connect to stream server. ${err.message}`);
      setPhase("error");
      return;
    }

    try {
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
    } catch {
      cleanup();
      setErrorMsg("Stream negotiation failed — please try again.");
      setPhase("error");
      return;
    }

    if (!mountedRef.current) { cleanup(); return; }
    startingRef.current = false;
    setStreamInfo({
      stream_id: streamData.stream_id,
      playback_id: streamData.playback_id,
      title: streamData.title,
      audience: streamData.audience || "public",
    });
    setViewerCount(0);
    setHighlightCount(0);
    highlightCountRef.current = 0;
    setPhase("live");

    // Poll viewer count + new auto highlights every 15 s
    pollRef.current = setInterval(async () => {
      try {
        const res = await axios.get(`${API}/streams/${streamData.stream_id}`);
        setViewerCount(res.data.viewer_count ?? 0);
      } catch {}
      try {
        const res = await axios.get(`${API}/highlights/mine`, { params: { stream_id: streamData.stream_id } });
        const list = res.data.highlights || [];
        if (list.length > highlightCountRef.current) {
          const newest = list[0];
          toast.success(
            newest?.peak_reactions
              ? `Highlight clipped: ${newest.peak_reactions} reactions at once`
              : "Highlight clipped",
          );
        }
        highlightCountRef.current = list.length;
        setHighlightCount(list.length);
      } catch {}
    }, 15000);
  };

  const handleEndStream = async () => {
    if (endingStream) return; // ignore double-taps mid-request
    setEndingStream(true);
    const sid = streamInfo?.stream_id;
    cleanup();
    // Mark the stream ended server-side BEFORE leaving, so it doesn't linger as "live"
    // in the feeds. Best-effort retry, then navigate regardless.
    if (sid) {
      await withMinDuration((async () => {
        for (let i = 0; i < 2; i++) {
          try {
            await axios.patch(`${API}/streams/${sid}`, { status: "ended" });
            break;
          } catch {}
        }
      })());
    }
    navigate(sid && highlightCountRef.current > 0 ? `/highlights?stream=${sid}&open=best` : "/live");
  };

  // ── Live screen ──────────────────────────────────────────────────────────
  if (phase === "live") {
    return (
      <div className="min-h-screen bg-black flex flex-col">
        {/* Camera preview */}
        <div className="relative flex-1 overflow-hidden bg-black">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />

          {/* Overlays */}
          <div className="absolute top-safe-top top-4 left-4 right-4 flex items-center justify-between pointer-events-none">
            <span className="flex items-center gap-1.5">
              <span className="flex items-center gap-1.5 bg-victory-danger text-white text-xs font-bold px-3 py-1.5 rounded-full shadow">
                <Radio className="w-3 h-3" />
                LIVE
              </span>
              {streamInfo?.audience === "squad" && (
                <span className="flex items-center gap-1 bg-victory-bg/80 backdrop-blur-sm border border-victory-teal/40 text-victory-teal text-xs font-bold px-3 py-1.5 rounded-full">
                  <Lock className="w-3 h-3" /> SQUAD ONLY
                </span>
              )}
            </span>
            <span className="flex items-center gap-1.5 bg-black/60 backdrop-blur-sm text-white text-xs px-3 py-1.5 rounded-full">
              <Users className="w-3 h-3" />
              {/* key forces a remount on change so the pop-in actually replays —
                  this is the streamer's own real-time signal, it shouldn't update
                  silently (change blindness). */}
              <span key={viewerCount} className="animate-scale-in">{viewerCount}</span>
            </span>
          </div>
          {highlightCount > 0 && (
            <div className="absolute top-16 right-4 pointer-events-none">
              <span className="flex items-center gap-1.5 bg-victory-bg/80 backdrop-blur-sm border border-victory-lime/40 text-victory-lime text-xs font-bold px-3 py-1.5 rounded-full">
                <Scissors className="w-3 h-3" />
                <span key={highlightCount} className="font-mono animate-scale-in">{highlightCount}</span>
                {highlightCount === 1 ? "highlight" : "highlights"}
              </span>
            </div>
          )}
        </div>

        {/* Controls bar */}
        <div className="bg-black/90 px-6 py-5 flex flex-col gap-3">
          <p className="text-white/80 text-sm text-center font-medium">
            {streamInfo?.title || "You're Live"}
          </p>
          <button
            onClick={handleEndStream}
            disabled={endingStream}
            className="w-full py-4 rounded-2xl bg-victory-danger/20 border border-victory-danger/50 text-victory-danger font-bold text-base transition-colors active:bg-victory-danger/30 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {endingStream ? (
              <span className="w-5 h-5 border-2 border-victory-danger border-t-transparent rounded-full animate-spin" />
            ) : "End Stream"}
          </button>
        </div>
      </div>
    );
  }

  // ── Idle / starting / error screen ───────────────────────────────────────
  return (
    <div className="min-h-screen bg-victory-bg pb-nav flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        {phase === "starting" ? (
          <div className="flex flex-col items-center gap-5">
            <div className="w-16 h-16 border-4 border-victory-lime border-t-transparent rounded-full animate-spin" />
            <p className="text-victory-muted text-base">Setting up your stream…</p>
          </div>
        ) : phase === "error" ? (
          <div className="flex flex-col items-center gap-5 text-center max-w-xs">
            <div className="w-16 h-16 rounded-full bg-victory-danger/20 flex items-center justify-center">
              {errorMsg.toLowerCase().includes("camera") ? (
                <VideoOff className="w-7 h-7 text-victory-danger" />
              ) : (
                <AlertCircle className="w-7 h-7 text-victory-danger" />
              )}
            </div>
            <p className="text-victory-muted text-sm leading-relaxed">{errorMsg}</p>
            <button
              onClick={() => { setPhase("idle"); setErrorMsg(""); }}
              className="victory-btn-primary px-10"
            >
              Try Again
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-10 w-full max-w-xs">
            {/* Avatar */}
            <div className="flex flex-col items-center gap-3">
              {user?.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt={user?.name}
                  className="w-20 h-20 rounded-full object-cover border-2 border-victory-lime"
                  onError={(e) => { e.target.style.display = "none"; }}
                />
              ) : (
                <div className="w-20 h-20 rounded-full bg-victory-lime/20 flex items-center justify-center text-victory-lime text-3xl font-bold">
                  {(user?.name || "F")[0].toUpperCase()}
                </div>
              )}
              <p className="text-victory-muted text-sm">Ready to go live?</p>
            </div>

            {/* Audience: squad-only is the low-stakes first stream — friends, not strangers */}
            <div className="w-full space-y-3">
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Who can watch">
                {[
                  { value: "public", label: "Everyone", icon: Globe },
                  { value: "squad",  label: "Squad only", icon: Lock },
                ].map(({ value, label, icon: Icon }) => {
                  const needsSquad = value === "squad" && squadCount === 0;
                  const active = audience === value;
                  return (
                    <button
                      key={value}
                      role="radio"
                      aria-checked={active}
                      aria-disabled={needsSquad}
                      onClick={() => {
                        if (needsSquad) {
                          toast("Start a squad first", {
                            description: "Squad-only streams are just for your squad.",
                            action: { label: "Squads", onClick: () => navigate("/squads") },
                          });
                          return;
                        }
                        setAudience(value);
                      }}
                      className={`min-h-[48px] rounded-xl border flex items-center justify-center gap-2 font-heading font-bold text-sm transition-colors ${needsSquad ? "opacity-40" : ""} ${
                        active
                          ? "bg-victory-lime/15 border-victory-lime text-victory-lime"
                          : "bg-victory-card border-victory-border text-victory-muted"
                      }`}
                    >
                      <Icon className="w-4 h-4" /> {label}
                    </button>
                  );
                })}
              </div>

              {squadCount > 0 ? (
                <button
                  role="switch"
                  aria-checked={notifySquad}
                  onClick={() => setNotifySquad((v) => !v)}
                  className="w-full min-h-[48px] victory-card px-3 flex items-center gap-3 text-left"
                >
                  <BellRing className={`w-4 h-4 flex-shrink-0 ${notifySquad ? "text-victory-lime" : "text-victory-muted"}`} />
                  <span className="flex-1 text-victory-text text-sm">Ping my squad when I go live</span>
                  <span className={`w-10 h-6 rounded-full p-0.5 transition-colors ${notifySquad ? "bg-victory-lime" : "bg-victory-border"}`}>
                    <span className={`block w-5 h-5 rounded-full bg-victory-bg transition-transform ${notifySquad ? "translate-x-4" : ""}`} />
                  </span>
                </button>
              ) : squadCount === 0 ? (
                <button onClick={() => navigate("/squads")} className="w-full text-victory-muted text-xs text-center touch-target">
                  Start a squad so your friends get pinged when you go live, and your first highlight comes easy →
                </button>
              ) : null}
            </div>

            {/* Big Go Live button */}
            <button
              onClick={handleGoLive}
              className="w-full flex items-center justify-center gap-3 bg-victory-danger hover:bg-victory-danger/90 text-white font-bold text-xl rounded-2xl py-5 transition-colors active:scale-95 transition-transform shadow-lg shadow-victory-danger/30"
            >
              <Radio className="w-6 h-6" />
              Go Live
            </button>

            <p className="text-victory-muted text-xs text-center leading-relaxed">
              Your camera and microphone will be used to broadcast live.
            </p>
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
