import { useEffect, useState } from "react";
import axios from "axios";
import { Lock, ShieldCheck, Trophy, Video, Hourglass } from "lucide-react";
import { toast } from "sonner";
import { API } from "@/App";
import { glovesHeadline } from "@/lib/progression";
import { BragButton } from "./BragButton";

// Goal: one prize per season that's genuinely hard to get and only goes to real training.
// Psychology: scarcity (we want what we can't simply have, and value what's hard to win),
//   a goal that keeps moving just ahead, and an up-front pledge that makes it feel worth more.
// Design: the gloves are shown locked until earned. Entry closes after two weeks of the
//   season and needs a pledge. Only AI-scored rounds and crowd-judged wins count. Every
//   number (days left, holders, chasers) is real.
export function GoldenGloves() {
  const [g, setG] = useState(null);
  const [promises, setPromises] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    axios.get(`${API}/gloves`).then((r) => { setG(r.data); setPromises(r.data.promises.map(() => false)); }).catch(() => setG(false));
  }, []);

  const pledge = async () => {
    setBusy(true);
    try {
      const { data } = await axios.post(`${API}/gloves/pledge`, { promises });
      setG(data);
      toast.success("You're in. Only proven rounds count from here.");
    } catch (e) {
      const d = e?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Couldn't enter right now");
    }
    setBusy(false);
  };

  if (g === false) return null;
  if (!g) return <div className="skeleton-shimmer h-32 rounded-lg" />;

  return (
    <section className={`victory-card p-4 space-y-3 ${g.earned ? "border-victory-lime/40 bg-victory-lime/5" : ""}`} data-testid="golden-gloves">
      <div className="flex items-center gap-3">
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 border ${
          g.earned ? "bg-victory-lime/15 border-victory-lime/40" : "bg-victory-card-highlight border-victory-border"}`}>
          {g.earned ? <Trophy className="w-7 h-7 text-victory-lime" /> : <Lock className="w-6 h-6 text-victory-muted" />}
        </div>
        <div className="min-w-0">
          <p className="section-label">Limited to this season</p>
          <p className="text-victory-text font-heading font-extrabold text-lg leading-tight">{g.name}</p>
          <p className="text-victory-muted text-[11px]">{glovesHeadline(g)}</p>
        </div>
      </div>

      {g.pledged && !g.earned && (
        <>
          <div className="h-2 rounded-full bg-victory-card-highlight overflow-hidden" role="progressbar"
            aria-valuenow={g.pct} aria-valuemin={0} aria-valuemax={100} aria-label="Golden Gloves progress">
            <div className="h-full bg-victory-lime rounded-full transition-all" style={{ width: `${g.pct}%` }} />
          </div>
          <div className="flex justify-between text-[11px] text-victory-muted">
            <span><span className="font-mono text-victory-text">{g.proof}</span> / {g.target} proof</span>
            <span><span className="font-mono text-victory-text">{g.rounds_left_today}</span> verified rounds left today</span>
          </div>
        </>
      )}

      {g.earned && <BragButton win={{ kind: "crown", name: g.name }} label="Show them off" />}

      {!g.pledged && g.window.open && (
        <div className="space-y-2">
          <p className="text-[12px] text-victory-text">To enter, make these promises. Entries close in <span className="font-mono">{g.window.days_to_close}</span> day{g.window.days_to_close === 1 ? "" : "s"}.</p>
          {g.promises.map((text, i) => (
            <label key={text} className="flex items-start gap-2 text-[12px] text-victory-text min-h-[44px]">
              <input type="checkbox" className="mt-1 accent-victory-lime" checked={!!promises[i]}
                onChange={(e) => setPromises((p) => p.map((v, j) => (j === i ? e.target.checked : v)))} />
              {text}
            </label>
          ))}
          <button className="victory-btn-primary" disabled={busy || !promises.every(Boolean)} onClick={pledge}>I'm in. Start the chase</button>
        </div>
      )}

      {!g.pledged && !g.window.open && !g.earned && (
        <p className="text-[12px] text-victory-muted flex items-center gap-1.5"><Hourglass className="w-3.5 h-3.5" /> Entries for these gloves have closed. The next chase opens when the new season starts.</p>
      )}

      <details className="text-[11px] text-victory-muted">
        <summary className="cursor-pointer min-h-[44px] flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-victory-teal" /> What counts as proof</summary>
        <ul className="space-y-1 pl-5 list-disc">
          {g.rules.map((r) => <li key={r}>{r}</li>)}
        </ul>
        <p className="mt-2 flex items-center gap-1.5"><Video className="w-3.5 h-3.5" /> Record your rounds on video so the AI can score them.</p>
      </details>
    </section>
  );
}
