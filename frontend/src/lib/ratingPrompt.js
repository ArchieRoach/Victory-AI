// Asking for an App Store rating.
// Goal: more (and higher) App Store ratings; stars show in search and on the product page, and
//   apps under 4 stars convert far worse.
// Psychology: peak-end rule. People rate how they feel right now, so ask straight after a real
//   win (PB, boss beaten, level-up), never after a bad round and never from a button tap.
// Design: only inside the iPhone app, only after a real win, not in someone's first sessions, and
//   at most once every 120 days (Apple also caps the prompt at 3 a year and decides if it shows).
import { post } from "@/lib/nativeBridge";

export const RATING_ASKED_KEY = "victory_rating_asked_at";
export const RATING_GAP_DAYS = 120;
const DAY_MS = 24 * 60 * 60 * 1000;

export function shouldAskForRating({ won, newcomer, lastAskedAt, now = Date.now() }) {
  if (!won || newcomer) return false;
  return !lastAskedAt || now - lastAskedAt >= RATING_GAP_DAYS * DAY_MS;
}

export function maybeAskForRating({ won, newcomer }) {
  let last = null;
  try { last = Number(localStorage.getItem(RATING_ASKED_KEY)) || null; } catch {}
  if (!shouldAskForRating({ won, newcomer, lastAskedAt: last })) return false;
  if (!window.webkit?.messageHandlers?.victoryStore) return false;
  try { localStorage.setItem(RATING_ASKED_KEY, String(Date.now())); } catch {}
  post("victoryStore", { action: "review" });
  return true;
}
