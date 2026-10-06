import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Lock, AlertTriangle, Coins } from "lucide-react";
import { checkStable, formatCoins, isCardLocked, SALARY_CAP, STABLE_SIZE } from "@/lib/fantasyScoring";
import { HowToPlay } from "@/components/fantasy/HowToPlay";

// Goal: anyone, even a 7-year-old, can pick a team first time, with no help.
// Psychology: simplicity drives action. The biggest cost here is "brain cycles" (Fogg),
//   so every word is one a child knows, and there are only ever two choices side by side
//   (Hick's law: fewer options per decision mean faster decisions). Progress is shown
//   as a count ("2 of 3 picked") because people finish things they can see the end of.
// Design: pretend coins instead of "$100M", "boxers" instead of "fighters"/"stable",
//   red only when something is wrong, and the warning says exactly how to fix it.
export function DraftPanel({ card, me, service }) {
  const locked = isCardLocked(card);
  const [picks, setPicks] = useState(me.picks);
  const [saving, setSaving] = useState(false);

  // If the saved team changes (another device, server push), follow it.
  useEffect(() => { setPicks(me.picks); }, [me.picks]);

  const check = useMemo(() => checkStable(picks, card), [picks, card]);
  const dirty = picks.join() !== me.picks.join();
  const pct = Math.min(100, (check.spent / SALARY_CAP) * 100);

  const toggle = (fighterId) => {
    if (locked) return;
    setPicks((p) => {
      if (p.includes(fighterId)) return p.filter((id) => id !== fighterId);
      if (p.length >= STABLE_SIZE) {
        toast(`You already have ${STABLE_SIZE} boxers. Tap one to take them out first.`);
        return p;
      }
      return [...p, fighterId];
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await service.saveStable(picks);
      toast.success("Your team is ready! Watch the fights to get points.");
    } catch (err) {
      toast.error(err.message);
    }
    setSaving(false);
  };

  return (
    <div className="space-y-3" data-testid="fantasy-draft">
      {!me.saved && !locked && <HowToPlay />}

      {/* Coin purse: sticky, so it's always in view while picking */}
      <div className={`victory-card p-3 space-y-2 sticky top-0 z-10 ${check.overCap ? "border-victory-danger/60 bg-victory-danger/5" : ""}`}>
        <div className="flex items-center justify-between">
          <p className="section-label flex items-center gap-1.5"><Coins className="w-3 h-3" /> Your coins</p>
          <p className="text-[10px] text-victory-muted">Pretend coins — free, not real money</p>
        </div>
        <div className="flex items-baseline justify-between">
          <p className={`font-mono font-bold text-xl ${check.overCap ? "text-victory-danger" : "text-victory-text"}`}>
            {check.overCap ? `${-check.remaining} too many` : `${check.remaining} left`}
          </p>
          <p className="text-xs text-victory-muted" data-testid="picked-count">
            <span className="font-mono font-bold text-victory-text">{picks.length}</span> of {STABLE_SIZE} boxers picked
          </p>
        </div>
        <div className="h-1.5 rounded-full bg-victory-border overflow-hidden" aria-hidden="true">
          <div className={`h-full rounded-full transition-[width] duration-300 ${check.overCap ? "bg-victory-danger" : "bg-victory-lime"}`} style={{ width: `${pct}%` }} />
        </div>
        {check.overCap && (
          <p className="text-victory-danger text-xs flex items-center gap-1.5" role="alert" data-testid="over-cap-warning">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> {check.errors[0]}
          </p>
        )}
      </div>

      {locked && (
        <p className="text-victory-muted text-xs flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> The fights have started, so teams can't change now.</p>
      )}

      {/* The fights: two boxers per fight, tap one to pick them */}
      <div className="space-y-2">
        {card.bouts.map((bout) => (
          <div key={bout.bout_id} className="victory-card p-2.5">
            <p className="text-[10px] text-victory-muted uppercase tracking-wider mb-1.5">Fight {bout.order} · {bout.division}</p>
            <div className="grid grid-cols-2 gap-2">
              {bout.fighters.map((f) => {
                const picked = picks.includes(f.fighter_id);
                const tooDear = !picked && check.spent + f.salary > SALARY_CAP;
                return (
                  <button
                    key={f.fighter_id}
                    onClick={() => toggle(f.fighter_id)}
                    disabled={locked}
                    aria-pressed={picked}
                    aria-label={`${f.name}, ${formatCoins(f.salary)}${picked ? ", picked" : ""}`}
                    className={`text-left rounded-lg border p-2 min-h-[64px] transition-colors disabled:cursor-default ${
                      picked ? "border-victory-lime bg-victory-lime/10" : "border-victory-border bg-victory-card-highlight"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <p className="text-victory-text text-xs font-semibold leading-tight">{f.name}</p>
                      {picked && <Check className="w-3.5 h-3.5 text-victory-lime flex-shrink-0" />}
                    </div>
                    <p className="text-victory-muted text-[10px] truncate">{plainRecord(f.record)}{f.nickname ? ` · "${f.nickname}"` : ""}</p>
                    <p className={`font-mono font-bold text-xs mt-1 flex items-center gap-1 ${tooDear ? "text-victory-orange" : "text-victory-teal"}`}>
                      <Coins className="w-3 h-3" /> {f.salary}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {!locked && (
        <button onClick={save} disabled={!check.valid || saving || (!dirty && me.saved)} className="victory-btn-primary disabled:opacity-40" data-testid="lock-stable">
          {saving ? "Saving…" : me.saved && !dirty ? "Your team is ready" : check.valid ? "This is my team!" : check.errors[0]}
        </button>
      )}
    </div>
  );
}

// "22-2-0" means nothing to a child; "Won 22 · Lost 2" does.
function plainRecord(record) {
  const [won, lost] = (record || "").split("-").map(Number);
  return Number.isFinite(won) && Number.isFinite(lost) ? `Won ${won} · Lost ${lost}` : "";
}
