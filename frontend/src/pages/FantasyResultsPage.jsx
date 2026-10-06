import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Bell, ShieldAlert } from "lucide-react";
import { API } from "@/App";
import { ResultRow } from "@/pages/FantasyAdminPage";

// The promoter's private results desk for their own show (link emailed when the card is
// published). Results come from the people at ringside, at no data-feed cost, and players'
// scores update as each bout finishes.
export default function FantasyResultsPage() {
  const { cardId } = useParams();
  const [params] = useSearchParams();
  const t = params.get("t") || "";
  const [card, setCard] = useState(null);
  const [bad, setBad] = useState(false);

  const load = useCallback(
    () => axios.get(`${API}/fantasy/promoter/${cardId}`, { params: { t } }).then((r) => setCard(r.data)).catch(() => setBad(true)),
    [cardId, t],
  );
  useEffect(() => { load(); }, [load]);

  const post = async (path, body, ok) => {
    try {
      await axios.post(`${API}/fantasy/promoter/${cardId}${path}`, body, { params: { t } });
      toast.success(ok);
      load();
    } catch (e) {
      const d = e?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "That didn't save — try again");
    }
  };

  if (bad) {
    return (
      <div className="min-h-screen bg-victory-bg flex flex-col items-center justify-center text-center px-6">
        <div className="w-16 h-16 rounded-2xl bg-victory-lime/10 border border-victory-lime/20 flex items-center justify-center mb-4">
          <ShieldAlert className="w-8 h-8 text-victory-lime/60" />
        </div>
        <p className="text-victory-text font-bold text-lg mb-1">Link not recognised</p>
        <p className="text-victory-muted text-sm">Use the link from your Victory Fantasy email, or email hello@victoryai.co.uk.</p>
      </div>
    );
  }
  if (!card) return <div className="min-h-screen bg-victory-bg p-4"><div className="skeleton-shimmer h-24 rounded-lg" /></div>;

  return (
    <div className="min-h-screen bg-victory-bg pb-8">
      <div className="sticky top-0 z-20 bg-victory-bg/95 backdrop-blur border-b border-victory-border">
        <header className="p-4">
          <h1 className="text-xl font-heading font-extrabold text-victory-text">{card.title}</h1>
          <p className="text-victory-muted text-sm">Results desk · {card.status === "upcoming" ? "picks open" : card.status === "live" ? "picks locked" : "finished"}</p>
        </header>
      </div>
      <main className="max-w-lg mx-auto px-4 py-4 space-y-3">
        {card.hidden && <p className="victory-card p-3 text-[12px] text-victory-muted">We're still checking your card. You'll get an email when it's live.</p>}
        {!card.hidden && card.status === "upcoming" && (
          <button className="victory-btn-primary w-full flex items-center justify-center gap-2" onClick={() => post("/start", {}, "Picks locked — good luck tonight")}>
            <Bell className="w-4 h-4" /> First bell — lock picks
          </button>
        )}
        {!card.hidden && card.status !== "upcoming" && card.bouts.map((b) => (
          <ResultRow key={b.bout_id} bout={b} onSave={(body) => post(`/bouts/${b.bout_id}/result`, body, "Result saved")} />
        ))}
        <p className="text-[11px] text-victory-muted">Keep this link private: anyone with it can enter results. Made a mistake? Save the right result again, or email hello@victoryai.co.uk.</p>
      </main>
    </div>
  );
}
