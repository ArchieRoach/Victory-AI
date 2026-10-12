import { useEffect, useState } from "react";
import axios from "axios";
import { Mountain, Shield } from "lucide-react";
import { toast } from "sonner";
import { API } from "@/App";

// My Epic Win (McGonigal). Asked after the first week, never at sign-up; private to the
// fighter. Each "bad guy" comes with the move that beats it.
export function EpicWinCard() {
  const [d, setD] = useState(null);
  const [goal, setGoal] = useState(null);
  const [custom, setCustom] = useState("");
  const [bad, setBad] = useState([]);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    axios.get(`${API}/users/me/epic-win`).then((r) => setD(r.data)).catch(() => setD(false));
  }, []);

  if (!d || !d.eligible) return null;

  const save = async () => {
    try {
      const { data } = await axios.put(`${API}/users/me/epic-win`, { goal: custom.trim() ? null : goal, custom: custom.trim() || null, bad_guys: bad });
      setD(data);
      setEditing(false);
      toast.success("Locked in. Only you can see this.");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Couldn't save that");
    }
  };

  const toggleBad = (k) => setBad((b) => (b.includes(k) ? b.filter((x) => x !== k) : b.length < 3 ? [...b, k] : b));

  if (!d.epic || editing) {
    return (
      <section className="victory-card p-4 space-y-3" data-testid="epic-win-pick">
        <p className="section-label flex items-center gap-1.5"><Mountain className="w-3 h-3" /> Your big win</p>
        <p className="text-victory-text text-sm">A week in. What are you really training for?</p>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(d.goals).map(([k, label]) => (
            <button key={k} onClick={() => { setGoal(k); setCustom(""); }} aria-pressed={goal === k && !custom}
              className={`filter-pill ${goal === k && !custom ? "filter-pill-active" : "filter-pill-inactive"}`}>{label}</button>
          ))}
        </div>
        <input className="victory-input" maxLength={60} placeholder="Or write your own" value={custom} onChange={(e) => setCustom(e.target.value)} />
        <p className="text-[12px] text-victory-muted">What gets in your way? Pick up to 3.</p>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(d.bad_guys).map(([k, label]) => (
            <button key={k} onClick={() => toggleBad(k)} aria-pressed={bad.includes(k)}
              className={`filter-pill ${bad.includes(k) ? "filter-pill-active" : "filter-pill-inactive"}`}>{label}</button>
          ))}
        </div>
        <button className="victory-btn-primary" disabled={!goal && !custom.trim()} onClick={save}>Save my big win</button>
        <p className="text-[11px] text-victory-muted">Private. Your coach mentions it only after a real win.</p>
      </section>
    );
  }

  return (
    <section className="victory-card p-4 space-y-2" data-testid="epic-win">
      <div className="flex items-center justify-between">
        <p className="section-label flex items-center gap-1.5"><Mountain className="w-3 h-3" /> Your big win</p>
        <button className="text-[11px] text-victory-muted min-h-[44px] px-2 -mr-2"
          onClick={() => { setGoal(d.epic.goal); setCustom(d.epic.custom || ""); setBad(d.epic.bad_guys.map((b) => b.key)); setEditing(true); }}>Change</button>
      </div>
      <p className="text-victory-text font-heading font-bold">{d.epic.text}</p>
      {d.epic.bad_guys.map((b) => (
        <p key={b.key} className="text-[12px] text-victory-muted flex items-start gap-1.5">
          <Shield className="w-3.5 h-3.5 mt-0.5 text-victory-teal flex-shrink-0" />
          <span><span className="text-victory-text">{b.name}:</span> {b.move}</span>
        </p>
      ))}
    </section>
  );
}
