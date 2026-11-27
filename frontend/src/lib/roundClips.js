// The last few round recordings of this session, kept on the phone (never uploaded again) so the
// results page can cut a share clip from them. Each keeps the combos called and the punches
// counted, timed from the start of its recording.
const MAX_KEPT = 3;
let store = { sessionId: null, rounds: [] };

export function saveRoundClip(sessionId, clip) {
  if (!sessionId || !clip?.blob) return;
  if (store.sessionId !== sessionId) store = { sessionId, rounds: [] };
  store.rounds = [...store.rounds.filter((r) => r.round !== clip.round), clip].slice(-MAX_KEPT);
}

// The round worth sharing: the one with the most punches, else the longest.
export function bestRoundClip(sessionId) {
  if (store.sessionId !== sessionId || !store.rounds.length) return null;
  return [...store.rounds].sort((a, b) => (b.punches?.length || 0) - (a.punches?.length || 0) || b.durationMs - a.durationMs)[0];
}

export const _resetRoundClips = () => { store = { sessionId: null, rounds: [] }; };
