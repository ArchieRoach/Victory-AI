import { founderTerms, money } from "./billing";

test("monthly founder terms show the real yearly difference", () => {
  const t = founderTerms({ interval: "month", currency: "gbp", founder: { lifetime: true, price: 2.39, regular_price: 3.99, saving: 1.6, percent_off: 40 } });
  expect(t).toEqual({ now: "£2.39/month", regular: "£3.99/month", extraPerYear: "£19.20", percentOff: 40 });
});

test("annual founder terms", () => {
  const t = founderTerms({ interval: "year", currency: "gbp", founder: { lifetime: true, price: 14.99, regular_price: 24.99, saving: 10 } });
  expect(t.now).toBe("£14.99/year");
  expect(t.extraPerYear).toBe("£10");
});

test("no lifetime claim for a time-limited discount or no discount", () => {
  expect(founderTerms({ interval: "month", founder: { lifetime: false, price: 3, regular_price: 5, saving: 2 } })).toBeNull();
  expect(founderTerms({ interval: "month", founder: null })).toBeNull();
  expect(founderTerms(undefined)).toBeNull();
});

test("money is GBP by default and keeps pence only when needed", () => {
  expect(money(2.5)).toBe("£2.50");
  expect(money(5)).toBe("£5");
  expect(money(0.48, "gbp", true)).toBe("£0.48");
  expect(money(5, "usd")).toBe("US$5");
});
