import { useEffect, useState } from "react";

const TIER_STYLES = {
  bronze:   { bg: "from-amber-900/95 to-amber-800/90",   ring: "ring-amber-500/50",   text: "text-amber-300",  duration: 3000 },
  silver:   { bg: "from-slate-800/95 to-slate-700/90",   ring: "ring-slate-400/50",   text: "text-slate-200",  duration: 3500 },
  gold:     { bg: "from-yellow-900/95 to-yellow-800/90", ring: "ring-yellow-400/60",  text: "text-yellow-300", duration: 4000 },
  platinum: { bg: "from-cyan-900/95 to-cyan-800/90",     ring: "ring-cyan-400/70",    text: "text-cyan-300",   duration: 5000 },
  diamond:  { bg: "from-violet-900/95 to-purple-900/90", ring: "ring-violet-400/80",  text: "text-violet-200", duration: 6000 },
};

// Tier badge colors for the combo badge
const COMBO_TIER_BADGE = {
  silver: "from-slate-700 to-slate-600 text-slate-100  ring-slate-400/50",
  gold:   "from-yellow-700 to-yellow-600 text-yellow-100 ring-yellow-400/60",
};

// ── Gift sub banner ───────────────────────────────────────────────────────────
function GiftSubBanner({ event, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 4000);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-slide-down pointer-events-none">
      <div className="flex items-center gap-3 bg-victory-lime text-victory-bg px-5 py-3 rounded-2xl shadow-2xl font-bold text-sm">
        <span className="text-xl">🎁</span>
        <span>{event.user_name} gifted <strong>{event.count}</strong> sub{event.count > 1 ? "s" : ""}!</span>
      </div>
    </div>
  );
}

// ── Combo quick-fire overlay ──────────────────────────────────────────────────
function ComboAlert({ event, onDone }) {
  const sequence  = event.combo_sequence || [];
  const label     = event.combo_label   || event.punch_action || "Combo";
  const tier      = event.punch_tier    || "silver";
  const badgeStyle = COMBO_TIER_BADGE[tier] || COMBO_TIER_BADGE.silver;

  // step: 0..sequence.length-1 = showing punches; sequence.length = badge visible
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (step < sequence.length) {
      const t = setTimeout(() => setStep((s) => s + 1), 220);
      return () => clearTimeout(t);
    }
    // Hold badge then dismiss
    const t = setTimeout(onDone, 2200);
    return () => clearTimeout(t);
  }, [step, sequence.length, onDone]);

  const badgeVisible = step >= sequence.length;

  return (
    <div className="fixed inset-x-0 top-1/3 z-50 flex flex-col items-center gap-4 pointer-events-none px-4">
      {/* Punch emoji row */}
      <div className="flex items-center gap-4 min-h-[56px]">
        {sequence.map((emoji, i) => (
          <span
            key={i}
            className={`text-5xl transition-all duration-150 ${
              i < step
                ? "opacity-100 scale-100 animate-scale-in"
                : "opacity-0 scale-50"
            }`}
            style={{ transitionDelay: `${i * 30}ms` }}
          >
            {emoji}
          </span>
        ))}
      </div>

      {/* Combo badge */}
      {badgeVisible && (
        <div className={`flex flex-col items-center gap-1 animate-scale-in`}>
          <div className={`bg-gradient-to-r ${badgeStyle} ring-1 font-extrabold text-2xl tracking-widest px-6 py-2 rounded-2xl shadow-2xl uppercase`}>
            {label} COMBO!
          </div>
          <p className="text-white/80 text-sm font-semibold">{event.user_name} · {event.amount?.toLocaleString()} tokens</p>
          {event.message && (
            <p className="text-white/50 text-xs italic max-w-[220px] text-center">"{event.message}"</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Regular tip banner ────────────────────────────────────────────────────────
function TipBanner({ event, onDone }) {
  const tier      = TIER_STYLES[event.punch_tier] || TIER_STYLES.bronze;
  const isDiamond = event.punch_tier === "diamond";

  useEffect(() => {
    const t = setTimeout(onDone, tier.duration);
    return () => clearTimeout(t);
  }, [tier.duration, onDone]);

  if (isDiamond) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(139,92,246,0.35)_0%,transparent_70%)]" />
        <div className={`relative flex flex-col items-center gap-4 bg-gradient-to-b ${tier.bg} p-8 rounded-3xl ring-4 ${tier.ring} shadow-[0_0_80px_rgba(139,92,246,0.6)] max-w-sm mx-4 animate-scale-in`}>
          <span className="text-6xl animate-bounce-slow">🏆</span>
          <p className={`font-heading font-extrabold text-3xl ${tier.text} text-center`}>TITLE SHOT!</p>
          <p className="text-white/90 font-bold text-base text-center">{event.user_name}</p>
          <p className={`font-mono font-extrabold text-2xl ${tier.text}`}>{event.amount?.toLocaleString()} tokens</p>
          {event.message && <p className="text-white/80 text-sm text-center italic">"{event.message}"</p>}
        </div>
      </div>
    );
  }

  if (event.punch_tier === "platinum") {
    return (
      <div className="fixed inset-x-0 top-1/4 z-50 flex justify-center pointer-events-none px-4">
        <div className={`flex flex-col items-center gap-3 bg-gradient-to-b ${tier.bg} px-8 py-6 rounded-2xl ring-2 ${tier.ring} shadow-2xl max-w-xs w-full animate-scale-in`}>
          <div className="flex items-center gap-2">
            <span className="text-3xl">{event.punch_emoji || "🐐"}</span>
            <p className={`font-heading font-extrabold text-xl ${tier.text}`}>{event.punch_action || "GOAT STATUS"}</p>
          </div>
          <p className="text-white font-semibold text-sm">{event.user_name} · {event.amount?.toLocaleString()} tokens</p>
          {event.message && <p className="text-white/70 text-xs italic">"{event.message}"</p>}
        </div>
      </div>
    );
  }

  // Bronze / silver / gold — top banner
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-slide-down pointer-events-none">
      <div className={`flex items-center gap-3 bg-gradient-to-r ${tier.bg} ring-1 ${tier.ring} px-5 py-3 rounded-2xl shadow-2xl max-w-xs`}>
        <span className="text-2xl">{event.punch_emoji}</span>
        <div className="min-w-0">
          <p className={`font-bold text-sm ${tier.text}`}>{event.user_name} · {event.amount?.toLocaleString()} tokens</p>
          <p className="text-white/80 text-xs">{event.punch_action}</p>
          {event.message && (
            <p className="text-white/60 text-xs italic truncate max-w-[180px]">"{event.message}"</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Public component ──────────────────────────────────────────────────────────
export function PunchAlert({ events, onDismiss }) {
  if (!events.length) return null;
  const event    = events[0];
  const handleDone = () => onDismiss(event);

  if (event.type === "gift_sub") {
    return <GiftSubBanner event={event} onDone={handleDone} />;
  }

  if (event.is_combo && event.combo_sequence?.length) {
    return <ComboAlert event={event} onDone={handleDone} />;
  }

  return <TipBanner event={event} onDone={handleDone} />;
}
