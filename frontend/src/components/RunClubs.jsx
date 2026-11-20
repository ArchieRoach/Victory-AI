import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { CalendarDays, Copy, Footprints, MapPin, Plus, Users } from "lucide-react";
import { API } from "@/App";
import { BottomSheet } from "@/components/BottomSheet";
import { tx } from "@/i18n/tx";

// Run clubs: why they work is in backend/run_clubs.py (a fixed slot + an invite from your coach +
// seeing who's going). Staff set one up here; members say they're going for the next run.
const DAYS = () => [
  tx("ui.runClubs.monday", "Monday"), tx("ui.runClubs.tuesday", "Tuesday"), tx("ui.runClubs.wednesday", "Wednesday"),
  tx("ui.runClubs.thursday", "Thursday"), tx("ui.runClubs.friday", "Friday"), tx("ui.runClubs.saturday", "Saturday"),
  tx("ui.runClubs.sunday", "Sunday"),
];
const err = (e, fallback) => (typeof e?.response?.data?.detail === "string" ? e.response.data.detail : fallback);
export const joinLink = (code) => `${window.location.origin}/run-clubs/join/${code}`;

export function scheduleLine(club) {
  return tx("ui.runClubs.schedule", "Every {{day}} · {{time}} · {{km}} km", { day: DAYS()[club.weekday], time: club.time, km: club.distance_km });
}

export function nextRunLine(club) {
  const d = new Date(`${club.next_run}T12:00:00`);
  const when = d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  return tx("ui.runClubs.nextRun", "Next run {{when}} · {{count}} going", { when, count: club.going_count });
}

export function GoingButton({ club, onChange }) {
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    setBusy(true);
    try {
      const { data } = await axios.post(`${API}/run-clubs/${club.club_id}/rsvp`, { going: !club.i_am_going });
      onChange(data);
    } catch (e) {
      toast.error(err(e, tx("ui.runClubs.couldntSave", "Couldn't save that. Try again.")));
    }
    setBusy(false);
  };
  return (
    <button type="button" onClick={toggle} disabled={busy} data-testid="run-club-going"
      className={`${club.i_am_going ? "victory-btn-primary" : "victory-btn-secondary"} w-full min-h-[44px]`}>
      {club.i_am_going ? tx("ui.runClubs.youreGoing", "You're going ✓") : tx("ui.runClubs.imGoing", "I'm going")}
    </button>
  );
}

export function InviteRow({ club, onAnswered }) {
  const [busy, setBusy] = useState(false);
  const answer = async (choice) => {
    setBusy(true);
    try {
      const { data } = await axios.post(`${API}/run-clubs/invites/${club.invite_id}/${choice}`);
      if (choice === "accept") toast.success(tx("ui.runClubs.joined", "You're in {{name}}", { name: club.name }));
      onAnswered(choice === "accept" ? data : null);
    } catch (e) {
      toast.error(err(e, tx("ui.runClubs.couldntSave", "Couldn't save that. Try again.")));
      setBusy(false);
    }
  };
  return (
    <div className="grid grid-cols-2 gap-2">
      <button type="button" disabled={busy} onClick={() => answer("accept")} className="victory-btn-primary min-h-[44px]" data-testid="run-club-accept">
        {tx("ui.runClubs.join", "Join")}
      </button>
      <button type="button" disabled={busy} onClick={() => answer("decline")} className="victory-btn-ghost min-h-[44px]">
        {tx("ui.runClubs.noThanks", "No thanks")}
      </button>
    </div>
  );
}

function NewRunClubSheet({ gymId, onClose, onCreated }) {
  const [form, setForm] = useState({ name: "", weekday: 1, time: "18:30", distance_km: 5, meeting_point: "", description: "" });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const save = (close) => async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await axios.post(`${API}/gyms/${gymId}/run-clubs`, { ...form, weekday: Number(form.weekday), distance_km: Number(form.distance_km) });
      toast.success(tx("ui.runClubs.created", "Run club set up. Now invite people."));
      onCreated(data);
      close();
    } catch (e2) {
      toast.error(err(e2, tx("ui.runClubs.couldntSave", "Couldn't save that. Try again.")));
      setSaving(false);
    }
  };
  return (
    <BottomSheet onClose={onClose} label={tx("ui.runClubs.newRunClub", "New run club")} className="w-full max-w-lg mx-auto" testId="new-run-club">
      {({ close }) => (
      <form onSubmit={save(close)} className="p-4 space-y-3">
        <h2 className="font-heading font-bold text-lg text-victory-text">{tx("ui.runClubs.newRunClub", "New run club")}</h2>
        <label className="block">
          <span className="victory-label">{tx("ui.runClubs.name", "Name")}</span>
          <input className="victory-input" required minLength={2} maxLength={60} value={form.name} onChange={set("name")}
            placeholder={tx("ui.runClubs.namePlaceholder", "e.g. Tuesday Tempo")} data-testid="run-club-name" />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="victory-label">{tx("ui.runClubs.day", "Day")}</span>
            <select className="victory-input" value={form.weekday} onChange={set("weekday")}>
              {DAYS().map((d, i) => <option key={d} value={i}>{d}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="victory-label">{tx("ui.runClubs.startTime", "Start time")}</span>
            <input type="time" className="victory-input" required value={form.time} onChange={set("time")} />
          </label>
        </div>
        <label className="block">
          <span className="victory-label">{tx("ui.runClubs.distance", "Distance (km)")}</span>
          <input type="number" inputMode="decimal" min="1" max="42.2" step="0.5" className="victory-input" required value={form.distance_km} onChange={set("distance_km")} />
        </label>
        <label className="block">
          <span className="victory-label">{tx("ui.runClubs.meetingPoint", "Where to meet")}</span>
          <input className="victory-input" required minLength={2} maxLength={120} value={form.meeting_point} onChange={set("meeting_point")}
            placeholder={tx("ui.runClubs.meetingPlaceholder", "e.g. Outside the gym's front door")} data-testid="run-club-meet" />
          <span className="text-[11px] text-victory-muted">{tx("ui.runClubs.meetingPrivate", "Only people in the run club, or invited to it, see this.")}</span>
        </label>
        <label className="block">
          <span className="victory-label">{tx("ui.runClubs.notes", "Notes (optional)")}</span>
          <input className="victory-input" maxLength={300} value={form.description} onChange={set("description")}
            placeholder={tx("ui.runClubs.notesPlaceholder", "e.g. Easy pace, nobody gets left behind")} />
        </label>
        <button type="submit" disabled={saving} className="victory-btn-primary w-full min-h-[44px]" data-testid="run-club-save">
          {saving ? tx("ui.runClubs.saving", "Saving…") : tx("ui.runClubs.setItUp", "Set it up")}
        </button>
      </form>
      )}
    </BottomSheet>
  );
}

export function InviteSheet({ club, gymMembers, onClose, onSent }) {
  const invited = new Set(club.invited_ids || []);
  const inClub = new Set((club.members || []).map((m) => m.user_id));
  const options = (gymMembers || []).filter((m) => !inClub.has(m.user_id));
  const [picked, setPicked] = useState(new Set());
  const [sending, setSending] = useState(false);
  const flip = (id) => setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const send = (close) => async () => {
    setSending(true);
    try {
      const { data } = await axios.post(`${API}/run-clubs/${club.club_id}/invites`, { user_ids: [...picked] });
      toast.success(tx("ui.runClubs.invitesSent", "{{count}} invites sent", { count: data.invited }));
      onSent();
      close();
    } catch (e) {
      toast.error(err(e, tx("ui.runClubs.couldntInvite", "Couldn't send the invites. Try again.")));
      setSending(false);
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(joinLink(club.invite_code));
      toast.success(tx("ui.runClubs.linkCopied", "Invite link copied"));
    } catch {
      toast.error(tx("ui.runClubs.couldntCopy", "Couldn't copy the link"));
    }
  };
  return (
    <BottomSheet onClose={onClose} label={tx("ui.runClubs.invitePeople", "Invite people")} className="w-full max-w-lg mx-auto" testId="run-club-invite-sheet">
      {({ close }) => (
      <div className="p-4 space-y-3">
        <h2 className="font-heading font-bold text-lg text-victory-text">{tx("ui.runClubs.inviteTo", "Invite to {{name}}", { name: club.name })}</h2>
        <p className="section-label">{tx("ui.runClubs.fromYourGym", "From your gym")}</p>
        {options.length === 0 ? (
          <p className="text-sm text-victory-muted">{tx("ui.runClubs.everyoneIn", "Everyone at the gym is already in this run club.")}</p>
        ) : (
          <ul className="max-h-64 overflow-y-auto divide-y divide-victory-border">
            {options.map((m) => (
              <li key={m.user_id}>
                <label className="flex items-center gap-3 min-h-[44px] cursor-pointer">
                  <input type="checkbox" className="w-5 h-5 accent-current text-victory-lime" disabled={invited.has(m.user_id)}
                    checked={picked.has(m.user_id) || invited.has(m.user_id)} onChange={() => flip(m.user_id)} />
                  <span className="flex-1 text-sm text-victory-text truncate">{m.display_name || m.name}</span>
                  {invited.has(m.user_id) && <span className="text-[11px] text-victory-muted">{tx("ui.runClubs.invited", "Invited")}</span>}
                </label>
              </li>
            ))}
          </ul>
        )}
        <button type="button" disabled={!picked.size || sending} onClick={send(close)} className="victory-btn-primary w-full min-h-[44px]" data-testid="run-club-send-invites">
          {sending ? tx("ui.runClubs.sending", "Sending…")
            : picked.size ? tx("ui.runClubs.sendInvites", "Send {{count}} invites", { count: picked.size })
              : tx("ui.runClubs.pickPeople", "Pick people to invite")}
        </button>
        <button type="button" onClick={copy} className="victory-btn-secondary w-full min-h-[44px] flex items-center justify-center gap-2">
          <Copy className="w-4 h-4" /> {tx("ui.runClubs.copyLink", "Copy invite link")}
        </button>
        <p className="text-[11px] text-victory-muted">{tx("ui.runClubs.linkNote", "Anyone with the link can join in the app. Under-18s can only join run clubs at their own gym.")}</p>
      </div>
      )}
    </BottomSheet>
  );
}

export function RunClubCard({ club, onChange }) {
  return (
    <article className="victory-card p-4 space-y-3" data-testid="run-club-card">
      <Link to={`/run-clubs/${club.club_id}`} className="block space-y-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-heading font-bold text-victory-text">{club.name}</h3>
          <span className="text-[11px] text-victory-muted flex items-center gap-1 shrink-0"><Users className="w-3.5 h-3.5" /> {club.member_count}</span>
        </div>
        <p className="text-sm text-victory-text flex items-center gap-1.5"><CalendarDays className="w-4 h-4 text-victory-lime" /> {scheduleLine(club)}</p>
        {club.meeting_point && <p className="text-sm text-victory-muted flex items-center gap-1.5"><MapPin className="w-4 h-4" /> {club.meeting_point}</p>}
        <p className="text-[12px] text-victory-muted">{nextRunLine(club)}</p>
      </Link>
      {club.is_member && <GoingButton club={club} onChange={onChange} />}
      {!club.is_member && club.invite_id && <InviteRow club={club} onAnswered={(fresh) => onChange(fresh || { ...club, invite_id: null })} />}
    </article>
  );
}

export function RunClubs({ gymId, gymMembers }) {
  const [state, setState] = useState(null);
  const [creating, setCreating] = useState(false);
  const [inviting, setInviting] = useState(null);
  const created = useRef(null);
  const load = useCallback(() => {
    axios.get(`${API}/gyms/${gymId}/run-clubs`).then((r) => setState(r.data)).catch(() => setState({ clubs: [], can_create: false }));
  }, [gymId]);
  useEffect(() => { load(); }, [load]);
  const replace = (fresh) => setState((s) => ({ ...s, clubs: s.clubs.map((c) => (c.club_id === fresh.club_id ? { ...c, ...fresh } : c)) }));

  if (!state) return <div className="skeleton-shimmer h-24 rounded-lg" />;
  if (!state.clubs.length && !state.can_create) return null;
  return (
    <section className="space-y-3" data-testid="run-clubs">
      <div className="flex items-center justify-between">
        <p className="section-label flex items-center gap-1.5"><Footprints className="w-3.5 h-3.5" /> {tx("ui.runClubs.runClubs", "Run clubs")}</p>
        {state.can_create && (
          <button type="button" onClick={() => setCreating(true)} className="text-xs text-victory-lime flex items-center gap-1 min-h-[44px] px-2" data-testid="new-run-club-btn">
            <Plus className="w-4 h-4" /> {tx("ui.runClubs.new", "New")}
          </button>
        )}
      </div>
      {!state.clubs.length && (
        <p className="victory-card p-4 text-sm text-victory-muted">{tx("ui.runClubs.emptyStaff", "Set a weekly run, then invite your members. A fixed day, time and place makes people far more likely to turn up.")}</p>
      )}
      {state.clubs.map((c) => (
        <div key={c.club_id} className="space-y-2">
          <RunClubCard club={c} onChange={replace} />
          {c.is_staff && (
            <button type="button" className="victory-btn-ghost w-full min-h-[44px]" data-testid="run-club-invite-btn"
              onClick={() => axios.get(`${API}/run-clubs/${c.club_id}`).then((r) => setInviting(r.data))}>
              {tx("ui.runClubs.invitePeople", "Invite people")}
            </button>
          )}
        </div>
      ))}
      {creating && (
        <NewRunClubSheet gymId={gymId} onCreated={(club) => { created.current = club; }}
          onClose={() => { setCreating(false); if (created.current) { load(); setInviting(created.current); created.current = null; } }} />
      )}
      {inviting && <InviteSheet club={inviting} gymMembers={gymMembers} onSent={load} onClose={() => setInviting(null)} />}
    </section>
  );
}
