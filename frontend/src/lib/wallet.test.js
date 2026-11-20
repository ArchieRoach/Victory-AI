import { countUp, gbp, sourceRows } from "./wallet";

test("money is shown in pounds, never below zero", () => {
  expect(gbp(2850)).toBe("£28.50");
  expect(gbp(0)).toBe("£0.00");
  expect(gbp(-5)).toBe("£0.00");
});

test("the number counts up with the card and stops at the real balance", () => {
  expect(countUp(2850, 0)).toBe(0);
  expect(countUp(2850, 0.5)).toBe(1425);
  expect(countUp(2850, 1.2)).toBe(2850);
});

test("only places that earned something are listed", () => {
  expect(sourceRows([{ key: "streams", pence: 0, paid_pence: 0 }, { key: "merch", pence: 1200, paid_pence: 0 }]).map((s) => s.key)).toEqual(["merch"]);
});
