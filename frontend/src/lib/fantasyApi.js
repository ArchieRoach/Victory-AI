// Fantasy Boxing — live data service. Same interface as the mock in fantasyService.js
// (getSnapshot / subscribe / saveStable / applyServerBout / applyServerLeague), so the
// hook and panels work unchanged. Real cards, prices and results come from the backend,
// which syncs them from the Boxing Data API; scores are still worked out in the browser
// from official results with lib/fantasyScoring.js.
import axios from "axios";

const POLL_MS = { upcoming: 60000, live: 15000, complete: 0 };

const placeholderCard = (cardId) => ({ card_id: cardId, title: "Loading fights…", venue: "", status: "upcoming", bouts: [], loading: true });

export function createApiFantasyService({ cardId, me, api, league = "squad", http = axios }) {
  let card = placeholderCard(cardId);
  let myPicks = [];
  let members = [];
  let timer = null;
  let stopped = false;
  const listeners = new Set();

  const snapshot = () => ({
    card,
    me: { ...me, picks: myPicks, saved: myPicks.length > 0 },
    league: members,
  });
  const emit = () => { const s = snapshot(); listeners.forEach((l) => l(s)); };

  const load = async () => {
    try {
      const [{ data: c }, { data: board }] = await Promise.all([
        http.get(`${api}/fantasy/cards/${cardId}`),
        http.get(`${api}/fantasy/cards/${cardId}/leaderboard`, { params: { league } }),
      ]);
      card = { ...c.card, venue: c.card.venue || c.card.location || "" };
      myPicks = c.me.picks || [];
      members = board;
      emit();
    } catch (err) {
      if (card.loading) { card = { ...card, title: "Couldn't load this card", loading: false }; emit(); }
    }
  };

  // Polls faster while fights are on, and stops once the card is over.
  const schedule = () => {
    const wait = POLL_MS[card.status] ?? 60000;
    if (stopped || !wait) return;
    timer = setTimeout(async () => { await load(); schedule(); }, wait);
  };

  return {
    getSnapshot: snapshot,
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) { stopped = false; load().then(schedule); }
      return () => {
        listeners.delete(listener);
        if (!listeners.size) { stopped = true; clearTimeout(timer); }
      };
    },
    async saveStable(pickIds) {
      try {
        await http.put(`${api}/fantasy/cards/${cardId}/stable`, { picks: pickIds });
      } catch (err) {
        throw new Error(err?.response?.data?.detail || "Couldn't save your team. Try again.");
      }
      await load();
      return snapshot();
    },
    applyServerBout(bout) {
      card = { ...card, bouts: card.bouts.map((b) => (b.bout_id === bout.bout_id ? { ...b, ...bout } : b)) };
      emit();
    },
    applyServerLeague(next) { members = next; emit(); },
    admin: null,
  };
}
