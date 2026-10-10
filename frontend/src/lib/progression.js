// Pure helpers for levels, ranks, quests and brag buttons, kept out of components so they can be tested.

export function resetCountdown(iso, now = new Date()) {
  if (!iso) return "";
  const ms = new Date(iso) - now;
  if (ms <= 0) return "Resets now";
  const h = Math.floor(ms / 3600000);
  const d = Math.floor(h / 24);
  return d >= 1 ? `Resets in ${d}d ${h % 24}h` : `Resets in ${Math.max(1, h)}h`;
}

// The line under a leaderboard. Upward comparison only motivates when the target feels
// reachable, so a big gap is framed as your own progress, not as losing.
export function rankHeadline(r) {
  if (!r || r.learning_mode) return null;
  const me = r.me;
  if (!me) return "Train once this week to get on the board.";
  if (me.rank === 1) return r.size > 1 ? "You're top. Hold it until the reset." : "You're the only one on the board. Bring your crew.";
  const who = r.next_up || "the next fighter";
  if (r.within_reach) return `${r.gap_up} points to pass ${who}: one good session does it.`;
  return `You're #${me.rank} of ${r.size}. Every session moves you up.`;
}

// Brag buttons appear only on real win states: what's shared is what was earned.
export function bragText(win) {
  switch (win?.kind) {
    case "level": return `Just hit level ${win.level} on Victory AI${win.unlock ? ` and unlocked ${win.unlock}` : ""}.`;
    case "crown": return `Crowned ${win.name} on Victory AI${win.scope ? ` (${win.scope})` : ""}.`;
    case "quest": return `Our squad smashed this week's training quest on Victory AI.`;
    case "rank": return `#${win.rank} ${win.board || "on my board"} this week on Victory AI.`;
    case "shelf": return `My Victory AI trophy shelf: level ${win.level}${win.crowns ? `, ${win.crowns} crown${win.crowns === 1 ? "" : "s"}` : ""}.`;
    default: return "Training on Victory AI.";
  }
}

export async function brag(win, { nav = typeof navigator !== "undefined" ? navigator : undefined, url } = {}) {
  const text = bragText(win);
  const link = url || (typeof window !== "undefined" ? window.location.origin : "");
  if (nav?.share) {
    try {
      await nav.share({ title: "Victory AI", text, url: link });
      return "shared";
    } catch (e) {
      if (e?.name === "AbortError") return "cancelled";
    }
  }
  if (nav?.clipboard?.writeText) {
    await nav.clipboard.writeText(`${text} ${link}`.trim());
    return "copied";
  }
  return "unavailable";
}

// The most brag-worthy thing a session earned, or null when nothing was won.
export function sessionWin(rewards) {
  const s = rewards?.status;
  const quest = (rewards?.quests || []).find((q) => q.just_completed);
  if (s?.leveled_up) return { kind: "level", level: s.level, unlock: s.unlocked?.[s.unlocked.length - 1]?.name };
  if (quest) return { kind: "quest", squad: quest.name };
  return null;
}

export function weekLabel(weekId) {
  const m = /W(\d+)$/.exec(weekId || "");
  return m ? `W${Number(m[1])}` : weekId || "";
}

// Rarity and deadlines are real numbers from the server; nothing here invents urgency.
export function glovesHeadline(g) {
  if (!g) return "";
  const held = g.holders === 0 ? "Nobody holds them yet" : `Held by ${g.holders} fighter${g.holders === 1 ? "" : "s"}`;
  if (g.earned) return `Yours. ${held}. Gone for good when the season ends.`;
  if (g.pledged) return `${g.hours_to_go} proven hours to go · ${g.days_left} days left · ${held}`;
  if (g.window?.open) return `${g.chasers} chasing · ${held} · entries close in ${g.window.days_to_close}d`;
  return `${held}. Entries closed for this season.`;
}

// What the session did (or didn't do) for verified hours, in one honest line.
export function glovesLine(gloves) {
  if (!gloves) return null;
  if (gloves.just_earned) return `You earned the ${gloves.just_earned}!`;
  if (gloves.counted && gloves.minutes) {
    const capped = gloves.capped_minutes ? ` (${gloves.capped_minutes} over today's cap)` : "";
    return `+${gloves.minutes} verified minutes${gloves.season_hours != null ? ` · ${gloves.season_hours}h toward the Golden Gloves` : ""}${capped}`;
  }
  if (gloves.reason === "unverified") return "Not counted as verified time: only rounds the AI scores from video count.";
  if (gloves.reason === "daily_cap") return "Today's verified-time cap is reached. Rest up, it resets tomorrow.";
  return null;
}

export function masteryLine(m) {
  if (!m) return "";
  const now = `${m.verified_hours.toLocaleString()} of ${m.expert_hours.toLocaleString()} expert hours`;
  return m.next_tier ? `${now} · next: ${m.next_tier} at ${m.next_at_hours.toLocaleString()}h` : now;
}
