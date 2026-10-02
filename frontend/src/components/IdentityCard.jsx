import { Flame } from "lucide-react";
import { ordinal } from "@/lib/identity";

// Goal: fighters keep coming back because they see themselves as boxers.
// Psychology: an earned, specific label ("Iron Guard") changes how people see themselves,
// and a believable one has to show its evidence. It's shown first on the results screen
// because the first thing read frames everything after it.
// Design: the trait, the proof, and how many times the fighter has shown it.
export function IdentityCard({ identity }) {
  if (!identity) return null;
  const first = identity.count === 1;
  return (
    <section className="victory-card p-4 space-y-3 border-victory-lime/40 bg-gradient-to-br from-victory-lime/10 to-transparent animate-scale-in" data-testid="identity-card">
      <p className="section-label flex items-center gap-1.5">
        <Flame className="w-3 h-3" /> {first ? "New trait unlocked" : "Who you're becoming"}
      </p>
      <div>
        <p className="font-heading font-extrabold text-2xl text-victory-text leading-tight">{identity.name}</p>
        <p className="text-victory-muted text-xs mt-0.5">
          {first ? "First time" : `${ordinal(identity.count)} time`} · {identity.evidence}
        </p>
      </div>
      <p className="text-victory-text text-sm">{identity.statement}</p>
      {identity.traits?.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {identity.traits.map((t) => (
            <span key={t.name} className="text-[11px] font-heading font-bold px-2 py-0.5 rounded-full border border-victory-border text-victory-muted">
              {t.name} <span className="font-mono text-victory-lime">×{t.count}</span>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
