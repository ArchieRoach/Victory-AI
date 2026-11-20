// Timely, personalised first-run tips ("coach marks").
// Goal: new fighters understand each feature the moment they meet it, and feel smart doing it.
// Psychology: help is remembered when it arrives just in time, in context (not front-loaded);
//   personal words (your name, your partner, your focus) make it feel like a coach, not a manual.
//   Too many tips at once overwhelm (the onboarding rule in CLAUDE.md).
// Design: one tip on screen at a time, at most 3 a day, never while a round is running, and
//   each tip shows once ever. Text uses the fighter's own name, partner and chosen focus.
import { tx } from "@/i18n/tx";

const SEEN_PREFIX = "victory_tip_seen_";
const DAY_KEY = "victory_tips_day";
export const DAILY_CAP = 3;

const first = (name) => (name || "").trim().split(/\s+/)[0] || "";

export function tipContext(user) {
  const partner = user?.training_partner || {};
  return {
    name: first(user?.display_name || user?.name),
    partner: partner.name || tx("lib.tips.yourPartner", "your partner"),
    focus: (partner.focus_areas || [])[0] || null,
  };
}

// Every coach mark's words in one place, so they read as one voice.
export const TIPS = {
  home_one_round: ({ name, partner }) =>
    name ? tx("lib.tips.homeOneRoundName", "{{name}}, start here. One 3-minute round with {{partner}}. That's your whole first session.", { name, partner })
      : tx("lib.tips.homeOneRound", "Start here. One 3-minute round with {{partner}}. That's your whole first session.", { partner }),
  home_partner: ({ partner }) =>
    tx("lib.tips.homePartner", "This is {{partner}}. Train and they stay sharp. Take a few days off and they slide to the bench. One session brings them back.", { partner }),
  home_week_plan: ({ partner }) => tx("lib.tips.homeWeekPlan", "New: pick 2, 3 or 4 sessions this week. {{partner}} keeps pace with whatever you choose.", { partner }),
  home_drive_cards: () => tx("lib.tips.homeDriveCards", "These cards move. The ones you tap most rise to the top."),
  home_coming_up: () => tx("lib.tips.homeComingUp", "What's coming next, soonest first. Only real dates, never a fake countdown."),
  train_video: ({ focus }) =>
    tx("lib.tips.trainVideo", "Turn video on and the AI scores your {{focus}} from what it actually sees.", { focus: focus ? focus.toLowerCase() : tx("lib.tips.technique", "technique") }),
  train_combo_calls: ({ partner }) =>
    tx("lib.tips.trainComboCalls", "{{partner}} will call combos out loud: \"Jab, cross, hook\". Land them and they get harder. Prefer numbers? Switch on Call numbers.", { partner }),
  train_round_types: () => tx("lib.tips.trainRoundTypes", "New: Freestyle has no score. Just move. It still counts for your week."),
  train_voice_toggle: () => tx("lib.tips.trainVoice", "Tap to mute or unmute your coach's spoken feedback."),
  train_skip_btn: () => tx("lib.tips.trainSkip", "Skips ahead to the next round or rest period."),
  train_end_btn: () => tx("lib.tips.trainEnd", "Ends the session now and saves whatever rounds you've completed."),
  results_first: ({ name }) =>
    name ? tx("lib.tips.resultsFirstName", "{{name}}, these numbers are only compared with you. Next session, you'll try to beat them.", { name })
      : tx("lib.tips.resultsFirst", "These numbers are only compared with you. Next session, you'll try to beat them."),
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
