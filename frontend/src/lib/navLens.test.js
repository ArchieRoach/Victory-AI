import { lensScale, previousTab, rememberTab, SWELL, travel } from "./navLens";

test("the lens is tab-sized at rest and biggest a full tab away", () => {
  expect(lensScale(100, 100, 70)).toBe(1);
  expect(lensScale(30, 100, 70)).toBeCloseTo(1 + SWELL);
  expect(lensScale(-300, 100, 70)).toBeCloseTo(1 + SWELL);
  expect(travel(65, 100, 70)).toBeCloseTo(0.5);
  expect(SWELL).toBeLessThanOrEqual(0.2);
});

test("the last tab is remembered so the next page's bar starts from it", () => {
  rememberTab(3);
  expect(previousTab()).toBe(3);
  rememberTab(null);
  expect(previousTab()).toBeNull();
});
