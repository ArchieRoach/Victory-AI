import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Lock, AlertTriangle, Wallet } from "lucide-react";
import { checkStable, formatMoney, isCardLocked, SALARY_CAP, STABLE_SIZE } from "@/lib/fantasyScoring";

// Goal: a quick, fair draft before the first bell.
// Psychology: a visible budget turns picking into a real trade-off (one favourite or two
//   live underdogs?), which is where the fun and the bragging come from.
// Design: budget bar always on screen; going over the cap is allowed but loudly flagged
//   and blocks "Lock in" until it's fixed, so the user sees why rather than hitting a wall.
export function DraftPanel({ card, me, service }) {
  const locked = isCardLocked(card);
  const [picks, setPicks] = useState(me.picks);
  const [saving, setSaving] = useState(false);

  // If the saved stable changes (another device, server push), follow it.
  useEffect(() => { setPicks(me.picks); }, [me.picks]);

  const check = useMemo(() => checkStable(picks, card), [picks, card]);
  const dirty = picks.join() !== me.picks.join();
  const pct = Math.min(100, (check.spent / SALARY_CAP) * 100);

  const toggle = (fighterId) => {
    if (locked) return;
    setPicks((p) => {
      if (p.includes(fighterId)) return p.filter((id) => id !== fighterId);
      if (p.length >= STABLE_SIZE) {
        toast(`Your stable is ${STABLE_SIZE} fighters — drop one first.`);
        return p;
      }
      return [...p, fighterId];
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await service.saveStable(picks);
      toast.success("Stable locked in. Good luck tonight.");
    } catch (err) {
      toast.error(err.message);
    }
    setSaving(false);
  };

  return (
    <div className="space-y-3" data-testid="fantasy-draft">
      {/* Budget — sticky so it's visible while scrolling the card */}
      <div className={`victory-card p-3 space-y-2 sticky top-0 z-10 ${check.overCap ? "border-victory-danger/60 bg-victory-danger/5" : ""}`}>
        <div className="flex items-center justify-between">
          <p className="section-label flex items-center gap-1.5"><Wallet className="w-3 h-3" /> Fantasy budget</p>
          <p className="text-[10px] text-victory-muted">Fictional — not real money</p>
        </div>
        <div className="flex items-baseline justify-between">
          <p className={`font-mono font-bold text-xl ${check.overCap ? "text-victory-danger" : "text-victory-text"}`}>
            {formatMoney(Math.abs(check.remaining))} <span className="text-xs font-body font-normal text-victory-muted">{check.overCap ? "over cap" : "left"}</span>
          </p>
          <p className="font-mono text-xs text-victory-muted">{formatMoney(check.spent)} / {formatMoney(SALARY_CAP)} · {picks.length}/{STABLE_SIZE}</p>
        </div>
        <div className="h-1.5 rounded-full bg-victory-border overflow-hidden" aria-hidden="true">
          <div className={`h-full rounded-full transition-[width] duration-300 ${check.overCap ? "bg-victory-danger" : "bg-victory-lime"}`} style={{ width: `${pct}%` }} />
        </div>
        {check.overCap && (
          <p className="text-victory-danger text-xs flex items-center gap-1.5" role="alert" data-testid="over-cap-warning">
            <AlertTriangle className="w-3.5 h-3.5" /> {check.errors[0]} Swap a fighter to lock in.
          </p>
        )}
      </div>

      {locked && (
        <p className="text-victory-muted text-xs flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> Picks locked — the card has started.</p>
      )}

      {/* Fight card — two fighters per bout */}
      <div className="space-y-2">
        {card.bouts.map((bout) => (
          <div key={bout.bout_id} className="victory-card p-2.5">
            <p className="text-[10px] text-victory-muted uppercase tracking-wider mb-1.5 flex justify-between">
              <span>Bout {bout.order} · {bout.division}</span>
              <span className="font-mono">{bout.scheduled_rounds} rds</span>
            </p>
            <div className="grid grid-cols-2 gap-2">
              {bout.fighters.map((f) => {
                const picked = picks.includes(f.fighter_id);
                const wouldBust = !picked && check.spent + f.salary > SALARY_CAP;
                return (
                  <button
                    key={f.fighter_id}
                    onClick={() => toggle(f.fighter_id)}
                    disabled={locked}
                    aria-pressed={picked}
                    className={`text-left rounded-lg border p-2 min-h-[64px] transition-colors disabled:cursor-default ${
                      picked ? "border-victory-lime bg-victory-lime/10" : "border-victory-border bg-victory-card-highlight"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <p className="text-victory-text text-xs font-semibold leading-tight">{f.name}</p>
                      {picked && <Check className="w-3.5 h-3.5 text-victory-lime flex-shrink-0" />}
                    </div>
                    <p className="text-victory-muted text-[10px] truncate">"{f.nickname}" · {f.record}</p>
                    <p className={`font-mono font-bold text-xs mt-1 ${wouldBust ? "text-victory-orange" : "text-victory-teal"}`}>
                      {formatMoney(f.salary)}
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
          {saving ? "Locking in…" : me.saved && !dirty ? "Stable locked in" : check.valid ? "Lock in my stable" : check.errors[0]}
        </button>
      )}
    </div>
  );
}
