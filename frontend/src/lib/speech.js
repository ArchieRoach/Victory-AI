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

// TrainPage hands in the call to the server, so this file stays free of app imports.
export function setVoiceSource(fn) {
  source = fn;
}

export async function primeVoice(texts) {
  const want = [...new Set((texts || []).filter((t) => t && !clips.has(t) && !pending.has(t)))];
  if (!want.length || !source) return;
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

export function unlockSpeech() {
  try {
    if (navigator.audioSession) navigator.audioSession.type = "playback";
  } catch {}
  try {
    if (!player && typeof Audio !== "undefined") {
      player = new Audio();
      player.addEventListener("ended", playNext);
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
  try {
    player.src = clips.get(text);
    player.playbackRate = rate > 1 ? 1.08 : 1;
    player.play().catch(() => speakFallback(text, rate));
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

function speakFallback(text, rate) {
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
    synth.speak(u);
  } catch {}
}

export function say(text, { rate = 1.05, interrupt = false } = {}) {
  if (!text) return;
  if (interrupt) {
    queue = [];
    try { window.speechSynthesis?.cancel(); } catch {}
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
export async function sayNatural(text, waitMs = 6000) {
  if (!text) return;
  if (!clips.has(text)) {
    await Promise.race([primeVoice([text]), new Promise((r) => setTimeout(r, waitMs))]);
  }
  say(text);
}

export const _resetSpeech = () => {
  unlocked = false;
  player = null;
  queue = [];
  clips.clear();
  pending.clear();
};
