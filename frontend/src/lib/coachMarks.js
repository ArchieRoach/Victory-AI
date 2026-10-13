// Timely, personalised first-run tips ("coach marks").
// Goal: new fighters understand each feature the moment they meet it, and feel smart doing it.
// Psychology: help is remembered when it arrives just in time, in context (not front-loaded);
//   personal words (your name, your partner, your focus) make it feel like a coach, not a manual.
//   Too many tips at once overwhelm (the onboarding rule in CLAUDE.md).
// Design: one tip on screen at a time, at most 3 a day, never while a round is running, and
//   each tip shows once ever. Text uses the fighter's own name, partner and chosen focus.
const SEEN_PREFIX = "victory_tip_seen_";
const DAY_KEY = "victory_tips_day";
export const DAILY_CAP = 3;

const first = (name) => (name || "").trim().split(/\s+/)[0] || "";

export function tipContext(user) {
  const partner = user?.training_partner || {};
  return {
    name: first(user?.display_name || user?.name),
    partner: partner.name || "your partner",
    focus: (partner.focus_areas || [])[0] || null,
  };
}

// Every coach mark's words in one place, so they read as one voice.
export const TIPS = {
  home_one_round: ({ name, partner }) =>
    `${name ? `${name}, start` : "Start"} here. One 3-minute round with ${partner}. That's your whole first session.`,
  home_partner: ({ partner }) =>
    `This is ${partner}. Train and they stay sharp. Take a few days off and they slide to the bench. One session brings them back.`,
  home_week_plan: ({ partner }) => `New: pick 2, 3 or 4 sessions this week. ${partner} keeps pace with whatever you choose.`,
  home_drive_cards: () => "These cards move. The ones you tap most rise to the top.",
  home_coming_up: () => "What's coming next, soonest first. Only real dates, never a fake countdown.",
  train_video: ({ focus }) =>
    `Turn video on and the AI scores your ${focus ? focus.toLowerCase() : "technique"} from what it actually sees.`,
  train_combo_calls: ({ partner }) =>
    `${partner} will call combos by number: 1 is a jab, 2 a cross, 3 a lead hook. Land them and they get harder.`,
  train_round_types: () => "New: Freestyle has no score. Just move. It still counts for your week.",
  train_voice_toggle: () => "Tap to mute or unmute your coach's spoken feedback.",
  train_skip_btn: () => "Skips ahead to the next round or rest period.",
  train_end_btn: () => "Ends the session now and saves whatever rounds you've completed.",
  results_first: ({ name }) =>
    `${name ? `${name}, these` : "These"} numbers are only compared with you. Next session, you'll try to beat them.`,
};

export function tipText(id, ctx, fallback) {
  const f = TIPS[id];
  return f ? f(ctx || tipContext(null)) : fallback;
}

// Pure rules, so they can be tested without a browser.
export function canShow({ id, seen, active, shownToday, held }) {
  if (held || seen) return false;
  if (active && active !== id) return false;
  if (active === id) return true;
  return shownToday < DAILY_CAP;
}

// ---- One shared queue for the whole app ----
let active = null;
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());

function storage() {
  try { return typeof localStorage !== "undefined" ? localStorage : null; } catch { return null; }
}

export function isSeen(id) {
  try { return !!storage()?.getItem(SEEN_PREFIX + id); } catch { return true; }
}

function today() { return new Date().toISOString().slice(0, 10); }

export function shownToday() {
  try {
    const d = JSON.parse(storage()?.getItem(DAY_KEY) || "{}");
    return d.date === today() ? d.count || 0 : 0;
  } catch { return 0; }
}

export function claim(id) {
  if (!canShow({ id, seen: isSeen(id), active, shownToday: shownToday(), held: false })) return false;
  if (active !== id) {
    active = id;
    try { storage()?.setItem(DAY_KEY, JSON.stringify({ date: today(), count: shownToday() + 1 })); } catch {}
    emit();
  }
  return true;
}

export function dismiss(id) {
  try { storage()?.setItem(SEEN_PREFIX + id, "1"); } catch {}
  if (active === id) { active = null; emit(); }
}

export function release(id) {
  if (active === id) { active = null; emit(); }
}

export const activeTip = () => active;
export function subscribe(l) { listeners.add(l); return () => listeners.delete(l); }
export function _reset() { active = null; listeners.clear(); }
