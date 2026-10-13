import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { ArrowLeft, Sparkles } from "lucide-react";
import { API } from "@/App";
import { BragButton } from "@/components/progress/BragButton";
import { createSpring, createVelocityTracker, project, rubberband, prefersReducedMotion, SPRING } from "@/lib/motion";
import { haptic } from "@/lib/haptics";

// The cards move like a physical stack (Apple's fluid-interface rules): they follow the finger
// 1:1, a flick lands on the card it was heading for, the ends resist, and a card can be grabbed
// mid-slide. Tap still works, and arrow keys too.
function useSwipeDeck(count, index, setIndex) {
  const trackRef = useRef(null);
  const width = useRef(1);
  const drag = useRef(null);
  const tracker = useRef(createVelocityTracker());
  const reduced = useRef(prefersReducedMotion());
  const spring = useRef(null);
  if (!spring.current) {
    spring.current = createSpring({ from: 0, onUpdate: (x) => { if (trackRef.current) trackRef.current.style.transform = `translate3d(${x}px,0,0)`; } });
  }
  const goTo = useCallback((i, velocity = 0) => {
    const next = Math.max(0, Math.min(count - 1, i));
    setIndex(next);
    const x = -next * width.current;
    if (reduced.current) spring.current.set(x);
    else spring.current.to(x, { velocity, config: Math.abs(velocity) > 300 ? SPRING.sheet : SPRING.default });
  }, [count, setIndex]);

  useEffect(() => {
    const measure = () => {
      width.current = trackRef.current?.parentElement?.clientWidth || 1;
      spring.current.set(-index * width.current);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [count]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlers = {
    onPointerDown: (e) => {
      drag.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, start: spring.current.get(), active: false };
      tracker.current.reset();
    },
    onPointerMove: (e) => {
      const d = drag.current;
      if (!d || d.id !== e.pointerId) return;
      const dx = e.clientX - d.x0;
      if (!d.active) {
        if (Math.abs(dx) < 10) return;
        if (Math.abs(e.clientY - d.y0) > Math.abs(dx)) { drag.current = null; return; }
        d.active = true; d.x0 = e.clientX; d.start = spring.current.get();
        e.currentTarget.setPointerCapture?.(e.pointerId);
      }
      const min = -(count - 1) * width.current;
      let x = d.start + (e.clientX - d.x0);
      if (x > 0) x = rubberband(x, width.current);
      if (x < min) x = min + rubberband(x - min, width.current);
      spring.current.set(x);
      tracker.current.add(e.timeStamp || performance.now(), x);
    },
    onPointerUp: (e) => {
      const d = drag.current;
      drag.current = null;
      if (!d) return;
      if (!d.active) { if (index < count - 1) goTo(index + 1); return; } // a tap moves on
      const v = tracker.current.velocity();
      const landing = spring.current.get() + project(v, 0.99);
      const target = Math.round(-landing / width.current);
      const next = Math.max(index - 1, Math.min(index + 1, target)); // one card per flick
      if (next !== index) haptic("selection");
      goTo(next, v);
    },
  };
  handlers.onPointerCancel = handlers.onPointerUp;
  return { trackRef, handlers, goTo };
}

// Season Wrapped (peak-end): a few cards that tell the season from real numbers and end on
// who the fighter became. Reasoning in backend/gamification.py (wrapped_cards).
export default function SeasonWrappedPage() {
  const navigate = useNavigate();
  const [w, setW] = useState(null);
  const [i, setI] = useState(0);
  useEffect(() => {
    axios.get(`${API}/users/me/season-wrapped`).then((r) => setW(r.data)).catch(() => setW({ ready: false }));
  }, []);

  const cards = w?.cards || [];
  const card = cards[i];
  const last = i === cards.length - 1;
  const { trackRef, handlers, goTo } = useSwipeDeck(cards.length, i, setI);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowRight") goTo(i + 1);
      if (e.key === "ArrowLeft") goTo(i - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [i, goTo]);

  return (
    <div className="min-h-screen bg-victory-bg flex flex-col" data-testid="wrapped-page">
      <header className="p-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} aria-label="Go back"
          className="w-11 h-11 rounded-full bg-victory-card border border-victory-border flex items-center justify-center">
          <ArrowLeft className="w-5 h-5 text-victory-text" />
        </button>
        <h1 className="flex-1 text-lg font-heading font-bold text-victory-text">{w?.name ? `${w.name} Wrapped` : "Season Wrapped"}</h1>
      </header>
      <main className="flex-1 max-w-md w-full mx-auto p-4 flex flex-col">
        {!w && <div className="skeleton-shimmer h-96 rounded-2xl" />}
        {w && !w.ready && (
          <div className="victory-card p-6 text-center space-y-2">
            <Sparkles className="w-8 h-8 mx-auto text-victory-lime" />
            <p className="text-victory-text font-heading font-bold">Your Wrapped arrives when the season ends</p>
            {w.opens_in_days != null && <p className="text-victory-muted text-sm">{w.next || "Wrapped"} in {w.opens_in_days} days. Every session adds to the story.</p>}
          </div>
        )}
        {card && (
          <>
            <div className="flex gap-1 mb-4" aria-hidden="true">
              {cards.map((_, n) => <div key={n} className={`h-1 flex-1 rounded-full ${n <= i ? "bg-victory-lime" : "bg-victory-card-highlight"}`} />)}
            </div>
            <div className="flex-1 overflow-hidden rounded-2xl" style={{ touchAction: "pan-y" }} {...handlers}
              role="group" aria-roledescription="carousel" aria-label={`Card ${i + 1} of ${cards.length}`}>
              <div ref={trackRef} className="flex h-full" style={{ willChange: "transform" }}>
                {cards.map((c, n) => (
                  <div key={n} className="w-full flex-shrink-0 h-full" aria-hidden={n !== i}>
                    <div className="h-full victory-card rounded-2xl p-8 flex flex-col items-center justify-center text-center gap-3 min-h-[24rem] select-none">
                      <p className="section-label">{c.label}</p>
                      <p className="font-heading font-extrabold text-5xl text-victory-lime break-words">{c.big}</p>
                      <p className="text-victory-text text-base max-w-xs">{c.line}</p>
                      {n < cards.length - 1 && <p className="text-[11px] text-victory-muted mt-4">Swipe or tap for the next one</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {last && (
              <div className="mt-4 space-y-2">
                <BragButton win={{ kind: "wrapped", season: w.name, trait: card.big }} label="Share your season" />
                <button className="victory-btn-ghost" onClick={() => goTo(0)}>Watch again</button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
