import { useState } from "react";
import { toast } from "sonner";
import { Shuffle, Play, RotateCcw, FlaskConical } from "lucide-react";
import { METHODS, METHOD_LABEL } from "@/lib/fantasyScoring";

// Test controls for the mock service: start a bout, enter an exact official result, or
// randomise. In production these become your results-desk tool calling the backend, which
// then pushes "fantasy.bout_update" over the stream WebSocket to every viewer.
export function AdminPanel({ card, service }) {
  const [busy, setBusy] = useState(false);

  const run = async (fn) => {
    try { await fn(); } catch (err) { toast.error(err.message); }
  };

  return (
    <div className="space-y-3" data-testid="fantasy-admin">
      <div className="victory-card p-3 border-victory-orange/40 bg-victory-orange/5">
        <p className="text-victory-orange text-xs flex items-center gap-1.5 font-semibold">
          <FlaskConical className="w-3.5 h-3.5" /> Test controls — mock data only
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={async () => { setBusy(true); await run(() => service.admin.simulateCard()); setBusy(false); }}
          disabled={busy || card.status === "complete"}
          className="victory-btn-secondary min-h-[44px] text-sm disabled:opacity-40 flex items-center justify-center gap-1.5"
        >
          <Play className="w-4 h-4" /> {busy ? "Simulating…" : "Simulate card"}
        </button>
        <button onClick={() => run(service.admin.reset)} disabled={busy} className="victory-btn-ghost min-h-[44px] text-sm flex items-center justify-center gap-1.5">
          <RotateCcw className="w-4 h-4" /> Reset card
        </button>
      </div>

      {card.bouts.map((bout) => <BoutResultForm key={bout.bout_id} bout={bout} service={service} run={run} disabled={busy} />)}
    </div>
  );
}

function BoutResultForm({ bout, service, run, disabled }) {
  const [a, b] = bout.fighters;
  const [winner, setWinner] = useState(a.fighter_id);
  const [method, setMethod] = useState(METHODS.KO);
  const [round, setRound] = useState(3);
  const [sweep, setSweep] = useState(false);
  const noWinner = [METHODS.TD, METHODS.NC, METHODS.D].includes(method);

  const apply = () => run(() => service.admin.applyResult(bout.bout_id, {
    winner_id: noWinner ? null : winner,
    method,
    round: Number(round),
    clean_sweep: !noWinner && sweep,
  }));

  return (
    <div className="victory-card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-victory-text text-xs font-semibold">{a.name.split(" ").slice(-1)} vs {b.name.split(" ").slice(-1)}</p>
        <span className="text-[10px] uppercase font-heading font-bold text-victory-muted">{bout.status}</span>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        <select className="victory-input min-h-[40px] text-xs px-2" value={noWinner ? "" : winner} disabled={noWinner} onChange={(e) => setWinner(e.target.value)} aria-label="Winner">
          {noWinner && <option value="">No winner</option>}
          {bout.fighters.map((f) => <option key={f.fighter_id} value={f.fighter_id}>{f.name.split(" ").slice(-1)}</option>)}
        </select>
        <select className="victory-input min-h-[40px] text-xs px-2" value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Method">
          {Object.values(METHODS).map((m) => <option key={m} value={m}>{m === "D" ? "Draw" : m}</option>)}
        </select>
        <select className="victory-input min-h-[40px] text-xs px-2" value={round} onChange={(e) => setRound(e.target.value)} aria-label="Round">
          {Array.from({ length: bout.scheduled_rounds }, (_, i) => i + 1).map((r) => <option key={r} value={r}>R{r}</option>)}
        </select>
      </div>
      <label className="flex items-center gap-2 text-[11px] text-victory-muted">
        <input type="checkbox" checked={sweep && !noWinner} disabled={noWinner} onChange={(e) => setSweep(e.target.checked)} className="accent-victory-lime" />
        Clean sweep on a scorecard
      </label>
      <div className="grid grid-cols-3 gap-1.5">
        <button onClick={() => run(() => service.admin.startBout(bout.bout_id))} disabled={disabled || bout.status !== "upcoming"} className="victory-btn-ghost min-h-[40px] text-xs disabled:opacity-40">Start</button>
        <button onClick={apply} disabled={disabled} className="victory-btn-secondary min-h-[40px] text-xs disabled:opacity-40" title={METHOD_LABEL[method]}>Apply</button>
        <button onClick={() => run(() => service.admin.randomiseBout(bout.bout_id))} disabled={disabled} className="victory-btn-ghost min-h-[40px] text-xs flex items-center justify-center gap-1 disabled:opacity-40">
          <Shuffle className="w-3 h-3" /> Random
        </button>
      </div>
    </div>
  );
}
