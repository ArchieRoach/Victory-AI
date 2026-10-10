import { resetCountdown, rankHeadline, bragText, brag, sessionWin, weekLabel } from "./progression";

test("countdown to the weekly reset", () => {
  const now = new Date("2026-10-10T12:00:00Z");
  expect(resetCountdown("2026-10-12T00:00:00Z", now)).toBe("Resets in 1d 12h");
  expect(resetCountdown("2026-10-10T15:00:00Z", now)).toBe("Resets in 3h");
  expect(resetCountdown("2026-10-10T11:00:00Z", now)).toBe("Resets now");
});

test("rank headline frames reachable and distant gaps differently", () => {
  expect(rankHeadline({ learning_mode: true })).toBeNull();
  expect(rankHeadline({ me: null })).toMatch(/Train once/);
  expect(rankHeadline({ me: { rank: 1 }, size: 4 })).toMatch(/top/);
  expect(rankHeadline({ me: { rank: 3 }, size: 9, gap_up: 12, within_reach: true, next_up: "Sam L." }))
    .toBe("12 points to pass Sam L.: one good session does it.");
  expect(rankHeadline({ me: { rank: 30 }, size: 90, gap_up: 400, within_reach: false })).toBe("You're #30 of 90. Every session moves you up.");
});

test("brag text only states what was earned", () => {
  expect(bragText({ kind: "level", level: 4, unlock: "Double Jab" })).toBe("Just hit level 4 on Victory AI and unlocked Double Jab.");
  expect(bragText({ kind: "shelf", level: 7, crowns: 1 })).toBe("My Victory AI trophy shelf: level 7, 1 crown.");
});

test("brag uses the share sheet, then falls back to copying", async () => {
  const share = jest.fn().mockResolvedValue();
  expect(await brag({ kind: "quest" }, { nav: { share }, url: "https://x" })).toBe("shared");
  const writeText = jest.fn().mockResolvedValue();
  expect(await brag({ kind: "quest" }, { nav: { clipboard: { writeText } }, url: "https://x" })).toBe("copied");
  expect(writeText.mock.calls[0][0]).toMatch(/squad smashed.*https:\/\/x$/);
  const abort = Object.assign(new Error("x"), { name: "AbortError" });
  expect(await brag({ kind: "quest" }, { nav: { share: jest.fn().mockRejectedValue(abort) } })).toBe("cancelled");
});

test("session win picks level-ups, then quests, else nothing", () => {
  expect(sessionWin({ status: { leveled_up: true, level: 3, unlocked: [{ name: "Slip and Counter" }] } }))
    .toEqual({ kind: "level", level: 3, unlock: "Slip and Counter" });
  expect(sessionWin({ status: { leveled_up: false }, quests: [{ just_completed: true, name: "Crew" }] })).toEqual({ kind: "quest", squad: "Crew" });
  expect(sessionWin({ status: { leveled_up: false }, quests: [] })).toBeNull();
  expect(weekLabel("2026-W09")).toBe("W9");
});

test("gloves lines use only real numbers", () => {
  const { glovesHeadline, glovesLine } = require("./progression");
  expect(glovesHeadline({ holders: 0, pledged: false, window: { open: true, days_to_close: 4 }, chasers: 12 }))
    .toBe("12 chasing · Nobody holds them yet · entries close in 4d");
  expect(glovesHeadline({ holders: 3, pledged: true, to_go: 750, days_left: 20 })).toBe("750 proof to go · 20 days left · Held by 3 fighters");
  expect(glovesHeadline({ holders: 1, earned: true })).toMatch(/^Yours\. Held by 1 fighter\./);
  expect(glovesLine({ counted: false, reason: "unverified" })).toMatch(/only AI-scored/);
  expect(glovesLine({ counted: true, proof_earned: 40, over_cap: 2 })).toBe("+40 proof toward the Golden Gloves (2 rounds over today's cap)");
  expect(glovesLine({ counted: false, reason: "not_pledged" })).toBeNull();
  expect(glovesLine({ just_earned: "Season 9 Golden Gloves" })).toBe("You earned the Season 9 Golden Gloves!");
});
