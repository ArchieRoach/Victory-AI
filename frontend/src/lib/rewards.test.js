import { seasonProgress } from "./rewards";

test("progress counts toward the next rank", () => {
  expect(seasonProgress({ points: 127, next_at: 250, next_rank: "Gold" })).toEqual({ pct: 51, label: "123 to Gold" });
});

test("top rank is full and says so", () => {
  const p = seasonProgress({ points: 1200, next_at: null, next_rank: null });
  expect(p.pct).toBe(100);
  expect(p.label).toMatch(/Top rank/);
});

test("no season yet renders nothing", () => {
  expect(seasonProgress(null)).toBeNull();
});

import { inviteMoment } from "./rewards";

test("no win, no invite", () => {
  expect(inviteMoment({ personal_bests: { new: [], near: [{ name: "Jab" }], baselines: 16 } }, null)).toBeNull();
  expect(inviteMoment(undefined, undefined)).toBeNull();
  expect(inviteMoment({}, { rarity: "common" })).toBeNull();
  expect(inviteMoment({}, { rarity: "epic", locked: true })).toBeNull();
});

test("a fresh skill PB beats Overall as the brag", () => {
  const m = inviteMoment({ personal_bests: { new: [{ name: "Overall" }, { name: "Jab" }] } });
  expect(m.dimension).toBe("Jab");
});

test("callouts, rank-ups and rare reports also count as wins", () => {
  expect(inviteMoment({ callouts_beaten: [{ dimension: "Footwork" }] }).dimension).toBe("Footwork");
  expect(inviteMoment({ season: { ranked_up: true, rank: "Contender" } })).toEqual({ dimension: null, headline: "You're Contender now. Bring your crew." });
  expect(inviteMoment({}, { rarity: "rare" }).dimension).toBeNull();
});

test("a first-time trait is a win; a repeat isn't", () => {
  expect(inviteMoment({ identity: { name: "Iron Guard", count: 1 } }).headline).toBe("New trait: Iron Guard. Show your crew.");
  expect(inviteMoment({ identity: { name: "Iron Guard", count: 3 } })).toBeNull();
});
