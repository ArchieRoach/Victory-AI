// Spoken coaching (combo calls, Live Coach cues, round feedback).
// Lines play as natural voice clips made once on the server (/voice/clips, reasoning next to it
// in backend/server.py). Until a line's clip exists, the phone's own voice says it and the clip
// is fetched for next time.
// iPhone Safari stays silent unless audio is started inside a tap. unlockSpeech() runs on the
// Start tap: it asks for the "playback" audio session (so calls play like music, through the
// silent switch), starts the one audio player every clip uses, and speaks an empty line so
// every later fallback is allowed.

const SILENT = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
const BATCH = 60;

let unlocked = false;
let player = null;
let source = null;
let queue = [];
const clips = new Map();
const pending = new Set();

// Anyone can listen for when the coach starts and stops talking (the session orb glows with it).
const listeners = new Set();
function speaking(on) {
  listeners.forEach((fn) => { try { fn(on); } catch {} });
}
export function onSpeaking(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// The training screen listens for voice problems mid-round (a clip the phone refused to play,
// a broken clip), so a silent coach can be traced instead of guessed at.
const problemListeners = new Set();
function voiceProblem(what) {
  problemListeners.forEach((fn) => { try { fn(what); } catch {} });
}
export function onVoiceProblem(fn) {
  problemListeners.add(fn);
  return () => problemListeners.delete(fn);
}

// TrainPage hands in the call to the server, so this file stays free of app imports.
export function setVoiceSource(fn) {
  source = fn;
}

const inflight = new Set();

// Waits (up to `ms`) for clips already being made, so the round can start once the coach's
// lines are ready instead of the first calls coming out in the phone's voice.
export async function waitForVoice(ms = 10000) {
  if (!inflight.size) return;
  await Promise.race([Promise.allSettled([...inflight]), new Promise((r) => setTimeout(r, ms))]);
}

export function primeVoice(texts) {
  const want = [...new Set((texts || []).filter((t) => t && !clips.has(t) && !pending.has(t)))];
  if (!want.length || !source) return Promise.resolve();
  const job = fetchClips(want);
  inflight.add(job);
  job.finally(() => inflight.delete(job));
  return job;
}

async function fetchClips(want) {
  want.forEach((t) => pending.add(t));
  try {
    for (let i = 0; i < want.length; i += BATCH) {
      const data = await source(want.slice(i, i + BATCH));
      await Promise.all(Object.entries(data?.clips || {}).map(async ([text, url]) => {
        try {
          const blob = await (await fetch(url)).blob();
          clips.set(text, URL.createObjectURL(blob));
        } catch {
          clips.set(text, url);
        }
      }));
    }
  } catch {
  } finally {
    want.forEach((t) => pending.delete(t));
  }
}

export function hasClip(text) {
  return clips.has(text);
}

// The saved natural-voice clip for a line (a local blob URL), for laying calls over a share clip.
export const clipFor = (text) => clips.get(text) || null;

export function unlockSpeech() {
  try {
    if (navigator.audioSession) navigator.audioSession.type = "playback";
  } catch {}
  try {
    if (!player && typeof Audio !== "undefined") {
      player = new Audio();
      player.addEventListener("ended", playNext);
      player.addEventListener("playing", () => { if (player.src !== SILENT) speaking(true); });
      player.addEventListener("ended", () => { if (!queue.length) speaking(false); });
      player.addEventListener("pause", () => speaking(false));
      player.addEventListener("error", () => voiceProblem(`clip failed to load (${player.error?.code || "?"})`));
      player.src = SILENT;
      player.play().catch(() => {});
    }
  } catch {}
  try {
    const synth = window.speechSynthesis;
    if (!synth || unlocked) return;
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    synth.speak(u);
    unlocked = true;
  } catch {}
}

function playNext() {
  const next = queue.shift();
  if (next) playClip(next.text, next.rate);
}

function playClip(text, rate) {
  lastSource = "natural";
  try {
    player.src = clips.get(text);
    player.playbackRate = rate > 1 ? 1.08 : 1;
    player.play().catch((e) => { voiceProblem(`phone refused to play a clip (${e?.name || "error"})`); speakFallback(text, rate); });
  } catch {
    speakFallback(text, rate);
  }
}

// The deepest natural-sounding voice the phone has: downloaded "Enhanced"/"Premium" voices
// first, then known deeper English voices, pitched slightly down.
const DEEP_VOICES = /Daniel|Arthur|Oliver|Aaron|Evan|Tom|Alex|Fred|Rishi|Gordon/i;

export function pickFallbackVoice(voices) {
  const english = (voices || []).filter((v) => /^en/i.test(v.lang));
  const score = (v) => (/premium|enhanced|neural|natural/i.test(v.name) ? 4 : 0)
    + (DEEP_VOICES.test(v.name) ? 2 : 0) + (/en-GB/i.test(v.lang) ? 1 : 0);
  return english.sort((a, b) => score(b) - score(a))[0] || null;
}

// Which voice said the last line: "natural" (a server clip) or "phone" (the phone's own voice).
let lastSource = null;
export const lastVoiceSource = () => lastSource;

// iPhone Safari silently drops a line spoken straight after cancel(), so after an interruption
// the phone voice waits a moment before speaking.
let cancelledAt = 0;

function speakFallback(text, rate) {
  const wait = Math.max(0, 120 - (Date.now() - cancelledAt));
  if (wait > 0) { setTimeout(() => speakFallback(text, rate), wait); return; }
  lastSource = "phone";
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    if (synth.paused) synth.resume();
    const u = new SpeechSynthesisUtterance(text);
    const voice = pickFallbackVoice(synth.getVoices?.());
    if (voice) u.voice = voice;
    u.rate = rate;
    u.pitch = 0.85;
    u.volume = 1;
    u.onstart = () => speaking(true);
    u.onend = () => speaking(false);
    u.onerror = () => speaking(false);
    synth.speak(u);
  } catch {}
}

export function say(text, { rate = 1.05, interrupt = false } = {}) {
  if (!text) return;
  if (interrupt) {
    queue = [];
    try {
      if (window.speechSynthesis?.speaking || window.speechSynthesis?.pending) {
        window.speechSynthesis.cancel();
        cancelledAt = Date.now();
      }
    } catch {}
  }
  if (player && clips.has(text)) {
    if (!interrupt && !player.paused && !player.ended && player.src !== SILENT) {
      queue.push({ text, rate });
      return;
    }
    playClip(text, rate);
    return;
  }
  if (interrupt && player) {
    try { player.pause(); } catch {}
  }
  speakFallback(text, rate);
  primeVoice([text]);
}

// For lines that aren't timed to the round (feedback between rounds): wait briefly for the
// natural clip rather than reading it in the phone's voice.
// Natural clips are made one short line at a time (the server takes up to 160 letters), so a long
// line is split into sentences, each made naturally and played one after another.
export function splitForVoice(text, max = 150) {
  const out = [];
  for (const sentence of String(text || "").match(/[^.!?]+[.!?]*/g) || []) {
    let s = sentence.trim();
    while (s.length > max) {
      const cut = s.lastIndexOf(" ", max) > 40 ? s.lastIndexOf(" ", max) : max;
      out.push(s.slice(0, cut).trim());
      s = s.slice(cut).trim();
    }
    if (s) out.push(s);
  }
  return out;
}

export async function sayNatural(text, waitMs = 6000) {
  const parts = splitForVoice(text);
  if (!parts.length) return;
  if (parts.some((p) => !clips.has(p))) {
    await Promise.race([primeVoice(parts), new Promise((r) => setTimeout(r, waitMs))]);
  }
  parts.forEach((p) => say(p));
}

export const _resetSpeech = () => {
  unlocked = false;
  player = null;
  cancelledAt = 0;
  lastSource = null;
  queue = [];
  clips.clear();
  pending.clear();
  inflight.clear();
};
