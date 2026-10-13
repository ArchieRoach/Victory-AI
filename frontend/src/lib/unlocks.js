import { useEffect, useState } from "react";
import axios from "axios";

// Unlock as you go (rules and reasoning: backend/gamification.py FEATURE_UNLOCKS).
// New fighters see a few things at a time; each feature arrives after a real session.
// If the list can't be loaded, everything shows: an experienced fighter is never locked out.
export const ALL_OPEN = { sessions: null, unlocked: null, next: null, newcomer: false };

export function isUnlocked(data, key) {
  if (!data) return false;
  if (data.unlocked === null) return true;
  return data.unlocked.includes(key);
}

export function nextUnlockLine(next) {
  if (!next) return null;
  const n = next.sessions_to_go;
  return `Train ${n === 1 ? "once more" : `${n} more times`} to unlock ${next.name}.`;
}

let cache = null;

export function useUnlocks(api) {
  const [data, setData] = useState(cache);
  useEffect(() => {
    let live = true;
    axios.get(`${api}/unlocks`)
      .then((r) => { cache = r.data; if (live) setData(r.data); })
      .catch(() => { if (live) setData(ALL_OPEN); });
    return () => { live = false; };
  }, [api]);
  return data;
}
