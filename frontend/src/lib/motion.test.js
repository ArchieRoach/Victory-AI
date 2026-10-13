import { stepSpring, createSpring, project, rubberband, createVelocityTracker, SPRING } from "./motion";

test("a critically damped spring settles without overshooting", () => {
  let x = 0, v = 0, max = 0;
  for (let i = 0; i < 120; i++) { [x, v] = stepSpring(x, v, 100, 1 / 60, SPRING.default); max = Math.max(max, x); }
  expect(x).toBeCloseTo(100, 0);
  expect(max).toBeLessThanOrEqual(100.01);
});

test("a bouncy spring overshoots a little, then settles", () => {
  let x = 0, v = 0, max = 0;
  for (let i = 0; i < 180; i++) { [x, v] = stepSpring(x, v, 100, 1 / 60, { damping: 0.8, response: 0.3 }); max = Math.max(max, x); }
  expect(max).toBeGreaterThan(100);
  expect(max).toBeLessThan(110);
  expect(x).toBeCloseTo(100, 0);
});

test("re-targeting starts from the live value and keeps the velocity", () => {
  const frames = [];
  let t = 0;
  const updates = [];
  const s = createSpring({ from: 0, onUpdate: (x) => updates.push(x), raf: (f) => frames.push(f), caf: () => {}, now: () => t });
  s.to(100);
  for (let i = 0; i < 6; i++) { t += 16; frames.shift()(); }
  const mid = s.get(), vel = s.velocity();
  expect(mid).toBeGreaterThan(0);
  expect(vel).toBeGreaterThan(0);
  s.to(0);
  t += 16; frames.shift()();
  expect(Math.abs(s.get() - mid)).toBeLessThan(15);
});

test("set follows the finger exactly and stops motion", () => {
  const s = createSpring({ from: 0, raf: () => 1, caf: () => {}, now: () => 0 });
  s.to(100);
  s.set(42);
  expect(s.get()).toBe(42);
  expect(s.running()).toBe(false);
});

test("projection throws further the faster the flick", () => {
  expect(project(0)).toBe(0);
  expect(project(1000)).toBeCloseTo(499, 0);
  expect(project(2000)).toBeGreaterThan(project(1000));
  expect(project(-1000)).toBeLessThan(0);
});

test("rubber-banding resists more the further you pull", () => {
  expect(rubberband(0, 500)).toBe(0);
  const a = rubberband(100, 500), b = rubberband(400, 500);
  expect(a).toBeLessThan(100);
  expect(b / 400).toBeLessThan(a / 100);
  expect(rubberband(-100, 500)).toBeCloseTo(-a);
});

test("velocity comes from recent samples only", () => {
  const v = createVelocityTracker();
  v.add(0, 0);
  v.add(500, 1000);
  v.add(550, 1050);
  v.add(600, 1100);
  expect(v.velocity()).toBeCloseTo(1000, 0);
});
