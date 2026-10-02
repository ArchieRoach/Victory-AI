export function seasonProgress(season) {
  if (!season) return null;
  const pct = season.next_at ? Math.min(100, Math.round((season.points / season.next_at) * 100)) : 100;
  const label = season.next_rank
    ? `${season.next_at - season.points} to ${season.next_rank}`
    : "Top rank — defend it until the season resets";
  return { pct, label };
}

// The squad invite is only offered on a session that gave the fighter something to show:
// they've tried the app and have a reason to vouch for it. Returns the skill to brag about
// (a fresh PB or a beaten callout), or null for a win with no single skill (rank-up, rare report).
export function inviteMoment(rewards, report) {
  const pbs = rewards?.personal_bests?.new || [];
  const pb = pbs.find((b) => b.name !== "Overall") || pbs[0];
  if (pb) return { dimension: pb.name, headline: `New ${pb.name} PB. Who's beating it?` };
  const beaten = rewards?.callouts_beaten?.[0];
  if (beaten) return { dimension: beaten.dimension, headline: "Callout beaten. Bring someone who can keep up." };
  if (rewards?.season?.ranked_up) return { dimension: null, headline: `You're ${rewards.season.rank} now. Bring your crew.` };
  if (rewards?.identity?.count === 1) return { dimension: null, headline: `New trait: ${rewards.identity.name}. Show your crew.` };
  const r = report ?? rewards?.scouting_report;
  if (r && !r.locked && (r.rarity === "rare" || r.rarity === "epic")) return { dimension: null, headline: "Rare report. Show your crew." };
  return null;
}
