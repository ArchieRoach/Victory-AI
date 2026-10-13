import { useCallback, useEffect, useRef, useState } from "react";
import { createTracker, createCueGate } from "@/lib/liveCoach";
import { say } from "@/lib/speech";

// Pinned so a library update can never change what counts as a punch mid-season.
const MEDIAPIPE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1";
const POSE_MODEL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

const CUES = { guard_drop: "Hands up", combo: "That's it" };

let landmarkerPromise = null;

function loadLandmarker() {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const { FilesetResolver, PoseLandmarker } = await import(/* webpackIgnore: true */ `${MEDIAPIPE}/vision_bundle.mjs`);
      const fileset = await FilesetResolver.forVisionTasks(`${MEDIAPIPE}/wasm`);
      const make = (delegate) => PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: POSE_MODEL, delegate },
        runningMode: "VIDEO",
        numPoses: 1,
      });
      try { return await make("GPU"); } catch { return make("CPU"); }
    })().catch((err) => { landmarkerPromise = null; throw err; });
  }
  return landmarkerPromise;
}

const nativeMotion = (action) => window.webkit?.messageHandlers?.victoryMotion?.postMessage({ action });

const speak = (text) => say(text);

// Watches the camera preview on the phone itself — no frame is uploaded — and counts
// punches, combos, guard drops and head movement while `running`.
// `cues` swaps the spoken lines (freestyle rounds only praise); `onEvent` lets the combo
// caller hear each punch as it lands.
export function useLiveCoach({ enabled, videoRef, running, voice, cues = CUES, onEvent }) {
  const [status, setStatus] = useState("off");
  const [stats, setStats] = useState(null);
  const [airpods, setAirpods] = useState(false);
  const trackerRef = useRef(createTracker());
  const runningRef = useRef(running);
  const voiceRef = useRef(voice);
  const cuesRef = useRef(cues);
  const onEventRef = useRef(onEvent);
  runningRef.current = running;
  voiceRef.current = voice;
  cuesRef.current = cues;
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!enabled) { setStatus("off"); return; }
    let cancelled = false;
    let frame = null;
    let landmarker = null;
    let activeMs = 0;
    let lastNow = null;
    let lastVideoTime = -1;
    let lastPublish = 0;
    const gate = createCueGate();

    setStatus("loading");
    loadLandmarker().then((lm) => {
      if (cancelled) return;
      landmarker = lm;
      setStatus("ready");
      const tick = () => {
        if (cancelled) return;
        const now = performance.now();
        if (runningRef.current && lastNow != null) activeMs += Math.min(now - lastNow, 100);
        lastNow = now;
        const video = videoRef.current;
        if (runningRef.current && video && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
          lastVideoTime = video.currentTime;
          try {
            const res = landmarker.detectForVideo(video, now);
            const events = trackerRef.current.update(res.landmarks?.[0], res.worldLandmarks?.[0], activeMs);
            for (const e of events) {
              onEventRef.current?.(e);
              const line = cuesRef.current?.[e];
              if (voiceRef.current && line && gate(e, activeMs)) speak(line);
            }
          } catch {}
          if (now - lastPublish > 250) {
            lastPublish = now;
            setStats(trackerRef.current.snapshot());
          }
        }
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }).catch(() => { if (!cancelled) setStatus("error"); });

    // In the App Store app, AirPods measure head movement directly.
    window.__victoryHeadMove = () => {
      if (!runningRef.current) return;
      trackerRef.current.addHeadMove();
      setAirpods(true);
    };
    setAirpods(false);
    Promise.resolve(nativeMotion("start")).catch(() => {});

    return () => {
      cancelled = true;
      if (frame) cancelAnimationFrame(frame);
      delete window.__victoryHeadMove;
      Promise.resolve(nativeMotion("stop")).catch(() => {});
    };
  }, [enabled, videoRef]);

  // Ends the current round's count and starts a fresh one for the next round.
  const takeRound = useCallback(() => {
    const snap = trackerRef.current.snapshot();
    trackerRef.current = createTracker();
    setStats(null);
    return snap;
  }, []);

  return { status, stats, airpods, takeRound };
}
