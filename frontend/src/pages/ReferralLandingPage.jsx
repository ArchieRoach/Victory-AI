import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { API, useAuth } from "@/App";
import { tx } from "@/i18n/tx";
import { analytics } from "@/lib/analytics";
import { savePendingReferral } from "@/lib/pendingReferral";
import { MascotIntro } from "@/components/MascotIntro";

// Where a scanned QR code or shared link lands. A friend's name and what they both get come
// first; one button signs them up, and the code rides along through sign-up.
export default function ReferralLandingPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, loading } = useAuth();
  const [invite, setInvite] = useState(undefined);
  const [busy, setBusy] = useState(false);

  // A plain fetch, not axios: the preview needs no sign-in, so it doesn't wait for the auth
  // library to load first (a scan on gym Wi-Fi should show the friend's name straight away).
  useEffect(() => {
    fetch(`${API}/referrals/code/${encodeURIComponent(code)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data) => { setInvite(data); analytics.capture("referral_opened", { signed_in: isAuthenticated }); })
      .catch(() => setInvite(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const start = async () => {
    if (!isAuthenticated) {
      savePendingReferral(code);
      navigate("/login");
      return;
    }
    setBusy(true);
    try {
      await axios.post(`${API}/referrals/code/${encodeURIComponent(code)}/claim`);
      analytics.capture("referral_claimed", { after_signup: false });
    } catch (err) {
      toast.error(err?.response?.data?.detail || tx("ui.referralLanding.couldntUse", "Couldn't use that invite"));
    }
    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-screen bg-victory-bg flex flex-col items-center justify-center p-6" data-testid="referral-landing">
      <div className="w-full max-w-md text-center animate-fade-in">
        <div className="mb-6"><MascotIntro className="h-40" wordmark={false} /></div>

        {invite === undefined && <div className="skeleton-shimmer h-48 rounded-lg" />}

        {invite === null && (
          <div className="victory-card p-6 space-y-3">
            <p className="text-victory-text font-heading font-bold text-lg">{tx("ui.referralLanding.notValid", "That invite link isn't valid")}</p>
            <button onClick={() => navigate("/")} className="victory-btn-secondary w-full">{tx("ui.referralLanding.openApp", "Open Victory AI")}</button>
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
              <p className="text-victory-text font-heading font-extrabold text-xl leading-tight">
                {tx("ui.referralLanding.invitedYou", "{{name}} invited you to train", { name: invite.inviter_name })}
              </p>
            </div>
            <p className="text-victory-muted text-sm">{tx("ui.referralLanding.pitch", "An AI coach calls your combos and scores every round you film.")}</p>
            <p className="text-victory-text text-sm border-l-2 border-victory-lime pl-3">
              {tx("ui.referralLanding.reward", "Finish your first session and you both get {{tokens}} tokens.", { tokens: invite.reward_tokens })}
            </p>
            <button onClick={start} disabled={busy || loading} className="victory-btn-primary w-full disabled:opacity-50" data-testid="referral-start">
              {isAuthenticated ? tx("ui.referralLanding.accept", "Accept invite") : tx("ui.referralLanding.signUp", "Sign up free")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
