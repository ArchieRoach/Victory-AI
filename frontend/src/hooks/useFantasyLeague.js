import { useEffect, useMemo, useRef, useState } from "react";
import { createFantasyService } from "@/lib/fantasyService";
import { rankLeague, scoreStable } from "@/lib/fantasyScoring";

// Connects the sidecar UI to the fantasy service and derives everything the panels show.
// REAL-TIME HOOK-UP: when the backend exists, create the service with your API client and
// feed WebSocket messages into service.applyServerBout / applyServerLeague (see
// lib/fantasyService.js). This hook and the components don't need to change.
export function useFantasyLeague({ cardId, user }) {
  const me = useMemo(
    () => ({ user_id: user?.user_id || "guest", name: user?.display_name || user?.name || "You" }),
    [user?.user_id, user?.display_name, user?.name],
  );
  const service = useMemo(() => createFantasyService({ cardId, me }), [cardId, me]);
  const [snap, setSnap] = useState(() => service.getSnapshot());
  const prevRanks = useRef({});
  const [movement, setMovement] = useState({});

  useEffect(() => {
    setSnap(service.getSnapshot());
    return service.subscribe(setSnap);
  }, [service]);

  const league = useMemo(() => rankLeague(snap.league, snap.card), [snap]);

  // Rank change since the last result, for the ▲▼ indicators on the leaderboard.
  useEffect(() => {
    const next = {};
    league.forEach((m) => {
      const before = prevRanks.current[m.user_id];
      if (before != null && before !== m.rank) next[m.user_id] = before - m.rank;
    });
    if (Object.keys(next).length) setMovement(next);
    prevRanks.current = Object.fromEntries(league.map((m) => [m.user_id, m.rank]));
  }, [league]);

  const myStable = useMemo(() => scoreStable(snap.me.picks, snap.card), [snap]);

  return { service, card: snap.card, me: snap.me, league, movement, myStable };
}
