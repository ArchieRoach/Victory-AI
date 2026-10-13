import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { ArrowLeft, Sparkles } from "lucide-react";
import { API } from "@/App";
import { BragButton } from "@/components/progress/BragButton";

// Season Wrapped (peak-end): a few cards that tell the season from real numbers and end on
// who the fighter became. Reasoning in backend/gamification.py (wrapped_cards).
export default function SeasonWrappedPage() {
  const navigate = useNavigate();
  const [w, setW] = useState(null);
  const [i, setI] = useState(0);
  useEffect(() => {
    axios.get(`${API}/users/me/season-wrapped`).then((r) => setW(r.data)).catch(() => setW({ ready: false }));
  }, []);

  const cards = w?.cards || [];
  const card = cards[i];
  const last = i === cards.length - 1;

  return (
    <div className="min-h-screen bg-victory-bg flex flex-col" data-testid="wrapped-page">
      <header className="p-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} aria-label="Go back"
          className="w-11 h-11 rounded-full bg-victory-card border border-victory-border flex items-center justify-center">
          <ArrowLeft className="w-5 h-5 text-victory-text" />
        </button>
        <h1 className="flex-1 text-lg font-heading font-bold text-victory-text">{w?.name ? `${w.name} Wrapped` : "Season Wrapped"}</h1>
      </header>
      <main className="flex-1 max-w-md w-full mx-auto p-4 flex flex-col">
        {!w && <div className="skeleton-shimmer h-96 rounded-2xl" />}
        {w && !w.ready && (
          <div className="victory-card p-6 text-center space-y-2">
            <Sparkles className="w-8 h-8 mx-auto text-victory-lime" />
            <p className="text-victory-text font-heading font-bold">Your Wrapped arrives when the season ends</p>
            {w.opens_in_days != null && <p className="text-victory-muted text-sm">{w.next || "Wrapped"} in {w.opens_in_days} days. Every session adds to the story.</p>}
          </div>
        )}
        {card && (
          <>
            <div className="flex gap-1 mb-4" aria-hidden="true">
              {cards.map((_, n) => <div key={n} className={`h-1 flex-1 rounded-full ${n <= i ? "bg-victory-lime" : "bg-victory-card-highlight"}`} />)}
            </div>
            <button key={i} onClick={() => !last && setI(i + 1)} aria-label={last ? card.big : "Next card"}
              className="flex-1 victory-card rounded-2xl p-8 flex flex-col items-center justify-center text-center gap-3 animate-fade-in min-h-[24rem]">
              <p className="section-label">{card.label}</p>
              <p className="font-heading font-extrabold text-5xl text-victory-lime leading-tight break-words">{card.big}</p>
              <p className="text-victory-text text-base max-w-xs">{card.line}</p>
              {!last && <p className="text-[11px] text-victory-muted mt-4">Tap for the next one</p>}
            </button>
            {last && (
              <div className="mt-4 space-y-2">
                <BragButton win={{ kind: "wrapped", season: w.name, trait: card.big }} label="Share your season" />
                <button className="victory-btn-ghost" onClick={() => setI(0)}>Watch again</button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
