import axios from "axios";
import { post } from "@/lib/nativeBridge";
import { isNativeShell } from "@/lib/nativeShell";

// The iPhone home screen widget (ios/VictoryWidgets/VictoryHomeWidget.swift) can't sign in, so
// the app hands it this week's real numbers whenever they may have changed.
export function widgetPayload(stats, season) {
  const week = stats?.weekly_streak || {};
  const days = stats?.week_activity || [];
  return {
    action: "update",
    week_days: Number(week.this_week_days) || 0,
    week_goal: Number(week.per_week) || 3,
    streak_weeks: Number(week.current) || 0,
    trained_today: Boolean(days[days.length - 1]?.active),
    rank: season?.rank || null,
    points: Number.isFinite(season?.points) ? season.points : null,
    next_rank: season?.next_rank || null,
    next_at: Number.isFinite(season?.next_at) ? season.next_at : null,
  };
}

let last = 0;

export async function syncWidget(api, { force = false } = {}) {
  if (!isNativeShell()) return;
  const now = Date.now();
  if (!force && now - last < 20000) return;
  last = now;
  try {
    const [stats, season] = await Promise.all([
      axios.get(`${api}/users/stats`).then((r) => r.data),
      axios.get(`${api}/seasons/me`).then((r) => r.data).catch(() => null),
    ]);
    await post("victoryWidget", widgetPayload(stats, season));
  } catch {}
}
