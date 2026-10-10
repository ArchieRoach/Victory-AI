import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { LevelCard } from "./LevelCard";

const p = {
  level: 3, title: null, status_points: 300, pct: 25, to_next_level: 180,
  next_milestone: { level: 4, name: "Double Jab", desc: "Two jabs to close the distance", to_go: 180 },
  boosters: [{ label: "Squad quest booster", sessions_left: 1, expires_at: "2026-10-17" }],
  unlocked: [{ name: "The 1-2" }, { name: "Slip and Counter" }],
  weekly: [{ week_id: "2026-W40", points: 120, sessions: 3 }, { week_id: "2026-W41", points: 180, sessions: 4 }],
};

test("level card shows the level, the next unlock, boosters and an accessible chart list", () => {
  const html = renderToString(createElement(LevelCard, { p })).replace(/<!-- -->/g, "");
  expect(html).toContain("Level 4 unlocks Double Jab");
  expect(html).toContain("2x status on your next session");
  expect(html).toContain("Slip and Counter");
  expect(html).toContain("W41: 180 points, 4 sessions");
});

test("level card shows a skeleton while loading", () => {
  expect(renderToString(createElement(LevelCard, { p: null }))).toContain("skeleton-shimmer");
});
