import { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Package } from "lucide-react";
import { API } from "@/App";
import { ORDER_STATUS, gbp } from "@/lib/proShop";

export default function OrdersPage() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState(null);
  const [issueFor, setIssueFor] = useState(null);
  const [reason, setReason] = useState("");

  const load = () => axios.get(`${API}/orders/mine`).then((r) => setOrders(r.data.orders)).catch(() => setOrders([]));
  useEffect(() => { load(); }, []);

  const received = async (o) => {
    try { await axios.post(`${API}/orders/${o.order_id}/received`); toast.success("Thanks! The fighter's been paid."); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Couldn't update that. Try again."); }
  };
  const report = async () => {
    try { await axios.post(`${API}/orders/${issueFor}/issue`, { reason }); toast.success("Got it. We'll sort it out."); setIssueFor(null); setReason(""); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Couldn't send that. Try again."); }
  };

  return (
    <div className="min-h-screen bg-victory-bg" data-testid="orders-page">
      <header className="p-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} aria-label="Back" className="w-11 h-11 flex items-center justify-center text-victory-muted"><ArrowLeft className="w-5 h-5" /></button>
        <h1 className="font-heading font-extrabold text-victory-text text-lg">Your orders</h1>
      </header>
      <main className="px-4 space-y-3 pb-8">
        {orders === null ? <div className="skeleton-shimmer h-24 rounded-lg" /> : orders.length === 0 ? (
          <div className="victory-card p-6 text-center space-y-2">
            <Package className="w-8 h-8 text-victory-muted mx-auto" />
            <p className="text-victory-text font-semibold">No orders yet</p>
            <button className="text-victory-lime font-semibold text-sm min-h-[44px]" onClick={() => navigate("/shop")}>Visit the Fighter Market</button>
          </div>
        ) : orders.map((o) => (
          <section key={o.order_id} className="victory-card p-3 space-y-2">
            <div className="flex gap-3">
              {o.image_url && <img src={o.image_url} alt="" className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />}
              <div className="min-w-0">
                <p className="text-victory-text font-semibold text-sm truncate">{o.title}{o.size ? ` (${o.size})` : ""}</p>
                <p className="text-victory-muted text-xs">{o.alias} · {gbp(o.total_gbp)}</p>
                <p className="text-victory-text text-xs mt-1">{ORDER_STATUS[o.status] || o.status}</p>
                {o.tracking && <p className="text-victory-muted text-xs">Tracking: <span className="font-mono">{o.tracking}</span></p>}
              </div>
            </div>
            {o.status === "shipped" && (
              <div className="grid grid-cols-2 gap-2">
                <button className="victory-btn-ghost min-h-[44px] text-sm" onClick={() => setIssueFor(o.order_id)}>There's a problem</button>
                <button className="victory-btn-primary min-h-[44px] text-sm" onClick={() => received(o)}>Got it, all good</button>
              </div>
            )}
            {o.status === "paid" && <button className="text-victory-muted text-xs min-h-[44px]" onClick={() => setIssueFor(o.order_id)}>Report a problem</button>}
          </section>
        ))}
        {issueFor && (
          <section className="victory-card p-3 space-y-2">
            <label htmlFor="issue" className="victory-label">What's wrong?</label>
            <textarea id="issue" className="victory-input min-h-[88px]" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
            <div className="grid grid-cols-2 gap-2">
              <button className="victory-btn-ghost min-h-[44px] text-sm" onClick={() => setIssueFor(null)}>Cancel</button>
              <button className="victory-btn-primary min-h-[44px] text-sm" disabled={reason.trim().length < 5} onClick={report}>Send</button>
            </div>
            <p className="text-victory-muted text-[11px]">Your money stays held until this is sorted.</p>
          </section>
        )}
      </main>
    </div>
  );
}
