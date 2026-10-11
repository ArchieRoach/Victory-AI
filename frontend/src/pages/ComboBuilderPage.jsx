import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { ArrowLeft, Delete, Target, Trash2, Check } from "lucide-react";
import { toast } from "sonner";
import { API } from "@/App";
import { BottomNav } from "@/components/BottomNav";

// Build your own combination and make it this week's focus. Reasoning: "Combo builder" in
// backend/gamification.py (autonomy and creativity: a plan you designed is one you follow).
const PUNCHES = ["1", "2", "3", "4", "5", "6"];
const DEFENCE = ["slip", "roll", "parry", "pivot", "step_back"];
const MAX = 8;

export default function ComboBuilderPage() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [moves, setMoves] = useState([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => axios.get(`${API}/combos`).then((r) => setData(r.data)).catch(() => setData(false)), []);
  useEffect(() => { load(); }, [load]);

  const label = (m) => (PUNCHES.includes(m) ? m : data?.moves?.[m] || m);
  const err = (e, fallback) => {
    const d = e?.response?.data?.detail;
    toast.error(typeof d === "string" ? d : fallback);
  };

  const save = async (focus) => {
    setBusy(true);
    try {
      const { data: combo } = await axios.post(`${API}/combos`, { name, moves });
      if (focus) {
        const { data: f } = await axios.post(`${API}/combos/${combo.combo_id}/focus`);
        toast.success(f.line);
      } else {
        toast.success("Saved");
      }
      setMoves([]); setName("");
      load();
    } catch (e) {
      err(e, "Couldn't save that combination");
    }
    setBusy(false);
  };

  const act = async (fn, ok) => {
    try { const r = await fn(); toast.success(typeof ok === "function" ? ok(r.data) : ok); load(); } catch (e) { err(e, "That didn't work"); }
  };

  if (data === false) return <div className="min-h-screen bg-victory-bg p-6 text-victory-muted">Couldn't load your combinations.</div>;

  return (
    <div className="min-h-screen bg-victory-bg pb-nav" data-testid="combo-builder">
      <header className="p-4 flex items-center gap-2 border-b border-victory-border">
        <button className="w-11 h-11 rounded-full flex items-center justify-center -ml-2" aria-label="Back" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5 text-victory-text" />
        </button>
        <div>
          <h1 className="text-xl font-heading font-extrabold text-victory-text">Combo builder</h1>
          <p className="text-victory-muted text-sm">Design it. Drill it. Your AI partner checks it on video.</p>
        </div>
      </header>

      <main className="max-w-lg mx-auto p-4 space-y-4">
        {data?.active && (
          <section className="victory-card p-4 border-victory-lime/30 bg-victory-lime/5 flex items-center gap-3">
            <Target className="w-5 h-5 text-victory-lime flex-shrink-0" />
            <div className="min-w-0">
              <p className="section-label">This week's focus</p>
              <p className="text-victory-text font-mono font-bold">{data.active.label}</p>
              {data.active.name && <p className="text-victory-muted text-[11px]">{data.active.name}</p>}
            </div>
          </section>
        )}

        <section className="victory-card p-4 space-y-3">
          <div className="min-h-[56px] rounded-lg bg-victory-card-highlight border border-victory-border p-3 flex flex-wrap items-center gap-1.5" aria-live="polite">
            {moves.length === 0 ? <span className="text-victory-muted text-sm">Tap moves to build your combination</span>
              : moves.map((m, i) => (
                <span key={i} className={`px-2.5 py-1 rounded-full font-heading font-bold text-sm ${PUNCHES.includes(m) ? "bg-victory-lime text-victory-bg" : "bg-victory-teal/15 text-victory-teal"}`}>{label(m)}</span>
              ))}
            {moves.length > 0 && (
              <button aria-label="Remove last move" className="ml-auto w-11 h-11 rounded-full flex items-center justify-center text-victory-muted" onClick={() => setMoves(moves.slice(0, -1))}>
                <Delete className="w-4 h-4" />
              </button>
            )}
          </div>

          <p className="section-label">Punches</p>
          <div className="grid grid-cols-6 gap-1.5">
            {PUNCHES.map((m) => (
              <button key={m} disabled={moves.length >= MAX} onClick={() => setMoves([...moves, m])} title={data?.moves?.[m]}
                className="min-h-[48px] rounded-xl bg-victory-card-highlight border border-victory-border font-mono font-bold text-lg text-victory-text active:scale-95 transition-transform">{m}</button>
            ))}
          </div>
          <p className="text-[10px] text-victory-muted">1 jab · 2 cross · 3 lead hook · 4 rear hook · 5 lead uppercut · 6 rear uppercut</p>
          <p className="section-label">Defence and feet</p>
          <div className="flex flex-wrap gap-1.5">
            {DEFENCE.map((m) => (
              <button key={m} disabled={moves.length >= MAX} onClick={() => setMoves([...moves, m])}
                className="filter-pill filter-pill-inactive">{data?.moves?.[m] || m}</button>
            ))}
          </div>

          <input className="victory-input" maxLength={24} placeholder="Name it (optional)" aria-label="Combination name" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <button className="victory-btn-ghost" disabled={busy || moves.length < 2} onClick={() => save(false)}>Save</button>
            <button className="victory-btn-primary" disabled={busy || moves.length < 2} onClick={() => save(true)}>Make it my focus</button>
          </div>
        </section>

        {data?.combos?.length > 0 && (
          <section className="space-y-2">
            <p className="section-label">Your combinations · {data.combos.length}/{data.max}</p>
            {data.combos.map((c) => {
              const active = data.active?.combo_id === c.combo_id;
              return (
                <div key={c.combo_id} className={`victory-card p-3 flex items-center gap-2 ${active ? "border-victory-lime/30" : ""}`}>
                  <div className="flex-1 min-w-0">
                    <p className="font-mono font-bold text-victory-text">{c.label}</p>
                    <p className="text-[11px] text-victory-muted truncate">{c.name || c.focus.join(" · ")}</p>
                  </div>
                  {active ? <span className="text-[10px] font-heading font-bold uppercase text-victory-lime flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Focus</span> : (
                    <button className="victory-btn-secondary w-auto px-3 min-h-[44px] text-sm" onClick={() => act(() => axios.post(`${API}/combos/${c.combo_id}/focus`), (d) => d.line)}>Focus</button>
                  )}
                  <button aria-label={`Delete ${c.label}`} className="w-11 h-11 rounded-full flex items-center justify-center text-victory-muted" onClick={() => act(() => axios.delete(`${API}/combos/${c.combo_id}`), "Deleted")}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </section>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
