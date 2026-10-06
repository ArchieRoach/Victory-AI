import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { ArrowLeft, Handshake, Megaphone, ShieldCheck, Check } from "lucide-react";
import { API } from "@/App";

// Goal: turn promoters and brands into revenue without charging a single player.
// Psychology: a short form that says exactly what happens next ("we reply by email")
//   gets more replies than a pricing page. The halal rule is stated up front, so the
//   wrong sponsors filter themselves out.
// Design: two choices (promoter / sponsor), five fields, and a hidden honeypot. It sends
//   an email to the admin inbox, where every deal is agreed by hand.
const KINDS = [
  { key: "promoter", icon: Megaphone, title: "Feature my show", text: "Your card on top of the fixture list, with your name on it." },
  { key: "sponsor", icon: Handshake, title: "Sponsor a league", text: "\"Presented by\" on a card's game and leaderboard." },
];

export default function FantasyPartnersPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ kind: "promoter", name: "", company: "", email: "", event_name: "", message: "", halal_confirmed: false, website: "" });
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await axios.post(`${API}/fantasy/enquiries`, form);
      setSent(true);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Check the form and try again.");
    }
    setBusy(false);
  };

  return (
    <div className="min-h-screen bg-victory-bg">
      <div className="sticky top-0 z-20 bg-victory-bg/95 backdrop-blur border-b border-victory-border">
        <header className="p-4 flex items-center gap-2">
          <button className="w-11 h-11 rounded-full flex items-center justify-center -ml-2" aria-label="Back" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5 text-victory-text" />
          </button>
          <div>
            <h1 className="text-xl font-heading font-extrabold text-victory-text">Partner with Victory Fantasy</h1>
            <p className="text-victory-muted text-sm">For promoters and brands</p>
          </div>
        </header>
      </div>

      <main className="max-w-lg mx-auto px-4 py-4 space-y-4">
        {sent ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-6">
            <div className="w-16 h-16 rounded-2xl bg-victory-lime/10 border border-victory-lime/20 flex items-center justify-center mb-4">
              <Check className="w-8 h-8 text-victory-lime/60" />
            </div>
            <p className="text-victory-text font-bold text-lg mb-1">Thanks — we'll be in touch</p>
            <p className="text-victory-muted text-sm">We reply from hello@victoryai.co.uk, usually within two working days.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {KINDS.map(({ key, icon: Icon, title, text }) => (
                <button type="button" key={key} onClick={() => setForm((f) => ({ ...f, kind: key }))}
                  className={`victory-card p-3 text-left flex flex-col items-start gap-1 ${form.kind === key ? "border-victory-lime/40 bg-victory-lime/5" : ""}`}>
                  <Icon className="w-4 h-4 text-victory-lime" />
                  <p className="text-victory-text text-sm font-semibold">{title}</p>
                  <p className="text-victory-muted text-[11px] leading-snug">{text}</p>
                </button>
              ))}
            </div>

            <div className="victory-card p-3 text-[11px] text-victory-muted flex gap-2">
              <ShieldCheck className="w-4 h-4 text-victory-teal flex-shrink-0" />
              <span>The game is free, with no prizes paid for by players. We don't work with gambling, alcohol or interest-based lending brands, and sponsors never change prices or points.</span>
            </div>

            <label className="victory-label" htmlFor="fp-name">Your name</label>
            <input id="fp-name" className="victory-input" required minLength={2} maxLength={80} value={form.name} onChange={set("name")} />
            <label className="victory-label" htmlFor="fp-company">{form.kind === "promoter" ? "Promotion" : "Company"}</label>
            <input id="fp-company" className="victory-input" required minLength={2} maxLength={120} value={form.company} onChange={set("company")} />
            <label className="victory-label" htmlFor="fp-email">Email</label>
            <input id="fp-email" type="email" className="victory-input" required value={form.email} onChange={set("email")} />
            <label className="victory-label" htmlFor="fp-event">Show or date (optional)</label>
            <input id="fp-event" className="victory-input" maxLength={120} value={form.event_name} onChange={set("event_name")} />
            <label className="victory-label" htmlFor="fp-msg">Anything else</label>
            <textarea id="fp-msg" className="victory-input min-h-[96px] py-3" maxLength={1500} value={form.message} onChange={set("message")} />
            <input type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" value={form.website} onChange={set("website")} />

            {form.kind === "sponsor" && (
              <label className="flex items-start gap-2 text-[12px] text-victory-text min-h-[44px]">
                <input type="checkbox" className="mt-1 accent-victory-lime" checked={form.halal_confirmed} onChange={set("halal_confirmed")} required />
                My brand isn't in gambling, alcohol or interest-based lending.
              </label>
            )}

            <button type="submit" className="victory-btn-primary w-full" disabled={busy}>{busy ? "Sending…" : "Send enquiry"}</button>
          </form>
        )}
      </main>
    </div>
  );
}
