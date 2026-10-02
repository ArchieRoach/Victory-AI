import { roundPraise, ordinal } from "./identity";

test("no punches, no praise", () => {
  expect(roundPraise(null)).toBeNull();
  expect(roundPraise({ punches: 0, guardPct: 95 })).toBeNull();
});

test("beating the ghost leads, then guard, combo, head movement", () => {
  expect(roundPraise({ punches: 90, guardPct: 90 }, 80)).toMatch(/^90 punches, beating your best round \(80\)/);
  expect(roundPraise({ punches: 70, guardPct: 85, bestCombo: 6 }, 80)).toMatch(/^Guard up 85%/);
  expect(roundPraise({ punches: 70, guardPct: 60, bestCombo: 6 })).toMatch(/6-punch combination/);
  expect(roundPraise({ punches: 70, guardPct: 60, bestCombo: 2, headMoves: 20 })).toMatch(/20 head movements/);
});

test("otherwise it credits the work, not talent", () => {
  expect(roundPraise({ punches: 42, guardPct: 50, bestCombo: 2, headMoves: 3 })).toBe("42 punches thrown. That's work in the bank.");
});

test("ordinals", () => {
  expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "101st"]);
});
