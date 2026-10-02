import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { API, useAuth } from "@/App";
import { toast } from "sonner";
import { Users } from "lucide-react";
import { analytics } from "@/lib/analytics";
import { savePendingInvite } from "@/lib/pendingInvite";

// Public landing for a squad invite. The brag comes first — the friend sees what their
// mate just did before being asked for anything.
export default function JoinSquadPage() {
  const { inviteId } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, loading } = useAuth();
  const [invite, setInvite] = useState(undefined);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    axios.get(`${API}/invites/${encodeURIComponent(inviteId)}`)
      .then((r) => setInvite(r.data))
      .catch(() => setInvite(null));
  }, [inviteId]);

  const join = async () => {
    if (!isAuthenticated) {
      savePendingInvite(inviteId);
      analytics.capture("squad_invite_opened", { signed_in: false });
      navigate("/login");
      return;
    }
    setJoining(true);
    try {
      const { data } = await axios.post(`${API}/invites/${encodeURIComponent(inviteId)}/accept`);
      analytics.capture("squad_invite_accepted", { already_member: data.already_member });
      navigate(`/squads/${data.squad_id}`, { replace: true });
    } catch (err) {
      setJoining(false);
      toast.error(err?.response?.data?.detail || "Couldn't join — try again");
    }
  };

  return (
    <div className="min-h-screen bg-victory-bg flex flex-col items-center justify-center p-6" data-testid="join-squad-page">
      <div className="w-full max-w-md text-center animate-fade-in">
        <img src="/mascot-render.png" alt="Victory AI" className="h-40 w-auto mx-auto object-contain mb-6" />

        {invite === undefined && <div className="skeleton-shimmer h-48 rounded-lg" />}

        {invite === null && (
          <div className="victory-card p-6 space-y-3">
            <p className="text-victory-text font-heading font-bold text-lg">This invite has expired</p>
            <p className="text-victory-muted text-sm">Ask your mate to send a fresh one after their next session.</p>
            <button onClick={() => navigate("/")} className="victory-btn-secondary w-full">Open Victory AI</button>
          </div>
        )}

        {invite && (
          <div className="victory-card p-6 space-y-4 text-left">
            <div className="flex items-center gap-3">
              {invite.inviter_picture ? (
                <img src={invite.inviter_picture} alt="" className="w-12 h-12 rounded-full object-cover border border-victory-border" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-victory-card-highlight border border-victory-border flex items-center justify-center font-heading font-bold text-victory-lime">
                  {invite.inviter_name.charAt(0)}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-victory-muted text-xs">{invite.inviter_name} invited you to</p>
                <p className="text-victory-text font-heading font-extrabold text-xl truncate">{invite.squad_name}</p>
              </div>
            </div>
            <p className="text-victory-text text-sm border-l-2 border-victory-lime pl-3">{invite.brag}</p>
            <p className="text-victory-muted text-xs flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" /> <span className="font-mono">{invite.member_count}</span>/8 fighters · weekly leaderboard, callouts, round reactions
            </p>
            {invite.full ? (
              <p className="text-victory-muted text-sm">This squad is full.</p>
            ) : (
              <button onClick={join} disabled={joining || loading} className="victory-btn-primary w-full disabled:opacity-50">
                {joining ? "Joining…" : isAuthenticated ? "Join the squad" : "Sign up to join"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
