import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { tx } from "@/i18n/tx";

// Goal: set up in under 10 seconds, in frame, and never told mid-round to move.
// Psychology: fix it before it matters (an error prevented beats an error reported), and a
//   tripod user shouldn't have to walk back to the phone (least effort).
// Design: the camera with a body outline. Once shoulders and hands are in the picture for a
//   moment, a 3-2-1 starts the round by itself. "Step back" / "Step closer" otherwise.
const HOLD_MS = 1200;

const MESSAGES = {
  get ok() { return tx("ui.framingCheck.ok", "You're in frame"); },
  get back() { return tx("ui.framingCheck.back", "Step back"); },
  get closer() { return tx("ui.framingCheck.closer", "Step closer"); },
  get searching() { return tx("ui.framingCheck.searching", "Stand where your shoulders and hands are in the outline"); },
};

export function FramingCheck({ videoRef, framing, mirror, portrait = true, onStart, onCancel }) {
  const [count, setCount] = useState(null);
  const okSince = useRef(0);

  useEffect(() => {
    if (framing !== "ok") { okSince.current = 0; if (count !== null && count > 0) setCount(null); return undefined; }
    if (!okSince.current) okSince.current = performance.now();
    const id = setInterval(() => {
      if (count === null && performance.now() - okSince.current >= HOLD_MS) setCount(3);
    }, 150);
    return () => clearInterval(id);
  }, [framing, count]);

  // The page re-renders several times a second while the camera checks the framing, so the
  // start handler is kept in a ref and the countdown only depends on the count itself.
  const startRef = useRef(onStart);
  startRef.current = onStart;
  const started = useRef(false);
  useEffect(() => {
    if (count === null) return undefined;
    if (count === 0) {
      if (!started.current) { started.current = true; startRef.current(); }
      return undefined;
    }
    const id = setTimeout(() => setCount((c) => (c == null ? c : c - 1)), 800);
    return () => clearTimeout(id);
  }, [count]);

  const ok = framing === "ok";
  return (
    <div className="fixed inset-0 z-[70] bg-victory-bg flex flex-col items-center justify-center p-4 gap-4" data-testid="framing-check">
      <div className="relative h-[70vh] max-w-full rounded-3xl overflow-hidden bg-black" style={{ aspectRatio: portrait ? "9 / 16" : "16 / 9" }}>
        <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover"
          style={mirror ? { transform: "scaleX(-1)" } : undefined} />
        <svg viewBox="0 0 90 160" className={`absolute inset-0 w-full h-full pointer-events-none ${ok ? "text-victory-lime" : "text-white/70"}`} aria-hidden="true">
          <g fill="none" stroke="currentColor" strokeWidth="1.2" strokeDasharray={ok ? "0" : "3 2"}>
            <circle cx="45" cy="34" r="9" />
            <path d="M28 52 Q45 46 62 52 L66 92 M28 52 L24 92 M34 56 L36 104 L33 150 M56 56 L54 104 L57 150 M36 104 L54 104" />
            <path d="M28 52 L22 40 L30 30 M62 52 L68 40 L60 30" />
          </g>
        </svg>
        {count !== null && count > 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <span className="font-heading font-extrabold text-victory-lime text-9xl" data-testid="framing-countdown">{count}</span>
          </div>
        )}
        <div className={`absolute top-4 inset-x-4 mx-auto w-fit max-w-[90%] px-4 py-2 rounded-full text-center font-heading font-bold flex items-center gap-2 ${
          ok ? "bg-victory-lime text-victory-bg" : "bg-black/70 text-white"}`} aria-live="polite" data-testid="framing-status">
          {ok && <Check className="w-5 h-5" />}
          <span className={framing === "searching" ? "text-sm" : "text-lg"}>{MESSAGES[framing] || MESSAGES.searching}</span>
        </div>
      </div>
      <div className="flex gap-3 w-full max-w-sm">
        <button type="button" onClick={onCancel} className="victory-btn-ghost flex-1">{tx("ui.framingCheck.back2", "Back")}</button>
        <button type="button" onClick={() => { if (!started.current) { started.current = true; onStart(); } }} className="victory-btn-primary flex-1" data-testid="framing-start">{tx("ui.framingCheck.startNow", "Start now")}</button>
      </div>
    </div>
  );
}
