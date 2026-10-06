import { useCallback, useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import {
  ArrowLeft, CalendarDays, ShieldCheck, Pencil, MessageCircle, Share2, X, Swords, Users, Dumbbell, Building2, Check,
} from "lucide-react";
import { API } from "@/App";
import { BottomNav } from "@/components/BottomNav";

// Goal: one place for an amateur boxer's admin (record, next fight, camp, gym, training
//   partners), so they never need a notes app or a spreadsheet.
// Psychology: the buddy asks, and the boxer only answers. Answering a question is much
//   easier than remembering to log. The record at the top is who they are (identity), and
//   the camp log shows the work adding up (visible progress).
// Design: buddy messages that need an answer come first, with the form right there. Then
//   come the record, next fight, camp log, gym and partners. Records show "Self-reported"
//   until the gym owner verifies them.
const err = (e, fallback = "That didn't work. Try again.") => {
  const d = e?.response?.data?.detail;
  return typeof d === "string" ? d : fallback;
};

export default function FightCampPage() {
  const navigate = useNavigate();
  const [me, setMe] = useState(null);
  const [panel, setPanel] = useState(null); // null | "record" | "fight" | {checkin: id} | {result: id}

  const load = useCallback(() => axios.get(`${API}/amateur/me`).then((r) => setMe(r.data)).catch(() => toast.error("Couldn't load your boxing page")), []);
  useEffect(() => { load(); }, [load]);

  const done = async (text) => {
    if (text) toast.success(text);
    setPanel(null);
    await load();
  };

  if (!me) {
    return (
      <div className="min-h-screen bg-victory-bg p-4 space-y-3">
        {[0, 1, 2].map((i) => <div key={i} className="skeleton-shimmer h-24 rounded-lg" />)}
      </div>
    );
  }

  const pending = me.messages.filter((m) => !m.done);
  const fight = me.next_fight;

  return (
    <div className="min-h-screen bg-victory-bg pb-nav">
      <div className="sticky top-0 z-20 bg-victory-bg/95 backdrop-blur border-b border-victory-border">
        <header className="p-4 flex items-center gap-2">
          <button className="w-11 h-11 rounded-full flex items-center justify-center -ml-2" aria-label="Back" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5 text-victory-text" />
          </button>
          <div>
            <h1 className="text-xl font-heading font-extrabold text-victory-text">My boxing</h1>
            <p className="text-victory-muted text-sm">Record, fights, camp and gym in one place</p>
          </div>
        </header>
      </div>

      <main className="max-w-lg mx-auto px-4 py-4 space-y-4">
        {pending.map((m) => (
          <BuddyPrompt key={m.msg_id} msg={m} name={me.partner_name} open={panel} setOpen={setPanel} fight={me.upcoming.concat(me.history).find((f) => f.fight_id === m.fight_id)} onDone={done} />
        ))}

        <RecordCard record={me.record} editing={panel === "record"} onEdit={() => setPanel(panel === "record" ? null : "record")} onDone={done} />

        <section className="space-y-2">
          <p className="section-label">Next fight</p>
          {fight ? (
            <NextFight fight={fight} isMinor={me.is_minor} onCheckin={() => setPanel({ checkin: fight.fight_id })} onDone={done} />
          ) : panel !== "fight" ? (
            <div className="flex flex-col items-center justify-center py-8 text-center px-6 victory-card">
              <div className="w-16 h-16 rounded-2xl bg-victory-lime/10 border border-victory-lime/20 flex items-center justify-center mb-4">
                <CalendarDays className="w-8 h-8 text-victory-lime/60" />
              </div>
              <p className="text-victory-text font-bold text-lg mb-1">No fight booked</p>
              <p className="text-victory-muted text-sm">Tell {me.partner_name} when it is, and they'll help you through camp.</p>
              <button className="mt-4 victory-btn-primary w-auto px-6" onClick={() => setPanel("fight")}>Add my next fight</button>
            </div>
          ) : null}
          {panel === "fight" && <FightForm isMinor={me.is_minor} onCancel={() => setPanel(null)} onDone={done} />}
          {fight && panel?.checkin === fight.fight_id && !pending.some((m) => m.action === "checkin") && (
            <CheckinForm fightId={fight.fight_id} onDone={done} />
          )}
          {fight && me.upcoming.length < 3 && panel !== "fight" && (
            <button className="victory-btn-ghost w-full" onClick={() => setPanel("fight")}>Add another fight</button>
          )}
        </section>

        {me.checkins.length > 0 && <CampLog checkins={me.checkins} />}

        <GymCard gym={me.gym} isOwner={me.is_gym_owner} />

        <PartnersCard openTo={me.open_to} options={me.open_to_options} onChange={load} />

        {me.history.length > 0 && <History fights={me.history} />}

        <BuddyLog messages={me.messages.filter((m) => m.done).slice(0, 8)} name={me.partner_name} />
      </main>
      <BottomNav />
    </div>
  );
}

function BuddyPrompt({ msg, name, open, setOpen, fight, onDone }) {
  const dismiss = () => axios.post(`${API}/amateur/messages/${msg.msg_id}/dismiss`).then(() => onDone());
  const showForm = (msg.action === "checkin" && open?.checkin === msg.fight_id) || (msg.action === "result" && open?.result === msg.fight_id);
  return (
    <div className="victory-card p-3 space-y-2 border-victory-lime/40 bg-victory-lime/5" data-testid="buddy-prompt">
      <div className="flex gap-2">
        <MessageCircle className="w-4 h-4 text-victory-lime flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-victory-lime font-bold">{name}</p>
          <p className="text-victory-text text-sm">{msg.text}</p>
        </div>
        <button className="w-11 h-11 -mr-2 -mt-2 rounded-full flex items-center justify-center" aria-label="Dismiss" onClick={dismiss}>
          <X className="w-4 h-4 text-victory-muted" />
        </button>
      </div>
      {!showForm && msg.action !== "none" && (
        <button className="victory-btn-primary w-full"
          onClick={() => setOpen(msg.action === "checkin" ? { checkin: msg.fight_id } : { result: msg.fight_id })}>
          {msg.action === "checkin" ? "Tell them" : "Add my result"}
        </button>
      )}
      {showForm && msg.action === "checkin" && <CheckinForm fightId={msg.fight_id} onDone={onDone} />}
      {showForm && msg.action === "result" && <ResultForm fight={fight} onDone={onDone} />}
    </div>
  );
}

function RecordCard({ record, editing, onEdit, onDone }) {
  const [form, setForm] = useState(record);
  useEffect(() => setForm(record), [record]);
  const save = async () => {
    try {
      await axios.put(`${API}/amateur/record`, { wins: +form.wins, losses: +form.losses, draws: +form.draws });
      onDone("Record saved");
    } catch (e) { toast.error(err(e)); }
  };
  return (
    <section className="victory-card p-4" data-testid="amateur-record">
      <div className="flex items-center justify-between mb-2">
        <p className="section-label">Amateur record</p>
        <button className="w-11 h-11 -mr-3 rounded-full flex items-center justify-center" aria-label="Edit record" onClick={onEdit}>
          <Pencil className="w-4 h-4 text-victory-muted" />
        </button>
      </div>
      {editing ? (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2">
            {["wins", "losses", "draws"].map((k) => (
              <label key={k} className="text-[11px] text-victory-muted capitalize">{k}
                <input type="number" min={0} className="victory-input mt-1" value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
              </label>
            ))}
          </div>
          <button className="victory-btn-primary w-full" onClick={save}>Save record</button>
        </div>
      ) : (
        <>
          <div className="flex justify-center gap-8">
            {[["wins", "Won", "text-victory-lime"], ["losses", "Lost", "text-victory-muted"], ["draws", "Drew", "text-victory-text"]].map(([k, label, cls]) => (
              <div key={k} className="text-center">
                <p className={`font-mono font-bold text-3xl ${cls}`}>{record[k]}</p>
                <p className="text-victory-muted text-xs mt-1">{label}</p>
              </div>
            ))}
          </div>
          <p className={`text-center text-[11px] mt-3 flex items-center justify-center gap-1 ${record.verified ? "text-victory-teal" : "text-victory-muted"}`}>
            {record.verified ? <><ShieldCheck className="w-3.5 h-3.5" /> Verified by {record.verified_by}</> : "Self-reported — your gym owner can verify it"}
          </p>
        </>
      )}
    </section>
  );
}

function NextFight({ fight, isMinor, onCheckin, onDone }) {
  const share = async () => {
    const day = new Date(`${fight.date}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });
    const text = `My next fight: ${fight.event_name}, ${day}, vs ${fight.opponent_name}.${fight.fantasy_opt_in ? " Pick me in Victory Fantasy!" : ""}`;
    const url = `${window.location.origin}/fantasy`;
    try {
      if (navigator.share) await navigator.share({ text, url });
      else { await navigator.clipboard.writeText(`${text} ${url}`); toast.success("Copied — paste it anywhere"); }
    } catch {}
  };
  const cancel = async () => {
    if (!window.confirm("Remove this fight?")) return;
    await axios.post(`${API}/amateur/fights/${fight.fight_id}/cancel`).catch(() => {});
    onDone("Fight removed");
  };
  const opp = fight.opponent_record || {};
  return (
    <div className="victory-card p-4 space-y-3" data-testid="next-fight">
      <div className="flex items-start gap-3">
        <div className="text-center flex-shrink-0 w-14">
          <p className="font-mono font-bold text-3xl text-victory-lime leading-none">{Math.max(fight.days_to_go, 0)}</p>
          <p className="text-[10px] text-victory-muted mt-1">{fight.days_to_go === 1 ? "day to go" : "days to go"}</p>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-victory-text font-semibold truncate">{fight.event_name}</p>
          <p className="text-victory-muted text-[12px]">vs {fight.opponent_name} ({opp.wins || 0}-{opp.losses || 0}-{opp.draws || 0}){fight.opponent_club ? ` · ${fight.opponent_club}` : ""}</p>
          <p className="text-victory-muted text-[11px]">{fight.scheduled_rounds} rounds{fight.weight_class ? ` · ${fight.weight_class}` : ""}{fight.target_weight_kg ? ` · ${fight.target_weight_kg} kg` : ""}</p>
          {fight.fantasy_opt_in && <p className="text-victory-teal text-[11px]">In Fantasy{isMinor ? " (your gym and squad only)" : ""}</p>}
        </div>
      </div>
      {fight.camp_goals?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {fight.camp_goals.map((g) => <span key={g} className="text-[11px] px-2 py-1 rounded-full bg-victory-card-highlight text-victory-text">{g}</span>)}
        </div>
      )}
      <div className="flex gap-2">
        <button className="victory-btn-secondary flex-1" onClick={onCheckin}>Camp check-in</button>
        <button className="victory-btn-ghost w-11 px-0 flex items-center justify-center" aria-label="Share" onClick={share}><Share2 className="w-4 h-4" /></button>
        <button className="victory-btn-ghost w-11 px-0 flex items-center justify-center" aria-label="Remove fight" onClick={cancel}><X className="w-4 h-4" /></button>
      </div>
    </div>
  );
}

function FightForm({ isMinor, onCancel, onDone }) {
  const [f, setF] = useState({ date: "", event_name: "", opponent_name: "", opponent_club: "", ow: 0, ol: 0, od: 0, scheduled_rounds: 3, weight_class: "", target_weight_kg: "", goals: "", fantasy_opt_in: true });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const save = async () => {
    try {
      await axios.post(`${API}/amateur/fights`, {
        date: f.date, event_name: f.event_name, opponent_name: f.opponent_name, opponent_club: f.opponent_club,
        opponent_record: { wins: +f.ow, losses: +f.ol, draws: +f.od }, scheduled_rounds: +f.scheduled_rounds,
        weight_class: f.weight_class, target_weight_kg: f.target_weight_kg ? +f.target_weight_kg : null,
        camp_goals: f.goals.split(",").map((g) => g.trim()).filter(Boolean).slice(0, 3), fantasy_opt_in: f.fantasy_opt_in,
      });
      onDone("Fight added — your buddy will check in on camp");
    } catch (e) { toast.error(err(e, "Check the details and try again")); }
  };
  return (
    <div className="victory-card p-4 space-y-2" data-testid="fight-form">
      <label className="victory-label" htmlFor="ff-date">Fight date</label>
      <input id="ff-date" type="date" className="victory-input" value={f.date} onChange={set("date")} />
      <label className="victory-label" htmlFor="ff-event">Show name</label>
      <input id="ff-event" className="victory-input" maxLength={100} placeholder="e.g. Rays ABC club show" value={f.event_name} onChange={set("event_name")} />
      <label className="victory-label" htmlFor="ff-opp">Opponent</label>
      <input id="ff-opp" className="victory-input" maxLength={60} value={f.opponent_name} onChange={set("opponent_name")} />
      <input className="victory-input" maxLength={80} placeholder="Their club (optional)" aria-label="Opponent's club" value={f.opponent_club} onChange={set("opponent_club")} />
      <p className="text-[11px] text-victory-muted">Their record, if you know it (it sets the fantasy prices)</p>
      <div className="grid grid-cols-3 gap-2">
        {[["ow", "Won"], ["ol", "Lost"], ["od", "Drew"]].map(([k, l]) => (
          <label key={k} className="text-[11px] text-victory-muted">{l}<input type="number" min={0} className="victory-input mt-1" value={f[k]} onChange={set(k)} /></label>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <label className="text-[11px] text-victory-muted">Rounds<input type="number" min={1} max={12} className="victory-input mt-1" value={f.scheduled_rounds} onChange={set("scheduled_rounds")} /></label>
        <label className="text-[11px] text-victory-muted col-span-2">Fight weight (kg)<input type="number" step="0.1" className="victory-input mt-1" value={f.target_weight_kg} onChange={set("target_weight_kg")} /></label>
      </div>
      <input className="victory-input" maxLength={40} placeholder="Weight class (optional)" aria-label="Weight class" value={f.weight_class} onChange={set("weight_class")} />
      <label className="victory-label" htmlFor="ff-goals">Camp goals (up to 3, comma separated)</label>
      <input id="ff-goals" className="victory-input" maxLength={180} placeholder="sharper jab, more sparring, make weight" value={f.goals} onChange={set("goals")} />
      <label className="flex items-start gap-2 text-[12px] text-victory-text min-h-[44px]">
        <input type="checkbox" className="mt-1 accent-victory-lime" checked={f.fantasy_opt_in} onChange={set("fantasy_opt_in")} />
        <span>Put this fight in Fantasy so friends can pick me{isMinor ? " (only your gym and squad will see it)" : ""}. The venue is never shown.</span>
      </label>
      <div className="flex gap-2">
        <button className="victory-btn-ghost flex-1" onClick={onCancel}>Cancel</button>
        <button className="victory-btn-primary flex-1" disabled={!f.date || f.event_name.length < 2 || f.opponent_name.length < 2} onClick={save}>Save fight</button>
      </div>
    </div>
  );
}

function CheckinForm({ fightId, onDone }) {
  const [c, setC] = useState({ sessions: 3, sparring_rounds: 0, weight_kg: "", energy: 3, note: "" });
  const set = (k) => (e) => setC({ ...c, [k]: e.target.value });
  const save = async () => {
    try {
      const { data } = await axios.post(`${API}/amateur/fights/${fightId}/checkin`, {
        sessions: +c.sessions, sparring_rounds: +c.sparring_rounds, weight_kg: c.weight_kg ? +c.weight_kg : null, energy: +c.energy, note: c.note,
      });
      onDone(data.reply.text);
    } catch (e) { toast.error(err(e)); }
  };
  return (
    <div className="space-y-2" data-testid="checkin-form">
      <div className="grid grid-cols-3 gap-2">
        <label className="text-[11px] text-victory-muted">Sessions this week<input type="number" min={0} max={21} className="victory-input mt-1" value={c.sessions} onChange={set("sessions")} /></label>
        <label className="text-[11px] text-victory-muted">Sparring rounds<input type="number" min={0} className="victory-input mt-1" value={c.sparring_rounds} onChange={set("sparring_rounds")} /></label>
        <label className="text-[11px] text-victory-muted">Weight (kg)<input type="number" step="0.1" className="victory-input mt-1" value={c.weight_kg} onChange={set("weight_kg")} /></label>
      </div>
      <p className="text-[11px] text-victory-muted">Energy</p>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} onClick={() => setC({ ...c, energy: n })} aria-label={`Energy ${n} of 5`}
            className={`filter-pill flex-1 ${+c.energy === n ? "filter-pill-active" : "filter-pill-inactive"}`}>{n}</button>
        ))}
      </div>
      <input className="victory-input" maxLength={300} placeholder="Anything else? (optional)" aria-label="Note" value={c.note} onChange={set("note")} />
      <button className="victory-btn-primary w-full" onClick={save}>Send check-in</button>
    </div>
  );
}

function ResultForm({ fight, onDone }) {
  const [r, setR] = useState({ outcome: "win", method: "UD", round: "" });
  const needsMethod = r.outcome === "win" || r.outcome === "loss";
  const save = async () => {
    try {
      const { data } = await axios.post(`${API}/amateur/fights/${fight.fight_id}/result`, {
        outcome: r.outcome, method: needsMethod ? r.method : null, round: r.round ? +r.round : null,
      });
      onDone(data.reply.text);
    } catch (e) { toast.error(err(e)); }
  };
  if (!fight) return null;
  return (
    <div className="space-y-2" data-testid="result-form">
      <div className="grid grid-cols-4 gap-1.5">
        {[["win", "Won"], ["loss", "Lost"], ["draw", "Draw"], ["nc", "No contest"]].map(([k, l]) => (
          <button key={k} onClick={() => setR({ ...r, outcome: k })} className={`filter-pill ${r.outcome === k ? "filter-pill-active" : "filter-pill-inactive"}`}>{l}</button>
        ))}
      </div>
      {needsMethod && (
        <div className="grid grid-cols-3 gap-1.5">
          {[["UD", "Points (all judges)"], ["SD", "Split decision"], ["MD", "Majority"], ["KO", "Knockout"], ["TKO", "Stoppage"], ["DQ", "Disqualified"]].map(([k, l]) => (
            <button key={k} onClick={() => setR({ ...r, method: k })} className={`filter-pill text-[11px] ${r.method === k ? "filter-pill-active" : "filter-pill-inactive"}`}>{l}</button>
          ))}
        </div>
      )}
      {needsMethod && ["KO", "TKO", "DQ"].includes(r.method) && (
        <label className="text-[11px] text-victory-muted block">Round<input type="number" min={1} max={fight.scheduled_rounds} className="victory-input mt-1" value={r.round} onChange={(e) => setR({ ...r, round: e.target.value })} /></label>
      )}
      <button className="victory-btn-primary w-full" onClick={save}>Save result</button>
    </div>
  );
}

function CampLog({ checkins }) {
  return (
    <section className="space-y-2">
      <p className="section-label flex items-center gap-1.5"><Dumbbell className="w-3 h-3" /> This camp</p>
      <div className="victory-card divide-y divide-victory-border">
        {checkins.map((c) => (
          <div key={c.created_at} className="px-3 py-2 flex items-center gap-3 text-[12px]">
            <span className="text-victory-muted w-14">{new Date(c.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>
            <span className="text-victory-text flex-1">{c.sessions} sessions · {c.sparring_rounds} sparring rds{c.weight_kg ? ` · ${c.weight_kg} kg` : ""}</span>
            <span className="font-mono text-victory-muted">{c.energy}/5</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function GymCard({ gym, isOwner }) {
  const [queue, setQueue] = useState([]);
  useEffect(() => {
    if (isOwner) axios.get(`${API}/amateur/verify-queue`).then((r) => setQueue(r.data)).catch(() => {});
  }, [isOwner]);
  const verify = async (m) => {
    try {
      await axios.post(`${API}/amateur/verify/${m.user_id}`);
      setQueue((q) => q.filter((x) => x.user_id !== m.user_id));
      toast.success(`${m.name}'s record verified`);
    } catch (e) { toast.error(err(e)); }
  };
  return (
    <section className="space-y-2">
      <p className="section-label flex items-center gap-1.5"><Building2 className="w-3 h-3" /> Gym</p>
      {gym ? (
        <Link to={`/gyms/${gym.gym_id}`} className="victory-card p-3 flex items-center justify-between active:scale-[0.99] transition-transform">
          <span className="text-victory-text font-semibold">{gym.name}</span>
          <span className="text-[11px] text-victory-muted">{isOwner ? "You run this gym" : "Member"}</span>
        </Link>
      ) : (
        <Link to="/gyms" className="victory-card p-3 block text-sm text-victory-muted">Not in a gym yet — <span className="text-victory-lime font-semibold">find yours</span> so your coach can verify your record.</Link>
      )}
      {isOwner && queue.length > 0 && (
        <div className="victory-card p-3 space-y-2">
          <p className="text-[12px] text-victory-text font-semibold">Records to check</p>
          {queue.map((m) => (
            <div key={m.user_id} className="flex items-center justify-between text-[12px]">
              <span className="text-victory-text">{m.name} <span className="font-mono text-victory-muted">{m.record.wins}-{m.record.losses}-{m.record.draws}</span></span>
              <button className="victory-btn-secondary w-auto px-3 min-h-[44px] text-xs flex items-center gap-1" onClick={() => verify(m)}><Check className="w-3.5 h-3.5" /> Correct</button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function PartnersCard({ openTo, options, onChange }) {
  const [looking, setLooking] = useState(null);
  const [found, setFound] = useState([]);
  const toggle = async (key) => {
    const next = openTo.includes(key) ? openTo.filter((k) => k !== key) : [...openTo, key];
    await axios.put(`${API}/amateur/open-to`, { open_to: next }).catch(() => toast.error("Couldn't save that"));
    onChange();
  };
  const search = async (key) => {
    setLooking(key);
    const { data } = await axios.get(`${API}/amateur/partners`, { params: { open_to: key } }).catch(() => ({ data: [] }));
    setFound(data);
  };
  return (
    <section className="space-y-2">
      <p className="section-label flex items-center gap-1.5"><Users className="w-3 h-3" /> Who I'll work with</p>
      <div className="victory-card p-3 space-y-2">
        <p className="text-[11px] text-victory-muted">Show others you're open to:</p>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(options).map(([k, label]) => (
            <button key={k} onClick={() => toggle(k)} className={`filter-pill ${openTo.includes(k) ? "filter-pill-active" : "filter-pill-inactive"}`}>{label}</button>
          ))}
        </div>
        <p className="text-[11px] text-victory-muted pt-1">Find boxers open to:</p>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(options).map(([k, label]) => (
            <button key={k} onClick={() => search(k)} className={`filter-pill ${looking === k ? "filter-pill-active" : "filter-pill-inactive"}`}>{label}</button>
          ))}
        </div>
        {looking && !found.length && <p className="text-[12px] text-victory-muted">No one yet. Your gym-mates show up first when they switch it on.</p>}
        {found.map((p) => (
          <Link key={p.user_id} to={`/profile/${p.user_id}`} className="flex items-center justify-between text-[12px] min-h-[44px]">
            <span className="text-victory-text">{p.display_name} {p.same_gym && <span className="text-victory-teal">· your gym</span>}</span>
            <span className="font-mono text-victory-muted">{p.record.wins}-{p.record.losses}-{p.record.draws}{p.weight_class ? ` · ${p.weight_class}` : ""}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function History({ fights }) {
  const label = { win: "W", loss: "L", draw: "D", nc: "NC" };
  return (
    <section className="space-y-2">
      <p className="section-label flex items-center gap-1.5"><Swords className="w-3 h-3" /> Fights</p>
      <div className="victory-card divide-y divide-victory-border">
        {fights.map((f) => (
          <div key={f.fight_id} className="px-3 py-2 flex items-center gap-3 text-[12px]">
            <span className={`font-mono font-bold w-6 ${f.result?.outcome === "win" ? "text-victory-lime" : f.result?.outcome === "loss" ? "text-victory-danger" : "text-victory-muted"}`}>{label[f.result?.outcome] || "?"}</span>
            <span className="text-victory-text flex-1 truncate">vs {f.opponent_name} · {f.event_name}</span>
            <span className="text-victory-muted">{f.result?.method || ""}{f.result?.round ? ` R${f.result.round}` : ""}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function BuddyLog({ messages, name }) {
  if (!messages.length) return null;
  return (
    <section className="space-y-2">
      <p className="section-label flex items-center gap-1.5"><MessageCircle className="w-3 h-3" /> {name}</p>
      {messages.map((m) => (
        <div key={m.msg_id} className="victory-card px-3 py-2 text-[12px] text-victory-muted">{m.text}</div>
      ))}
    </section>
  );
}
