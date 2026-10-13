import { useEffect, useState, useSyncExternalStore } from "react";
import { useAuth } from "@/App";
import { GlassView } from "expo-glass-effect";
import { activeTip, claim, dismiss, release, subscribe, tipContext, tipText } from "@/lib/coachMarks";

// A personalised tip that appears beside the thing it explains, at the moment it's first met.
// The rules (one at a time, 3 a day, shown once, never mid-round) live in lib/coachMarks.js.
// `hold` keeps it waiting (e.g. while a round is running); it appears once released.
export function CoachMark({ id, tip, position = "top", hold = false, delay = 700, children, block = false }) {
  const { user } = useAuth() || {};
  const current = useSyncExternalStore(subscribe, activeTip, activeTip);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (hold) { release(id); setReady(false); return undefined; }
    const t = setTimeout(() => setReady(claim(id)), delay);
    return () => clearTimeout(t);
  }, [id, hold, delay, current]);

  useEffect(() => () => release(id), [id]);

  const open = ready && current === id && !hold;
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") dismiss(id); };
    window.addEventListener("keydown", onKey);
    const t = setTimeout(() => dismiss(id), 9000); // read once, then out of the way
    return () => { window.removeEventListener("keydown", onKey); clearTimeout(t); };
  }, [open, id]);

  const text = tipText(id, tipContext(user), tip);
  return (
    <div className={`relative ${block ? "block" : "inline-block"}`}>
      {children}
      {open && (
        <div role="status" aria-live="polite"
          className={`absolute z-40 ${position === "top" ? "bottom-full mb-3" : "top-full mt-3"} left-1/2 -translate-x-1/2 w-max max-w-[240px] animate-fade-in`}
          data-testid={`tip-${id}`}>
          <GlassView glassEffectStyle="regular" className="px-3 py-2.5 text-left">
            <p className="text-victory-text text-xs leading-snug">{text}</p>
            <button onClick={() => dismiss(id)} className="text-victory-lime text-[11px] font-bold mt-1.5 min-h-[32px] px-1 -mx-1">
              Got it
            </button>
          </GlassView>
        </div>
      )}
    </div>
  );
}
