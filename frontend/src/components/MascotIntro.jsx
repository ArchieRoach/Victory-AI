import { useCallback, useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "@/lib/motion";
import { COMBO, ENTER_MS, GLINT_EVERY_MS, IDLE_JAB_EVERY_MS, KEYFRAMES, SPOTS } from "@/lib/mascotMotion";
import { tx } from "@/i18n/tx";

// The animated mascot. The choreography and the reasoning live in lib/mascotMotion.js.
const C = (token, a = 1) => `rgb(var(--victory-${token}) / ${a})`;
const SRC = "/mascot-render.png";

function play(el, frames, options) {
  if (!el || typeof el.animate !== "function") return null;
  return el.animate(frames, { fill: "both", ...options });
}

function Burst({ innerRef }) {
  return (
    <svg ref={innerRef} viewBox="0 0 100 100" className="absolute w-[28%] pointer-events-none" style={{ opacity: 0, left: 0, top: 0 }} aria-hidden="true">
      <polygon points="50,2 58,34 92,18 68,46 98,58 64,64 76,96 50,72 24,96 36,64 2,58 32,46 8,18 42,34"
        style={{ fill: C("orange", 0.9), stroke: C("lime"), strokeWidth: 3 }} />
      <circle cx="50" cy="50" r="14" style={{ fill: C("text", 0.95) }} />
    </svg>
  );
}

export function MascotIntro({ className = "h-60", wordmark = true }) {
  const stage = useRef(null);
  const fighter = useRef(null);
  const shadow = useRef(null);
  const ropes = useRef(null);
  const dust = useRef(null);
  const title = useRef(null);
  const glint = useRef(null);
  const burst = useRef(null);
  const busy = useRef(false);
  const still = prefersReducedMotion();
  const [ready, setReady] = useState(false);
  const onImg = useCallback((el) => { if (el?.complete && el.naturalWidth) setReady(true); }, []);

  const punch = useCallback((steps) => {
    if (still || busy.current) return;
    busy.current = true;
    steps.forEach(({ move, glove, at, ms }) => setTimeout(() => {
      play(fighter.current, KEYFRAMES[move], { duration: ms, fill: "none" });
      const b = burst.current;
      if (b) {
        b.style.left = `${SPOTS[glove].x * 100}%`;
        b.style.top = `${SPOTS[glove].y * 100}%`;
        play(b, KEYFRAMES.impact, { duration: 320, delay: ms * 0.3 });
      }
    }, at));
    const end = Math.max(...steps.map((s) => s.at + s.ms));
    setTimeout(() => { busy.current = false; }, end + 80);
  }, [still]);

  useEffect(() => {
    if (still || !ready) return undefined;
    play(fighter.current, KEYFRAMES.dropIn, { duration: ENTER_MS });
    play(shadow.current, KEYFRAMES.shadowIn, { duration: ENTER_MS });
    play(ropes.current, KEYFRAMES.ropes, { duration: 600, delay: ENTER_MS * 0.62, fill: "none" });
    play(dust.current, KEYFRAMES.dust, { duration: 520, delay: ENTER_MS * 0.62 });
    play(title.current, KEYFRAMES.titleSlam, { duration: 560, delay: ENTER_MS * 0.75 });
    const timers = [
      setTimeout(() => stage.current?.classList.add("mascot-idle"), ENTER_MS),
      setTimeout(() => play(glint.current, KEYFRAMES.glint, { duration: 900, fill: "none" }), ENTER_MS + 250),
    ];
    const glints = setInterval(() => play(glint.current, KEYFRAMES.glint, { duration: 900, fill: "none" }), GLINT_EVERY_MS);
    const jabs = setInterval(() => punch(COMBO.slice(0, 1)), IDLE_JAB_EVERY_MS);
    return () => { timers.forEach(clearTimeout); clearInterval(glints); clearInterval(jabs); };
  }, [still, ready, punch]);

  const belt = SPOTS.belt;
  return (
    <div className="flex flex-col items-center select-none" data-testid="mascot-intro">
      <div className={`relative ${className} aspect-[397/540]`}>
        {/* Ring ropes behind him */}
        <div ref={ropes} className="absolute inset-x-[-30%] top-[38%] space-y-[9%] pointer-events-none" aria-hidden="true">
          {["danger", "text", "danger"].map((tone, i) => (
            <span key={i} className="block h-[3px] rounded-full" style={{ background: C(tone, i === 1 ? 0.25 : 0.45) }} />
          ))}
        </div>
        <span ref={shadow} className="absolute left-[18%] right-[18%] bottom-[-2%] h-[6%] rounded-[50%] pointer-events-none"
          style={{ background: C("border", 0.9), filter: "blur(6px)", opacity: still ? 0.75 : 0 }} aria-hidden="true" />
        <span ref={dust} className="absolute left-[10%] right-[10%] bottom-[-4%] h-[10%] rounded-[50%] pointer-events-none"
          style={{ background: `radial-gradient(ellipse, ${C("muted", 0.45)}, transparent 70%)`, opacity: 0 }} aria-hidden="true" />

        <button type="button" onClick={() => punch(COMBO)} aria-label={tx("ui.mascotIntro.tapHim", "Victory AI. Tap him for a one-two")}
          className="absolute inset-0 w-full h-full cursor-pointer [-webkit-tap-highlight-color:transparent]" data-testid="mascot-tap">
          <span ref={stage} className="absolute inset-0 block mascot-stage">
            <span ref={fighter} className="absolute inset-0 block" style={{ transformOrigin: "50% 100%", opacity: still || ready ? undefined : 0 }}>
              <img ref={onImg} onLoad={() => setReady(true)} onError={() => setReady(true)} src={SRC} alt="" className="absolute inset-0 w-full h-full object-contain" draggable="false" />
              {/* Shine across the belt, only on the picture's own pixels */}
              <span className="absolute overflow-hidden pointer-events-none" aria-hidden="true"
                style={{ top: `${belt.top * 100}%`, height: `${belt.height * 100}%`, left: `${belt.left * 100}%`, width: `${belt.width * 100}%`,
                  WebkitMaskImage: `url(${SRC})`, maskImage: `url(${SRC})`,
                  WebkitMaskSize: `${100 / belt.width}% ${100 / belt.height}%`, maskSize: `${100 / belt.width}% ${100 / belt.height}%`,
                  WebkitMaskPosition: `${(belt.left / (1 - belt.width)) * 100}% ${(belt.top / (1 - belt.height)) * 100}%`,
                  maskPosition: `${(belt.left / (1 - belt.width)) * 100}% ${(belt.top / (1 - belt.height)) * 100}%`,
                  WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat" }}>
                <span ref={glint} className="absolute inset-y-0 w-[35%] block"
                  style={{ transform: "translateX(-120%) skewX(-20deg)", background: `linear-gradient(90deg, transparent, ${C("text", 0.75)}, transparent)`, mixBlendMode: "overlay" }} />
              </span>
            </span>
          </span>
          <Burst innerRef={burst} />
        </button>
      </div>
      {wordmark && (
        <p ref={title} className="mt-3 font-heading font-extrabold tracking-[0.12em] text-2xl text-victory-text" style={still ? undefined : { opacity: 0 }} data-testid="mascot-wordmark">
          VICTORY <span className="text-victory-lime">AI</span>
        </p>
      )}
    </div>
  );
}
