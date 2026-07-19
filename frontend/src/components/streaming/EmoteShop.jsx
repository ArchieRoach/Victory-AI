import { useState, useEffect } from "react";
import { X, Coins, Check } from "lucide-react";
import axios from "axios";
import { toast } from "sonner";
import { API } from "@/App";

export function EmoteShop({ streamOwnerId, onClose, tokenBalance, onBalanceChange }) {
  const [emotes,    setEmotes]    = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [buying,    setBuying]    = useState(null); // emote_id being purchased

  useEffect(() => {
    const load = async () => {
      try {
        const res = await axios.get(`${API}/emotes/${streamOwnerId}/collection`);
        setEmotes(res.data || []);
      } catch {}
      finally { setLoading(false); }
    };
    load();
  }, [streamOwnerId]);

  const handlePurchase = async (emote) => {
    if (emote.owned) return;
    if (emote.token_price > tokenBalance) {
      toast.error(`Not enough tokens — you need ${emote.token_price.toLocaleString()}`);
      return;
    }
    setBuying(emote.emote_id);
    try {
      await axios.post(`${API}/emotes/${emote.emote_id}/purchase`);
      setEmotes((prev) => prev.map((e) => e.emote_id === emote.emote_id ? { ...e, owned: true } : e));
      onBalanceChange?.(-emote.token_price);
      toast.success(`${emote.name} unlocked!`);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      if (detail === "insufficient_tokens") toast.error("Not enough tokens.");
      else if (detail === "Already unlocked") toast("Already in your collection.");
      else toast.error("Purchase failed.");
    } finally {
      setBuying(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative w-full max-w-lg bg-victory-card rounded-t-2xl border-t border-victory-border p-4 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-victory-text font-bold text-base">Emote Shop</h2>
            <p className="text-victory-muted text-xs mt-0.5">
              Balance: <span className="text-victory-lime font-semibold">{tokenBalance?.toLocaleString()} tokens</span>
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-11 h-11 flex items-center justify-center touch-target text-victory-muted hover:text-victory-text">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Emote grid */}
        {loading ? (
          <div className="flex justify-center py-10">
            <div className="w-7 h-7 border-2 border-victory-lime border-t-transparent rounded-full animate-spin" />
          </div>
        ) : emotes.length === 0 ? (
          <p className="text-victory-muted text-sm text-center py-10">
            This streamer hasn't created any emotes yet.
          </p>
        ) : (
          <div className="grid grid-cols-4 gap-3 max-h-80 overflow-y-auto pr-1" style={{ scrollbarWidth: "none" }}>
            {emotes.map((emote) => (
              <button
                key={emote.emote_id}
                onClick={() => handlePurchase(emote)}
                disabled={emote.owned || buying === emote.emote_id}
                className={`flex flex-col items-center gap-1.5 p-2 rounded-xl border transition-colors ${
                  emote.owned
                    ? "border-victory-lime/40 bg-victory-lime/5 cursor-default"
                    : "border-victory-border hover:border-victory-lime/40 active:scale-95"
                }`}
              >
                <div className="relative">
                  <img
                    src={emote.image_url}
                    alt={emote.name}
                    className={`w-14 h-14 rounded-lg object-cover bg-white/5 ${emote.owned ? "" : "opacity-80"}`}
                    loading="lazy"
                  />
                  {emote.owned && (
                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-victory-lime rounded-full flex items-center justify-center">
                      <Check className="w-2.5 h-2.5 text-victory-bg" strokeWidth={3} />
                    </div>
                  )}
                </div>
                <span className="text-[10px] font-bold text-victory-text leading-tight text-center">{emote.name}</span>
                <span className="text-[9px] text-victory-muted">{emote.emoji}</span>
                {emote.owned ? (
                  <span className="text-[10px] text-victory-lime font-semibold">Owned</span>
                ) : (
                  <span className="flex items-center gap-0.5 text-[10px] text-victory-muted">
                    <Coins className="w-2.5 h-2.5" />
                    {emote.token_price === 0 ? "Free" : emote.token_price.toLocaleString()}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
