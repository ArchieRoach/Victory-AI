// The workout timer's clock: turns a saved workout into a list of segments and says, for any
// moment, where you are and which bells, warnings and alerts are due. The rules and reasoning
// live in backend/workouts.py.

export function buildTimeline(p) {
  const out = [];
  const stations = p.stations?.length ? p.stations : [{ name: p.name, seconds: p.round_s }];
  const circuit = (p.stations?.length || 0) > 0;
  if (p.warmup_s > 0) out.push({ kind: "warmup", seconds: p.warmup_s, label: "Warm up", round: 0 });
  for (let r = 1; r <= p.rounds; r += 1) {
    stations.forEach((s, i) => {
      out.push({ kind: "work", seconds: s.seconds, label: s.name, round: r, station: circuit ? i + 1 : null });
      if (circuit && i < stations.length - 1 && p.station_rest_s > 0) {
        out.push({ kind: "rest", seconds: p.station_rest_s, label: "Rest", round: r, short: true });
      }
    });
    if (r < p.rounds && p.rest_s > 0) out.push({ kind: "rest", seconds: p.rest_s, label: circuit ? "Set rest" : "Rest", round: r });
  }
  let at = 0;
  return out.map((seg, i) => {
    const next = out.slice(i + 1).find((n) => n.kind === "work");
    const s = { ...seg, start: at, next: next ? next.label : null };
    at += seg.seconds;
    return s;
  });
}

export const totalSeconds = (timeline) => timeline.reduce((t, s) => t + s.seconds, 0);

// Where the clock is after `elapsed` seconds: the segment and seconds left in it.
export function positionAt(timeline, elapsed) {
  for (let i = 0; i < timeline.length; i += 1) {
    const s = timeline[i];
    if (elapsed < s.start + s.seconds) return { index: i, seg: s, left: s.start + s.seconds - elapsed };
  }
  return { index: timeline.length, seg: null, left: 0 };
}

// What should sound between two moments (called every tick with the last and current elapsed
// whole seconds): the bell when work starts or ends, a warning N seconds before the end of a round
// or a rest, and the interval alert every N seconds of work.
export function cuesBetween(timeline, p, fromS, toS) {
  const cues = [];
  for (let t = fromS + 1; t <= toS; t += 1) {
    const prev = positionAt(timeline, t - 1);
    const now = positionAt(timeline, t);
    if (now.index !== prev.index) {
      if (prev.seg?.kind === "work") cues.push({ at: t, type: "end", seg: prev.seg });
      if (now.seg) cues.push({ at: t, type: now.seg.kind === "work" ? "start" : now.seg.kind, seg: now.seg });
      else cues.push({ at: t, type: "done" });
      continue;
    }
    const seg = now.seg;
    if (!seg) continue;
    const warn = seg.kind === "work" ? p.round_warning_s : seg.kind === "rest" ? p.rest_warning_s : 0;
    if (warn > 0 && now.left === warn && seg.seconds > warn) cues.push({ at: t, type: "warning", seg });
    const into = t - seg.start;
    if (seg.kind === "work" && p.inner_alert_s > 0 && into > 0 && into % p.inner_alert_s === 0 && now.left > 0) {
      cues.push({ at: t, type: "inner", seg });
    }
  }
  return cues;
}

export function clock(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function describe(p) {
  const work = p.stations?.length
    ? `${p.stations.length} exercises × ${p.rounds} ${p.rounds === 1 ? "set" : "sets"}`
    : `${p.rounds} × ${clock(p.round_s)}`;
  return p.rest_s > 0 ? `${work} · ${clock(p.rest_s)} rest` : work;
}

// What the coach says at each moment. Short, so it never talks over the bell for long.
export function spokenLine(cue, p, timeline) {
  const seg = cue.seg;
  const lastRound = seg && seg.round === p.rounds;
  switch (cue.type) {
    case "start":
      if (seg.station) return `${seg.label}. ${seg.seconds} seconds.`;
      if (seg.seconds < 30) return "Go.";
      return lastRound && p.rounds > 1 ? "Last round. Let's go." : `Round ${seg.round}. Let's go.`;
    case "rest":
      return seg.next ? `Rest. Next up, ${seg.next}.` : "Rest.";
    case "warning":
      return seg.kind === "work" ? `${p.round_warning_s} seconds. Empty the tank.` : `${p.rest_warning_s} seconds. Get ready.`;
    case "done":
      return "Time. Great work.";
    default:
      return null;
  }
}

// Every line the coach could say in this workout, so the natural voice is ready before the bell.
export function allSpokenLines(p) {
  const timeline = buildTimeline(p);
  const lines = new Set();
  for (const seg of timeline) {
    for (const type of ["start", "rest", "warning"]) {
      if ((type === "start" && seg.kind === "work") || (type !== "start" && seg.kind !== "warmup")) {
        const l = spokenLine({ type, seg }, p, timeline);
        if (l) lines.add(l);
      }
    }
  }
  lines.add(spokenLine({ type: "done" }, p, timeline));
  return [...lines];
}

export function newPreset(type = "bag") {
  const circuit = type === "circuit" || type === "hiit";
  return {
    id: null, name: "", type, warmup_s: 10, rounds: 3,
    round_s: circuit ? 40 : 180, rest_s: 60, round_warning_s: 10, rest_warning_s: 10, inner_alert_s: 0,
    stations: type === "circuit" ? [{ name: "Burpees", seconds: 40 }, { name: "Push-ups", seconds: 40 }] : [],
    station_rest_s: type === "circuit" ? 20 : 0,
  };
}
