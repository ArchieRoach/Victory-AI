import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API } from "@/App";
import { toast } from "sonner";
import { ArrowLeft, CreditCard, Lock, AlertTriangle } from "lucide-react";
import { BottomNav } from "@/components/BottomNav";
import { analytics } from "@/lib/analytics";
import { founderTerms, money, formatDate } from "@/lib/billing";
import { isNativeShell } from "@/lib/nativeShell";

// Goal: keep founders subscribed without making cancelling any harder than one extra,
// honest screen. Psychology: loss aversion — losing something you own hurts about twice as
// much as gaining it feels good, but only if the loss is concrete at the moment of choice.
// Design: the cancel screen shows the exact price they'd lose and what returning would cost,
// with "Keep my founder price" as the primary button and "Cancel anyway" one tap away.
export default function BillingPage() {
  const navigate = useNavigate();
  const [billing, setBilling] = useState(null);
  const [step, setStep] = useState("view"); // view | confirm
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    axios.get(`${API}/subscription/billing`).then((r) => setBilling(r.data)).catch(() => setBilling({ has_subscription: false }));
  }, []);

  const terms = founderTerms(billing);
  const endsOn = formatDate(billing?.current_period_end);
  const unit = billing?.interval === "year" ? "year" : "month";

  const change = async (action) => {
    setBusy(true);
    try {
      const { data } = await axios.post(`${API}/subscription/${action}`);
      setBilling(data);
      setStep("view");
      analytics.capture(action === "cancel" ? "subscription_cancel_confirmed" : "subscription_resumed", { founder: !!terms });
      toast.success(action === "cancel" ? `Cancelled. You keep access until ${endsOn || "the end of this period"}.` : "You're staying. Founder price kept.");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Couldn't reach billing — try again");
    }
    setBusy(false);
  };

  const startCancel = () => {
    analytics.capture("subscription_cancel_started", { founder: !!terms });
    setStep("confirm");
  };

  const keep = () => {
    analytics.capture("subscription_cancel_kept", { founder: !!terms });
    setStep("view");
  };

  return (
    <div className="min-h-screen bg-victory-bg pb-nav">
      <header className="p-4 flex items-center gap-2 max-w-lg mx-auto">
        <button onClick={() => navigate(-1)} aria-label="Go back" className="w-11 h-11 -ml-2 flex items-center justify-center touch-target text-victory-muted hover:text-victory-text">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-heading font-extrabold text-victory-text">Subscription</h1>
      </header>

      <main className="max-w-lg mx-auto px-4 space-y-4">
        {!billing && <div className="skeleton-shimmer h-40 rounded-lg" />}

        {billing && !billing.status && (
          <div className="victory-card p-4 space-y-3">
            <p className="text-victory-text">You don't have a subscription.</p>
            {!isNativeShell() && <button onClick={() => navigate("/paywall")} className="victory-btn-primary">See plans</button>}
          </div>
        )}

        {billing?.status && step === "view" && (
          <>
            <section className="victory-card p-4 space-y-3" data-testid="billing-summary">
              <div className="flex items-center justify-between">
                <p className="section-label flex items-center gap-1.5"><CreditCard className="w-3 h-3" /> {billing.plan_id === "annual" ? "Annual" : "Monthly"} plan</p>
                <span className="text-victory-muted text-xs capitalize">{billing.status === "trialing" ? "Free trial" : billing.status.replace("_", " ")}</span>
              </div>
              <p className="font-heading font-extrabold text-2xl text-victory-text">
                {money(billing.price, billing.currency)}<span className="text-victory-muted text-sm font-body font-normal">/{unit}</span>
                {terms && <span className="ml-2 text-victory-muted text-sm font-body font-normal line-through">{terms.regular}</span>}
              </p>
              {terms && (
                <p className="text-victory-lime text-sm flex items-center gap-1.5" data-testid="founder-badge">
                  <Lock className="w-3.5 h-3.5" /> Founder price, yours for life while you stay subscribed
                </p>
              )}
              {endsOn && (
                <p className="text-victory-muted text-sm">
                  {billing.cancel_at_period_end ? `Ends on ${endsOn}` : `${billing.status === "trialing" ? "First payment" : "Renews"} on ${endsOn}`}
                </p>
              )}
            </section>

            {billing.cancel_at_period_end && (
              <section className="victory-card p-4 space-y-3 border-victory-orange/40" data-testid="cancel-pending">
                <p className="text-victory-text text-sm">
                  Your subscription ends on {endsOn || "the end of this period"}.
                  {terms && <> Your founder price of {terms.now} ends with it and can't be got back afterwards.</>}
                </p>
                {billing.manageable && !isNativeShell() && (
                  <button onClick={() => change("resume")} disabled={busy} className="victory-btn-primary disabled:opacity-50">
                    {terms ? `Stay subscribed and keep ${terms.now}` : "Stay subscribed"}
                  </button>
                )}
              </section>
            )}

            {isNativeShell() ? (
              <p className="text-victory-muted text-xs text-center">To change or cancel your subscription, sign in at victory-ai on the web.</p>
            ) : (
              billing.manageable && !billing.cancel_at_period_end && (
                <button onClick={startCancel} className="w-full text-victory-muted text-sm underline min-h-[44px]" data-testid="cancel-start">
                  Cancel subscription
                </button>
              )
            )}
          </>
        )}

        {billing?.status && step === "confirm" && (
          <section className="victory-card p-4 space-y-4" data-testid="cancel-confirm">
            {terms ? (
              <>
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-victory-orange flex-shrink-0 mt-0.5" />
                  <div className="space-y-2">
                    <p className="text-victory-text font-heading font-bold">You'll lose your founder price</p>
                    <p className="text-victory-text text-sm">
                      You pay <span className="font-mono text-victory-lime">{terms.now}</span> for life. If you cancel, it's gone for
                      good. Founder codes can only be used once, so coming back would cost{" "}
                      <span className="font-mono">{terms.regular}</span>, about {terms.extraPerYear} more a year.
                    </p>
                  </div>
                </div>
                <p className="text-victory-muted text-xs">If you cancel, you keep everything until {endsOn || "the end of this period"}.</p>
              </>
            ) : (
              <p className="text-victory-text text-sm">
                If you cancel, you keep access until {endsOn || "the end of this period"}, then your plan stops. Your training history stays.
              </p>
            )}
            <div className="grid gap-2">
              <button onClick={keep} disabled={busy} className="victory-btn-primary disabled:opacity-50">
                {terms ? "Keep my founder price" : "Keep my subscription"}
              </button>
              <button onClick={() => change("cancel")} disabled={busy} className="victory-btn-ghost min-h-[48px] text-sm disabled:opacity-50" data-testid="cancel-confirm-btn">
                {busy ? "Cancelling…" : "Cancel anyway"}
              </button>
            </div>
          </section>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
