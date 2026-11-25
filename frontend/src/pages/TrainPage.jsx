import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { API, useAuth } from "@/App";
import { BottomNav } from "@/components/BottomNav";
import { toast } from "sonner";
import {
  Pause, Play, SkipForward, Square, CheckCircle,
  Volume2, VolumeX, Lock, Radio, Zap, Video, VideoOff, Target, ScanEye, Skull, Music, Megaphone, Swords, Hash, SwitchCamera,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Progress } from "@/components/ui/progress";
import { withMinDuration } from "@/utils/async";
import { currentEntry } from "@/lib/entrySource";
import { getVideoPref, setVideoPref } from "@/lib/videoPref";
import { analytics } from "@/lib/analytics";
import { FirstUseTip } from "@/components/FirstUseTip";
import { CoachMark } from "@/components/CoachMark";
import { useLiveCoach, preloadLiveCoach, CUES as COACH_CUES } from "@/hooks/useLiveCoach";
import { ghostCount } from "@/lib/liveCoach";
import { LiveCoachOverlay, LiveRoundSummary } from "@/components/LiveCoachPanel";
import { nativeRound } from "@/lib/nativeBridge";
import { createComboCaller, sayCombo, saveLevel, startingLevel, levelRange, comboWords, comboSpeech, callsNumbers, setCallsNumbers, callPace, setCallPace, CALL_PACES, CALL_LEVELS } from "@/lib/comboCaller";
import { unlockSpeech, setVoiceSource, primeVoice, sayNatural, say, hasClip, waitForVoice, onVoiceProblem } from "@/lib/speech";
import { ToggleRow } from "@/components/ToggleRow";
import { TimerCard } from "@/components/home/TimerCard";
import { withCue } from "@/lib/verbalCues";
import { useUnlocks, isUnlocked } from "@/lib/unlocks";
import { tx } from "@/i18n/tx";
import { CornerOrb } from "@/components/CornerOrb";

const LIVE_COACH_KEY = "victory_live_coach";
// On unless the fighter switched it off: it runs on the phone and uploads nothing, so it's
// safe as a default, and it means every session ends with something to show for it.
const readLiveCoach = () => { try { return localStorage.getItem(LIVE_COACH_KEY) !== "0"; } catch { return true; } };
// Two-minute rounds (the junior amateur standard) make a first session easy to finish.
const DEFAULT_ROUND_SECONDS = 120;
// One round and Boss Rounds are always three minutes, so a boss target means the same for everyone.
const FIXED_ROUND_SECONDS = 180;
// Long enough for a typical upload and score; a slow network still reaches the results.
const FINISH_WAIT_MS = 75_000;
const ROUND_VIDEO_BITRATE = 1_800_000;
// 720p at up to 30 fps: plenty for scoring, and light enough that the phone can film, show the
// preview and run the punch counter at once without the picture freezing.
const cameraConstraints = (facingMode) => ({ facingMode, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } });
// Video scoring runs as a background job; check back every 2s for up to 90s, then carry on
// without it (the score still lands on the round when the job finishes).
const waitForJob = async (jobId, { everyMs = 2000, maxMs = 90_000 } = {}) => {
  const until = Date.now() + maxMs;
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, everyMs));
    const { data } = await axios.get(`${API}/ai/jobs/${jobId}`);
    if (data.status === "done") return data.result;
  }
  return null;
};
const CALLS_KEY = "victory_combo_calls";
const readCalls = () => { try { return localStorage.getItem(CALLS_KEY) !== "0"; } catch { return true; } };

// Round types. Freestyle is Easy Fun (no score, positive cues only); Boss is Hard Fun (one
// tough round a week). Reasoning and rules: backend/gamification.py.
const KINDS = [
  { key: "standard", get label() { return tx("ui.trainPage.normal", "Normal"); }, icon: Target, get desc() { return tx("ui.trainPage.scoredWhenVideoIs", "Scored when video is on"); } },
  { key: "freestyle", get label() { return tx("ui.trainPage.freestyle", "Freestyle"); }, icon: Music, get desc() { return tx("ui.trainPage.noScoreJustPlay", "No score. Just play."); } },
  { key: "boss", get label() { return tx("ui.trainPage.boss", "Boss"); }, icon: Skull, get desc() { return tx("ui.trainPage.thisWeekSTough", "This week's tough round"); } },
];
const FREESTYLE_CUES = { combo: "Nice combination", head_move: "Clean" };

const BELL_SOUND_URL = "https://www.soundjay.com/sports/boxing-bell-1.mp3";

// Mid-round hype lines cycled during the Private AI Room session
// "validate" lines are generic encouragement, not claims about this user's specific
// technique right now — nothing is actually watching them mid-round, so nothing here
// should read as an observation (see the between-rounds feedback fix for the same rule).
// None of these reference a specific time remaining — the real countdown warning is
// handled separately by showTenSecWarning, driven by the actual timer.
const HYPE_LINES = [
  { type: "motivate", get text() { return tx("ui.trainPage.handsUpYouRe", "Hands UP — you're dropping the right again!"); } },
  { type: "joke",     get text() { return tx("ui.trainPage.youReSweatingLike", "You're sweating like you've seen my jab. Good."); } },
  { type: "tip",      get text() { return tx("ui.trainPage.breatheOutOnEach", "Breathe out on each punch — keeps your core tight."); } },
  { type: "validate", get text() { return tx("ui.trainPage.stayLightOnYour", "Stay light on your feet — footwork wins rounds."); } },
  { type: "motivate", get text() { return tx("ui.trainPage.stayInYourStance", "Stay in your stance, don't lean forward."); } },
  { type: "joke",     get text() { return tx("ui.trainPage.iVeSeenSlower", "I've seen slower footwork… on my nan. You're improving though."); } },
  { type: "tip",      get text() { return tx("ui.trainPage.doubleUpThatJab", "Double up that jab — don't just poke, commit."); } },
  { type: "validate", get text() { return tx("ui.trainPage.trustYourShotsDon", "Trust your shots — don't rush them."); } },
  { type: "motivate", get text() { return tx("ui.trainPage.championsDonTStop", "Champions don't stop when it hurts — they stop when it's done."); } },
  { type: "tip",      get text() { return tx("ui.trainPage.turnYourHipOn", "Turn your hip on the cross — get the full power transfer."); } },
  { type: "joke",     get text() { return tx("ui.trainPage.youLookTiredGood", "You look tired. Good. That means you're working."); } },
  { type: "validate", get text() { return tx("ui.trainPage.keepThatHeadMoving", "Keep that head moving — don't be a stationary target."); } },
  { type: "motivate", get text() { return tx("ui.trainPage.pushThePaceMake", "Push the pace — make every second count."); } },
  { type: "tip",      get text() { return tx("ui.trainPage.returnYourHandsTo", "Return your hands to guard after every combination."); } },
  { type: "validate", get text() { return tx("ui.trainPage.stayBalancedThroughYour", "Stay balanced through your combinations."); } },
  { type: "joke",     get text() { return tx("ui.trainPage.myCircuitsAreOverheating", "My circuits are overheating just watching you. Push harder."); } },
];

const HYPE_COLORS = {
  motivate: "text-victory-lime",
  joke:     "text-victory-orange",
  tip:      "text-victory-teal",
  validate: "text-victory-lime",
};

// What the fighter reads next to the coach's name (the type keys above are code, not words).
const HYPE_LABEL = {
  get motivate() { return tx("ui.trainPage.hypeMotivate", "Push"); },
  get joke() { return tx("ui.trainPage.hypeJoke", "Banter"); },
  get tip() { return tx("ui.trainPage.hypeTip", "Tip"); },
  get validate() { return tx("ui.trainPage.hypeValidate", "Good work"); },
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
  // Set by a booked-round or callout push: "/train?focus=Footwork".
  const [searchParams] = useSearchParams();
  const focus = searchParams.get("focus");
  // "/train?quick=1" is the Just One Round button; "/train?mode=boss|freestyle" picks a round type.
  const quick = searchParams.get("quick") === "1";
  // New fighters get a simple setup; round types, combo calls and going live arrive as they
  // train (lib/unlocks.js), so the first session is one clear thing to do.
  const unlocks = useUnlocks(API);
  const [kind, setKind] = useState(() => (["freestyle", "boss"].includes(searchParams.get("mode")) ? searchParams.get("mode") : "standard"));
  const canPickKind = isUnlocked(unlocks, "round_types");
  const canCall = isUnlocked(unlocks, "combo_calls");
  const canGoLive = isUnlocked(unlocks, "go_live");
  const kindsOpen = KINDS.filter((k) => k.key !== "boss" || isUnlocked(unlocks, "boss"));
  const [boss, setBoss] = useState(null);
  const [callsOn, setCallsOn] = useState(readCalls);
  const [currentCall, setCurrentCall] = useState(null);
  const callerRef = useRef(null);
  const roundWorkRef = useRef(null);
  // Training with a pro's alias ("The Reaper"): their approved talking clips play at key moments.
  const aliasProId = user?.training_partner?.alias_pro_id;
  const [proClips, setProClips] = useState({});
  const [clip, setClip] = useState(null);
  useEffect(() => {
    if (!aliasProId) return;
    axios.get(`${API}/pros/${aliasProId}`).then((r) => setProClips(r.data.clips || {})).catch(() => setProClips({}));
  }, [aliasProId]);
  const playClip = (moment) => { if (proClips[moment]) setClip(proClips[moment]); };
  // The combo you chose in the combo builder this week: shown here and called during rounds.
  const [weeklyCombo, setWeeklyCombo] = useState(null);
  const [numbersOn, setNumbersOn] = useState(callsNumbers);
  const [pace, setPace] = useState(callPace);
  const [voiceTest, setVoiceTest] = useState(null);
  // Hear the coach before the bell. The tap also wakes up the phone's audio, and the result says
  // whether the natural voice is working or the phone's own voice is standing in.
  const testVoice = async () => {
    unlockSpeech();
    const line = tx("ui.trainPage.voiceTestLine", "Hands up, chin down. Let's work.");
    setVoiceTest("loading");
    await Promise.race([primeVoice([line]), new Promise((r) => setTimeout(r, 6000))]);
    say(line, { interrupt: true });
    setVoiceTest(hasClip(line) ? "natural" : "phone");
  };
  const stance = user?.stance;

  // Natural voice clips for every line the coach can say this session, fetched before the
  // bell so calls play instantly (lib/speech.js).
  useEffect(() => {
    setVoiceSource((texts) => axios.post(`${API}/voice/clips`, { texts }).then((r) => r.data));
    const combos = CALL_LEVELS.flatMap((l) => l.combos);
    if (weeklyCombo?.label) combos.push(weeklyCombo.label);
    primeVoice([
      ...combos.map((c) => comboSpeech(c, stance, numbersOn)),
      ...Object.values(COACH_CUES),
      ...Object.values(FREESTYLE_CUES),
    ]);
  }, [stance, numbersOn, weeklyCombo]);
  useEffect(() => {
    axios.get(`${API}/combos`).then((r) => setWeeklyCombo(r.data.active || null)).catch(() => {});
  }, []);
  useEffect(() => {
    if (!unlocks) return;
    if (!isUnlocked(unlocks, "go_live")) setSessionMode("private");
    if ((kind === "boss" && !isUnlocked(unlocks, "boss")) || (kind === "freestyle" && !isUnlocked(unlocks, "round_types"))) setKind("standard");
  }, [unlocks, kind]);
  useEffect(() => {
    if (kind !== "boss") return;
    axios.get(`${API}/boss`, { params: { round_duration: FIXED_ROUND_SECONDS } }).then((r) => setBoss(r.data)).catch(() => setBoss(null));
  }, [kind]);
  const [focusPb, setFocusPb] = useState(null);
  useEffect(() => {
    if (!focus) return;
    axios.get(`${API}/users/me/personal-bests`)
      .then((r) => setFocusPb(r.data?.[focus.replace(/[^A-Za-z0-9 ]/g, "")] ?? null))
      .catch(() => {});
  }, [focus]);

  // ── Config state ────────────────────────────────────────────────────────────
  const [isConfiguring, setIsConfiguring] = useState(true);
  const [roundDuration, setRoundDuration] = useState(DEFAULT_ROUND_SECONDS);
  const [restDuration,  setRestDuration]  = useState(60);
  const [totalRounds,   setTotalRounds]   = useState(3);
  const [sessionMode,   setSessionMode]   = useState("private"); // "private" | "public"
  const [voiceEnabled,  setVoiceEnabled]  = useState(true);
  // Opt-in, off by default (privacy by default) — but remembered once the fighter answers.
  const [videoPref,     setVideoPrefState] = useState(() => getVideoPref());
  const [recordVideo,   setRecordVideo]   = useState(() => getVideoPref() === "on");
  const [liveCoach,     setLiveCoach]     = useState(readLiveCoach);
  const [ghost,         setGhost]         = useState(null);
  const [lastLiveRound, setLastLiveRound] = useState(null);
  const [cameraReady,   setCameraReady]   = useState(false);
  const [facing,        setFacing]        = useState("user");
  const [cameraError,   setCameraError]   = useState(null);
  const [startingSession, setStartingSession] = useState(false);

  // ── Training state ───────────────────────────────────────────────────────────
  const [sessionId,         setSessionId]         = useState(null);
  const [currentRound,      setCurrentRound]      = useState(1);
  const [timeLeft,          setTimeLeft]           = useState(DEFAULT_ROUND_SECONDS);
  const [isResting,         setIsResting]          = useState(false);
  const [isPaused,          setIsPaused]           = useState(true);
  const [isComplete,        setIsComplete]         = useState(false);
  const [finishing,         setFinishing]          = useState(false);
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
  const endsAtRef = useRef(null);
  const hypeTimerRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const recordedSizeRef = useRef(0);
  const recordedTypeRef = useRef("");
  const videoPreviewRef = useRef(null);

  const coach = useLiveCoach({
    enabled: liveCoach && cameraReady && !isConfiguring,
    videoRef: videoPreviewRef,
    running: !isPaused && !isResting && !isComplete && !isConfiguring,
    voice: voiceEnabled,
    cues: kind === "freestyle" ? FREESTYLE_CUES : undefined,
    onEvent: (e) => { if (e === "punch") callerRef.current?.punch(performance.now()); },
  });

  // Combo calls: adapt only when the camera can see whether they landed (lib/comboCaller.js).
  const adaptiveCalls = kind === "standard" && liveCoach && coach.status === "ready";
  useEffect(() => {
    const caller = callerRef.current;
    if (!caller || isPaused || isResting || isComplete || isConfiguring) {
      caller?.pause();
      setCurrentCall(null);
      return undefined;
    }
    const id = setInterval(() => {
      const c = caller.tick(performance.now(), { adaptive: adaptiveCalls });
      if (c) {
        setCurrentCall(c);
        if (voiceEnabled) sayCombo(c.combo, stance);
      }
    }, 250);
    return () => clearInterval(id);
  }, [isPaused, isResting, isComplete, isConfiguring, adaptiveCalls, voiceEnabled, stance]);

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
      setRoundDuration(c.roundDuration || DEFAULT_ROUND_SECONDS);
      setRestDuration(c.restDuration   || 60);
      setTotalRounds(c.totalRounds     || 3);
      setSessionMode(c.sessionMode     || "private");
    }
    if (quick || kind === "boss") {
      setRoundDuration(FIXED_ROUND_SECONDS);
      setTotalRounds(1);
    }
    if (kind !== "standard") setSessionMode("private");
    audioRef.current = new Audio(BELL_SOUND_URL);
    audioRef.current.load();
    return () => {
      if (intervalRef.current)  clearInterval(intervalRef.current);
      if (hypeTimerRef.current) clearInterval(hypeTimerRef.current);
      // Release the camera if the user navigates away mid-session.
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  // Start loading the punch counter while the fighter is still on the setup screen.
  useEffect(() => {
    if (isConfiguring && liveCoach) preloadLiveCoach();
  }, [isConfiguring, liveCoach]);

  // Attach the live stream once the preview <video> actually exists — it only
  // mounts on the active-session screen, which appears after the stream is
  // already obtained on the configuring screen.
  useEffect(() => {
    if (videoPreviewRef.current && cameraStreamRef.current) {
      const v = videoPreviewRef.current;
      if (v.srcObject !== cameraStreamRef.current) v.srcObject = cameraStreamRef.current;
      v.play?.().catch(() => {});
    }
  }, [cameraReady, isConfiguring]);

  // The App Store app mirrors the round clock to the Lock Screen and Dynamic Island, so
  // the timer stays visible when the fighter switches to their music.
  useEffect(() => {
    if (isConfiguring || isComplete) return;
    nativeRound(isPaused ? "pause" : "update", {
      round: currentRound, total: totalRounds, resting: isResting,
      ends_at: Date.now() + timeLeft * 1000, seconds_left: timeLeft,
    });
    // timeLeft is read at each phase change only; the native timer counts down itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfiguring, isComplete, isPaused, isResting, currentRound, totalRounds]);

  const chooseLiveCoach = (on) => {
    setLiveCoach(on);
    try { localStorage.setItem(LIVE_COACH_KEY, on ? "1" : "0"); } catch {}
    analytics.capture("live_coach_choice", { on });
  };

  const chooseVideo = (on) => {
    setRecordVideo(on);
    setVideoPref(on);
    setVideoPrefState(on ? "on" : "off");
    analytics.capture("record_video_choice", { on, asked: videoPref === null });
  };

  const saveConfig = useCallback(() => {
    if (quick || kind !== "standard") return; // a one-off round type never changes your usual setup
    localStorage.setItem("victory_train_config", JSON.stringify({
      roundDuration, restDuration, totalRounds, sessionMode,
    }));
  }, [roundDuration, restDuration, totalRounds, sessionMode, quick, kind]);

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
  // Round notes aren't timed to a punch, so wait (up to 20 s) for the natural voice to be made
  // rather than reading them out in the phone's robot voice.
  const playVoiceFeedback = (text) => sayNatural(text, 20000);

  // ── Camera / round video capture ────────────────────────────────────────────
  const requestCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(t("train.cameraUnsupported"));
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: cameraConstraints(facing), audio: false });
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

  // Front camera (you can see yourself) or back camera (better picture). Recording restarts
  // on the new camera; Live Coach keeps counting from the same preview.
  const swapCamera = async (facingMode) => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: cameraConstraints(facingMode), audio: false });
    const wasRecording = mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive";
    if (wasRecording) { try { mediaRecorderRef.current.stop(); } catch {} }
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = stream;
    const v = videoPreviewRef.current;
    if (v) { v.srcObject = stream; v.play?.().catch(() => {}); }
    if (wasRecording && !isResting) startRoundRecording();
  };

  const flipCamera = async () => {
    const next = facing === "user" ? "environment" : "user";
    try {
      await swapCamera(next);
      setFacing(next);
    } catch {
      toast.error(tx("ui.trainPage.cantSwitchCamera", "Couldn't switch camera on this phone."));
    }
  };

  // ── Watchdog: if the phone stops the camera or freezes mid-round, start the camera again and
  // tell the server what happened (seen at /api/health/video-scoring), so a frozen round can be
  // traced instead of guessed at.
  const reportProblem = useCallback((stage, detail) => {
    if (!sessionId) return;
    axios.post(`${API}/training/${sessionId}/video-problem`, { round_number: currentRound, stage, detail: String(detail).slice(0, 300) }).catch(() => {});
  }, [sessionId, currentRound]);
  useEffect(() => {
    if (isConfiguring || isComplete) return undefined;
    let lastFrame = performance.now();
    let raf = 0;
    let mutedSince = 0;
    let fixing = false;
    const frame = (now) => {
      const gap = now - lastFrame;
      if (gap > 2500 && document.visibilityState === "visible") reportProblem("freeze", `page froze for ${Math.round(gap / 1000)}s`);
      lastFrame = now;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const onHide = () => { if (document.visibilityState === "hidden") reportProblem("hidden", "app went to the background mid-round"); };
    document.addEventListener("visibilitychange", onHide);
    const offVoice = onVoiceProblem((what) => reportProblem("voice", what));
    const check = setInterval(async () => {
      const track = cameraStreamRef.current?.getVideoTracks?.()[0];
      const v = videoPreviewRef.current;
      if (!track || fixing) return;
      const stuck = track.readyState === "ended" || (track.muted && (mutedSince = mutedSince || Date.now()) && Date.now() - mutedSince > 3000);
      if (!track.muted) mutedSince = 0;
      if (stuck) {
        fixing = true;
        reportProblem("camera", track.readyState === "ended" ? "camera stopped (ended)" : "camera stopped sending (muted)");
        try { await swapCamera(facing); reportProblem("camera", "camera restarted"); } catch (e) { reportProblem("camera", `couldn't restart: ${e?.name || e}`); }
        mutedSince = 0;
        fixing = false;
      } else if (v && v.paused && v.srcObject) {
        v.play?.().catch(() => {});
      }
    }, 2000);
    return () => { cancelAnimationFrame(raf); clearInterval(check); document.removeEventListener("visibilitychange", onHide); offVoice(); };
  }, [isConfiguring, isComplete, reportProblem, facing]); // eslint-disable-line react-hooks/exhaustive-deps

  const startRoundRecording = () => {
    const stream = cameraStreamRef.current;
    if (!stream) return;
    recordedChunksRef.current = [];
    // iPhones record MP4; others WebM. A capped bitrate keeps a 3-minute round around 40 MB
    // (an iPhone's default can pass Cloudinary's 100 MB limit, and the upload then fails).
    const mimeType = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"].find((t) => window.MediaRecorder?.isTypeSupported?.(t));
    try {
      const options = { videoBitsPerSecond: ROUND_VIDEO_BITRATE, ...(mimeType ? { mimeType } : {}) };
      let recorder;
      try { recorder = new MediaRecorder(stream, options); } catch { recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream); }
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
      recordedSizeRef.current = blob.size;
      recordedTypeRef.current = blob.type;
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
    formData.append("file", blob, /mp4/.test(blob.type) ? "round.mp4" : "round.webm");
    formData.append("api_key", api_key);
    formData.append("timestamp", timestamp);
    formData.append("signature", signature);
    formData.append("folder", folder);
    const send = () => axios.post(`https://api.cloudinary.com/v1_1/${cloud_name}/video/upload`, formData,
      { headers: { "Content-Type": "multipart/form-data" }, timeout: 120_000 });
    // One retry: a gym's Wi-Fi often drops for a moment.
    const uploadRes = await send().catch(() => send());
    return { video_url: uploadRes.data.secure_url, public_id: uploadRes.data.public_id };
  };

  // ── AI Feedback ──────────────────────────────────────────────────────────────
  const saveLiveRound = (roundNum) => {
    if (!liveCoach) return;
    const snap = coach.takeRound();
    setLastLiveRound(snap);
    if (!sessionId) return;
    axios.post(`${API}/training/${sessionId}/live-round`, {
      round_number: roundNum, punches: snap.punches, left: snap.left, right: snap.right,
      best_combo: snap.bestCombo, guard_drops: snap.guardDrops, guard_pct: snap.guardPct,
      head_moves: snap.headMoves, airpods: coach.airpods, timeline: snap.timeline,
    }).catch(() => {});
  };

  const generateFeedback = async (roundNum) => {
    setLoadingFeedback(true);
    let feedbackOut = null;

    // Video pipeline is best-effort — any failure here just means feedback falls
    // back to the non-video path, never blocks the round from ending.
    let videoAnalysis = null;
    if (recordVideo && sessionId && mediaRecorderRef.current) {
      // Each step is named, so if scoring fails the server log says which one (upload,
      // register, scoring) instead of a vague "couldn't score".
      let stage = "record";
      const problem = (detail) => axios.post(`${API}/training/${sessionId}/video-problem`,
        { round_number: roundNum, stage, detail: String(detail || "").slice(0, 300) }).catch(() => {});
      try {
        const blob = await stopRoundRecording();
        if (!blob) { problem("no video recorded"); }
        else {
          stage = "upload";
          const { video_url, public_id } = await uploadRoundVideo(blob);
          stage = "register";
          await axios.post(`${API}/videos/register`, {
            session_id: sessionId, round_number: roundNum, video_url, public_id,
          }, { withCredentials: true });
          stage = "scoring";
          const analysisRes = await axios.post(`${API}/ai/analyze-video`, {
            video_url, round_number: roundNum, background: true,
          }, { withCredentials: true });
          videoAnalysis = analysisRes.data.job_id
            ? (await waitForJob(analysisRes.data.job_id))?.analysis
            : analysisRes.data.analysis;
          if (!videoAnalysis) problem("no analysis came back in time");
        }
      } catch (err) {
        const size = recordedSizeRef.current ? ` (${(recordedSizeRef.current / 1e6).toFixed(1)} MB, ${recordedTypeRef.current})` : "";
        problem((err?.response ? `${err.response.status} ${JSON.stringify(err.response.data || "").slice(0, 200)}` : err?.message) + size);
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
      feedbackOut = res.data;
      if (voiceEnabled && res.data?.what_you_did_well) {
        // Recency effect: end on the affirming line, not the critique — that's
        // what's still in the fighter's head when the next round starts.
        // A verbal cue first ("Okay.", "Hmm.") so it sounds like your partner watched, then spoke.
        playVoiceFeedback(withCue(`${res.data.what_to_tighten} ${res.data.what_you_did_well}`, `round:${roundNum}`));
      }
    } catch {
      toast.error(t("train.feedbackFailed", "Couldn't generate feedback for this round."));
    }
    finally { setLoadingFeedback(false); }
    return feedbackOut;
  };

  // ── Hype message cycling (during rounds) ─────────────────────────────────────
  const startHypeCycle = useCallback(() => {
    // Clear any existing cycle first so intervals can't stack (pause/resume during rest).
    if (hypeTimerRef.current) clearInterval(hypeTimerRef.current);
    // Shuffle HYPE_LINES
    const pool = kind === "freestyle" ? HYPE_LINES.filter((l) => l.type === "validate" || l.type === "joke") : HYPE_LINES;
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    setHypeQueue(shuffled);
    let idx = 0;
    setCurrentHype(shuffled[0]);
    hypeTimerRef.current = setInterval(() => {
      idx = (idx + 1) % shuffled.length;
      setCurrentHype(shuffled[idx]);
    }, 18_000); // new quip every 18s
  }, [kind]);

  const stopHypeCycle = useCallback(() => {
    if (hypeTimerRef.current) { clearInterval(hypeTimerRef.current); hypeTimerRef.current = null; }
    setCurrentHype(null);
  }, []);

  // ── Start training ───────────────────────────────────────────────────────────
  const startTraining = async () => {
    if (voiceEnabled) unlockSpeech();
    saveConfig();

    if (sessionMode === "public") {
      navigate("/go-live");
      return;
    }

    setStartingSession(true);
    const filming = recordVideo && kind !== "freestyle";
    const watching = liveCoach || kind === "boss";
    if (kind === "boss" && !liveCoach) chooseLiveCoach(true);
    try {
      const res = await withMinDuration(axios.post(`${API}/training/start`, {
        round_duration: roundDuration,
        rest_duration:  restDuration,
        total_rounds:   totalRounds,
        record_video:   filming,
        kind,
        ...currentEntry(),
      }, { withCredentials: true }));
      setSessionId(res.data.session_id);
      analytics.capture("training_started", { entry_source: currentEntry().entry_source, record_video: filming, kind, quick });
    } catch (e) {
      const detail = e?.response?.data?.detail;
      if (kind === "boss" && typeof detail === "string") {
        toast.error(detail);
        setStartingSession(false);
        return;
      }
      toast.error(t("train.startOffline", "Couldn't reach the server — this session won't be saved."));
    }

    if (filming !== recordVideo) setRecordVideo(false);
    if (filming || watching) {
      const granted = await requestCamera();
      if (granted && filming) startRoundRecording();
      if (!granted && kind === "boss") toast.error(tx("ui.trainPage.bossRoundsNeedThe", "Boss Rounds need the camera to count. This try won't count."));
    }
    callerRef.current = callsOn && canCall && kind !== "boss"
      ? createComboCaller({ level: startingLevel(user?.experience_level), floor: levelRange(user?.experience_level).floor, gapScale: CALL_PACES[pace] * (kind === "freestyle" ? 1.4 : 1), weekly: weeklyCombo?.label || null })
      : null;
    // Start once the punch counter and the coach's natural voice are ready (each waits a few seconds at most).
    await Promise.all([liveCoach ? preloadLiveCoach() : null, voiceEnabled ? waitForVoice(10000) : null]);
    if (liveCoach) {
      axios.get(`${API}/training/ghost`, { params: { round_duration: roundDuration } })
        .then((r) => setGhost(r.data?.timeline?.length ? r.data : null))
        .catch(() => setGhost(null));
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
    playClip("round_start");
  };

  // ── Timer ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isPaused || isComplete || isConfiguring) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    // The clock follows real time (a deadline), not a count of ticks: if the phone freezes for a
    // moment, or the screen locks, the round still ends on time instead of stalling.
    endsAtRef.current = Date.now() + timeLeft * 1000;
    intervalRef.current = setInterval(() => {
      const left = Math.max(0, Math.ceil((endsAtRef.current - Date.now()) / 1000));
      setTimeLeft((prev) => {
        if (!isResting && prev > 10 && left <= 10 && left > 0) {
          setShowTenSecWarning(true);
          setTimeout(() => setShowTenSecWarning(false), 3500);
        }
        if (left <= 0) {
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
        return left;
      });
    }, 250);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isPaused, isComplete, isConfiguring, isResting, currentRound, totalRounds, roundDuration, restDuration]);

  useEffect(() => {
    if (isConfiguring || isPaused || isResting || !aliasProId) return;
    if (timeLeft === 10) playClip("last_10");
    else if (timeLeft === Math.floor(roundDuration / 2) && roundDuration > 40) playClip("halfway");
  }, [timeLeft]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRoundEnd = () => {
    saveLiveRound(currentRound);
    roundWorkRef.current = generateFeedback(currentRound);
    playClip("round_end");
  };

  const handleComplete = async () => {
    setIsComplete(true);
    nativeRound("end");
    const caller = callerRef.current;
    const calls = caller ? caller.summary() : null;
    if (caller && kind === "standard" && calls.checked > 0) saveLevel(caller.level());
    stopHypeCycle();
    // The last round's video is still uploading and being scored. Finishing first would
    // save the session with no scores: no breakdown and a locked scouting report.
    // The last round's notes have no rest break to appear in, so they go to the results page.
    let lastNotes = null;
    if (roundWorkRef.current) {
      setFinishing(true);
      lastNotes = await Promise.race([roundWorkRef.current, new Promise((r) => setTimeout(() => r(null), FINISH_WAIT_MS))]);
      roundWorkRef.current = null;
    }
    stopCamera();
    if (sessionId) {
      try {
        const res = await axios.post(`${API}/training/${sessionId}/complete`, calls ? { calls } : {}, { withCredentials: true });
        navigate(`/score/results/${res.data.session_id}`, { state: { session: res.data, fromTraining: true, calls, coachNotes: lastNotes } });
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

  // Ending mid-round still keeps that round: its video and Live Coach counts are saved first.
  const endTimer  = () => { setIsPaused(true); if (!isResting) handleRoundEnd(); handleComplete(); };
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
  const showCam = (recordVideo || liveCoach) && cameraReady;
  // One cue at a time keeps the fighter in flow. With the camera on it sits right under the
  // picture, so you can watch yourself and read the call without looking away.
  const comboCall = (!isResting && !isPaused && currentCall && (
              <div className="w-full max-w-sm mb-4 text-center" data-testid="combo-call" aria-live="polite">
                {numbersOn ? (
                  <p className="font-mono text-5xl font-extrabold text-victory-lime leading-none">{currentCall.combo}</p>
                ) : (
                  <>
                    <p className="font-heading text-3xl font-extrabold text-victory-lime leading-tight">{comboWords(currentCall.combo, stance).join(" · ")}</p>
                    <p className="font-mono text-victory-muted text-xs mt-1">{currentCall.combo}</p>
                  </>
                )}
                <p className="text-victory-muted text-[11px] mt-2">
                  {kind === "freestyle" ? tx("ui.trainPage.riffOnIt", "Riff on it") : `${currentCall.levelName}${adaptiveCalls ? " · adapts to you" : ""}`}
                </p>
              </div>
            ));

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className={`min-h-screen bg-victory-bg ${isConfiguring ? "pb-nav" : "safe-bottom"} flex flex-col ${flashClass}`} data-testid="train-page">
      {clip && (
        <video key={clip} src={clip} autoPlay playsInline onEnded={() => setClip(null)} onError={() => setClip(null)}
          className="fixed right-4 bottom-28 w-32 aspect-[9/16] object-cover rounded-2xl shadow-2xl z-40 border border-victory-lime/40"
          data-testid="pro-clip" />
      )}
      {finishing && (
        <div className="fixed inset-0 z-50 bg-victory-bg/95 flex flex-col items-center justify-center gap-4 p-6 text-center" data-testid="finishing-session" aria-live="polite">
          <div className="w-10 h-10 rounded-full border-2 border-victory-border border-t-victory-lime animate-spin" />
          <p className="text-victory-text font-heading font-bold">{tx("ui.trainPage.scoringYourLastRound", "Scoring your last round")}</p>
          <p className="text-victory-muted text-sm max-w-xs">{tx("ui.trainPage.yourVideoIsBeing", "Your video is being checked so your breakdown and scouting report are ready.")}</p>
        </div>
      )}

      {isConfiguring ? (
        /* ── Config screen ──────────────────────────────────────────────────── */
        <div className="flex-1 flex flex-col justify-center p-6">
          <div className="text-center mb-8">
            <p className="text-victory-lime text-xs font-bold uppercase tracking-[0.2em] mb-2">{tx("ui.trainPage.readyToWork", "Ready to work")}</p>
            <h1 className="text-3xl font-heading font-extrabold text-victory-text leading-tight">
              {t("train.title")}
            </h1>
            <p className="text-victory-muted text-sm mt-2">{tx("ui.trainPage.setYourSessionThen", "Set your session, then step into the ring.")}</p>
          </div>

          <div className="space-y-6 max-w-md mx-auto w-full">

            {quick && kind === "standard" && (
              <div className="victory-card p-4 border-victory-lime/30 bg-victory-lime/5 text-center" data-testid="quick-round">
                <p className="text-victory-text font-heading font-bold">{tx("ui.trainPage.oneRoundThreeMinutes", "One round. Three minutes. That's it.")}</p>
                <p className="text-victory-muted text-xs mt-1">{tx("ui.trainPage.smallDaysStillCount", "Small days still count for your week and your partner.")}</p>
              </div>
            )}

            <TimerCard />

            {canPickKind && (
            <CoachMark id="train_round_types" position="bottom" block>
            <div>
              <p className="text-victory-muted text-sm font-semibold uppercase tracking-wider mb-3">{tx("ui.trainPage.roundType", "Round type")}</p>
              <div className={`grid gap-2 ${kindsOpen.length === 3 ? "grid-cols-3" : "grid-cols-2"}`} role="radiogroup" aria-label={tx("ui.trainPage.roundType", "Round type")}>
                {kindsOpen.map(({ key, label, icon: Icon, desc }) => (
                  <button key={key} role="radio" aria-checked={kind === key}
                    onClick={() => {
                      setKind(key);
                      if (key !== "standard") setSessionMode("private");
                      if (key === "boss") { setRoundDuration(FIXED_ROUND_SECONDS); setTotalRounds(1); }
                    }}
                    className={`flex flex-col items-center gap-1 p-3 rounded-2xl border-2 text-center min-h-[88px] transition-all ${
                      kind === key ? "border-victory-lime bg-victory-lime/10" : "border-victory-border bg-victory-card"
                    }`}>
                    <Icon className={`w-5 h-5 ${kind === key ? "text-victory-lime" : "text-victory-muted"}`} />
                    <span className="text-victory-text text-sm font-bold">{label}</span>
                    <span className="text-victory-muted text-[10px] leading-tight">{desc}</span>
                  </button>
                ))}
              </div>
            </div>
            </CoachMark>
            )}

            {weeklyCombo && kind !== "boss" && (
              <div className="victory-card p-4 flex items-center gap-3" data-testid="weekly-combo">
                <Swords className="w-5 h-5 text-victory-lime flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-victory-text text-sm font-semibold">{tx("ui.trainPage.thisWeekSCombo", "This week's combo:")} <span className="font-mono">{weeklyCombo.label}</span>{weeklyCombo.name ? ` (${weeklyCombo.name})` : ""}</p>
                  <p className="text-victory-muted text-xs">{canCall && callsOn ? tx("ui.trainPage.yourCoachCallsIt", "Your coach calls it every third combo.") : tx("ui.trainPage.yourPartnerWatchesFor", "Your partner watches for it in recorded rounds.")}</p>
                </div>
              </div>
            )}

            {kind === "freestyle" && (
              <div className="victory-card p-4" data-testid="freestyle-note">
                <p className="text-victory-text text-sm font-semibold">{tx("ui.trainPage.putYourOwnMusic", "Put your own music on and move.")}</p>
                <p className="text-victory-muted text-xs mt-1">{tx("ui.trainPage.noScoreNoRank", "No score, no rank, nothing filmed. Your coach only points out the good bits. It still counts for your week and your partner.")}</p>
              </div>
            )}

            {kind === "boss" && (
              <div className="victory-card p-4 space-y-2 border-victory-orange/40" data-testid="boss-card">
                {boss ? (
                  <>
                    <p className="section-label flex items-center gap-1.5"><Skull className="w-3 h-3" /> {tx("ui.trainPage.thisWeekSBoss", "This week's boss")}</p>
                    <p className="text-victory-text font-heading font-extrabold text-lg">{boss.name}</p>
                    <p className="text-victory-text text-sm">{boss.target.line} {tx("ui.trainPage.inOne3Minute", "in one 3-minute round.")}</p>
                    <p className="text-victory-muted text-xs">
                      {boss.beaten ? tx("ui.trainPage.beatenThisWeekA", "Beaten this week. A new boss arrives on Monday.")
                        : tx("ui.trainPage.ofTriesLeftThis", "{{attempts_left}} of {{attempts}} tries left this week. Live Coach counts it on your phone.", { attempts_left: boss.attempts_left, attempts: boss.attempts })}
                    </p>
                  </>
                ) : <div className="skeleton-shimmer h-16 rounded-lg" />}
              </div>
            )}

            {canCall && kind !== "boss" && sessionMode === "private" && (
              <CoachMark id="train_combo_calls" block>
              <div className="victory-card p-4" data-testid="combo-calls-toggle">
                <ToggleRow on={callsOn} iconOn={Megaphone} title={tx("ui.trainPage.comboCalls", "Combo calls")}
                  onToggle={(next) => { setCallsOn(next); try { localStorage.setItem(CALLS_KEY, next ? "1" : "0"); } catch {} }}
                  description={kind === "freestyle" ? tx("ui.trainPage.looseCallsToRiff", "Loose calls to riff on.") : tx("ui.trainPage.yourCoachCallsCombos", "Your coach calls combos at your level. With Live Coach on, they get harder or easier to keep you in the zone.")} />
                {callsOn && (
                  <ToggleRow on={numbersOn} iconOn={Hash} title={tx("ui.trainPage.callNumbers", "Call numbers")}
                    onToggle={(next) => { setNumbersOn(next); setCallsNumbers(next); }}
                    description={numbersOn ? tx("ui.trainPage.callsLike12", "Calls like \"1, 2, 3\".") : tx("ui.trainPage.callsLikeWords", "Calls like \"{{example}}\". Switch on if your coach taught you numbers.", { example: comboSpeech("1-2-3", stance, false) })} />
                )}
                <div className="mt-3 flex items-center gap-3" data-testid="voice-test">
                  <button type="button" onClick={testVoice} disabled={voiceTest === "loading"}
                    className="min-h-[40px] px-4 rounded-full bg-victory-card-highlight text-victory-text text-sm font-semibold flex items-center gap-2 disabled:opacity-60">
                    <Volume2 className="w-4 h-4" /> {voiceTest === "loading" ? tx("ui.trainPage.voiceTestLoading", "Getting the voice ready…") : tx("ui.trainPage.voiceTest", "Test the coach's voice")}
                  </button>
                  {voiceTest === "natural" && <span className="text-victory-lime text-xs">{tx("ui.trainPage.voiceNatural", "Natural voice ✓")}</span>}
                  {voiceTest === "phone" && <span className="text-victory-orange text-xs">{tx("ui.trainPage.voicePhone", "Phone voice. Can't hear it? Turn the volume up.")}</span>}
                </div>
                {callsOn && (
                  <div className="mt-3" data-testid="call-pace">
                    <p className="text-victory-text text-sm font-semibold">{tx("ui.trainPage.callSpeed", "Call speed")}</p>
                    <div className="grid grid-cols-3 gap-2 mt-2" role="radiogroup" aria-label={tx("ui.trainPage.callSpeed", "Call speed")}>
                      {[["slow", tx("ui.trainPage.paceSlow", "Slow")], ["normal", tx("ui.trainPage.paceNormal", "Normal")], ["fast", tx("ui.trainPage.paceFast", "Fast")]].map(([key, label]) => (
                        <button key={key} type="button" role="radio" aria-checked={pace === key}
                          onClick={() => { setPace(key); setCallPace(key); }}
                          className={`min-h-[40px] rounded-full text-sm font-semibold ${pace === key ? "bg-victory-lime text-victory-bg" : "bg-victory-card-highlight text-victory-muted"}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              </CoachMark>
            )}

            {focus && (
              <div className="victory-card p-4 flex items-center gap-3 border-victory-lime/30 bg-victory-lime/5" data-testid="train-focus">
                <div className="w-10 h-10 rounded-2xl bg-victory-lime/10 border border-victory-lime/20 flex items-center justify-center flex-shrink-0">
                  <Target className="w-5 h-5 text-victory-lime" />
                </div>
                <div>
                  <p className="text-victory-text font-heading font-bold text-sm">{tx("ui.trainPage.todaySFocus", "Today's focus:")} {focus}</p>
                  <p className="text-victory-muted text-xs">
                    {focusPb != null ? <>{tx("ui.trainPage.personalBestToBeat", "Personal best to beat:")} <span className="font-mono text-victory-lime">{focusPb}</span></> : tx("ui.trainPage.turnOnVideoSo", "Turn on video so the AI can score it")}
                  </p>
                </div>
              </div>
            )}

            {/* Round duration */}
            {!(quick && kind === "standard") && kind !== "boss" && (<>
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
            </>)}

            {/* ── Mode toggle — replaces Record & Analyse ────────────────────── */}
            {kind === "standard" && canGoLive && (
            <div>
              <p className="text-victory-muted text-sm font-semibold uppercase tracking-wider mb-3">{tx("ui.trainPage.sessionMode", "Session Mode")}</p>
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
                      {tx("ui.trainPage.privateAiRoom", "Private AI Room")}
                    </p>
                    <p className="text-victory-muted text-[11px] mt-0.5 leading-snug">
                      {tx("ui.trainPage.trainWithYourAi", "Train with your AI partner — focused & private")}
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
                      {tx("ui.trainPage.publicLivestream", "Public Livestream")}
                    </p>
                    <p className="text-victory-muted text-[11px] mt-0.5 leading-snug">
                      {tx("ui.trainPage.goLiveLetThe", "Go live — let the community watch")}
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
                  {tx("ui.trainPage.tappingStartWillOpen", "Tapping Start will open the Go Live screen.")}
                </p>
              )}
              {sessionMode === "private" && (
                <p className="mt-3 text-sm text-victory-lime/70 text-center">
                  {tx("ui.trainPage.yourAiPartnerWill", "Your AI partner will motivate, coach, and banter with you between rounds.")}
                </p>
              )}
            </div>
            )}

            {/* Voice toggle (private mode only) */}
            {sessionMode === "private" && (
              <div className="victory-card p-4">
                <ToggleRow on={voiceEnabled} onToggle={setVoiceEnabled} iconOn={Volume2} iconOff={VolumeX}
                  title={t("train.voiceFeedback")} description={t("train.voiceDesc")} />
              </div>
            )}

            {/* Video recording toggle — opt-in, off by default. Enabling it is what
                makes AI feedback based on your real technique instead of banter. */}
            {sessionMode === "private" && kind !== "freestyle" && videoPref === null && (
              <div className="victory-card p-4 space-y-3 border-victory-lime/40 bg-victory-lime/5" data-testid="video-ask">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-victory-lime/10 border border-victory-lime/20 flex items-center justify-center flex-shrink-0">
                    <Video className="w-5 h-5 text-victory-lime" />
                  </div>
                  <div>
                    <p className="text-victory-text font-heading font-bold">{t("train.videoAskTitle", "Get scored by AI?")}</p>
                    <p className="text-victory-muted text-sm">
                      {t("train.videoAskBody", "Recording is how the AI scores you, finds your personal bests and writes your scouting report. Clips stay private unless you share them.")}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => chooseVideo(false)} className="victory-btn-ghost min-h-[48px] text-sm">{t("train.videoAskNo", "Not now")}</button>
                  <button onClick={() => chooseVideo(true)} className="victory-btn-primary min-h-[48px] text-sm">{t("train.videoAskYes", "Turn on")}</button>
                </div>
              </div>
            )}

            {sessionMode === "private" && kind !== "freestyle" && videoPref !== null && (
              <CoachMark id="train_video" block>
              <div className="victory-card p-4">
                <ToggleRow on={recordVideo} onToggle={chooseVideo} iconOn={Video} iconOff={VideoOff}
                  title={t("train.recordVideo")} description={t("train.recordVideoDesc")} testId="video-toggle" />
                {cameraError && (
                  <p className="text-victory-danger text-xs mt-2">{cameraError}</p>
                )}
                {!recordVideo && (
                  <p className="text-victory-muted text-xs mt-2" data-testid="video-off-note">
                    {t("train.videoOffNote", "Video's off — this session won't get an AI score, personal bests or a scouting report.")}
                  </p>
                )}
              </div>
              </CoachMark>
            )}

            {sessionMode === "private" && kind !== "boss" && (
              <div className="victory-card p-4" data-testid="live-coach-toggle">
                <ToggleRow on={liveCoach} onToggle={chooseLiveCoach} iconOn={ScanEye}
                  title={t("train.liveCoach", "Live Coach")}
                  description={t("train.liveCoachDesc", "Counts punches, combos and guard drops as you go, and races your best round. Runs on your phone — nothing is uploaded.")} />
              </div>
            )}

            <div className="flex items-center justify-center gap-2 text-sm">
              <span className="text-victory-muted">{t("train.total")}</span>
              <span className="text-victory-lime font-bold font-mono">{getTotalWorkoutTime()}</span>
            </div>

            <button onClick={startTraining} disabled={startingSession || (kind === "boss" && (!boss || boss.beaten || boss.attempts_left <= 0))} className="victory-btn-primary font-heading text-base tracking-wide disabled:opacity-60 flex items-center justify-center gap-2" data-testid="start-training-btn">
              {startingSession ? (
                <span className="w-5 h-5 border-2 border-victory-bg border-t-transparent rounded-full animate-spin" />
              ) : (
                sessionMode === "public" ? tx("ui.trainPage.goLive", "🔴 Go Live") : kind === "boss" ? tx("ui.trainPage.faceTheBoss", "💀 Face the boss") : `🥊 ${t("train.startBtn")}`
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
            {showCam && (
              <div className="relative w-full max-w-sm aspect-video rounded-xl overflow-hidden bg-black mb-3">
                <video
                  ref={videoPreviewRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                  style={facing === "user" ? { transform: "scaleX(-1)" } : undefined}
                />
                <button type="button" onClick={flipCamera} data-testid="flip-camera"
                  aria-label={facing === "user" ? tx("ui.trainPage.useBackCamera", "Use back camera") : tx("ui.trainPage.useFrontCamera", "Use front camera")}
                  className="absolute top-2 right-2 w-10 h-10 rounded-full bg-black/60 backdrop-blur-sm text-white flex items-center justify-center active:scale-90 transition-transform">
                  <SwitchCamera className="w-5 h-5" />
                </button>
                {!isResting && recordVideo && (
                  <span className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-1 rounded-full">
                    <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                    {t("train.recording")}
                  </span>
                )}
                {!recordVideo && (
                  <span className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-1 rounded-full">
                    {t("train.liveCoachOnly", "Live Coach · nothing is recorded")}
                  </span>
                )}
                {liveCoach && !isResting && (
                  <LiveCoachOverlay
                    status={coach.status}
                    stats={coach.stats}
                    airpods={coach.airpods}
                    ghost={ghost ? ghostCount(ghost.timeline, roundDuration - timeLeft) : null}
                  />
                )}
              </div>
            )}

            {showCam && <div className="w-full max-w-sm min-h-[72px] flex items-start justify-center">{comboCall}</div>}

            {/* Round dots */}
            <div className={`flex items-center gap-2 ${showCam ? "mb-3" : "mb-6"}`}>
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

            {!showCam && (
              <CornerOrb thinking={loadingFeedback} paused={isPaused} resting={isResting} complete={isComplete}
                watching={liveCoach && coach.status === "ready"} label={partner?.name || tx("ui.trainPage.coach", "Coach")} size={40} />
            )}

            {/* Phase label (with the coach's orb beside it when the camera takes the space) */}
            <div className={`flex items-center gap-2 ${showCam ? "mb-1" : "mb-3"}`}>
              {showCam && (
                <CornerOrb compact thinking={loadingFeedback} paused={isPaused} resting={isResting} complete={isComplete}
                  watching={liveCoach && coach.status === "ready"} label={partner?.name || tx("ui.trainPage.coach", "Coach")} size={18} />
              )}
              <p className={`text-sm uppercase tracking-[0.2em] font-bold ${isResting ? "text-victory-teal" : "text-victory-lime"}`}>
                {isResting ? t("train.restLabel") : t("train.roundLabel")}
              </p>
            </div>

            {/* Timer */}
            <div className={`timer-display mb-2 transition-colors ${isResting ? "text-victory-teal" : "text-victory-text"}`} data-testid="timer-display"
              style={showCam ? { fontSize: "clamp(52px, 17vw, 76px)" } : undefined}>
              {formatTime(timeLeft)}
            </div>

            {/* Goal gradient effect: proximity to the finish should read as more
                urgent/motivating the closer the fighter actually is to it. */}
            <p className={`text-sm ${showCam ? "mb-3" : "mb-6"} ${!isResting && currentRound === totalRounds ? "text-victory-lime font-bold" : "text-victory-muted"}`}>
              {!isResting && currentRound === totalRounds
                ? t("train.finalRound")
                : t("train.roundOf", { current: currentRound, total: totalRounds })}
            </p>

            {!showCam && comboCall}

            {kind === "boss" && boss && !isResting && (
              <p className="text-victory-orange text-sm font-semibold mb-4" data-testid="boss-goal">{boss.name}: {boss.target.line}</p>
            )}

            {/* ── Mid-round hype bubble (private mode, not resting) ──────────── */}
            {!isResting && currentHype && !isPaused && !currentCall && (
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
                      {partner?.name || tx("ui.trainPage.coach", "Coach")} · <span className={`${HYPE_COLORS[currentHype.type] || "text-victory-lime"}`}>
                        {HYPE_LABEL[currentHype.type] || ""}
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
                  💥 {partner?.name || tx("ui.trainPage.coach", "Coach")}{tx("ui.trainPage.last10FinishStrong", ": Last 10 — finish strong!")}
                </p>
              </div>
            )}

            {/* ── Rest period: AI feedback card ──────────────────────────────── */}
            {isResting && (
              <div className="w-full max-w-md">
                {liveCoach && <LiveRoundSummary round={lastLiveRound} ghostPunches={ghost?.punches ?? null} />}
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
                      <p className="text-victory-muted text-xs">{tx("ui.trainPage.round", "Round")} {currentRound} {tx("ui.trainPage.debrief", "debrief")}</p>
                    </div>
                    <FirstUseTip id="train_voice_toggle" position="top">
                      <button onClick={() => setVoiceEnabled((v) => !v)}
                        aria-label={voiceEnabled ? tx("ui.trainPage.disableVoice", "Disable voice") : tx("ui.trainPage.enableVoice", "Enable voice")}
                        className="w-11 h-11 flex items-center justify-center text-victory-muted hover:text-victory-text">
                        {voiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                      </button>
                    </FirstUseTip>
                  </div>

                  {loadingFeedback ? (
                    <div className="py-3 space-y-3">
                      <div className="relative aspect-video rounded-xl overflow-hidden bg-black">
                        <img
                          src="/images/ring-card-girl.jpg"
                          alt={tx("ui.trainPage.ringCardGirl", "Ring card girl")}
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
              <FirstUseTip id="train_skip_btn" position="top" hold={!isPaused && !isResting}>
                <button
                  onClick={skipToNext}
                  className="w-14 h-14 rounded-full bg-victory-card border border-victory-border flex items-center justify-center text-victory-muted hover:text-victory-text touch-target transition-all active:scale-90"
                  aria-label={tx("ui.trainPage.skip", "Skip")}
                >
                  <SkipForward className="w-6 h-6" />
                </button>
              </FirstUseTip>

              {/* Play/Pause — primary dominant CTA */}
              <button
                onClick={togglePause}
                className={`w-20 h-20 rounded-full flex items-center justify-center touch-target transition-all active:scale-90 shadow-xl ${
                  isPaused
                    ? "bg-victory-lime text-victory-bg shadow-victory-lime/25 hover:bg-victory-lime/90"
                    : "bg-victory-card border-2 border-victory-lime text-victory-lime hover:bg-victory-lime/10"
                }`}
                aria-label={isPaused ? tx("ui.trainPage.resume", "Resume") : tx("ui.trainPage.pause", "Pause")}
              >
                {isPaused ? <Play className="w-9 h-9" /> : <Pause className="w-9 h-9" />}
              </button>

              {/* End session — danger */}
              <FirstUseTip id="train_end_btn" position="top" hold={!isPaused && !isResting}>
                <button
                  onClick={endTimer}
                  className="w-14 h-14 rounded-full bg-victory-card border border-victory-danger/40 flex items-center justify-center text-victory-danger hover:bg-victory-danger/10 touch-target transition-all active:scale-90"
                  aria-label={tx("ui.trainPage.endSession", "End session")}
                >
                  <Square className="w-6 h-6" />
                </button>
              </FirstUseTip>
            </div>

            {/* Reset */}
            <button onClick={resetTimer} className="mt-6 touch-target flex items-center justify-center text-victory-muted text-xs hover:text-victory-text transition-colors tracking-wide">
              {tx("ui.trainPage.backToSetup", "← Back to setup")}
            </button>
          </div>
        </div>
      )}

      {isConfiguring && <BottomNav />}
    </div>
  );
}
