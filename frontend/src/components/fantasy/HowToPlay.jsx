import { Users, Tv, Star } from "lucide-react";
import { POINTS } from "@/lib/fantasyScoring";

// The whole game in three steps and five point values, shown before the first pick.
// Chunking (3 steps) and concrete numbers beat a rules page: people learn a game by
// seeing what scores, not by reading how scoring works.
const STEPS = [
  { icon: Users, text: "Pick 3 boxers" },
  { icon: Tv, text: "Watch them fight" },
  { icon: Star, text: "Get points when they win" },
];

const SCORES = [
  { what: "Wins by knockout", pts: POINTS.WIN_STOPPAGE },
  { what: "Wins on points", pts: `${POINTS.WIN_SD_MD}–${POINTS.WIN_UD}` },
  { what: "Draw or no winner", pts: POINTS.TD_NC },
  { what: "Loses", pts: POINTS.LOSS },
];

const BONUSES = [
  { what: "Super-fast knockout", pts: POINTS.EARLY_FINISH },
  { what: "Won every round", pts: POINTS.CLEAN_SWEEP },
];

export function HowToPlay() {
  return (
    <div className="victory-card p-3 space-y-3" data-testid="how-to-play">
      <ol className="grid grid-cols-3 gap-2">
        {STEPS.map(({ icon: Icon, text }, i) => (
          <li key={text} className="flex flex-col items-center text-center gap-1">
            <span className="w-9 h-9 rounded-2xl bg-victory-lime/10 border border-victory-lime/20 flex items-center justify-center">
              <Icon className="w-4 h-4 text-victory-lime" />
            </span>
            <span className="text-[11px] text-victory-text leading-tight"><span className="font-mono text-victory-lime">{i + 1}.</span> {text}</span>
          </li>
        ))}
      </ol>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        {SCORES.map((s) => (
          <p key={s.what} className="flex justify-between gap-2 text-victory-muted">
            <span>{s.what}</span><span className="font-mono font-bold text-victory-text">{s.pts}</span>
          </p>
        ))}
        {BONUSES.map((s) => (
          <p key={s.what} className="flex justify-between gap-2 text-victory-lime">
            <span className="flex items-center gap-1"><Star className="w-3 h-3" /> {s.what}</span><span className="font-mono font-bold">+{s.pts}</span>
          </p>
        ))}
      </div>
    </div>
  );
}
