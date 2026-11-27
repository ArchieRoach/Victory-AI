import { useEffect, useState } from "react";
import { comboTokens } from "@/lib/comboCaller";
import { tx } from "@/i18n/tx";

// Goal: a round you can follow when the gym music drowns out the coach.
// Psychology: a glance beats listening in noise; colour by hand is a cue the eye picks up before
//   reading (pre-attentive processing), and showing only "now" and "next" keeps the load small.
// Design: the call in huge numbers, coloured by hand (lead lime, rear teal, body shots orange,
//   moves white). The punch you're on is enlarged; the next one sits smaller underneath. It moves
//   on as the camera counts punches, or on a steady beat without the camera. Audio calls carry
//   on exactly as before: this is an addition.
const STEP_MS = 520;
const LEAD_IN_MS = 700;

const colour = (tk) => (tk.body ? "text-victory-orange" : tk.hand === "lead" ? "text-victory-lime" : tk.hand === "rear" ? "text-victory-teal" : "text-victory-text");

// Which piece of the combo the fighter is on. With the camera: right after the last punch it
// counted. Without: one piece every half second or so, after the call has been said.
export function currentIndex(tokens, elapsedMs, punchesLanded = null) {
  if (!tokens.length) return 0;
  const last = tokens.length - 1;
  if (punchesLanded == null) return Math.min(last, Math.max(0, Math.floor((elapsedMs - LEAD_IN_MS) / STEP_MS)));
  let landed = 0;
  for (let i = 0; i < tokens.length; i += 1) {
    if (landed === punchesLanded) return i;
    if (tokens[i].punch) landed += 1;
  }
  return last;
}

export function ComboDisplay({ combo, stance, startedAt, getPunches, overlay = false, caption }) {
  const tokens = comboTokens(combo, stance);
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    const id = setInterval(() => setNow(performance.now()), 120);
    return () => clearInterval(id);
  }, [combo, startedAt]);
  const idx = currentIndex(tokens, now - (startedAt || now), getPunches ? getPunches() : null);
  const cur = tokens[idx];
  const next = tokens[idx + 1];

  return (
    <div
      className={overlay
        ? "absolute inset-x-0 bottom-0 pt-10 pb-3 px-2 text-center bg-gradient-to-t from-black/80 via-black/50 to-transparent"
        : "w-full text-center"}
      data-testid="combo-call" aria-live="polite" aria-label={tokens.map((t) => t.name).join(", ")}
    >
      <p className={`font-mono font-extrabold leading-none flex flex-wrap items-end justify-center gap-x-1 ${overlay ? "text-5xl" : "text-7xl"}`}>
        {tokens.map((tk, i) => (
          <span key={tk.key} className="flex items-end whitespace-nowrap">
            {i > 0 && <span className="text-victory-muted/60 px-0.5">-</span>}
            <span className={`${colour(tk)} inline-block origin-bottom motion-safe:transition-transform motion-safe:duration-150 ${
              i === idx ? "scale-125" : i < idx ? "opacity-35" : "opacity-80"
            } ${tk.punch ? "" : overlay ? "text-2xl" : "text-4xl"}`}>
              {tk.punch ? tk.label : tk.label.toUpperCase()}
            </span>
          </span>
        ))}
      </p>
      {cur && (
        <p className={`font-heading font-extrabold mt-3 ${colour(cur)} ${overlay ? "text-xl" : "text-3xl"}`} data-testid="combo-now">{cur.name}</p>
      )}
      <p className={`text-victory-muted mt-1 ${overlay ? "text-xs text-white/80" : "text-base"}`} data-testid="combo-next">
        {!next ? tx("ui.comboDisplay.last", "Last one")
          : next.punch ? tx("ui.comboDisplay.next", "Next: {{label}} · {{name}}", { label: next.label, name: next.name })
          : tx("ui.comboDisplay.nextMove", "Next: {{name}}", { name: next.name })}
      </p>
      {caption && <p className={`mt-1 text-[11px] ${overlay ? "text-white/70" : "text-victory-muted"}`}>{caption}</p>}
    </div>
  );
}
