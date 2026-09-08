import { useState, useEffect } from "react";

const STORAGE_PREFIX = "victory_tip_seen_";

// Timely, contextual help — shown once, right where and when a control is first
// encountered (mid-flow, not front-loaded into onboarding and assumed to stick).
// Tesler's Law: "help should be accessible where and when a user actually needs it,
// fitting whatever path they took to get there." Per-id, so it never repeats once seen.
export function FirstUseTip({ id, tip, position = "top", children }) {
  const [seen, setSeen] = useState(() => {
    try { return !!localStorage.getItem(STORAGE_PREFIX + id); } catch { return true; }
  });

  useEffect(() => {
    if (seen) return;
    const timer = setTimeout(dismiss, 6000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seen]);

  const dismiss = () => {
    try { localStorage.setItem(STORAGE_PREFIX + id, "1"); } catch {}
    setSeen(true);
  };

  return (
    <div className="relative inline-block">
      {children}
      {!seen && (
        <div
          className={`absolute z-40 ${position === "top" ? "bottom-full mb-3" : "top-full mt-3"} left-1/2 -translate-x-1/2 w-max max-w-[190px]`}
          data-testid={`tip-${id}`}
        >
          <div className="victory-card border border-victory-lime/40 rounded-xl px-3 py-2 shadow-lg text-left">
            <p className="text-victory-text text-xs leading-snug">{tip}</p>
            <button onClick={dismiss} className="text-victory-lime text-[11px] font-bold mt-1.5 touch-target -m-1 p-1">
              Got it
            </button>
          </div>
          <div
            className={`absolute left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-victory-card border-victory-lime/40 rotate-45 ${
              position === "top" ? "-bottom-[5px] border-b border-r" : "-top-[5px] border-t border-l"
            }`}
          />
        </div>
      )}
    </div>
  );
}
