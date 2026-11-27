import { comboTokens } from "@/lib/comboCaller";
import { dark } from "@/theme/theme";

// "Share your round": a vertical 9:16 highlight cut from the round recording, ready for Reels and
// TikTok with no editing. The busiest stretch of the round (most punches), the combo called on
// screen, the punch count, the score on an end card, and the Victory AI mark in the corner.
// Sound: only the coach's clean calls, placed exactly when they were called. Training video is
// recorded without sound, so gym music and noise never reach the clip.

export const CLIP_W = 1080;
export const CLIP_H = 1920;
export const HIGHLIGHT_MS = 20000;
export const END_CARD_MS = 3000;
const CALL_SHOWN_MS = 2800;

// Start of the window with the most punches in it (ms from the start of the recording).
export function pickWindow(punches, durationMs, lenMs = HIGHLIGHT_MS) {
  const len = Math.min(lenMs, durationMs);
  const latest = Math.max(0, durationMs - len);
  const times = [...(punches || [])].sort((a, b) => a - b);
  let best = { start: 0, count: -1 };
  let j = 0;
  for (let i = 0; i <= times.length; i += 1) {
    const start = Math.min(latest, Math.max(0, i < times.length ? times[i] - 1000 : latest));
    while (j < times.length && times[j] < start) j += 1;
    let k = j;
    while (k < times.length && times[k] <= start + len) k += 1;
    if (k - j > best.count) best = { start, count: k - j };
  }
  return { startMs: best.start, lenMs: len };
}

// The call on screen at time t (ms from the start of the recording), if any.
export function callAt(calls, t) {
  let current = null;
  for (const c of calls || []) {
    if (c.t <= t && t - c.t < CALL_SHOWN_MS) current = c;
  }
  return current;
}

export const punchesBy = (punches, t) => (punches || []).filter((p) => p <= t).length;

// H.264 MP4 first: what Reels and TikTok take without converting (iPhones make H.264 + AAC).
export function shareMimeType(withAudio = true) {
  const R = typeof window !== "undefined" ? window.MediaRecorder : null;
  const options = withAudio
    ? ["video/mp4;codecs=avc1,mp4a.40.2", "video/mp4;codecs=avc1,opus", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm"]
    : ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"];
  return options.find((t) => R?.isTypeSupported?.(t)) || "";
}

function drawCover(ctx, video) {
  const vw = video.videoWidth || CLIP_W;
  const vh = video.videoHeight || CLIP_H;
  const scale = Math.max(CLIP_W / vw, CLIP_H / vh);
  const w = vw * scale;
  const h = vh * scale;
  ctx.drawImage(video, (CLIP_W - w) / 2, (CLIP_H - h) / 2, w, h);
}

function drawOverlay(ctx, { t, calls, punches, stance, colours }) {
  const top = ctx.createLinearGradient(0, 0, 0, 360);
  top.addColorStop(0, "rgba(0,0,0,0.6)");
  top.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, CLIP_W, 360);

  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.font = "800 46px system-ui, -apple-system, sans-serif";
  ctx.fillStyle = "#fff";
  ctx.fillText("VICTORY", 56, 64);
  const w = ctx.measureText("VICTORY ").width;
  ctx.fillStyle = colours.lime;
  ctx.fillText("AI", 56 + w, 64);
  ctx.font = "500 30px system-ui, -apple-system, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.fillText("victoryai.co.uk", 56, 122);

  ctx.textAlign = "right";
  ctx.font = "900 120px ui-monospace, Menlo, monospace";
  ctx.fillStyle = colours.lime;
  ctx.fillText(String(punchesBy(punches, t)), CLIP_W - 56, 50);
  ctx.font = "700 30px system-ui, -apple-system, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillText("PUNCHES", CLIP_W - 56, 178);

  const call = callAt(calls, t);
  if (!call) return;
  const bottom = ctx.createLinearGradient(0, CLIP_H - 640, 0, CLIP_H);
  bottom.addColorStop(0, "rgba(0,0,0,0)");
  bottom.addColorStop(1, "rgba(0,0,0,0.7)");
  ctx.fillStyle = bottom;
  ctx.fillRect(0, CLIP_H - 640, CLIP_W, 640);
  const tokens = comboTokens(call.combo, stance);
  const sep = "-";
  const parts = tokens.map((tk) => (tk.punch ? tk.label : tk.label.toUpperCase()));
  let size = 112;
  const measure = () => {
    ctx.font = `900 ${size}px ui-monospace, Menlo, monospace`;
    const sepW = ctx.measureText(sep).width;
    const ws = parts.map((p) => ctx.measureText(p).width);
    return { sepW, ws, total: ws.reduce((a, b) => a + b, 0) + sepW * (parts.length - 1) };
  };
  let m = measure();
  if (m.total > CLIP_W - 100) {
    size = Math.floor(size * (CLIP_W - 100) / m.total);
    m = measure();
  }
  let x = (CLIP_W - m.total) / 2;
  ctx.textAlign = "left";
  tokens.forEach((tk, i) => {
    if (i) {
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.fillText(sep, x, CLIP_H - 420);
      x += m.sepW;
    }
    ctx.fillStyle = tk.body ? colours.orange : tk.hand === "lead" ? colours.lime : tk.hand === "rear" ? colours.teal : "#fff";
    ctx.fillText(parts[i], x, CLIP_H - 420);
    x += m.ws[i];
  });
  ctx.textAlign = "center";
  ctx.font = "700 40px system-ui, -apple-system, sans-serif";
  ctx.fillStyle = "#fff";
  ctx.fillText(tokens.map((tk) => tk.name).join(" · "), CLIP_W / 2, CLIP_H - 270, CLIP_W - 80);
}

function drawEndCard(ctx, { score, totalPunches, colours }) {
  ctx.fillStyle = "rgba(0,0,0,0.82)";
  ctx.fillRect(0, 0, CLIP_W, CLIP_H);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "800 64px system-ui, -apple-system, sans-serif";
  ctx.fillStyle = "#fff";
  ctx.fillText("VICTORY AI", CLIP_W / 2, 520);
  if (score != null) {
    ctx.font = "700 40px system-ui, -apple-system, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fillText("ROUND SCORE", CLIP_W / 2, 760);
    ctx.font = "900 260px system-ui, -apple-system, sans-serif";
    ctx.fillStyle = colours.lime;
    ctx.fillText(Number(score).toFixed(1), CLIP_W / 2, 940);
    ctx.font = "700 56px system-ui, -apple-system, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillText("/ 10", CLIP_W / 2, 1110);
  }
  ctx.font = "800 72px system-ui, -apple-system, sans-serif";
  ctx.fillStyle = "#fff";
  ctx.fillText(`${totalPunches} punches`, CLIP_W / 2, score != null ? 1270 : 960);
  ctx.font = "600 44px system-ui, -apple-system, sans-serif";
  ctx.fillStyle = colours.lime;
  ctx.fillText("Train with me · victoryai.co.uk", CLIP_W / 2, 1560);
}

async function loadCalls(ac, calls, clipFor) {
  const out = [];
  for (const c of calls) {
    const url = clipFor?.(c.text);
    if (!url) continue;
    try {
      const data = await (await fetch(url)).arrayBuffer();
      const buffer = await new Promise((ok, fail) => ac.decodeAudioData(data, ok, fail));
      out.push({ t: c.t, buffer });
    } catch {}
  }
  return out;
}

// Plays the chosen stretch once into a canvas and records it. Takes as long as the clip.
export async function renderShareClip({ clip, score, stance, clipFor, audioContext, onProgress }) {
  const { startMs, lenMs } = pickWindow(clip.punches, clip.durationMs);
  const calls = (clip.calls || []).filter((c) => c.t >= startMs - 500 && c.t <= startMs + lenMs);
  const totalPunches = clip.punches?.length || 0;
  // Always the dark-theme brand colours: a posted clip looks the same whatever the phone is set to.
  const colours = { lime: dark.lime, teal: dark.teal, orange: dark.orange };

  const canvas = document.createElement("canvas");
  canvas.width = CLIP_W;
  canvas.height = CLIP_H;
  const ctx = canvas.getContext("2d");

  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.setAttribute("playsinline", "");
  video.style.cssText = "position:fixed;left:-10px;top:0;width:2px;height:2px;opacity:0;pointer-events:none";
  document.body.appendChild(video);
  const src = URL.createObjectURL(clip.blob);
  video.src = src;

  const ac = audioContext || new (window.AudioContext || window.webkitAudioContext)();
  const dest = ac.createMediaStreamDestination();
  try {
    await new Promise((ok, fail) => { video.onloadeddata = ok; video.onerror = () => fail(new Error("video")); });
    const voice = await loadCalls(ac, calls, clipFor);
    video.currentTime = startMs / 1000;
    await new Promise((ok) => { video.onseeked = ok; setTimeout(ok, 1500); });

    const stream = canvas.captureStream(30);
    // A sound track only when there's coach voice to put on it, and only once the audio is
    // running: a track with no sound flowing stalls the recording.
    if (voice.length) {
      if (ac.state === "suspended") await ac.resume().catch(() => {});
      if (ac.state === "running") {
        const hum = ac.createOscillator();
        const mute = ac.createGain();
        mute.gain.value = 0;
        hum.connect(mute).connect(dest);
        hum.start();
        dest.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr));
      }
    }
    const mimeType = shareMimeType(stream.getAudioTracks().length > 0);
    const recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: 6_000_000 });
    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const done = new Promise((ok) => { recorder.onstop = ok; });

    const t0 = ac.currentTime + 0.15;
    for (const v of voice) {
      const at = t0 + (v.t - startMs) / 1000;
      if (at < ac.currentTime) continue;
      const s = ac.createBufferSource();
      s.buffer = v.buffer;
      s.connect(dest);
      s.start(at);
    }
    recorder.start(500);
    await video.play();

    const endMs = startMs + lenMs;
    const total = lenMs + END_CARD_MS;
    await new Promise((resolve) => {
      let endCardFrom = null;
      const step = () => {
        const t = video.currentTime * 1000;
        if (endCardFrom == null) {
          drawCover(ctx, video);
          drawOverlay(ctx, { t, calls, punches: clip.punches, stance, colours });
          onProgress?.(Math.min(1, (t - startMs) / total));
          if (t >= endMs || video.ended) { video.pause(); endCardFrom = performance.now(); }
        } else {
          drawCover(ctx, video);
          drawEndCard(ctx, { score, totalPunches, colours });
          const held = performance.now() - endCardFrom;
          onProgress?.(Math.min(1, (lenMs + held) / total));
          if (held >= END_CARD_MS) { resolve(); return; }
        }
        setTimeout(step, 1000 / 30);
      };
      step();
    });
    recorder.stop();
    await done;
    const type = (recorder.mimeType || mimeType || "video/mp4").split(";")[0];
    return { blob: new Blob(chunks, { type }), type, seconds: Math.round(total / 1000) };
  } finally {
    URL.revokeObjectURL(src);
    video.remove();
    if (!audioContext) ac.close?.().catch(() => {});
  }
}
