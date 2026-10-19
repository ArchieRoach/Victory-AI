import { orderTotals, gbp } from "./proShop";

test("checkout totals match the server's Vinted-style Buyer Protection fee", () => {
  expect(orderTotals(45, 5)).toEqual({ item: 45, shipping: 5, buyerProtection: 2.95, total: 52.95 });
  expect(orderTotals(25, 4)).toEqual({ item: 25, shipping: 4, buyerProtection: 1.95, total: 30.95 });
  expect(gbp(2.5)).toBe("£2.50");
});
