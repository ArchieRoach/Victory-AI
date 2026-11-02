import { useEffect, useState } from "react";
import axios from "axios";
import { Banknote, Clock, CheckCircle2 } from "lucide-react";
import { API } from "@/App";

// What a streamer keeps from their streams (rules and reasoning in backend/earnings.py).
// Shown in pounds, the way they'll be paid, so the money feels real as it adds up.
const gbp = (pence) => `£${((pence || 0) / 100).toFixed(2)}`;
const SOURCE_LABEL = { tip: "Tips", gift_sub: "Gift subs", emote: "Emote sales" };

export function EarningsCard() {
  const [e, setE] = useState(null);

  useEffect(() => {
    axios.get(`${API}/earnings/me`).then((r) => setE(r.data)).catch(() => setE(false));
  }, []);

  if (e === false) return null;
  if (!e) return <div className="skeleton-shimmer h-40 rounded-lg" />;

  if (!e.cash_out) {
    return (
      <section className="victory-card p-4 space-y-1" data-testid="earnings-teen">
        <p className="section-label flex items-center gap-1.5"><Banknote className="w-3 h-3" /> Your earnings</p>
        <p className="text-victory-text text-sm">You get {e.share_pct}% of what fans spend on your streams, as tokens.</p>
        <p className="text-victory-muted text-xs">Cashing out to a bank opens when you're 18.</p>
      </section>
    );
  }

  return (
    <section className="victory-card p-4 space-y-3 border-victory-lime/30 bg-victory-lime/5" data-testid="earnings">
      <div>
        <p className="section-label flex items-center gap-1.5"><Banknote className="w-3 h-3" /> Your money</p>
        <p className="font-mono text-victory-lime text-4xl font-bold mt-1">{gbp(e.this_month_pence)}</p>
        <p className="text-victory-muted text-xs">earned this month · you keep {e.share_pct}% of what fans spend on your streams</p>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-victory-card-highlight p-2">
          <p className="font-mono text-victory-text text-sm">{gbp(e.on_hold_pence)}</p>
          <p className="text-victory-muted text-[11px] flex items-center justify-center gap-1"><Clock className="w-3 h-3" /> On hold</p>
        </div>
        <div className="rounded-lg bg-victory-card-highlight p-2">
          <p className="font-mono text-victory-text text-sm">{gbp(e.ready_pence)}</p>
          <p className="text-victory-muted text-[11px]">Ready to pay</p>
        </div>
        <div className="rounded-lg bg-victory-card-highlight p-2">
          <p className="font-mono text-victory-text text-sm">{gbp(e.paid_pence)}</p>
          <p className="text-victory-muted text-[11px] flex items-center justify-center gap-1"><CheckCircle2 className="w-3 h-3" /> Paid</p>
        </div>
      </div>
      {Object.entries(e.by_source || {}).some(([, v]) => v > 0) && (
        <p className="text-victory-muted text-xs">
          This month: {Object.entries(e.by_source).filter(([, v]) => v > 0).map(([k, v]) => `${SOURCE_LABEL[k] || k} ${gbp(v)}`).join(" · ")}
        </p>
      )}
      <p className="text-victory-muted text-xs">
        Money is held {e.hold_days} days in case a fan asks for a refund, then paid monthly once it reaches {gbp(e.payout_min_pence)}.
        {e.payouts_open ? "" : " Bank payouts open soon. Everything you earn until then is kept safe here."}
      </p>
    </section>
  );
}
