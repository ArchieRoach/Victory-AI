import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { ArrowLeft, RefreshCw, ShieldAlert } from "lucide-react";
import { API } from "@/App";
import { parseCard } from "@/lib/parseCard";

// Admin desk for deals agreed by email: sponsor a card, feature a promoter's show, grant a
// bought cosmetic, add an amateur card, and correct a result the feed couldn't map. Pro
// cards and results run on their own; this page is only for the human side of the deals.
const errMsg = (err) => {
  const d = err?.response?.data?.detail;
  return typeof d === "string" ? d : "That didn't work";
};

export default function FantasyAdminPage() {
  const navigate = useNavigate();
  const [cards, setCards] = useState(null);
  const [enquiries, setEnquiries] = useState([]);
  const [denied, setDenied] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, e] = await Promise.all([axios.get(`${API}/admin/fantasy/cards`), axios.get(`${API}/admin/fantasy/enquiries`)]);
      setCards(c.data);
      setEnquiries(e.data);
    } catch (err) {
      if (err?.response?.status === 403) setDenied(true);
      setCards([]);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const post = async (path, body, okText) => {
    try {
      const { data } = await axios.post(`${API}${path}`, body);
      toast.success(okText);
      load();
      return data;
    } catch (err) {
      toast.error(errMsg(err));
      return null;
    }
  };

  if (denied) {
    return (
      <div className="min-h-screen bg-victory-bg flex flex-col items-center justify-center text-center px-6">
        <div className="w-16 h-16 rounded-2xl bg-victory-lime/10 border border-victory-lime/20 flex items-center justify-center mb-4">
          <ShieldAlert className="w-8 h-8 text-victory-lime/60" />
        </div>
        <p className="text-victory-text font-bold text-lg mb-1">Admins only</p>
        <p className="text-victory-muted text-sm">Sign in with the admin account.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-victory-bg pb-8">
      <div className="sticky top-0 z-20 bg-victory-bg/95 backdrop-blur border-b border-victory-border">
        <header className="p-4 flex items-center gap-2">
          <button className="w-11 h-11 rounded-full flex items-center justify-center -ml-2" aria-label="Back" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5 text-victory-text" />
          </button>
          <h1 className="text-xl font-heading font-extrabold text-victory-text flex-1">Fantasy admin</h1>
          <button className="w-11 h-11 rounded-full flex items-center justify-center" aria-label="Sync from the data feed"
            onClick={() => post("/admin/fantasy/sync", {}, "Synced from the data feed")}>
            <RefreshCw className="w-5 h-5 text-victory-lime" />
          </button>
        </header>
      </div>

      <main className="max-w-2xl mx-auto px-4 py-4 space-y-6">
        <section className="space-y-2">
          <p className="section-label">Enquiries</p>
          {!enquiries.length && <p className="text-victory-muted text-sm">None yet.</p>}
          {enquiries.slice(0, 30).map((e, i) => (
            <div key={i} className="victory-card p-3 text-[12px] space-y-0.5">
              <p className="text-victory-text font-semibold">
                {e.kind === "cosmetic" ? `Cosmetic: ${e.cosmetic_id}` : `${e.kind}: ${e.company}`}
                <span className="text-victory-muted font-normal"> · {e.status} · {(e.created_at || "").slice(0, 10)}</span>
              </p>
              <p className="text-victory-muted">{e.email}{e.event_name ? ` · ${e.event_name}` : ""}</p>
              {e.message && <p className="text-victory-muted">{e.message}</p>}
              {e.kind === "cosmetic" && e.status !== "granted" && (
                <button className="victory-btn-secondary w-auto px-3 min-h-[44px] text-xs mt-1"
                  onClick={() => post("/admin/fantasy/cosmetics/grant", { email: e.email, cosmetic_id: e.cosmetic_id }, "Granted")}>
                  Paid — grant it
                </button>
              )}
            </div>
          ))}
        </section>

        <section className="space-y-2">
          <p className="section-label">Cards</p>
          {(cards || []).map((c) => <AdminCardRow key={c.card_id} card={c} post={post} />)}
        </section>

        <FeatureForm post={post} />
        <ManualCardForm post={post} />
      </main>
    </div>
  );
}

function AdminCardRow({ card, post }) {
  const [sponsor, setSponsor] = useState({ name: card.sponsor?.name || "", url: card.sponsor?.url || "" });
  const [open, setOpen] = useState(false);
  const [full, setFull] = useState(null);

  const expand = async () => {
    setOpen(!open);
    if (!full) {
      const { data } = await axios.get(`${API}/fantasy/cards/${card.card_id}`);
      setFull(data.card);
    }
  };

  return (
    <div className="victory-card p-3 text-[12px] space-y-2">
      <button className="w-full text-left" onClick={expand}>
        <p className="text-victory-text font-semibold">{card.title} <span className="text-victory-muted font-normal">· {card.status} · {card.reason} · {(card.date || "").slice(0, 10)}</span></p>
        <p className="text-victory-muted">{card.card_id}{card.featured ? " · featured" : ""}{card.sponsor?.name ? ` · ${card.sponsor.name}` : ""}</p>
      </button>
      {card.pending_review && (
        <button className="victory-btn-primary w-auto px-4" onClick={async () => {
          const r = await post(`/admin/fantasy/cards/${card.card_id}/publish`, {}, "Published — the promoter has their results link");
          if (r?.results_link) navigator.clipboard?.writeText(r.results_link).catch(() => {});
        }}>
          Checked — publish (promoter sent this)
        </button>
      )}
      {open && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input className="victory-input flex-1" placeholder="Sponsor name (blank removes)" value={sponsor.name} onChange={(e) => setSponsor({ ...sponsor, name: e.target.value })} />
            <input className="victory-input flex-1" placeholder="https://…" value={sponsor.url} onChange={(e) => setSponsor({ ...sponsor, url: e.target.value })} />
            <button className="victory-btn-secondary w-auto px-3" onClick={() => post(`/admin/fantasy/cards/${card.card_id}/sponsor`, { name: sponsor.name || null, url: sponsor.url || null }, "Sponsor saved")}>Save</button>
          </div>
          {card.source === "manual" && card.status === "upcoming" && (
            <button className="victory-btn-ghost w-auto px-3 min-h-[44px]" onClick={() => post(`/admin/fantasy/cards/${card.card_id}/start`, {}, "Picks locked")}>First bell — lock picks</button>
          )}
          {full?.bouts.map((b) => <ResultRow key={b.bout_id} bout={b} onSave={(body) => post(`/admin/fantasy/cards/${card.card_id}/bouts/${b.bout_id}/result`, body, "Result saved")} />)}
        </div>
      )}
    </div>
  );
}

export function ResultRow({ bout, onSave }) {
  const [r, setR] = useState({ winner_index: 0, method: "UD", round: bout.scheduled_rounds, clean_sweep: false });
  const noWinner = ["TD", "NC", "D"].includes(r.method);
  return (
    <div className="victory-card-highlight p-2 space-y-1">
      <p className="text-victory-text">{bout.fighters.map((f) => `${f.name} (${f.record}, ${f.salary})`).join(" vs ")}
        <span className="text-victory-muted"> · {bout.status}{bout.result ? ` · ${bout.result.method} R${bout.result.round}` : ""}</span></p>
      <div className="flex flex-wrap gap-2 items-center">
        <select className="victory-input w-auto" value={noWinner ? "" : r.winner_index} disabled={noWinner}
          onChange={(e) => setR({ ...r, winner_index: Number(e.target.value) })} aria-label="Winner">
          {bout.fighters.map((f, i) => <option key={f.fighter_id} value={i}>{f.name}</option>)}
        </select>
        <select className="victory-input w-auto" value={r.method} onChange={(e) => setR({ ...r, method: e.target.value })} aria-label="Method">
          {["KO", "TKO", "DQ", "UD", "SD", "MD", "TD", "NC", "D"].map((m) => <option key={m}>{m}</option>)}
        </select>
        <input type="number" className="victory-input w-20" min={1} max={bout.scheduled_rounds} value={r.round}
          onChange={(e) => setR({ ...r, round: Number(e.target.value) })} aria-label="Round" />
        <label className="flex items-center gap-1 text-victory-muted">
          <input type="checkbox" className="accent-victory-lime" checked={r.clean_sweep} onChange={(e) => setR({ ...r, clean_sweep: e.target.checked })} /> Won every round
        </label>
        <button className="victory-btn-secondary w-auto px-3"
          onClick={() => onSave({ ...r, winner_index: noWinner ? null : r.winner_index })}>
          Save result
        </button>
      </div>
    </div>
  );
}

function FeatureForm({ post }) {
  const [f, setF] = useState({ provider_event_id: "", card_id: "", promoter: "" });
  return (
    <section className="space-y-2">
      <p className="section-label">Promoter deal: feature a card</p>
      <p className="text-victory-muted text-[11px]">Use a card id from the list, or a Boxing Data event id to import any show (even outside the UK).</p>
      <div className="flex flex-wrap gap-2">
        <input className="victory-input flex-1" placeholder="Card id (fc_… / fm_…)" value={f.card_id} onChange={(e) => setF({ ...f, card_id: e.target.value })} />
        <input className="victory-input flex-1" placeholder="or Boxing Data event id" value={f.provider_event_id} onChange={(e) => setF({ ...f, provider_event_id: e.target.value })} />
        <input className="victory-input flex-1" placeholder="Promoter name" value={f.promoter} onChange={(e) => setF({ ...f, promoter: e.target.value })} />
        <button className="victory-btn-secondary w-auto px-3"
          onClick={() => post("/admin/fantasy/feature", { card_id: f.card_id || null, provider_event_id: f.provider_event_id || null, promoter: f.promoter || null }, "Card featured")}>
          Feature
        </button>
      </div>
    </section>
  );
}

const emptyFighter = () => ({ name: "", wins: 0, losses: 0, draws: 0, ko_wins: 0 });
const emptyBout = () => ({ division: "", scheduled_rounds: 3, fighters: [emptyFighter(), emptyFighter()] });

function ManualCardForm({ post }) {
  const [card, setCard] = useState({ title: "", date: "", location: "", venue: "", amateur: true, promoter: "", bouts: [emptyBout(), emptyBout()] });
  const setBout = (i, patch) => setCard((c) => ({ ...c, bouts: c.bouts.map((b, j) => (j === i ? { ...b, ...patch } : b)) }));
  const setFighter = (i, k, patch) => setBout(i, { fighters: card.bouts[i].fighters.map((f, j) => (j === k ? { ...f, ...patch } : f)) });

  const submit = async () => {
    const ok = await post("/admin/fantasy/cards", { ...card, promoter: card.promoter || null }, "Card created — prices worked out from the records");
    if (ok) setCard({ ...card, title: "", bouts: [emptyBout(), emptyBout()] });
  };

  return (
    <section className="space-y-2">
      <p className="section-label">Add an amateur (or off-feed) card</p>
      <p className="text-victory-muted text-[11px]">Type each boxer's record from the club or promoter sheet, or paste the card below. Prices use the same formula as pro cards.</p>
      <textarea className="victory-input min-h-[88px] py-3 font-mono text-[12px]" aria-label="Paste a fight card"
        placeholder={"Paste a card: one fight per line\nLee Smith (8-0) vs Kay Jones (3-5-1), 6 rounds"}
        onBlur={(e) => {
          const { bouts, skipped } = parseCard(e.target.value, 3);
          if (!bouts.length) return;
          setCard((c) => ({ ...c, bouts }));
          toast(`${bouts.length} fights filled in${skipped.length ? ` · ${skipped.length} line(s) skipped` : ""}`);
        }} />
      <div className="grid grid-cols-2 gap-2">
        <input className="victory-input" placeholder="Title" value={card.title} onChange={(e) => setCard({ ...card, title: e.target.value })} />
        <input className="victory-input" type="date" value={card.date} onChange={(e) => setCard({ ...card, date: e.target.value })} aria-label="Date" />
        <input className="victory-input" placeholder="Town, England" value={card.location} onChange={(e) => setCard({ ...card, location: e.target.value })} />
        <input className="victory-input" placeholder="Promoter (optional)" value={card.promoter} onChange={(e) => setCard({ ...card, promoter: e.target.value })} />
      </div>
      {card.bouts.map((b, i) => (
        <div key={i} className="victory-card p-2 space-y-1">
          <div className="flex gap-2">
            <input className="victory-input flex-1" placeholder="Division" value={b.division} onChange={(e) => setBout(i, { division: e.target.value })} />
            <input className="victory-input w-20" type="number" min={1} max={12} value={b.scheduled_rounds} onChange={(e) => setBout(i, { scheduled_rounds: Number(e.target.value) })} aria-label="Rounds" />
          </div>
          {b.fighters.map((f, k) => (
            <div key={k} className="flex gap-1">
              <input className="victory-input flex-1" placeholder={`Boxer ${k + 1}`} value={f.name} onChange={(e) => setFighter(i, k, { name: e.target.value })} />
              {["wins", "losses", "draws", "ko_wins"].map((field) => (
                <input key={field} className="victory-input w-14" type="number" min={0} value={f[field]} aria-label={field}
                  title={field} onChange={(e) => setFighter(i, k, { [field]: Number(e.target.value) })} />
              ))}
            </div>
          ))}
        </div>
      ))}
      <div className="flex gap-2">
        <button className="victory-btn-ghost w-auto px-3" onClick={() => setCard({ ...card, bouts: [...card.bouts, emptyBout()] })}>Add bout</button>
        <button className="victory-btn-primary w-auto px-6" onClick={submit}>Create card</button>
      </div>
    </section>
  );
}
