// Home that follows what you do (Bartle's player types).
// Goal: every kind of fighter finds their favourite thing fast.
// Psychology: people stay where their main drive is fed. Competitors want ranks, socialisers
//   their crew, explorers something new, and the same person shifts over time, so we copy
//   what they tap rather than asking them to pick a label.
// Design: the three drive cards are ordered by recent taps on this device. Nothing is hidden,
//   only moved, and "Reset my Home" puts the default order back.

export const DRIVE_CARDS = ["compete", "crew", "explore"];
const KEY = "victory_home_taps";
const DECAY = 0.9; // older taps fade, so the order follows who you are now

export function orderCards(taps = {}) {
  return [...DRIVE_CARDS].sort((a, b) => (taps[b] || 0) - (taps[a] || 0) || DRIVE_CARDS.indexOf(a) - DRIVE_CARDS.indexOf(b));
}

export function addTap(taps = {}, card) {
  const next = {};
  DRIVE_CARDS.forEach((c) => { next[c] = Math.round((taps[c] || 0) * DECAY * 100) / 100; });
  next[card] = (next[card] || 0) + 1;
  return next;
}

export function readTaps(store = typeof localStorage !== "undefined" ? localStorage : null) {
  try { return JSON.parse(store?.getItem(KEY) || "{}") || {}; } catch { return {}; }
}

export function recordTap(card, store = typeof localStorage !== "undefined" ? localStorage : null) {
  const next = addTap(readTaps(store), card);
  try { store?.setItem(KEY, JSON.stringify(next)); } catch {}
  return next;
}

export function resetTaps(store = typeof localStorage !== "undefined" ? localStorage : null) {
  try { store?.removeItem(KEY); } catch {}
}
