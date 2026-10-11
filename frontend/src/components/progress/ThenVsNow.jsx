import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { History, Play, TrendingUp, TrendingDown } from "lucide-react";
import { API } from "@/App";
import { BragButton } from "./BragButton";

// Goal: show fighters how far they've come, in their own footage.
// Psychology: visible competence is the strongest intrinsic motivator, and comparing with
//   your past self (not others) keeps it healthy.
// Design: first AI-scored round next to the latest, played together, with real score changes.
//   Drops are shown honestly, framed as the next thing to work on.
function fmt(d) {
  return d ? new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "";
}

export function ThenVsNow() {
  const [t, setT] = useState(null);
  const thenRef = useRef(null);
  const nowRef = useRef(null);

  useEffect(() => {
    axios.get(`${API}/users/me/then-vs-now`).then((r) => setT(r.data)).catch(() => setT(false));
  }, []);

  if (t === false) return null;
  if (!t) return <div className="skeleton-shimmer h-40 rounded-lg" />;
  if (!t.ready) {
    return (
      <section className="victory-card p-4 flex items-center gap-3" data-testid="then-vs-now-locked">
        <History className="w-5 h-5 text-victory-muted flex-shrink-0" />
        <p className="text-victory-muted text-sm">
          {t.days_until
            ? `Your "then vs now" unlocks in ${t.days_until} day${t.days_until === 1 ? "" : "s"}. Keep recording rounds.`
            : `Record ${t.needed - t.scored_sessions} more scored session${t.needed - t.scored_sessions === 1 ? "" : "s"} on video to unlock "then vs now".`}
        </p>
      </section>
    );
  }

  const playBoth = () => {
    [thenRef.current, nowRef.current].forEach((v) => { if (v) { v.currentTime = 0; v.play().catch(() => {}); } });
  };
  const up = t.overall_change > 0;

  return (
    <section className="victory-card p-4 space-y-3" data-testid="then-vs-now">
      <div className="flex items-center justify-between">
        <p className="section-label flex items-center gap-1.5"><History className="w-3 h-3" /> Then vs now</p>
        <span className="text-[11px] text-victory-muted">{t.days} days · {t.sessions_between + 2} scored sessions</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {[["Then", t.then, thenRef], ["Now", t.now, nowRef]].map(([label, side, ref]) => (
          <div key={label} className="space-y-1">
            <div className="aspect-[3/4] rounded-lg overflow-hidden bg-victory-card-highlight relative">
              {side.video ? (
                <video ref={ref} src={side.video} muted playsInline loop preload="metadata" className="w-full h-full object-cover" />
              ) : (
                <p className="absolute inset-0 flex items-center justify-center text-[11px] text-victory-muted p-2 text-center">No clip saved</p>
              )}
              <span className="absolute top-1.5 left-1.5 text-[10px] font-heading font-bold uppercase px-2 py-0.5 rounded-full bg-victory-bg/80 text-victory-text">{label}</span>
            </div>
            <p className="text-[11px] text-victory-muted">{fmt(side.date)}</p>
            <p className="font-mono font-bold text-xl text-victory-lime">{side.overall?.toFixed(1) ?? "–"}</p>
          </div>
        ))}
      </div>

      {(t.then.video || t.now.video) && (
        <button className="victory-btn-ghost flex items-center justify-center gap-2" onClick={playBoth}>
          <Play className="w-4 h-4" /> Play side by side
        </button>
      )}

      {t.overall_change != null && (
        <p className={`text-sm font-semibold ${up ? "text-victory-lime" : "text-victory-text"}`}>
          {up ? `Up ${t.overall_change} overall since your first session.` : t.overall_change === 0 ? "Level with your first session overall." : `Down ${-t.overall_change} overall: the next sessions are where it comes back.`}
        </p>
      )}

      {t.biggest_gains.length > 0 && (
        <ul className="space-y-1">
          {t.biggest_gains.map((g) => (
            <li key={g.dimension} className="flex items-center justify-between text-[12px]">
              <span className="text-victory-text flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5 text-victory-lime" /> {g.dimension}</span>
              <span className="font-mono text-victory-muted">{g.then} → <span className="text-victory-lime font-bold">{g.now}</span></span>
            </li>
          ))}
        </ul>
      )}
      {t.slipped.length > 0 && (
        <ul className="space-y-1 pt-1 border-t border-victory-border">
          {t.slipped.map((g) => (
            <li key={g.dimension} className="flex items-center justify-between text-[12px]">
              <span className="text-victory-muted flex items-center gap-1.5"><TrendingDown className="w-3.5 h-3.5 text-victory-orange" /> {g.dimension}: work on this next</span>
              <span className="font-mono text-victory-muted">{g.then} → {g.now}</span>
            </li>
          ))}
        </ul>
      )}
      {up && <BragButton win={{ kind: "progress", change: t.overall_change, days: t.days }} label="Share how far you've come" />}
    </section>
  );
}
