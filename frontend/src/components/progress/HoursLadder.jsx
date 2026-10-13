import { useEffect, useState } from "react";
import axios from "axios";
import { Hourglass } from "lucide-react";
import { API } from "@/App";
import { masteryLine, masteryPct } from "@/lib/progression";

// Goal: visible progress that lasts a whole boxing life, apart from any one season's prize.
// Psychology: goal gradient: people push harder the closer the next step looks, so the bar
//   runs from your last badge to the next one, never toward the far-off 10,000.
// Design: only proven time counts (AI-scored video rounds); 10,000 is named once, quietly.
export function HoursLadder() {
  const [m, setM] = useState(null);

  useEffect(() => {
    axios.get(`${API}/mastery`).then((r) => setM(r.data)).catch(() => setM(false));
  }, []);

  if (m === false) return null;
  if (!m) return <div className="skeleton-shimmer h-24 rounded-lg" />;

  const pct = masteryPct(m);
  return (
    <section className="victory-card p-4 space-y-2" data-testid="hours-ladder">
      <div className="flex items-center justify-between">
        <p className="section-label flex items-center gap-1.5"><Hourglass className="w-3 h-3" /> Hours ladder</p>
        <span className="text-[11px] text-victory-muted">
          {m.tier ? <span className="font-heading font-bold text-victory-teal">{m.tier}</span> : "No badge yet"}
          <span className="font-mono"> · {m.tiers_earned}/{m.tiers_total}</span>
        </span>
      </div>
      <p className="text-victory-text text-sm font-semibold">{m.next_tier ? `Next badge: ${m.next_tier}` : "Top of the ladder"}</p>
      <div className="h-2 rounded-full bg-victory-card-highlight overflow-hidden" role="progressbar"
        aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progress to your next hours badge">
        <div className="h-full bg-victory-lime rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[12px] text-victory-muted">{masteryLine(m)}</p>
      <p className="text-[11px] text-victory-muted">Only rounds the AI has watched on video count. The ladder goes all the way to 10,000 hours, the mark of an expert.</p>
    </section>
  );
}
