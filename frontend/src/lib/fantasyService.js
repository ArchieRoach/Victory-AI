// ─────────────────────────────────────────────────────────────────────────────
// Fantasy Boxing — data service.
//
// Right now this is an in-memory MOCK so the sidecar works end to end with no backend.
// The rest of the feature only talks to the small interface below, so going live means
// replacing this file's internals, not touching the components:
//
//   service.getSnapshot()          → { card, league, me }
//   service.subscribe(listener)    → unsubscribe()   (listener gets the new snapshot)
//   service.saveStable(pickIds)    → Promise<snapshot>   (rejects with a readable Error)
//   service.admin.*                → test controls (start a bout, apply/randomise results)
//
// HOOKING UP THE REAL BACKEND (suggested shape):
//   • Initial load   GET  /api/fantasy/cards/:cardId          → card (bouts, fighters, salaries, results)
//                    GET  /api/fantasy/cards/:cardId/league    → [{ user_id, name, picks }]
//   • Save picks     PUT  /api/fantasy/cards/:cardId/stable    { picks }  (server re-runs checkStable
//                    and rejects after the card locks — never trust the client's cap check)
//   • Live updates   the stream page already holds a WebSocket per stream (LiveChat). Push
//                    { type: "fantasy.bout_update", card_id, bout } and
//                    { type: "fantasy.league_update", card_id, league } on it, then in the
//                    message handler call applyServerBout(bout) / applyServerLeague(league)
//                    (see the bottom of createFantasyService) — the UI re-renders from there.
//   • Results source official results only (your results desk / admin tool / data provider).
//                    Scores are always derived from results with lib/fantasyScoring.js, so
//                    nobody can push "points" directly.
//
// Shariah / safety guard-rails (keep these when you go live):
//   • No entry fee, no paid boosts, no tokens spent or won, no prizes of any value.
//   • The 100M budget is fictional and can't be bought, topped up or cashed out.
//   • Leaderboards are friends-only bragging rights.
// ─────────────────────────────────────────────────────────────────────────────

import { checkStable, isCardLocked, METHODS } from "./fantasyScoring";

// ── Mock fight card (fictional fighters — swap for GET /api/fantasy/cards/:id) ──
// Salaries are in millions of a fictional budget; favourites cost more.
export function mockCard(cardId = "card_demo") {
  const f = (fighter_id, name, nickname, record, salary, country) => ({ fighter_id, name, nickname, record, salary, country });
  return {
    card_id: cardId,
    title: "Victory Fight Night",
    venue: "Manchester",
    status: "upcoming", // upcoming → live (first bout starts, picks lock) → complete
    bouts: [
      { bout_id: "bout_1", order: 1, division: "Heavyweight", scheduled_rounds: 12, status: "upcoming", result: null,
        fighters: [f("f_okafor", "Daniel Okafor", "The Wall", "22-1-0", 48, "GB"), f("f_varga", "Marek Varga", "Hammer", "18-4-1", 22, "HU")] },
      { bout_id: "bout_2", order: 2, division: "Super Middleweight", scheduled_rounds: 12, status: "upcoming", result: null,
        fighters: [f("f_rahman", "Idris Rahman", "Silk", "15-0-0", 38, "GB"), f("f_cole", "Jordan Cole", "Jet", "17-2-0", 30, "US")] },
      { bout_id: "bout_3", order: 3, division: "Lightweight", scheduled_rounds: 10, status: "upcoming", result: null,
        fighters: [f("f_haddad", "Yusuf Haddad", "Lion", "12-1-0", 32, "MA"), f("f_mensah", "Kofi Mensah", "Storm", "14-3-0", 26, "GH")] },
      { bout_id: "bout_4", order: 4, division: "Welterweight", scheduled_rounds: 10, status: "upcoming", result: null,
        fighters: [f("f_brennan", "Liam Brennan", "Iceman", "20-2-0", 35, "IE"), f("f_silva", "Rafael Silva", "Tank", "16-5-2", 18, "BR")] },
      { bout_id: "bout_5", order: 5, division: "Featherweight", scheduled_rounds: 8, status: "upcoming", result: null,
        fighters: [f("f_ali", "Zayn Ali", "Flash", "9-0-0", 24, "GB"), f("f_novak", "Tomas Novak", "Viper", "11-2-0", 15, "CZ")] },
    ],
  };
}

// ── Mock friends league (swap for GET /api/fantasy/cards/:id/league) ──
// Every mock stable is under the cap so the leaderboard starts out honest.
const MOCK_FRIENDS = [
  { user_id: "friend_1", name: "Aisha", picks: ["f_okafor", "f_haddad", "f_novak"] },
  { user_id: "friend_2", name: "Bilal", picks: ["f_rahman", "f_brennan", "f_ali"] },
  { user_id: "friend_3", name: "Chloe", picks: ["f_cole", "f_mensah", "f_silva"] },
  { user_id: "friend_4", name: "Dev",   picks: ["f_okafor", "f_varga", "f_ali"] },
  { user_id: "friend_5", name: "Ezra",  picks: ["f_rahman", "f_haddad", "f_silva"] },
];

const storageKey = (cardId, userId) => `victory_fantasy_${cardId}_${userId}`;
const readPicks = (cardId, userId) => {
  try { return JSON.parse(localStorage.getItem(storageKey(cardId, userId)) || "null"); } catch { return null; }
};
const writePicks = (cardId, userId, picks) => {
  try { localStorage.setItem(storageKey(cardId, userId), JSON.stringify(picks)); } catch {}
};

const clone = (x) => JSON.parse(JSON.stringify(x));

// Card status follows its bouts: any bout started → live (picks lock); all done → complete.
function deriveCardStatus(card) {
  const statuses = card.bouts.map((b) => b.status);
  if (statuses.every((s) => s === "complete")) return "complete";
  if (statuses.some((s) => s !== "upcoming")) return "live";
  return "upcoming";
}

/**
 * A plausible official result for a bout, for testing. Favourites (higher salary) win
 * more often; stoppages cluster early; decisions sometimes come with a clean sweep.
 * `rand` is injectable so tests can make it deterministic.
 */
export function randomResult(bout, rand = Math.random) {
  const [a, b] = bout.fighters;
  const roll = rand();
  if (roll < 0.04) return { winner_id: null, method: METHODS.NC, round: 1 + Math.floor(rand() * 4), clean_sweep: false };
  if (roll < 0.07) return { winner_id: null, method: METHODS.TD, round: 1 + Math.floor(rand() * 4), clean_sweep: false };
  if (roll < 0.10) return { winner_id: null, method: METHODS.D, round: bout.scheduled_rounds, clean_sweep: false };

  const favouriteWins = rand() < a.salary / (a.salary + b.salary);
  const fav = a.salary >= b.salary ? a : b;
  const dog = fav === a ? b : a;
  const winner = favouriteWins ? fav : dog;

  const m = rand();
  if (m < 0.45) {
    const round = 1 + Math.floor(Math.pow(rand(), 1.4) * bout.scheduled_rounds); // early rounds likelier
    return { winner_id: winner.fighter_id, method: rand() < 0.5 ? METHODS.KO : METHODS.TKO, round, clean_sweep: rand() < 0.3 };
  }
  if (m < 0.48) return { winner_id: winner.fighter_id, method: METHODS.DQ, round: 1 + Math.floor(rand() * bout.scheduled_rounds), clean_sweep: false };
  const decision = m < 0.80 ? METHODS.UD : rand() < 0.5 ? METHODS.SD : METHODS.MD;
  return { winner_id: winner.fighter_id, method: decision, round: bout.scheduled_rounds, clean_sweep: decision === METHODS.UD && rand() < 0.25 };
}

/** Basic sanity checks on a result before it's applied (the server must do the same). */
export function validateResult(bout, result) {
  const ids = bout.fighters.map((f) => f.fighter_id);
  if (!Object.values(METHODS).includes(result.method)) return "Unknown result method";
  const noWinner = [METHODS.TD, METHODS.NC, METHODS.D].includes(result.method);
  if (noWinner && result.winner_id) return "Draws and no contests have no winner";
  if (!noWinner && !ids.includes(result.winner_id)) return "Pick the winner";
  if (!Number.isInteger(result.round) || result.round < 1 || result.round > bout.scheduled_rounds) {
    return `Round must be 1–${bout.scheduled_rounds}`;
  }
  return null;
}

/**
 * @param {{ cardId?: string, me: { user_id: string, name: string } }} opts
 */
export function createFantasyService({ cardId = "card_demo", me }) {
  let card = mockCard(cardId);
  // Only locked-in picks live here; the draft-in-progress is the Draft panel's own state.
  let myPicks = readPicks(cardId, me.user_id) || [];
  let friends = clone(MOCK_FRIENDS);
  const listeners = new Set();

  const snapshot = () => ({
    card,
    me: { ...me, picks: myPicks, saved: myPicks.length > 0 },
    // The current user joins the league once they've locked a stable in.
    league: [...friends, ...(myPicks.length ? [{ user_id: me.user_id, name: me.name, picks: myPicks, isMe: true }] : [])],
  });
  const emit = () => { const s = snapshot(); listeners.forEach((l) => l(s)); };

  const updateBout = (boutId, patch) => {
    card = clone(card);
    const bout = card.bouts.find((b) => b.bout_id === boutId);
    if (!bout) throw new Error("Unknown bout");
    Object.assign(bout, patch);
    card.status = deriveCardStatus(card);
    emit();
  };

  const service = {
    getSnapshot: snapshot,
    // REAL BACKEND: keep the same snapshot shape and the hook/components need no changes.

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    // REAL BACKEND: PUT /api/fantasy/cards/:cardId/stable — the server repeats both checks.
    async saveStable(pickIds) {
      if (isCardLocked(card)) throw new Error("The fights have started, so teams can't change now.");
      const check = checkStable(pickIds, card);
      if (!check.valid) throw new Error(check.errors[0]);
      myPicks = [...pickIds];
      writePicks(cardId, me.user_id, myPicks);
      emit();
      return snapshot();
    },

    // ── Hooks for the real-time feed (call these from your WebSocket handler) ──
    applyServerBout(bout) { updateBout(bout.bout_id, bout); },
    applyServerLeague(league) { friends = league.filter((m) => m.user_id !== me.user_id); emit(); },

    // ── Admin / mock controls — what the test panel drives ──
    admin: {
      startBout(boutId) { updateBout(boutId, { status: "live", result: null }); },
      applyResult(boutId, result) {
        const bout = card.bouts.find((b) => b.bout_id === boutId);
        const problem = bout ? validateResult(bout, result) : "Unknown bout";
        if (problem) throw new Error(problem);
        updateBout(boutId, { status: "complete", result });
      },
      randomiseBout(boutId) {
        const bout = card.bouts.find((b) => b.bout_id === boutId);
        updateBout(boutId, { status: "complete", result: randomResult(bout) });
      },
      // Plays the rest of the card one bout at a time so the leaderboard visibly moves.
      async simulateCard(stepMs = 900) {
        for (const bout of card.bouts.filter((b) => b.status !== "complete")) {
          updateBout(bout.bout_id, { status: "live", result: null });
          await new Promise((r) => setTimeout(r, stepMs / 2));
          updateBout(bout.bout_id, { status: "complete", result: randomResult(bout) });
          await new Promise((r) => setTimeout(r, stepMs / 2));
        }
      },
      reset() {
        card = mockCard(cardId);
        friends = clone(MOCK_FRIENDS);
        emit();
      },
    },
  };
  return service;
}
