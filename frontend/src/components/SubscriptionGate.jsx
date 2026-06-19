import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Zap, Lock } from "lucide-react";
import { API, useAuth } from "@/App";

const FREE_FEATURES = [
  "Round timer",
  "Live streaming",
  "Community feed",
  "Leaderboard",
  "Fighter profile",
];

const MONTHLY_LIMIT = 10_000;

function UsageBanner({ usage, onUpgrade }) {
  const pct = Math.round(((MONTHLY_LIMIT - usage.tokens_remaining) / MONTHLY_LIMIT) * 100);
  const low = usage.tokens_remaining < 2_000;

  return (
    <div className={`px-4 py-2 border-b flex items-center justify-between gap-3 ${low ? "bg-red-500/10 border-red-500/30" : "bg-victory-card/60 border-victory-border"}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-victory-muted">
            {low ? "⚡ " : ""}{usage.tokens_remaining.toLocaleString()} AI credits left this month
          </span>
          <span className="text-xs text-victory-muted">{pct}% used</span>
        </div>
        <div className="h-1 bg-victory-border rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${low ? "bg-red-400" : "bg-victory-lime"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <button
        onClick={onUpgrade}
        className="text-xs text-victory-lime font-semibold whitespace-nowrap border border-victory-lime/30 rounded-lg px-2.5 py-1 hover:bg-victory-lime/10 transition-colors"
      >
        Go Pro
      </button>
    </div>
  );
}

function QuotaExceededScreen({ feature }) {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-victory-bg flex flex-col items-center justify-center p-6 text-center">
      <div className="w-20 h-20 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mb-6">
        <Zap className="w-9 h-9 text-red-400" />
      </div>
      <h2 className="font-heading font-extrabold text-2xl text-victory-text mb-2">
        Monthly limit reached
      </h2>
      <p className="text-victory-muted text-sm mb-2 max-w-xs leading-relaxed">
        You've used your 10,000 free AI credits for this month.
      </p>
      <p className="text-victory-muted text-xs mb-8 max-w-xs">
        Resets on the 1st. Upgrade to Pro for unlimited{" "}
        <span className="text-victory-lime">{feature}</span> with no monthly cap.
      </p>
      <button
        onClick={() => navigate("/paywall")}
        className="victory-btn-primary w-full max-w-xs flex items-center justify-center gap-2 mb-3"
      >
        <Zap className="w-4 h-4" />
        Upgrade to Pro
      </button>
      <button
        onClick={() => navigate(-1)}
        className="text-victory-muted text-sm py-2"
      >
        Go back
      </button>
    </div>
  );
}

function NoSubscriptionScreen({ feature }) {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-victory-bg flex flex-col items-center justify-center p-6 text-center">
      <div className="w-20 h-20 rounded-full bg-victory-lime/10 border border-victory-lime/30 flex items-center justify-center mb-6">
        <Lock className="w-9 h-9 text-victory-lime" />
      </div>
      <h2 className="font-heading font-extrabold text-2xl text-victory-text mb-2">
        Pro Feature
      </h2>
      <p className="text-victory-muted text-sm mb-6 max-w-xs leading-relaxed">
        <span className="text-victory-lime font-semibold">{feature}</span> uses
        AI credits. Free users get 10,000 credits per month — enough for ~5
        full training analyses.
      </p>
      <div className="bg-victory-card border border-victory-border rounded-xl p-4 mb-6 w-full max-w-xs text-left space-y-2">
        <p className="text-victory-muted text-xs uppercase tracking-wider font-semibold mb-3">
          Always free
        </p>
        {FREE_FEATURES.map((f) => (
          <div key={f} className="flex items-center gap-2 text-sm text-victory-text">
            <span className="w-1.5 h-1.5 rounded-full bg-victory-lime flex-shrink-0" />
            {f}
          </div>
        ))}
      </div>
      <button
        onClick={() => navigate("/paywall")}
        className="victory-btn-primary w-full max-w-xs flex items-center justify-center gap-2"
      >
        <Zap className="w-4 h-4" />
        Unlock Pro
      </button>
      <button onClick={() => navigate(-1)} className="text-victory-muted text-sm mt-4 py-2">
        Go back
      </button>
    </div>
  );
}

export default function SubscriptionGate({ children, feature = "AI coaching" }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [usage, setUsage] = useState(null);
  const [usageLoading, setUsageLoading] = useState(true);

  useEffect(() => {
    if (!user || user.has_subscription) {
      setUsageLoading(false);
      return;
    }
    axios
      .get(`${API}/usage`)
      .then((r) => setUsage(r.data))
      .catch(() => setUsage(null))
      .finally(() => setUsageLoading(false));
  }, [user]);

  if (loading || usageLoading) {
    return (
      <div className="min-h-screen bg-victory-bg flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-victory-lime border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Pro user — full access, no gate
  if (user?.has_subscription) return children;

  // Usage fetch failed — fail open (don't block the user)
  if (!usage) return children;

  // Free user, quota exhausted
  if (usage.tokens_remaining <= 0) {
    return <QuotaExceededScreen feature={feature} />;
  }

  // Free user with credits remaining — show page + usage banner
  return (
    <div className="flex flex-col min-h-screen">
      <UsageBanner usage={usage} onUpgrade={() => navigate("/paywall")} />
      <div className="flex-1">{children}</div>
    </div>
  );
}
