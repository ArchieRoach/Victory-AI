import { useNavigate } from "react-router-dom";
import { X, Zap } from "lucide-react";

// Thin wrapper — sends users to the full /tokens store page,
// passing the current path so they can return after purchase.
export function TokenPurchaseModal({ onClose }) {
  const navigate = useNavigate();

  const handleGoToStore = () => {
    onClose?.();
    navigate("/tokens", { state: { returnPath: window.location.pathname } });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm px-4 pb-4 sm:pb-0">
      <div className="w-full max-w-md bg-victory-bg border border-victory-border rounded-2xl overflow-hidden shadow-2xl">

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
          <p className="text-victory-muted text-sm">
            Use tokens to tip streamers, buy emotes, send punch alerts, and gift subscriptions.
          </p>

          {/* Quick preview of packages */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { tokens: 200,  price: 1.99,  label: "Starter" },
              { tokens: 500,  price: 4.99,  label: "Fighter",  popular: true },
              { tokens: 1200, price: 9.99,  label: "Champion", save: "17%" },
              { tokens: 3000, price: 19.99, label: "Legend",   save: "33%" },
            ].map((p) => (
              <div
                key={p.label}
                className={`relative p-3 rounded-xl border text-left ${
                  p.popular ? "border-victory-lime/50 bg-victory-lime/5" : "border-victory-border bg-victory-card"
                }`}
              >
                {p.popular && (
                  <span className="absolute -top-2 left-2 text-[9px] font-bold px-2 py-0.5 rounded-full bg-victory-lime text-victory-bg">
                    Popular
                  </span>
                )}
                {p.save && (
                  <span className="absolute -top-2 right-2 text-[9px] font-bold px-2 py-0.5 rounded-full bg-violet-500 text-white">
                    Save {p.save}
                  </span>
                )}
                <p className="text-victory-text text-xs font-semibold mt-1">{p.label}</p>
                <p className="text-victory-lime font-mono font-black text-lg">⚡{p.tokens >= 1000 ? `${p.tokens/1000}K` : p.tokens}</p>
                <p className="text-victory-muted text-xs">${p.price.toFixed(2)}</p>
              </div>
            ))}
          </div>

          <button
            onClick={handleGoToStore}
            className="w-full victory-btn-primary py-4 text-base font-extrabold flex items-center justify-center gap-2"
          >
            <Zap className="w-5 h-5" />
            View all packs & buy
          </button>

          <p className="text-victory-muted text-xs text-center">Tokens are non-refundable. Secured by Stripe.</p>
        </div>
      </div>
    </div>
  );
}
