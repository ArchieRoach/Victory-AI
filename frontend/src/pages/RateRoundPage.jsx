import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { API } from "@/App";
import { toast } from "sonner";
import { ArrowLeft, Swords, Check } from "lucide-react";
import { BottomNav } from "@/components/BottomNav";
import { STAMPS } from "@/lib/stamps";
import { analytics } from "@/lib/analytics";

export default function RateRoundPage() {
  const { highlightId } = useParams();
  const navigate = useNavigate();
  const [hl,       setHl]       = useState(null);
  const [summary,  setSummary]  = useState(null);
  const [picked,   setPicked]   = useState(null);
  const [comment,  setComment]  = useState("");
  const [sending,  setSending]  = useState(false);
  const [done,     setDone]     = useState(false);
  const [missing,  setMissing]  = useState(false);

  useEffect(() => {
    Promise.all([
      axios.get(`${API}/highlights/${highlightId}`),
      axios.get(`${API}/highlights/${highlightId}/stamps`),
    ]).then(([h, s]) => {
      setHl(h.data);
      setSummary(s.data);
      if (s.data.my_stamp) { setPicked(s.data.my_stamp); setDone(true); }
    }).catch(() => setMissing(true));
  }, [highlightId]);

  const submit = async () => {
    if (!picked) return;
    setSending(true);
    try {
      const res = await axios.post(`${API}/highlights/${highlightId}/stamps`, { stamp: picked, comment });
      setSummary((s) => ({ ...s, ...res.data }));
      setDone(true);
      analytics.capture("round_stamped", { stamp: picked, with_comment: !!comment.trim() });
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Couldn't send your verdict");
    }
    setSending(false);
  };

  return (
    <div className="min-h-screen bg-victory-bg pb-nav">
      <div className="sticky top-0 z-20 bg-victory-bg/95 backdrop-blur border-b border-victory-border">
        <header className="p-4 flex items-center gap-2 max-w-lg mx-auto">
          <button onClick={() => navigate(-1)} aria-label="Go back" className="w-11 h-11 -ml-2 flex items-center justify-center touch-target text-victory-muted hover:text-victory-text">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-xl font-heading font-extrabold text-victory-text">Rate the round</h1>
            <p className="text-victory-muted text-sm truncate">
              {hl ? `${hl.streamer_name || "Your squad mate"} · ${hl.stream_title || "Round"}` : "Your squad wants a verdict"}
            </p>
          </div>
        </header>
      </div>

      <main className="max-w-lg mx-auto px-4 py-4 space-y-4">
        {missing && (
          <div className="flex flex-col items-center justify-center py-16 text-center px-6">
            <div className="w-16 h-16 rounded-2xl bg-victory-lime/10 border border-victory-lime/20 flex items-center justify-center mb-4">
              <Swords className="w-8 h-8 text-victory-lime/60" />
            </div>
            <p className="text-victory-text font-bold text-lg mb-1">This round isn't available</p>
            <p className="text-victory-muted text-sm">It may have been deleted, or it wasn't sent to your squad.</p>
          </div>
        )}

        {!missing && !hl && <div className="skeleton-shimmer mx-auto w-full max-w-[240px] aspect-[9/16] rounded-2xl" />}

        {hl && (
          <>
            <div className="mx-auto w-full max-w-[240px] aspect-[9/16] rounded-2xl overflow-hidden bg-victory-card border border-victory-border">
              <video src={hl.share_video_url} poster={hl.thumbnail_url} className="w-full h-full object-cover" autoPlay muted loop playsInline controls />
            </div>

            <p className="section-label">Your verdict</p>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Pick a stamp">
              {STAMPS.map(({ key, label, icon: Icon }) => {
                const active = picked === key;
                return (
                  <button
                    key={key}
                    role="radio"
                    aria-checked={active}
                    onClick={() => setPicked(key)}
                    className={`min-h-[52px] rounded-xl border flex items-center justify-center gap-2 font-heading font-bold text-sm transition-colors ${
                      active ? "bg-victory-lime/15 border-victory-lime text-victory-lime" : "bg-victory-card border-victory-border text-victory-text"
                    }`}
                  >
                    <Icon className="w-4 h-4" /> {label}
                  </button>
                );
              })}
            </div>

            <input
              className="victory-input w-full"
              placeholder="Add a line (optional)"
              maxLength={80}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />

            <button onClick={submit} disabled={!picked || sending} className="victory-btn-primary disabled:opacity-50 flex items-center justify-center gap-2">
              {done ? <><Check className="w-5 h-5" /> Update verdict</> : sending ? "Sending…" : "Send verdict"}
            </button>

            {done && summary && (
              <p className="text-victory-muted text-sm text-center animate-fade-in">
                <span className="font-mono text-victory-lime font-bold">{summary.count}</span> of {summary.sent_to} squad {summary.sent_to === 1 ? "mate has" : "mates have"} weighed in
                {summary.verdict_in > 0 ? ` · ${summary.verdict_in} more for the verdict` : " · verdict revealed"}
              </p>
            )}
          </>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
