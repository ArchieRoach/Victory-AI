import { bookingChips, isQuietHour, formatBooking, sameTimeTomorrow } from "./booking";

test("chips are all in waking hours, in the future, and never say 'after school'", () => {
  const now = new Date(2026, 8, 29, 15, 0); // Tuesday
  const chips = bookingChips(now);
  expect(chips.map((c) => c.label)).toEqual(["Same time tomorrow (3pm)", "Tomorrow 7am", "Tomorrow 6pm", "In 2 days, 6pm", "Saturday 10am"]);
  chips.forEach((c) => {
    expect(isQuietHour(c.date)).toBe(false);
    expect(c.date > now).toBe(true);
    expect(c.label.toLowerCase()).not.toContain("school");
  });
  expect(chips[4].date.getDay()).toBe(6);
});

test("no separate Saturday chip when Saturday is already tomorrow or in 2 days", () => {
  expect(bookingChips(new Date(2026, 9, 2, 12)).map((c) => c.key)).not.toContain("saturday"); // Friday
  expect(bookingChips(new Date(2026, 9, 1, 12)).map((c) => c.key)).not.toContain("saturday"); // Thursday
});

test("quiet hours are 10pm–5am", () => {
  expect(isQuietHour(new Date(2026, 0, 1, 22, 0))).toBe(true);
  expect(isQuietHour(new Date(2026, 0, 1, 4, 59))).toBe(true);
  expect(isQuietHour(new Date(2026, 0, 1, 5, 0))).toBe(false);
  expect(isQuietHour(new Date(2026, 0, 1, 6, 0))).toBe(false);
});

test("booking labels are relative", () => {
  const now = new Date(2026, 8, 29, 15, 0);
  expect(formatBooking(new Date(2026, 8, 30, 7, 0).toISOString(), now)).toMatch(/^Tomorrow/);
  expect(formatBooking(new Date(2026, 8, 29, 18, 0).toISOString(), now)).toMatch(/^Today/);
});

test("the default chip is same time tomorrow, kept within 7am–9pm", () => {
  expect(sameTimeTomorrow(new Date(2026, 8, 29, 15, 40))).toEqual(new Date(2026, 8, 30, 15, 0));
  expect(sameTimeTomorrow(new Date(2026, 8, 29, 23, 10))).toEqual(new Date(2026, 8, 30, 21, 0));
  expect(sameTimeTomorrow(new Date(2026, 8, 29, 5, 30))).toEqual(new Date(2026, 8, 30, 7, 0));
  expect(bookingChips(new Date(2026, 8, 29, 15))[0].key).toBe("same-time");
});

test("no duplicate chip when same time tomorrow is already a preset", () => {
  const chips = bookingChips(new Date(2026, 8, 29, 18, 20));
  expect(chips[0].label).toBe("Same time tomorrow (6pm)");
  expect(chips.map((c) => c.key)).not.toContain("tomorrow-pm");
});
