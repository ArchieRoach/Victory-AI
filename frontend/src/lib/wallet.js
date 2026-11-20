// The wallet card (rebuilt from the Lottie brief: a wallet opens and a card slides up showing the
// balance). Rules and reasoning for the numbers: backend/earnings.py (wallet).
export const gbp = (pence) => `£${(Math.max(0, pence || 0) / 100).toFixed(2)}`;

// While the card slides out the number counts up with it, so the money feels like it's arriving.
export function countUp(pence, progress) {
  const p = Math.min(1, Math.max(0, progress));
  return Math.round((pence || 0) * p);
}

export function sourceRows(sources = []) {
  return sources.filter((s) => s.pence > 0 || s.paid_pence > 0);
}
