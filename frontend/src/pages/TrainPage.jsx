import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API, useAuth } from "@/App";
import { BottomNav } from "@/components/BottomNav";
import { toast } from "sonner";
import {
  Pause, Play, SkipForward, Square, CheckCircle,
  Volume2, VolumeX, Lock, Radio, Zap,
} from "lucide-react";
import { useTranslation } from "react-i18next";

const BELL_SOUND_URL = "https://www.soundjay.com/sports/boxing-bell-1.mp3";

// Mid-round hype lines cycled during the Private AI Room session
const HYPE_LINES = [
  { type: "motivate", text: "Hands UP — you're dropping the right again!" },
  { type: "joke",     text: "You're sweating like you've seen my jab. Good." },
  { type: "tip",      text: "Breathe out on each punch — keeps your core tight." },
  { type: "validate", text: "That footwork right there? That's the move. Keep it." },
  { type: "motivate", text: "Stay in your stance, don't lean forward." },
  { type: "joke",     text: "I've seen slower footwork… on my nan. You're improving though." },
  { type: "tip",      text: "Double up that jab — don't just poke, commit." },
  { type: "validate", text: "Your timing is way better than last session. Trust it." },
  { type: "motivate", text: "Champions don't stop when it hurts — they stop when it's done." },
  { type: "tip",      text: "Turn your hip on the cross — get the full power transfer." },
  { type: "joke",     text: "You look tired. Good. That means you're working." },
  { type: "validate", text: "That head movement was clean. Keep slipping left." },
  { type: "motivate", text: "10 seconds — leave EVERYTHING in this round." },
  { type: "tip",      text: "Return your hands to guard after every combination." },
  { type: "validate", text: "Balance is looking solid. You've been working on that." },
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

  const audioRef    = useRef(null);
  const intervalRef = useRef(null);
  const hypeTimerRef = useRef(null);

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
    };
  }, []);

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

  // ── AI Feedback ──────────────────────────────────────────────────────────────
  const generateFeedback = async (roundNum) => {
    setLoadingFeedback(true);
    try {
      const res = await axios.post(`${API}/ai/generate-feedback`, {
        round_number:  roundNum,
        total_rounds:  totalRounds,
        session_mode:  "conversational",
      }, { withCredentials: true });
      setFeedback(res.data);
      if (voiceEnabled && res.data?.what_you_did_well) {
        playVoiceFeedback(`${res.data.what_you_did_well} ${res.data.what_to_tighten}`);
      }
    } catch {}
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

    try {
      const res = await axios.post(`${API}/training/start`, {
        round_duration: roundDuration,
        rest_duration:  restDuration,
        total_rounds:   totalRounds,
        record_video:   false,
      }, { withCredentials: true });
      setSessionId(res.data.session_id);
    } catch {
      toast.error(t("train.startOffline", "Couldn't reach the server — this session won't be saved."));
    }

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
          <h1 className="text-2xl font-heading font-extrabold text-victory-text text-center mb-8">
            {t("train.title")}
          </h1>

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
                    className={`snap-center flex-shrink-0 px-4 py-2.5 rounded-full text-sm font-semibold border transition-all ${
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
                    className={`snap-center flex-shrink-0 px-4 py-2.5 rounded-full text-sm font-semibold border transition-all ${
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

            <p className="text-center text-victory-muted">
              {t("train.total")} <span className="text-victory-text">{getTotalWorkoutTime()}</span>
            </p>

            <button onClick={startTraining} className="victory-btn-primary" data-testid="start-training-btn">
              {sessionMode === "public" ? "Go Live" : t("train.startBtn")}
            </button>
          </div>
        </div>

      ) : (
        /* ── Active session screen ────────────────────────────────────────────── */
        <div className="flex-1 flex flex-col">
          <div className="flex-1 flex flex-col items-center justify-center p-6">

            {/* Phase label */}
            <p className={`text-lg uppercase tracking-widest mb-4 font-semibold ${isResting ? "text-victory-teal" : "text-victory-lime"}`}>
              {isResting ? t("train.restLabel") : t("train.roundLabel")}
            </p>

            {/* Timer */}
            <div className="timer-display text-victory-text mb-4" data-testid="timer-display">
              {formatTime(timeLeft)}
            </div>

            <p className="text-victory-muted text-lg mb-6">
              {t("train.roundOf", { current: currentRound, total: totalRounds })}
            </p>

            {/* ── Mid-round hype bubble (private mode, not resting) ──────────── */}
            {!isResting && currentHype && !isPaused && (
              <div className="w-full max-w-sm mb-4">
                <div className="bg-victory-card border border-victory-border rounded-2xl p-4 flex items-start gap-3">
                  {/* Partner avatar */}
                  {partner?.avatar_url ? (
                    <img src={partner.avatar_url} alt={partner.name}
                      className="w-9 h-9 rounded-full object-cover border border-victory-lime flex-shrink-0" />
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
                        className="w-10 h-10 rounded-full object-cover border border-victory-lime" />
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
                      className="w-8 h-8 flex items-center justify-center text-victory-muted hover:text-victory-text">
                      {voiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                    </button>
                  </div>

                  {loadingFeedback ? (
                    <div className="flex items-center justify-center py-4 gap-2">
                      <div className="w-6 h-6 border-2 border-victory-lime border-t-transparent rounded-full animate-spin" />
                      <span className="text-victory-muted text-sm">{t("train.generatingFeedback")}</span>
                    </div>
                  ) : feedback ? (
                    <div className="space-y-3">
                      <div className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-victory-lime mt-0.5 flex-shrink-0" />
                        <p className="text-victory-text text-sm">{feedback.what_you_did_well}</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <Zap className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                        <p className="text-victory-text text-sm">{feedback.what_to_tighten}</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-sky-400 mt-0.5 flex-shrink-0 text-sm">📋</span>
                        <p className="text-victory-text text-sm">{feedback.drill_focus}</p>
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
            <div className="flex items-center gap-4 mt-8">
              <button onClick={togglePause}
                className="w-16 h-16 rounded-full bg-victory-card border border-victory-border flex items-center justify-center text-victory-text touch-target transition-transform active:scale-95">
                {isPaused ? <Play className="w-8 h-8" /> : <Pause className="w-8 h-8" />}
              </button>
              <button onClick={skipToNext}
                className="w-16 h-16 rounded-full bg-victory-card border border-victory-border flex items-center justify-center text-victory-text touch-target transition-transform active:scale-95">
                <SkipForward className="w-8 h-8" />
              </button>
              <button onClick={endTimer}
                className="w-16 h-16 rounded-full bg-victory-card border border-victory-danger flex items-center justify-center text-victory-danger touch-target transition-transform active:scale-95">
                <Square className="w-8 h-8" />
              </button>
            </div>

            {/* Reset */}
            <button onClick={resetTimer} className="mt-6 text-victory-muted text-sm hover:text-victory-text transition-colors">
              ← Back to setup
            </button>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
