import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API, useAuth } from "@/App";
import { toast } from "sonner";
import { Check, Zap, Trophy, Target, Shield, ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { analytics } from "@/lib/analytics";

const MOCK_DIMENSIONS = [
  { name: "Jab", value: 7.5 },
  { name: "Cross", value: 6 },
  { name: "Head Mvmt", value: 5 },
  { name: "Footwork", value: 8 },
  { name: "Guard", value: 6.5 },
  { name: "Combos", value: 7 },
];

// A small honest preview of the real post-session radar — same 6-of-16 dimensions
// shape the app actually renders.
const ScorePreview = () => {
  const { t } = useTranslation();
  const cx = 60, cy = 60, r = 44;
  return (
    <svg viewBox="0 0 120 132" className="w-44 h-auto mx-auto">
      {[0.33, 0.66, 1].map((s, i) => (
        <polygon
          key={i}
          points={MOCK_DIMENSIONS.map((_, idx) => {
            const a = (idx * 60 - 90) * (Math.PI / 180);
            return `${cx + r * s * Math.cos(a)},${cy + r * s * Math.sin(a)}`;
          }).join(" ")}
          fill="none" className="stroke-victory-border" strokeWidth="0.8"
        />
      ))}
      <polygon
        points={MOCK_DIMENSIONS.map((d, idx) => {
          const a = (idx * 60 - 90) * (Math.PI / 180);
          const pr = (d.value / 10) * r;
          return `${cx + pr * Math.cos(a)},${cy + pr * Math.sin(a)}`;
        }).join(" ")}
        className="fill-victory-lime stroke-victory-lime" fillOpacity="0.3" strokeWidth="1.5"
      />
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" className="fill-victory-lime" fontSize="11" fontWeight="bold">7.0</text>
      {MOCK_DIMENSIONS.map((d, idx) => {
        const a = (idx * 60 - 90) * (Math.PI / 180);
        return (
          <text key={d.name} x={cx + (r + 9) * Math.cos(a)} y={cy + (r + 9) * Math.sin(a)}
            textAnchor="middle" dominantBaseline="middle" className="fill-victory-muted" fontSize="5.5">
            {d.name}
          </text>
        );
      })}
      <text x="60" y="126" textAnchor="middle" className="fill-victory-muted" fontSize="5.5">
        {t("paywall.mockups.radarTitle")}
      </text>
    </svg>
  );
};

const StepDots = ({ step }) => (
  <div className="flex items-center gap-1.5" aria-hidden="true">
    {[1, 2, 3].map((n) => (
      <span
        key={n}
        className={`h-1.5 rounded-full transition-all ${
          n === step ? "w-6 bg-victory-lime" : n < step ? "w-1.5 bg-victory-lime" : "w-1.5 bg-victory-border"
        }`}
      />
    ))}
  </div>
);

export default function PaywallPage() {
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const { t } = useTranslation();
  const [step, setStep] = useState(1);
  const [selectedPlan, setSelectedPlan] = useState("annual");
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [avatarError, setAvatarError] = useState(false);

  // Funnel: which of the 3 steps people actually reach.
  useEffect(() => {
    analytics.capture("paywall_step_viewed", { step, name: ["value", "concerns", "payment"][step - 1] });
  }, [step]);

  const handleStartTrial = async () => {
    setLoading(true);
    analytics.capture("checkout_started", { plan: selectedPlan });
    try {
      const response = await axios.post(
        `${API}/payments/checkout`,
        { plan_id: selectedPlan, origin_url: window.location.origin },
        { withCredentials: true }
      );
      window.location.href = response.data.checkout_url;
    } catch (error) {
      toast.error(t("common.error"));
      setLoading(false);
    }
  };

  // For someone who already paid but isn't being recognised — matches their account
  // to a live Stripe subscription by email and re-syncs it. Read-only against Stripe.
  const handleRestore = async () => {
    setRestoring(true);
    try {
      const res = await axios.post(`${API}/subscription/restore`, {}, { withCredentials: true });
      if (res.data.restored) {
        toast.success(t("paywall.restoreSuccess"));
        await refreshUser();
        navigate("/home");
      } else {
        toast.error(t("paywall.restoreNotFound"));
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail || t("common.error"));
    } finally {
      setRestoring(false);
    }
  };

  const back = () => (step === 1 ? navigate(-1) : setStep((s) => s - 1));

  // ── Page 1 — communicate value (≤7 chunks: partner + preview + 4 points) ──
  const valuePoints = [
    { icon: Target, text: t("paywall.valuePoints.scores") },
    { icon: Zap, text: t("paywall.valuePoints.weakness") },
    { icon: Trophy, text: t("paywall.valuePoints.drills") },
    { icon: Shield, text: t("paywall.valuePoints.partner") },
  ];

  // ── Page 2 — address concerns (5 Q&A) ──
  const concerns = ["free", "cancel", "works", "secure", "forever"].map((k) => ({
    q: t(`paywall.concernsList.${k}Q`),
    a: t(`paywall.concernsList.${k}A`),
  }));

  const proAdds = [t("paywall.features.unlimitedAi"), t("paywall.features.adFree")];

  return (
    <div className="min-h-screen bg-victory-bg flex flex-col" data-testid="paywall-page">
      <header className="p-4 flex items-center gap-3 sticky top-0 bg-victory-bg/95 backdrop-blur-sm z-10">
        <button
          onClick={back}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-victory-card border border-victory-border text-victory-muted hover:text-victory-text transition-colors touch-target"
          aria-label={t("paywall.back")}
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <StepDots step={step} />
          <p className="text-victory-muted text-xs mt-1.5">
            {t("paywall.stepOf", { n: step })} · {t(`paywall.steps.${["value", "concerns", "payment"][step - 1]}`)}
          </p>
        </div>
      </header>

      <main className="flex-1 px-6 pb-8 flex flex-col max-w-lg w-full mx-auto">

        {step === 1 && (
          <div className="flex flex-col animate-fade-in">
            <h1 className="text-2xl sm:text-3xl font-heading font-extrabold text-victory-text mt-2 mb-2">
              {t("paywall.valueHeadline")}
            </h1>
            <p className="text-victory-muted mb-6">{t("paywall.valueSubheadline")}</p>

            {user?.training_partner && (
              <div className="victory-card p-4 mb-5 flex items-center gap-4">
                {user.training_partner.avatar_url && !avatarError ? (
                  <img
                    src={user.training_partner.avatar_url}
                    alt={user.training_partner.name}
                    className="w-12 h-12 rounded-full object-cover border-2 border-victory-lime"
                    onError={() => setAvatarError(true)}
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-victory-lime flex items-center justify-center text-victory-bg font-bold">
                    {user.training_partner.name?.[0] || "T"}
                  </div>
                )}
                <div>
                  <p className="text-victory-lime font-semibold">
                    {user.training_partner.name} {t("paywall.partnerReady")}
                  </p>
                  <p className="text-victory-muted text-sm">
                    {t("paywall.partnerAwaits", { style: user.training_partner.style_name?.toLowerCase() || "training partner" })}
                  </p>
                </div>
              </div>
            )}

            <div className="victory-card p-4 mb-6">
              <ScorePreview />
            </div>

            <ul className="space-y-3 mb-8">
              {valuePoints.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-victory-lime/20 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-4 h-4 text-victory-lime" />
                  </div>
                  <span className="text-victory-text text-sm">{text}</span>
                </li>
              ))}
            </ul>

            <button onClick={() => setStep(2)} className="victory-btn-primary" data-testid="paywall-next-1">
              {t("paywall.next")}
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col animate-fade-in">
            <h1 className="text-2xl font-heading font-extrabold text-victory-text mt-2 mb-6">
              {t("paywall.concernsHeadline")}
            </h1>

            <div className="space-y-3 mb-8">
              {concerns.map(({ q, a }) => (
                <div key={q} className="victory-card p-4">
                  <p className="text-victory-text font-semibold text-sm mb-1">{q}</p>
                  <p className="text-victory-muted text-sm leading-relaxed">{a}</p>
                </div>
              ))}
            </div>

            <button onClick={() => setStep(3)} className="victory-btn-primary" data-testid="paywall-next-2">
              {t("paywall.next")}
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col animate-fade-in">
            <h1 className="text-2xl font-heading font-extrabold text-victory-text mt-2 mb-6">
              {t("paywall.paymentHeadline")}
            </h1>

            <div className="space-y-3 mb-5">
              <button
                onClick={() => setSelectedPlan("annual")}
                className={`w-full p-4 rounded-lg border text-left relative transition-all ${
                  selectedPlan === "annual" ? "bg-victory-lime/10 border-victory-lime" : "bg-victory-card border-victory-border"
                }`}
                data-testid="plan-annual"
              >
                <div className="absolute -top-2 right-4 bg-victory-lime text-victory-bg text-xs font-semibold px-2 py-0.5 rounded">
                  {t("paywall.plans.bestValue")}
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-victory-text flex items-center gap-2">
                      {selectedPlan === "annual" && <Check className="w-4 h-4 text-victory-lime" />}
                      {t("paywall.plans.annual")}
                    </h3>
                    <p className="text-victory-muted text-sm">{t("paywall.plans.annualSavings")}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-heading font-bold text-victory-text">$25</p>
                    <p className="text-victory-lime text-xs font-semibold">{t("paywall.plans.weeklyAnnual")}</p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => setSelectedPlan("monthly")}
                className={`w-full p-4 rounded-lg border text-left transition-all ${
                  selectedPlan === "monthly" ? "bg-victory-lime/10 border-victory-lime" : "bg-victory-card border-victory-border"
                }`}
                data-testid="plan-monthly"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-victory-text flex items-center gap-2">
                      {selectedPlan === "monthly" && <Check className="w-4 h-4 text-victory-lime" />}
                      {t("paywall.plans.monthly")}
                    </h3>
                    <p className="text-victory-muted text-sm">{t("paywall.plans.monthlyFlexible")}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-heading font-bold text-victory-text">$5</p>
                    <p className="text-victory-muted text-xs">{t("paywall.plans.weeklyMonthly")}</p>
                  </div>
                </div>
              </button>
            </div>

            <div className="space-y-2 mb-5">
              {proAdds.map((text) => (
                <div key={text} className="flex items-center gap-3">
                  <Zap className="w-4 h-4 text-victory-lime flex-shrink-0" />
                  <span className="text-victory-text text-sm">{text}</span>
                </div>
              ))}
            </div>

            <p className="text-victory-muted text-xs mb-4 leading-relaxed">{t("paywall.paymentReassure")}</p>

            <button
              onClick={handleStartTrial}
              disabled={loading}
              className="victory-btn-primary flex items-center justify-center gap-2"
              data-testid="start-trial-btn"
            >
              {loading ? (
                <span className="w-5 h-5 border-2 border-victory-bg border-t-transparent rounded-full animate-spin" />
              ) : (
                t("paywall.cta")
              )}
            </button>

            <button
              onClick={handleRestore}
              disabled={restoring}
              className="w-full touch-target flex items-center justify-center text-victory-muted text-sm mt-3 disabled:opacity-50"
            >
              {restoring ? t("paywall.restoring") : t("paywall.restore")}
            </button>

            <button
              onClick={() => navigate("/home")}
              className="w-full touch-target flex items-center justify-center text-victory-muted text-sm mt-1 hover:text-victory-text"
              data-testid="continue-free-btn"
            >
              {t("paywall.freePlan.cta")}
            </button>

            <p className="text-victory-muted text-[11px] text-center mt-4">
              <button onClick={() => navigate("/terms")} className="underline">{t("profile.termsOfService")}</button>
              {" · "}
              <button onClick={() => navigate("/privacy")} className="underline">{t("profile.privacyPolicy")}</button>
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
