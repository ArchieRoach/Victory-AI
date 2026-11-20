// The trophy moment plays once per trophy, the first time you see the win (not on every revisit).
const KEY = "victory_trophies_seen";

function seen() {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}

export function firstTime(id) {
  return !!id && !seen().includes(id);
}

export function markSeen(id) {
  if (!id) return;
  try { localStorage.setItem(KEY, JSON.stringify([...seen(), id].slice(-50))); } catch {}
}
