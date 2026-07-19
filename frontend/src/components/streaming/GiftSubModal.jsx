import { useState } from "react";
import { X, Gift } from "lucide-react";
import axios from "axios";
import { API } from "@/App";
import { toast } from "sonner";

const TIERS = [
  { count: 1,  price: 4.99,   label: "1 Gift Sub",   description: "Gift a single subscription" },
  { count: 5,  price: 19.99,  label: "5 Gift Subs",  description: "Best value · save 20%" },
  { count: 10, price: 34.99,  label: "10 Gift Subs", description: "Super value · save 30%" },
  { count: 50, price: 149.99, label: "50 Gift Subs", description: "Community bomb · save 40%" },
];

const BADGE_THRESHOLDS = [
  { min: 1,  emoji: "🎁", label: "Gifter" },
  { min: 5,  emoji: "🥈", label: "Silver Gifter" },
  { min: 10, emoji: "🏆", label: "Gold Gifter" },
  { min: 50, emoji: "💎", label: "Diamond Gifter" },
];

export function GiftSubModal({ streamId, onClose }) {
  const [selected, setSelected]   = useState(1);
  const [loading,  setLoading]    = useState(false);

  const tier = TIERS.find((t) => t.count === selected);

  const handle = async () => {
    setLoading(true);
    try {
      const res = await axios.post(`${API}/streams/${streamId}/gift-sub`, {
        count: selected,
        origin_url: window.location.origin,
      });
      window.location.href = res.data.checkout_url;
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not start checkout.");
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm px-4 pb-4 sm:pb-0">
      <div className="w-full max-w-md bg-victory-bg border border-victory-border rounded-2xl overflow-hidden shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-victory-border">
          <div className="flex items-center gap-2">
            <Gift className="w-5 h-5 text-victory-lime" />
            <h2 className="font-heading font-extrabold text-victory-text text-lg">Gift a Sub</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-11 h-11 flex items-center justify-center touch-target">
            <X className="w-5 h-5 text-victory-muted hover:text-victory-text" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Tier selector */}
          <div className="grid grid-cols-2 gap-2">
            {TIERS.map((t) => (
              <button
                key={t.count}
                onClick={() => setSelected(t.count)}
                className={`p-3 rounded-xl border text-left transition-all ${
                  selected === t.count
                    ? "border-victory-lime bg-victory-lime/10 scale-[1.02]"
                    : "border-victory-border bg-victory-card hover:border-victory-lime/30"
                }`}
              >
                <p className={`font-bold text-sm ${selected === t.count ? "text-victory-lime" : "text-victory-text"}`}>{t.label}</p>
                <p className="text-victory-muted text-xs mt-0.5">{t.description}</p>
                <p className={`font-mono font-extrabold text-base mt-1.5 ${selected === t.count ? "text-victory-lime" : "text-victory-text"}`}>${t.price}</p>
              </button>
            ))}
          </div>

          {/* Gifter badge progression */}
          <div className="bg-victory-card border border-victory-border rounded-xl p-3">
            <p className="text-victory-muted text-xs font-semibold uppercase tracking-wider mb-2">Gifter Badges</p>
            <div className="flex justify-between">
              {BADGE_THRESHOLDS.map((b) => (
                <div key={b.min} className={`flex flex-col items-center gap-1 ${selected >= b.min ? "opacity-100" : "opacity-30"}`}>
                  <span className="text-xl">{b.emoji}</span>
                  <span className="text-[10px] text-victory-muted text-center leading-tight">{b.label}</span>
                  <span className="text-[10px] text-victory-lime font-bold">{b.min}+</span>
                </div>
              ))}
            </div>
            <p className="text-victory-muted text-xs mt-2 text-center">Badges appear next to your username in chat forever.</p>
          </div>

          {/* CTA */}
          <button
            onClick={handle}
            disabled={loading}
            className="w-full victory-btn-primary py-4 text-base font-extrabold flex items-center justify-center gap-2 disabled:opacity-40"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-victory-bg border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Gift className="w-5 h-5" />
                Gift {tier?.label} — ${tier?.price}
              </>
            )}
          </button>

          <p className="text-victory-muted text-xs text-center">Subs are gifted to random community members. Recipients get 30 days of Pro access.</p>
        </div>
      </div>
    </div>
  );
}
