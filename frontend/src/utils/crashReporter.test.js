import { reportCrash, isBenignError } from "./crashReporter";

beforeEach(() => {
  global.fetch = jest.fn(() => Promise.resolve({}));
});

test("ResizeObserver loop warnings are not reported", () => {
  expect(isBenignError("ResizeObserver loop completed with undelivered notifications.")).toBe(true);
  expect(isBenignError("ResizeObserver loop limit exceeded")).toBe(true);
  reportCrash({ message: "ResizeObserver loop completed with undelivered notifications." });
  expect(global.fetch).not.toHaveBeenCalled();
});

test("real errors are still reported", () => {
  expect(isBenignError("TypeError: Cannot read properties of undefined")).toBe(false);
  reportCrash({ message: "TypeError: Cannot read properties of undefined", stack: "at x" });
  expect(global.fetch).toHaveBeenCalledTimes(1);
});
