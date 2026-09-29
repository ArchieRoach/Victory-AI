import { useCallback, useEffect, useRef, useState } from "react";
import { Flame, Scissors } from "lucide-react";

const MAX_PARTICLES = 40;
const PARTICLE_MS   = 1800;
const SEND_GAP_MS   = 250;
const COMBO_MS      = 1500;
const BANNER_MS     = 4500;
const PARTICIPATION_MS = 20_000;
// Matches the server's 10s scoring window: with no taps for that long the meter is stale.
const METER_STALE_MS = 10_000;
const COLORS = ["text-victory-lime", "text-victory-teal", "text-victory-orange"];

let nextId = 0;

// bursts: { key, count } from the server (everyone's taps, aggregated).
// highlight: the latest "highlight" websocket event, or null.
export function HypeOverlay({ onHype, burst, highlight, onOpenHighlight, disabled = false }) {
  const [particles, setParticles] = useState([]);
  const [combo,     setCombo]     = useState(0);
  const [banner,    setBanner]    = useState(null);
  const [meter,     setMeter]     = useState(null);
  const meterTimerRef = useRef(null);
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
    if (burst.meter) {
      setMeter(burst.meter.cooling ? null : burst.meter);
      clearTimeout(meterTimerRef.current);
      meterTimerRef.current = setTimeout(() => setMeter(null), METER_STALE_MS);
    }
  }, [burst, spawn]);

  useEffect(() => {
    if (!highlight) return;
    const wasPartOfIt = Date.now() - lastTapRef.current < PARTICIPATION_MS;
    setBanner({ ...highlight, wasPartOfIt });
    setMeter(null);
    const t = setTimeout(() => setBanner(null), BANNER_MS);
    return () => clearTimeout(t);
  }, [highlight]);

  useEffect(() => () => {
    clearTimeout(comboTimerRef.current);
    clearTimeout(meterTimerRef.current);
  }, []);

  const missing = meter ? Math.max(0, meter.needed_reactors - meter.reactors) : 0;
  const meterLabel = !meter ? "" : missing > 0
    ? `${missing} more ${missing === 1 ? "person" : "people"} to clip it!`
    : meter.ratio >= 0.8 ? "Almost — keep going!" : "Keep the hype up!";

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
        <div className="absolute bottom-3 right-3 flex flex-col items-end gap-1 pointer-events-auto">
          {meter && meter.ratio > 0 && (
            <div className="animate-fade-in mb-1 w-40 bg-victory-bg/80 backdrop-blur border border-victory-border rounded-xl px-2.5 py-2" role="status" aria-live="polite">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-heading font-extrabold tracking-wide text-victory-lime">HYPE</span>
                <span className="font-mono text-[10px] text-victory-muted">{meter.reactors}/{meter.needed_reactors}</span>
              </div>
              <div className="h-1.5 rounded-full bg-victory-border overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-victory-teal to-victory-lime transition-[width] duration-300"
                  style={{ width: `${Math.round(meter.ratio * 100)}%` }}
                />
              </div>
              <p className="text-victory-text text-[11px] mt-1 leading-tight">{meterLabel}</p>
            </div>
          )}
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
