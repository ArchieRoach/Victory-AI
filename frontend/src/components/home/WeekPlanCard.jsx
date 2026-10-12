import { useEffect, useState } from "react";
import axios from "axios";
import { CalendarCheck, Bell, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { API } from "@/App";

// Pick your week (autonomy) and a reminder you choose (Fogg's prompt). The reasoning for both
// lives in backend/gamification.py next to the rules.
const SKILLS = ["Jab", "Cross", "Footwork", "Guard Position", "Head Movement", "Combination Flow"];

export function WeekPlanCard() {
  const [w, setW] = useState(null);
  const [rem, setRem] = useState(null);
  const [editing, setEditing] = useState(false);
  const [target, setTarget] = useState(3);
  const [focus, setFocus] = useState(null);

  useEffect(() => {
    axios.get(`${API}/week-plan`).then((r) => { setW(r.data); setTarget(r.data.target); setFocus(r.data.focus); }).catch(() => setW(false));
    axios.get(`${API}/users/me/reminder`).then((r) => setRem(r.data)).catch(() => {});
  }, []);

  if (w === false) return null;
  if (!w) return <div className="skeleton-shimmer h-28 rounded-lg" />;

  const save = async () => {
    try {
      const { data } = await axios.put(`${API}/week-plan`, { target, focus });
      setW({ ...w, ...data });
      setEditing(false);
      toast.success(`Your week: ${data.target} sessions${data.focus ? `, working on ${data.focus.toLowerCase()}` : ""}.`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Couldn't save that");
    }
  };

  const setReminder = async (anchor) => {
    try {
      const { data } = await axios.put(`${API}/users/me/reminder`, { anchor: anchor || null, tz_offset_minutes: new Date().getTimezoneOffset() });
      setRem(data);
      toast.success(anchor ? `We'll nudge you ${data.anchors[anchor].label.toLowerCase()}.` : "Reminder off.");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Couldn't save that");
    }
  };

  if (!w.chosen || editing) {
    return (
      <section className="victory-card p-4 space-y-3" data-testid="week-plan-pick">
        <p className="section-label flex items-center gap-1.5"><CalendarCheck className="w-3 h-3" /> Pick your week</p>
        <p className="text-victory-text text-sm">How many sessions this week? You choose. Your partner keeps pace with you.</p>
        <div className="grid grid-cols-3 gap-2">
          {w.targets.map((n) => (
            <button key={n} onClick={() => setTarget(n)} aria-pressed={target === n}
              className={`filter-pill min-h-[44px] ${target === n ? "filter-pill-active" : "filter-pill-inactive"}`}>{n} sessions</button>
          ))}
        </div>
        <p className="text-[12px] text-victory-muted">One skill to work on (optional)</p>
        <div className="flex flex-wrap gap-1.5">
          {SKILLS.map((s) => (
            <button key={s} onClick={() => setFocus(focus === s ? null : s)} aria-pressed={focus === s}
              className={`filter-pill ${focus === s ? "filter-pill-active" : "filter-pill-inactive"}`}>{s}</button>
          ))}
        </div>
        <button className="victory-btn-primary" onClick={save}>Lock in my week</button>
      </section>
    );
  }

  return (
    <section className={`victory-card p-4 space-y-2 ${w.complete ? "border-victory-lime/30 bg-victory-lime/5" : ""}`} data-testid="week-plan">
      <div className="flex items-center justify-between">
        <p className="section-label flex items-center gap-1.5"><CalendarCheck className="w-3 h-3" /> Your week</p>
        <button className="text-[11px] text-victory-muted min-h-[44px] px-2 -mr-2" onClick={() => setEditing(true)}>Change</button>
      </div>
      <div className="flex gap-1.5" aria-label={`${w.done} of ${w.target} sessions`}>
        {Array.from({ length: w.target }, (_, i) => (
          <div key={i} className={`h-2 flex-1 rounded-full ${i < w.done ? "bg-victory-lime" : "bg-victory-card-highlight"}`} />
        ))}
      </div>
      <p className="text-victory-text text-sm">
        {w.complete
          ? <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-victory-lime" /> Week done. Extra sessions are a bonus, not a must.</span>
          : <><span className="font-mono">{w.done}/{w.target}</span> sessions{w.focus ? <> · working on <span className="font-semibold">{w.focus}</span></> : null}</>}
      </p>
      {rem && (
        <label className="flex items-center gap-2 text-[12px] text-victory-muted pt-1 border-t border-victory-border">
          <Bell className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="flex-1">Nudge me</span>
          <select className="victory-input w-auto py-1 text-[12px]" aria-label="When to nudge you"
            value={rem.on ? rem.anchor : ""} onChange={(e) => setReminder(e.target.value)}>
            <option value="">Never</option>
            {Object.entries(rem.anchors).filter(([, a]) => a.hour <= rem.last_hour).map(([k, a]) => <option key={k} value={k}>{a.label}</option>)}
          </select>
        </label>
      )}
    </section>
  );
}
