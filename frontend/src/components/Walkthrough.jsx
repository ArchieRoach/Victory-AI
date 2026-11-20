import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/App";
import { claim, dismiss } from "@/lib/coachMarks";
import { createSpring, prefersReducedMotion, SPRING } from "@/lib/motion";
import { COVERS_TIPS, markWalkthroughDone, readySteps, walkthroughDone, walkthroughSteps } from "@/lib/walkthrough";
import { tx } from "@/i18n/tx";

// The first-time walkthrough. Rules and reasoning: lib/walkthrough.js.
// A dimmed screen with a cutout around the real button; the cutout glides (on a spring) from
// one button to the next so the eye follows it, and the card sits on whichever side has room.
const PAD = 8;
const RADIUS = 20;
const find = (id) => document.querySelector(`[data-testid="${id}"]`);
const visible = (id) => { const el = find(id); return !!el && el.getClientRects().length > 0; };

function rectOf(id) {
  const r = find(id)?.getBoundingClientRect();
  return r ? { x: r.left - PAD, y: r.top - PAD, w: r.width + PAD * 2, h: r.height + PAD * 2 } : null;
}

export function Walkthrough({ enabled }) {
  const { user } = useAuth() || {};
  const [steps, setSteps] = useState(null);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState(null);
  const holeRef = useRef(null);
  const springs = useRef(null);
  const nextRef = useRef(null);

  // Rule 3: wait until there's something on screen to point at.
  useEffect(() => {
    if (!enabled || walkthroughDone()) return undefined;
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      const ready = readySteps(walkthroughSteps(user), visible);
      if (ready && claim("walkthrough")) { setSteps(ready); clearInterval(timer); }
      if (tries > 40) clearInterval(timer);
    }, 250);
    return () => clearInterval(timer);
  }, [enabled, user]);

  const finish = useCallback(() => {
    markWalkthroughDone();
    COVERS_TIPS.forEach(dismiss);
    dismiss("walkthrough");
    setSteps(null);
  }, []);

  const step = steps?.[i];

  const measure = useCallback(() => {
    if (!step) return;
    const r = rectOf(step.target);
    if (!r) return;
    setRect(r);
    const s = springs.current;
    if (!s || prefersReducedMotion()) {
      Object.assign(holeRef.current?.style || {}, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
      return;
    }
    ["x", "y", "w", "h"].forEach((k) => s[k].to(r[k], { config: SPRING.default }));
  }, [step]);

  useLayoutEffect(() => {
    if (!steps || springs.current) return;
    const apply = { x: "left", y: "top", w: "width", h: "height" };
    const first = rectOf(steps[0].target) || { x: 0, y: 0, w: 0, h: 0 };
    springs.current = Object.fromEntries(Object.entries(apply).map(([k, css]) => [k, createSpring({
      from: first[k], onUpdate: (v) => { if (holeRef.current) holeRef.current.style[css] = `${v}px`; },
    })]));
  }, [steps]);

  useEffect(() => {
    if (!step) return undefined;
    const el = find(step.target);
    const box = el?.getBoundingClientRect();
    if (box && (box.top < 80 || box.bottom > window.innerHeight - 80)) el.scrollIntoView({ block: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" });
    const t = setTimeout(measure, 350);
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    nextRef.current?.focus();
    return () => { clearTimeout(t); window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure, true); };
  }, [step, measure]);

  useEffect(() => {
    if (!steps) return undefined;
    const onKey = (e) => { if (e.key === "Escape") finish(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [steps, finish]);

  if (!steps || !step) return null;
  const last = i === steps.length - 1;
  const below = rect ? rect.y + rect.h / 2 < window.innerHeight / 2 : true;
  const cardPos = rect
    ? (below ? { top: Math.min(rect.y + rect.h + 12, window.innerHeight - 260) } : { bottom: Math.max(window.innerHeight - rect.y + 12, 16) })
    : { bottom: 96 };

  return createPortal(
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={tx("ui.walkthrough.label", "Quick tour")} data-testid="walkthrough">
      {/* The cutout: everything except the real button is dimmed. Taps outside do nothing, so the tour can't be lost by accident. */}
      <div ref={holeRef} className="absolute pointer-events-none ring-2 ring-victory-lime/70"
        style={{ borderRadius: RADIUS, boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.68)", left: rect?.x, top: rect?.y, width: rect?.w, height: rect?.h }} />
      <div className="absolute inset-0" aria-hidden="true" />
      <div className="absolute left-4 right-4 mx-auto max-w-sm victory-card p-5 animate-fade-in" style={cardPos} key={i} aria-live="polite">
        <p className="text-[11px] font-bold tracking-[0.14em] uppercase text-victory-lime">{step.label}</p>
        <h2 className="font-heading font-bold text-xl text-victory-text mt-1">{step.title}</h2>
        <p className="text-sm text-victory-muted mt-2 leading-relaxed">{step.body}</p>
        <div className="flex items-center justify-between mt-4">
          <div className="flex items-center gap-1.5 shrink-0" aria-label={tx("ui.walkthrough.progress", "Step {{n}} of {{total}}", { n: i + 1, total: steps.length })}>
            {steps.map((s, n) => (
              <span key={s.target} className={`h-1.5 rounded-full transition-all ${n === i ? "w-5 bg-victory-lime" : "w-1.5 bg-victory-muted/40"}`} />
            ))}
          </div>
          <div className="flex items-center gap-1">
          {!last && (
            <button type="button" onClick={finish} className="px-3 min-h-[44px] text-sm text-victory-muted" data-testid="walkthrough-skip">
              {tx("ui.walkthrough.skip", "Skip")}
            </button>
          )}
          <button ref={nextRef} type="button" onClick={() => (last ? finish() : setI(i + 1))}
            className="victory-btn-primary !w-auto shrink-0 px-5 min-h-[44px] flex items-center gap-1.5" data-testid="walkthrough-next">
            {last ? tx("ui.walkthrough.done", "Let's go") : tx("ui.walkthrough.next", "Next")}
            {!last && <ArrowRight className="w-4 h-4" />}
          </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
