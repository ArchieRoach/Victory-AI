import { useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Banknote, Clock, CheckCircle2 } from "lucide-react";
import { API } from "@/App";
import { BirthDateCard } from "@/components/BirthDateCard";
import { tx } from "@/i18n/tx";

// What a streamer keeps from their streams (rules and reasoning in backend/earnings.py).
// Shown in pounds, the way they'll be paid, so the money feels real as it adds up.
const gbp = (pence) => `£${((pence || 0) / 100).toFixed(2)}`;
const SOURCE_LABEL = { get tip() { return tx("ui.earningsCard.tips", "Tips"); }, gift_sub: "Gift subs", emote: "Emote sales" };

export function EarningsCard() {
  const [e, setE] = useState(null);

  useEffect(() => {
    const load = () => axios.get(`${API}/earnings/me`).then((r) => setE(r.data)).catch(() => setE(false));
    const back = new URLSearchParams(window.location.search).get("payouts") === "done";
    if (back) axios.post(`${API}/earnings/payouts/refresh`).catch(() => {}).finally(load);
    else load();
  }, []);

  const setUpPayouts = async () => {
    try {
      const { data } = await axios.post(`${API}/earnings/payouts/onboard`, { origin_url: window.location.origin });
      window.location.href = data.url;
    } catch (err) {
      toast.error(err?.response?.data?.detail || tx("ui.earningsCard.couldnTOpenPayout", "Couldn't open payout setup. Try again."));
    }
  };

  if (e === false) return null;
  if (!e) return <div className="skeleton-shimmer h-40 rounded-lg" />;

  if (e.age_unknown) {
    return <BirthDateCard why="Cashing out is for streamers aged 18 and over, and we don't have your date of birth yet."
      onSaved={() => window.location.reload()} />;
  }

  if (!e.cash_out) {
    return (
      <section className="victory-card p-4 space-y-1" data-testid="earnings-teen">
        <p className="section-label flex items-center gap-1.5"><Banknote className="w-3 h-3" /> {tx("ui.earningsCard.yourEarnings", "Your earnings")}</p>
        <p className="text-victory-text text-sm">{tx("ui.earningsCard.youGet", "You get")} {e.share_pct}{tx("ui.earningsCard.ofWhatFansSpend", "% of what fans spend on your streams, as tokens.")}</p>
        <p className="text-victory-muted text-xs">{tx("ui.earningsCard.cashingOutToA", "Cashing out to a bank opens when you're 18.")}</p>
      </section>
    );
  }

  return (
    <section className="victory-card p-4 space-y-3 border-victory-lime/30 bg-victory-lime/5" data-testid="earnings">
      <div>
        <p className="section-label flex items-center gap-1.5"><Banknote className="w-3 h-3" /> {tx("ui.earningsCard.yourMoney", "Your money")}</p>
        <p className="font-mono text-victory-lime text-4xl font-bold mt-1">{gbp(e.this_month_pence)}</p>
        <p className="text-victory-muted text-xs">{tx("ui.earningsCard.earnedThisMonthYou", "earned this month · you keep")} {e.share_pct}{tx("ui.earningsCard.ofWhatFansSpend2", "% of what fans spend on your streams")}</p>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-victory-card-highlight p-2">
          <p className="font-mono text-victory-text text-sm">{gbp(e.on_hold_pence)}</p>
          <p className="text-victory-muted text-[11px] flex items-center justify-center gap-1"><Clock className="w-3 h-3" /> {tx("ui.earningsCard.onHold", "On hold")}</p>
        </div>
        <div className="rounded-lg bg-victory-card-highlight p-2">
          <p className="font-mono text-victory-text text-sm">{gbp(e.ready_pence)}</p>
          <p className="text-victory-muted text-[11px]">{tx("ui.earningsCard.readyToPay", "Ready to pay")}</p>
        </div>
        <div className="rounded-lg bg-victory-card-highlight p-2">
          <p className="font-mono text-victory-text text-sm">{gbp(e.paid_pence)}</p>
          <p className="text-victory-muted text-[11px] flex items-center justify-center gap-1"><CheckCircle2 className="w-3 h-3" /> {tx("ui.earningsCard.paid", "Paid")}</p>
        </div>
      </div>
      {Object.entries(e.by_source || {}).some(([, v]) => v > 0) && (
        <p className="text-victory-muted text-xs">
          {tx("ui.earningsCard.thisMonth", "This month:")} {Object.entries(e.by_source).filter(([, v]) => v > 0).map(([k, v]) => `${SOURCE_LABEL[k] || k} ${gbp(v)}`).join(" · ")}
        </p>
      )}
      <p className="text-victory-muted text-xs">
        {tx("ui.earningsCard.moneyIsHeld", "Money is held")} {e.hold_days} {tx("ui.earningsCard.daysInCaseA", "days in case a fan asks for a refund, then paid to your bank monthly once it reaches")} {gbp(e.payout_min_pence)}.
      </p>
      {e.payouts_open && !e.payouts_ready && (
        <div className="space-y-2" data-testid="earnings-setup">
          <p className="text-victory-text text-sm">{tx("ui.earningsCard.setUpPayoutsWith", "Set up payouts with Stripe to get this in your bank. It takes about 5 minutes and needs your ID and bank details.")}</p>
          <button className="victory-btn-primary w-full" onClick={setUpPayouts}>{tx("ui.earningsCard.setUpPayouts", "Set up payouts")}</button>
        </div>
      )}
    </section>
  );
}
