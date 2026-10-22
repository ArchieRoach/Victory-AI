import { streakLine, canShareStreak, streakCardContent } from "./streakCard";

const base = { current: 0, longest: 0, this_week_days: 0, needed: 2, safe: false, at_risk: false, days_left: 3, per_week: 2 };

test("at risk says how many days and by when", () => {
  const l = streakLine({ ...base, current: 6, longest: 6, this_week_days: 1, needed: 1, at_risk: true, days_left: 1 });
  expect(l.tone).toBe("risk");
  expect(l.text).toBe("6-week streak. 1 more training day by tomorrow night keeps it going.");
});

test("a secured week reads as done and can be shared", () => {
  const s = { ...base, current: 4, longest: 4, this_week_days: 2, needed: 0, safe: true };
  expect(streakLine(s).text).toBe("4-week streak. This week is in the bag.");
  expect(canShareStreak(s)).toBe(true);
});

test("no share before the week is secured", () => {
  expect(canShareStreak({ ...base, current: 5, at_risk: true })).toBe(false);
  expect(canShareStreak(null)).toBe(false);
});

test("a newcomer is invited to start, never told they failed", () => {
  expect(streakLine(base).text).toBe("Train 2 days this week to start a weekly streak.");
  expect(streakLine({ ...base, this_week_days: 1, needed: 1 }).text).toBe("1 more training day this week starts your weekly streak.");
});

test("the card shows only real numbers", () => {
  const c = streakCardContent({ streak: { ...base, current: 12, longest: 15, safe: true }, user: { display_name: "Archie" }, squadName: "Southside" });
  expect(c.number).toBe("12");
  expect(c.line).toBe("Trained 2+ days a week, 12 weeks running.");
  expect(c.best).toBe("Best: 15 weeks");
  expect(c.squad).toBe("Squad: Southside");
  expect(streakCardContent({ streak: { ...base, current: 1, longest: 1 }, user: null }).best).toBeNull();
});

test("when the week can no longer be saved it says so kindly", () => {
  const l = streakLine({ ...base, current: 3, longest: 3, needed: 2, at_risk: true, days_left: 0 });
  expect(l.text).toBe("3-week streak ends Sunday. 2 days next week starts a new one.");
});
