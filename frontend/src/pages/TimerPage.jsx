import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import {
  Timer, Play, Pause, SkipForward, Square, Plus, Minus, Trash2, Video, VideoOff, Volume2, VolumeX,
  Pencil, X, RefreshCw, Download, Flame,
} from "lucide-react";
import { API } from "@/App";
import { BottomNav } from "@/components/BottomNav";
import { BottomSheet } from "@/components/BottomSheet";
import { ToggleRow } from "@/components/ToggleRow";
import { analytics } from "@/lib/analytics";
import { nativeRound } from "@/lib/nativeBridge";
import { unlockSpeech, setVoiceSource, primeVoice, say } from "@/lib/speech";
import { unlockTimerSounds, playTimerSound } from "@/lib/timerSounds";
import { streakLine } from "@/lib/streakCard";
import {
  buildTimeline, positionAt, cuesBetween, totalSeconds, clock, describe, spokenLine, allSpokenLines, newPreset,
} from "@/lib/workoutTimer";

// The workout timer (reasoning in backend/workouts.py): saved round and circuit workouts, with the
// clock, bells, voice and camera all on one screen, so nobody has to swap between a timer app and
// the camera mid-session.

const FILM_KEY = "victory_timer_film";
const FACING_KEY = "victory_timer_facing";
const VOICE_KEY = "victory_timer_voice";
const readPref = (key, fallback) => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } };
const writePref = (key, v) => { try { localStorage.setItem(key, v); } catch {} };

function Stepper({ label, value, onChange, min, max, step, format = (v) => v, testId }) {
  const set = (v) => onChange(Math.max(min, Math.min(max, v)));
  return (
    <div className="flex items-center justify-between gap-3 py-1" data-testid={testId}>
      <span className="text-victory-text text-sm">{label}</span>
      <div className="flex items-center gap-2">
        <button type="button" className="w-11 h-11 rounded-full bg-victory-card-highlight flex items-center justify-center disabled:opacity-40"
          onClick={() => set(value - step)} disabled={value <= min} aria-label={`Less ${label.toLowerCase()}`}>
          <Minus className="w-4 h-4 text-victory-text" />
        </button>
        <span className="font-mono text-victory-lime text-lg w-16 text-center">{format(value)}</span>
        <button type="button" className="w-11 h-11 rounded-full bg-victory-card-highlight flex items-center justify-center disabled:opacity-40"
          onClick={() => set(value + step)} disabled={value >= max} aria-label={`More ${label.toLowerCase()}`}>
          <Plus className="w-4 h-4 text-victory-text" />
        </button>
      </div>
    </div>
  );
}

const secs = (v) => (v === 0 ? "Off" : clock(v));
const durStep = (v) => (v >= 120 ? 30 : v >= 60 ? 15 : 5);

function Editor({ draft: initial, types, onSave, onDelete, onClose }) {
  const [d, setD] = useState(initial);
  const set = (k) => (v) => setD((x) => ({ ...x, [k]: v }));
  const stationsOn = d.stations.length > 0 || d.type === "circuit";
  const setStation = (i, patch) => setD((x) => ({ ...x, stations: x.stations.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));

  return (
    <BottomSheet onClose={onClose} label={d.id ? "Edit workout" : "New workout"} className="w-full max-w-lg mx-auto" testId="timer-editor">
      {({ close }) => (
        <div className="overflow-y-auto min-h-0 flex-1 px-4 pb-6 space-y-4">
          <div className="flex items-center justify-between pt-2">
            <h2 className="font-heading font-extrabold text-victory-text text-lg">{d.id ? "Edit workout" : "New workout"}</h2>
            <button className="w-11 h-11 rounded-full flex items-center justify-center" onClick={() => close()} aria-label="Close">
              <X className="w-5 h-5 text-victory-muted" />
            </button>
          </div>
          <div>
            <label className="victory-label" htmlFor="workout-name">Name</label>
            <input id="workout-name" className="victory-input" maxLength={40} placeholder="Monday bag session"
              value={d.name} onChange={(e) => set("name")(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Workout type">
            {Object.entries(types).map(([k, label]) => (
              <button key={k} type="button" aria-pressed={d.type === k}
                onClick={() => setD((x) => (k === "circuit" && !x.stations.length
                  ? { ...x, type: k, stations: newPreset("circuit").stations, station_rest_s: 20 }
                  : { ...x, type: k }))}
                className={`filter-pill ${d.type === k ? "filter-pill-active" : "filter-pill-inactive"}`}>{label}</button>
            ))}
          </div>

          <section className="victory-card p-4">
            <Stepper label="Warm up" value={d.warmup_s} onChange={set("warmup_s")} min={0} max={600} step={5} format={secs} />
            <Stepper label={stationsOn ? "Sets" : "Rounds"} value={d.rounds} onChange={set("rounds")} min={1} max={50} step={1} testId="timer-rounds" />
            {!stationsOn && <Stepper label="Round time" value={d.round_s} onChange={set("round_s")} min={5} max={3600} step={durStep(d.round_s)} format={clock} />}
            <Stepper label={stationsOn ? "Rest between sets" : "Rest"} value={d.rest_s} onChange={set("rest_s")} min={0} max={1800} step={durStep(d.rest_s)} format={secs} />
          </section>

          {stationsOn && (
            <section className="victory-card p-4 space-y-2" data-testid="timer-stations">
              <p className="section-label">Exercises, in order</p>
              {d.stations.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input className="victory-input flex-1" maxLength={40} value={s.name} aria-label={`Exercise ${i + 1}`}
                    onChange={(e) => setStation(i, { name: e.target.value })} />
                  <button type="button" className="w-11 h-11 rounded-full bg-victory-card-highlight flex items-center justify-center"
                    onClick={() => setStation(i, { seconds: Math.max(5, s.seconds - 5) })} aria-label={`Shorter ${s.name}`}>
                    <Minus className="w-4 h-4 text-victory-text" />
                  </button>
                  <span className="font-mono text-victory-lime w-12 text-center">{clock(s.seconds)}</span>
                  <button type="button" className="w-11 h-11 rounded-full bg-victory-card-highlight flex items-center justify-center"
                    onClick={() => setStation(i, { seconds: Math.min(3600, s.seconds + 5) })} aria-label={`Longer ${s.name}`}>
                    <Plus className="w-4 h-4 text-victory-text" />
                  </button>
                  <button type="button" className="w-11 h-11 rounded-full flex items-center justify-center"
                    onClick={() => setD((x) => ({ ...x, stations: x.stations.filter((_, j) => j !== i) }))} aria-label={`Remove ${s.name}`}>
                    <Trash2 className="w-4 h-4 text-victory-muted" />
                  </button>
                </div>
              ))}
              {d.stations.length < 20 && (
                <button type="button" className="victory-btn-ghost w-full flex items-center justify-center gap-2"
                  onClick={() => setD((x) => ({ ...x, stations: [...x.stations, { name: "Exercise", seconds: 40 }] }))}>
                  <Plus className="w-4 h-4" /> Add exercise
                </button>
              )}
              <Stepper label="Rest between exercises" value={d.station_rest_s} onChange={set("station_rest_s")} min={0} max={600} step={5} format={secs} />
            </section>
          )}

          <section className="victory-card p-4">
            <p className="section-label">Alerts</p>
            <Stepper label="Round end warning" value={d.round_warning_s} onChange={set("round_warning_s")} min={0} max={60} step={5} format={secs} />
            <Stepper label="Rest end warning" value={d.rest_warning_s} onChange={set("rest_warning_s")} min={0} max={60} step={5} format={secs} />
            <Stepper label="Whistle every" value={d.inner_alert_s} onChange={set("inner_alert_s")} min={0} max={600} step={d.inner_alert_s >= 60 ? 30 : 5} format={secs} />
          </section>

          <p className="text-victory-muted text-xs">Total: {clock(totalSeconds(buildTimeline(d)))}</p>
          <button className="victory-btn-primary" disabled={!d.name.trim() || (stationsOn && !d.stations.length)}
            onClick={async () => { if (await onSave(d)) close(); }}>Save workout</button>
          {d.id && !d.builtin && (
            <button className="victory-btn-ghost w-full" onClick={async () => { if (await onDelete(d)) close(); }}>Delete workout</button>
          )}
        </div>
      )}
    </BottomSheet>
  );
}

function StartSheet({ preset, onStart, onEdit, onClose }) {
  const [film, setFilm] = useState(readPref(FILM_KEY, "1") === "1");
  const [facing, setFacing] = useState(readPref(FACING_KEY, "user"));
  const [voice, setVoice] = useState(readPref(VOICE_KEY, "1") === "1");
  return (
    <BottomSheet onClose={onClose} label={preset.name} className="w-full max-w-lg mx-auto" testId="timer-start">
      {({ close }) => (
        <div className="px-4 pb-6 space-y-3">
          <div className="flex items-start justify-between pt-2">
            <div>
              <h2 className="font-heading font-extrabold text-victory-text text-lg">{preset.name}</h2>
              <p className="text-victory-muted text-sm">{describe(preset)} · {clock(totalSeconds(buildTimeline(preset)))} total</p>
            </div>
            <button className="w-11 h-11 rounded-full flex items-center justify-center" onClick={() => { close(); onEdit(preset); }} aria-label="Edit workout">
              <Pencil className="w-4 h-4 text-victory-muted" />
            </button>
          </div>
          <div className="victory-card p-4 space-y-2">
            <ToggleRow on={film} iconOn={Video} iconOff={VideoOff} title="Film it"
              onToggle={(v) => { setFilm(v); writePref(FILM_KEY, v ? "1" : "0"); }}
              description="The timer runs over the camera, so you see and hear every bell while you record." />
            {film && (
              <div className="grid grid-cols-2 gap-2" role="group" aria-label="Camera">
                {[["user", "Front camera"], ["environment", "Back camera"]].map(([k, label]) => (
                  <button key={k} type="button" aria-pressed={facing === k} onClick={() => { setFacing(k); writePref(FACING_KEY, k); }}
                    className={`filter-pill min-h-[44px] ${facing === k ? "filter-pill-active" : "filter-pill-inactive"}`}>{label}</button>
                ))}
              </div>
            )}
            <ToggleRow on={voice} iconOn={Volume2} iconOff={VolumeX} title="Coach's voice"
              onToggle={(v) => { setVoice(v); writePref(VOICE_KEY, v ? "1" : "0"); }}
              description="Calls each round, exercise and rest, as well as the bells." />
          </div>
          <button className="victory-btn-primary flex items-center justify-center gap-2" data-testid="timer-go"
            onClick={() => { unlockTimerSounds(); unlockSpeech(); onStart({ preset, film, facing, voice }); }}>
            <Play className="w-5 h-5" /> Start
          </button>
        </div>
      )}
    </BottomSheet>
  );
}

function pickRecorderType() {
  const types = ["video/mp4", "video/webm;codecs=vp9", "video/webm"];
  return types.find((t) => window.MediaRecorder?.isTypeSupported?.(t)) || "";
}

function Runner({ run, onExit }) {
  const { preset, film, facing, voice } = run;
  const timeline = useMemo(() => buildTimeline(preset), [preset]);
  const total = totalSeconds(timeline);
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [voiceOn, setVoiceOn] = useState(voice);
  const [cameraOk, setCameraOk] = useState(false);
  const [result, setResult] = useState(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const clockRef = useRef({ base: performance.now(), offset: 0, pausedAt: null, last: 0 });
  const voiceRef = useRef(voiceOn);
  voiceRef.current = voiceOn;
  const finishedRef = useRef(false);

  // Camera and recording.
  useEffect(() => {
    if (!film) return undefined;
    let cancelled = false;
    (async () => {
      let stream = null;
      for (const audio of [true, false]) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio });
          break;
        } catch {}
      }
      if (cancelled || !stream) {
        stream?.getTracks().forEach((t) => t.stop());
        if (!stream) toast.error("Couldn't open the camera. The timer still runs.");
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraOk(true);
      try {
        const type = pickRecorderType();
        const rec = type ? new MediaRecorder(stream, { mimeType: type }) : new MediaRecorder(stream);
        rec.ondataavailable = (e) => { if (e.data?.size) chunksRef.current.push(e.data); };
        rec.start(1000);
        recorderRef.current = rec;
      } catch {
        toast.error("This phone can't record here. The timer still runs.");
      }
    })();
    return () => {
      cancelled = true;
      try { if (recorderRef.current?.state === "recording") recorderRef.current.stop(); } catch {}
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [film, facing]);

  // Keep the screen awake for the whole workout.
  useEffect(() => {
    let lock = null;
    navigator.wakeLock?.request?.("screen").then((l) => { lock = l; }).catch(() => {});
    return () => { lock?.release?.().catch?.(() => {}); };
  }, []);

  const stopRecording = useCallback(() => new Promise((resolve) => {
    const rec = recorderRef.current;
    if (!rec || rec.state !== "recording") { resolve(null); return; }
    rec.onstop = () => resolve(new Blob(chunksRef.current, { type: rec.mimeType || "video/mp4" }));
    try { rec.stop(); } catch { resolve(null); }
  }), []);

  const finish = useCallback(async (endedAt) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    nativeRound("end");
    const trained = Math.max(0, Math.floor(endedAt) - (preset.warmup_s || 0));
    const roundsDone = timeline.filter((s) => s.kind === "work" && s.start + s.seconds <= endedAt).length;
    const blob = await stopRecording();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    let streak = null;
    let logged = false;
    try {
      const { data } = await axios.post(`${API}/workouts/complete`, { name: preset.name, type: preset.type, seconds_trained: trained, rounds_done: roundsDone });
      streak = data.streak;
      logged = data.logged;
    } catch {}
    analytics.capture("workout_finished", { type: preset.type, seconds: trained, filmed: !!blob, complete: endedAt >= total });
    setResult({ trained, roundsDone, blob, streak, logged, complete: endedAt >= total });
  }, [preset, timeline, total, stopRecording]);

  // The clock. Time comes from performance.now, so a slow frame never drifts it.
  useEffect(() => {
    if (result) return undefined;
    const id = setInterval(() => {
      const c = clockRef.current;
      if (c.pausedAt != null) return;
      const now = (performance.now() - c.base) / 1000 + c.offset;
      const whole = Math.floor(now);
      if (whole > c.last) {
        for (const cue of cuesBetween(timeline, preset, c.last, whole)) {
          if (cue.type !== "rest") playTimerSound(cue.type);
          const line = voiceRef.current ? spokenLine(cue, preset, timeline) : null;
          if (line) setTimeout(() => say(line, { interrupt: true }), cue.type === "start" || cue.type === "done" ? 900 : 0);
          if (cue.type === "done") finish(total);
        }
        c.last = whole;
      }
      setElapsed(Math.min(now, total));
    }, 200);
    return () => clearInterval(id);
  }, [timeline, preset, total, finish, result]);

  const pos = positionAt(timeline, elapsed);
  const seg = pos.seg;

  // Lock Screen and Dynamic Island show the same clock in the App Store app.
  useEffect(() => {
    if (!seg || result) return;
    nativeRound(paused ? "pause" : "update", {
      round: Math.max(1, seg.round), total: preset.rounds, resting: seg.kind !== "work",
      ends_at: Date.now() + pos.left * 1000, seconds_left: Math.ceil(pos.left),
    });
    // Sent when the segment or pause state changes; the native clock counts down itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos.index, paused, result]);

  const togglePause = () => {
    const c = clockRef.current;
    if (c.pausedAt == null) {
      c.pausedAt = performance.now();
      setPaused(true);
    } else {
      c.base += performance.now() - c.pausedAt;
      c.pausedAt = null;
      setPaused(false);
    }
  };

  const skip = () => {
    if (!seg) return;
    const c = clockRef.current;
    const target = seg.start + seg.seconds;
    const now = c.pausedAt != null ? (c.pausedAt - c.base) / 1000 + c.offset : (performance.now() - c.base) / 1000 + c.offset;
    c.offset += target - now;
    c.last = Math.floor(target) - 1;
    setElapsed(target);
  };

  const saveVideo = async () => {
    const blob = result?.blob;
    if (!blob) return;
    const ext = blob.type.includes("mp4") ? "mp4" : "webm";
    const file = new File([blob], `victory-${preset.type}-${new Date().toISOString().slice(0, 10)}.${ext}`, { type: blob.type });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: preset.name });
        return;
      }
    } catch (e) {
      if (e?.name === "AbortError") return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  if (result) {
    const line = streakLine(result.streak);
    return (
      <div className="fixed inset-0 z-50 bg-victory-bg flex flex-col items-center justify-center p-6 text-center" data-testid="timer-done">
        <p className="section-label">{result.complete ? "Workout done" : "Stopped early"}</p>
        <h1 className="font-heading font-extrabold text-victory-text text-3xl mt-2">{preset.name}</h1>
        <p className="font-mono text-victory-lime text-5xl mt-4">{clock(result.trained)}</p>
        <p className="text-victory-muted text-sm mt-1">trained · {result.roundsDone} {preset.stations?.length ? "exercise" : "round"}{result.roundsDone === 1 ? "" : "s"}</p>
        {result.logged && line && (
          <p className="text-victory-text text-sm mt-4 flex items-center gap-1.5"><Flame className="w-4 h-4 text-victory-orange" /> {line.text}</p>
        )}
        {!result.logged && <p className="text-victory-muted text-xs mt-4">Under a minute, so it isn't saved to your week.</p>}
        <div className="w-full max-w-sm space-y-2 mt-8">
          {result.blob && (
            <button className="victory-btn-secondary w-full flex items-center justify-center gap-2" onClick={saveVideo} data-testid="timer-save-video">
              <Download className="w-4 h-4" /> Save the video
            </button>
          )}
          <button className="victory-btn-primary" onClick={onExit}>Done</button>
        </div>
      </div>
    );
  }

  const filming = film && cameraOk;
  const warning = seg && ((seg.kind === "work" && preset.round_warning_s && pos.left <= preset.round_warning_s)
    || (seg.kind === "rest" && preset.rest_warning_s && pos.left <= preset.rest_warning_s));
  const tone = !seg ? "text-victory-text" : warning ? "text-victory-orange" : seg.kind === "work" ? "text-victory-lime" : seg.kind === "rest" ? "text-victory-teal" : "text-victory-text";
  const circuit = (preset.stations?.length || 0) > 0;
  const where = !seg ? "" : seg.kind === "warmup" ? "Get ready"
    : seg.station ? `Set ${seg.round} of ${preset.rounds} · Exercise ${seg.station} of ${preset.stations.length}`
      : circuit ? `Set ${seg.round} of ${preset.rounds}` : `Round ${seg.round} of ${preset.rounds}`;
  const fg = filming ? "text-white" : "text-victory-text";
  const ghost = filming ? "bg-black/30 border-white/20" : "bg-victory-card-highlight border-victory-border";
  const sub = filming ? "text-white/75" : "text-victory-muted";

  return (
    <div className="fixed inset-0 z-50 bg-victory-bg flex flex-col" data-testid="timer-run">
      {film && (
        <video ref={videoRef} autoPlay playsInline muted
          className={`absolute inset-0 w-full h-full object-cover ${facing === "user" ? "-scale-x-100" : ""} ${cameraOk ? "" : "hidden"}`} />
      )}
      {filming && <div className="absolute inset-0 bg-black/45" aria-hidden="true" />}

      <div className="relative flex-1 flex flex-col items-center justify-center px-6 text-center" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        {filming && <p className="absolute top-[max(1rem,env(safe-area-inset-top))] left-4 flex items-center gap-1.5 text-white text-xs font-semibold"><span className="w-2 h-2 rounded-full bg-victory-danger animate-pulse" /> REC</p>}
        <p className={`text-sm font-semibold uppercase tracking-wide ${sub}`}>{where}</p>
        <p className={`font-heading font-extrabold text-2xl mt-1 ${fg}`}>{seg ? seg.label : "Done"}</p>
        <p className={`font-mono font-bold leading-none mt-3 tabular-nums ${tone} ${warning ? "animate-pulse" : ""}`}
          style={{ fontSize: "min(34vw, 11rem)" }} aria-live="off" data-testid="timer-clock">{clock(pos.left)}</p>
        {seg?.next && seg.kind !== "work" && <p className={`text-lg mt-3 ${fg}`}>Next: <span className="font-semibold">{seg.next}</span></p>}
        {seg?.kind === "work" && seg.next && seg.station && <p className={`text-sm mt-3 ${sub}`}>Then: {seg.next}</p>}
        {paused && <p className="text-victory-orange font-semibold mt-4">Paused</p>}
      </div>

      <div className="relative px-6 pb-8 safe-bottom">
        <div className={`h-1.5 rounded-full overflow-hidden mb-6 ${filming ? "bg-white/15" : "bg-victory-card-highlight"}`} aria-hidden="true">
          <div className="h-full bg-victory-lime" style={{ width: `${(elapsed / total) * 100}%` }} />
        </div>
        <div className="flex items-center justify-center gap-5">
          <button className={`w-14 h-14 rounded-full border flex items-center justify-center ${ghost}`} aria-label="Stop workout"
            onClick={() => finish(elapsed)} data-testid="timer-stop">
            <Square className={`w-5 h-5 ${fg}`} />
          </button>
          <button className="w-20 h-20 rounded-full bg-victory-lime flex items-center justify-center" aria-label={paused ? "Resume" : "Pause"}
            onClick={togglePause} data-testid="timer-pause">
            {paused ? <Play className="w-8 h-8 text-victory-bg" /> : <Pause className="w-8 h-8 text-victory-bg" />}
          </button>
          <button className={`w-14 h-14 rounded-full border flex items-center justify-center ${ghost}`} aria-label="Skip to next"
            onClick={skip} data-testid="timer-skip">
            <SkipForward className={`w-5 h-5 ${fg}`} />
          </button>
        </div>
        <div className="flex justify-center mt-4">
          <button className={`min-h-[44px] px-3 text-xs flex items-center gap-1.5 ${sub}`} onClick={() => setVoiceOn((v) => !v)} aria-pressed={voiceOn}>
            {voiceOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />} Coach's voice {voiceOn ? "on" : "off"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TimerPage() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(null);
  const [starting, setStarting] = useState(null);
  const [run, setRun] = useState(null);

  useEffect(() => {
    axios.get(`${API}/workouts/presets`).then((r) => setData(r.data)).catch(() => setData(false));
    setVoiceSource((texts) => axios.post(`${API}/voice/clips`, { texts }).then((r) => r.data));
  }, []);

  const mine = (data?.presets || []).filter((p) => !p.builtin);

  const savePresets = async (list) => {
    try {
      const { data: out } = await axios.put(`${API}/workouts/presets`, { presets: list });
      setData(out);
      return out;
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Couldn't save that");
      return null;
    }
  };

  const onSave = async (d) => {
    const clean = { ...d, name: d.name.trim(), stations: d.stations.filter((s) => s.name.trim()) };
    const list = d.id && !d.builtin ? mine.map((p) => (p.id === d.id ? clean : p)) : [{ ...clean, id: null }, ...mine];
    const out = await savePresets(list);
    if (out) toast.success(`Saved ${clean.name}`);
    return !!out;
  };

  const onDelete = async (d) => !!(await savePresets(mine.filter((p) => p.id !== d.id)));

  const begin = (r) => {
    setStarting(null);
    primeVoice(allSpokenLines(r.preset));
    analytics.capture("workout_started", { type: r.preset.type, filmed: r.film, builtin: !!r.preset.builtin });
    setRun(r);
  };

  if (run) return <Runner run={run} onExit={() => { setRun(null); navigate("/timer", { replace: true }); }} />;

  return (
    <div className="min-h-screen bg-victory-bg pb-nav">
      <div className="sticky top-0 z-20 material-header">
        <header className="p-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-heading font-extrabold text-victory-text">Timer</h1>
            <p className="text-victory-muted text-sm">Bag, pads, circuits, HIIT. Film it on the same screen.</p>
          </div>
          <button className="w-11 h-11 rounded-full bg-victory-lime/10 border border-victory-lime/20 flex items-center justify-center"
            onClick={() => setEditing(newPreset("bag"))} aria-label="New workout" data-testid="timer-new">
            <Plus className="w-5 h-5 text-victory-lime" />
          </button>
        </header>
      </div>

      <main className="max-w-lg mx-auto px-4 py-4 space-y-3">
        {data === null && [0, 1, 2].map((i) => <div key={i} className="skeleton-shimmer h-16 rounded-lg" />)}
        {data === false && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-victory-lime/10 border border-victory-lime/20 flex items-center justify-center mb-4">
              <Timer className="w-8 h-8 text-victory-lime/60" />
            </div>
            <p className="text-victory-text font-bold text-lg mb-1">Couldn't load your workouts</p>
            <button className="victory-btn-ghost mt-3" onClick={() => window.location.reload()}><RefreshCw className="w-4 h-4 inline mr-1" /> Try again</button>
          </div>
        )}
        {data && (
          <>
            {mine.length > 0 && <p className="section-label">Your workouts</p>}
            {mine.map((p) => <PresetCard key={p.id} p={p} types={data.types} onOpen={() => setStarting(p)} />)}
            <p className="section-label pt-2">Ready to go</p>
            {data.presets.filter((p) => p.builtin).map((p) => <PresetCard key={p.id} p={p} types={data.types} onOpen={() => setStarting(p)} />)}
          </>
        )}
      </main>

      {starting && <StartSheet preset={starting} onClose={() => setStarting(null)} onStart={begin}
        onEdit={(p) => setEditing(p.builtin ? { ...p, id: null, builtin: false, name: `My ${p.name.toLowerCase()}` } : p)} />}
      {editing && data && <Editor draft={editing} types={data.types} onSave={onSave} onDelete={onDelete} onClose={() => setEditing(null)} />}
      <BottomNav />
    </div>
  );
}

function PresetCard({ p, types, onOpen }) {
  return (
    <button className="victory-card p-4 w-full flex items-center gap-3 text-left active:scale-[0.99] transition-transform" onClick={onOpen} data-testid="timer-preset">
      <div className="w-11 h-11 rounded-2xl bg-victory-lime/10 border border-victory-lime/20 flex items-center justify-center flex-shrink-0">
        <Timer className="w-5 h-5 text-victory-lime" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-victory-text font-semibold truncate">{p.name}</p>
        <p className="text-victory-muted text-xs">{types[p.type]} · {describe(p)}</p>
      </div>
      <Play className="w-5 h-5 text-victory-muted" />
    </button>
  );
}
