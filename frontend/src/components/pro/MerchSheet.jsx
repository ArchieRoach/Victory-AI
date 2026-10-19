import { useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { API } from "@/App";
import { BottomSheet } from "@/components/BottomSheet";
import { orderTotals, gbp } from "@/lib/proShop";

// Physical merch can be paid for outside Apple's in-app purchase (App Store rule 3.1.5),
// so this checkout works inside the iPhone app too.
export function MerchSheet({ item, onClose }) {
  const [size, setSize] = useState(item.sizes?.length ? null : "");
  const [busy, setBusy] = useState(false);
  const t = orderTotals(item.price_gbp, item.shipping_gbp || 0);

  const buy = async () => {
    setBusy(true);
    try {
      const { data } = await axios.post(`${API}/merch/${item.item_id}/checkout`, { size: size || "", origin_url: window.location.origin });
      if (!data.for_parent) { window.location.href = data.checkout_url; return; }
      const text = `Can you get me ${item.title} from ${item.alias}'s shop on Victory AI? It's ${gbp(data.totals.total)} with delivery.`;
      try {
        if (navigator.share) await navigator.share({ text, url: data.checkout_url });
        else { await navigator.clipboard.writeText(`${text} ${data.checkout_url}`); toast.success("Link copied: send it to a parent"); }
      } catch {}
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Couldn't start checkout. Try again.");
    }
    setBusy(false);
  };

  return (
    <BottomSheet onClose={onClose} label={item.title} testId="merch-sheet">
      <div className="space-y-4">
        <img src={item.image_url} alt={item.title} className="w-full max-h-72 object-cover rounded-xl" />
        <div>
          <p className="text-victory-text font-heading font-extrabold text-lg">{item.title}</p>
          <p className="text-victory-muted text-sm">{item.alias}</p>
          {item.description && <p className="text-victory-text text-sm mt-2">{item.description}</p>}
        </div>
        {item.sizes?.length > 0 && (
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Size">
            {item.sizes.map((s) => (
              <button key={s} role="radio" aria-checked={size === s} onClick={() => setSize(s)}
                className={`min-w-[48px] min-h-[44px] px-3 rounded-full text-sm font-semibold border ${size === s ? "bg-victory-lime text-victory-bg border-victory-lime" : "border-victory-border text-victory-text"}`}>
                {s}
              </button>
            ))}
          </div>
        )}
        <dl className="victory-card p-3 text-sm space-y-1" data-testid="merch-totals">
          <div className="flex justify-between"><dt className="text-victory-muted">Item</dt><dd className="font-mono">{gbp(t.item)}</dd></div>
          <div className="flex justify-between"><dt className="text-victory-muted">Delivery</dt><dd className="font-mono">{t.shipping ? gbp(t.shipping) : "Free"}</dd></div>
          <div className="flex justify-between"><dt className="text-victory-muted flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5 text-victory-teal" /> Buyer Protection</dt><dd className="font-mono">{gbp(t.buyerProtection)}</dd></div>
          <div className="flex justify-between border-t border-victory-border pt-1 font-semibold"><dt>Total</dt><dd className="font-mono text-victory-lime">{gbp(t.total)}</dd></div>
        </dl>
        <p className="text-victory-muted text-xs">Buyer Protection: we hold your money until you confirm it arrived. If it doesn't, or it's not as described, you get a refund.</p>
        <button className="victory-btn-primary" disabled={busy || size === null} onClick={buy} data-testid="buy-merch">
          {size === null ? "Pick a size" : busy ? "Opening checkout…" : `Buy for ${gbp(t.total)}`}
        </button>
      </div>
    </BottomSheet>
  );
}
