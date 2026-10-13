import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { createSpring, createVelocityTracker, project, rubberband, prefersReducedMotion, SPRING } from "@/lib/motion";
import { haptic } from "@/lib/haptics";
import { GlassView } from "expo-glass-effect";

// A sheet that behaves like a physical object (Apple's fluid-interface rules):
// - it rises from the bottom and leaves the same way (spatial consistency);
// - drag it and it stays glued to your finger from where you grabbed it, 1:1;
// - flick it and it goes where the flick was heading (momentum projection), carrying the
//   finger's speed into the spring (velocity handoff);
// - grab it mid-animation and it stops right there (interruptible);
// - pull it up past the top and it resists (rubber-banding);
// - the background dims with it, because a sheet is a focused task.
// With reduced motion it simply fades.
const HYSTERESIS = 10;

export function BottomSheet({ onClose, label, children, className = "", testId }) {
  const sheetRef = useRef(null);
  const scrimRef = useRef(null);
  const heightRef = useRef(600);
  const onRest = useRef(null);
  const drag = useRef(null);
  const tracker = useRef(createVelocityTracker());
  const reduced = useRef(prefersReducedMotion());
  const closing = useRef(false);

  const apply = useCallback((y) => {
    const h = heightRef.current || 1;
    if (sheetRef.current) sheetRef.current.style.transform = `translate3d(0, ${y}px, 0)`;
    if (scrimRef.current) scrimRef.current.style.opacity = String(Math.max(0, Math.min(1, 1 - y / h)));
  }, []);

  const spring = useRef(null);
  if (!spring.current) {
    spring.current = createSpring({
      from: 2000,
      onUpdate: (y) => apply(y),
      onRest: () => { const f = onRest.current; onRest.current = null; f?.(); },
    });
  }

  const close = useCallback((velocity = 0) => {
    if (closing.current) return;
    closing.current = true;
    if (reduced.current) {
      if (sheetRef.current) sheetRef.current.style.opacity = "0";
      if (scrimRef.current) scrimRef.current.style.opacity = "0";
      setTimeout(() => onClose?.(), 160);
      return;
    }
    onRest.current = () => onClose?.();
    spring.current.to(heightRef.current + 24, { velocity, config: SPRING.default });
  }, [onClose]);

  useLayoutEffect(() => {
    const el = sheetRef.current;
    heightRef.current = el?.offsetHeight || 600;
    if (reduced.current) {
      el.style.transform = "none";
      return;
    }
    spring.current.set(heightRef.current);
    spring.current.to(0, { config: SPRING.default });
  }, []);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sheetRef.current?.focus({ preventScroll: true });
    const onKey = (e) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    const s = spring.current;
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); s.stop(); };
  }, [close]);

  const scrolledInside = (target) => {
    for (let n = target; n && n !== sheetRef.current; n = n.parentElement) {
      if (n.scrollHeight > n.clientHeight + 1 && getComputedStyle(n).overflowY.match(/auto|scroll/) && n.scrollTop > 0) return true;
    }
    return false;
  };

  const onPointerDown = (e) => {
    if (reduced.current || e.button > 0 || scrolledInside(e.target)) return;
    if (closing.current) { closing.current = false; onRest.current = null; } // grabbed while leaving: stop and follow
    drag.current = { id: e.pointerId, startY: e.clientY, startPos: spring.current.get(), active: false };
    tracker.current.reset();
  };

  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dy = e.clientY - d.startY;
    if (!d.active) {
      if (Math.abs(dy) < HYSTERESIS) return;
      if (dy < 0 && d.startPos <= 0) { drag.current = null; return; } // an upward swipe on content is a scroll
      d.active = true;
      d.startY = e.clientY;
      d.startPos = spring.current.get(); // start from what's on screen, not where it was heading
      sheetRef.current.setPointerCapture?.(e.pointerId);
    }
    let y = d.startPos + (e.clientY - d.startY);
    if (y < 0) y = rubberband(y, heightRef.current);
    spring.current.set(y);
    tracker.current.add(e.timeStamp || performance.now(), y);
  };

  const onPointerUp = (e) => {
    const d = drag.current;
    drag.current = null;
    if (!d?.active) return;
    // The drag just ended: swallow the click it would otherwise turn into.
    const stop = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
    window.addEventListener("click", stop, { capture: true, once: true });
    setTimeout(() => window.removeEventListener("click", stop, { capture: true }), 0);
    const v = e.type === "pointercancel" ? 0 : tracker.current.velocity();
    const y = spring.current.get();
    if (y + project(v) > heightRef.current * 0.5) {
      haptic("snap");
      close(v);
    } else {
      spring.current.to(0, { velocity: v, config: v < -50 ? SPRING.sheet : SPRING.default });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col" data-testid={testId}>
      <div ref={scrimRef} className="absolute inset-0 bg-black/55 sheet-scrim" style={{ opacity: 0 }} onClick={() => close()} aria-hidden="true" />
      <GlassView
        ref={sheetRef}
        glassEffectStyle="regular"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={`sheet-surface relative mt-auto max-h-[92vh] flex flex-col pb-safe outline-none ${className}`}
        style={{ transform: "translate3d(0, 100vh, 0)", touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="pt-3 pb-1 flex justify-center flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-victory-muted/40" />
        </div>
        {typeof children === "function" ? children({ close }) : children}
      </GlassView>
    </div>
  );
}
