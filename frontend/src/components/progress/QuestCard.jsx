import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { Target, CheckCircle2, Zap, Vote, Swords } from "lucide-react";
import { toast } from "sonner";
import { API } from "@/App";
import { resetCountdown } from "@/lib/progression";
import { BragButton } from "./BragButton";

// Team missions. Goal: crews own their week. Psychology: meaningful choice and making
// something together bond a group more than counting sessions. Design: the crew votes for
// a mission (locked once the first session counts), the Signature Combo is nominated and
// voted by the crew, and finishing lets each member pick their own booster.
export function QuestList() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [combos, setCombos] = useState([]);
  const load = useCallback(() => axios.get(`${API}/quests/mine`).then((r) => setData(r.data)).catch(() => setData({ quests: [] })), []);
  useEffect(() => {
    load();
    axios.get(`${API}/combos`).then((r) => setCombos(r.data.combos || [])).catch(() => {});
  }, [load]);

  const act = async (fn, ok) => {
    try { const r = await fn(); if (ok) toast.success(typeof ok === "function" ? ok(r.data) : ok); load(); }
    catch (e) { const d = e?.response?.data?.detail; toast.error(typeof d === "string" ? d : "That didn't work, try again"); }
  };

  if (!data) return <div className="skeleton-shimmer h-40 rounded-lg" />;
  if (!data.quests.length) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center px-6">
        <div className="w-16 h-16 rounded-2xl bg-victory-lime/10 border border-victory-lime/20 flex items-center justify-center mb-4">
          <Target className="w-8 h-8 text-victory-lime/60" />
        </div>
        <p className="text-victory-text font-bold text-lg mb-1">Missions need a squad</p>
        <p className="text-victory-muted text-sm">Each week your squad picks a mission. Finish it together and everyone picks a booster.</p>
        <button className="mt-4 victory-btn-primary w-auto px-6" onClick={() => navigate("/squads")}>Find your squad</button>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="quests">
      {data.booster_picks > 0 && (
        <section className="victory-card p-4 space-y-2 border-victory-lime/30 bg-victory-lime/5" data-testid="booster-pick">
          <p className="section-label flex items-center gap-1.5"><Zap className="w-3 h-3" /> Pick your booster</p>
          <div className="space-y-2">
            {Object.entries(data.booster_choices).map(([key, label]) => (
              <button key={key} className="victory-btn-secondary" onClick={() => act(() => axios.post(`${API}/boosters/pick`, { choice: key }), (d) => `Picked: ${d.label}`)}>{label}</button>
            ))}
          </div>
        </section>
      )}
      <p className="text-[11px] text-victory-muted">New mission every Monday. {resetCountdown(data.resets_at)}</p>
      {data.quests.map((q) => (
        <section key={q.squad_id} className={`victory-card p-4 space-y-3 ${q.completed ? "border-victory-lime/30 bg-victory-lime/5" : ""}`}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-victory-text font-semibold truncate">{q.name}</p>
            {q.completed
              ? <span className="text-[10px] font-heading font-bold uppercase text-victory-lime flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Done</span>
              : <span className="font-mono text-sm text-victory-text">{q.progress}/{q.target}</span>}
          </div>

          {!q.locked ? (
            <div className="space-y-2">
              <p className="text-[12px] text-victory-muted flex items-center gap-1.5"><Vote className="w-3.5 h-3.5" /> Vote for this week's mission. It locks when the first session counts.</p>
              {q.routes.map((r) => (
                <button key={r.key} onClick={() => act(() => axios.post(`${API}/quests/${q.squad_id}/route`, { route: r.key }), `You voted ${r.name}`)}
                  className={`w-full text-left rounded-xl p-3 border ${q.my_route_vote === r.key ? "border-victory-lime/50 bg-victory-lime/5" : "border-victory-border bg-victory-card-highlight"}`}>
                  <span className="flex items-center justify-between">
                    <span className="text-victory-text text-sm font-semibold">{r.name}</span>
                    <span className="text-[11px] text-victory-muted"><span className="font-mono text-victory-text">{r.votes}</span> vote{r.votes === 1 ? "" : "s"}</span>
                  </span>
                  <span className="block text-[11px] text-victory-muted mt-0.5">{r.desc}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-[12px] text-victory-text"><span className="font-semibold">{q.route_name}:</span> <span className="text-victory-muted">{q.route_desc}</span></p>
          )}

          {q.route === "signature" && (
            <div className="space-y-2 rounded-xl bg-victory-card-highlight border border-victory-border p-3">
              <p className="text-[12px] text-victory-text font-semibold flex items-center gap-1.5"><Swords className="w-3.5 h-3.5 text-victory-lime" /> Crew combo</p>
              {q.nominations.length === 0 && <p className="text-[11px] text-victory-muted">Nobody has put a combo forward yet.</p>}
              {q.nominations.map((n) => (
                <div key={n.by} className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-mono font-bold text-victory-text text-sm">{n.label}{q.signature === n.label ? " ★" : ""}</p>
                    <p className="text-[10px] text-victory-muted truncate">{n.name ? `${n.name} · ` : ""}by {n.by_name} · {n.votes} vote{n.votes === 1 ? "" : "s"}</p>
                  </div>
                  <button className={`filter-pill ${q.my_signature_vote === n.by ? "filter-pill-active" : "filter-pill-inactive"}`}
                    onClick={() => act(() => axios.post(`${API}/quests/${q.squad_id}/signature/vote`, { nominee: n.by }), "Vote counted")}>Vote</button>
                </div>
              ))}
              {combos.length > 0 ? (
                <select className="victory-input" aria-label="Put one of your combos forward" defaultValue=""
                  onChange={(e) => e.target.value && act(() => axios.post(`${API}/quests/${q.squad_id}/signature/nominate`, { combo_id: e.target.value }), "Your combo is up for the vote")}>
                  <option value="" disabled>Put one of your combos forward…</option>
                  {combos.map((c) => <option key={c.combo_id} value={c.combo_id}>{c.label}{c.name ? ` (${c.name})` : ""}</option>)}
                </select>
              ) : (
                <button className="victory-btn-ghost" onClick={() => navigate("/combos")}>Build a combo to put forward</button>
              )}
              {q.signature && (
                <button className="victory-btn-primary" onClick={() => act(() => axios.post(`${API}/quests/${q.squad_id}/signature/drill`), "Your partner will watch for the crew combo")}>Drill the crew combo</button>
              )}
            </div>
          )}

          <p className="text-[12px] text-victory-muted">Reward: {q.reward}.</p>
          <div className="h-2 rounded-full bg-victory-card-highlight overflow-hidden" role="progressbar" aria-valuenow={q.pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${q.name} mission progress`}>
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
