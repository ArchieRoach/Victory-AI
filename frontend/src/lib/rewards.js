export function seasonProgress(season) {
  if (!season) return null;
  const pct = season.next_at ? Math.min(100, Math.round((season.points / season.next_at) * 100)) : 100;
  const label = season.next_rank
    ? `${season.next_at - season.points} to ${season.next_rank}`
    : "Top rank — defend it until the season resets";
  return { pct, label };
}
