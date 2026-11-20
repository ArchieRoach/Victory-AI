import { useEffect, useRef, useState } from "react";
import { Confetti } from "@/components/Confetti";
import { createSpring, prefersReducedMotion } from "@/lib/motion";
import { haptic } from "@/lib/haptics";
import { tx } from "@/i18n/tx";

// The trophy moment (rebuilt from the Lottie brief: a small tilted cup springs up big, light rays
// burst out, sparkles twinkle, and it settles).
// Goal: winning a trophy feels like a real win, so people want the next one (visible progress).
// Psychology: a peak at the moment of earning ties the effort to the reward (peak-end rule), and
//   a reward only feels earned when it was (so this only ever plays for a real, logged win).
// Design: our own cup in theme colours with the trophy's own badge on it, a spring with a little
//   overshoot (a celebration earns it), one haptic, and it waits for a tap or moves on by itself.
//   Reduced motion: the cup appears still.
const C = (token, a = 1) => `rgb(var(--victory-${token}) / ${a})`;
const TIER = { legend: "lime", diamond: "teal", gold: "orange", silver: "muted", bronze: "orange" };
const POP = { damping: 0.5, response: 0.55 };
const RAYS = Array.from({ length: 12 }, (_, i) => i * 30);
const SPARKS = [[-78, -40, 0], [74, -58, 0.25], [-60, 52, 0.5], [82, 34, 0.15], [-20, -86, 0.4], [30, 78, 0.6]];

export function TrophyCup({ badge, tone = "orange", burst = true }) {
  const still = prefersReducedMotion();
  const [k, setK] = useState(still ? 1 : 0);
  const spring = useRef(null);
  useEffect(() => {
    if (still) return undefined;
    spring.current = createSpring({ from: 0, onUpdate: setK, config: POP });
    const t = setTimeout(() => spring.current.to(1), 120);
    return () => { clearTimeout(t); spring.current?.stop(); };
  }, [still]);
  const scale = 0.25 + 0.75 * k;
  const tilt = -28 * (1 - Math.min(1, k));
  return (
    <div className="relative w-52 h-52 flex items-center justify-center" aria-hidden="true">
      {burst && !still && (
        <svg viewBox="-100 -100 200 200" className="absolute inset-0 w-full h-full trophy-rays">
          {RAYS.map((a) => (
            <line key={a} x1="0" y1="-58" x2="0" y2={a % 60 ? -74 : -86} transform={`rotate(${a})`}
              style={{ stroke: C(tone, 0.85), strokeWidth: 3, strokeLinecap: "round" }} />
          ))}
        </svg>
      )}
      {burst && !still && SPARKS.map(([x, y, d], i) => (
        <span key={i} className="absolute trophy-spark font-heading font-bold" style={{ transform: `translate(${x}px, ${y}px)`, animationDelay: `${0.5 + d}s`, color: C(i % 2 ? "lime" : tone) }}>+</span>
      ))}
      <svg viewBox="0 0 120 140" className="relative w-32 h-36" style={{ transform: `scale(${scale}) rotate(${tilt}deg)`, transformOrigin: "50% 70%",
        filter: `drop-shadow(0 10px 24px ${C(tone, 0.45)})` }}>
        <defs>
          <linearGradient id="cup-body" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style={{ stopColor: C("lime") }} />
            <stop offset="1" style={{ stopColor: C(tone) }} />
          </linearGradient>
        </defs>
        <path d="M28 22 C8 22 6 52 34 58" fill="none" style={{ stroke: C(tone), strokeWidth: 9, strokeLinecap: "round" }} />
        <path d="M92 22 C112 22 114 52 86 58" fill="none" style={{ stroke: C(tone), strokeWidth: 9, strokeLinecap: "round" }} />
        <path d="M26 12 H94 V40 C94 64 78 78 60 78 C42 78 26 64 26 40 Z" fill="url(#cup-body)" />
        <path d="M34 18 H46 V44 C46 56 40 62 36 60 C34 52 34 40 34 18 Z" fill="white" opacity="0.28" className="trophy-shine" />
        <rect x="52" y="76" width="16" height="22" rx="3" style={{ fill: C(tone) }} />
        <rect x="32" y="96" width="56" height="24" rx="8" style={{ fill: C("card-highlight") }} />
        <rect x="44" y="104" width="32" height="7" rx="3.5" style={{ fill: C("text", 0.85) }} />
      </svg>
      <span className="absolute text-3xl" style={{ top: "33%", transform: `scale(${scale})` }}>{badge || "★"}</span>
    </div>
  );
}

export function TrophyCelebration({ items, onDone }) {
  const item = items?.[0];
  const advance = () => onDone?.(item);

  useEffect(() => {
    if (!item) return undefined;
    haptic("success");
    const timer = setTimeout(advance, 6000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);

  if (!item) return null;
  const tone = TIER[item.tier] || "orange";
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4" role="dialog" aria-live="assertive"
      aria-label={tx("ui.trophyCelebration.newTrophy", "New trophy: {{name}}", { name: item.name })} data-testid="trophy-celebration">
      <Confetti />
      <div className="absolute inset-0" onClick={advance}
        style={{ background: C("bg", 0.88), backgroundImage: `radial-gradient(ellipse at center, ${C(tone, 0.3)} 0%, transparent 65%)` }} />
      <div key={item.id} className="relative flex flex-col items-center text-center max-w-sm w-full">
        <TrophyCup badge={item.emoji} tone={tone} />
        <p className="streak-reveal font-heading font-extrabold tracking-widest text-sm uppercase mt-1" style={{ color: C(tone) }}>
          {tx("ui.trophyCelebration.youEarned", "Trophy earned")}
        </p>
        <p className="streak-reveal font-heading font-extrabold text-3xl text-victory-text mt-1">{item.name}</p>
        {item.desc && <p className="streak-reveal text-victory-muted text-sm mt-1 max-w-[18rem]">{item.desc}</p>}
        <button onClick={advance} className="streak-reveal mt-5 min-h-[44px] px-8 rounded-full font-heading font-bold"
          style={{ background: C(tone), color: C("bg") }} data-testid="trophy-continue">
          {items.length > 1 ? tx("ui.trophyCelebration.next", "Next") : tx("ui.trophyCelebration.continue", "Continue")}
        </button>
      </div>
    </div>
  );
}
