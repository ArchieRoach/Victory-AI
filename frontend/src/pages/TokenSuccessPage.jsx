import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { API, useAuth } from "@/App";
import { Zap, CheckCircle, Loader2, XCircle } from "lucide-react";
import { tx } from "@/i18n/tx";

const PKG_LABELS = {
  starter:  { tokens: 200,  get label() { return tx("ui.tokenSuccessPage.starter", "Starter"); } },
  fighter:  { tokens: 500,  get label() { return tx("ui.tokenSuccessPage.fighter", "Fighter"); } },
  champion: { tokens: 1200, get label() { return tx("ui.tokenSuccessPage.champion", "Champion"); } },
  legend:   { tokens: 3000, get label() { return tx("ui.tokenSuccessPage.legend", "Legend"); } },
};

export default function TokenSuccessPage() {
  const navigate        = useNavigate();
  const { refreshUser } = useAuth();
  const [params]        = useSearchParams();
  const [status, setStatus] = useState("checking"); // checking | success | failed

  const sessionId = params.get("session_id");
  const [confirmedPkg, setConfirmedPkg] = useState(null);

  useEffect(() => {
    if (!sessionId) { navigate("/tokens", { replace: true }); return; }

    let attempts = 0;
    const MAX = 8;
    let cancelled = false;
    let pollTimer, redirectTimer;

    const poll = async () => {
      if (cancelled) return;
      try {
        const res = await axios.get(`${API}/payments/status/${sessionId}`);
        const paid = res.data.payment_status === "paid" || res.data.status === "complete";
        if (paid) {
          const pkgId  = res.data.token_package || "fighter";
          const tokens = res.data.tokens || PKG_LABELS[pkgId]?.tokens || "—";
          const label  = PKG_LABELS[pkgId]?.label || "";
          if (!cancelled) setConfirmedPkg({ tokens, label });
          await refreshUser();
          if (cancelled) return;
          setStatus("success");
          redirectTimer = setTimeout(() => navigate("/live", { replace: true }), 3000);
          return;
        }
      } catch {}

      attempts++;
      if (attempts >= MAX) {
        if (!cancelled) setStatus("failed");
        return;
      }
      pollTimer = setTimeout(poll, 2000);
    };

    poll();
    return () => {
      cancelled = true;
      clearTimeout(pollTimer);
      clearTimeout(redirectTimer);
    };
  }, [sessionId, navigate, refreshUser]);

  return (
    <div className="min-h-screen bg-victory-bg flex items-center justify-center p-6">
      <div className="w-full max-w-sm text-center space-y-6">

        {status === "checking" && (
          <>
            <div className="w-20 h-20 rounded-full bg-victory-lime/10 border-2 border-victory-lime/30 flex items-center justify-center mx-auto">
              <Loader2 className="w-10 h-10 text-victory-lime animate-spin" />
            </div>
            <div>
              <h1 className="text-victory-text font-black text-2xl">{tx("ui.tokenSuccessPage.confirmingPayment", "Confirming payment…")}</h1>
              <p className="text-victory-muted text-sm mt-2">{tx("ui.tokenSuccessPage.hangTightStripeIs", "Hang tight — Stripe is processing your order.")}</p>
            </div>
          </>
        )}

        {status === "success" && (
          <>
            <div className="w-20 h-20 rounded-full bg-victory-lime/10 border-2 border-victory-lime flex items-center justify-center mx-auto animate-bounce">
              <CheckCircle className="w-10 h-10 text-victory-lime" />
            </div>
            <div>
              <h1 className="text-victory-text font-black text-2xl">{tx("ui.tokenSuccessPage.paymentConfirmed", "Payment confirmed!")}</h1>
              <p className="text-victory-muted text-sm mt-2">{tx("ui.tokenSuccessPage.yourTokensAreOn", "Your tokens are on the way — your balance will update within a moment.")}</p>
            </div>
            <div className="bg-victory-card border border-victory-lime/30 rounded-2xl p-5">
              <p className="text-victory-muted text-xs mb-1">{confirmedPkg?.label || ""} {tx("ui.tokenSuccessPage.pack", "Pack")}</p>
              <div className="flex items-center justify-center gap-2">
                <Zap className="w-6 h-6 text-victory-lime" />
                <span className="text-4xl font-black text-victory-lime font-mono">
                  +{typeof confirmedPkg?.tokens === "number" ? confirmedPkg.tokens.toLocaleString() : (confirmedPkg?.tokens ?? "—")}
                </span>
              </div>
              <p className="text-victory-muted text-xs mt-1">{tx("ui.tokenSuccessPage.tokens", "tokens")}</p>
            </div>
            <p className="text-victory-muted text-xs">{tx("ui.tokenSuccessPage.redirectingYouToThe", "Redirecting you to the live feed…")}</p>
          </>
        )}

        {status === "failed" && (
          <>
            <div className="w-20 h-20 rounded-full bg-victory-danger/10 border-2 border-victory-danger/30 flex items-center justify-center mx-auto">
              <XCircle className="w-10 h-10 text-victory-danger" />
            </div>
            <div>
              <h1 className="text-victory-text font-black text-2xl">{tx("ui.tokenSuccessPage.somethingWentWrong", "Something went wrong")}</h1>
              <p className="text-victory-muted text-sm mt-2">
                {tx("ui.tokenSuccessPage.weCouldnTConfirm", "We couldn't confirm your payment. If your card was charged, tokens will appear within a few minutes — check your balance.")}
              </p>
            </div>
            <div className="space-y-3">
              <button
                onClick={() => navigate("/tokens")}
                className="w-full py-3 rounded-xl bg-victory-lime text-victory-bg font-bold"
              >
                {tx("ui.tokenSuccessPage.tryAgain", "Try again")}
              </button>
              <button
                onClick={() => navigate("/live")}
                className="w-full py-3 rounded-xl border border-victory-border text-victory-muted text-sm hover:text-victory-text transition-colors"
              >
                {tx("ui.tokenSuccessPage.backToLiveFeed", "Back to live feed")}
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
