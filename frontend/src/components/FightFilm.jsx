import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API } from "@/App";
import { Film, Eye, Plus } from "lucide-react";
import { HighlightShareSheet } from "@/components/HighlightShareSheet";

// A fighter's curated reel of their best rounds — content and reputation that grows with
// every session and lives only here.
export function FightFilm({ userId, isOwn }) {
  const navigate = useNavigate();
  const [film, setFilm] = useState(null);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    axios.get(`${API}/users/${userId}/fight-film`).then((r) => setFilm(r.data)).catch(() => setFilm({ reel: [] }));
  }, [userId]);

  const play = (hl) => {
    setOpen(hl);
    if (!isOwn) axios.post(`${API}/users/${userId}/fight-film/view`).catch(() => {});
  };

  if (!film) return <div className="skeleton-shimmer h-40 rounded-lg" />;
  if (!film.reel.length && !isOwn) return null;

  return (
    <section className="victory-card p-4" data-testid="fight-film">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-heading font-bold text-victory-text flex items-center gap-2">
          <Film className="w-5 h-5 text-victory-lime" /> Fight Film
        </h2>
        {isOwn && film.views_7d != null && (
          <span className="text-victory-muted text-xs flex items-center gap-1">
            <Eye className="w-3.5 h-3.5" /> <span className="font-mono">{film.views_7d}</span> this week
          </span>
        )}
      </div>

      {film.reel.length === 0 ? (
        <button
          onClick={() => navigate("/highlights")}
          className="w-full rounded-xl border border-dashed border-victory-border p-4 flex items-center gap-3 text-left active:scale-[0.99] transition-transform"
        >
          <div className="w-10 h-10 rounded-2xl bg-victory-lime/10 border border-victory-lime/20 flex items-center justify-center flex-shrink-0">
            <Plus className="w-5 h-5 text-victory-lime" />
          </div>
          <div>
            <p className="text-victory-text text-sm font-semibold">Start your Fight Film</p>
            <p className="text-victory-muted text-xs">Pin up to {film.max || 6} of your best rounds here — it's what people see first.</p>
          </div>
        </button>
      ) : (
        <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-4 px-4">
          {film.reel.map((hl) => (
            <button
              key={hl.highlight_id}
              onClick={() => play(hl)}
              className="relative flex-shrink-0 w-28 aspect-[9/16] rounded-2xl overflow-hidden bg-victory-card-highlight border border-victory-border active:scale-[0.98] transition-transform text-left"
              aria-label={`Play ${hl.stream_title || "round"}`}
            >
              {hl.thumbnail_url && <img src={hl.thumbnail_url} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />}
              <div className="absolute inset-0 bg-gradient-to-t from-victory-bg via-transparent to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-2">
                {hl.round_score != null ? (
                  <p className="font-mono font-bold text-victory-lime leading-none">{Number(hl.round_score).toFixed(1)}</p>
                ) : hl.peak_reactions > 0 ? (
                  <p className="font-mono font-bold text-victory-lime leading-none">{hl.peak_reactions}<span className="text-[9px] text-victory-muted font-body ml-1">hype</span></p>
                ) : null}
                <p className="text-victory-text text-[10px] truncate mt-0.5">{hl.stream_title}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {open && (
        <HighlightShareSheet highlightId={open.highlight_id} initial={open} onClose={() => setOpen(null)} />
      )}
    </section>
  );
}

export function FighterReputation({ profile }) {
  const titles = profile?.titles || [];
  const traits = profile?.identity_traits || [];
  const won = profile?.callouts_won || 0;
  const defended = profile?.callouts_defended || 0;
  if (!titles.length && !traits.length && !won && !defended) return null;
  return (
    <div className="flex flex-wrap gap-2" data-testid="fighter-reputation">
      {traits.map((t) => (
        <span key={t.name} className="flex items-center gap-1 bg-victory-teal/10 text-victory-teal border border-victory-teal/40 rounded-full px-2.5 py-1 text-xs font-heading font-bold">
          {t.name} <span className="font-mono">×{t.count}</span>
        </span>
      ))}
      {titles.map((t) => (
        <span key={t} className="flex items-center gap-1 bg-victory-lime/15 text-victory-lime border border-victory-lime/40 rounded-full px-2.5 py-1 text-xs font-heading font-bold">
          {t}
        </span>
      ))}
      {(won > 0 || defended > 0) && (
        <span className="bg-victory-card-highlight border border-victory-border rounded-full px-2.5 py-1 text-xs text-victory-muted">
          Callouts: <span className="font-mono text-victory-text">{won}</span> won · <span className="font-mono text-victory-text">{defended}</span> defended
        </span>
      )}
    </div>
  );
}
