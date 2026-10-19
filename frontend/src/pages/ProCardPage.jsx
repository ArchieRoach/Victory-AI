import { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, BadgeCheck, Instagram, ShieldCheck, Swords, Trophy } from "lucide-react";
import { API, useAuth } from "@/App";
import { MerchSheet } from "@/components/pro/MerchSheet";
import { gbp } from "@/lib/proShop";

// The Fighter Card: the alias is the headline, because that's the fighter's brand.
export default function ProCardPage() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    axios.get(`${API}/pros/${userId}`).then((r) => setData(r.data)).catch(() => setData(false));
  }, [userId]);

  if (data === false) return <div className="min-h-screen bg-victory-bg p-6 text-victory-muted">Fighter not found.</div>;
  if (!data) return <div className="min-h-screen bg-victory-bg p-6"><div className="skeleton-shimmer h-48 rounded-lg" /></div>;
  const f = data.fighter;
  const isMe = user?.user_id === f.user_id;

  const trainWith = async () => {
    setBusy(true);
    try {
      await axios.post(`${API}/pro/${f.user_id}/train-with`);
      await refreshUser?.();
      toast.success(`${f.alias} is now your training partner`);
      navigate("/train");
    } catch (e) {
      if (e?.response?.status === 402) navigate("/paywall");
      else toast.error(e?.response?.data?.detail || "Couldn't switch partner. Try again.");
    }
    setBusy(false);
  };

  return (
    <div className="min-h-screen bg-victory-bg pb-10" data-testid="pro-card">
      <header className="p-4 flex items-center justify-between">
        <button onClick={() => navigate(-1)} aria-label="Back" className="w-11 h-11 flex items-center justify-center text-victory-muted"><ArrowLeft className="w-5 h-5" /></button>
        {isMe && <button className="text-victory-lime text-sm font-semibold min-h-[44px]" onClick={() => navigate("/pro/dashboard")}>Manage</button>}
      </header>
      <main className="px-4 space-y-5">
        <section className="text-center space-y-2">
          {f.picture && <img src={f.picture} alt="" className="w-24 h-24 rounded-full object-cover mx-auto border-2 border-victory-lime" />}
          <h1 className="font-heading font-extrabold text-victory-lime text-3xl uppercase tracking-wide leading-none">{f.alias}</h1>
          <p className="text-victory-text font-semibold flex items-center justify-center gap-1.5">{f.ring_name} {f.verified && <BadgeCheck className="w-4 h-4 text-victory-teal" aria-label="Verified pro" />}</p>
          <p className="text-victory-muted text-sm">{f.division} · <span className="font-mono">{f.record}</span></p>
          {f.titles.length > 0 && (
            <div className="flex flex-wrap justify-center gap-1.5 pt-1">
              {f.titles.map((t) => <span key={t} className="text-[11px] px-2.5 py-1 rounded-full bg-victory-lime/10 text-victory-lime border border-victory-lime/30 flex items-center gap-1"><Trophy className="w-3 h-3" /> {t}</span>)}
            </div>
          )}
          {f.bio && <p className="text-victory-text text-sm max-w-md mx-auto">{f.bio}</p>}
          <div className="flex justify-center gap-4 text-xs">
            {f.instagram && <a href={`https://instagram.com/${f.instagram}`} target="_blank" rel="noreferrer" className="text-victory-muted flex items-center gap-1 min-h-[44px]"><Instagram className="w-4 h-4" /> @{f.instagram}</a>}
            {f.boxrec_url && <a href={f.boxrec_url} target="_blank" rel="noreferrer" className="text-victory-muted min-h-[44px] flex items-center">BoxRec</a>}
          </div>
        </section>

        {f.alias_partner && !isMe && (
          <section className="victory-card p-4 flex items-center gap-3 border-victory-lime/40" data-testid="train-with">
            {f.alias_partner.avatar_url && <img src={f.alias_partner.avatar_url} alt="" className="w-16 h-16 rounded-xl object-cover flex-shrink-0" />}
            <div className="flex-1 min-w-0">
              <p className="text-victory-text font-heading font-bold">Train with {f.alias}</p>
              <p className="text-victory-muted text-xs">Make {f.alias} your AI training partner. A Pro feature.</p>
            </div>
            <button className="victory-btn-primary w-auto px-4 min-h-[44px] text-sm" disabled={busy} onClick={trainWith}><Swords className="w-4 h-4" /></button>
          </section>
        )}

        <section className="space-y-2">
          <p className="section-label">Shop</p>
          {data.merch.length === 0 ? <p className="text-victory-muted text-sm">No merch yet.</p> : (
            <div className="grid grid-cols-2 gap-3">
              {data.merch.map((i) => (
                <button key={i.item_id} onClick={() => setOpen(i)} className="victory-card overflow-hidden text-left">
                  <img src={i.image_url} alt={i.title} className="w-full aspect-square object-cover" loading="lazy" />
                  <div className="p-2.5">
                    <p className="text-victory-text text-sm font-semibold truncate">{i.title}</p>
                    <p className="font-mono text-victory-lime text-sm font-bold">{gbp(i.price_gbp)}</p>
                    <p className="text-victory-muted text-[10px] flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Buyer Protection</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </main>
      {open && <MerchSheet item={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
