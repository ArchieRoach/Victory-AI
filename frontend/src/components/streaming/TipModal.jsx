import { useState } from "react";
import { X, Zap, ChevronRight } from "lucide-react";
import axios from "axios";
import { API } from "@/App";
import { toast } from "sonner";

// ── Menu data ─────────────────────────────────────────────────────────────────
const MENU_CATEGORIES = [
  {
    id: "reactions",
    label: "REACTIONS",
    color: "text-amber-400",
    items: [
      { key: "ooh",       label: "Ooh",            emoji: "😮", tokens: 25,  tier: "bronze"   },
      { key: "heart",     label: "Heart",           emoji: "❤️", tokens: 25,  tier: "bronze"   },
      { key: "glass_jaw", label: "Glass Jaw",       emoji: "😵", tokens: 50,  tier: "bronze"   },
      { key: "gassed",    label: "They're Gassed",  emoji: "💨", tokens: 50,  tier: "bronze"   },
      { key: "got_heart", label: "They Got Heart",  emoji: "🫀", tokens: 75,  tier: "silver"   },
    ],
  },
  {
    id: "commands",
    label: "COMMANDS",
    color: "text-cyan-400",
    items: [
      { key: "pop_jab",  label: "Pop the Jab",    emoji: "👊", tokens: 100, tier: "silver"   },
      { key: "hands_up", label: "Hands Up",        emoji: "🙌", tokens: 100, tier: "silver"   },
      { key: "body",     label: "Work the Body",   emoji: "🥊", tokens: 150, tier: "silver"   },
      { key: "towel",    label: "Throw the Towel", emoji: "🏳️",tokens: 200, tier: "gold"     },
    ],
  },
  {
    id: "status",
    label: "STATUS",
    color: "text-yellow-400",
    items: [
      { key: "champ", label: "Champ",       emoji: "🏆", tokens: 300, tier: "gold"     },
      { key: "goat",  label: "GOAT Status", emoji: "🐐", tokens: 500, tier: "platinum" },
    ],
  },
  {
    id: "combos",
    label: "COMBOS",
    color: "text-violet-400",
    items: [
      { key: "combo_11",  label: "1-1",   emoji: "👊", tokens: 75,  tier: "silver", isCombo: true, sequence: ["👊", "👊"],        comboLabel: "1-1"   },
      { key: "combo_12",  label: "1-2",   emoji: "👊", tokens: 100, tier: "silver", isCombo: true, sequence: ["👊", "🤜"],        comboLabel: "1-2"   },
      { key: "combo_123", label: "1-2-3", emoji: "👊", tokens: 150, tier: "gold",   isCombo: true, sequence: ["👊", "🤜", "👊"], comboLabel: "1-2-3" },
    ],
  },
];

const ALL_ITEMS = MENU_CATEGORIES.flatMap((c) => c.items);

const TIER_RING = {
  bronze:   "ring-amber-700/50",
  silver:   "ring-slate-500/50",
  gold:     "ring-yellow-500/60",
  platinum: "ring-cyan-500/60",
};

const TIER_BG = {
  bronze:   "bg-amber-900/20",
  silver:   "bg-slate-800/30",
  gold:     "bg-yellow-900/20",
  platinum: "bg-cyan-900/20",
};

const QUICK_AMOUNTS = [25, 50, 100, 250, 500];

// ── Component ─────────────────────────────────────────────────────────────────
export function TipModal({ streamId, balance, onClose, onSuccess, onTopUp }) {
  const [selectedKey, setSelectedKey] = useState("heart");
  const [tab,         setTab]         = useState("menu"); // "menu" | "custom"
  const [custom,      setCustom]      = useState("");
  const [message,     setMessage]     = useState("");
  const [sending,     setSending]     = useState(false);

  // Collapsed state per category (default: all open)
  const [collapsed, setCollapsed] = useState({});
  const toggleCategory = (id) =>
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));

  const selectedItem    = ALL_ITEMS.find((i) => i.key === selectedKey);
  const effectiveAmount = tab === "custom"
    ? (parseInt(custom, 10) || 0)
    : (selectedItem?.tokens ?? 0);
  const canSend = effectiveAmount >= 25 && effectiveAmount <= balance && !sending;

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      await axios.post(`${API}/streams/${streamId}/tip`, {
        amount:     effectiveAmount,
        message:    message.trim(),
        action_key: tab === "menu" ? selectedKey : "",
      });
      onSuccess?.(effectiveAmount, selectedItem);
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
      <div className="w-full max-w-md bg-victory-bg border border-victory-border rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-victory-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-victory-lime" />
            <h2 className="font-heading font-extrabold text-victory-text text-lg">Send Tokens</h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-victory-muted font-mono">
              Balance:{" "}
              <span className="text-victory-lime font-bold">{balance.toLocaleString()}</span>
            </span>
            <button onClick={onClose} className="text-victory-muted hover:text-victory-text">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="flex border-b border-victory-border flex-shrink-0">
          {[["menu", "Punch Menu"], ["custom", "Custom Amount"]].map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
                tab === t
                  ? "text-victory-lime border-b-2 border-victory-lime"
                  : "text-victory-muted hover:text-victory-text"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Scrollable menu body ── */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {tab === "menu" ? (
            <div className="p-4 space-y-1">
              {MENU_CATEGORIES.map((cat) => (
                <div key={cat.id}>
                  {/* Category header */}
                  <button
                    onClick={() => toggleCategory(cat.id)}
                    className="w-full flex items-center justify-between py-2 px-1"
                  >
                    <span className={`text-[11px] font-bold tracking-widest ${cat.color}`}>
                      {cat.label}
                    </span>
                    <span
                      className={`text-victory-muted text-sm leading-none transition-transform duration-200 ${
                        collapsed[cat.id] ? "" : "rotate-90"
                      }`}
                    >
                      ›
                    </span>
                  </button>

                  {/* Items */}
                  {!collapsed[cat.id] && (
                    <div className="space-y-1 mb-2">
                      {cat.items.map((item) => {
                        const isSelected = selectedKey === item.key;
                        return (
                          <button
                            key={item.key}
                            onClick={() => setSelectedKey(item.key)}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-left ${
                              isSelected
                                ? `ring-1 ${TIER_RING[item.tier]} ${TIER_BG[item.tier]} border-transparent`
                                : "border-victory-border/60 hover:border-victory-lime/20 hover:bg-victory-card/60"
                            }`}
                          >
                            {/* Emoji / combo preview */}
                            <span className="text-xl w-8 text-center flex-shrink-0 leading-none">
                              {item.isCombo
                                ? item.sequence.map((e, i) => (
                                    <span key={i} className="text-base">{e}</span>
                                  ))
                                : item.emoji}
                            </span>

                            {/* Label */}
                            <div className="flex-1 min-w-0">
                              <p className={`font-semibold text-sm leading-tight ${
                                isSelected ? "text-victory-text" : "text-victory-text/80"
                              }`}>
                                {item.label}
                              </p>
                              {item.isCombo && (
                                <p className="text-[10px] text-victory-muted mt-0.5 font-mono">
                                  quick-fire · {item.sequence.length} punches
                                </p>
                              )}
                            </div>

                            {/* Token count */}
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <span className={`text-xs font-mono font-bold ${
                                isSelected ? "text-victory-lime" : "text-victory-muted"
                              }`}>
                                {item.tokens}
                              </span>
                              <span className="text-[10px] text-victory-muted">tkn</span>
                              {isSelected && (
                                <ChevronRight className="w-3 h-3 text-victory-lime ml-0.5" />
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            /* Custom amount */
            <div className="p-5 space-y-4">
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
                <label className="victory-label">Token Amount (min 25)</label>
                <input
                  type="number"
                  min={25}
                  max={balance}
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  placeholder="Enter amount..."
                  className="victory-input font-mono"
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Footer (fixed) ── */}
        <div className="border-t border-victory-border p-4 space-y-3 flex-shrink-0 bg-victory-bg">
          {/* Selected item summary */}
          {tab === "menu" && selectedItem && (
            <div className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl ring-1 ${TIER_RING[selectedItem.tier]} ${TIER_BG[selectedItem.tier]}`}>
              <span className="text-lg flex-shrink-0">
                {selectedItem.isCombo
                  ? selectedItem.sequence.join("")
                  : selectedItem.emoji}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-victory-text text-xs font-semibold truncate">
                  {selectedItem.label}
                </p>
                {selectedItem.isCombo && (
                  <p className="text-victory-muted text-[10px]">
                    Fires {selectedItem.sequence.length} overlays · 200ms apart
                  </p>
                )}
              </div>
              <span className="text-victory-lime font-mono text-xs font-bold flex-shrink-0">
                {selectedItem.tokens} tkn
              </span>
            </div>
          )}

          {/* Message */}
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={120}
            placeholder="Add a message (optional)..."
            className="victory-input text-sm"
          />

          {/* Send */}
          <button
            onClick={handleSend}
            disabled={!canSend}
            className="w-full victory-btn-primary py-3.5 text-base font-extrabold flex items-center justify-center gap-2 disabled:opacity-40"
          >
            {sending ? (
              <div className="w-5 h-5 border-2 border-victory-bg border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Zap className="w-5 h-5" />
                Send {effectiveAmount > 0 ? effectiveAmount.toLocaleString() : "—"} Tokens
              </>
            )}
          </button>

          {effectiveAmount > balance && (
            <p className="text-red-400 text-xs text-center">
              Not enough tokens.{" "}
              <button onClick={() => { onClose(); onTopUp?.(); }} className="underline">
                Top up your balance
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
