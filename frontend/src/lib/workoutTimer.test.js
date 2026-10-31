import { buildTimeline, positionAt, cuesBetween, describe, clock, spokenLine, allSpokenLines, totalSeconds } from "./workoutTimer";

const bag = { name: "Bag work", type: "bag", warmup_s: 10, rounds: 3, round_s: 180, rest_s: 60,
  round_warning_s: 10, rest_warning_s: 10, inner_alert_s: 0, stations: [], station_rest_s: 0 };
const circuit = { ...bag, name: "Circuit", type: "circuit", rounds: 2, rest_s: 60, station_rest_s: 15,
  stations: [{ name: "Burpees", seconds: 40 }, { name: "Plank", seconds: 30 }] };

test("a round workout is warm-up, rounds and rests in between", () => {
  const t = buildTimeline(bag);
  expect(t.map((s) => s.kind)).toEqual(["warmup", "work", "rest", "work", "rest", "work"]);
  expect(totalSeconds(t)).toBe(10 + 3 * 180 + 2 * 60);
});

test("a circuit runs each exercise with short rests, then a set rest", () => {
  const t = buildTimeline(circuit);
  expect(t.map((s) => `${s.kind}:${s.label}`)).toEqual([
    "warmup:Warm up", "work:Burpees", "rest:Rest", "work:Plank", "rest:Set rest", "work:Burpees", "rest:Rest", "work:Plank",
  ]);
  expect(t[2].next).toBe("Plank");
});

test("position says which segment and how long is left", () => {
  const t = buildTimeline(bag);
  expect(positionAt(t, 0).seg.kind).toBe("warmup");
  const p = positionAt(t, 10 + 170);
  expect(p.seg.round).toBe(1);
  expect(p.left).toBe(10);
  expect(positionAt(t, 10000).seg).toBeNull();
});

test("bells, warnings and the finish fire at the right seconds", () => {
  const t = buildTimeline(bag);
  const types = cuesBetween(t, bag, 0, totalSeconds(t)).map((c) => `${c.type}@${c.at}`);
  expect(types).toContain("start@10");
  expect(types).toContain("warning@180");
  expect(types).toContain("end@190");
  expect(types).toContain("rest@190");
  expect(types).toContain("warning@240");
  expect(types[types.length - 1]).toBe(`done@${totalSeconds(t)}`);
});

test("interval alerts sound every N seconds of work only", () => {
  const p = { ...bag, warmup_s: 0, rounds: 1, round_s: 90, inner_alert_s: 30 };
  const inner = cuesBetween(buildTimeline(p), p, 0, 90).filter((c) => c.type === "inner").map((c) => c.at);
  expect(inner).toEqual([30, 60]);
});

test("a skipped tick still catches every cue in between", () => {
  const t = buildTimeline(bag);
  const one = cuesBetween(t, bag, 0, 200).length;
  const stepped = [0, 50, 100, 150, 200].slice(1).reduce((n, to, i, arr) => n + cuesBetween(t, bag, i === 0 ? 0 : arr[i - 1], to).length, 0);
  expect(stepped).toBe(one);
});

test("words people read and hear", () => {
  expect(describe(bag)).toBe("3 × 3:00 · 1:00 rest");
  expect(describe(circuit)).toBe("2 exercises × 2 sets · 1:00 rest");
  expect(clock(65.2)).toBe("1:06");
  const t = buildTimeline(bag);
  expect(spokenLine({ type: "start", seg: t[5] }, bag, t)).toBe("Last round. Let's go.");
  expect(spokenLine({ type: "rest", seg: buildTimeline(circuit)[2] }, circuit)).toBe("Rest. Next up, Plank.");
  expect(allSpokenLines(circuit)).toContain("Burpees. 40 seconds.");
  expect(allSpokenLines({ ...bag, round_s: 20, rest_s: 10 })).toContain("Go.");
});
