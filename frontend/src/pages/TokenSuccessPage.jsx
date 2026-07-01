import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { API, useAuth } from "@/App";
import { Zap, CheckCircle, Loader2, XCircle } from "lucide-react";

const PKG_LABELS = {
  starter:  { tokens: 200,  label: "Starter" },
  fighter:  { tokens: 500,  label: "Fighter" },
  champion: { tokens: 1200, label: "Champion" },
  legend:   { tokens: 3000, label: "Legend" },
};

export default function TokenSuccessPage() {
  const navigate        = useNavigate();
  const { checkAuth }   = useAuth();
  const [params]        = useSearchParams();
  const [status, setStatus] = useState("checking"); // checking | success | failed

  const sessionId = params.get("session_id");
  const pkgId     = params.get("pkg") || "fighter";
  const pkg       = PKG_LABELS[pkgId] || { tokens: "—", label: "" };

  useEffect(() => {
    if (!sessionId) { navigate("/tokens", { replace: true }); return; }

    let attempts = 0;
    const MAX = 8;

    const poll = async () => {
      try {
        const res = await axios.get(`${API}/payments/status/${sessionId}`);
        const paid = res.data.payment_status === "paid" || res.data.status === "complete";
        if (paid) {
          await checkAuth();   // refresh user balance in context
          setStatus("success");
          setTimeout(() => navigate("/live", { replace: true }), 3000);
          return;
        }
      } catch {}

      attempts++;
      if (attempts >= MAX) {
        setStatus("failed");
        return;
      }
      setTimeout(poll, 2000);
    };

    poll();
  }, [sessionId, navigate, checkAuth]);

  return (
    <div className="min-h-screen bg-victory-bg flex items-center justify-center p-6">
      <div className="w-full max-w-sm text-center space-y-6">

        {status === "checking" && (
          <>
            <div className="w-20 h-20 rounded-full bg-victory-lime/10 border-2 border-victory-lime/30 flex items-center justify-center mx-auto">
              <Loader2 className="w-10 h-10 text-victory-lime animate-spin" />
            </div>
            <div>
              <h1 className="text-victory-text font-black text-2xl">Confirming payment…</h1>
              <p className="text-victory-muted text-sm mt-2">Hang tight — Stripe is processing your order.</p>
            </div>
          </>
        )}

        {status === "success" && (
          <>
            <div className="w-20 h-20 rounded-full bg-victory-lime/10 border-2 border-victory-lime flex items-center justify-center mx-auto animate-bounce">
              <CheckCircle className="w-10 h-10 text-victory-lime" />
            </div>
            <div>
              <h1 className="text-victory-text font-black text-2xl">Tokens added!</h1>
              <p className="text-victory-muted text-sm mt-2">Your account has been credited.</p>
            </div>
            <div className="bg-victory-card border border-victory-lime/30 rounded-2xl p-5">
              <p className="text-victory-muted text-xs mb-1">{pkg.label} Pack</p>
              <div className="flex items-center justify-center gap-2">
                <Zap className="w-6 h-6 text-victory-lime" />
                <span className="text-4xl font-black text-victory-lime font-mono">
                  +{typeof pkg.tokens === "number" ? pkg.tokens.toLocaleString() : pkg.tokens}
                </span>
              </div>
              <p className="text-victory-muted text-xs mt-1">tokens</p>
            </div>
            <p className="text-victory-muted text-xs">Redirecting you to the live feed…</p>
          </>
        )}

        {status === "failed" && (
          <>
            <div className="w-20 h-20 rounded-full bg-red-500/10 border-2 border-red-500/30 flex items-center justify-center mx-auto">
              <XCircle className="w-10 h-10 text-red-400" />
            </div>
            <div>
              <h1 className="text-victory-text font-black text-2xl">Something went wrong</h1>
              <p className="text-victory-muted text-sm mt-2">
                We couldn't confirm your payment. If your card was charged, tokens will appear within a few minutes — check your balance.
              </p>
            </div>
            <div className="space-y-3">
              <button
                onClick={() => navigate("/tokens")}
                className="w-full py-3 rounded-xl bg-victory-lime text-victory-bg font-bold"
              >
                Try again
              </button>
              <button
                onClick={() => navigate("/live")}
                className="w-full py-3 rounded-xl border border-victory-border text-victory-muted text-sm hover:text-victory-text transition-colors"
              >
                Back to live feed
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
