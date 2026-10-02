import { founderTerms, money } from "./billing";

test("monthly founder terms show the real yearly difference", () => {
  const t = founderTerms({ interval: "month", currency: "usd", founder: { lifetime: true, price: 3, regular_price: 5, saving: 2, percent_off: 40 } });
  expect(t).toEqual({ now: "$3/month", regular: "$5/month", extraPerYear: "$24", percentOff: 40 });
});

test("annual founder terms", () => {
  const t = founderTerms({ interval: "year", currency: "usd", founder: { lifetime: true, price: 15, regular_price: 25, saving: 10 } });
  expect(t.now).toBe("$15/year");
  expect(t.extraPerYear).toBe("$10");
});

test("no lifetime claim for a time-limited discount or no discount", () => {
  expect(founderTerms({ interval: "month", founder: { lifetime: false, price: 3, regular_price: 5, saving: 2 } })).toBeNull();
  expect(founderTerms({ interval: "month", founder: null })).toBeNull();
  expect(founderTerms(undefined)).toBeNull();
});

test("money keeps pence only when needed", () => {
  expect(money(2.5)).toBe("$2.50");
  expect(money(5)).toBe("$5");
});
