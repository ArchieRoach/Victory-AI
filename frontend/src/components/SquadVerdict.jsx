import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { API } from "@/App";
import { toast } from "sonner";
import { Users, Lock, Send, Gavel } from "lucide-react";
import { STAMPS, stampByKey } from "@/lib/stamps";
import { analytics } from "@/lib/analytics";

// Owner-only panel on a ready highlight: send it to the squad, then watch stamps come in.
// The overall verdict stays hidden until enough of the squad has weighed in — the open
// loop is what brings the fighter back.
export function SquadVerdict({ highlightId, sentToSquad = 0 }) {
  const [data,    setData]    = useState(null);
  const [sending, setSending] = useState(false);
  const [sent,    setSent]    = useState(sentToSquad > 0);

  const load = useCallback(() => {
    axios.get(`${API}/highlights/${highlightId}/stamps`).then((r) => setData(r.data)).catch(() => {});
  }, [highlightId]);

  useEffect(() => { if (sent) load(); }, [sent, load]);

  const send = async () => {
    setSending(true);
    try {
      const res = await axios.post(`${API}/highlights/${highlightId}/send-to-squad`);
      setSent(true);
      toast.success(`Sent to ${res.data.sent_to} squad ${res.data.sent_to === 1 ? "mate" : "mates"}`);
      analytics.capture("round_sent_to_squad", { squad_size: res.data.sent_to });
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Couldn't send to your squad");
    }
    setSending(false);
  };

  if (!sent) {
    return (
      <button onClick={send} disabled={sending} className="victory-btn-secondary flex items-center justify-center gap-2 disabled:opacity-50">
        <Send className="w-4 h-4" /> {sending ? "Sending…" : "Get your squad's verdict"}
      </button>
    );
  }
  if (!data) return <div className="skeleton-shimmer h-24 rounded-xl" />;

  const verdictStamp = data.verdict && stampByKey(data.verdict.stamp);
  return (
    <section className="victory-card p-4 space-y-3" data-testid="squad-verdict">
      <div className="flex items-center justify-between">
        <p className="section-label flex items-center gap-1.5"><Users className="w-3 h-3" /> Squad verdict</p>
        <span className="text-victory-muted text-[11px] font-mono">{data.count}/{data.sent_to} reacted</span>
      </div>

      {verdictStamp ? (
        <div className="flex items-center gap-3 animate-scale-in">
          <div className="w-11 h-11 rounded-2xl bg-victory-lime flex items-center justify-center flex-shrink-0">
            <Gavel className="w-5 h-5 text-victory-bg" />
          </div>
          <div>
            <p className="text-victory-text font-heading font-extrabold">{verdictStamp.label}</p>
            <p className="text-victory-muted text-xs">{data.verdict.count} of {data.count} said it</p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-victory-card-highlight border border-victory-border flex items-center justify-center flex-shrink-0">
            <Lock className="w-5 h-5 text-victory-muted" />
          </div>
          <p className="text-victory-text text-sm">
            <span className="font-mono text-victory-lime font-bold">{data.verdict_in}</span> more {data.verdict_in === 1 ? "reaction" : "reactions"} to unlock the verdict
          </p>
        </div>
      )}

      {data.count > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {STAMPS.filter((s) => data.tally[s.key] > 0).map(({ key, label, icon: Icon }) => (
            <span key={key} className="flex items-center gap-1 bg-victory-card-highlight border border-victory-border rounded-full px-2.5 py-1 text-xs text-victory-text">
              <Icon className="w-3 h-3 text-victory-lime" /> {label} <span className="font-mono text-victory-muted">{data.tally[key]}</span>
            </span>
          ))}
        </div>
      )}

      {(data.reactions || []).length > 0 && (
        <ul className="space-y-1.5">
          {data.reactions.map((r) => (
            <li key={r.user.user_id} className="text-xs text-victory-muted">
              <span className="text-victory-text font-semibold">{r.user.display_name || r.user.name}</span> · {r.label}
              {r.comment && <span className="text-victory-text"> — “{r.comment}”</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
