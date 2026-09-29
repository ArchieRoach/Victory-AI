import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API } from "@/App";
import { toast } from "sonner";
import { ArrowLeft, Megaphone, Crown, Shield, Clock, Swords } from "lucide-react";
import { BottomNav } from "@/components/BottomNav";

const daysLeft = (iso) => Math.max(0, Math.ceil((new Date(iso) - Date.now()) / 86_400_000));

function StatusLine({ c, mine }) {
  if (c.status === "beaten") {
    return (
      <p className="text-xs flex items-center gap-1 text-victory-muted">
        <Crown className="w-3.5 h-3.5 text-victory-lime" />
        {c.beaten_by_name} beat it with <span className="font-mono text-victory-lime">{c.beaten_score}</span>
      </p>
    );
  }
  if (c.status === "defended") {
    return (
      <p className="text-xs flex items-center gap-1 text-victory-muted">
        <Shield className="w-3.5 h-3.5 text-victory-teal" /> {mine ? "Defended — nobody touched it" : "Defended"}
      </p>
    );
  }
  return (
    <p className="text-xs flex items-center gap-1 text-victory-muted">
      <Clock className="w-3.5 h-3.5" /> {daysLeft(c.expires_at)} days left
      {mine && ` · ${c.accepted_count}/${c.target_count} accepted`}
    </p>
  );
}

export default function CalloutsPage() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);

  const load = () => axios.get(`${API}/callouts`).then((r) => setData(r.data)).catch(() => setData({ sent: [], received: [] }));
  useEffect(() => { load(); }, []);

  const accept = async (c) => {
    try {
      await axios.post(`${API}/callouts/${c.callout_id}/accept`);
      setData((d) => ({ ...d, received: d.received.map((x) => (x.callout_id === c.callout_id ? { ...x, accepted: true } : x)) }));
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Couldn't accept");
    }
  };

  const train = (c) => navigate(c.dimension === "Overall" ? "/train" : `/train?focus=${encodeURIComponent(c.dimension)}`);

  const empty = data && data.sent.length === 0 && data.received.length === 0;

  return (
    <div className="min-h-screen bg-victory-bg pb-nav">
      <div className="sticky top-0 z-20 bg-victory-bg/95 backdrop-blur border-b border-victory-border">
        <header className="p-4 flex items-center gap-2 max-w-lg mx-auto">
          <button onClick={() => navigate(-1)} aria-label="Go back" className="w-11 h-11 -ml-2 flex items-center justify-center touch-target text-victory-muted hover:text-victory-text">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-heading font-extrabold text-victory-text">Callouts</h1>
            <p className="text-victory-muted text-sm">Beat a squad mate's best within 7 days and take their title</p>
          </div>
        </header>
      </div>

      <main className="max-w-lg mx-auto px-4 py-4 space-y-4">
        {!data && [0, 1].map((i) => <div key={i} className="skeleton-shimmer h-20 rounded-lg" />)}

        {empty && (
          <div className="flex flex-col items-center justify-center py-16 text-center px-6">
            <div className="w-16 h-16 rounded-2xl bg-victory-lime/10 border border-victory-lime/20 flex items-center justify-center mb-4">
              <Megaphone className="w-8 h-8 text-victory-lime/60" />
            </div>
            <p className="text-victory-text font-bold text-lg mb-1">No callouts yet</p>
            <p className="text-victory-muted text-sm">Hit a new personal best and you can call out your squad to beat it.</p>
            <button onClick={() => navigate("/train")} className="mt-4 victory-btn-primary w-auto px-6">Train now</button>
          </div>
        )}

        {data?.received.length > 0 && (
          <section className="space-y-2">
            <p className="section-label">Called out</p>
            {data.received.map((c) => (
              <div key={c.callout_id} className={`victory-card p-4 space-y-2 ${c.status === "open" ? "border-victory-lime/30" : ""}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-victory-text text-sm">
                    <span className="font-semibold">{c.challenger_name}</span> dares you to beat{" "}
                    <span className="font-heading font-bold">{c.dimension} <span className="font-mono text-victory-lime">{c.score}</span></span>
                  </p>
                </div>
                <StatusLine c={c} />
                {c.status === "open" && (
                  <div className="grid grid-cols-2 gap-2">
                    {c.accepted ? (
                      <span className="min-h-[44px] rounded-xl border border-victory-border flex items-center justify-center text-victory-muted text-sm">Accepted</span>
                    ) : (
                      <button onClick={() => accept(c)} className="victory-btn-ghost min-h-[44px] text-sm">Accept</button>
                    )}
                    <button onClick={() => train(c)} className="victory-btn-secondary min-h-[44px] text-sm flex items-center justify-center gap-1.5">
                      <Swords className="w-4 h-4" /> Train it
                    </button>
                  </div>
                )}
              </div>
            ))}
          </section>
        )}

        {data?.sent.length > 0 && (
          <section className="space-y-2">
            <p className="section-label">Your callouts</p>
            {data.sent.map((c) => (
              <div key={c.callout_id} className="victory-card p-4 space-y-1">
                <p className="text-victory-text text-sm font-heading font-bold">
                  {c.dimension} <span className="font-mono text-victory-lime">{c.score}</span>
                </p>
                <StatusLine c={c} mine />
                {c.status === "beaten" && (
                  <button onClick={() => train(c)} className="text-victory-lime text-xs font-heading font-bold touch-target">Win it back →</button>
                )}
              </div>
            ))}
          </section>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
