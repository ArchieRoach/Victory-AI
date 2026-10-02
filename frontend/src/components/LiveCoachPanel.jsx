import { Activity, Ghost, Headphones } from "lucide-react";

// During the round: the counts, live, over the camera preview.
export function LiveCoachOverlay({ status, stats, ghost, airpods }) {
  if (status === "loading") {
    return <span className="absolute bottom-2 left-2 bg-black/60 text-white text-[10px] px-2 py-1 rounded-full">Live Coach warming up…</span>;
  }
  if (status === "error") {
    return <span className="absolute bottom-2 left-2 bg-black/60 text-white text-[10px] px-2 py-1 rounded-full">Live Coach unavailable on this device</span>;
  }
  if (status !== "ready") return null;
  if (stats && !stats.inFrame) {
    return <span className="absolute bottom-2 left-2 bg-black/70 text-victory-orange text-xs font-bold px-2 py-1 rounded-full">Step back so your shoulders and hands are in frame</span>;
  }
  const punches = stats?.punches ?? 0;
  const ahead = ghost != null ? punches - ghost : null;
  return (
    <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent flex items-end justify-between gap-2" data-testid="live-coach-overlay">
      <div>
        <p className="font-mono font-bold text-2xl text-victory-lime leading-none">{punches}</p>
        <p className="text-white/70 text-[10px]">punches</p>
      </div>
      {ghost != null && (
        <div className="text-center">
          <p className={`font-mono font-bold text-sm leading-none ${ahead >= 0 ? "text-victory-lime" : "text-victory-orange"}`}>
            {ahead >= 0 ? `+${ahead}` : ahead}
          </p>
          <p className="text-white/70 text-[10px] flex items-center gap-0.5"><Ghost className="w-3 h-3" /> vs best</p>
        </div>
      )}
      <div className="text-right text-[10px] text-white/80 leading-tight">
        <p>Combo <span className="font-mono text-white">{stats?.bestCombo ?? 0}</span></p>
        <p>Guard <span className="font-mono text-white">{stats?.guardPct ?? "–"}{stats?.guardPct != null ? "%" : ""}</span></p>
        <p className="flex items-center justify-end gap-0.5">
          {airpods && <Headphones className="w-3 h-3 text-victory-teal" />}Head <span className="font-mono text-white">{stats?.headMoves ?? 0}</span>
        </p>
      </div>
    </div>
  );
}

// Between rounds: what the last round looked like.
export function LiveRoundSummary({ round, ghostPunches }) {
  if (!round) return null;
  return (
    <div className="victory-card p-3 mb-3 flex items-center gap-3" data-testid="live-round-summary">
      <Activity className="w-5 h-5 text-victory-lime flex-shrink-0" />
      <div className="flex-1 grid grid-cols-4 gap-2 text-center">
        <Stat label="punches" value={round.punches} />
        <Stat label="best combo" value={round.bestCombo} />
        <Stat label="guard" value={round.guardPct != null ? `${round.guardPct}%` : "–"} />
        <Stat label="head moves" value={round.headMoves} />
      </div>
      {ghostPunches != null && (
        <p className="text-[10px] text-victory-muted w-14 text-right leading-tight">
          Best: <span className="font-mono text-victory-text">{ghostPunches}</span>
        </p>
      )}
    </div>
  );
}

const Stat = ({ label, value }) => (
  <div>
    <p className="font-mono font-bold text-victory-text">{value}</p>
    <p className="text-victory-muted text-[10px]">{label}</p>
  </div>
);

// On the results screen, with any records the session set.
export function LiveSessionStats({ stats, records = [] }) {
  if (!stats) return null;
  return (
    <section className={`victory-card p-4 space-y-3 ${records.length ? "border-victory-lime/40" : ""}`} data-testid="live-session-stats">
      <div className="flex items-center justify-between">
        <p className="section-label flex items-center gap-1.5"><Activity className="w-3 h-3" /> Live Coach</p>
        <span className="text-victory-muted text-[10px]">counted on your phone{stats.airpods ? " + AirPods" : ""}</span>
      </div>
      <div className="grid grid-cols-4 gap-2 text-center">
        <Stat label="punches" value={stats.punches} />
        <Stat label="best combo" value={stats.best_combo} />
        <Stat label="guard" value={stats.guard_pct != null ? `${stats.guard_pct}%` : "–"} />
        <Stat label="head moves" value={stats.head_moves} />
      </div>
      {records.map((r) => (
        <p key={r.name} className="text-sm flex items-center justify-between animate-scale-in">
          <span className="text-victory-text font-semibold">New record: {r.name}</span>
          <span className="font-mono">
            {r.prev != null && <span className="text-victory-muted line-through mr-2">{r.prev}</span>}
            <span className="text-victory-lime font-bold">{r.value}</span>
          </span>
        </p>
      ))}
    </section>
  );
}
