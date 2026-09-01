import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API, useAuth } from "@/App";
import { BottomNav } from "@/components/BottomNav";
import { toast } from "sonner";
import {
  Pause, Play, SkipForward, Square, CheckCircle,
  Volume2, VolumeX, Lock, Radio, Zap, Video, VideoOff,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Progress } from "@/components/ui/progress";
import { withMinDuration } from "@/utils/async";

const BELL_SOUND_URL = "https://www.soundjay.com/sports/boxing-bell-1.mp3";

// Mid-round hype lines cycled during the Private AI Room session
// "validate" lines are generic encouragement, not claims about this user's specific
// technique right now — nothing is actually watching them mid-round, so nothing here
// should read as an observation (see the between-rounds feedback fix for the same rule).
// None of these reference a specific time remaining — the real countdown warning is
// handled separately by showTenSecWarning, driven by the actual timer.
const HYPE_LINES = [
  { type: "motivate", text: "Hands UP — you're dropping the right again!" },
  { type: "joke",     text: "You're sweating like you've seen my jab. Good." },
  { type: "tip",      text: "Breathe out on each punch — keeps your core tight." },
  { type: "validate", text: "Stay light on your feet — footwork wins rounds." },
  { type: "motivate", text: "Stay in your stance, don't lean forward." },
  { type: "joke",     text: "I've seen slower footwork… on my nan. You're improving though." },
  { type: "tip",      text: "Double up that jab — don't just poke, commit." },
  { type: "validate", text: "Trust your shots — don't rush them." },
  { type: "motivate", text: "Champions don't stop when it hurts — they stop when it's done." },
  { type: "tip",      text: "Turn your hip on the cross — get the full power transfer." },
  { type: "joke",     text: "You look tired. Good. That means you're working." },
  { type: "validate", text: "Keep that head moving — don't be a stationary target." },
  { type: "motivate", text: "Push the pace — make every second count." },
  { type: "tip",      text: "Return your hands to guard after every combination." },
  { type: "validate", text: "Stay balanced through your combinations." },
  { type: "joke",     text: "My circuits are overheating just watching you. Push harder." },
];

const HYPE_COLORS = {
  motivate: "text-victory-lime",
  joke:     "text-amber-400",
  tip:      "text-sky-400",
  validate: "text-violet-400",
};

const HYPE_EMOJI = {
  motivate: "🔥",
  joke:     "😅",
  tip:      "📋",
  validate: "✅",
};

export default function TrainPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useTranslation();

  // ── Config state ────────────────────────────────────────────────────────────
  const [isConfiguring, setIsConfiguring] = useState(true);
  const [roundDuration, setRoundDuration] = useState(180);
  const [restDuration,  setRestDuration]  = useState(60);
  const [totalRounds,   setTotalRounds]   = useState(3);
  const [sessionMode,   setSessionMode]   = useState("private"); // "private" | "public"
  const [voiceEnabled,  setVoiceEnabled]  = useState(true);
  const [recordVideo,   setRecordVideo]   = useState(false); // opt-in, off by default — privacy by default
  const [cameraReady,   setCameraReady]   = useState(false);
  const [cameraError,   setCameraError]   = useState(null);
  const [startingSession, setStartingSession] = useState(false);

  // ── Training state ───────────────────────────────────────────────────────────
  const [sessionId,         setSessionId]         = useState(null);
  const [currentRound,      setCurrentRound]      = useState(1);
  const [timeLeft,          setTimeLeft]           = useState(180);
  const [isResting,         setIsResting]          = useState(false);
  const [isPaused,          setIsPaused]           = useState(true);
  const [isComplete,        setIsComplete]         = useState(false);
  const [flashClass,        setFlashClass]         = useState("");
  const [showTenSecWarning, setShowTenSecWarning]  = useState(false);
  const [currentHype,       setCurrentHype]        = useState(null);
  const [hypeQueue,         setHypeQueue]          = useState([]);

  // ── AI Feedback state ────────────────────────────────────────────────────────
  const [feedback,        setFeedback]        = useState(null);
  const [loadingFeedback, setLoadingFeedback] = useState(false);
  const [feedbackProgress, setFeedbackProgress] = useState(0);

  const audioRef    = useRef(null);
  const intervalRef = useRef(null);
  const hypeTimerRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const videoPreviewRef = useRef(null);

  // Simulated progress while waiting on AI round feedback — caps at 90% so
  // it never looks "done" before the response actually lands.
  useEffect(() => {
    if (!loadingFeedback) { setFeedbackProgress(0); return; }
    const progressTimer = setInterval(() => {
      setFeedbackProgress((p) => (p >= 90 ? 90 : p + 6));
    }, 200);
    return () => clearInterval(progressTimer);
  }, [loadingFeedback]);

  useEffect(() => {
    const saved = localStorage.getItem("victory_train_config");
    if (saved) {
      const c = JSON.parse(saved);
      setRoundDuration(c.roundDuration || 180);
      setRestDuration(c.restDuration   || 60);
      setTotalRounds(c.totalRounds     || 3);
      setSessionMode(c.sessionMode     || "private");
    }
    audioRef.current = new Audio(BELL_SOUND_URL);
    audioRef.current.load();
    return () => {
      if (intervalRef.current)  clearInterval(intervalRef.current);
      if (hypeTimerRef.current) clearInterval(hypeTimerRef.current);
      // Release the camera if the user navigates away mid-session.
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  // Attach the live stream once the preview <video> actually exists — it only
  // mounts on the active-session screen, which appears after the stream is
  // already obtained on the configuring screen.
  useEffect(() => {
    if (videoPreviewRef.current && cameraStreamRef.current) {
      videoPreviewRef.current.srcObject = cameraStreamRef.current;
    }
  }, [cameraReady, isConfiguring]);

  const saveConfig = useCallback(() => {
    localStorage.setItem("victory_train_config", JSON.stringify({
      roundDuration, restDuration, totalRounds, sessionMode,
    }));
  }, [roundDuration, restDuration, totalRounds, sessionMode]);

  const playBell = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    }
  }, []);

  const flashScreen = useCallback((type) => {
    setFlashClass(type === "round" ? "flash-lime" : "flash-teal");
    setTimeout(() => setFlashClass(""), 300);
  }, []);

  // ── TTS voice ────────────────────────────────────────────────────────────────
  const playVoiceFeedback = async (text) => {
    try {
      const res = await axios.post(`${API}/tts/generate`, { text }, { withCredentials: true });
      const { audio_data, mime_type } = res.data;
      const audio = new Audio(`data:${mime_type};base64,${audio_data}`);
      audio.play().catch(() => {});
    } catch {}
  };

  // ── Camera / round video capture ────────────────────────────────────────────
  const requestCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(t("train.cameraUnsupported"));
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      cameraStreamRef.current = stream;
      setCameraReady(true);
      setCameraError(null);
      return true;
    } catch {
      setCameraError(t("train.cameraDenied"));
      return false;
    }
  };

  const stopCamera = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try { mediaRecorderRef.current.stop(); } catch {}
    }
    mediaRecorderRef.current = null;
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    setCameraReady(false);
  };

  const startRoundRecording = () => {
    const stream = cameraStreamRef.current;
    if (!stream) return;
    recordedChunksRef.current = [];
    const mimeType = ["video/webm;codecs=vp9", "video/webm"].find((t) => window.MediaRecorder?.isTypeSupported?.(t));
    try {
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
      recorder.start();
      mediaRecorderRef.current = recorder;
    } catch {
      mediaRecorderRef.current = null;
    }
  };

  // Resolves the just-finished round's recording as a Blob, or null if nothing was recording.
  const stopRoundRecording = () => new Promise((resolve) => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") { resolve(null); return; }
    recorder.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: recorder.mimeType || "video/webm" });
      recordedChunksRef.current = [];
      resolve(blob.size > 0 ? blob : null);
    };
    recorder.stop();
  });

  const uploadRoundVideo = async (blob) => {
    const sigRes = await axios.get(`${API}/cloudinary/signature?resource_type=video&folder=victory_rounds`);
    const { cloud_name, api_key, signature, timestamp, folder } = sigRes.data;
    if (!cloud_name || !api_key) throw new Error("Cloudinary not configured");
    const formData = new FormData();
    formData.append("file", blob, "round.webm");
    formData.append("api_key", api_key);
    formData.append("timestamp", timestamp);
    formData.append("signature", signature);
    formData.append("folder", folder);
    const uploadRes = await axios.post(
      `https://api.cloudinary.com/v1_1/${cloud_name}/video/upload`,
      formData,
      { headers: { "Content-Type": "multipart/form-data" } }
    );
    return { video_url: uploadRes.data.secure_url, public_id: uploadRes.data.public_id };
  };

  // ── AI Feedback ──────────────────────────────────────────────────────────────
  const generateFeedback = async (roundNum) => {
    setLoadingFeedback(true);

    // Video pipeline is best-effort — any failure here just means feedback falls
    // back to the non-video path, never blocks the round from ending.
    let videoAnalysis = null;
    if (recordVideo && sessionId && mediaRecorderRef.current) {
      try {
        const blob = await stopRoundRecording();
        if (blob) {
          const { video_url, public_id } = await uploadRoundVideo(blob);
          await axios.post(`${API}/videos/register`, {
            session_id: sessionId, round_number: roundNum, video_url, public_id,
          }, { withCredentials: true });
          const analysisRes = await axios.post(`${API}/ai/analyze-video`, {
            video_url, round_number: roundNum,
          }, { withCredentials: true });
          videoAnalysis = analysisRes.data.analysis;
        }
      } catch {
        // AI quota exceeded, upload failure, etc. — silently continue without video.
      }
    }

    try {
      const res = await axios.post(`${API}/ai/generate-feedback`, {
        round_number:  roundNum,
        total_rounds:  totalRounds,
        session_mode:  "conversational",
        ...(videoAnalysis ? { video_analysis: videoAnalysis } : {}),
      }, { withCredentials: true });
      setFeedback(res.data);
      if (voiceEnabled && res.data?.what_you_did_well) {
        // Recency effect: end on the affirming line, not the critique — that's
        // what's still in the fighter's head when the next round starts.
        playVoiceFeedback(`${res.data.what_to_tighten} ${res.data.what_you_did_well}`);
      }
    } catch {
      toast.error(t("train.feedbackFailed", "Couldn't generate feedback for this round."));
    }
    finally { setLoadingFeedback(false); }
  };

  // ── Hype message cycling (during rounds) ─────────────────────────────────────
  const startHypeCycle = useCallback(() => {
    // Clear any existing cycle first so intervals can't stack (pause/resume during rest).
    if (hypeTimerRef.current) clearInterval(hypeTimerRef.current);
    // Shuffle HYPE_LINES
    const shuffled = [...HYPE_LINES].sort(() => Math.random() - 0.5);
    setHypeQueue(shuffled);
    let idx = 0;
    setCurrentHype(shuffled[0]);
    hypeTimerRef.current = setInterval(() => {
      idx = (idx + 1) % shuffled.length;
      setCurrentHype(shuffled[idx]);
    }, 18_000); // new quip every 18s
  }, []);

  const stopHypeCycle = useCallback(() => {
    if (hypeTimerRef.current) { clearInterval(hypeTimerRef.current); hypeTimerRef.current = null; }
    setCurrentHype(null);
  }, []);

  // ── Start training ───────────────────────────────────────────────────────────
  const startTraining = async () => {
    saveConfig();

    if (sessionMode === "public") {
      navigate("/go-live");
      return;
    }

    setStartingSession(true);
    try {
      const res = await withMinDuration(axios.post(`${API}/training/start`, {
        round_duration: roundDuration,
        rest_duration:  restDuration,
        total_rounds:   totalRounds,
        record_video:   recordVideo,
      }, { withCredentials: true }));
      setSessionId(res.data.session_id);
    } catch {
      toast.error(t("train.startOffline", "Couldn't reach the server — this session won't be saved."));
    }

    if (recordVideo) {
      const granted = await requestCamera();
      if (granted) startRoundRecording();
    }

    setStartingSession(false);
    setIsConfiguring(false);
    setTimeLeft(roundDuration);
    setCurrentRound(1);
    setIsResting(false);
    setIsPaused(false);
    setIsComplete(false);
    setFeedback(null);
    playBell();
    flashScreen("round");
    startHypeCycle();
  };

  // ── Timer ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isPaused || isComplete || isConfiguring) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (!isResting && prev === 11) {
          setShowTenSecWarning(true);
          setTimeout(() => setShowTenSecWarning(false), 3500);
        }
        if (prev <= 1) {
          playBell();
          if (isResting) {
            if (currentRound < totalRounds) {
              flashScreen("round");
              setCurrentRound((r) => r + 1);
              setIsResting(false);
              setFeedback(null);
              startHypeCycle();
              if (recordVideo && cameraStreamRef.current) startRoundRecording();
              return roundDuration;
            } else {
              handleComplete();
              return 0;
            }
          } else {
            flashScreen("rest");
            stopHypeCycle();
            handleRoundEnd();
            if (currentRound < totalRounds) {
              setIsResting(true);
              return restDuration;
            } else {
              handleComplete();
              return 0;
            }
          }
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isPaused, isComplete, isConfiguring, isResting, currentRound, totalRounds, roundDuration, restDuration]);

  const handleRoundEnd = () => generateFeedback(currentRound);

  const handleComplete = async () => {
    setIsComplete(true);
    stopHypeCycle();
    stopCamera();
    if (sessionId) {
      try {
        const res = await axios.post(`${API}/training/${sessionId}/complete`, {}, { withCredentials: true });
        navigate("/score/results", { state: { session: res.data, fromTraining: true } });
        return;
      } catch {
        toast.error(t("train.failedSave"));
      }
    }
    // No session was saved (offline / failed start or complete) — don't strand the user on a
    // frozen 0:00 screen; return them home.
    navigate("/home");
  };

  const togglePause = () => {
    setIsPaused((p) => {
      if (p) startHypeCycle(); else stopHypeCycle();
      return !p;
    });
  };

  const skipToNext = () => {
    playBell();
    if (isResting) {
      if (currentRound < totalRounds) {
        flashScreen("round");
        setCurrentRound((r) => r + 1);
        setIsResting(false);
        setFeedback(null);
        setTimeLeft(roundDuration);
        startHypeCycle();
        if (recordVideo && cameraStreamRef.current) startRoundRecording();
      } else { handleComplete(); }
    } else {
      flashScreen("rest");
      stopHypeCycle();
      handleRoundEnd();
      if (currentRound < totalRounds) {
        setIsResting(true);
        setTimeLeft(restDuration);
      } else { handleComplete(); }
    }
  };

  const endTimer  = () => { setIsPaused(true); handleComplete(); };
  const resetTimer = () => {
    stopHypeCycle();
    stopCamera();
    setIsConfiguring(true);
    setIsPaused(true);
    setIsComplete(false);
    setCurrentRound(1);
    setIsResting(false);
    setTimeLeft(roundDuration);
    setFeedback(null);
    setSessionId(null);
  };

  const formatTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const getTotalWorkoutTime = () => {
    const s = totalRounds * roundDuration + (totalRounds - 1) * restDuration;
    return `${Math.floor(s / 60)} min`;
  };

  const partner = user?.training_partner;

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className={`min-h-screen bg-victory-bg pb-nav flex flex-col ${flashClass}`} data-testid="train-page">

      {isConfiguring ? (
        /* ── Config screen ──────────────────────────────────────────────────── */
        <div className="flex-1 flex flex-col justify-center p-6">
          <div className="text-center mb-8">
            <p className="text-victory-lime text-xs font-bold uppercase tracking-[0.2em] mb-2">Ready to work</p>
            <h1 className="text-3xl font-heading font-extrabold text-victory-text leading-tight">
              {t("train.title")}
            </h1>
            <p className="text-victory-muted text-sm mt-2">Set your session, then step into the ring.</p>
          </div>

          <div className="space-y-6 max-w-md mx-auto w-full">

            {/* Round duration */}
            <div>
              <div className="flex justify-between items-center mb-3">
                <label className="text-victory-muted text-sm font-medium">{t("train.roundDuration")}</label>
                <span className="font-mono text-xl font-semibold text-victory-lime">{formatTime(roundDuration)}</span>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x snap-mandatory" style={{ scrollbarWidth: "none" }}>
                {[60, 90, 120, 150, 180, 210, 240, 270, 300].map((val) => (
                  <button
                    key={val}
                    onClick={() => setRoundDuration(val)}
                    className={`snap-center flex-shrink-0 touch-target px-4 flex items-center justify-center rounded-full text-sm font-semibold border transition-all ${
                      roundDuration === val
                        ? "bg-victory-lime text-victory-bg border-victory-lime shadow-lg"
                        : "bg-victory-card text-victory-muted border-victory-border"
                    }`}
                  >
                    {formatTime(val)}
                  </button>
                ))}
              </div>
            </div>

            {/* Rest duration */}
            <div>
              <div className="flex justify-between items-center mb-3">
                <label className="text-victory-muted text-sm font-medium">{t("train.restDuration")}</label>
                <span className="font-mono text-xl font-semibold text-victory-teal">{formatTime(restDuration)}</span>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x snap-mandatory" style={{ scrollbarWidth: "none" }}>
                {[30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180].map((val) => (
                  <button
                    key={val}
                    onClick={() => setRestDuration(val)}
                    className={`snap-center flex-shrink-0 touch-target px-4 flex items-center justify-center rounded-full text-sm font-semibold border transition-all ${
                      restDuration === val
                        ? "bg-victory-teal text-victory-bg border-victory-teal shadow-lg"
                        : "bg-victory-card text-victory-muted border-victory-border"
                    }`}
                  >
                    {formatTime(val)}
                  </button>
                ))}
              </div>
            </div>

            {/* Rounds */}
            <div>
              <label className="text-victory-muted text-sm font-medium block mb-4">{t("train.numRounds")}</label>
              <div className="flex items-center justify-between gap-4">
                <button
                  onClick={() => setTotalRounds((r) => Math.max(1, r - 1))}
                  disabled={totalRounds <= 1}
                  className="w-14 h-14 rounded-2xl bg-victory-card border border-victory-border flex items-center justify-center text-2xl text-victory-text touch-target disabled:opacity-30 transition-all active:scale-95"
                >−</button>
                <div className="flex-1 flex flex-col items-center gap-3">
                  <span className="font-mono text-5xl font-extrabold text-victory-text leading-none">{totalRounds}</span>
                  <div className="flex gap-1.5">
                    {Array.from({ length: 12 }).map((_, i) => (
                      <div
                        key={i}
                        className={`h-1.5 rounded-full transition-all duration-150 ${
                          i < totalRounds ? "bg-victory-lime w-3" : "bg-victory-border w-1.5"
                        }`}
                      />
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => setTotalRounds((r) => Math.min(12, r + 1))}
                  disabled={totalRounds >= 12}
                  className="w-14 h-14 rounded-2xl bg-victory-card border border-victory-border flex items-center justify-center text-2xl text-victory-text touch-target disabled:opacity-30 transition-all active:scale-95"
                >+</button>
              </div>
            </div>

            {/* ── Mode toggle — replaces Record & Analyse ────────────────────── */}
            <div>
              <p className="text-victory-muted text-sm font-semibold uppercase tracking-wider mb-3">Session Mode</p>
              <div className="grid grid-cols-2 gap-3">

                {/* Private AI Room */}
                <button
                  onClick={() => setSessionMode("private")}
                  className={`relative flex flex-col items-start gap-2 p-4 rounded-2xl border-2 text-left transition-all ${
                    sessionMode === "private"
                      ? "border-victory-lime bg-victory-lime/10 ring-1 ring-victory-lime/30"
                      : "border-victory-border bg-victory-card hover:border-victory-lime/30"
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    sessionMode === "private" ? "bg-victory-lime" : "bg-victory-border/50"
                  }`}>
                    <Lock className={`w-5 h-5 ${sessionMode === "private" ? "text-black" : "text-victory-muted"}`} />
                  </div>
                  <div>
                    <p className={`font-bold text-sm leading-tight ${sessionMode === "private" ? "text-victory-text" : "text-victory-text/70"}`}>
                      Private AI Room
                    </p>
                    <p className="text-victory-muted text-[11px] mt-0.5 leading-snug">
                      Train with your AI partner — focused &amp; private
                    </p>
                  </div>
                  {sessionMode === "private" && (
                    <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-victory-lime" />
                  )}
                </button>

                {/* Public Livestream */}
                <button
                  onClick={() => setSessionMode("public")}
                  className={`relative flex flex-col items-start gap-2 p-4 rounded-2xl border-2 text-left transition-all ${
                    sessionMode === "public"
                      ? "border-red-500 bg-red-500/10 ring-1 ring-red-500/30"
                      : "border-victory-border bg-victory-card hover:border-red-500/30"
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    sessionMode === "public" ? "bg-red-500" : "bg-victory-border/50"
                  }`}>
                    <Radio className={`w-5 h-5 ${sessionMode === "public" ? "text-white" : "text-victory-muted"}`} />
                  </div>
                  <div>
                    <p className={`font-bold text-sm leading-tight ${sessionMode === "public" ? "text-victory-text" : "text-victory-text/70"}`}>
                      Public Livestream
                    </p>
                    <p className="text-victory-muted text-[11px] mt-0.5 leading-snug">
                      Go live — let the community watch
                    </p>
                  </div>
                  {sessionMode === "public" && (
                    <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  )}
                </button>
              </div>

              {/* Mode description */}
              {sessionMode === "public" && (
                <p className="mt-3 text-sm text-red-400/80 text-center">
                  Tapping Start will open the Go Live screen.
                </p>
              )}
              {sessionMode === "private" && (
                <p className="mt-3 text-sm text-victory-lime/70 text-center">
                  Your AI partner will motivate, coach, and banter with you between rounds.
                </p>
              )}
            </div>

            {/* Voice toggle (private mode only) */}
            {sessionMode === "private" && (
              <div className="victory-card p-4">
                <button onClick={() => setVoiceEnabled(!voiceEnabled)} className="w-full flex items-center justify-between touch-target">
                  <div className="flex items-center gap-3">
                    {voiceEnabled ? <Volume2 className="w-6 h-6 text-victory-lime" /> : <VolumeX className="w-6 h-6 text-victory-muted" />}
                    <div className="text-left">
                      <p className="text-victory-text font-medium">{t("train.voiceFeedback")}</p>
                      <p className="text-victory-muted text-sm">{t("train.voiceDesc")}</p>
                    </div>
                  </div>
                  <div className={`w-12 h-6 rounded-full transition-colors ${voiceEnabled ? "bg-victory-lime" : "bg-victory-border"}`}>
                    <div className={`w-5 h-5 rounded-full bg-white mt-0.5 transition-transform ${voiceEnabled ? "translate-x-6" : "translate-x-0.5"}`} />
                  </div>
                </button>
              </div>
            )}

            {/* Video recording toggle — opt-in, off by default. Enabling it is what
                makes AI feedback based on your real technique instead of banter. */}
            {sessionMode === "private" && (
              <div className="victory-card p-4">
                <button onClick={() => setRecordVideo(!recordVideo)} className="w-full flex items-center justify-between touch-target">
                  <div className="flex items-center gap-3">
                    {recordVideo ? <Video className="w-6 h-6 text-victory-lime" /> : <VideoOff className="w-6 h-6 text-victory-muted" />}
                    <div className="text-left">
                      <p className="text-victory-text font-medium">{t("train.recordVideo")}</p>
                      <p className="text-victory-muted text-sm">{t("train.recordVideoDesc")}</p>
                    </div>
                  </div>
                  <div className={`w-12 h-6 rounded-full transition-colors ${recordVideo ? "bg-victory-lime" : "bg-victory-border"}`}>
                    <div className={`w-5 h-5 rounded-full bg-white mt-0.5 transition-transform ${recordVideo ? "translate-x-6" : "translate-x-0.5"}`} />
                  </div>
                </button>
                {cameraError && (
                  <p className="text-victory-danger text-xs mt-2">{cameraError}</p>
                )}
              </div>
            )}

            <div className="flex items-center justify-center gap-2 text-sm">
              <span className="text-victory-muted">{t("train.total")}</span>
              <span className="text-victory-lime font-bold font-mono">{getTotalWorkoutTime()}</span>
            </div>

            <button onClick={startTraining} disabled={startingSession} className="victory-btn-primary font-heading text-base tracking-wide disabled:opacity-60 flex items-center justify-center gap-2" data-testid="start-training-btn">
              {startingSession ? (
                <span className="w-5 h-5 border-2 border-victory-bg border-t-transparent rounded-full animate-spin" />
              ) : (
                sessionMode === "public" ? "🔴 Go Live" : `🥊 ${t("train.startBtn")}`
              )}
            </button>
          </div>
        </div>

      ) : (
        /* ── Active session screen ────────────────────────────────────────────── */
        <div className="flex-1 flex flex-col">

          {/* Phase progress bar — full width, shrinks as time runs down */}
          <div className="h-1 w-full bg-victory-border">
            <div
              className={`h-full rounded-r-full transition-[width] duration-1000 ease-linear ${isResting ? "bg-victory-teal" : "bg-victory-lime"}`}
              style={{ width: `${(timeLeft / (isResting ? restDuration : roundDuration)) * 100}%` }}
            />
          </div>

          <div className="flex-1 flex flex-col items-center justify-center p-6">

            {/* Live camera preview — only when the fighter opted in on the config
                screen. Mirrored like a gym mirror; visibly on so recording is never
                a surprise. */}
            {recordVideo && cameraReady && (
              <div className="relative w-full max-w-sm aspect-video rounded-xl overflow-hidden bg-black mb-4">
                <video
                  ref={videoPreviewRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                  style={{ transform: "scaleX(-1)" }}
                />
                {!isResting && (
                  <span className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-1 rounded-full">
                    <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                    {t("train.recording")}
                  </span>
                )}
              </div>
            )}

            {/* Round dots */}
            <div className="flex items-center gap-2 mb-6">
              {Array.from({ length: totalRounds }).map((_, i) => {
                const isDone = i < currentRound - 1;
                const isCurrent = i === currentRound - 1;
                return (
                  <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${
                    isCurrent
                      ? `w-5 ${isResting ? "bg-victory-teal" : "bg-victory-lime"}`
                      : isDone
                      ? "w-2 bg-victory-lime/40"
                      : "w-2 bg-victory-border"
                  }`} />
                );
              })}
              <span className="text-victory-muted text-xs ml-2 font-mono">
                {currentRound}/{totalRounds}
              </span>
            </div>

            {/* Phase label */}
            <p className={`text-sm uppercase tracking-[0.2em] mb-3 font-bold ${isResting ? "text-victory-teal" : "text-victory-lime"}`}>
              {isResting ? t("train.restLabel") : t("train.roundLabel")}
            </p>

            {/* Timer */}
            <div className={`timer-display mb-2 transition-colors ${isResting ? "text-victory-teal" : "text-victory-text"}`} data-testid="timer-display">
              {formatTime(timeLeft)}
            </div>

            {/* Goal gradient effect: proximity to the finish should read as more
                urgent/motivating the closer the fighter actually is to it. */}
            <p className={`text-sm mb-6 ${!isResting && currentRound === totalRounds ? "text-victory-lime font-bold" : "text-victory-muted"}`}>
              {!isResting && currentRound === totalRounds
                ? t("train.finalRound")
                : t("train.roundOf", { current: currentRound, total: totalRounds })}
            </p>

            {/* ── Mid-round hype bubble (private mode, not resting) ──────────── */}
            {!isResting && currentHype && !isPaused && (
              <div className="w-full max-w-sm mb-4">
                <div className="bg-victory-card border border-victory-border rounded-2xl p-4 flex items-start gap-3">
                  {/* Partner avatar */}
                  {partner?.avatar_url ? (
                    <img src={partner.avatar_url} alt={partner.name}
                      className="w-9 h-9 rounded-full object-cover border border-victory-lime flex-shrink-0"
                      onError={(e) => { e.target.style.display = "none"; }} />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-victory-lime flex items-center justify-center text-victory-bg font-bold text-sm flex-shrink-0">
                      {partner?.name?.[0] || "C"}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-victory-muted text-[11px] font-semibold mb-1">
                      {partner?.name || "Coach"} · <span className={`${HYPE_COLORS[currentHype.type] || "text-victory-lime"}`}>
                        {currentHype.type}
                      </span>
                    </p>
                    <p className="text-victory-text text-sm leading-snug">
                      <span className="mr-1">{HYPE_EMOJI[currentHype.type]}</span>
                      {currentHype.text}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* 10-second warning */}
            {showTenSecWarning && (
              <div className="victory-card px-4 py-2 mb-4 animate-pulse">
                <p className="text-victory-lime text-sm font-semibold">
                  💥 {partner?.name || "Coach"}: Last 10 — finish strong!
                </p>
              </div>
            )}

            {/* ── Rest period: AI feedback card ──────────────────────────────── */}
            {isResting && (
              <div className="w-full max-w-md">
                <div className="victory-card p-4">
                  {/* Partner header */}
                  <div className="flex items-center gap-3 mb-4">
                    {partner?.avatar_url ? (
                      <img src={partner.avatar_url} alt={partner.name}
                        className="w-10 h-10 rounded-full object-cover border border-victory-lime"
                        onError={(e) => { e.target.style.display = "none"; }} />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-victory-lime flex items-center justify-center text-victory-bg font-bold">
                        {partner?.name?.[0] || "C"}
                      </div>
                    )}
                    <div className="flex-1">
                      <p className="text-victory-lime font-semibold text-sm">
                        {partner?.name || t("common.champ")} {t("train.says")}
                      </p>
                      <p className="text-victory-muted text-xs">Round {currentRound} debrief</p>
                    </div>
                    <button onClick={() => setVoiceEnabled((v) => !v)}
                      aria-label={voiceEnabled ? "Disable voice" : "Enable voice"}
                      className="w-11 h-11 flex items-center justify-center text-victory-muted hover:text-victory-text">
                      {voiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                    </button>
                  </div>

                  {loadingFeedback ? (
                    <div className="py-3 space-y-3">
                      <div className="relative aspect-video rounded-xl overflow-hidden bg-black">
                        <img
                          src="/images/ring-card-girl.jpg"
                          alt="Ring card girl"
                          className="absolute inset-0 w-full h-full object-cover animate-sway"
                          style={{ transformOrigin: "50% 92%" }}
                        />
                      </div>
                      <p className="text-victory-muted text-sm text-center">
                        {t(`train.ringCardGirl.line${(currentRound - 1) % 6}`, { round: currentRound + 1 })}
                      </p>
                      <Progress value={feedbackProgress} className="h-1.5" />
                      {/* Operational transparency: names what's actually happening (your
                          configured coach forming notes on this round) rather than fake
                          "analyzing footwork..." stage theater — nothing here is literal
                          computer-vision analysis of your live video. */}
                      <p className="text-victory-muted text-xs text-center">
                        {t("train.reviewingRound", { partner: partner?.name || t("train.yourCoach"), round: currentRound })}
                      </p>
                    </div>
                  ) : feedback ? (
                    // Peak-end / recency: critique and homework first, affirmation last —
                    // that's the line still fresh in the fighter's head at the bell.
                    <div className="space-y-3">
                      <div className="flex items-start gap-2">
                        <Zap className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                        <p className="text-victory-text text-sm">{feedback.what_to_tighten}</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-sky-400 mt-0.5 flex-shrink-0 text-sm">📋</span>
                        <p className="text-victory-text text-sm">{feedback.drill_focus}</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-victory-lime mt-0.5 flex-shrink-0" />
                        <p className="text-victory-text text-sm">{feedback.what_you_did_well}</p>
                      </div>
                      {feedback.accountability_check && (
                        <div className="mt-3 pt-3 border-t border-victory-border">
                          <p className="text-victory-muted text-xs italic">"{feedback.accountability_check}"</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-victory-muted text-sm text-center">{t("train.preparingFeedback")}</p>
                  )}
                </div>
              </div>
            )}

            {/* Controls */}
            <div className="flex items-center justify-center gap-5 mt-6">
              {/* Skip — secondary */}
              <button
                onClick={skipToNext}
                className="w-14 h-14 rounded-full bg-victory-card border border-victory-border flex items-center justify-center text-victory-muted hover:text-victory-text touch-target transition-all active:scale-90"
                aria-label="Skip"
              >
                <SkipForward className="w-6 h-6" />
              </button>

              {/* Play/Pause — primary dominant CTA */}
              <button
                onClick={togglePause}
                className={`w-20 h-20 rounded-full flex items-center justify-center touch-target transition-all active:scale-90 shadow-xl ${
                  isPaused
                    ? "bg-victory-lime text-victory-bg shadow-victory-lime/25 hover:bg-[#D4E630]"
                    : "bg-victory-card border-2 border-victory-lime text-victory-lime hover:bg-victory-lime/10"
                }`}
                aria-label={isPaused ? "Resume" : "Pause"}
              >
                {isPaused ? <Play className="w-9 h-9 ml-1" /> : <Pause className="w-9 h-9" />}
              </button>

              {/* End session — danger */}
              <button
                onClick={endTimer}
                className="w-14 h-14 rounded-full bg-victory-card border border-red-500/40 flex items-center justify-center text-red-400 hover:bg-red-500/10 touch-target transition-all active:scale-90"
                aria-label="End session"
              >
                <Square className="w-6 h-6" />
              </button>
            </div>

            {/* Reset */}
            <button onClick={resetTimer} className="mt-6 touch-target flex items-center justify-center text-victory-muted text-xs hover:text-victory-text transition-colors tracking-wide">
              ← Back to setup
            </button>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
