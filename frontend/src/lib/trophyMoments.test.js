import { firstTime, markSeen } from "./trophyMoments";

test("a trophy celebrates once, then never again", () => {
  localStorage.clear();
  expect(firstTime("gloves:Golden Gloves S1")).toBe(true);
  markSeen("gloves:Golden Gloves S1");
  expect(firstTime("gloves:Golden Gloves S1")).toBe(false);
  expect(firstTime("gloves:Golden Gloves S2")).toBe(true);
  expect(firstTime("")).toBe(false);
});
