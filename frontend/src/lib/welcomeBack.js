const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// Every line is built from real numbers; anything missing is left out rather than invented.
export function welcomeBackLines(d, name = "") {
  const headline = `${name ? `Good to see you, ${name}.` : "Good to see you."} ${d.days_away} days away, nothing lost.`;
  const parts = [plural(d.sessions, "session")];
  if (typeof d.best_overall === "number") parts.push(`a best score of ${d.best_overall}`);
  if (d.badge) parts.push(`the ${d.badge} badge`);
  const built = `You've built ${parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0]}. It's all still here.`;
  const missed = d.squad_sessions > 0 ? `Your squad trained ${plural(d.squad_sessions, "time")} while you were away.` : null;
  return { headline, built, missed };
}
