// Between rounds the fighter gets one specific, earned line about the round they just did,
// framed as who they are rather than what they did (self-perception: we believe what
// we've seen ourselves do). Only live counts are used, and nothing is said without evidence.
export function roundPraise(round, ghostPunches = null) {
  if (!round || !round.punches) return null;
  if (ghostPunches != null && round.punches > ghostPunches) {
    return `${round.punches} punches, beating your best round (${ghostPunches}). Your engine's getting bigger.`;
  }
  if (round.guardPct != null && round.guardPct >= 80) {
    return `Guard up ${round.guardPct}% of that round. You keep your hands home.`;
  }
  if (round.bestCombo >= 5) {
    return `A ${round.bestCombo}-punch combination in there. You punch in bunches.`;
  }
  if (round.headMoves >= 15) {
    return `${round.headMoves} head movements. You're making yourself hard to hit.`;
  }
  return `${round.punches} punches thrown. That's work in the bank.`;
}

export const ordinal = (n) => {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};
