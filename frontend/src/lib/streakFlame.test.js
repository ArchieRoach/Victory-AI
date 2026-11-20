import { inRun, markIgnited, shouldIgnite, trainedToday, weekDays } from "./streakFlame";

// Wednesday 2026-11-18, trained Mon, Tue and today.
const week = [
  { date: "2026-11-12", active: false }, { date: "2026-11-13", active: true }, { date: "2026-11-14", active: false },
  { date: "2026-11-15", active: false }, { date: "2026-11-16", active: true }, { date: "2026-11-17", active: true },
  { date: "2026-11-18", active: true },
];

test("the row is this week, Monday to Sunday, with real training days ticked", () => {
  const days = weekDays(week);
  expect(days.map((d) => d.date)).toEqual(["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"]);
  expect(days.map((d) => d.active)).toEqual([true, true, true, false, false, false, false]);
  expect(days[2].isToday).toBe(true);
  expect(days.filter((d) => d.future).map((d) => d.day)).toEqual([19, 20, 21, 22]);
});

test("a Sunday still shows the whole week it ends", () => {
  const sunday = [...week.slice(1), { date: "2026-11-22", active: false }].map((d, i, a) => ({ ...d, date: d.date }));
  const days = weekDays(sunday);
  expect(days[0].date).toBe("2026-11-16");
  expect(days[6].isToday).toBe(true);
});

test("trained days next to each other are joined into one chain", () => {
  const days = weekDays(week);
  expect(inRun(days, 0)).toEqual({ left: false, right: true });
  expect(inRun(days, 2)).toEqual({ left: true, right: false });
  expect(inRun(days, 4)).toEqual({ left: false, right: false });
});

test("the flame only bursts after a real session today, and only once", () => {
  localStorage.clear();
  expect(trainedToday(week)).toBe(true);
  expect(shouldIgnite(week, 3)).toBe(true);
  markIgnited(week);
  expect(shouldIgnite(week, 3)).toBe(false);
  const notToday = [...week.slice(0, 6), { date: "2026-11-18", active: false }];
  expect(shouldIgnite(notToday, 2)).toBe(false);
});
