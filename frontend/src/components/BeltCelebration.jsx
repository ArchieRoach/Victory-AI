import { useEffect, useState } from "react";
import { TrophyCelebration } from "@/components/TrophyCelebration";
import { firstTime, markSeen } from "@/lib/trophyMoments";

// Belt unlocks are earned from a real logged session (see check_and_award_belts), never a random
// reward, so each one gets the full trophy moment, once.
export function BeltCelebration({ belts, onDone }) {
  const [fresh] = useState(() => new Set((belts || []).filter((b) => firstTime(`belt:${b.belt_id}`)).map((b) => b.belt_id)));
  const items = (belts || []).filter((b) => fresh.has(b.belt_id)).map((b) => ({ ...b, id: b.belt_id }));
  const done = (it) => {
    markSeen(`belt:${it?.id}`);
    onDone((belts || []).find((b) => b.belt_id === it?.id));
  };
  const seenAll = !items.length && !!belts?.length;
  useEffect(() => { if (seenAll) belts.forEach((b) => onDone(b)); }, [seenAll]); // eslint-disable-line react-hooks/exhaustive-deps
  return <TrophyCelebration items={items} onDone={done} />;
}
