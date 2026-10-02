import { createTracker, elbowAngle, ghostCount, createCueGate } from "./liveCoach";

// A fighter facing the camera: shoulders level at y=0.4, hands at chin height.
const pose = ({ leftArm = "guard", rightArm = "guard", noseX = 0.5, handsY = 0.38 } = {}) => {
  const image = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 }));
  image[0] = { x: noseX, y: 0.3, visibility: 1 };
  image[11] = { x: 0.6, y: 0.4, visibility: 1 };
  image[12] = { x: 0.4, y: 0.4, visibility: 1 };
  image[13] = { x: 0.62, y: 0.5, visibility: 1 };
  image[14] = { x: 0.38, y: 0.5, visibility: 1 };
  image[15] = { x: 0.58, y: handsY, visibility: 1 };
  image[16] = { x: 0.42, y: handsY, visibility: 1 };
  const world = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0 }));
  const arm = (s, e, w, side, state) => {
    world[s] = { x: side * 0.2, y: -0.5, z: 0 };
    world[e] = { x: side * 0.25, y: -0.3, z: -0.1 };
    world[w] = state === "punch" ? { x: side * 0.3, y: -0.1, z: -0.2 } : { x: side * 0.22, y: -0.5, z: -0.15 };
  };
  arm(11, 13, 15, 1, leftArm);
  arm(12, 14, 16, -1, rightArm);
  return { image, world };
};

test("elbow angle is straight for an extended arm, bent in guard", () => {
  const p = pose({ leftArm: "punch" });
  expect(elbowAngle(p.world[11], p.world[13], p.world[15])).toBeGreaterThan(150);
  const g = pose();
  expect(elbowAngle(g.world[12], g.world[14], g.world[16])).toBeLessThan(115);
});

test("counts each punch once and chains fast ones into combos", () => {
  const tr = createTracker();
  const seq = ["guard", "punch", "punch", "guard", "punch", "guard", "punch", "guard", "punch", "guard"];
  const events = [];
  seq.forEach((arm, i) => {
    const p = pose({ leftArm: arm });
    events.push(...tr.update(p.image, p.world, i * 150));
  });
  const s = tr.snapshot();
  expect(s.punches).toBe(4);
  expect(s.left).toBe(4);
  expect(s.bestCombo).toBe(4);
  expect(events).toContain("combo");
  expect(s.timeline).toEqual([0.2, 0.6, 0.9, 1.2]);
});

test("a slow punch starts a new combo", () => {
  const tr = createTracker();
  [["punch", 0], ["guard", 100], ["punch", 2000]].forEach(([arm, t]) => {
    const p = pose({ rightArm: arm });
    tr.update(p.image, p.world, t);
  });
  expect(tr.snapshot().bestCombo).toBe(1);
});

test("guard drop counts once per drop, only after it's held down", () => {
  const tr = createTracker();
  const events = [];
  [[0, 0.38], [100, 0.6], [300, 0.6], [600, 0.6], [900, 0.6], [1000, 0.38], [1100, 0.6], [1700, 0.6]].forEach(([t, y]) => {
    const p = pose({ handsY: y });
    events.push(...tr.update(p.image, p.world, t));
  });
  expect(tr.snapshot().guardDrops).toBe(2);
  expect(events.filter((e) => e === "guard_drop")).toHaveLength(2);
});

test("head movement counts excursions off the centre line", () => {
  const tr = createTracker();
  [0.5, 0.58, 0.6, 0.5, 0.42, 0.5].forEach((x, i) => {
    const p = pose({ noseX: x });
    tr.update(p.image, p.world, i * 100);
  });
  expect(tr.snapshot().headMoves).toBe(2);
});

test("AirPods take over head counting", () => {
  const tr = createTracker();
  tr.addHeadMove();
  const p = pose({ noseX: 0.6 });
  tr.update(p.image, p.world, 0);
  expect(tr.snapshot().headMoves).toBe(1);
});

test("nothing counts when the fighter is out of frame", () => {
  const tr = createTracker();
  const p = pose({ leftArm: "punch" });
  p.image[11].visibility = 0.1;
  tr.update(p.image, p.world, 0);
  expect(tr.snapshot()).toMatchObject({ punches: 0, inFrame: false });
});

test("ghost count is punches thrown by that second of the best round", () => {
  const tl = [0.5, 1.0, 1.0, 2.4, 10];
  expect(ghostCount(tl, 0)).toBe(0);
  expect(ghostCount(tl, 1)).toBe(3);
  expect(ghostCount(tl, 60)).toBe(5);
  expect(ghostCount([], 5)).toBeNull();
});

test("cues are rate-limited per kind", () => {
  const gate = createCueGate(8000);
  expect(gate("guard", 0)).toBe(true);
  expect(gate("guard", 5000)).toBe(false);
  expect(gate("combo", 5000)).toBe(true);
  expect(gate("guard", 8000)).toBe(true);
});
