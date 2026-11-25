// Timer sounds: a recorded boxing ring bell and wooden clapper for "10 seconds" (public/sounds,
// CC0), and a whistle for interval alerts. The bell files are tiny and load on the
// Start tap; until they arrive (or on a dead signal) a bell made in the browser stands in.
// unlockTimerSounds() must run inside the Start tap, or iPhone Safari keeps them silent.

let ctx = null;
const BELL_FILES = { start: "/sounds/bell-start.mp3", end: "/sounds/bell-end.mp3", warning: "/sounds/clapper.mp3" };
const bells = {};

function loadBells() {
  Object.entries(BELL_FILES).forEach(([key, url]) => {
    if (bells[key]) return;
    bells[key] = "loading";
    fetch(url)
      .then((r) => r.arrayBuffer())
      .then((data) => new Promise((ok, fail) => ctx.decodeAudioData(data, ok, fail)))
      .then((buffer) => { bells[key] = buffer; })
      .catch(() => { delete bells[key]; });
  });
}

function playBuffer(buffer, at) {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(ctx.destination);
  src.start(at);
}

function bell(key, at, fallback) {
  const buffer = bells[key];
  if (buffer && buffer !== "loading") playBuffer(buffer, at);
  else fallback(at);
}

export function unlockTimerSounds() {
  try {
    if (navigator.audioSession) navigator.audioSession.type = "playback";
  } catch {}
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!ctx) ctx = new AC();
    if (ctx.state === "suspended") ctx.resume();
    loadBells();
  } catch {}
}

function tone(freq, start, length, gain, type = "sine") {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, start + length);
  osc.connect(g).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + length + 0.05);
}

function ring(at) {
  // A struck bell: a few out-of-tune partials that fade at different speeds.
  [[830, 0.5, 2.2], [1670, 0.22, 1.6], [2490, 0.12, 1.1], [3520, 0.06, 0.7]].forEach(([f, g, len]) => tone(f, at, len, g));
}

function clap(at) {
  const len = 0.06;
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * len), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 3;
  const src = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 1800;
  const g = ctx.createGain();
  g.gain.value = 1.4;
  src.buffer = buffer;
  src.connect(filter).connect(g).connect(ctx.destination);
  src.start(at);
}

function whistle(at) {
  const osc = ctx.createOscillator();
  const lfo = ctx.createOscillator();
  const depth = ctx.createGain();
  const g = ctx.createGain();
  osc.frequency.value = 2900;
  lfo.frequency.value = 28;
  depth.gain.value = 120;
  lfo.connect(depth).connect(osc.frequency);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(0.25, at + 0.02);
  g.gain.setValueAtTime(0.25, at + 0.35);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.45);
  osc.connect(g).connect(ctx.destination);
  [osc, lfo].forEach((o) => { o.start(at); o.stop(at + 0.5); });
}

const PLAYERS = {
  start: (t) => bell("start", t, ring),
  end: (t) => bell("end", t, (at) => [0, 0.45, 0.9].forEach((d) => ring(at + d))),
  done: (t) => bell("end", t, (at) => [0, 0.45, 0.9].forEach((d) => ring(at + d))),
  warning: (t) => bell("warning", t, (at) => [0, 0.18, 0.36].forEach((d) => clap(at + d))),
  inner: (t) => whistle(t),
};

export function playTimerSound(type) {
  try {
    if (!ctx || !PLAYERS[type]) return;
    if (ctx.state === "suspended") ctx.resume();
    PLAYERS[type](ctx.currentTime + 0.02);
  } catch {}
}
