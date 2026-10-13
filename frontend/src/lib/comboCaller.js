// Combo calls that adapt to the fighter (Flow theory).
// Goal: rounds feel "just right", so fighters do more of them.
// Psychology: flow needs the challenge just above your skill: too easy is boring, too hard
//   is scary. Landing roughly 60–80% of calls keeps you in that channel.
// Design: the coach calls boxing numbers (1 jab, 2 cross, 3 lead hook, 4 rear hook, 5 lead
//   uppercut, 6 rear uppercut). With the Live Coach camera on, a call counts as landed when
//   that many punches arrive in time. Over 80% steps the level up; under 60% steps it down.
//   Without the camera nothing can be checked, so the level stays where it is.

export const CALL_LEVELS = [
  { name: "Warm-up", combos: ["1", "1-1", "1-2", "2"], gapMs: 5000 },
  { name: "Basics", combos: ["1-2", "1-1-2", "1-2-3", "2-3"], gapMs: 4500 },
  { name: "Sharp", combos: ["1-2-3", "1-2-3-2", "1-6-3", "3-2-3"], gapMs: 4000 },
  { name: "Fast hands", combos: ["1-2-3-2", "1-2-5-2", "1-1-2-3", "2-3-2-1"], gapMs: 3500 },
  { name: "Pro pace", combos: ["1-2-3-2-1", "1-2-3-4-3", "1-1-2-3-2", "1-6-3-2-3"], gapMs: 3200 },
];
export const HIT_HIGH = 0.8;
export const HIT_LOW = 0.6;
export const RESULTS_WINDOW = 5;
export const LEVEL_KEY = "victory_caller_level";

// Only numbered moves are punches the camera can count; "slip" or "pivot" in a combo aren't.
export const punchCount = (combo) => Math.max(1, combo.split("-").filter((m) => /^[1-6]$/.test(m)).length);
// Your weekly combo (from the combo builder) is called every third time.
export const WEEKLY_EVERY = 3;
export const landWindowMs = (n) => 1200 + n * 450;

export function nextLevel(level, results) {
  if (results.length < RESULTS_WINDOW) return level;
  const recent = results.slice(-RESULTS_WINDOW);
  const rate = recent.filter(Boolean).length / recent.length;
  if (rate > HIT_HIGH) return Math.min(CALL_LEVELS.length - 1, level + 1);
  if (rate < HIT_LOW) return Math.max(0, level - 1);
  return level;
}

export function createComboCaller({ level = 0, gapScale = 1, pick = Math.random, weekly = null } = {}) {
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
      const moved = nextLevel(lvl, results);
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

export function sayCombo(combo) {
  try {
    if (!window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(combo.split("-").join(", "));
    u.rate = 1.25;
    window.speechSynthesis.speak(u);
  } catch {}
}

export function savedLevel() {
  try { return Math.max(0, Math.min(CALL_LEVELS.length - 1, Number(localStorage.getItem(LEVEL_KEY)) || 0)); } catch { return 0; }
}

export function saveLevel(level) {
  try { localStorage.setItem(LEVEL_KEY, String(level)); } catch {}
}
