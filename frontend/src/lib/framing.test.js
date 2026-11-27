import { framingFrom } from "./framing";

const pose = (points) => {
  const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.9 }));
  Object.entries(points).forEach(([i, p]) => { lm[i] = { visibility: 0.9, ...p }; });
  return lm;
};

test("shoulders and hands in the picture means in frame", () => {
  expect(framingFrom(pose({ 11: { x: 0.62, y: 0.3 }, 12: { x: 0.38, y: 0.3 }, 15: { x: 0.55, y: 0.25 }, 16: { x: 0.45, y: 0.25 } }))).toBe("ok");
});

test("a hand off the edge means step back, a tiny body means step closer", () => {
  expect(framingFrom(pose({ 11: { x: 0.7, y: 0.3 }, 12: { x: 0.3, y: 0.3 }, 15: { x: 0.99, y: 0.25 }, 16: { x: 0.45, y: 0.25 } }))).toBe("back");
  expect(framingFrom(pose({ 11: { x: 0.53, y: 0.4 }, 12: { x: 0.47, y: 0.4 }, 15: { x: 0.52, y: 0.38 }, 16: { x: 0.48, y: 0.38 } }))).toBe("closer");
});

test("nobody seen yet means still looking", () => {
  expect(framingFrom(null)).toBe("searching");
  expect(framingFrom(pose({ 11: { x: 0.6, y: 0.3, visibility: 0.1 } }))).toBe("searching");
});
