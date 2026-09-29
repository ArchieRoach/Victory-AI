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
