import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Lock, Zap, Sparkles } from "lucide-react";
import { usePalette } from "@/hooks/useSystemTheme";
import { weekLabel } from "@/lib/progression";

// Goal: visible progress that only ever goes up.
// Psychology: goal-gradient (people speed up near a goal) and monitoring attachment (watching
//   something you own grow keeps you checking on it).
// Design: level and bar, the next named unlock, live boosters, and an 8-week chart of effort.
export function LevelCard({ p }) {
  if (!p) return <div className="skeleton-shimmer h-48 rounded-lg" />;
  return (
    <section className="victory-card p-4 space-y-3" data-testid="level-card">
      <div className="flex items-end justify-between">
        <div>
          <p className="section-label">Status</p>
          <p className="text-victory-text font-heading font-extrabold text-2xl">
            Level <span className="font-mono text-victory-lime">{p.level}</span>
            {p.title && <span className="ml-2 text-sm text-victory-teal font-semibold align-middle">{p.title}</span>}
          </p>
        </div>
        <p className="text-right text-[11px] text-victory-muted">
          <span className="font-mono font-bold text-victory-text text-base">{p.status_points.toLocaleString()}</span><br />status points
        </p>
      </div>
      <div>
        <div className="h-2 rounded-full bg-victory-card-highlight overflow-hidden" role="progressbar"
          aria-valuenow={p.pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progress to next level">
          <div className="h-full bg-victory-lime rounded-full transition-all" style={{ width: `${p.pct}%` }} />
        </div>
        <p className="text-[11px] text-victory-muted mt-1"><span className="font-mono text-victory-text">{p.to_next_level}</span> to level {p.level + 1}</p>
      </div>

      {p.next_milestone && (
        <div className="flex items-center gap-3 rounded-lg bg-victory-card-highlight border border-victory-border p-3">
          <div className="w-10 h-10 rounded-2xl bg-victory-lime/10 border border-victory-lime/20 flex items-center justify-center flex-shrink-0">
            <Lock className="w-4 h-4 text-victory-lime/70" />
          </div>
          <div className="min-w-0">
            <p className="text-victory-text text-sm font-semibold">Level {p.next_milestone.level} unlocks {p.next_milestone.name}</p>
            <p className="text-victory-muted text-[11px]">{p.next_milestone.desc} · {p.next_milestone.to_go} points to go</p>
          </div>
        </div>
      )}

      {p.boosters?.map((b) => (
        <div key={b.expires_at} className="flex items-center gap-2 text-[12px] text-victory-teal">
          <Zap className="w-4 h-4" /> {b.label}: 2x status on your next {b.sessions_left > 1 ? `${b.sessions_left} sessions` : "session"}
        </div>
      ))}

      {p.unlocked?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {p.unlocked.map((m) => (
            <span key={m.name} className="text-[10px] font-heading font-bold px-2 py-1 rounded-full bg-victory-lime/10 text-victory-lime flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> {m.name}
            </span>
          ))}
        </div>
      )}
      <WeeklyChart weeks={p.weekly} />
    </section>
  );
}

function WeeklyChart({ weeks }) {
  const palette = usePalette();
  if (!weeks?.some((w) => w.points > 0)) return null;
  const data = weeks.map((w) => ({ ...w, label: weekLabel(w.week_id) }));
  return (
    <div>
      <p className="section-label mb-1">Weekly points</p>
      <div className="h-28" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }} barCategoryGap={6}>
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: palette.muted }} />
            <Tooltip cursor={{ fill: `${palette.lime}14` }}
              content={({ active, payload }) => active && payload?.length ? (
                <div className="bg-victory-card border border-victory-border rounded-lg px-3 py-2 text-[11px]">
                  <p className="text-victory-text font-mono font-bold">{payload[0].payload.points} pts</p>
                  <p className="text-victory-muted">{payload[0].payload.sessions} sessions</p>
                </div>
              ) : null} />
            <Bar dataKey="points" fill={palette.lime} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ul className="sr-only">
        {data.map((w) => <li key={w.week_id}>{w.label}: {w.points} points, {w.sessions} sessions</li>)}
      </ul>
    </div>
  );
}
