import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { ArrowLeft, Handshake, Megaphone, ShieldCheck, Check } from "lucide-react";
import { API } from "@/App";
import { parseCard } from "@/lib/parseCard";
import { tx } from "@/i18n/tx";

// Goal: turn promoters and brands into revenue without charging a single player.
// Psychology: a short form that says exactly what happens next ("we reply by email")
//   gets more replies than a pricing page. The halal rule is stated up front, so the
//   wrong sponsors filter themselves out.
// Design: two choices (promoter / sponsor), five fields, and a hidden honeypot. It sends
//   an email to the admin inbox, where every deal is agreed by hand.
const KINDS = [
  { key: "promoter", icon: Megaphone, get title() { return tx("ui.fantasyPartnersPage.featureMyShow", "Feature my show"); }, get text() { return tx("ui.fantasyPartnersPage.yourCardOnTop", "Your card on top of the fixture list, with your name on it."); } },
  { key: "sponsor", icon: Handshake, get title() { return tx("ui.fantasyPartnersPage.sponsorALeague", "Sponsor a league"); }, get text() { return tx("ui.fantasyPartnersPage.presentedByOnA", "\"Presented by\" on a card's game and leaderboard."); } },
];

export default function FantasyPartnersPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ kind: "promoter", name: "", company: "", email: "", event_name: "", message: "", halal_confirmed: false, website: "" });
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [params] = useSearchParams();
  const promoterKey = params.get("promoter");
  const [card, setCard] = useState({ date: "", location: "", text: "" });
  const parsed = parseCard(card.text);
  const sendCard = form.kind === "promoter" && card.date && parsed.bouts.length > 0;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await axios.post(`${API}/fantasy/enquiries`, {
        ...form, kind: promoterKey ? "promoter" : form.kind, promoter_key: promoterKey || null,
        card: sendCard ? { date: card.date, location: card.location, bouts: parsed.bouts } : null,
      });
      if (promoterKey && sendCard) toast.success(tx("ui.fantasyPartnersPage.yourCardIsLive", "Your card is live in the fixture list!"));
      setSent(true);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : tx("ui.fantasyPartnersPage.checkTheFormAnd", "Check the form and try again."));
    }
    setBusy(false);
  };

  return (
    <div className="min-h-screen bg-victory-bg">
      <div className="sticky top-0 z-20 material-header">
        <header className="p-4 flex items-center gap-2">
          <button className="w-11 h-11 rounded-full flex items-center justify-center -ml-2" aria-label={tx("ui.fantasyPartnersPage.back", "Back")} onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5 text-victory-text" />
          </button>
          <div>
            <h1 className="text-xl font-heading font-extrabold text-victory-text">{tx("ui.fantasyPartnersPage.partnerWithVictoryFantasy", "Partner with Victory Fantasy")}</h1>
            <p className="text-victory-muted text-sm">{tx("ui.fantasyPartnersPage.forPromotersAndBrands", "For promoters and brands")}</p>
          </div>
        </header>
      </div>

      <main className="max-w-lg mx-auto px-4 py-4 space-y-4">
        {sent ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-6">
            <div className="w-16 h-16 rounded-2xl bg-victory-lime/10 border border-victory-lime/20 flex items-center justify-center mb-4">
              <Check className="w-8 h-8 text-victory-lime/60" />
            </div>
            <p className="text-victory-text font-bold text-lg mb-1">{tx("ui.fantasyPartnersPage.thanksWeLlBe", "Thanks — we'll be in touch")}</p>
            <p className="text-victory-muted text-sm">{tx("ui.fantasyPartnersPage.weReplyFromHello", "We reply from hello@victoryai.co.uk, usually within two working days.")}</p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            {promoterKey && (
              <div className="victory-card p-3 text-[12px] text-victory-teal border-victory-teal/30" data-testid="trusted-promoter">
                {tx("ui.fantasyPartnersPage.thisIsYourPromoter", "This is your promoter link. Add the date and your card below: it goes live straight away.")}
              </div>
            )}
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
              <span>{tx("ui.fantasyPartnersPage.theGameIsFree", "The game is free, with no prizes paid for by players. We don't work with gambling, alcohol or interest-based lending brands, and sponsors never change prices or points.")}</span>
            </div>

            <label className="victory-label" htmlFor="fp-name">{tx("ui.fantasyPartnersPage.yourName", "Your name")}</label>
            <input id="fp-name" className="victory-input" required minLength={2} maxLength={80} value={form.name} onChange={set("name")} />
            <label className="victory-label" htmlFor="fp-company">{form.kind === "promoter" ? tx("ui.fantasyPartnersPage.promotion", "Promotion") : tx("ui.fantasyPartnersPage.company", "Company")}</label>
            <input id="fp-company" className="victory-input" required minLength={2} maxLength={120} value={form.company} onChange={set("company")} />
            <label className="victory-label" htmlFor="fp-email">{tx("ui.fantasyPartnersPage.email", "Email")}</label>
            <input id="fp-email" type="email" className="victory-input" required value={form.email} onChange={set("email")} />
            <label className="victory-label" htmlFor="fp-event">{tx("ui.fantasyPartnersPage.showOrDateOptional", "Show or date (optional)")}</label>
            <input id="fp-event" className="victory-input" maxLength={120} value={form.event_name} onChange={set("event_name")} />
            <label className="victory-label" htmlFor="fp-msg">{tx("ui.fantasyPartnersPage.anythingElse", "Anything else")}</label>
            <textarea id="fp-msg" className="victory-input min-h-[96px] py-3" maxLength={1500} value={form.message} onChange={set("message")} />
            <input type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" value={form.website} onChange={set("website")} />

            {form.kind === "promoter" && (
              <div className="victory-card p-3 space-y-2" data-testid="promoter-card">
                <p className="text-victory-text text-sm font-semibold">{tx("ui.fantasyPartnersPage.yourFightCardOptional", "Your fight card (optional, but it gets you listed fastest)")}</p>
                <p className="text-victory-muted text-[11px]">{tx("ui.fantasyPartnersPage.oneFightPerLine", "One fight per line, with records if you have them. You'll get a private link to add the results on the night.")}</p>
                <div className="grid grid-cols-2 gap-2">
                  <input type="date" className="victory-input" aria-label={tx("ui.fantasyPartnersPage.showDate", "Show date")} value={card.date} onChange={(e) => setCard({ ...card, date: e.target.value })} />
                  <input className="victory-input" maxLength={120} placeholder={tx("ui.fantasyPartnersPage.townEngland", "Town, England")} aria-label={tx("ui.fantasyPartnersPage.town", "Town")} value={card.location} onChange={(e) => setCard({ ...card, location: e.target.value })} />
                </div>
                <textarea className="victory-input min-h-[120px] py-3 font-mono text-[12px]" aria-label={tx("ui.fantasyPartnersPage.fightCard", "Fight card")}
                  placeholder={"Lee Smith (8-0) vs Kay Jones (3-5-1), 6 rounds\nMax Hill 1-0 v Rob Day, 4 rounds"}
                  value={card.text} onChange={(e) => setCard({ ...card, text: e.target.value })} />
                {card.text && (
                  <p className={`text-[11px] ${parsed.skipped.length ? "text-victory-orange" : "text-victory-teal"}`}>
                    {parsed.bouts.length} {tx("ui.fantasyPartnersPage.fight", "fight")}{parsed.bouts.length === 1 ? "" : "s"} {tx("ui.fantasyPartnersPage.read", "read")}
                    {parsed.skipped.length ? ` · couldn't read: ${parsed.skipped.slice(0, 2).join("; ")}` : ""}
                    {!card.date && parsed.bouts.length ? tx("ui.fantasyPartnersPage.addTheDateTo", " · add the date to send it") : ""}
                  </p>
                )}
              </div>
            )}

            {form.kind === "sponsor" && (
              <label className="flex items-start gap-2 text-[12px] text-victory-text min-h-[44px]">
                <input type="checkbox" className="mt-1 accent-victory-lime" checked={form.halal_confirmed} onChange={set("halal_confirmed")} required />
                {tx("ui.fantasyPartnersPage.myBrandIsnT", "My brand isn't in gambling, alcohol or interest-based lending.")}
              </label>
            )}

            <button type="submit" className="victory-btn-primary w-full" disabled={busy}>{busy ? tx("ui.fantasyPartnersPage.sending", "Sending…") : tx("ui.fantasyPartnersPage.sendEnquiry", "Send enquiry")}</button>
          </form>
        )}
      </main>
    </div>
  );
}
