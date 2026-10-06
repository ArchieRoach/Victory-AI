import { createApiFantasyService } from "./fantasyApi";

const CARD = {
  card_id: "fc_1", title: "Big Night", location: "London, England", status: "upcoming",
  bouts: [{ bout_id: "b1", status: "upcoming", result: null, scheduled_rounds: 12,
    fighters: [{ fighter_id: "a", name: "A", salary: 40 }, { fighter_id: "b", name: "B", salary: 20 }] }],
};

function fakeHttp({ putError } = {}) {
  const calls = [];
  return {
    calls,
    get: jest.fn(async (url, opts) => {
      calls.push(["get", url, opts?.params]);
      if (url.endsWith("/leaderboard")) return { data: [{ user_id: "u2", name: "Friend", picks: ["a"], total: 0 }] };
      return { data: { card: CARD, me: { picks: ["a"], saved: true } } };
    }),
    put: jest.fn(async () => {
      if (putError) throw { response: { data: { detail: putError } } };
      return { data: { ok: true } };
    }),
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

test("loads the real card, my picks and the chosen league", async () => {
  const http = fakeHttp();
  const service = createApiFantasyService({ cardId: "fc_1", me: { user_id: "u1", name: "Me" }, api: "/api", league: "fl_9", http });
  expect(service.getSnapshot().card.loading).toBe(true);
  const seen = [];
  const stop = service.subscribe((s) => seen.push(s));
  await flush();
  stop();
  const snap = seen.at(-1);
  expect(snap.card.venue).toBe("London, England");
  expect(snap.me.saved).toBe(true);
  expect(snap.league[0].name).toBe("Friend");
  expect(http.calls).toContainEqual(["get", "/api/fantasy/cards/fc_1/leaderboard", { league: "fl_9" }]);
  expect(service.admin).toBeNull();
});

test("shows the server's plain-English reason when a team is refused", async () => {
  const http = fakeHttp({ putError: "Too many coins! You're 10 over." });
  const service = createApiFantasyService({ cardId: "fc_1", me: { user_id: "u1", name: "Me" }, api: "/api", http });
  await expect(service.saveStable(["a", "b", "c"])).rejects.toThrow("Too many coins! You're 10 over.");
});
