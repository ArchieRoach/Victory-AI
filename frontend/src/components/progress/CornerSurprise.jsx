import { useState } from "react";
import axios from "axios";
import { Gift, Sparkles, Info } from "lucide-react";
import { API } from "@/App";

// Corner Surprises: a box you open after training. Not knowing what's inside is the fun
// (Core Drive 7). Earned only, never bought; the odds are one tap away.
export function CornerSurprise({ surprise }) {
  const [open, setOpen] = useState(false);
  const [odds, setOdds] = useState(null);
  if (!surprise) return null;

  const showOdds = () => {
    if (odds) { setOdds(null); return; }
    axios.get(`${API}/surprises`).then((r) => setOdds(r.data)).catch(() => {});
  };

  return (
    <section className="victory-card p-4 space-y-3 border-victory-orange/40" data-testid="corner-surprise">
      <div className="flex items-center justify-between">
        <p className="section-label flex items-center gap-1.5"><Gift className="w-3 h-3" /> Corner surprise</p>
        <button aria-label="See the odds" className="w-11 h-11 -mr-2 rounded-full flex items-center justify-center text-victory-muted" onClick={showOdds}>
          <Info className="w-4 h-4" />
        </button>
      </div>
      {!open ? (
        <button onClick={() => setOpen(true)} className="w-full victory-card-highlight rounded-xl p-6 flex flex-col items-center gap-2 active:scale-[0.98] transition-transform">
          <Gift className="w-10 h-10 text-victory-orange animate-bounce" />
          <span className="text-victory-text font-heading font-bold">Your corner left you something. Tap to open.</span>
        </button>
      ) : (
        <div className="rounded-xl bg-victory-orange/10 border border-victory-orange/30 p-4 space-y-1 animate-fade-in">
          <p className="text-victory-text font-heading font-extrabold flex items-center gap-1.5"><Sparkles className="w-4 h-4 text-victory-orange" /> {surprise.title}</p>
          <p className="text-victory-text text-sm">{surprise.body}</p>
          {surprise.search && (
            <a className="text-[12px] text-victory-lime font-semibold inline-flex min-h-[44px] items-center" target="_blank" rel="noreferrer"
              href={`https://www.youtube.com/results?search_query=${encodeURIComponent(surprise.search)}`}>Watch how they did it</a>
          )}
        </div>
      )}
      {odds && (
        <div className="text-[11px] text-victory-muted space-y-0.5">
          {odds.odds.map((o) => <p key={o.kind}>{o.label}: <span className="font-mono text-victory-text">{o.pct}%</span></p>)}
          <p>Up to {odds.daily_cap} surprises a day. Surprises are earned by training, never sold.</p>
        </div>
      )}
    </section>
  );
}
