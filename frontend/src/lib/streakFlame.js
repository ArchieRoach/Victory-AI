// The streak flame card (rebuilt from the Lottie brief: a small flame that bursts into a big one,
// "3 day streak", and the week's days ticked off).
// Goal: more training days in a row (retention), and a streak people are proud of.
// Psychology: a visible chain you don't want to break (loss aversion, "don't break the chain"),
//   and a celebration at the moment you earn it, so the effort is linked to the reward (peak-end).
// Honesty: there's no fake "check in" button. A day only counts if you trained (a real session,
//   the same rule as backend _compute_streaks: one rest day never breaks it). The flame bursts
//   once, the first time you see it after training that day, and the button takes you to train.
const LIT_KEY = "victory_streak_lit";

// Monday-to-Sunday of the current week. Past days and today come from real sessions
// (week_activity: the last 7 days, oldest first); later days are shown as their date.
export function weekDays(weekActivity = []) {
  const last = weekActivity[weekActivity.length - 1];
  if (!last?.date) return [];
  const today = new Date(`${last.date}T12:00:00Z`);
  const active = new Map(weekActivity.map((d) => [d.date, !!d.active]));
  const monday = new Date(today);
  monday.setUTCDate(today.getUTCDate() - ((today.getUTCDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    return { date: iso, day: d.getUTCDate(), isToday: iso === last.date, future: d > today, active: active.get(iso) || false };
  });
}

export function trainedToday(weekActivity = []) {
  return !!weekActivity[weekActivity.length - 1]?.active;
}

// Runs of trained days side by side get one joined band behind them, like a chain.
export function inRun(days, i) {
  const d = days[i];
  if (!d?.active) return { left: false, right: false };
  return { left: !!days[i - 1]?.active, right: !!days[i + 1]?.active };
}

function storage() {
  try { return typeof localStorage !== "undefined" ? localStorage : null; } catch { return null; }
}

// The burst plays once per trained day, the first time the card is seen.
export function shouldIgnite(weekActivity, streak) {
  if (!trainedToday(weekActivity) || !streak) return false;
  const today = weekActivity[weekActivity.length - 1].date;
  try { return storage()?.getItem(LIT_KEY) !== today; } catch { return false; }
}

export function markIgnited(weekActivity) {
  const today = weekActivity?.[weekActivity.length - 1]?.date;
  try { if (today) storage()?.setItem(LIT_KEY, today); } catch {}
}
