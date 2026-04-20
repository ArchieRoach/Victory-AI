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
        <img
          src="/victory-logo.png"
          alt="Victory AI"
          className="w-48 h-48 mx-auto mb-4 object-contain mix-blend-screen"
        />
        <h1 className="text-2xl sm:text-3xl font-heading font-extrabold text-victory-text mb-2">
          Train like a pro for less than one coffee a month.
        </h1>
        <p className="text-victory-muted">
          Your AI training partner runs your rounds, analyses your technique, and
          tells you exactly what to work on.
        </p>
      </header>

      <main className="flex-1 p-6 flex flex-col">
        {/* Training Partner Preview */}
        {user?.training_partner && (
          <div className="victory-card p-4 mb-6 flex items-center gap-4">
            {user.training_partner.avatar_url ? (
              <img
                src={user.training_partner.avatar_url}
                alt={user.training_partner.name}
                className="w-12 h-12 rounded-full object-cover border-2 border-victory-lime"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-victory-lime flex items-center justify-center text-victory-bg font-bold">
                {user.training_partner.name?.[0] || "T"}
              </div>
            )}
            <div>
              <p className="text-victory-lime font-semibold">
                {user.training_partner.name} is ready
              </p>
              <p className="text-victory-muted text-sm">
                Your {user.training_partner.style_name?.toLowerCase() || "training partner"} awaits
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
          {/* Annual Plan */}
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
                <p className="text-victory-muted text-sm">Save 58% vs monthly</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-heading font-bold text-victory-text">$25</p>
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
                <p className="text-2xl font-heading font-bold text-victory-text">$5</p>
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
            <h4 className="font-semibold text-victory-text mb-2">Plan Details</h4>
            <ul className="space-y-2 text-victory-muted">
              <li>• <strong>Monthly ($5/mo)</strong>: Full access, cancel anytime</li>
              <li>• <strong>Annual ($25/yr)</strong>: Same features, 58% savings</li>
              <li>• 7-day free trial on both plans</li>
              <li>• Card required upfront — billing starts automatically after trial</li>
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
            "Start 7-Day Free Trial"
          )}
        </button>

        <p className="text-victory-muted text-xs text-center mt-4">
          Enter card details now. Free for 7 days — you won't be charged until after your trial. Cancel anytime.
        </p>
      </main>
    </div>
  );
}
