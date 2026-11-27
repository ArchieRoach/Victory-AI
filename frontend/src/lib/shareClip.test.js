jest.mock("@/lib/comboCaller", () => ({ comboTokens: () => [] }));
const { pickWindow, callAt, punchesBy } = require("./shareClip");
const { saveRoundClip, bestRoundClip, _resetRoundClips } = require("./roundClips");

test("the highlight is the busiest 20 seconds, never past the end", () => {
  const punches = [1000, 2000, 50000, 50500, 51000, 52000, 53000, 54000];
  expect(pickWindow(punches, 180000)).toEqual({ startMs: 49000, lenMs: 20000 });
  expect(pickWindow([179000], 180000).startMs).toBe(160000);
  expect(pickWindow([], 12000)).toEqual({ startMs: 0, lenMs: 12000 });
});

test("a call shows for a moment after it's called, and punches count up", () => {
  const calls = [{ t: 1000, combo: "1-2" }, { t: 6000, combo: "1-2-3" }];
  expect(callAt(calls, 500)).toBeNull();
  expect(callAt(calls, 2000).combo).toBe("1-2");
  expect(callAt(calls, 5000)).toBeNull();
  expect(callAt(calls, 6500).combo).toBe("1-2-3");
  expect(punchesBy([100, 200, 300], 250)).toBe(2);
});

test("the round with the most punches is the one offered for sharing", () => {
  _resetRoundClips();
  saveRoundClip("s1", { round: 1, blob: new Blob(["a"]), durationMs: 180000, punches: [1, 2] });
  saveRoundClip("s1", { round: 2, blob: new Blob(["b"]), durationMs: 180000, punches: [1, 2, 3] });
  expect(bestRoundClip("s1").round).toBe(2);
  expect(bestRoundClip("other")).toBeNull();
});
