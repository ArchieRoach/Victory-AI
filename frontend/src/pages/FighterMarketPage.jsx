import { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, BadgeCheck, ShieldCheck, Sparkles, Store } from "lucide-react";
import { API } from "@/App";
import { BottomNav } from "@/components/BottomNav";
import { MerchSheet } from "@/components/pro/MerchSheet";
import { gbp } from "@/lib/proShop";

// Goal: fans find their fighters and buy their merch; pros get a reason to be here.
// Psychology: liking and identity: people buy from fighters they follow, and wearing the
//   alias is showing who you back. Trust (Buyer Protection) removes the risk of paying a stranger.
// Design: verified pros up top (Spotlight first), then merch (bumped first), each showing the
//   price and the protection fee up front: no surprises at checkout.
export default function FighterMarketPage() {
  const navigate = useNavigate();
  const [pros, setPros] = useState(null);
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    axios.get(`${API}/pros`).then((r) => setPros(r.data.pros)).catch(() => setPros([]));
    axios.get(`${API}/merch`).then((r) => setItems(r.data.items)).catch(() => setItems([]));
  }, []);

  return (
    <div className="min-h-screen bg-victory-bg pb-nav" data-testid="fighter-market">
      <header className="p-4 flex items-center gap-3 sticky top-0 material-header z-10">
        <button onClick={() => navigate(-1)} aria-label="Back" className="w-11 h-11 flex items-center justify-center text-victory-muted">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="font-heading font-extrabold text-victory-text text-lg leading-none">Fighter Market</h1>
          <p className="text-victory-muted text-xs">Pro fighters and their merch</p>
        </div>
      </header>

      <main className="px-4 space-y-5">
        <section className="space-y-2">
          <p className="section-label flex items-center gap-1.5"><BadgeCheck className="w-3 h-3" /> Verified pros</p>
          {pros === null ? <div className="skeleton-shimmer h-24 rounded-lg" /> : pros.length === 0 ? (
            <p className="text-victory-muted text-sm">No verified pros yet. Are you one? <button className="text-victory-lime font-semibold" onClick={() => navigate("/pro/apply")}>Get your Fighter Card</button></p>
          ) : (
            <div className="flex gap-3 overflow-x-auto -mx-4 px-4 pb-1">
              {pros.map((p) => (
                <button key={p.user_id} onClick={() => navigate(`/pro/${p.user_id}`)}
                  className="victory-card p-3 w-36 flex-shrink-0 text-left space-y-1" data-testid="pro-tile">
                  {p.picture ? <img src={p.picture} alt="" className="w-12 h-12 rounded-full object-cover" /> :
                    <div className="w-12 h-12 rounded-full bg-victory-card-highlight" />}
                  <p className="text-victory-text font-heading font-extrabold text-sm leading-tight truncate">{p.alias}</p>
                  <p className="text-victory-muted text-[11px] truncate">{p.ring_name}</p>
                  <p className="text-victory-muted text-[11px]">{p.division} · <span className="font-mono">{p.record}</span></p>
                  {p.spotlight && <span className="text-[10px] text-victory-orange font-bold flex items-center gap-1"><Sparkles className="w-3 h-3" /> Spotlight</span>}
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-2">
          <p className="section-label flex items-center gap-1.5"><Store className="w-3 h-3" /> Merch</p>
          {items.length === 0 ? <p className="text-victory-muted text-sm">Nothing for sale yet.</p> : (
            <div className="grid grid-cols-2 gap-3">
              {items.map((i) => (
                <button key={i.item_id} onClick={() => setOpen(i)} className="victory-card overflow-hidden text-left" data-testid="merch-tile">
                  <img src={i.image_url} alt={i.title} className="w-full aspect-square object-cover" loading="lazy" />
                  <div className="p-2.5 space-y-0.5">
                    <p className="text-victory-text text-sm font-semibold truncate">{i.title}</p>
                    <p className="text-victory-muted text-[11px] truncate">{i.alias}</p>
                    <p className="font-mono text-victory-lime text-sm font-bold">{gbp(i.price_gbp)}</p>
                    <p className="text-victory-muted text-[10px] flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> +{gbp(i.buyer_protection_gbp)} Buyer Protection</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </main>
      {open && <MerchSheet item={open} onClose={() => setOpen(null)} />}
      <BottomNav />
    </div>
  );
}
