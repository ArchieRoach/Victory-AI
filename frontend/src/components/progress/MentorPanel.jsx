import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { Bot, GraduationCap, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { API } from "@/App";
import { tx } from "@/i18n/tx";

// Goal: everyone has someone in their corner.
// Psychology: accountability to someone whose opinion matters keeps people training.
// Design: the AI partner is always your mentor; you can also ask your gym's owner or coaches.
//   Mentors see your progress and leave short notes. There's no chat, notes are moderated,
//   and either side can end it at any time.
export function MentorPanel() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [drafts, setDrafts] = useState({});
  const load = useCallback(() => {
    axios.get(`${API}/mentors`).then((r) => setData(r.data)).catch(() => setData({ mentors: [], mentees: [], options: [] }));
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (fn, ok) => {
    try {
      await fn();
      if (ok) toast.success(ok);
      load();
    } catch (e) {
      const d = e?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : tx("ui.mentorPanel.thatDidnTWork", "That didn't work, try again"));
    }
  };

  if (!data) return <div className="skeleton-shimmer h-40 rounded-lg" />;
  return (
    <div className="space-y-4" data-testid="mentors">
      <section className="victory-card p-4 flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-victory-lime/10 border border-victory-lime/20 flex items-center justify-center flex-shrink-0">
          <Bot className="w-5 h-5 text-victory-lime" />
        </div>
        <div className="min-w-0">
          <p className="text-victory-text font-semibold">{data.ai?.name}</p>
          <p className="text-victory-muted text-[12px]">{tx("ui.mentorPanel.yourAiMentorReviews", "Your AI mentor. Reviews every round and sets your next focus.")}</p>
        </div>
      </section>

      <div>
        <p className="section-label mb-2">{tx("ui.mentorPanel.yourMentors", "Your mentors")}</p>
        {data.mentors.length === 0 && <p className="text-victory-muted text-sm">{tx("ui.mentorPanel.aCoachFromYour", "A coach from your gym can follow your training and leave you notes.")}</p>}
        <div className="space-y-2">
          {data.mentors.map((m) => (
            <section key={m.link_id} className="victory-card p-3 space-y-2">
              <div className="flex items-center gap-3">
                <GraduationCap className="w-5 h-5 text-victory-teal flex-shrink-0" />
                <p className="flex-1 text-victory-text text-sm font-semibold truncate">{m.mentor.name}</p>
                <span className="text-[10px] uppercase font-heading font-bold text-victory-muted">{m.status === "pending" ? tx("ui.mentorPanel.asked", "Asked") : tx("ui.mentorPanel.mentor", "Mentor")}</span>
                <button aria-label={tx("ui.mentorPanel.endMentorship", "End mentorship")} className="w-11 h-11 rounded-full flex items-center justify-center text-victory-muted"
                  onClick={() => act(() => axios.delete(`${API}/mentors/${m.link_id}`), "Ended")}><X className="w-4 h-4" /></button>
              </div>
              {m.notes.map((n) => (
                <p key={n.note_id} className="text-[12px] text-victory-text bg-victory-card-highlight rounded-lg px-3 py-2">“{n.text}”</p>
              ))}
            </section>
          ))}
        </div>
      </div>

      {data.options.length > 0 && (
        <div>
          <p className="section-label mb-2">{tx("ui.mentorPanel.askSomeoneFromYour", "Ask someone from your gym")}</p>
          <div className="space-y-2">
            {data.options.map((o) => (
              <div key={o.user_id} className="victory-card p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-victory-text text-sm font-semibold truncate">{o.name}</p>
                  <p className="text-victory-muted text-[11px]">{o.role} · {o.gym}</p>
                </div>
                <button className="victory-btn-secondary w-auto px-4 min-h-[44px] flex items-center gap-1.5"
                  onClick={() => act(() => axios.post(`${API}/mentors/requests`, { mentor_id: o.user_id }), "Request sent")}>
                  <UserPlus className="w-4 h-4" /> {tx("ui.mentorPanel.ask", "Ask")}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {data.options.length === 0 && data.mentors.length === 0 && (
        <button className="victory-btn-ghost" onClick={() => navigate("/gyms")}>{tx("ui.mentorPanel.findAGym", "Find a gym")}</button>
      )}

      {data.mentees.length > 0 && (
        <div>
          <p className="section-label mb-2">{tx("ui.mentorPanel.fightersYouMentor", "Fighters you mentor")}</p>
          <div className="space-y-2">
            {data.mentees.map((m) => (
              <section key={m.link_id} className="victory-card p-3 space-y-2">
                <div className="flex items-center gap-3">
                  <p className="flex-1 text-victory-text text-sm font-semibold truncate">{m.mentee.name}</p>
                  {m.status === "pending" ? (
                    <button className="victory-btn-primary w-auto px-4 min-h-[44px]" onClick={() => act(() => axios.post(`${API}/mentors/${m.link_id}/accept`), "You're their mentor now")}>{tx("ui.mentorPanel.accept", "Accept")}</button>
                  ) : (
                    <span className="text-[11px] text-victory-muted">{tx("ui.mentorPanel.lvl", "Lvl")} <span className="font-mono text-victory-text">{m.progress?.level}</span> · <span className="font-mono text-victory-text">{m.progress?.sessions_this_week}</span> {tx("ui.mentorPanel.thisWeek", "this week ·")} <span className="font-mono text-victory-text">{m.progress?.streak}</span>{tx("ui.mentorPanel.dStreak", "d streak")}</span>
                  )}
                  <button aria-label={tx("ui.mentorPanel.endMentorship", "End mentorship")} className="w-11 h-11 rounded-full flex items-center justify-center text-victory-muted"
                    onClick={() => act(() => axios.delete(`${API}/mentors/${m.link_id}`), "Ended")}><X className="w-4 h-4" /></button>
                </div>
                {m.status === "active" && (
                  <form className="flex gap-2" onSubmit={(e) => {
                    e.preventDefault();
                    const text = (drafts[m.link_id] || "").trim();
                    if (text.length < 2) return;
                    act(() => axios.post(`${API}/mentors/${m.link_id}/notes`, { text }), "Note sent").then(() => setDrafts((d) => ({ ...d, [m.link_id]: "" })));
                  }}>
                    <input className="victory-input flex-1" maxLength={280} placeholder={tx("ui.mentorPanel.aShortNoteWhat", "A short note: what to work on next")}
                      aria-label={`Note for ${m.mentee.name}`} value={drafts[m.link_id] || ""}
                      onChange={(e) => setDrafts((d) => ({ ...d, [m.link_id]: e.target.value }))} />
                    <button type="submit" className="victory-btn-secondary w-auto px-4">{tx("ui.mentorPanel.send", "Send")}</button>
                  </form>
                )}
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
