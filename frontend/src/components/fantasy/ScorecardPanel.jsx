import { useEffect, useRef, useState } from "react";
import { Radio, Trophy, Clock, Sparkles } from "lucide-react";
import { formatCoins } from "@/lib/fantasyScoring";

// Goal: see your stable's night unfold next to the stream.
// Psychology: points that land the moment a bout ends (and visibly flash) are the reward;
//   bonuses shown as their own lines make an early KO feel like the event it is.
// Design: one row per fighter — status, then the base points and each bonus as chips.
export function ScorecardPanel({ myStable, me }) {
  const flash = useFlash(myStable.total);

  if (!me.saved) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center px-6">
        <div className="w-16 h-16 rounded-2xl bg-victory-lime/10 border border-victory-lime/20 flex items-center justify-center mb-4">
          <Trophy className="w-8 h-8 text-victory-lime/60" />
        </div>
        <p className="text-victory-text font-bold text-lg mb-1">No team yet</p>
        <p className="text-victory-muted text-sm">Go to Pick, choose 3 boxers, and save your team before the first fight.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="fantasy-scorecard">
      <div className={`victory-card p-4 flex items-center justify-between transition-colors ${flash ? "border-victory-lime bg-victory-lime/10" : ""}`}>
        <div>
          <p className="section-label">Your team</p>
          <p className="text-victory-muted text-xs">{myStable.decided} of {myStable.fighters.length} fights finished</p>
        </div>
        <p className="font-mono font-bold text-3xl text-victory-lime" aria-live="polite">{myStable.total}<span className="text-sm text-victory-muted ml-1">points</span></p>
      </div>

      {myStable.fighters.map(({ fighter_id, fighter, bout, score }) => (
        <div key={fighter_id} className="victory-card p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-victory-text text-sm font-semibold truncate">{fighter?.name}</p>
              <p className="text-victory-muted text-[10px]">
                fighting {bout?.fighters.find((f) => f.fighter_id !== fighter_id)?.name} · {formatCoins(fighter?.salary || 0)}
              </p>
            </div>
            <BoutStatus bout={bout} score={score} />
          </div>
          {score && (
            <div className="flex flex-wrap gap-1.5">
              {score.lines.map((l) => (
                <span
                  key={l.label}
                  className={`text-[10px] font-heading font-bold px-2 py-0.5 rounded-full border ${
                    l.kind === "bonus"
                      ? "border-victory-lime/50 bg-victory-lime/15 text-victory-lime"
                      : score.outcome === "loss" ? "border-victory-border text-victory-muted" : "border-victory-teal/40 bg-victory-teal/10 text-victory-teal"
                  }`}
                >
                  {l.kind === "bonus" && <Sparkles className="w-2.5 h-2.5 inline mr-0.5 -mt-0.5" />}
                  {l.label} <span className="font-mono">+{l.pts}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function BoutStatus({ bout, score }) {
  if (score) {
    const tone = score.outcome === "win" ? "text-victory-lime" : score.outcome === "loss" ? "text-victory-muted" : "text-victory-teal";
    return <p className={`font-mono font-bold text-lg ${tone}`}>+{score.total}</p>;
  }
  if (bout?.status === "live") {
    return (
      <span className="flex items-center gap-1 text-victory-danger text-[10px] font-heading font-bold uppercase">
        <Radio className="w-3 h-3 animate-pulse" /> Fighting now
      </span>
    );
  }
  return <span className="flex items-center gap-1 text-victory-muted text-[10px]"><Clock className="w-3 h-3" /> Fight {bout?.order}</span>;
}

// True for a moment whenever the value goes up.
function useFlash(value) {
  const prev = useRef(value);
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (value > prev.current) {
      setOn(true);
      const t = setTimeout(() => setOn(false), 1200);
      prev.current = value;
      return () => clearTimeout(t);
    }
    prev.current = value;
  }, [value]);
  return on;
}
