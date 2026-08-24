import { useEffect } from "react";
import { Confetti } from "@/components/Confetti";
import { useTranslation } from "react-i18next";

const TIER_STYLES = {
  legend:  { glow: "rgba(234,179,8,0.45)",  ring: "ring-yellow-400/60", text: "text-yellow-300", bg: "from-yellow-900/95 to-yellow-800/90" },
  diamond: { glow: "rgba(96,165,250,0.45)", ring: "ring-blue-400/60",   text: "text-blue-300",   bg: "from-blue-900/95 to-blue-800/90" },
  gold:    { glow: "rgba(245,158,11,0.45)", ring: "ring-amber-400/60",  text: "text-amber-300",  bg: "from-amber-900/95 to-amber-800/90" },
  silver:  { glow: "rgba(148,163,184,0.4)", ring: "ring-slate-400/50",  text: "text-slate-200",  bg: "from-slate-800/95 to-slate-700/90" },
  bronze:  { glow: "rgba(194,120,3,0.4)",   ring: "ring-orange-500/50", text: "text-orange-300", bg: "from-orange-900/95 to-orange-800/90" },
};

// Ring-announcer style belt-unlock moment — earned from a real logged session
// (see check_and_award_belts), never a manufactured/random reward.
export function BeltCelebration({ belts, onDone }) {
  const { t } = useTranslation();
  const belt = belts?.[0];
  const advance = () => onDone(belt);

  useEffect(() => {
    if (!belt) return;
    const timer = setTimeout(advance, 5500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [belt?.belt_id]);

  if (!belt) return null;
  const style = TIER_STYLES[belt.tier] || TIER_STYLES.bronze;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
      <Confetti />
      <div
        className="absolute inset-0 bg-black/80"
        style={{ backgroundImage: `radial-gradient(ellipse at center, ${style.glow} 0%, transparent 70%)` }}
      />
      <div
        className={`relative flex flex-col items-center gap-3 bg-gradient-to-b ${style.bg} p-8 rounded-3xl ring-4 ${style.ring} shadow-2xl max-w-sm w-full animate-scale-in`}
      >
        <p className={`font-heading font-extrabold tracking-widest text-sm ${style.text} uppercase`}>
          {t("belt.andTheNew")}
        </p>
        <span className="text-7xl animate-bounce-slow">{belt.emoji}</span>
        <p className="font-heading font-extrabold text-2xl text-white text-center">{belt.name}</p>
        <p className="text-white/70 text-sm text-center">{belt.desc}</p>
        <button
          onClick={advance}
          className="mt-2 px-6 py-2.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white text-sm font-semibold transition-colors"
        >
          {belts.length > 1 ? t("belt.next") : t("belt.continue")}
        </button>
      </div>
    </div>
  );
}
