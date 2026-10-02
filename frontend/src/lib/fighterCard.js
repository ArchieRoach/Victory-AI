// What goes on a fighter card. Only verified numbers: AI scores, personal bests and the
// season rank come from the server; live counts are labelled as counted on the phone.
export function fighterCardContent({ user, rewards, overall, liveStats }) {
  const name = (user?.display_name || user?.name || "Fighter").slice(0, 24);
  const tags = [user?.weight_class, user?.stance].filter(Boolean).map((t) => String(t).toUpperCase());
  const season = rewards?.season;
  const pbs = (rewards?.personal_bests?.new || []).filter((b) => b.name !== "Overall").slice(0, 3);
  const beaten = rewards?.callouts_beaten?.[0];

  let headline = "TRAINED TODAY";
  if (beaten) headline = `TOOK ${String(beaten.challenger_name || "THE").toUpperCase()}'S TITLE`;
  else if (pbs.length) headline = pbs.length === 1 ? "NEW PERSONAL BEST" : `${pbs.length} NEW PERSONAL BESTS`;
  else if (season?.ranked_up) headline = "RANKED UP";

  const stats = pbs.map((b) => ({ label: b.name.toUpperCase(), value: String(Math.round(b.score)) }));
  if (typeof overall === "number") stats.unshift({ label: "OVERALL", value: overall.toFixed(1) });
  if (liveStats?.punches) stats.push({ label: "PUNCHES*", value: String(liveStats.punches) });

  return {
    name,
    tags,
    headline,
    rank: season?.rank ? `${String(season.rank).toUpperCase()} · SEASON ${season.number}` : null,
    stats: stats.slice(0, 4),
    footnote: liveStats?.punches ? "*counted live on the fighter's phone" : null,
  };
}
