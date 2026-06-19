import { useNavigate } from "react-router-dom";
import { Zap, Lock } from "lucide-react";
import { useAuth } from "@/App";

const FREE_FEATURES = [
  "Round timer",
  "Live streaming",
  "Community feed",
  "Leaderboard",
  "Fighter profile",
];

export default function SubscriptionGate({ children, feature = "AI coaching" }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="min-h-screen bg-victory-bg flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-victory-lime border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (user?.has_subscription) return children;

  return (
    <div className="min-h-screen bg-victory-bg flex flex-col items-center justify-center p-6 text-center">
      {/* Icon */}
      <div className="w-20 h-20 rounded-full bg-victory-lime/10 border border-victory-lime/30 flex items-center justify-center mb-6">
        <Lock className="w-9 h-9 text-victory-lime" />
      </div>

      {/* Headline */}
      <h2 className="font-heading font-extrabold text-2xl text-victory-text mb-2">
        Pro Feature
      </h2>
      <p className="text-victory-muted text-sm mb-6 max-w-xs leading-relaxed">
        <span className="text-victory-lime font-semibold">{feature}</span> is included in Victory AI Pro. Everything below is free — no card needed.
      </p>

      {/* Free tier list */}
      <div className="bg-victory-card border border-victory-border rounded-xl p-4 mb-6 w-full max-w-xs text-left space-y-2">
        <p className="text-victory-muted text-xs uppercase tracking-wider font-semibold mb-3">Always free</p>
        {FREE_FEATURES.map((f) => (
          <div key={f} className="flex items-center gap-2 text-sm text-victory-text">
            <span className="w-1.5 h-1.5 rounded-full bg-victory-lime flex-shrink-0" />
            {f}
          </div>
        ))}
      </div>

      {/* CTA */}
      <button
        onClick={() => navigate("/paywall")}
        className="victory-btn-primary w-full max-w-xs flex items-center justify-center gap-2"
      >
        <Zap className="w-4 h-4" />
        Unlock Pro
      </button>
      <button
        onClick={() => navigate(-1)}
        className="text-victory-muted text-sm mt-4 py-2"
      >
        Go back
      </button>
    </div>
  );
}
