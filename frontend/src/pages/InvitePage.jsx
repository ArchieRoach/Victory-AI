import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import QRCode from "qrcode";
import { ArrowLeft, Share2, Copy, MessageCircle, Smartphone, Contact, Check, X } from "lucide-react";
import { toast } from "sonner";
import { API, useAuth } from "@/App";
import { tx } from "@/i18n/tx";
import { analytics } from "@/lib/analytics";
import { whatsappLink, smsLink } from "@/lib/pendingReferral";
import { contactsSupported, pickContactPhones } from "@/utils/contacts";

// Goal: gym word of mouth. Fighters train side by side, so the fastest invite is a phone held up.
// Psychology: least effort wins (Fogg: ability beats motivation), and an equal reward for both
//   sides makes it a gift, not a pitch (reciprocity).
// Design: the QR code is the first thing on the page and opens full screen with one tap; every
//   other way to send (share sheet, WhatsApp, text, contacts, copy) is one tap below it.
export default function InvitePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [me, setMe] = useState(null);
  const [qr, setQr] = useState(null);
  const [big, setBig] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    axios.get(`${API}/referrals/me`).then((r) => setMe(r.data))
      .catch(() => toast.error(tx("ui.invitePage.couldntLoad", "Couldn't load your invite link. Try again.")));
  }, []);

  useEffect(() => {
    if (!me) return;
    QRCode.toDataURL(me.url, { width: 720, margin: 1, errorCorrectionLevel: "M" }).then(setQr).catch(() => setQr(null));
  }, [me]);

  const first = (user?.display_name || user?.name || "").split(" ")[0];
  const message = me ? tx("ui.invitePage.message", "Train boxing with me on Victory AI. An AI coach calls combos and scores your rounds. Join with my link and we both get {{tokens}} tokens after your first session: {{url}}", { tokens: me.reward_tokens, url: me.url }) : "";

  const sent = (how) => analytics.capture("referral_shared", { how });

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: "Victory AI", text: message });
        sent("share_sheet");
      } catch {}
      return;
    }
    copy();
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(me.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      sent("copy");
    } catch {
      toast.error(tx("ui.invitePage.copyFailed", "Couldn't copy. Press and hold the link instead."));
    }
  };

  const fromContacts = async () => {
    try {
      const numbers = await pickContactPhones();
      if (!numbers.length) return;
      sent("contacts");
      window.location.href = smsLink(message, numbers);
    } catch {}
  };

  return (
    <div className="min-h-screen bg-victory-bg pb-nav" data-testid="invite-page">
      <header className="p-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} aria-label={tx("ui.invitePage.goBack", "Go back")}
          className="w-11 h-11 rounded-full bg-victory-card border border-victory-border flex items-center justify-center">
          <ArrowLeft className="w-5 h-5 text-victory-text" />
        </button>
        <h1 className="flex-1 text-lg font-heading font-bold text-victory-text">{tx("ui.invitePage.title", "Invite friends")}</h1>
      </header>

      <main className="max-w-md mx-auto p-4 space-y-4">
        {!me ? <div className="skeleton-shimmer h-96 rounded-lg" /> : (
          <>
            <section className="victory-card p-5 text-center space-y-3">
              <p className="text-victory-text font-heading font-extrabold text-xl leading-tight">
                {tx("ui.invitePage.bothGet", "You both get {{tokens}} tokens", { tokens: me.reward_tokens })}
              </p>
              <p className="text-victory-muted text-sm">{tx("ui.invitePage.whenTheyTrain", "when your friend finishes their first session.")}</p>
              <button type="button" onClick={() => { setBig(true); sent("qr"); }} aria-label={tx("ui.invitePage.showBig", "Show the QR code full screen")}
                className="block mx-auto rounded-2xl bg-white p-3 active:scale-[0.98] transition-transform" data-testid="invite-qr">
                {qr ? <img src={qr} alt={tx("ui.invitePage.qrAlt", "Your invite QR code")} className="w-56 h-56" /> : <div className="w-56 h-56" />}
              </button>
              <p className="text-victory-muted text-xs">{tx("ui.invitePage.scanHint", "At the gym? Tap the code to make it big. They scan it with their phone camera.")}</p>
              <p className="font-mono text-victory-lime text-2xl font-bold tracking-[0.3em]" data-testid="invite-code">{me.code}</p>
            </section>

            <button onClick={share} className="victory-btn-primary w-full flex items-center justify-center gap-2" data-testid="invite-share">
              <Share2 className="w-5 h-5" /> {tx("ui.invitePage.share", "Send my invite")}
            </button>

            <div className="grid grid-cols-2 gap-2">
              <a href={whatsappLink(message)} target="_blank" rel="noreferrer" onClick={() => sent("whatsapp")}
                className="victory-btn-ghost flex items-center justify-center gap-2">
                <MessageCircle className="w-4 h-4" /> {tx("ui.invitePage.whatsapp", "WhatsApp")}
              </a>
              <a href={smsLink(message)} onClick={() => sent("sms")} className="victory-btn-ghost flex items-center justify-center gap-2">
                <Smartphone className="w-4 h-4" /> {tx("ui.invitePage.text", "Text")}
              </a>
              {contactsSupported() && (
                <button onClick={fromContacts} className="victory-btn-ghost flex items-center justify-center gap-2" data-testid="invite-contacts">
                  <Contact className="w-4 h-4" /> {tx("ui.invitePage.contacts", "Contacts")}
                </button>
              )}
              <button onClick={copy} className={`victory-btn-ghost flex items-center justify-center gap-2 ${contactsSupported() ? "" : "col-span-2"}`}>
                {copied ? <Check className="w-4 h-4 text-victory-lime" /> : <Copy className="w-4 h-4" />}
                {copied ? tx("ui.invitePage.copied", "Copied") : tx("ui.invitePage.copyLink", "Copy link")}
              </button>
            </div>

            <section className="victory-card p-4 grid grid-cols-3 text-center" data-testid="invite-stats">
              <div><p className="font-mono text-xl font-bold text-victory-text">{me.joined}</p><p className="text-victory-muted text-xs">{tx("ui.invitePage.joined", "joined")}</p></div>
              <div><p className="font-mono text-xl font-bold text-victory-text">{me.trained}</p><p className="text-victory-muted text-xs">{tx("ui.invitePage.trained", "trained")}</p></div>
              <div><p className="font-mono text-xl font-bold text-victory-lime">{me.tokens_earned}</p><p className="text-victory-muted text-xs">{tx("ui.invitePage.tokensEarned", "tokens earned")}</p></div>
            </section>
            <p className="text-victory-muted text-xs text-center">
              {tx("ui.invitePage.rules", "Tokens arrive when a new fighter who joined with your link finishes their first session. Up to 10 friends a month.")}
            </p>
          </>
        )}
      </main>

      {big && qr && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center p-6" onClick={() => setBig(false)} data-testid="invite-qr-big">
          <img src={qr} alt={tx("ui.invitePage.qrAlt", "Your invite QR code")} className="w-full max-w-sm aspect-square" />
          <p className="mt-4 font-mono text-3xl font-bold tracking-[0.3em] text-black">{me.code}</p>
          <p className="mt-2 text-sm text-black/60 text-center">{tx("ui.invitePage.scanWithCamera", "Scan with your phone camera to join {{name}} on Victory AI", { name: first || tx("ui.invitePage.me", "me") })}</p>
          <button type="button" aria-label={tx("ui.invitePage.close", "Close")} className="absolute top-6 right-6 w-11 h-11 rounded-full bg-black/10 flex items-center justify-center">
            <X className="w-5 h-5 text-black" />
          </button>
        </div>
      )}
    </div>
  );
}
