import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { ArrowLeft, CalendarDays, MapPin, Users } from "lucide-react";
import { API } from "@/App";
import { BottomNav } from "@/components/BottomNav";
import { GoingButton, InviteRow, InviteSheet, nextRunLine, scheduleLine } from "@/components/RunClubs";
import { tx } from "@/i18n/tx";

// One run club: the push "You're invited" lands here, and so does the shared invite link
// (/run-clubs/join/:code joins first, then shows the club).
export default function RunClubPage() {
  const { clubId, code } = useParams();
  const navigate = useNavigate();
  const [club, setClub] = useState(null);
  const [failed, setFailed] = useState("");
  const [inviting, setInviting] = useState(false);
  const [gymMembers, setGymMembers] = useState([]);

  useEffect(() => {
    const req = code
      ? axios.post(`${API}/run-clubs/join-by-code`, { code })
      : axios.get(`${API}/run-clubs/${clubId}`);
    req.then((r) => {
      setClub(r.data);
      if (code) {
        toast.success(tx("ui.runClubPage.joined", "You're in {{name}}", { name: r.data.name }));
        navigate(`/run-clubs/${r.data.club_id}`, { replace: true });
      }
    }).catch((e) => {
      const d = e?.response?.data?.detail;
      setFailed(typeof d === "string" ? d : tx("ui.runClubPage.notFound", "We couldn't open this run club."));
    });
  }, [clubId, code, navigate]);

  useEffect(() => {
    if (club?.is_staff) axios.get(`${API}/gyms/${club.gym_id}`).then((r) => setGymMembers(r.data.members_detail || [])).catch(() => {});
  }, [club?.is_staff, club?.gym_id]);

  const leave = async () => {
    try {
      await axios.post(`${API}/run-clubs/${club.club_id}/leave`);
      toast.success(tx("ui.runClubPage.left", "You've left the run club"));
      navigate(`/gyms/${club.gym_id}`);
    } catch {
      toast.error(tx("ui.runClubPage.couldntLeave", "Couldn't leave. Try again."));
    }
  };

  return (
    <div className="min-h-screen bg-victory-bg pb-28">
      <header className="px-4 pt-safe flex items-center gap-3 py-4">
        <button type="button" onClick={() => navigate(-1)} aria-label={tx("ui.runClubPage.goBack", "Go back")}
          className="w-11 h-11 rounded-full bg-victory-card border border-victory-border flex items-center justify-center touch-target">
          <ArrowLeft className="w-5 h-5 text-victory-text" />
        </button>
        <div className="min-w-0">
          <p className="section-label">{club?.gym_name || tx("ui.runClubPage.runClub", "Run club")}</p>
          <h1 className="font-heading font-bold text-xl text-victory-text truncate">{club?.name || "…"}</h1>
        </div>
      </header>
      <main className="px-4 space-y-4">
        {failed && <p className="victory-card p-4 text-sm text-victory-muted" data-testid="run-club-error">{failed}</p>}
        {!club && !failed && <div className="skeleton-shimmer h-40 rounded-lg" />}
        {club && (
          <>
            <section className="victory-card p-4 space-y-2">
              <p className="text-victory-text flex items-center gap-2"><CalendarDays className="w-4 h-4 text-victory-lime" /> {scheduleLine(club)}</p>
              {club.meeting_point && <p className="text-victory-text flex items-center gap-2"><MapPin className="w-4 h-4 text-victory-lime" /> {club.meeting_point}</p>}
              {club.description && <p className="text-sm text-victory-muted">{club.description}</p>}
              <p className="text-[12px] text-victory-muted">{nextRunLine(club)}</p>
            </section>
            {club.is_member && <GoingButton club={club} onChange={setClub} />}
            {!club.is_member && club.invite_id && <InviteRow club={club} onAnswered={(fresh) => (fresh ? setClub(fresh) : navigate(-1))} />}
            {club.is_staff && (
              <button type="button" onClick={() => setInviting(true)} className="victory-btn-secondary w-full min-h-[44px]">
                {tx("ui.runClubPage.invitePeople", "Invite people")}
              </button>
            )}
            {club.members && (
              <section className="space-y-2">
                <p className="section-label flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> {tx("ui.runClubPage.members", "Members · {{count}}", { count: club.member_count })}</p>
                <ul className="victory-card divide-y divide-victory-border">
                  {club.members.map((m) => (
                    <li key={m.user_id} className="flex items-center gap-3 px-4 min-h-[48px]">
                      <span className="flex-1 text-sm text-victory-text truncate">{m.name}</span>
                      {m.going && <span className="text-[11px] text-victory-lime">{tx("ui.runClubPage.going", "Going")}</span>}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {club.is_member && !club.is_staff && (
              <button type="button" onClick={leave} className="victory-btn-ghost w-full min-h-[44px]">{tx("ui.runClubPage.leave", "Leave run club")}</button>
            )}
          </>
        )}
      </main>
      {inviting && club && (
        <InviteSheet club={club} gymMembers={gymMembers} onClose={() => setInviting(false)}
          onSent={() => axios.get(`${API}/run-clubs/${club.club_id}`).then((r) => setClub(r.data))} />
      )}
      <BottomNav />
    </div>
  );
}
