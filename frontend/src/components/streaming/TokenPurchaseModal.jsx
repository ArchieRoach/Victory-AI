import { useState } from "react";
import { X, Zap, Sparkles } from "lucide-react";
import axios from "axios";
import { API } from "@/App";
import { toast } from "sonner";

const PACKAGES = [
  { id: "starter",  tokens: 200,  price: 1.99,  label: "Starter Pack",  badge: null,          highlight: false },
  { id: "fighter",  tokens: 500,  price: 4.99,  label: "Fighter Pack",  badge: "Popular",     highlight: true  },
  { id: "champion", tokens: 1200, price: 9.99,  label: "Champion Pack", badge: "Best Value",  highlight: false },
  { id: "legend",   tokens: 3000, price: 19.99, label: "Legend Pack",   badge: null,          highlight: false },
];

export function TokenPurchaseModal({ onClose }) {
  const [selected, setSelected] = useState("fighter");
  const [loading,  setLoading]  = useState(false);

  const pkg = PACKAGES.find((p) => p.id === selected);

  const handleBuy = async () => {
    setLoading(true);
    try {
      const res = await axios.post(
        `${API}/tokens/purchase?pkg_id=${selected}&origin_url=${encodeURIComponent(window.location.origin)}`
      );
      window.location.href = res.data.checkout_url;
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not start checkout — please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm px-4 pb-4 sm:pb-0">
      <div className="w-full max-w-md bg-victory-bg border border-victory-border rounded-2xl overflow-hidden shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-victory-border">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-victory-lime" />
            <h2 className="font-heading font-extrabold text-victory-text text-lg">Top Up Tokens</h2>
          </div>
          <button onClick={onClose}>
            <X className="w-5 h-5 text-victory-muted hover:text-victory-text" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-victory-muted text-sm">Use tokens to tip streamers, send punch alerts, and unlock reactions.</p>

          {/* Package grid */}
          <div className="grid grid-cols-2 gap-2">
            {PACKAGES.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelected(p.id)}
                className={`relative p-4 rounded-xl border text-left transition-all ${
                  selected === p.id
                    ? "border-victory-lime bg-victory-lime/10 scale-[1.02]"
                    : "border-victory-border bg-victory-card hover:border-victory-lime/30"
                }`}
              >
                {p.badge && (
                  <span className={`absolute -top-2 left-3 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    p.badge === "Popular" ? "bg-victory-lime text-victory-bg" : "bg-violet-500 text-white"
                  }`}>
                    {p.badge}
                  </span>
                )}
                <p className={`font-bold text-sm mt-1 ${selected === p.id ? "text-victory-lime" : "text-victory-text"}`}>
                  {p.label}
                </p>
                <p className={`font-mono font-extrabold text-xl mt-1 ${selected === p.id ? "text-victory-lime" : "text-victory-text"}`}>
                  ⚡ {p.tokens.toLocaleString()}
                </p>
                <p className={`text-xs mt-1 ${selected === p.id ? "text-victory-lime/70" : "text-victory-muted"}`}>
                  ${p.price.toFixed(2)}
                </p>
              </button>
            ))}
          </div>

          {/* Value hint */}
          {pkg && (
            <div className="flex items-center gap-2 bg-victory-card border border-victory-border rounded-xl px-4 py-3">
              <Sparkles className="w-4 h-4 text-victory-lime flex-shrink-0" />
              <p className="text-victory-muted text-xs">
                <span className="text-victory-text font-semibold">{pkg.tokens.toLocaleString()} tokens</span> ·{" "}
                enough for {Math.floor(pkg.tokens / 1000)} Title Shot{Math.floor(pkg.tokens / 1000) !== 1 ? "s" : ""} or{" "}
                {Math.floor(pkg.tokens / 50)} Shoutouts
              </p>
            </div>
          )}

          {/* Buy button */}
          <button
            onClick={handleBuy}
            disabled={loading}
            className="w-full victory-btn-primary py-4 text-base font-extrabold flex items-center justify-center gap-2 disabled:opacity-40"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-victory-bg border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Zap className="w-5 h-5" />
                Buy {pkg?.tokens.toLocaleString()} tokens — ${pkg?.price.toFixed(2)}
              </>
            )}
          </button>

          <p className="text-victory-muted text-xs text-center">Tokens are non-refundable. Secured by Stripe.</p>
        </div>
      </div>
    </div>
  );
}
