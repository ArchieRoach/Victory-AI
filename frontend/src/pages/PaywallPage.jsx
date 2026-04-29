import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API, useAuth } from "@/App";
import { toast } from "sonner";
import { Check, Zap, Trophy, Target, Shield, Star } from "lucide-react";

const MOCK_DIMENSIONS = [
  { name: "Jab", value: 7.5 },
  { name: "Cross", value: 6 },
  { name: "Head Mvmt", value: 5 },
  { name: "Footwork", value: 8 },
  { name: "Guard", value: 6.5 },
  { name: "Combos", value: 7 },
];

const PhoneMockup = ({ title, children }) => (
  <div className="flex-shrink-0 w-36 snap-center">
    <div
      className="bg-victory-card border border-victory-border rounded-2xl overflow-hidden flex flex-col"
      style={{ aspectRatio: "9/19.5" }}
    >
      <div className="bg-black/30 h-5 flex items-center justify-center flex-shrink-0">
        <div className="w-10 h-1 bg-victory-border rounded-full" />
      </div>
      <div className="flex-1 overflow-hidden p-2">{children}</div>
    </div>
    <p className="text-victory-muted text-xs text-center mt-2">{title}</p>
  </div>
);

const RadarMockup = () => {
  const cx = 60, cy = 60, r = 48;
  return (
    <div className="flex flex-col h-full">
      <p className="text-victory-lime text-xs font-bold mb-1">Your Score</p>
      <svg viewBox="0 0 120 130" className="w-full flex-1">
        {[0.33, 0.66, 1].map((s, i) => (
          <polygon
            key={i}
            points={MOCK_DIMENSIONS.map((_, idx) => {
              const a = (idx * 60 - 90) * (Math.PI / 180);
              return `${cx + r * s * Math.cos(a)},${cy + r * s * Math.sin(a)}`;
            }).join(" ")}
            fill="none" stroke="#2A2A3A" strokeWidth="0.8"
          />
        ))}
        <polygon
          points={MOCK_DIMENSIONS.map((d, idx) => {
            const a = (idx * 60 - 90) * (Math.PI / 180);
            const pr = (d.value / 10) * r;
            return `${cx + pr * Math.cos(a)},${cy + pr * Math.sin(a)}`;
          }).join(" ")}
          fill="#E8FF47" fillOpacity="0.3" stroke="#E8FF47" strokeWidth="1.5"
        />
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fill="#E8FF47" fontSize="10" fontWeight="bold">7.0</text>
        {MOCK_DIMENSIONS.map((d, idx) => {
          const a = (idx * 60 - 90) * (Math.PI / 180);
          return <text key={d.name} x={cx + (r + 8) * Math.cos(a)} y={cy + (r + 8) * Math.sin(a)} textAnchor="middle" dominantBaseline="middle" fill="#8888A0" fontSize="5">{d.name}</text>;
        })}
        <text x="60" y="118" textAnchor="middle" fill="#8888A0" fontSize="5">6 dimensions scored</text>
      </svg>
    </div>
  );
};

const DrillsMockup = () => (
  <div className="flex flex-col gap-1 h-full">
    <p className="text-victory-lime text-xs font-bold mb-1">Today's Drills</p>
    {[
      { name: "Jab extension", level: "3 × 2 min" },
      { name: "Head movement", level: "4 × 90 sec" },
      { name: "Footwork ladder", level: "5 × 1 min" },
    ].map((drill) => (
      <div key={drill.name} className="bg-victory-bg/60 rounded p-1.5">
        <p className="text-victory-text text-[7px] font-semibold leading-tight">{drill.name}</p>
        <p className="text-victory-muted text-[6px]">{drill.level}</p>
      </div>
    ))}
    <div className="mt-auto">
      <div className="bg-victory-lime/20 rounded p-1 text-center">
        <p className="text-victory-lime text-[6px] font-bold">🔥 3-day streak</p>
      </div>
    </div>
  </div>
);

const PartnerMockup = () => (
  <div className="flex flex-col items-center justify-center h-full gap-2">
    <div className="w-10 h-10 rounded-full bg-victory-lime flex items-center justify-center text-victory-bg font-bold text-sm">
      R
    </div>
    <p className="text-victory-lime text-[8px] font-bold text-center">Rocky is ready</p>
    <div className="bg-victory-bg/60 rounded p-1.5 w-full">
      <p className="text-victory-muted text-[6px] italic text-center">"Your jab needs more snap. Let's fix that today."</p>
    </div>
    <div className="flex gap-1">
      {[...Array(5)].map((_, i) => (
        <Star key={i} className="w-2 h-2 fill-victory-lime text-victory-lime" />
      ))}
    </div>
  </div>
);

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
          className="w-48 h-48 mx-auto mb-4 object-contain"
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

        {/* App Preview Mockups */}
        <div className="mb-6">
          <p className="text-victory-muted text-xs text-center mb-3 uppercase tracking-wide font-semibold">What's inside</p>
          <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory px-1">
            <PhoneMockup title="Technique scores">
              <RadarMockup />
            </PhoneMockup>
            <PhoneMockup title="Daily drills">
              <DrillsMockup />
            </PhoneMockup>
            <PhoneMockup title="AI training partner">
              <PartnerMockup />
            </PhoneMockup>
          </div>
        </div>

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
                <p className="text-victory-lime text-xs font-semibold">$0.48/week</p>
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
                <p className="text-victory-muted text-xs">~$1.15/week</p>
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
            "Start 14-Day Free Trial"
          )}
        </button>

        <p className="text-victory-muted text-xs text-center mt-4">
          Enter card details now. Free for 14 days — you won't be charged until after your trial. Cancel anytime.
        </p>
      </main>
    </div>
  );
}
