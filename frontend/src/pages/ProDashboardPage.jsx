import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Banknote, Film, Rocket, Sparkles, Store, Swords, Trash2, Truck } from "lucide-react";
import { API } from "@/App";
import { isNativeShell } from "@/lib/nativeShell";
import { CLIP_MOMENTS, ORDER_STATUS, gbp, uploadToCloudinary } from "@/lib/proShop";

const STYLES = [["tough_love", "Tough love"], ["supportive_mentor", "Supportive mentor"], ["analytical_technician", "Technician"],
  ["hype_man", "Hype man"], ["old_school_trainer", "Old-school trainer"]];

// A pro's home: get paid, list merch, ship orders, and let fans train with your alias.
// Bumps and Spotlight are digital promotions, so they're bought on the website (App Store 3.1.1).
export default function ProDashboardPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const native = isNativeShell();
  const [me, setMe] = useState(null);
  const [items, setItems] = useState([]);
  const [orders, setOrders] = useState([]);
  const [draft, setDraft] = useState({ title: "", description: "", price_gbp: "", shipping_gbp: "3.99", sizes: "S, M, L, XL", stock: "10", image_url: "" });
  const [uploading, setUploading] = useState(false);
  const [tracking, setTracking] = useState({});
  const [partner, setPartner] = useState({ consent: false, style: "tough_love", look: "", catchphrases: "" });

  const load = useCallback(async () => {
    const r = await axios.get(`${API}/pro/me`).catch(() => null);
    setMe(r?.data || { status: null });
    if (r?.data?.status === "verified") {
      const ap = r.data.alias_partner || {};
      setPartner((p) => ({ ...p, style: ap.style || p.style, look: ap.look || "", catchphrases: (ap.catchphrases || []).join("\n") }));
      axios.get(`${API}/merch`, { params: { seller_id: r.data.card.user_id } }).then((x) => setItems(x.data.items)).catch(() => {});
      axios.get(`${API}/pro/orders`).then((x) => setOrders(x.data.orders)).catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (params.get("payouts") === "done") axios.post(`${API}/pro/payouts/refresh`).finally(load);
    else load();
  }, [load, params]);

  const err = (e, fallback) => toast.error(e?.response?.data?.detail || fallback);
  const go = async (path, body = {}) => {
    try { const { data } = await axios.post(`${API}${path}`, { origin_url: window.location.origin, ...body }); window.location.href = data.url || data.checkout_url; }
    catch (e) { err(e, "Couldn't open that. Try again."); }
  };

  const uploadPhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try { setDraft((d) => ({ ...d, image_url: "" })); const url = await uploadToCloudinary(axios, API, file, "image"); setDraft((d) => ({ ...d, image_url: url })); }
    catch (x) { toast.error(`Photo upload failed: ${x.message}`); }
    setUploading(false);
  };

  const list = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/pro/merch`, { ...draft, price_gbp: Number(draft.price_gbp), shipping_gbp: Number(draft.shipping_gbp || 0),
        stock: Number(draft.stock || 0), sizes: draft.sizes.split(",").map((s) => s.trim()).filter(Boolean) });
      toast.success("Listed in the Fighter Market");
      setDraft((d) => ({ ...d, title: "", description: "", price_gbp: "", image_url: "" }));
      load();
    } catch (x) { err(x, "Couldn't list that. Try again."); }
  };

  const remove = async (id) => { await axios.delete(`${API}/pro/merch/${id}`).catch(() => {}); load(); };
  const ship = async (id) => {
    try { await axios.post(`${API}/pro/orders/${id}/shipped`, { tracking: tracking[id] || "" }); toast.success("Marked shipped. The buyer's been told."); load(); }
    catch (x) { err(x, "Couldn't update that order."); }
  };
  const savePartner = async (enabled) => {
    try {
      await axios.put(`${API}/pro/alias-partner`, { enabled, consent: partner.consent, style: partner.style, look: partner.look,
        catchphrases: partner.catchphrases.split("\n").map((s) => s.trim()).filter(Boolean) });
      toast.success(enabled ? "Fans can now train with your alias" : "Alias partner switched off");
      load();
    } catch (x) { err(x, "Couldn't save that."); }
  };
  const uploadClip = async (moment, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try { const url = await uploadToCloudinary(axios, API, file, "video"); await axios.put(`${API}/pro/clips`, { moment, url }); toast.success("Uploaded. Fans see it once we've approved it."); load(); }
    catch (x) { err(x, "Upload failed."); }
  };

  if (!me) return <div className="min-h-screen bg-victory-bg p-6"><div className="skeleton-shimmer h-40 rounded-lg" /></div>;

  const header = (
    <header className="p-4 flex items-center gap-3">
      <button onClick={() => navigate(-1)} aria-label="Back" className="w-11 h-11 flex items-center justify-center text-victory-muted"><ArrowLeft className="w-5 h-5" /></button>
      <h1 className="font-heading font-extrabold text-victory-text text-lg">Fighter dashboard</h1>
    </header>
  );
  if (me.status !== "verified") {
    return (
      <div className="min-h-screen bg-victory-bg">{header}
        <main className="px-4">
          <section className="victory-card p-4 space-y-2">
            {me.status === "pending" ? <p className="text-victory-text">Thanks! We're checking your details. You'll get a notification when your Fighter Card is live.</p>
              : me.status === "rejected" ? <p className="text-victory-text">We couldn't verify it yet{me.note ? `: ${me.note}` : "."}</p>
              : <p className="text-victory-text">Pro boxer? Get a verified Fighter Card with your alias, record and belts, plus your own merch shop.</p>}
            {me.status !== "pending" && <button className="victory-btn-primary" onClick={() => navigate("/pro/apply")}>Get your Fighter Card</button>}
          </section>
        </main>
      </div>
    );
  }

  const card = me.card;
  const ap = me.alias_partner || {};
  return (
    <div className="min-h-screen bg-victory-bg pb-12" data-testid="pro-dashboard">{header}
      <main className="px-4 space-y-5">
        <button className="victory-card p-4 w-full text-left" onClick={() => navigate(`/pro/${card.user_id}`)}>
          <p className="font-heading font-extrabold text-victory-lime text-2xl uppercase leading-none">{card.alias}</p>
          <p className="text-victory-muted text-sm">{card.ring_name} · {card.division} · <span className="font-mono">{card.record}</span></p>
          <p className="text-victory-lime text-xs mt-1">See your Fighter Card</p>
        </button>

        <section className="victory-card p-4 space-y-2">
          <p className="section-label flex items-center gap-1.5"><Banknote className="w-3 h-3" /> Payouts</p>
          {me.payouts_ready ? <p className="text-victory-text text-sm">Ready. You keep 100% of each item price and your delivery charge. Buyers pay a small Buyer Protection fee, and you're paid once they confirm it arrived (or 14 days after you ship).</p> : (
            <>
              <p className="text-victory-text text-sm">Set up payouts with Stripe so fans can buy your merch. It takes about 5 minutes and needs your ID and bank details.</p>
              <button className="victory-btn-primary" onClick={() => go("/pro/payouts/onboard")}>Set up payouts</button>
            </>
          )}
        </section>

        <section className="space-y-2">
          <p className="section-label flex items-center gap-1.5"><Store className="w-3 h-3" /> Your merch</p>
          {items.map((i) => (
            <div key={i.item_id} className="victory-card p-3 flex items-center gap-3">
              <img src={i.image_url} alt="" className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-victory-text text-sm font-semibold truncate">{i.title}</p>
                <p className="text-victory-muted text-xs">{gbp(i.price_gbp)} · {i.stock} left{i.bumped ? " · Bumped" : ""}</p>
              </div>
              {!native && !i.bumped && <button className="text-victory-lime text-xs font-semibold min-h-[44px] px-2 flex items-center gap-1" onClick={() => go(`/pro/merch/${i.item_id}/bump`)}><Rocket className="w-3.5 h-3.5" /> Bump £1.49</button>}
              <button aria-label="Remove" className="w-11 h-11 flex items-center justify-center text-victory-muted" onClick={() => remove(i.item_id)}><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
          <form onSubmit={list} className="victory-card p-4 space-y-3">
            <p className="text-victory-text font-semibold text-sm">List something</p>
            <label className="victory-btn-ghost min-h-[44px] text-sm flex items-center justify-center cursor-pointer">
              {uploading ? "Uploading…" : draft.image_url ? "Photo added ✓" : "Add a photo"}
              <input type="file" accept="image/*" className="hidden" onChange={uploadPhoto} />
            </label>
            <input aria-label="Title" className="victory-input" placeholder="Reaper hoodie" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} maxLength={60} />
            <textarea aria-label="Description" className="victory-input min-h-[72px]" placeholder="Heavyweight cotton, limited run" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} maxLength={600} />
            <div className="grid grid-cols-3 gap-2">
              <input aria-label="Price £" className="victory-input" inputMode="decimal" placeholder="Price £" value={draft.price_gbp} onChange={(e) => setDraft({ ...draft, price_gbp: e.target.value })} />
              <input aria-label="Delivery £" className="victory-input" inputMode="decimal" placeholder="Delivery £" value={draft.shipping_gbp} onChange={(e) => setDraft({ ...draft, shipping_gbp: e.target.value })} />
              <input aria-label="Stock" className="victory-input" inputMode="numeric" placeholder="Stock" value={draft.stock} onChange={(e) => setDraft({ ...draft, stock: e.target.value })} />
            </div>
            <input aria-label="Sizes" className="victory-input" placeholder="Sizes, e.g. S, M, L (leave empty for none)" value={draft.sizes} onChange={(e) => setDraft({ ...draft, sizes: e.target.value })} />
            <button className="victory-btn-primary" disabled={!draft.image_url || !draft.title || !draft.price_gbp}>List it</button>
          </form>
          {!native && (
            <button className="victory-card p-3 w-full flex items-center gap-3 text-left" onClick={() => go("/pro/spotlight")}>
              <Sparkles className="w-5 h-5 text-victory-orange flex-shrink-0" />
              <span className="flex-1 text-sm text-victory-text">Spotlight: put your shop first in the Fighter Market for 7 days</span>
              <span className="font-mono text-sm text-victory-lime">£5.99</span>
            </button>
          )}
        </section>

        <section className="space-y-2">
          <p className="section-label flex items-center gap-1.5"><Truck className="w-3 h-3" /> Orders</p>
          {orders.length === 0 ? <p className="text-victory-muted text-sm">No orders yet.</p> : orders.map((o) => (
            <div key={o.order_id} className="victory-card p-3 space-y-1.5">
              <p className="text-victory-text text-sm font-semibold">{o.title}{o.size ? ` (${o.size})` : ""} × {o.quantity}</p>
              <p className="text-victory-muted text-xs">{ORDER_STATUS[o.status] || o.status} · you get {gbp(o.seller_gets_gbp)}</p>
              {o.shipping && <p className="text-victory-text text-xs whitespace-pre-line">{[o.shipping.name, o.shipping.line1, o.shipping.line2, o.shipping.city, o.shipping.postal_code, o.shipping.country].filter(Boolean).join("\n")}</p>}
              {o.status === "paid" && (
                <div className="flex gap-2">
                  <input aria-label="Tracking number" className="victory-input flex-1" placeholder="Tracking number (optional)" value={tracking[o.order_id] || ""} onChange={(e) => setTracking({ ...tracking, [o.order_id]: e.target.value })} />
                  <button className="victory-btn-primary w-auto px-4 text-sm" onClick={() => ship(o.order_id)}>Shipped</button>
                </div>
              )}
            </div>
          ))}
        </section>

        <section className="victory-card p-4 space-y-3" data-testid="alias-partner-settings">
          <p className="section-label flex items-center gap-1.5"><Swords className="w-3 h-3" /> Fans train with {card.alias}</p>
          <p className="text-victory-text text-sm">Pro members can pick {card.alias} as their AI training partner, in your style and with your catchphrases.{ap.fans ? ` ${ap.fans} fans have picked you so far.` : ""}</p>
          {ap.avatar_url && <img src={ap.avatar_url} alt="" className="w-24 h-24 rounded-xl object-cover" />}
          <select aria-label="Coaching style" className="victory-input" value={partner.style} onChange={(e) => setPartner({ ...partner, style: e.target.value })}>
            {STYLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <input aria-label="Character look" className="victory-input" placeholder="How your character looks, e.g. hooded reaper in lime gloves" value={partner.look} onChange={(e) => setPartner({ ...partner, look: e.target.value })} maxLength={200} />
          <textarea aria-label="Catchphrases" className="victory-input min-h-[72px]" placeholder={"Catchphrases, one per line\nReap what you sow"} value={partner.catchphrases} onChange={(e) => setPartner({ ...partner, catchphrases: e.target.value })} />
          {!ap.enabled && (
            <label className="flex items-start gap-2 text-xs text-victory-text min-h-[44px]">
              <input type="checkbox" className="mt-1 accent-victory-lime" checked={partner.consent} onChange={(e) => setPartner({ ...partner, consent: e.target.checked })} />
              I agree that Victory AI can use my alias and an AI character based on it as a training partner for Pro members. I can switch it off at any time.
            </label>
          )}
          <div className="grid grid-cols-2 gap-2">
            {ap.enabled && <button className="victory-btn-ghost min-h-[44px] text-sm" onClick={() => savePartner(false)}>Switch off</button>}
            <button className="victory-btn-primary min-h-[44px] text-sm col-span-1" disabled={!ap.enabled && !partner.consent} onClick={() => savePartner(true)}>{ap.enabled ? "Save changes" : "Switch on"}</button>
          </div>
        </section>

        <section className="victory-card p-4 space-y-3">
          <p className="section-label flex items-center gap-1.5"><Film className="w-3 h-3" /> Talking clips</p>
          <p className="text-victory-text text-sm">Make short clips of your character talking (in Higgsfield or any video app) and upload them. They play for fans training with {card.alias} at these moments. We check each one before fans see it.</p>
          {CLIP_MOMENTS.map(([k, label]) => {
            const c = (me.clips || {})[k];
            return (
              <label key={k} className="flex items-center justify-between gap-2 min-h-[44px] cursor-pointer">
                <span className="text-sm text-victory-text">{label}</span>
                <span className="text-xs text-victory-lime font-semibold">{c ? (c.approved ? "Live ✓" : "Waiting for approval") : "Upload"}</span>
                <input type="file" accept="video/*" className="hidden" onChange={(e) => uploadClip(k, e)} />
              </label>
            );
          })}
        </section>
      </main>
    </div>
  );
}
