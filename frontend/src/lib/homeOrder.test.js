import { orderCards, addTap, recordTap, readTaps, resetTaps, DRIVE_CARDS } from "./homeOrder";

const memory = () => { const m = {}; return { getItem: (k) => m[k] ?? null, setItem: (k, v) => { m[k] = v; }, removeItem: (k) => { delete m[k]; } }; };

test("default order until someone taps", () => {
  expect(orderCards({})).toEqual(DRIVE_CARDS);
});

test("what you tap moves up, and recent taps beat old ones", () => {
  let t = {};
  for (let i = 0; i < 3; i++) t = addTap(t, "explore");
  expect(orderCards(t)[0]).toBe("explore");
  for (let i = 0; i < 8; i++) t = addTap(t, "crew");
  expect(orderCards(t)[0]).toBe("crew");
});

test("taps persist and reset puts the default back", () => {
  const s = memory();
  recordTap("crew", s);
  expect(orderCards(readTaps(s))[0]).toBe("crew");
  resetTaps(s);
  expect(orderCards(readTaps(s))).toEqual(DRIVE_CARDS);
  expect(readTaps({ getItem: () => "{bad json" })).toEqual({});
});
