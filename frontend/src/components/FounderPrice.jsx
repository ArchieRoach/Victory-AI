import { Lock } from "lucide-react";
import { founderTerms } from "@/lib/billing";
import { tx } from "@/i18n/tx";

// Goal: founders stay subscribed. Psychology: the endowment effect — people value what
// they already own far more than the same thing offered to them, and "locked in, yours"
// right after purchase is when ownership is first felt. Design: name the price as theirs,
// state the condition plainly (stay subscribed), and say exactly what leaving costs.
export function FounderLockedCard({ billing }) {
  const terms = founderTerms(billing);
  if (!terms) return null;
  return (
    <section className="victory-card p-4 text-left space-y-2 border-victory-lime/40 bg-victory-lime/5" data-testid="founder-locked">
      <p className="section-label flex items-center gap-1.5"><Lock className="w-3 h-3" /> {tx("ui.founderPrice.founderPriceLockedIn", "Founder price locked in")}</p>
      <p className="text-victory-text font-heading font-extrabold text-2xl">
        {terms.now} <span className="text-victory-muted text-sm font-body font-normal line-through">{terms.regular}</span>
      </p>
      <p className="text-victory-text text-sm">{tx("ui.founderPrice.thisPriceIsYours", "This price is yours for life, for as long as you stay subscribed.")}</p>
      <p className="text-victory-muted text-xs">
        {tx("ui.founderPrice.ifYouCancelIt", "If you cancel, it's gone for good: coming back would cost")} {terms.regular}{tx("ui.founderPrice.about", ", about")} {terms.extraPerYear} {tx("ui.founderPrice.moreAYear", "more a year.")}
      </p>
    </section>
  );
}
