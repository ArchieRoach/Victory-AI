import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Check } from "lucide-react";
import { API } from "@/App";
import { createSpring, prefersReducedMotion } from "@/lib/motion";
import { haptic } from "@/lib/haptics";
import { inRun, markIgnited, shouldIgnite, trainedToday, weekDays } from "@/lib/streakFlame";
import i18n from "@/i18n";
import { tx } from "@/i18n/tx";

// The streak card. Rules and reasoning: lib/streakFlame.js.
const SMALL = 0.32;
const BURST = { damping: 0.55, response: 0.5 };   // a celebration earns a little overshoot
const C = (token, a = 1) => `rgb(var(--victory-${token}) / ${a})`;

function Flame({ scale, flicker }) {
  return (
    <svg viewBox="0 0 100 120" className="w-24 h-28" aria-hidden="true"
      style={{ transform: `scale(${scale})`, transformOrigin: "50% 100%", filter: `drop-shadow(0 6px 18px ${C("orange", 0.55)})` }}>
      <defs>
        <linearGradient id="flame-outer" x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0" style={{ stopColor: C("danger") }} />
          <stop offset="1" style={{ stopColor: C("orange") }} />
        </linearGradient>
        <linearGradient id="flame-inner" x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0" style={{ stopColor: C("orange") }} />
          <stop offset="0.55" style={{ stopColor: C("lime") }} />
        </linearGradient>
      </defs>
      <g className={flicker ? "flame-flicker" : ""}>
      <path fill="url(#flame-outer)" d="M50 3 C59 25 84 37 84 72 C84 100 67 117 50 117 C33 117 16 100 16 72 C16 54 26 45 31 30 C35 44 39 49 44 51 C42 35 44 18 50 3 Z" />
      <path fill="url(#flame-inner)" opacity="0.95" d="M50 50 C58 64 69 74 69 91 C69 107 60 115 50 115 C40 115 31 107 31 92 C31 79 42 69 50 50 Z" className={flicker ? "flame-core" : ""} />
      </g>
    </svg>
  );
}

function DayDot({ d, run, burst }) {
  const letter = new Date(`${d.date}T12:00:00Z`).toLocaleDateString(i18n.language || undefined, { weekday: "narrow", timeZone: "UTC" });
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-[12px] text-victory-text/80">{letter}</span>
      <div className="relative w-full h-8 flex items-center justify-center">
        {d.active && (run.left || run.right) && (
          <span className={`absolute inset-y-0 ${run.left ? "" : "rounded-l-full"} ${run.right ? "" : "rounded-r-full"}`}
            style={{ left: run.left ? 0 : "calc(50% - 16px)", right: run.right ? 0 : "calc(50% - 16px)", background: C("orange", 0.22) }} />
        )}
        <span
          className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-semibold ${burst && d.isToday ? "streak-pop" : ""}`}
          style={d.active
            ? (d.isToday ? { background: C("orange"), color: C("bg") }
              : { background: run.left || run.right ? "transparent" : C("orange", 0.22), color: C("orange") })
            : d.isToday ? { boxShadow: `inset 0 0 0 2px ${C("orange")}`, color: C("orange") }
              : { background: C("card-highlight"), color: C("muted") }}>
          {d.active ? <Check className="w-4 h-4" strokeWidth={3} /> : d.day}
        </span>
      </div>
    </div>
  );
}

export function StreakFlame({ stats: given, showButton = false }) {
  const navigate = useNavigate();
  const [stats, setStats] = useState(given || null);
  const [scale, setScale] = useState(SMALL);
  const [burst, setBurst] = useState(false);
  const spring = useRef(null);

  useEffect(() => { if (given) setStats(given); }, [given]);
  useEffect(() => {
    if (given) return;
    axios.get(`${API}/users/stats`).then((r) => setStats(r.data)).catch(() => setStats(false));
  }, [given]);

  const activity = stats?.week_activity || [];
  const streak = stats?.current_streak || 0;
  const lit = trainedToday(activity) && streak > 0;

  useEffect(() => {
    if (!stats) return undefined;
    if (!lit) { setScale(SMALL); return undefined; }
    if (!shouldIgnite(activity, streak) || prefersReducedMotion()) { setScale(1); return undefined; }
    markIgnited(activity);
    setBurst(true);
    haptic("success");
    spring.current = createSpring({ from: SMALL, onUpdate: setScale, config: BURST });
    const t = setTimeout(() => spring.current.to(1), 250);
    return () => { clearTimeout(t); spring.current?.stop(); };
  }, [stats, lit]); // eslint-disable-line react-hooks/exhaustive-deps

  if (stats === false) return null;
  if (!stats) return <div className="skeleton-shimmer h-56 rounded-lg" />;
  const days = weekDays(activity);

  return (
    <section className="victory-card p-4 overflow-hidden relative" data-testid="streak-flame"
      style={{ backgroundImage: `radial-gradient(circle at 50% 18%, ${C("orange", lit ? 0.22 : 0.12)}, transparent 62%)` }}>
      <div className="flex flex-col items-center text-center">
        <div className="h-28 flex items-end justify-center"><Flame scale={scale} flicker /></div>
        {lit ? (
          <div className={burst ? "streak-reveal" : ""}>
            <p className="font-heading font-bold text-5xl leading-none mt-1" style={{ color: C("orange") }} data-testid="streak-count">{streak}</p>
            <p className="font-heading font-bold text-xl mt-1" style={{ color: C("orange") }}>
              {streak === 1 ? tx("ui.streakFlame.dayStreakOne", "day streak") : tx("ui.streakFlame.dayStreak", "day streak")}
            </p>
          </div>
        ) : (
          <p className="font-heading font-bold text-xl leading-tight mt-2 max-w-[16rem]" style={{ color: C("orange") }}>
            {streak > 0
              ? tx("ui.streakFlame.keepAlive", "Keep the fire alive. Train today!")
              : tx("ui.streakFlame.light", "Light the fire. Train today!")}
          </p>
        )}
        {!lit && streak > 0 && (
          <p className="text-[12px] text-victory-muted mt-1">{tx("ui.streakFlame.current", "{{count}}-day streak so far. One rest day never breaks it.", { count: streak })}</p>
        )}
      </div>

      {days.length === 7 && (
        <div className="grid grid-cols-7 mt-4 rounded-lg py-3" style={{ background: C("bg", 0.35) }} data-testid="streak-week">
          {days.map((d, i) => <DayDot key={d.date} d={d} run={inRun(days, i)} burst={burst} />)}
        </div>
      )}

      {lit ? (
        <p className="mt-3 w-full min-h-[44px] rounded-full flex items-center justify-center text-sm font-semibold"
          style={{ boxShadow: `inset 0 0 0 1px ${C("orange", 0.6)}`, color: C("muted") }} data-testid="streak-done">
          {tx("ui.streakFlame.trainedToday", "Trained today ✓")}
        </p>
      ) : showButton && (
        <button type="button" onClick={() => navigate("/train?quick=1")} className="mt-3 w-full min-h-[44px] rounded-full font-heading font-bold"
          style={{ background: C("orange"), color: C("bg") }} data-testid="streak-train">
          {tx("ui.streakFlame.trainToday", "Train today")}
        </button>
      )}
    </section>
  );
}
