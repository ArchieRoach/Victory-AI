import { useState } from "react";
import { X, Zap, ChevronRight } from "lucide-react";
import axios from "axios";
import { API } from "@/App";
import { toast } from "sonner";

const PUNCH_MENU = [
  { tokens: 50,   action: "Shoutout",           emoji: "📣", tier: "bronze",   color: "border-amber-700/60  bg-amber-900/20  text-amber-500"  },
  { tokens: 100,  action: "Cheer",               emoji: "💪", tier: "silver",   color: "border-slate-500/60  bg-slate-800/30  text-slate-300"  },
  { tokens: 250,  action: "Victory Roar",        emoji: "🔥", tier: "gold",     color: "border-yellow-500/60 bg-yellow-900/20 text-yellow-400" },
  { tokens: 500,  action: "Shadowbox on Camera", emoji: "🥊", tier: "platinum", color: "border-cyan-500/60   bg-cyan-900/20   text-cyan-400"   },
  { tokens: 1000, action: "Title Shot",          emoji: "🏆", tier: "diamond",  color: "border-violet-500/60 bg-violet-900/20 text-violet-400" },
];

const QUICK_AMOUNTS = [50, 100, 250, 500, 1000];

export function TipModal({ streamId, balance, onClose, onSuccess }) {
  const [amount,  setAmount]  = useState(100);
  const [custom,  setCustom]  = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [tab,     setTab]     = useState("tiers"); // "tiers" | "custom"

  const effectiveAmount = tab === "custom" ? (parseInt(custom, 10) || 0) : amount;
  const canSend = effectiveAmount >= 50 && effectiveAmount <= balance && !sending;

  const activePunch = [...PUNCH_MENU].reverse().find((p) => effectiveAmount >= p.tokens);

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      await axios.post(`${API}/streams/${streamId}/tip`, {
        amount: effectiveAmount,
        message: message.trim(),
      });
      onSuccess?.(effectiveAmount, activePunch);
      onClose();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      if (detail === "insufficient_tokens") {
        toast.error("Not enough tokens — top up your balance.");
      } else {
        toast.error("Tip failed — please try again.");
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm px-4 pb-4 sm:pb-0">
      <div className="w-full max-w-md bg-victory-bg border border-victory-border rounded-2xl overflow-hidden shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-victory-border">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-victory-lime" />
            <h2 className="font-heading font-extrabold text-victory-text text-lg">Send Tokens</h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-victory-muted font-mono">Balance: <span className="text-victory-lime font-bold">{balance.toLocaleString()}</span></span>
            <button onClick={onClose} className="text-victory-muted hover:text-victory-text">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-victory-border">
          {["tiers", "custom"].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-sm font-semibold capitalize transition-colors ${
                tab === t ? "text-victory-lime border-b-2 border-victory-lime" : "text-victory-muted hover:text-victory-text"
              }`}
            >
              {t === "tiers" ? "Punch Menu" : "Custom Amount"}
            </button>
          ))}
        </div>

        <div className="p-5 space-y-4">
          {tab === "tiers" ? (
            /* Punch menu tiers */
            <div className="space-y-2">
              {PUNCH_MENU.map((p) => (
                <button
                  key={p.tokens}
                  onClick={() => setAmount(p.tokens)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
                    amount === p.tokens
                      ? `${p.color} border-2 scale-[1.01]`
                      : "border-victory-border bg-victory-card hover:border-victory-lime/30 text-victory-muted"
                  }`}
                >
                  <span className="text-xl w-7 text-center">{p.emoji}</span>
                  <div className="flex-1 text-left">
                    <p className={`font-semibold text-sm ${amount === p.tokens ? "" : "text-victory-text"}`}>{p.action}</p>
                    <p className="text-xs opacity-70">{p.tokens} tokens</p>
                  </div>
                  {amount === p.tokens && <ChevronRight className="w-4 h-4 opacity-60" />}
                </button>
              ))}
            </div>
          ) : (
            /* Custom amount */
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {QUICK_AMOUNTS.map((a) => (
                  <button
                    key={a}
                    onClick={() => setCustom(String(a))}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                      custom === String(a)
                        ? "bg-victory-lime text-victory-bg border-victory-lime"
                        : "border-victory-border text-victory-muted hover:border-victory-lime/40"
                    }`}
                  >
                    {a}
                  </button>
                ))}
              </div>
              <div>
                <label className="victory-label">Token Amount (min 50)</label>
                <input
                  type="number"
                  min={50}
                  max={balance}
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  placeholder="Enter amount..."
                  className="victory-input font-mono"
                />
              </div>
              {activePunch && effectiveAmount >= 50 && (
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${activePunch.color}`}>
                  <span>{activePunch.emoji}</span>
                  <span className="text-xs font-medium">Triggers: <strong>{activePunch.action}</strong></span>
                </div>
              )}
            </div>
          )}

          {/* Message */}
          <div>
            <label className="victory-label">Message (optional)</label>
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={120}
              placeholder="Add a message..."
              className="victory-input"
            />
          </div>

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={!canSend}
            className="w-full victory-btn-primary py-4 text-base font-extrabold flex items-center justify-center gap-2 disabled:opacity-40"
          >
            {sending ? (
              <div className="w-5 h-5 border-2 border-victory-bg border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Zap className="w-5 h-5" />
                Send {effectiveAmount > 0 ? effectiveAmount.toLocaleString() : ""} Tokens
              </>
            )}
          </button>

          {effectiveAmount > balance && (
            <p className="text-red-400 text-xs text-center">Not enough tokens. <button onClick={onClose} className="underline">Top up your balance</button></p>
          )}
        </div>
      </div>
    </div>
  );
}
