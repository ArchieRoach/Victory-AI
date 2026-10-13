import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { CalendarClock, Telescope, Sparkles, ChevronRight, X } from "lucide-react";
import { API } from "@/App";

// Anticipation Parade: the next few real things coming up, soonest first. Reasoning in
// backend/gamification.py (anticipation).
export function ComingUp() {
  const [items, setItems] = useState(null);
  useEffect(() => {
    axios.get(`${API}/coming-up`).then((r) => setItems(r.data.items)).catch(() => setItems([]));
  }, []);
  if (!items?.length) return null;
  return (
    <section className="victory-card p-3" data-testid="coming-up">
      <p className="section-label flex items-center gap-1.5 mb-2"><CalendarClock className="w-3 h-3" /> Coming up</p>
      <ul className="space-y-1.5">
        {items.map((i) => (
          <li key={`${i.kind}-${i.title}`} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-victory-text truncate">{i.title}</span>
            <span className="text-[11px] text-victory-muted flex-shrink-0">{i.when}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Oracle Effect: your partner's prediction from your own trend. Prove it in training.
export function OracleCard() {
  const [o, setO] = useState(null);
  useEffect(() => {
    axios.get(`${API}/oracle`).then((r) => setO(r.data)).catch(() => {});
  }, []);
  if (!o?.prediction) return null;
  return (
    <section className="victory-card p-4 space-y-1 border-victory-teal/30" data-testid="oracle">
      <p className="section-label flex items-center gap-1.5"><Telescope className="w-3 h-3" /> Your partner's prediction</p>
      <p className="text-victory-text text-sm">{o.prediction.line}</p>
      <p className="text-[11px] text-victory-muted">{o.note}</p>
    </section>
  );
}

const SEEN_KEY = "victory_wrapped_seen";

// Season Wrapped: shows once a season has finished, until it's been opened.
export function WrappedCard() {
  const navigate = useNavigate();
  const [w, setW] = useState(null);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    axios.get(`${API}/users/me/season-wrapped`).then((r) => setW(r.data)).catch(() => {});
  }, []);
  let seen = null;
  try { seen = localStorage.getItem(SEEN_KEY); } catch {}
  if (!w?.ready || hidden || seen === String(w.season)) return null;
  const close = () => { try { localStorage.setItem(SEEN_KEY, String(w.season)); } catch {} setHidden(true); };
  return (
    <section className="victory-card p-4 border-victory-lime/40 bg-victory-lime/5 flex items-center gap-3" data-testid="wrapped-card">
      <Sparkles className="w-6 h-6 text-victory-lime flex-shrink-0" />
      <button className="flex-1 text-left min-h-[44px]" onClick={() => { close(); navigate("/wrapped"); }}>
        <span className="block text-victory-text font-heading font-bold">{w.name} Wrapped is here</span>
        <span className="block text-[12px] text-victory-muted">Your season, told from your own training.</span>
      </button>
      <ChevronRight className="w-4 h-4 text-victory-muted" />
      <button aria-label="Hide" onClick={close} className="w-11 h-11 -mr-2 flex items-center justify-center text-victory-muted"><X className="w-4 h-4" /></button>
    </section>
  );
}
