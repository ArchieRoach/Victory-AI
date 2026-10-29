import { createComboCaller, nextLevel, CALL_LEVELS, landWindowMs, punchCount } from "./comboCaller";

test("level moves only on a full window, up over 80% and down under 60%", () => {
  expect(nextLevel(1, [true, true, true, true])).toBe(1);
  expect(nextLevel(1, [true, true, true, true, true])).toBe(2);
  expect(nextLevel(1, [true, true, true, true, false])).toBe(1);
  expect(nextLevel(1, [true, true, false, false, false])).toBe(0);
  expect(nextLevel(0, [false, false, false, false, false])).toBe(0);
  expect(nextLevel(CALL_LEVELS.length - 1, Array(5).fill(true))).toBe(CALL_LEVELS.length - 1);
});

function play(caller, { landEvery, rounds = 12, adaptive = true }) {
  let t = 0;
  for (let i = 0; i < rounds; i++) {
    let call = null;
    while (!call) { t += 250; call = caller.tick(t, { adaptive }); }
    if (landEvery(i)) for (let p = 0; p < call.combo.split("-").length; p++) caller.punch(t + 100 * p);
    t += landWindowMs(5) + 10;
    caller.tick(t, { adaptive });
  }
}

test("a fighter landing everything climbs, one landing nothing drops", () => {
  const strong = createComboCaller({ level: 1, pick: () => 0 });
  play(strong, { landEvery: () => true });
  expect(strong.level()).toBeGreaterThanOrEqual(3);
  expect(strong.summary().rate).toBe(100);
  const tired = createComboCaller({ level: 3, pick: () => 0 });
  play(tired, { landEvery: () => false });
  expect(tired.level()).toBeLessThanOrEqual(1);
});

test("without the camera nothing is judged, so the level holds", () => {
  const c = createComboCaller({ level: 2, pick: () => 0 });
  play(c, { landEvery: () => false, adaptive: false });
  expect(c.level()).toBe(2);
  expect(c.summary()).toMatchObject({ checked: 0, rate: null });
  expect(c.summary().calls).toBeGreaterThan(5);
});

test("never calls the same combo twice in a row and punches after the window don't count", () => {
  const c = createComboCaller({ level: 0, pick: () => 0 });
  const a = (() => { let t = 0, x = null; while (!x) { t += 250; x = c.tick(t); } return { x, t }; })();
  c.punch(a.t + landWindowMs(4) + 1);
  let t = a.t, b = null;
  while (!b) { t += 250; b = c.tick(t, { adaptive: true }); }
  expect(b.combo).not.toBe(a.x.combo);
  expect(c.summary().landed).toBe(0);
});

test("the weekly combo is called every third time and only punches are counted", () => {
  const c = createComboCaller({ level: 0, pick: () => 0, weekly: "1-2-slip-3" });
  const calls = [];
  let t = 0;
  while (calls.length < 6) { t += 250; const x = c.tick(t); if (x) { calls.push(x); t += landWindowMs(5); c.tick(t); } }
  expect(calls[2].combo).toBe("1-2-slip-3");
  expect(calls[2].levelName).toBe("Your weekly combo");
  expect(calls[5].combo).toBe("1-2-slip-3");
  expect(calls[0].combo).not.toBe("1-2-slip-3");
  expect(punchCount("1-2-slip-3")).toBe(3);
  expect(punchCount("slip-roll")).toBe(1);
});

test("calls start at your experience level and an advanced fighter never drops to single jabs", () => {
  const { startingLevel, levelRange } = require("./comboCaller");
  expect(levelRange("3_plus_years")).toEqual({ start: 4, floor: 3 });
  expect(levelRange("Professional boxer").floor).toBe(3);
  expect(levelRange("complete_beginner")).toEqual({ start: 0, floor: 0 });
  expect(levelRange("6–18 months").start).toBe(2);
  expect(startingLevel("3_plus_years", null)).toBe(4);
  expect(startingLevel("3_plus_years", 0)).toBe(3);
  expect(startingLevel("complete_beginner", 2)).toBe(2);

  const caller = createComboCaller({ level: 4, floor: 3, pick: () => 0 });
  let t = 0;
  for (let i = 0; i < 30; i++) {
    let call = null;
    while (!call) { t += 250; call = caller.tick(t, { adaptive: true }); }
    expect(call.combo.split("-").length).toBeGreaterThanOrEqual(3);
    t += landWindowMs(6) + 10;
    caller.tick(t, { adaptive: true });
  }
  expect(caller.level()).toBe(3);
  expect(CALL_LEVELS[CALL_LEVELS.length - 1].combos.every((c) => c.split("-").length >= 5)).toBe(true);
});

describe("calls in words", () => {
  const { comboWords, comboSpeech } = require("./comboCaller");

  test("orthodox fighters hear left and right", () => {
    expect(comboWords("1-2-3-2", "orthodox")).toEqual(["Jab", "Cross", "Left hook", "Cross"]);
    expect(comboWords("1-6-3", "orthodox")).toEqual(["Jab", "Right uppercut", "Left hook"]);
  });

  test("southpaws hear it the other way round", () => {
    expect(comboWords("1-2-3", "southpaw")).toEqual(["Jab", "Cross", "Right hook"]);
    expect(comboWords("5", "Southpaw")).toEqual(["Right uppercut"]);
  });

  test("no stance or switch says lead and rear", () => {
    expect(comboWords("1-2-5-2", "")).toEqual(["Jab", "Cross", "Lead uppercut", "Cross"]);
    expect(comboWords("3-4", "switch")).toEqual(["Lead hook", "Rear hook"]);
  });

  test("double jab and defensive moves", () => {
    expect(comboWords("1-1-2-slip-2-3", "orthodox")).toEqual(["Double jab", "Cross", "Slip", "Cross", "Left hook"]);
    expect(comboWords("1-2-roll-2", null)).toEqual(["Jab", "Cross", "Roll", "Cross"]);
  });

  test("numbers only when the fighter asks for them", () => {
    expect(comboSpeech("1-2-3", "orthodox", false)).toBe("Jab, Cross, Left hook");
    expect(comboSpeech("1-2-3", "orthodox", true)).toBe("1, 2, 3");
  });
});
