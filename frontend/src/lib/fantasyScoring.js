// ─────────────────────────────────────────────────────────────────────────────
// Fantasy Boxing — scoring and salary-cap rules (pure functions, no React).
//
// Goal: something to play with friends while a fight card is on, with nothing at stake.
// Psychology: the fun of predicting with friends comes from being proven right (and
//   bragging about it), not from money. Keeping it to points and a friends leaderboard
//   keeps it halal (no maysir/gambling, no entry fee, no pooled money, no prizes) and
//   safe for a teen audience.
// Design: a fictional 100M budget (not real money), a stable of 3, points only for the official
//   result of each bout. No in-ring performance stats, no paid boosts, no tokens.
//
// Everything that shapes a score lives here so the server can run the exact same rules
// later (port these functions 1:1 to Python when results move server-side).
// ─────────────────────────────────────────────────────────────────────────────

export const SALARY_CAP = 100; // pretend coins to spend on a team — never real money
export const STABLE_SIZE = 3;

// Official result methods. Feed these codes from your results feed / admin panel.
export const METHODS = {
  KO: "KO",
  TKO: "TKO",
  DQ: "DQ",
  UD: "UD", // unanimous decision
  SD: "SD", // split decision
  MD: "MD", // majority decision
  TD: "TD", // technical draw
  NC: "NC", // no contest
  D: "D",   // ordinary draw (split/majority/unanimous draw)
};

// Plain words for players (a 7-year-old should understand every line). Boxing codes like
// "UD" or "TKO" stay in METHOD_LABEL for the admin/results desk only.
export const PLAIN_RESULT = {
  KO: "Won by knockout", TKO: "Won by knockout", DQ: "Won — other boxer broke the rules",
  UD: "Won on points — all judges agreed", SD: "Won on points — close call", MD: "Won on points — close call",
  TD: "Fight stopped early — no winner", NC: "Fight didn't count — no winner", D: "It was a draw",
};

export const METHOD_LABEL = {
  KO: "KO", TKO: "TKO", DQ: "Disqualification", UD: "Unanimous decision",
  SD: "Split decision", MD: "Majority decision", TD: "Technical draw",
  NC: "No contest", D: "Draw",
};

export const POINTS = {
  WIN_STOPPAGE: 20,   // KO / TKO / DQ
  WIN_UD: 15,
  WIN_SD_MD: 10,
  TD_NC: 5,
  LOSS: 0,
  EARLY_FINISH: 10,   // KO/TKO in rounds 1–4
  MID_FINISH: 5,      // KO/TKO in rounds 5–8
  LATE_FINISH: 2,     // KO/TKO in rounds 9–12
  CLEAN_SWEEP: 10,    // won every round on at least one official scorecard
};

const STOPPAGES = new Set([METHODS.KO, METHODS.TKO, METHODS.DQ]);
// Finish bonuses reward knocking someone out. A DQ is a stoppage win (+20) but not a
// knockout, so it earns no round bonus.
const KNOCKOUTS = new Set([METHODS.KO, METHODS.TKO]);
const NO_DECISION = new Set([METHODS.TD, METHODS.NC, METHODS.D]);

/**
 * Points one fighter earned from one finished bout.
 *
 * @param {string} fighterId
 * @param {object} bout   { status, scheduled_rounds, fighters:[{fighter_id}], result }
 *   result = { winner_id: string|null, method: METHODS.*, round: number, clean_sweep: boolean }
 *   `clean_sweep` is true when the winner won every round on ≥ 1 official scorecard —
 *   this comes from the judges' cards in your results feed, never computed client-side.
 * @returns {{ total:number, lines:Array<{label:string, pts:number, kind:"base"|"bonus"}>, outcome:string }|null}
 *   null while the bout hasn't finished — nothing is scored on a live or upcoming bout.
 */
export function scoreFighter(fighterId, bout) {
  if (!bout || bout.status !== "complete" || !bout.result) return null;
  const { winner_id, method, round, clean_sweep } = bout.result;
  const lines = [];

  if (NO_DECISION.has(method)) {
    // Spec: "Technical Draw / No Contest: +5". An ordinary draw is treated the same way
    // (neither fighter lost) — change POINTS.TD_NC handling here if you'd rather score it 0.
    lines.push({ label: PLAIN_RESULT[method], pts: POINTS.TD_NC, kind: "base" });
    return { total: POINTS.TD_NC, lines, outcome: "draw" };
  }

  if (winner_id !== fighterId) {
    lines.push({ label: "Lost this one", pts: POINTS.LOSS, kind: "base" });
    return { total: 0, lines, outcome: "loss" };
  }

  if (STOPPAGES.has(method)) {
    lines.push({ label: `${PLAIN_RESULT[method]}${round && method !== METHODS.DQ ? ` in round ${round}` : ""}`, pts: POINTS.WIN_STOPPAGE, kind: "base" });
  } else if (method === METHODS.UD) {
    lines.push({ label: PLAIN_RESULT.UD, pts: POINTS.WIN_UD, kind: "base" });
  } else if (method === METHODS.SD || method === METHODS.MD) {
    lines.push({ label: PLAIN_RESULT[method], pts: POINTS.WIN_SD_MD, kind: "base" });
  }

  if (KNOCKOUTS.has(method) && Number.isInteger(round)) {
    if (round >= 1 && round <= 4) lines.push({ label: "Super-fast knockout bonus", pts: POINTS.EARLY_FINISH, kind: "bonus" });
    else if (round >= 5 && round <= 8) lines.push({ label: "Fast knockout bonus", pts: POINTS.MID_FINISH, kind: "bonus" });
    else if (round >= 9 && round <= 12) lines.push({ label: "Late knockout bonus", pts: POINTS.LATE_FINISH, kind: "bonus" });
  }

  if (clean_sweep) lines.push({ label: "Won every round bonus", pts: POINTS.CLEAN_SWEEP, kind: "bonus" });

  return { total: lines.reduce((s, l) => s + l.pts, 0), lines, outcome: "win" };
}

/** Index every fighter on a card → { fighter, bout } for quick lookups. */
export function indexCard(card) {
  const byId = {};
  for (const bout of card?.bouts || []) {
    for (const f of bout.fighters) byId[f.fighter_id] = { fighter: f, bout };
  }
  return byId;
}

/**
 * Salary-cap and roster checks for a (possibly in-progress) pick list.
 * Over-cap picks are allowed in the UI so the user can see the problem — they just
 * can't be locked in until `valid` is true.
 */
// Small cards (an amateur weekend with one or two bouts) pick fewer boxers with a
// matching budget; every other card is 3 boxers and 100 coins.
export const teamSize = (card) => card?.stable_size || STABLE_SIZE;
export const coinCap = (card) => card?.salary_cap || SALARY_CAP;

export function checkStable(pickIds, card) {
  const STABLE_SIZE = teamSize(card);
  const SALARY_CAP = coinCap(card);
  const index = indexCard(card);
  const picks = pickIds.map((id) => index[id]?.fighter).filter(Boolean);
  const spent = picks.reduce((s, f) => s + f.salary, 0);
  const remaining = SALARY_CAP - spent;
  const errors = [];
  if (picks.length !== pickIds.length) errors.push("One of your boxers isn't fighting any more. Pick another.");
  if (remaining < 0) errors.push(`Too many coins! You're ${-remaining} over. Swap a boxer for a cheaper one.`);
  if (picks.length < STABLE_SIZE) errors.push(`Pick ${STABLE_SIZE - picks.length} more boxer${STABLE_SIZE - picks.length === 1 ? "" : "s"}.`);
  if (picks.length > STABLE_SIZE) errors.push(`Your team is ${STABLE_SIZE} boxers.`);
  return {
    size: STABLE_SIZE,
    cap: SALARY_CAP,
    spent,
    remaining,
    overCap: remaining < 0,
    full: picks.length >= STABLE_SIZE,
    valid: errors.length === 0,
    errors,
  };
}

/** Total for a stable on a card, with each fighter's breakdown (null = not scored yet). */
export function scoreStable(pickIds, card) {
  const index = indexCard(card);
  const fighters = pickIds.map((id) => {
    const entry = index[id];
    const score = entry ? scoreFighter(id, entry.bout) : null;
    return { fighter_id: id, fighter: entry?.fighter, bout: entry?.bout, score };
  });
  return {
    total: fighters.reduce((s, f) => s + (f.score?.total || 0), 0),
    decided: fighters.filter((f) => f.score).length,
    fighters,
  };
}

/**
 * Rank league members by stable score. Ties share a rank ("1, 1, 3") and are listed by
 * name so the order doesn't jump around between renders.
 */
export function rankLeague(members, card) {
  const scored = members.map((m) => {
    const s = scoreStable(m.picks || [], card);
    return { ...m, total: s.total, decided: s.decided, breakdown: s.fighters };
  });
  scored.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  let rank = 0;
  return scored.map((m, i) => {
    if (i === 0 || m.total !== scored[i - 1].total) rank = i + 1;
    return { ...m, rank };
  });
}

/** Picks lock once the first bout of the card starts. */
export const isCardLocked = (card) => card?.status !== "upcoming";

// The budget is shown as pretend "coins" (100 to spend) — easier than "$100M", and plainly
// not real money. They can't be bought, earned or swapped for anything.
export const formatCoins = (n) => `${n} coin${n === 1 ? "" : "s"}`;
