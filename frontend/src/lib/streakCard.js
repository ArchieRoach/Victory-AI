// Weekly streak words for Home and the share card. The rules (2 training days a week, Monday to
// Sunday) and the reasoning live in backend/gamification.py next to weekly_streak().

const DAYS_LEFT = ["today", "by tomorrow night", "in the next 3 days", "in the next 4 days",
  "in the next 5 days", "in the next 6 days", "this week"];

function sessions(n) {
  return n === 1 ? "1 more training day" : `${n} more training days`;
}

export function streakLine(s) {
  if (!s) return null;
  if (s.safe) return { tone: "safe", text: `${s.current}-week streak. This week is in the bag.` };
  if (s.at_risk && s.needed > s.days_left + 1) {
    return { tone: "risk", text: `${s.current}-week streak ends Sunday. ${s.per_week} days next week starts a new one.` };
  }
  if (s.at_risk) {
    return { tone: "risk", text: `${s.current}-week streak. ${sessions(s.needed)} ${DAYS_LEFT[s.days_left] || "this week"} keeps it going.` };
  }
  if (s.this_week_days > 0) return { tone: "start", text: `${sessions(s.needed)} this week starts your weekly streak.` };
  return { tone: "start", text: `Train ${s.per_week} days this week to start a weekly streak.` };
}

// Shared only once the week is secured: a share prompt belongs straight after a real win.
export function canShareStreak(s) {
  return !!s && s.safe && s.current >= 1;
}

export function streakCardContent({ streak, user, squadName }) {
  const weeks = streak.current;
  return {
    number: String(weeks),
    label: "WEEK STREAK",
    line: `Trained ${streak.per_week}+ days a week, ${weeks} ${weeks === 1 ? "week" : "weeks"} running.`,
    best: streak.longest > weeks ? `Best: ${streak.longest} weeks` : null,
    name: (user?.display_name || user?.name || "Fighter").slice(0, 24),
    squad: squadName ? `Squad: ${squadName}`.slice(0, 32) : null,
  };
}
