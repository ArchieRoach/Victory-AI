import { createFantasyService, randomResult, validateResult, mockCard } from "./fantasyService";
import { checkStable, rankLeague } from "./fantasyScoring";

const me = { user_id: "u_me", name: "Archie" };
beforeEach(() => localStorage.clear());

test("every mock friend's stable is a legal stable", () => {
  const svc = createFantasyService({ me });
  const { card, league } = svc.getSnapshot();
  league.forEach((m) => expect(checkStable(m.picks, card).valid).toBe(true));
});

test("saving picks enforces the cap, joins the league and survives a reload", async () => {
  const svc = createFantasyService({ me });
  await expect(svc.saveStable(["f_okafor", "f_rahman", "f_brennan"])).rejects.toThrow(/Too many coins/);
  expect(svc.getSnapshot().league.some((m) => m.isMe)).toBe(false);
  await svc.saveStable(["f_okafor", "f_varga", "f_ali"]);
  expect(svc.getSnapshot().league.find((m) => m.isMe).picks).toEqual(["f_okafor", "f_varga", "f_ali"]);
  expect(createFantasyService({ me }).getSnapshot().me.picks).toEqual(["f_okafor", "f_varga", "f_ali"]);
});

test("picks lock once a bout starts, and results move the leaderboard live", async () => {
  const svc = createFantasyService({ me });
  await svc.saveStable(["f_okafor", "f_novak", "f_silva"]);
  const seen = [];
  const unsub = svc.subscribe((s) => seen.push(s));

  svc.admin.startBout("bout_1");
  await expect(svc.saveStable(["f_okafor", "f_varga", "f_ali"])).rejects.toThrow(/fights have started/);

  svc.admin.applyResult("bout_1", { winner_id: "f_okafor", method: "KO", round: 2, clean_sweep: false });
  const ranked = rankLeague(seen.at(-1).league, seen.at(-1).card);
  expect(ranked.find((m) => m.isMe).total).toBe(30);
  expect(seen.at(-1).card.status).toBe("live");
  unsub();
  svc.admin.randomiseBout("bout_2");
  expect(seen).toHaveLength(2);
});

test("results are validated before they're applied", () => {
  const bout = mockCard().bouts[4];
  expect(validateResult(bout, { winner_id: "f_ali", method: "KO", round: 9 })).toBe("Round must be 1–8");
  expect(validateResult(bout, { winner_id: "nobody", method: "UD", round: 8 })).toBe("Pick the winner");
  expect(validateResult(bout, { winner_id: "f_ali", method: "NC", round: 2 })).toBe("Draws and no contests have no winner");
  expect(validateResult(bout, { winner_id: "f_ali", method: "UD", round: 8 })).toBeNull();
});

test("random results are always valid", () => {
  const card = mockCard();
  for (let i = 0; i < 500; i++) {
    for (const bout of card.bouts) expect(validateResult(bout, randomResult(bout))).toBeNull();
  }
});

test("simulating the card finishes it", async () => {
  const svc = createFantasyService({ me });
  await svc.admin.simulateCard(0);
  expect(svc.getSnapshot().card.status).toBe("complete");
  svc.admin.reset();
  expect(svc.getSnapshot().card.status).toBe("upcoming");
});
