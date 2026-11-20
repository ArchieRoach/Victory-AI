import { COMBO, KEYFRAMES, SPOTS } from "./mascotMotion";

test("every move ends where it started, so he never gets stuck mid-punch", () => {
  for (const name of ["dropIn", "jabLeft", "jabRight", "titleSlam"]) {
    const last = KEYFRAMES[name][KEYFRAMES[name].length - 1].transform;
    expect(last).not.toMatch(/translate\(-?[1-9]|scale\((?!1\b|1,)/);
  }
});

test("a tap throws a one-two: left jab first, then the right", () => {
  expect(COMBO.map((s) => s.glove)).toEqual(["leftGlove", "rightGlove"]);
  expect(COMBO[1].at).toBeGreaterThan(COMBO[0].at);
  COMBO.forEach((s) => expect(KEYFRAMES[s.move]).toBeDefined());
});

test("the effects sit on the picture", () => {
  const { belt, leftGlove, rightGlove } = SPOTS;
  for (const v of [leftGlove.x, leftGlove.y, rightGlove.x, rightGlove.y]) expect(v).toBeGreaterThan(0), expect(v).toBeLessThan(1);
  expect(belt.left + belt.width).toBeLessThanOrEqual(1);
  expect(belt.top + belt.height).toBeLessThanOrEqual(1);
});
