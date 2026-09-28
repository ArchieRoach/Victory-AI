import { useCallback, useEffect, useRef, useState } from "react";
import { Flame, Scissors } from "lucide-react";

const MAX_PARTICLES = 40;
const PARTICLE_MS   = 1800;
const SEND_GAP_MS   = 250;
const COMBO_MS      = 1500;
const BANNER_MS     = 4500;
const PARTICIPATION_MS = 20_000;
const COLORS = ["text-victory-lime", "text-victory-teal", "text-victory-orange"];

let nextId = 0;

// bursts: { key, count } from the server (everyone's taps, aggregated).
// highlight: the latest "highlight" websocket event, or null.
export function HypeOverlay({ onHype, burst, highlight, onOpenHighlight, disabled = false }) {
  const [particles, setParticles] = useState([]);
  const [combo,     setCombo]     = useState(0);
  const [banner,    setBanner]    = useState(null);
  const lastSendRef   = useRef(0);
  const lastTapRef    = useRef(0);
  const pendingOwnRef = useRef(0);
  const comboTimerRef = useRef(null);

  const spawn = useCallback((n, own = false) => {
    if (n <= 0) return;
    const born = Array.from({ length: Math.min(n, 12) }, (_, i) => ({
      id: nextId++,
      right: own ? 20 + Math.random() * 16 : 8 + Math.random() * 64,
      drift: Math.round((Math.random() - 0.5) * 60),
      delay: own ? 0 : i * 70,
      size: own ? 28 : 18 + Math.round(Math.random() * 10),
      color: own ? COLORS[0] : COLORS[Math.floor(Math.random() * COLORS.length)],
    }));
    setParticles((p) => [...p, ...born].slice(-MAX_PARTICLES));
    const ids = new Set(born.map((b) => b.id));
    setTimeout(() => setParticles((p) => p.filter((x) => !ids.has(x.id))), PARTICLE_MS + 900);
  }, []);

  useEffect(() => {
    if (!burst) return;
    const others = burst.count - pendingOwnRef.current;
    pendingOwnRef.current = Math.max(0, pendingOwnRef.current - burst.count);
    spawn(others);
  }, [burst, spawn]);

  useEffect(() => {
    if (!highlight) return;
    const wasPartOfIt = Date.now() - lastTapRef.current < PARTICIPATION_MS;
    setBanner({ ...highlight, wasPartOfIt });
    const t = setTimeout(() => setBanner(null), BANNER_MS);
    return () => clearTimeout(t);
  }, [highlight]);

  useEffect(() => () => clearTimeout(comboTimerRef.current), []);

  const tap = () => {
    const now = Date.now();
    lastTapRef.current = now;
    spawn(1, true);
    setCombo((c) => c + 1);
    clearTimeout(comboTimerRef.current);
    comboTimerRef.current = setTimeout(() => setCombo(0), COMBO_MS);
    navigator.vibrate?.(8);
    if (now - lastSendRef.current >= SEND_GAP_MS && onHype?.()) {
      lastSendRef.current = now;
      pendingOwnRef.current += 1;
    }
  };

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {particles.map((p) => (
        <Flame
          key={p.id}
          className={`absolute bottom-16 animate-float-up fill-current ${p.color}`}
          style={{ right: `${p.right}%`, width: p.size, height: p.size, animationDelay: `${p.delay}ms`, "--drift": `${p.drift}px` }}
          aria-hidden="true"
        />
      ))}

      {banner && (
        <button
          onClick={() => onOpenHighlight?.(banner.highlight_id)}
          className="pointer-events-auto absolute top-3 left-1/2 animate-slide-down flex items-center gap-2 bg-victory-bg/90 backdrop-blur border border-victory-lime/40 rounded-full pl-2 pr-4 py-1.5 shadow-lg shadow-victory-lime/20 min-h-[44px]"
        >
          <span className="w-8 h-8 rounded-full bg-victory-lime flex items-center justify-center flex-shrink-0">
            <Scissors className="w-4 h-4 text-victory-bg" strokeWidth={2.5} />
          </span>
          <span className="text-left leading-tight">
            <span className="block text-victory-lime text-[11px] font-heading font-extrabold tracking-wide">HIGHLIGHT CLIPPED</span>
            <span className="block text-victory-text text-xs">
              <span className="font-mono font-bold">{banner.reactions}</span> reactions at once
              {banner.wasPartOfIt && <span className="text-victory-teal"> · you were part of it</span>}
            </span>
          </span>
        </button>
      )}

      {!disabled && (
        <div className="absolute bottom-3 right-3 flex flex-col items-center gap-1 pointer-events-auto">
          {combo > 1 && (
            <span key={combo} className="animate-scale-in font-mono font-bold text-sm text-victory-lime drop-shadow">
              x{combo}
            </span>
          )}
          <button
            onClick={tap}
            aria-label="Send hype"
            className="w-14 h-14 rounded-full bg-victory-bg/70 backdrop-blur border border-victory-lime/50 flex items-center justify-center active:scale-90 transition-transform no-select"
          >
            <Flame className="w-7 h-7 text-victory-lime fill-victory-lime/30" strokeWidth={2.5} />
          </button>
        </div>
      )}
    </div>
  );
}
