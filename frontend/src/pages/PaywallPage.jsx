import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API, useAuth } from "@/App";
import { toast } from "sonner";
import { Check, Zap, Trophy, Target, Shield } from "lucide-react";

export default function PaywallPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState("annual");
  const [loading, setLoading] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const handleStartTrial = async () => {
    setLoading(true);
    try {
      const response = await axios.post(
        `${API}/payments/checkout`,
        {
          plan_id: selectedPlan,
          origin_url: window.location.origin,
        },
        { withCredentials: true }
      );

      // Redirect to Stripe checkout
      window.location.href = response.data.checkout_url;
    } catch (error) {
      toast.error("Failed to start checkout");
      setLoading(false);
    }
  };

  const features = [
    { icon: Target, text: "Unlimited training sessions" },
    { icon: Zap, text: "AI-powered instant feedback" },
    { icon: Trophy, text: "Progress tracking & analytics" },
    { icon: Shield, text: "Personalized drill recommendations" },
  ];

  return (
    <div
      className="min-h-screen bg-victory-bg flex flex-col"
      data-testid="paywall-page"
    >
      {/* Header */}
      <header className="p-6 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-victory-lime text-victory-bg font-heading text-2xl font-extrabold mb-4">
          VA
        </div>
        <h1 className="text-2xl sm:text-3xl font-heading font-extrabold text-victory-text mb-2">
          Train like a pro for less than one coffee a month.
        </h1>
        <p className="text-victory-muted">
          Your fighter buddy runs your rounds, analyses your technique, and
          tells you exactly what to work on.
        </p>
      </header>

      <main className="flex-1 p-6 flex flex-col">
        {/* Fighter Buddy Preview */}
        {user?.fighter_buddy && (
          <div className="victory-card p-4 mb-6 flex items-center gap-4">
            {user.fighter_buddy.avatar_url ? (
              <img
                src={user.fighter_buddy.avatar_url}
                alt={user.fighter_buddy.name}
                className="w-12 h-12 rounded-full object-cover border-2 border-victory-lime"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-victory-lime flex items-center justify-center text-victory-bg font-bold">
                {user.fighter_buddy.name?.[0] || "F"}
              </div>
            )}
            <div>
              <p className="text-victory-lime font-semibold">
                {user.fighter_buddy.name} is ready
              </p>
              <p className="text-victory-muted text-sm">
                Your {user.fighter_buddy.archetype_name?.toLowerCase() || "fighter buddy"} awaits
              </p>
            </div>
          </div>
        )}

        {/* Features */}
        <div className="space-y-3 mb-6">
          {features.map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-victory-lime/20 flex items-center justify-center">
                <Icon className="w-4 h-4 text-victory-lime" />
              </div>
              <span className="text-victory-text">{text}</span>
            </div>
          ))}
        </div>

        {/* Plan Selection */}
        <div className="space-y-3 mb-6">
          {/* Annual Plan - Recommended */}
          <button
            onClick={() => setSelectedPlan("annual")}
            className={`w-full p-4 rounded-lg border text-left relative transition-all ${
              selectedPlan === "annual"
                ? "bg-victory-lime/10 border-victory-lime"
                : "bg-victory-card border-victory-border"
            }`}
            data-testid="plan-annual"
          >
            <div className="absolute -top-2 right-4 bg-victory-lime text-victory-bg text-xs font-semibold px-2 py-0.5 rounded">
              BEST VALUE
            </div>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-victory-text">Annual</h3>
                <p className="text-victory-muted text-sm">Save over 40%</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-heading font-bold text-victory-text">
                  $19.99
                </p>
                <p className="text-victory-muted text-sm">/year</p>
              </div>
            </div>
            {selectedPlan === "annual" && (
              <div className="absolute top-4 left-4">
                <Check className="w-5 h-5 text-victory-lime" />
              </div>
            )}
          </button>

          {/* Monthly Plan */}
          <button
            onClick={() => setSelectedPlan("monthly")}
            className={`w-full p-4 rounded-lg border text-left relative transition-all ${
              selectedPlan === "monthly"
                ? "bg-victory-lime/10 border-victory-lime"
                : "bg-victory-card border-victory-border"
            }`}
            data-testid="plan-monthly"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-victory-text">Monthly</h3>
                <p className="text-victory-muted text-sm">Flexible option</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-heading font-bold text-victory-text">
                  $2.99
                </p>
                <p className="text-victory-muted text-sm">/month</p>
              </div>
            </div>
            {selectedPlan === "monthly" && (
              <div className="absolute top-4 left-4">
                <Check className="w-5 h-5 text-victory-lime" />
              </div>
            )}
          </button>
        </div>

        {/* Details Toggle */}
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="text-victory-muted text-sm mb-4 underline"
        >
          {showDetails ? "Hide" : "View"} plan details
        </button>

        {showDetails && (
          <div className="victory-card p-4 mb-6 text-sm">
            <h4 className="font-semibold text-victory-text mb-2">Plan Comparison</h4>
            <ul className="space-y-2 text-victory-muted">
              <li>• <strong>Monthly ($2.99/mo)</strong>: Full access, cancel anytime</li>
              <li>• <strong>Annual ($19.99/yr)</strong>: Same features, 44% savings</li>
              <li>• Both include 7-day free trial</li>
              <li>• Billing starts after trial period</li>
            </ul>
          </div>
        )}

        {/* CTA Button */}
        <button
          onClick={handleStartTrial}
          disabled={loading}
          className="victory-btn-primary flex items-center justify-center gap-2"
          data-testid="start-trial-btn"
        >
          {loading ? (
            <span className="w-5 h-5 border-2 border-victory-bg border-t-transparent rounded-full animate-spin" />
          ) : (
            "Start My Free Trial"
          )}
        </button>

        <p className="text-victory-muted text-xs text-center mt-4">
          Free trial. Billing starts automatically after your trial. Cancel anytime.
        </p>
      </main>
    </div>
  );
}
