import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { Clock, CheckCircle2, Radio, ShoppingBag } from "lucide-react";
import { API } from "@/App";
import { createSpring, prefersReducedMotion } from "@/lib/motion";
import { countUp, gbp, sourceRows } from "@/lib/wallet";
import { tx } from "@/i18n/tx";

// Your money from streaming and selling, in one wallet. Reasoning: backend/earnings.py (wallet).
// The wallet opens and the balance card slides up, counting up as it comes. Tap to close or open.
const C = (token, a = 1) => `rgb(var(--victory-${token}) / ${a})`;
const OPEN = { damping: 0.75, response: 0.5 };
const SOURCE = {
  streams: { icon: Radio, get label() { return tx("ui.walletCard.fromStreams", "From your streams"); } },
  merch: { icon: ShoppingBag, get label() { return tx("ui.walletCard.fromMerch", "From your merch"); } },
};

export function WalletCard({ always = false }) {
  const [w, setW] = useState(null);
  const [open, setOpen] = useState(prefersReducedMotion() ? 1 : 0);
  const [isOpen, setIsOpen] = useState(false);
  const spring = useRef(null);

  useEffect(() => {
    axios.get(`${API}/wallet/me`).then((r) => setW(r.data)).catch(() => setW(false));
  }, []);

  useEffect(() => {
    if (!w) return undefined;
    if (prefersReducedMotion()) { setOpen(1); setIsOpen(true); return undefined; }
    spring.current = createSpring({ from: 0, onUpdate: setOpen, config: OPEN });
    const t = setTimeout(() => { spring.current.to(1); setIsOpen(true); }, 350);
    return () => { clearTimeout(t); spring.current?.stop(); };
  }, [w]);

  const toggle = () => {
    const to = isOpen ? 0 : 1;
    setIsOpen(!isOpen);
    if (spring.current) spring.current.to(to);
    else setOpen(to);
  };

  if (w === false || (w && !w.has_any && (!always || !w.cash_out))) return null;
  if (!w) return <div className="skeleton-shimmer h-64 rounded-lg" />;

  const rise = open;
  const shown = countUp(w.balance_pence, rise);
  const rows = sourceRows(w.sources);

  return (
    <section className="victory-card p-4 overflow-hidden" data-testid="wallet-card"
      style={{ backgroundImage: `radial-gradient(circle at 50% 10%, ${C("lime", 0.12 * rise)}, transparent 60%)` }}>
      <button type="button" onClick={toggle} className="relative block w-full h-48 [-webkit-tap-highlight-color:transparent]"
        aria-label={isOpen ? tx("ui.walletCard.close", "Close wallet") : tx("ui.walletCard.open", "Open wallet")} aria-expanded={isOpen}>
        <span className="absolute left-1/2 bottom-2 w-[78%] max-w-[300px] h-28 -translate-x-1/2 rounded-[22px]" style={{ background: C("bg", 0.9), boxShadow: `inset 0 0 0 1px ${C("border")}` }} />
        <span className="absolute left-1/2 w-[70%] max-w-[270px] h-32 rounded-2xl p-3 text-left flex flex-col justify-between"
          style={{ bottom: 20, transform: `translate(-50%, ${-58 * rise}px) rotate(${-2 * rise}deg)`,
            background: `linear-gradient(135deg, ${C("lime")}, ${C("teal")})`, color: C("bg"), boxShadow: `0 12px 30px ${C("lime", 0.25 * rise)}` }}>
          <span className="text-[10px] font-heading font-bold tracking-[0.18em] uppercase opacity-80">{tx("ui.walletCard.yourBalance", "Your balance")}</span>
          <span className="font-mono font-bold text-3xl leading-none" data-testid="wallet-balance">{gbp(shown)}</span>
          <span className="text-[10px] font-semibold opacity-80">
            {w.ready_pence > 0 ? tx("ui.walletCard.readyLine", "{{ready}} ready to pay out", { ready: gbp(w.ready_pence) }) : tx("ui.walletCard.onItsWay", "On its way to you")}
          </span>
        </span>
        <span className="absolute left-1/2 bottom-2 w-[78%] max-w-[300px] h-20 -translate-x-1/2 rounded-b-[22px] rounded-t-[10px]"
          style={{ background: C("card-highlight"), boxShadow: `0 -1px 0 ${C("border")}, 0 10px 24px ${C("bg", 0.5)}`,
            clipPath: "polygon(0 0, 38% 0, 44% 14%, 56% 14%, 62% 0, 100% 0, 100% 100%, 0 100%)" }} />
        <span className="absolute left-1/2 bottom-[54px] w-[78%] max-w-[300px] h-[3px] -translate-x-1/2 rounded-full" style={{ background: C("lime", 0.35) }} />
      </button>

      {!w.has_any && (
        <p className="text-center text-victory-muted text-sm -mt-1">{tx("ui.walletCard.empty", "Your first tip or sale lands here.")}</p>
      )}

      {w.has_any && (
        <div className="space-y-2 mt-1" style={{ opacity: Math.max(0.35, rise) }}>
          {rows.map((s) => {
            const meta = SOURCE[s.key] || SOURCE.streams;
            const Icon = meta.icon;
            return (
              <div key={s.key} className="flex items-center gap-3 rounded-lg bg-victory-card-highlight px-3 py-2">
                <Icon className="w-4 h-4 text-victory-lime shrink-0" />
                <span className="flex-1 text-sm text-victory-text">{meta.label}
                  {s.key === "merch" && s.sales ? <span className="text-victory-muted"> · {tx("ui.walletCard.sales", "{{count}} sales", { count: s.sales })}</span> : null}
                </span>
                <span className="font-mono text-sm text-victory-text">{gbp(s.pence)}</span>
              </div>
            );
          })}
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="rounded-lg bg-victory-card-highlight p-2">
              <p className="font-mono text-victory-text text-sm">{gbp(w.on_hold_pence)}</p>
              <p className="text-victory-muted text-[11px] flex items-center justify-center gap-1"><Clock className="w-3 h-3" /> {tx("ui.walletCard.onHold", "On hold")}</p>
            </div>
            <div className="rounded-lg bg-victory-card-highlight p-2">
              <p className="font-mono text-victory-text text-sm">{gbp(w.paid_pence)}</p>
              <p className="text-victory-muted text-[11px] flex items-center justify-center gap-1"><CheckCircle2 className="w-3 h-3" /> {tx("ui.walletCard.paidToBank", "Paid to your bank")}</p>
            </div>
          </div>
          {w.on_hold_pence > 0 && (
            <p className="text-victory-muted text-[11px]">
              {tx("ui.walletCard.holdWhy", "Money on hold is safe. Stream money waits {{days}} days in case a fan asks for a refund. Merch money is released when the buyer confirms it arrived (or {{merchDays}} days after you ship).",
                { days: w.hold_days, merchDays: w.merch_hold_days })}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
