import { isUnlocked, nextUnlockLine, ALL_OPEN } from "./unlocks";

test("nothing gated shows while loading, everything shows if the list fails", () => {
  expect(isUnlocked(null, "boss")).toBe(false);
  expect(isUnlocked(ALL_OPEN, "boss")).toBe(true);
  expect(isUnlocked({ unlocked: ["week_plan"] }, "week_plan")).toBe(true);
  expect(isUnlocked({ unlocked: ["week_plan"] }, "boss")).toBe(false);
});

test("the next unlock reads simply", () => {
  expect(nextUnlockLine({ name: "Pick your week", sessions_to_go: 1 })).toBe("Train once more to unlock Pick your week.");
  expect(nextUnlockLine({ name: "Boss Round", sessions_to_go: 3 })).toBe("Train 3 more times to unlock Boss Round.");
  expect(nextUnlockLine(null)).toBeNull();
});
