import { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { Target, CheckCircle2 } from "lucide-react";
import { API } from "@/App";
import { resetCountdown } from "@/lib/progression";
import { BragButton } from "./BragButton";

// Goal: squads train together, and quiet members get pulled back in.
// Psychology: nobody wins until the group does, so members chase each other up (relatedness).
// Design: one shared bar per squad, everyone's part shown, reward stated up front.
export function QuestList() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  useEffect(() => {
    axios.get(`${API}/quests/mine`).then((r) => setData(r.data)).catch(() => setData({ quests: [] }));
  }, []);
  if (!data) return <div className="skeleton-shimmer h-40 rounded-lg" />;
  if (!data.quests.length) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center px-6">
        <div className="w-16 h-16 rounded-2xl bg-victory-lime/10 border border-victory-lime/20 flex items-center justify-center mb-4">
          <Target className="w-8 h-8 text-victory-lime/60" />
        </div>
        <p className="text-victory-text font-bold text-lg mb-1">Quests need a squad</p>
        <p className="text-victory-muted text-sm">Each week your squad gets a shared training target. Hit it together and everyone levels faster.</p>
        <button className="mt-4 victory-btn-primary w-auto px-6" onClick={() => navigate("/squads")}>Find your squad</button>
      </div>
    );
  }
  return (
    <div className="space-y-3" data-testid="quests">
      <p className="text-[11px] text-victory-muted">New quest every Monday. {resetCountdown(data.resets_at)}</p>
      {data.quests.map((q) => (
        <section key={q.squad_id} className={`victory-card p-4 space-y-3 ${q.completed ? "border-victory-lime/30 bg-victory-lime/5" : ""}`}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-victory-text font-semibold truncate">{q.name}</p>
            {q.completed
              ? <span className="text-[10px] font-heading font-bold uppercase text-victory-lime flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Done</span>
              : <span className="font-mono text-sm text-victory-text">{q.progress}/{q.target}</span>}
          </div>
          <p className="text-[12px] text-victory-muted">Train {q.target} sessions between you this week. Reward: {q.reward}.</p>
          <div className="h-2 rounded-full bg-victory-card-highlight overflow-hidden" role="progressbar" aria-valuenow={q.pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${q.name} quest progress`}>
            <div className="h-full bg-victory-lime rounded-full transition-all" style={{ width: `${q.pct}%` }} />
          </div>
          <ul className="flex flex-wrap gap-1.5">
            {q.members.map((m) => (
              <li key={m.user_id} className={`text-[11px] px-2 py-1 rounded-full ${m.sessions ? "bg-victory-teal/10 text-victory-teal" : "bg-victory-card-highlight text-victory-muted"}`}>
                {m.name} · <span className="font-mono">{m.sessions}</span>
              </li>
            ))}
          </ul>
          {q.completed && <BragButton win={{ kind: "quest" }} label="Show off the squad" />}
        </section>
      ))}
    </div>
  );
}
