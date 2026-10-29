import { say } from "@/lib/speech";

// Combo calls that adapt to the fighter (Flow theory).
// Goal: rounds feel "just right", so fighters do more of them.
// Psychology: flow needs the challenge just above your skill: too easy is boring, too hard
//   is scary. Landing roughly 60–80% of calls keeps you in that channel.
// Design: combos are written as boxing numbers (1 jab, 2 cross, 3 lead hook, 4 rear hook, 5 lead
//   uppercut, 6 rear uppercut) and called out as punch names (see comboWords). With the Live Coach camera on, a call counts as landed when
//   that many punches arrive in time. Over 80% steps the level up; under 60% steps it down.
//   Without the camera nothing can be checked, so the level stays where it is.

export const CALL_LEVELS = [
  { name: "Warm-up", combos: ["1", "1-1", "1-2", "2"], gapMs: 5000 },
  { name: "Basics", combos: ["1-2", "1-1-2", "1-2-3", "2-3"], gapMs: 4500 },
  { name: "Sharp", combos: ["1-2-3", "1-2-3-2", "1-6-3", "3-2-3"], gapMs: 4000 },
  { name: "Fast hands", combos: ["1-2-3-2", "1-2-5-2", "1-1-2-3", "2-3-2-1"], gapMs: 3500 },
  { name: "Pro pace", combos: ["1-2-3-2-1", "1-2-3-4-3", "1-1-2-3-2", "1-6-3-2-3", "1-2-slip-2-3-2", "3-6-3-2"], gapMs: 3200 },
  { name: "Ring general", combos: ["1-2-roll-2-3-2", "1-1-2-slip-2-3", "2-3-2-pivot-1-2", "1-2-5-6-3-2", "1-6-3-2-roll-2", "5-2-3-4-1-2"], gapMs: 3000 },
];

// Where calls start and the lowest they can drop to, by experience. An advanced fighter
// whose punches the camera half-misses should never be sent back to single jabs.
const EXPERIENCE_START = [
  [/beginner|total/i, 0, 0],
  [/under_6|under 6/i, 1, 0],
  [/6_18|6.18 months|intermediate/i, 2, 1],
  [/1_3|1.3 years/i, 3, 2],
  [/3_plus|3.5 years|5.10|10\+|professional|pro\b|advanced|3\+/i, 4, 3],
];

export function levelRange(experience) {
  const hit = EXPERIENCE_START.find(([re]) => re.test(experience || ""));
  return hit ? { start: hit[1], floor: hit[2] } : { start: 0, floor: 0 };
}

export function startingLevel(experience, saved = savedLevel()) {
  const { start, floor } = levelRange(experience);
  return saved == null ? start : Math.max(floor, saved);
}
export const HIT_HIGH = 0.8;
export const HIT_LOW = 0.6;
export const RESULTS_WINDOW = 5;
export const LEVEL_KEY = "victory_caller_level";

// Only numbered moves are punches the camera can count; "slip" or "pivot" in a combo aren't.
export const punchCount = (combo) => Math.max(1, combo.split("-").filter((m) => /^[1-6]$/.test(m)).length);
// Your weekly combo (from the combo builder) is called every third time.
export const WEEKLY_EVERY = 3;
export const landWindowMs = (n) => 1200 + n * 450;

export function nextLevel(level, results, floor = 0) {
  if (results.length < RESULTS_WINDOW) return level;
  const recent = results.slice(-RESULTS_WINDOW);
  const rate = recent.filter(Boolean).length / recent.length;
  if (rate > HIT_HIGH) return Math.min(CALL_LEVELS.length - 1, level + 1);
  if (rate < HIT_LOW) return Math.max(floor, level - 1);
  return level;
}

export function createComboCaller({ level = 0, floor = 0, gapScale = 1, pick = Math.random, weekly = null } = {}) {
  let lvl = Math.max(0, Math.min(CALL_LEVELS.length - 1, level));
  let results = [];
  let pending = null;
  let nextAt = null;
  let last = null;
  const stats = { calls: 0, checked: 0, landed: 0, peak: lvl };

  function settle(adaptive) {
    const landed = pending.punches >= pending.n;
    if (adaptive) {
      stats.checked += 1;
      if (landed) stats.landed += 1;
      results.push(landed);
      const moved = nextLevel(lvl, results, floor);
      if (moved !== lvl) {
        lvl = moved;
        results = [];
        stats.peak = Math.max(stats.peak, lvl);
      }
    }
    pending = null;
  }

  return {
    // Call every few hundred ms while the round runs; returns a new call when it's time.
    tick(now, { adaptive = false } = {}) {
      if (pending && now > pending.deadline) settle(adaptive);
      if (nextAt == null) nextAt = now + 1500;
      if (pending || now < nextAt) return null;
      const options = CALL_LEVELS[lvl].combos.filter((c) => c !== last);
      const useWeekly = weekly && weekly !== last && (stats.calls + 1) % WEEKLY_EVERY === 0;
      const combo = useWeekly ? weekly : options[Math.floor(pick() * options.length) % options.length];
      const n = punchCount(combo);
      pending = { combo, n, punches: 0, deadline: now + landWindowMs(n) };
      nextAt = now + CALL_LEVELS[lvl].gapMs * gapScale;
      last = combo;
      stats.calls += 1;
      return { combo, level: lvl, levelName: useWeekly ? "Your weekly combo" : CALL_LEVELS[lvl].name };
    },
    punch(now) {
      if (pending && now <= pending.deadline) pending.punches += 1;
    },
    // Rest between rounds: drop the call in flight and start fresh next round.
    pause() {
      pending = null;
      nextAt = null;
    },
    level: () => lvl,
    summary: () => ({ ...stats, level: lvl, rate: stats.checked ? Math.round((100 * stats.landed) / stats.checked) : null }),
  };
}

// A call replaces any call still being spoken, so the voice never lags behind the screen.
// Calls are spoken and shown as punch names, because a number means nothing to most people.
// With a known stance the hooks and uppercuts say left or right, the way coaches call them;
// switch-hitters and unknown stances hear lead and rear. Numbers stay as an opt-in for
// fighters who were taught them.
const MOVE_WORDS = { slip: "Slip", roll: "Roll", pivot: "Pivot" };
const SIDES = {
  orthodox: { lead: "Left", rear: "Right" },
  southpaw: { lead: "Right", rear: "Left" },
};

export function punchName(n, stance) {
  const side = SIDES[String(stance || "").toLowerCase()];
  const lead = side ? side.lead : "Lead";
  const rear = side ? side.rear : "Rear";
  return { 1: "Jab", 2: "Cross", 3: `${lead} hook`, 4: `${rear} hook`, 5: `${lead} uppercut`, 6: `${rear} uppercut` }[n];
}

export function comboWords(combo, stance) {
  const words = [];
  for (const m of String(combo).split("-")) {
    const w = MOVE_WORDS[m] || punchName(Number(m), stance) || m;
    if (w === "Jab" && words[words.length - 1] === "Jab") words[words.length - 1] = "Double jab";
    else words.push(w);
  }
  return words;
}

export const NUMBERS_KEY = "victory_call_numbers";

export function callsNumbers() {
  try { return localStorage.getItem(NUMBERS_KEY) === "1"; } catch { return false; }
}

export function setCallsNumbers(on) {
  try { localStorage.setItem(NUMBERS_KEY, on ? "1" : "0"); } catch {}
}

export function comboSpeech(combo, stance, numbers = callsNumbers()) {
  return numbers ? combo.split("-").join(", ") : comboWords(combo, stance).join(", ");
}

export function sayCombo(combo, stance) {
  say(comboSpeech(combo, stance), { rate: 1.15, interrupt: true });
}

export function savedLevel() {
  try {
    const raw = localStorage.getItem(LEVEL_KEY);
    if (raw == null) return null;
    return Math.max(0, Math.min(CALL_LEVELS.length - 1, Number(raw) || 0));
  } catch { return null; }
}

export function saveLevel(level) {
  try { localStorage.setItem(LEVEL_KEY, String(level)); } catch {}
}
